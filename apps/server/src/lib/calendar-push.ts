/**
 * A person's plans in their own calendar (R96): with a connection's Plans use on, the meetings
 * and appointments their calendar in Caime holds (what `cardsAhead` gives them: asked or agreed,
 * the times of a series ahead included) are written into that Google or Outlook calendar, and
 * kept in step: written when asked (tentative) or agreed, written again when one changes, taken
 * out when it's cancelled, declined, deleted, moved or no longer theirs. Caime is the record;
 * the calendar shows it. Nobody is invited (`sendUpdates=none`, no attendees): Caime already
 * tells the people it's with.
 *
 * Put in step by reconciling, never by replaying events: `pushAccountPlans` compares what the
 * person's cards say now with what was written (`calendar_pushes`, a hash of each event) and
 * changes only the difference. A change to a card queues it for the people it's for
 * (`queueCalendarPush`, from a card sent, moved, stopped, moved to a space or removed), at the
 * end of a ten-second bucket so a burst is one run; and a sweep puts each connection in step
 * once an hour, for what changes without a card moving (a conversation left, a card deleted for
 * oneself, the window moving on). An event is written in the person's own language.
 */
import { createHash } from 'node:crypto';
import { KITS, zonedParts } from '@caime/core';
import { ACCOUNT_BUSY_DAYS, ACCOUNT_SYNC_MINUTES } from '@caime/core/accounts';
import { tr } from '@caime/core/i18n';
import { joinPath, meetingVenue } from '@caime/core/meetings';
import type { AppContext } from '../context';
import { eachLimit } from './batch';
import { minutesOf } from './calendar';
import { accessFor, accountsChanged, markAccount } from './connected-accounts';
import { asReader } from './i18n';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { meetingUid } from './meeting-series';
import { cardsAhead } from './upcoming';

type Account = Parameters<typeof accessFor>[1];

const PROVIDER_MS = 10_000;
/** A burst of changes to someone's cards is put in step once, at the end of its bucket. */
const BUCKET_MS = 10_000;
/** What's put in step: from a little while ago (what's on now) to as far as busy times are read. */
const BEFORE_MS = 3 * 3_600_000;
/** The most events one run writes; the rest wait for the next. */
const WRITES_MAX = 100;
/** The cards looked at, at most. */
const CARDS_MAX = 500;
/** A connection is put in step at least this often by the sweep, this many at a time. */
const SWEEP_EVERY_MS = 3_600_000;
const SWEEP = 200;
/** How long disconnecting waits for the events ahead to be taken out. */
const WITHDRAW_MS = 8_000;

const ACCOUNT_COLUMNS = [
  'id',
  'user_id',
  'provider',
  'email',
  'uses',
  'scopes',
  'state',
  'refresh_sealed',
  'created_at',
  'synced_at',
] as const;

/** One event as Caime writes it. */
export interface PlanEvent {
  uid: string;
  summary: string;
  description: string;
  location: string | null;
  url: string;
  start: Date;
  end: Date;
  /** A card without a time: on its days, from the first to the day after the last. */
  days: { from: string; until: string } | null;
  /** Asked and not yet agreed. */
  tentative: boolean;
  /** Shows busy: a timed one. An all-day one is written free, as calendars make them. */
  holds: boolean;
}

/** YYYY-MM-DD of an instant in a time zone. */
function dayIn(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Whom each conversation is with, for this person: an organization, a person, or a title. */
async function withWhom(
  ctx: AppContext,
  userId: string,
  conversationIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) return out;
  const [rows, others] = await Promise.all([
    ctx.db
      .selectFrom('conversations as c')
      .leftJoin('business_threads as t', 't.conversation_id', 'c.id')
      .leftJoin('organizations as o', 'o.id', 't.org_id')
      .leftJoin('users as cu', 'cu.id', 't.customer_id')
      .select([
        'c.id',
        'c.kind',
        'c.title',
        't.customer_id',
        'o.name as org_name',
        'cu.display_name as customer_name',
      ])
      .where('c.id', 'in', ids)
      .execute(),
    ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.conversation_id', 'u.display_name'])
      .where('p.conversation_id', 'in', ids)
      .where('p.user_id', '<>', userId)
      .where('p.left_at', 'is', null)
      .execute(),
  ]);
  const othersOf = new Map<string, string[]>();
  for (const o of others)
    othersOf.set(o.conversation_id, [...(othersOf.get(o.conversation_id) ?? []), o.display_name]);
  for (const c of rows) {
    // A customer sees the organization, never who on its team (R15); the team sees the customer.
    if (c.customer_id)
      out.set(c.id, c.customer_id === userId ? (c.org_name ?? null) : (c.customer_name ?? null));
    else if (c.kind === 'direct') out.set(c.id, othersOf.get(c.id)?.[0] ?? null);
    else out.set(c.id, c.title ?? null);
  }
  return out;
}

/** The events this person's cards stand for now, in their language, by their calendar id. */
export async function planEvents(
  ctx: AppContext,
  userId: string,
  window: { from: Date; until: Date },
): Promise<Map<string, PlanEvent>> {
  const cards = await cardsAhead(ctx, userId, {
    ...window,
    limit: CARDS_MAX,
    agreedOnly: false,
    series: { now: ctx.now() },
  });
  const who = await withWhom(
    ctx,
    userId,
    cards.map((c) => c.conversationId),
  );
  const me = await ctx.db
    .selectFrom('users')
    .select('time_zone')
    .where('id', '=', userId)
    .executeTakeFirst();
  const zone = me?.time_zone || 'UTC';
  const base = ctx.config.PUBLIC_URL.replace(/\/+$/, '');
  return asReader(ctx, userId, async () => {
    const out = new Map<string, PlanEvent>();
    for (const card of cards) {
      const uid = meetingUid(card.messageId, card.series, card.kit);
      // A meeting held on Caime (R83) is joined from its event, as from the feed's.
      const here =
        card.kit === 'meeting' &&
        card.hasTime &&
        !card.projected &&
        meetingVenue(card.place) === 'caime';
      const url = here
        ? `${base}${joinPath(card.conversationId, card.seq, card.messageId)}`
        : `${base}/c/${card.conversationId}`;
      const end = new Date(card.at.getTime() + minutesOf(card) * 60_000);
      const from = dayIn(card.at, zone);
      const last = dayIn(end, zone);
      // A card without a title of its own is named by its kind, in the reader's words.
      const title =
        card.title === 'Meeting' || card.title === 'Appointment'
          ? tr(KITS[card.kit].name)
          : card.title;
      const other = who.get(card.conversationId);
      out.set(uid, {
        uid,
        summary: other ? `${title} · ${other}` : title,
        description: [
          card.agreed ? null : tr('Asked, not agreed yet.'),
          here ? tr('Join in Caime: {url}', { url }) : tr('Open in Caime: {url}', { url }),
          tr('Caime keeps this up to date. Change it in Caime.'),
        ]
          .filter(Boolean)
          .join('\n\n'),
        location: here ? 'Caime' : card.place,
        url,
        start: card.at,
        end,
        days: card.hasTime ? null : { from, until: last > from ? last : nextDay(from) },
        tentative: !card.agreed,
        holds: card.hasTime,
      });
    }
    return out;
  });
}

const fingerprintOf = (e: PlanEvent) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        e.summary,
        e.description,
        e.location,
        e.url,
        e.start.toISOString(),
        e.end.toISOString(),
        e.days,
        e.tentative,
        e.holds,
      ]),
    )
    .digest('hex');

/** Google takes an event's id from its writer: this one, the same for every retry. */
const googleId = (accountId: string, uid: string) =>
  createHash('sha256').update(`${accountId}:${uid}`).digest('hex');

type Answer = { status: number; body: Record<string, unknown> };

async function call(url: string, access: string, method: string, body?: unknown): Promise<Answer> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${access}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(PROVIDER_MS),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

const gone = (status: number) => status === 404 || status === 410;
const ok = (status: number) => status >= 200 && status < 300;

/** What a provider is asked to do with one event: written, rewritten, taken out. */
interface Writer {
  create(e: PlanEvent): Promise<{ status: number; id: string | null }>;
  update(id: string, e: PlanEvent): Promise<{ status: number; id: string | null }>;
  remove(id: string): Promise<number>;
}

function googleWriter(ctx: AppContext, account: Account, access: string): Writer {
  const events = `${ctx.config.GOOGLE_CALENDAR_API.replace(/\/+$/, '')}/calendars/primary/events`;
  const quiet = '?sendUpdates=none';
  const bodyOf = (e: PlanEvent) => ({
    summary: e.summary,
    description: e.description,
    ...(e.location ? { location: e.location } : {}),
    start: e.days ? { date: e.days.from } : { dateTime: e.start.toISOString() },
    end: e.days ? { date: e.days.until } : { dateTime: e.end.toISOString() },
    status: e.tentative ? 'tentative' : 'confirmed',
    transparency: e.holds ? 'opaque' : 'transparent',
    source: { title: 'Caime', url: e.url },
    extendedProperties: { private: { caime: e.uid } },
  });
  const put = async (id: string, e: PlanEvent) => {
    const r = await call(`${events}/${id}${quiet}`, access, 'PUT', bodyOf(e));
    return { status: r.status, id: ok(r.status) ? id : null };
  };
  return {
    async create(e) {
      const id = googleId(account.id, e.uid);
      const r = await call(`${events}${quiet}`, access, 'POST', { id, ...bodyOf(e) });
      // Its id is taken: written before (a retry), or deleted there once. It's rewritten.
      if (r.status === 409) return put(id, e);
      return { status: r.status, id: ok(r.status) ? id : null };
    },
    update: put,
    async remove(id) {
      return (await call(`${events}/${id}${quiet}`, access, 'DELETE')).status;
    },
  };
}

function microsoftWriter(ctx: AppContext, account: Account, access: string, zone: string): Writer {
  const events = `${ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '')}/v1.0/me/events`;
  const at = (d: Date) => ({ dateTime: d.toISOString().slice(0, 19), timeZone: 'UTC' });
  const bodyOf = (e: PlanEvent) => ({
    subject: e.summary,
    body: { contentType: 'text', content: e.description },
    ...(e.location ? { location: { displayName: e.location } } : {}),
    isAllDay: Boolean(e.days),
    start: e.days ? { dateTime: `${e.days.from}T00:00:00`, timeZone: zone } : at(e.start),
    end: e.days ? { dateTime: `${e.days.until}T00:00:00`, timeZone: zone } : at(e.end),
    showAs: e.tentative ? 'tentative' : e.holds ? 'busy' : 'free',
  });
  return {
    async create(e) {
      // One event for a create retried after a timeout: Microsoft keeps the first.
      const transactionId = googleId(account.id, e.uid).slice(0, 32);
      const r = await call(events, access, 'POST', { ...bodyOf(e), transactionId });
      return {
        status: r.status,
        id: ok(r.status) && typeof r.body.id === 'string' ? r.body.id : null,
      };
    },
    async update(id, e) {
      const r = await call(`${events}/${encodeURIComponent(id)}`, access, 'PATCH', bodyOf(e));
      return { status: r.status, id: ok(r.status) ? id : null };
    },
    async remove(id) {
      return (await call(`${events}/${encodeURIComponent(id)}`, access, 'DELETE')).status;
    },
  };
}

async function writerFor(ctx: AppContext, account: Account): Promise<Writer | null> {
  const access = await accessFor(ctx, account);
  if (!access) return null;
  if (account.provider === 'google') return googleWriter(ctx, account, access);
  const me = await ctx.db
    .selectFrom('users')
    .select('time_zone')
    .where('id', '=', account.user_id)
    .executeTakeFirst();
  return microsoftWriter(ctx, account, access, me?.time_zone || 'UTC');
}

/** A provider's answer that stops the run: it refused, or it isn't answering. */
const stops = (status: number) =>
  status === 401 || status === 403 || status === 429 || status >= 500;

/**
 * Puts one connection's calendar in step with the person's cards: what's new written, what
 * changed written again, what's no longer theirs taken out (an event already over is left in
 * their calendar, as what happened). A connection without Plans (turned off at the provider)
 * takes out what it had written ahead. Returns whether more is left for another run.
 */
export async function pushAccountPlans(ctx: AppContext, account: Account): Promise<boolean> {
  if (account.state === 'reconnect') return false;
  const now = ctx.now();
  const window = {
    from: new Date(now.getTime() - BEFORE_MS),
    until: new Date(now.getTime() + ACCOUNT_BUSY_DAYS * 86_400_000),
  };
  const [written, wanted] = await Promise.all([
    ctx.db
      .selectFrom('calendar_pushes')
      .select(['uid', 'event_id', 'end_at', 'fingerprint'])
      .where('account_id', '=', account.id)
      .execute(),
    account.uses.includes('plans')
      ? planEvents(ctx, account.user_id, window)
      : Promise.resolve(new Map<string, PlanEvent>()),
  ]);
  const had = new Map(written.map((w) => [w.uid, w]));
  type Op =
    | { kind: 'create'; e: PlanEvent }
    | { kind: 'update'; e: PlanEvent; id: string }
    | { kind: 'remove'; uid: string; id: string };
  const ops: Op[] = [];
  for (const e of wanted.values()) {
    const w = had.get(e.uid);
    if (!w) ops.push({ kind: 'create', e });
    else if (w.fingerprint !== fingerprintOf(e)) ops.push({ kind: 'update', e, id: w.event_id });
  }
  const over: string[] = [];
  for (const w of written) {
    if (wanted.has(w.uid)) continue;
    if (w.end_at <= window.from) over.push(w.uid);
    else ops.push({ kind: 'remove', uid: w.uid, id: w.event_id });
  }
  // What's over is let go here, and stays in their calendar as it was.
  if (over.length)
    await ctx.db
      .deleteFrom('calendar_pushes')
      .where('account_id', '=', account.id)
      .where('uid', 'in', over)
      .execute();
  if (ops.length === 0) {
    await settled(ctx, account, now, false);
    return false;
  }
  const writer = await writerFor(ctx, account);
  if (!writer) return false;
  let refused = false;
  const keep = async (e: PlanEvent, id: string) => {
    const row = {
      event_id: id,
      start_at: e.start,
      end_at: e.end,
      holds: e.holds,
      fingerprint: fingerprintOf(e),
      pushed_at: ctx.now(),
    };
    await ctx.db
      .insertInto('calendar_pushes')
      .values({ account_id: account.id, user_id: account.user_id, uid: e.uid, ...row })
      .onConflict((oc) => oc.columns(['account_id', 'uid']).doUpdateSet(row))
      .execute();
  };
  await eachLimit(ops.slice(0, WRITES_MAX), 4, async (op) => {
    if (refused) return;
    try {
      if (op.kind === 'remove') {
        const status = await writer.remove(op.id);
        if (ok(status) || gone(status))
          await ctx.db
            .deleteFrom('calendar_pushes')
            .where('account_id', '=', account.id)
            .where('uid', '=', op.uid)
            .execute();
        else if (stops(status)) refused = true;
        return;
      }
      let done =
        op.kind === 'update' ? await writer.update(op.id, op.e) : await writer.create(op.e);
      // Deleted there since it was written: the card changed, so it's written anew.
      if (op.kind === 'update' && gone(done.status)) done = await writer.create(op.e);
      if (done.id) await keep(op.e, done.id);
      else if (stops(done.status)) refused = true;
      else ctx.log.warn({ provider: account.provider, status: done.status }, 'plans: not written');
    } catch (err) {
      ctx.log.warn({ provider: account.provider, err: (err as Error).name }, 'plans: no answer');
      refused = true;
    }
  });
  await settled(ctx, account, now, refused);
  return !refused && ops.length > WRITES_MAX;
}

/** A run's end: when it was, and whether the provider answered (the account's state says so). */
async function settled(ctx: AppContext, account: Account, at: Date, refused: boolean) {
  await ctx.db
    .updateTable('connected_accounts')
    .set({ pushed_at: at })
    .where('id', '=', account.id)
    .execute();
  if (refused) await markAccount(ctx, account.id, 'failing');
  else if (account.state === 'failing') {
    await ctx.db
      .updateTable('connected_accounts')
      .set({ state: 'connected' })
      .where('id', '=', account.id)
      .execute();
    await accountsChanged(ctx, account.user_id);
  }
}

/**
 * Disconnecting (R96): the events Caime wrote that are still ahead are taken out before the
 * permission goes, so nothing it can no longer keep in step stays in the calendar. It waits
 * `WITHDRAW_MS` at most; anything not taken out by then stays.
 */
export async function withdrawPlans(ctx: AppContext, account: Account): Promise<void> {
  const ahead = await ctx.db
    .selectFrom('calendar_pushes')
    .select(['event_id'])
    .where('account_id', '=', account.id)
    .where('end_at', '>', ctx.now())
    .limit(WRITES_MAX)
    .execute();
  if (ahead.length === 0 || account.state === 'reconnect') return;
  let timer: NodeJS.Timeout | undefined;
  const work = (async () => {
    const writer = await writerFor(ctx, account);
    if (!writer) return;
    await eachLimit(ahead, 4, async (w) => {
      await writer.remove(w.event_id).catch(() => 0);
    });
  })().catch((err) =>
    ctx.log.warn({ provider: account.provider, err: (err as Error).name }, 'plans: not withdrawn'),
  );
  await Promise.race([
    work,
    new Promise((done) => {
      timer = setTimeout(done, WITHDRAW_MS);
    }),
  ]);
  clearTimeout(timer);
}

/** Puts a connection in step at the end of this bucket: a burst of changes is one run. */
async function queuePush(ctx: AppContext, accountId: string): Promise<void> {
  const bucket = Math.floor(ctx.now().getTime() / BUCKET_MS);
  await enqueue(
    ctx,
    'accounts.push',
    { accountId },
    {
      runAt: new Date((bucket + 1) * BUCKET_MS + 1_000),
      dedupeKey: `accounts.push:${accountId}:${bucket}`,
    },
  );
}

/**
 * A card of these people's changed (sent, moved, stopped, moved to a space, removed): each of
 * their connections with Plans on is put in step, in one query for the set.
 */
export async function queueCalendarPush(ctx: AppContext, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const accounts = await ctx.db
    .selectFrom('connected_accounts')
    .select('id')
    .where('user_id', 'in', [...new Set(userIds)])
    .where('state', '<>', 'reconnect')
    .where((eb) => eb(eb.val('plans'), '=', eb.fn.any('uses')))
    .execute();
  for (const a of accounts) await queuePush(ctx, a.id);
}

/** A connection made, or its uses changed: put in step now (or its events taken out). */
export async function queueAccountPush(ctx: AppContext, accountId: string): Promise<void> {
  await queuePush(ctx, accountId);
}

export function registerCalendarPush(): void {
  registerJob('accounts.push', async (ctx, payload) => {
    const account = await ctx.db
      .selectFrom('connected_accounts')
      .select(ACCOUNT_COLUMNS)
      .where('id', '=', String(payload.accountId))
      .executeTakeFirst();
    if (account && (await pushAccountPlans(ctx, account))) await queuePush(ctx, account.id);
  });
  registerPeriodic({
    name: 'accounts.plans',
    everyMs: ACCOUNT_SYNC_MINUTES * 60_000,
    background: true,
    run: async (ctx) => {
      const due = await ctx.db
        .selectFrom('connected_accounts')
        .select(ACCOUNT_COLUMNS)
        .where('state', '<>', 'reconnect')
        .where((eb) =>
          eb.or([
            eb(eb.val('plans'), '=', eb.fn.any('uses')),
            // Plans turned off with events still written: they're taken out.
            eb.exists(
              eb
                .selectFrom('calendar_pushes as cp')
                .select('cp.uid')
                .whereRef('cp.account_id', '=', 'connected_accounts.id'),
            ),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb('pushed_at', 'is', null),
            eb('pushed_at', '<', new Date(ctx.now().getTime() - SWEEP_EVERY_MS)),
          ]),
        )
        .orderBy('pushed_at', (ob) => ob.asc().nullsFirst())
        .limit(SWEEP)
        .execute();
      await eachLimit(due, 4, (a) => pushAccountPlans(ctx, a).then(() => undefined));
    },
  });
}
