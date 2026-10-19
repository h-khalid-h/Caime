/**
 * When someone is busy in their other calendar (R90): read from a connected Google or Microsoft
 * account, every calendar of their own there (R96: the main one, and each other one they own and
 * show), kept as start and end alone (never a title, an attendee or a place), and read by
 * whatever offers their time (their bookable slots, an organization's choice of who does a
 * booking). A connection's calendar is read when it's made, when they ask, every
 * `ACCOUNT_SYNC_MINUTES` after, a few at a time, and again before a slot is offered or taken
 * when the last read is older than `ACCOUNT_FRESH_SECONDS` (`freshenBusy`). What Caime wrote
 * there itself (R96, `calendar_pushes`) is left out of what's read, so its own cards don't hold
 * their time twice.
 */
import {
  ACCOUNT_BUSY_DAYS,
  ACCOUNT_FRESH_SECONDS,
  ACCOUNT_SYNC_MINUTES,
  readsEveryCalendar,
} from '@caime/core/accounts';
import type { Kysely } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { eachLimit } from './batch';
import {
  ACCOUNT_ROW,
  type AccountRow,
  accessFor,
  accountsChanged,
  askedToWait,
  countAccountHealth,
  markReconnect,
  noteUse,
  restUntilOf,
  shownChanged,
  useOutcome,
} from './connected-accounts';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { TtlCache } from './ttl-cache';

export interface BusyBlock {
  start: Date;
  end: Date;
}

const PROVIDER_MS = 10_000;
/** Pages of a Microsoft calendar read at most: 200 events a page. */
const PAGES_MAX = 20;
/** Connections read in one sweep. */
const SWEEP = 50;
/** Calendars asked about at once: Google's most in one question. */
const CALENDARS_MAX = 50;
/** How long a slot waits for a calendar read again before it's offered or taken (R96). */
const LIVE_MS = 4_000;

type Account = AccountRow;

/** What a provider answered: its status, its body, and how long it asked Caime to wait. */
interface Answer {
  ok: boolean;
  status: number;
  body: unknown;
  retryAfter: string | null;
}

async function getJson(url: string, access: string, init: RequestInit = {}): Promise<Answer> {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(PROVIDER_MS),
  });
  return {
    ok: res.ok,
    status: res.status,
    body: (await res.json().catch(() => ({}))) as unknown,
    retryAfter: res.headers.get('retry-after'),
  };
}

/** A read that didn't come back: what the provider answered, for its failure to be kept. */
const unread = (r: Pick<Answer, 'status' | 'body' | 'retryAfter'>) => ({
  status: r.status,
  body: r.body,
  retryAfter: r.retryAfter,
  busy: null,
});

/** A provider's time without a zone (Microsoft's, asked in UTC) read as UTC. */
const asUtc = (t: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);

/**
 * The person's own calendars at Google (R96): the main one, then each other one they own and
 * show. Google's list unticked (or a connection made before it was asked), the main one alone.
 */
async function googleCalendars(ctx: AppContext, access: string, scopes: string[]) {
  if (!readsEveryCalendar('google', scopes)) return ['primary'];
  const r = await getJson(
    `${ctx.config.GOOGLE_CALENDAR_API.replace(/\/+$/, '')}/users/me/calendarList?${new URLSearchParams(
      { minAccessRole: 'owner', maxResults: '250' },
    )}`,
    access,
  );
  if (!r.ok) return ['primary'];
  const items =
    (
      r.body as {
        items?: Array<{ id?: unknown; primary?: boolean; selected?: boolean; hidden?: boolean }>;
      }
    ).items ?? [];
  const own = items
    .filter((c) => typeof c.id === 'string' && !c.primary && c.selected && !c.hidden)
    .map((c) => c.id as string);
  return ['primary', ...own].slice(0, CALENDARS_MAX);
}

type FreeBusyCalendar = {
  busy?: Array<{ start: string; end: string }>;
  errors?: Array<{ reason?: string }>;
};

async function googleBusy(ctx: AppContext, account: Account, access: string, from: Date, to: Date) {
  const ids = await googleCalendars(ctx, access, account.scopes);
  const r = await getJson(
    `${ctx.config.GOOGLE_CALENDAR_API.replace(/\/+$/, '')}/freeBusy`,
    access,
    {
      method: 'POST',
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: ids.map((id) => ({ id })),
      }),
    },
  );
  if (!r.ok) return unread(r);
  const calendars = (r.body as { calendars?: Record<string, FreeBusyCalendar> }).calendars ?? {};
  // The main calendar answers, by the name it was asked by (or its address), or nothing was read:
  // a calendar Google couldn't read isn't one with nothing in it.
  const main = calendars.primary ?? (account.email ? calendars[account.email] : undefined);
  if (!main || main.errors?.length) return unread({ status: 502, body: {}, retryAfter: null });
  // Another one that couldn't be read (gone since it was listed) is left out.
  const busy = Object.values(calendars)
    .filter((c) => !c.errors?.length)
    .flatMap((c) => c.busy ?? []);
  return {
    status: r.status,
    busy: busy.map((b) => ({ start: asUtc(b.start), end: asUtc(b.end) })),
  };
}

/**
 * The person's own calendars at Microsoft (R96): the default one, and each other one they can
 * write and own (never a calendar shared with them, nor a subscription's). Unread, the default.
 */
async function microsoftCalendars(ctx: AppContext, access: string, email: string | null) {
  const r = await getJson(
    `${ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '')}/v1.0/me/calendars?${new URLSearchParams({
      $select: 'id,isDefaultCalendar,canEdit,owner',
      $top: String(CALENDARS_MAX),
    })}`,
    access,
  );
  if (!r.ok) return [];
  const value =
    (
      r.body as {
        value?: Array<{
          id?: unknown;
          isDefaultCalendar?: boolean;
          canEdit?: boolean;
          owner?: { address?: string };
        }>;
      }
    ).value ?? [];
  return value
    .filter(
      (c) =>
        typeof c.id === 'string' &&
        !c.isDefaultCalendar &&
        c.canEdit &&
        Boolean(email) &&
        c.owner?.address?.toLowerCase() === email,
    )
    .map((c) => c.id as string);
}

async function microsoftBusy(
  ctx: AppContext,
  account: Account,
  access: string,
  from: Date,
  to: Date,
) {
  const graph = ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '');
  const window = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: 'start,end,showAs,isCancelled',
    $top: '200',
  });
  // The default calendar, then each other one of their own.
  const views = [
    `${graph}/v1.0/me/calendarView?${window}`,
    ...(await microsoftCalendars(ctx, access, account.email)).map(
      (id) => `${graph}/v1.0/me/calendars/${encodeURIComponent(id)}/calendarView?${window}`,
    ),
  ];
  const busy: BusyBlock[] = [];
  for (const [i, first] of views.entries()) {
    let url: string | null = first;
    for (let page = 0; url && page < PAGES_MAX; page++) {
      const r = await getJson(url, access, { headers: { prefer: 'outlook.timezone="UTC"' } });
      // The default calendar must be read; another that can't be (gone since) is left out.
      if (!r.ok) {
        if (i === 0) return unread(r);
        break;
      }
      const body = r.body as {
        value?: Array<{
          start?: { dateTime?: string };
          end?: { dateTime?: string };
          showAs?: string;
          isCancelled?: boolean;
        }>;
        '@odata.nextLink'?: unknown;
      };
      for (const e of body.value ?? []) {
        // Free and working elsewhere don't hold time; tentative does, as busy and away do.
        if (e.isCancelled || e.showAs === 'free' || e.showAs === 'workingElsewhere') continue;
        if (e.start?.dateTime && e.end?.dateTime)
          busy.push({ start: asUtc(e.start.dateTime), end: asUtc(e.end.dateTime) });
      }
      const next = body['@odata.nextLink'];
      url = typeof next === 'string' ? next : null;
    }
  }
  return { status: 200, busy };
}

/**
 * Busy times less what Caime wrote there itself (R96): its own cards hold their time already,
 * and one booked from a catalog holds only its share of the item's places, never the whole.
 */
export function withoutOwn(blocks: BusyBlock[], own: BusyBlock[]): BusyBlock[] {
  let out = blocks;
  for (const o of own) {
    const next: BusyBlock[] = [];
    for (const b of out) {
      if (o.end <= b.start || o.start >= b.end) {
        next.push(b);
        continue;
      }
      if (b.start < o.start) next.push({ start: b.start, end: o.start });
      if (b.end > o.end) next.push({ start: o.end, end: b.end });
    }
    out = next;
  }
  return out;
}

/**
 * Reads a connection's calendar again and keeps what it says, replacing what was kept. Its own
 * health alone moves (M16 G2): read, or why not; a provider that asked Caime to wait is left
 * alone until then, and a grant that's gone asks for the connection again.
 */
export async function syncAccountCalendar(ctx: AppContext, account: Account): Promise<boolean> {
  const now = ctx.now();
  if (account.rest_until && account.rest_until > now) return false;
  const got = await accessFor(ctx, account);
  if (!('access' in got)) {
    if (got.none === 'unanswered')
      await noteUse(ctx, account, 'calendar', { failed: 'unanswered' });
    return false;
  }
  const from = new Date(now.getTime() - 86_400_000);
  const to = new Date(now.getTime() + ACCOUNT_BUSY_DAYS * 86_400_000);
  let read: Awaited<ReturnType<typeof googleBusy>>;
  try {
    read =
      account.provider === 'google'
        ? await googleBusy(ctx, account, got.access, from, to)
        : await microsoftBusy(ctx, account, got.access, from, to);
  } catch (err) {
    ctx.log.warn(
      { provider: account.provider, err: (err as Error).name },
      'accounts: calendar not read',
    );
    await noteUse(ctx, account, 'calendar', { failed: 'unanswered' });
    return false;
  }
  if (!read.busy) {
    const { status, body, retryAfter } = read as ReturnType<typeof unread>;
    if (askedToWait(status, body))
      await noteUse(ctx, account, 'calendar', {
        failed: 'limited',
        restUntil: restUntilOf(retryAfter, now),
      });
    // Not let in any more (the grant gone, or its permission taken back at the provider).
    else if (status === 401 || status === 403) await markReconnect(ctx, account.id);
    else
      await noteUse(ctx, account, 'calendar', {
        failed: status >= 500 ? 'unanswered' : 'refused',
      });
    return false;
  }
  const own = await ctx.db
    .selectFrom('calendar_pushes')
    .select(['start_at as start', 'end_at as end'])
    .where('user_id', '=', account.user_id)
    .where('holds', '=', true)
    .where('end_at', '>', from)
    .where('start_at', '<', to)
    .execute();
  const blocks = withoutOwn(
    read.busy.filter((b) => b.end > b.start),
    own,
  );
  await ctx.db.transaction().execute(async (trx) => {
    await trx.deleteFrom('external_busy').where('account_id', '=', account.id).execute();
    for (let i = 0; i < blocks.length; i += 500)
      await trx
        .insertInto('external_busy')
        .values(
          blocks.slice(i, i + 500).map((b) => ({
            account_id: account.id,
            user_id: account.user_id,
            start_at: b.start,
            end_at: b.end,
          })),
        )
        .execute();
    await trx
      .updateTable('connected_accounts')
      .set({
        ...useOutcome('calendar', { worked: now }),
        ...(account.state === 'failing' ? { state: 'connected' as const } : {}),
      })
      .where('id', '=', account.id)
      .where('state', '<>', 'reconnect')
      .execute();
  });
  // Read for the first time, or working again: the list says so. A routine read says nothing.
  if (shownChanged(account, 'calendar', null)) await accountsChanged(ctx, account.user_id);
  return true;
}

/** When each of these people is busy elsewhere in the window, in one query. */
export async function busyElsewhere(
  db: Kysely<Database>,
  userIds: string[],
  window: { from: Date; to: Date },
): Promise<Map<string, BusyBlock[]>> {
  const out = new Map<string, BusyBlock[]>();
  if (userIds.length === 0) return out;
  const rows = await db
    .selectFrom('external_busy')
    .select(['user_id', 'start_at', 'end_at'])
    .where('user_id', 'in', userIds)
    .where('start_at', '<', window.to)
    .where('end_at', '>', window.from)
    .orderBy('start_at')
    .execute();
  for (const r of rows) {
    const list = out.get(r.user_id) ?? [];
    list.push({ start: r.start_at, end: r.end_at });
    out.set(r.user_id, list);
  }
  return out;
}

/** A read already on its way, which a second asker waits for rather than asking again. */
const reading = new TtlCache<string, Promise<boolean>>(10_000, 30_000);

/**
 * Reads again, before a slot is offered or taken (R96), the calendars of these people last read
 * longer ago than `ACCOUNT_FRESH_SECONDS`: a meeting put there a minute ago holds its time. It
 * waits `LIVE_MS` at most; a slower provider's answer lands for the next asker, and what was
 * read before stands meanwhile.
 */
export async function freshenBusy(ctx: AppContext, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const now = ctx.now();
  const due = await ctx.db
    .selectFrom('connected_accounts')
    .select(ACCOUNT_ROW)
    .where('user_id', 'in', [...new Set(userIds)])
    .where('state', '<>', 'reconnect')
    // One the provider asked to wait is left alone until then, and one whose read failed a
    // moment ago isn't asked again for every slot (M16 G2): the sweep tries it again.
    .where((eb) => eb.or([eb('rest_until', 'is', null), eb('rest_until', '<=', now)]))
    .where((eb) =>
      eb.or([
        eb('read_failed_at', 'is', null),
        eb('read_failed_at', '<', new Date(now.getTime() - ACCOUNT_FRESH_SECONDS * 1000)),
      ]),
    )
    .where((eb) => eb(eb.val('calendar'), '=', eb.fn.any('uses')))
    .where((eb) =>
      eb.or([
        eb('synced_at', 'is', null),
        eb('synced_at', '<', new Date(now.getTime() - ACCOUNT_FRESH_SECONDS * 1000)),
      ]),
    )
    .limit(CALENDARS_MAX)
    .execute();
  if (due.length === 0) return;
  const reads = due.map((a) => {
    const on = reading.get(a.id, now.getTime());
    if (on) return on;
    const read = syncAccountCalendar(ctx, a)
      .catch((err) => {
        ctx.log.warn({ err: (err as Error).name }, 'accounts: calendar not read again');
        return false;
      })
      .finally(() => reading.delete(a.id));
    reading.set(a.id, read, now.getTime());
    return read;
  });
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled(reads),
    new Promise((done) => {
      timer = setTimeout(done, LIVE_MS);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * Reads one connection's calendar now (made, or asked for again): once a minute at most, since
 * a job's key is kept for good.
 */
export async function queueAccountSync(ctx: AppContext, accountId: string): Promise<void> {
  const minute = Math.floor(ctx.now().getTime() / 60_000);
  await enqueue(
    ctx,
    'accounts.sync',
    { accountId },
    { dedupeKey: `accounts.sync:${accountId}:${minute}` },
  );
}

export function registerAccountSync(): void {
  registerJob('accounts.sync', async (ctx, payload) => {
    const account = await ctx.db
      .selectFrom('connected_accounts')
      .select(ACCOUNT_ROW)
      .where('id', '=', String(payload.accountId))
      .executeTakeFirst();
    if (account?.uses.includes('calendar') && account.state !== 'reconnect')
      await syncAccountCalendar(ctx, account);
  });
  registerPeriodic({
    name: 'accounts.calendar',
    everyMs: ACCOUNT_SYNC_MINUTES * 60_000,
    background: true,
    run: async (ctx) => {
      const due = await ctx.db
        .selectFrom('connected_accounts')
        .select(ACCOUNT_ROW)
        .where('state', '<>', 'reconnect')
        .where((eb) => eb.or([eb('rest_until', 'is', null), eb('rest_until', '<=', ctx.now())]))
        .where((eb) => eb(eb.val('calendar'), '=', eb.fn.any('uses')))
        .where((eb) =>
          eb.or([
            eb('synced_at', 'is', null),
            eb('synced_at', '<', new Date(ctx.now().getTime() - ACCOUNT_SYNC_MINUTES * 60_000)),
          ]),
        )
        .orderBy('synced_at', (ob) => ob.asc().nullsFirst())
        .limit(SWEEP)
        .execute();
      await eachLimit(due, 4, (a) => syncAccountCalendar(ctx, a).then(() => undefined));
      await countAccountHealth(ctx);
    },
  });
}
