/**
 * When someone is busy in their other calendar (R90): read from a connected Google or Microsoft
 * account, kept as start and end alone (never a title, an attendee or a place), and read by
 * whatever offers their time (their bookable slots, an organization's choice of who does a
 * booking). A connection's calendar is read when it's made, when they ask, and every
 * `ACCOUNT_SYNC_MINUTES` after, a few at a time; nothing else asks the provider.
 */
import { ACCOUNT_BUSY_DAYS, ACCOUNT_SYNC_MINUTES } from '@caime/core/accounts';
import type { Kysely } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { eachLimit } from './batch';
import { accessFor, accountsChanged, markAccount } from './connected-accounts';
import { enqueue, registerJob, registerPeriodic } from './jobs';

export interface BusyBlock {
  start: Date;
  end: Date;
}

const PROVIDER_MS = 10_000;
/** Pages of a Microsoft calendar read at most: 200 events a page. */
const PAGES_MAX = 20;
/** Connections read in one sweep. */
const SWEEP = 50;

type Account = Parameters<typeof accessFor>[1];

async function getJson(url: string, access: string, init: RequestInit = {}) {
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
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as unknown };
}

/** A provider's time without a zone (Microsoft's, asked in UTC) read as UTC. */
const asUtc = (t: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);

async function googleBusy(ctx: AppContext, access: string, from: Date, to: Date) {
  const r = await getJson(
    `${ctx.config.GOOGLE_CALENDAR_API.replace(/\/+$/, '')}/freeBusy`,
    access,
    {
      method: 'POST',
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: 'primary' }],
      }),
    },
  );
  if (!r.ok) return { status: r.status, busy: null };
  const body = r.body as {
    calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
  };
  const busy = body.calendars?.primary?.busy ?? [];
  return {
    status: r.status,
    busy: busy.map((b) => ({ start: asUtc(b.start), end: asUtc(b.end) })),
  };
}

async function microsoftBusy(ctx: AppContext, access: string, from: Date, to: Date) {
  let url: string | null =
    `${ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '')}/v1.0/me/calendarView?` +
    new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $select: 'start,end,showAs,isCancelled',
      $top: '200',
    });
  const busy: BusyBlock[] = [];
  for (let page = 0; url && page < PAGES_MAX; page++) {
    const r = await getJson(url, access, { headers: { prefer: 'outlook.timezone="UTC"' } });
    if (!r.ok) return { status: r.status, busy: null };
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
  return { status: 200, busy };
}

/** Reads a connection's calendar again and keeps what it says, replacing what was kept. */
export async function syncAccountCalendar(ctx: AppContext, account: Account): Promise<boolean> {
  const access = await accessFor(ctx, account);
  if (!access) return false;
  const now = ctx.now();
  const from = new Date(now.getTime() - 86_400_000);
  const to = new Date(now.getTime() + ACCOUNT_BUSY_DAYS * 86_400_000);
  let read: { status: number; busy: BusyBlock[] | null };
  try {
    read =
      account.provider === 'google'
        ? await googleBusy(ctx, access, from, to)
        : await microsoftBusy(ctx, access, from, to);
  } catch (err) {
    ctx.log.warn(
      { provider: account.provider, err: (err as Error).name },
      'accounts: calendar not read',
    );
    await markAccount(ctx, account.id, 'failing');
    return false;
  }
  if (!read.busy) {
    await markAccount(
      ctx,
      account.id,
      read.status === 401 || read.status === 403 ? 'reconnect' : 'failing',
    );
    return false;
  }
  const blocks = read.busy.filter((b) => b.end > b.start);
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
      .set({ synced_at: now, state: 'connected' })
      .where('id', '=', account.id)
      .execute();
  });
  // Read for the first time, or working again: the list says so. A routine read says nothing.
  if (!account.synced_at || account.state !== 'connected')
    await accountsChanged(ctx, account.user_id);
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

const ACCOUNT_COLUMNS = [
  'id',
  'user_id',
  'provider',
  'email',
  'uses',
  'state',
  'refresh_sealed',
  'created_at',
  'synced_at',
] as const;

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
      .select(ACCOUNT_COLUMNS)
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
        .select(ACCOUNT_COLUMNS)
        .where('state', '<>', 'reconnect')
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
    },
  });
}
