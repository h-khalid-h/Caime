/**
 * A person's plans in their own calendar (R96): with a connection's Plans use on, the meetings
 * and appointments their calendar in Caime holds (what `cardsAhead` gives them: asked or agreed,
 * the times of a series ahead included) are written into that Google or Outlook calendar, and
 * kept in step: written when asked (tentative) or agreed, written again when one changes, taken
 * out when it's cancelled, declined, deleted, moved or no longer theirs. Caime is the record;
 * the calendar shows it. Nobody is invited (`sendUpdates=none`, no attendees): Caime already
 * tells the people it's with, by its own invitations, and each of them on Caime has their own
 * calendar written; attendees here would send them a second invitation and put a second copy in
 * their calendars. The event names them instead, and one held on Caime has its join address for
 * its place (`card-events.ts`, the feed's wording too).
 *
 * Put in step by reconciling, never by replaying events: `pushAccountPlans` compares what the
 * person's cards say now with what was written (`calendar_pushes`, a hash of each event) and
 * changes only the difference. A change to a card queues it for the people it's for
 * (`queueCalendarPush`, from a card sent, moved, stopped, moved to a space or removed), at the
 * end of a ten-second bucket so a burst is one run; and a sweep puts each connection in step
 * once an hour, for what changes without a card moving (a conversation left, a card deleted for
 * oneself, the window moving on). An event is written in the person's own language. One the
 * provider refuses on its own (a 400, say) never holds up the rest (M16 G4): it's kept in
 * `calendar_push_failures`, sent as it is `PUSH_TRIES` times at most, then waits for its card to
 * change, and the person and the operator are told how many wait.
 */
import { createHash } from 'node:crypto';
import { zonedParts } from '@caime/core';
import {
  ACCOUNT_BUSY_DAYS,
  ACCOUNT_SYNC_MINUTES,
  type AccountFailure,
  PUSH_TRIES,
} from '@caime/core/accounts';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { eachLimit } from './batch';
import { conversationsFor, minutesOf } from './calendar';
import { notesOfCards } from './call-cards';
import { cardEventText, joinedHere } from './card-events';
import {
  ACCOUNT_ROW,
  type AccountRow,
  accessFor,
  askedToWait,
  markReconnect,
  noteUse,
  restUntilOf,
} from './connected-accounts';
import { asReader } from './i18n';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { meetingCodesFor } from './meeting-codes';
import { meetingUid } from './meeting-series';
import { keptFromApps } from './member-apps';
import { cardsAhead } from './upcoming';

type Account = AccountRow;

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
  const ids = cards.map((c) => c.conversationId);
  // An organization that keeps its conversations from its team's own apps: its name and the time
  // alone, never the customer's name, the card's own words or its place (M16 G3b).
  const [about, kept, codes, notes] = await Promise.all([
    conversationsFor(ctx, userId, ids),
    keptFromApps(ctx, userId, ids),
    // A short address for each joined here (M16 F6d), made the first time it's written.
    meetingCodesFor(
      ctx,
      cards.filter(joinedHere).map((c) => c.messageId),
    ),
    // And, once its call is over, Cai's notes of it, which that address then opens (M16 F6e).
    notesOfCards(ctx, userId, cards),
  ]);
  const me = await ctx.db
    .selectFrom('users')
    .select('time_zone')
    .where('id', '=', userId)
    .executeTakeFirst();
  const zone = me?.time_zone || 'UTC';
  const base = ctx.config.PUBLIC_URL;
  return asReader(ctx, userId, async () => {
    const out = new Map<string, PlanEvent>();
    for (const card of cards) {
      const uid = meetingUid(card.messageId, card.series, card.kit);
      const end = new Date(card.at.getTime() + minutesOf(card) * 60_000);
      const from = dayIn(card.at, zone);
      const last = dayIn(end, zone);
      // One wording with the feed's (M16 F6): whom it's with by name, its join address where it's
      // held here, which the calendar opens.
      const text = cardEventText(
        card,
        about.get(card.conversationId),
        userId,
        base,
        kept.get(card.conversationId),
        codes.get(card.messageId),
        notes.has(card.messageId),
      );
      out.set(uid, {
        uid,
        summary: text.summary,
        description: text.description,
        location: text.location,
        url: text.url,
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

/** What a refusal to take an event out is kept as, in place of a plan's fingerprint. */
const REMOVE = 'remove';

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

/** What a provider answered: its status, its body, and how long it asked Caime to wait. */
type Answer = { status: number; body: Record<string, unknown>; retryAfter: string | null };

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
    retryAfter: res.headers.get('retry-after'),
  };
}

const gone = (status: number) => status === 404 || status === 410;
const ok = (status: number) => status >= 200 && status < 300;

/** What a provider is asked to do with one event: written, rewritten, taken out. */
interface Writer {
  create(e: PlanEvent): Promise<Answer & { id: string | null }>;
  update(id: string, e: PlanEvent): Promise<Answer & { id: string | null }>;
  remove(id: string): Promise<Answer>;
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
    return { ...r, id: ok(r.status) ? id : null };
  };
  return {
    async create(e) {
      const id = googleId(account.id, e.uid);
      const r = await call(`${events}${quiet}`, access, 'POST', { id, ...bodyOf(e) });
      // Its id is taken: written before (a retry), or deleted there once. It's rewritten.
      if (r.status === 409) return put(id, e);
      return { ...r, id: ok(r.status) ? id : null };
    },
    update: put,
    remove: (id) => call(`${events}/${id}${quiet}`, access, 'DELETE'),
  };
}

function microsoftWriter(ctx: AppContext, account: Account, access: string, zone: string): Writer {
  const events = `${ctx.config.MICROSOFT_GRAPH_API.replace(/\/+$/, '')}/v1.0/me/events`;
  const at = (d: Date) => ({ dateTime: d.toISOString().slice(0, 19), timeZone: 'UTC' });
  const bodyOf = (e: PlanEvent) => ({
    subject: e.summary,
    body: { contentType: 'text', content: e.description },
    // Its join address, where it's held on Caime, is its place's address too (M16 F6).
    ...(e.location
      ? {
          location:
            e.location === e.url
              ? { displayName: e.location, locationUri: e.url }
              : { displayName: e.location },
        }
      : {}),
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
      return { ...r, id: ok(r.status) && typeof r.body.id === 'string' ? r.body.id : null };
    },
    async update(id, e) {
      const r = await call(`${events}/${encodeURIComponent(id)}`, access, 'PATCH', bodyOf(e));
      return { ...r, id: ok(r.status) ? id : null };
    },
    remove: (id) => call(`${events}/${encodeURIComponent(id)}`, access, 'DELETE'),
  };
}

async function writerFor(
  ctx: AppContext,
  account: Account,
): Promise<Writer | { none: 'reconnect' | 'unanswered' }> {
  const got = await accessFor(ctx, account);
  if (!('access' in got)) return got;
  if (account.provider === 'google') return googleWriter(ctx, account, got.access);
  const me = await ctx.db
    .selectFrom('users')
    .select('time_zone')
    .where('id', '=', account.user_id)
    .executeTakeFirst();
  return microsoftWriter(ctx, account, got.access, me?.time_zone || 'UTC');
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
  // The provider asked Caime to wait (M16 G2): the sweep puts it in step once that's over.
  if (account.rest_until && account.rest_until > now) return false;
  const window = {
    from: new Date(now.getTime() - BEFORE_MS),
    until: new Date(now.getTime() + ACCOUNT_BUSY_DAYS * 86_400_000),
  };
  const [written, wanted, refused] = await Promise.all([
    ctx.db
      .selectFrom('calendar_pushes')
      .select(['uid', 'event_id', 'end_at', 'fingerprint'])
      .where('account_id', '=', account.id)
      .execute(),
    account.uses.includes('plans')
      ? planEvents(ctx, account.user_id, window)
      : Promise.resolve(new Map<string, PlanEvent>()),
    ctx.db
      .selectFrom('calendar_push_failures')
      .select(['uid', 'fingerprint', 'attempts'])
      .where('account_id', '=', account.id)
      .execute(),
  ]);
  const had = new Map(written.map((w) => [w.uid, w]));
  // Refused on its own `PUSH_TRIES` times as it is now (M16 G4): it waits for its card to change.
  const failed = new Map(refused.map((f) => [f.uid, f]));
  const stuck = (uid: string, fingerprint: string) => {
    const f = failed.get(uid);
    return Boolean(f && f.fingerprint === fingerprint && f.attempts >= PUSH_TRIES);
  };
  type Op =
    | { kind: 'create'; e: PlanEvent }
    | { kind: 'update'; e: PlanEvent; id: string }
    | { kind: 'remove'; uid: string; id: string };
  const ops: Op[] = [];
  for (const e of wanted.values()) {
    const w = had.get(e.uid);
    const print = fingerprintOf(e);
    if (stuck(e.uid, print)) continue;
    if (!w) ops.push({ kind: 'create', e });
    else if (w.fingerprint !== print) ops.push({ kind: 'update', e, id: w.event_id });
  }
  const over: string[] = [];
  for (const w of written) {
    if (wanted.has(w.uid)) continue;
    // Over, or not taken out after its tries: let go, and left in their calendar as it was.
    if (w.end_at <= window.from || stuck(w.uid, REMOVE)) over.push(w.uid);
    else ops.push({ kind: 'remove', uid: w.uid, id: w.event_id });
  }
  // What's over is let go here, and stays in their calendar as it was; so is a refusal kept for
  // what's no longer a plan.
  const done = new Set(over);
  const forgotten = refused
    .filter((f) => done.has(f.uid) || (!wanted.has(f.uid) && !had.has(f.uid)))
    .map((f) => f.uid);
  if (over.length)
    await ctx.db
      .deleteFrom('calendar_pushes')
      .where('account_id', '=', account.id)
      .where('uid', 'in', over)
      .execute();
  if (forgotten.length)
    await ctx.db
      .deleteFrom('calendar_push_failures')
      .where('account_id', '=', account.id)
      .where('uid', 'in', forgotten)
      .execute();
  if (ops.length === 0) {
    await settled(ctx, account, now, null);
    return false;
  }
  const writer = await writerFor(ctx, account);
  if (!('remove' in writer)) {
    if (writer.none === 'unanswered') await settled(ctx, account, now, 'unanswered');
    return false;
  }
  // The first answer that stopped the run, or no answer at all.
  let stopped: Answer | 'unanswered' | null = null;
  /** One plan refused on its own: counted against its tries as it is, the rest go on. */
  const refusedOne = async (uid: string, fingerprint: string, status: number) => {
    ctx.log.warn({ provider: account.provider, status }, 'plans: one refused');
    await ctx.db
      .insertInto('calendar_push_failures')
      .values({ account_id: account.id, uid, fingerprint, status, failed_at: ctx.now() })
      .onConflict((oc) =>
        oc.columns(['account_id', 'uid']).doUpdateSet({
          fingerprint,
          status,
          failed_at: ctx.now(),
          attempts: sql<number>`case when calendar_push_failures.fingerprint = ${fingerprint}
            then calendar_push_failures.attempts + 1 else 1 end`,
        }),
      )
      .execute();
  };
  const cleared = async (uid: string) => {
    if (failed.has(uid))
      await ctx.db
        .deleteFrom('calendar_push_failures')
        .where('account_id', '=', account.id)
        .where('uid', '=', uid)
        .execute();
  };
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
    if (stopped) return;
    try {
      if (op.kind === 'remove') {
        const r = await writer.remove(op.id);
        if (ok(r.status) || gone(r.status)) {
          await ctx.db
            .deleteFrom('calendar_pushes')
            .where('account_id', '=', account.id)
            .where('uid', '=', op.uid)
            .execute();
          await cleared(op.uid);
        } else if (stops(r.status)) stopped ??= r;
        else await refusedOne(op.uid, REMOVE, r.status);
        return;
      }
      let put = op.kind === 'update' ? await writer.update(op.id, op.e) : await writer.create(op.e);
      // Deleted there since it was written: the card changed, so it's written anew.
      if (op.kind === 'update' && gone(put.status)) put = await writer.create(op.e);
      if (put.id) {
        await keep(op.e, put.id);
        await cleared(op.e.uid);
      } else if (stops(put.status)) stopped ??= put;
      else await refusedOne(op.e.uid, fingerprintOf(op.e), put.status);
    } catch (err) {
      ctx.log.warn({ provider: account.provider, err: (err as Error).name }, 'plans: no answer');
      stopped ??= 'unanswered';
    }
  });
  await settled(ctx, account, now, stopped);
  return !stopped && ops.length > WRITES_MAX;
}

/**
 * A run's end (M16 G2): put in step, or why not, kept as the plans' own health (the busy read's
 * is never touched); a grant that's gone asks for the connection again, and a provider that
 * asked Caime to wait is left alone until then.
 */
async function settled(
  ctx: AppContext,
  account: Account,
  at: Date,
  stopped: Answer | 'unanswered' | null,
) {
  if (stopped === null) return noteUse(ctx, account, 'plans', { worked: at });
  if (stopped === 'unanswered') return noteUse(ctx, account, 'plans', { failed: 'unanswered' });
  if (stopped.status === 401) return markReconnect(ctx, account.id);
  const failure: AccountFailure = askedToWait(stopped.status, stopped.body)
    ? 'limited'
    : stopped.status >= 500
      ? 'unanswered'
      : 'refused';
  return noteUse(ctx, account, 'plans', {
    failed: failure,
    restUntil: failure === 'limited' ? restUntilOf(stopped.retryAfter, ctx.now()) : null,
  });
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
    if (!('remove' in writer)) return;
    await eachLimit(ahead, 4, async (w) => {
      await writer.remove(w.event_id).catch(() => null);
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
      .select(ACCOUNT_ROW)
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
        .select(ACCOUNT_ROW)
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
        // Left alone while the provider asked Caime to wait, and a push that failed is tried
        // again an hour on, not at every look (M16 G2).
        .where((eb) => eb.or([eb('rest_until', 'is', null), eb('rest_until', '<=', ctx.now())]))
        .where((eb) =>
          eb.or([
            eb('push_failed_at', 'is', null),
            eb('push_failed_at', '<', new Date(ctx.now().getTime() - SWEEP_EVERY_MS)),
          ]),
        )
        .orderBy('pushed_at', (ob) => ob.asc().nullsFirst())
        .limit(SWEEP)
        .execute();
      await eachLimit(due, 4, (a) => pushAccountPlans(ctx, a).then(() => undefined));
    },
  });
}
