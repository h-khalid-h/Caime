import { readFileSync } from 'node:fs';
import { uuidv4, uuidv7 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { runDueJobs, runPeriodic } from '../src/lib/jobs';
import { type NotifyInput, onNotification } from '../src/lib/notify';
import { KEPT_DAYS, MEASURES } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let alex: Client;
let convo: string;
const heard: BusMessage[] = [];
/** What went to devices as a push, and as which notification. */
const pushed: Array<NotifyInput & { id: string }> = [];

/** Everything published so far has reached the bus's listener (events travel by NOTIFY). */
async function drained() {
  const mark = uuidv4();
  await t.ctx.bus.publish([mark], { type: 'me.updated', data: {} });
  for (let i = 0; i < 300 && !heard.some((m) => m.userIds.includes(mark)); i++)
    await new Promise((r) => setTimeout(r, 10));
  const at = heard.findIndex((m) => m.userIds.includes(mark));
  if (at < 0) throw new Error('the bus never delivered its marker');
  heard.splice(at, 1);
}
/** Who was told of an event of this type, about this thing. */
const told = (type: string, has: (data: any) => boolean) =>
  heard
    .filter((m) => m.event.type === type && has(m.event.data))
    .flatMap((m) => m.userIds)
    .sort();

const DAY = 86_400_000;
const ago = (days: number) => new Date(t.clock.now.getTime() - days * DAY);
const send = (c: Client, body: string) =>
  c
    .post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), kind: 'text', body })
    .then((r) => r.message);
const notesOf = (userId: string) =>
  t.ctx.db
    .selectFrom('notifications')
    .select(['id', 'title', 'body', sql<string>`data->>'messageId'`.as('messageId')])
    .where('user_id', '=', userId)
    .execute();

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  onNotification(async (_ctx, id, input) => {
    pushed.push({ ...input, id });
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  alex = await signup(t, { displayName: 'Alex Kim' });
  const r = await noor.post('/v1/connections/requests', { toUserId: alex.user.id });
  convo = (await alex.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('what Caime keeps, and for how long', () => {
  it('shows someone renamed by their new name to everyone who knows them', async () => {
    expect((await alex.get(`/v1/people/${noor.user.id}`)).person.displayName).toBe('Noor Haddad');
    await noor.patch('/v1/me', { displayName: 'Noor H.' });
    expect((await alex.get(`/v1/people/${noor.user.id}`)).person.displayName).toBe('Noor H.');
    // Their conversation is named for her as she is now, too.
    expect((await alex.get(`/v1/conversations/${convo}`)).conversation.title).toBe('Noor H.');
    // An identity given a name of its own keeps it, whatever it's called and whatever its kind.
    const other = (kind: 'personal' | 'professional', name: string) =>
      t.ctx.db
        .insertInto('identities')
        .values({ id: uuidv7(), user_id: noor.user.id, kind, display_name: name })
        .execute();
    await other('personal', 'Noor at home');
    await other('professional', 'Noor H.');
    await noor.patch('/v1/me', { displayName: 'Noor' });
    const names = await t.ctx.db
      .selectFrom('identities')
      .select(['kind', 'display_name', 'is_default'])
      .where('user_id', '=', noor.user.id)
      .orderBy('kind')
      .orderBy('display_name')
      .execute();
    expect(names).toEqual([
      { kind: 'personal', display_name: 'Noor', is_default: true },
      { kind: 'personal', display_name: 'Noor at home', is_default: false },
      { kind: 'professional', display_name: 'Noor H.', is_default: false },
    ]);
  });

  it('keeps the name people see as the profile’s, when two devices rename it at once', async () => {
    await Promise.all([
      noor.patch('/v1/me', { displayName: 'Noor on the phone' }),
      noor.patch('/v1/me', { displayName: 'Noor on the web' }),
    ]);
    const user = await t.ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', noor.user.id)
      .executeTakeFirstOrThrow();
    const shown = await t.ctx.db
      .selectFrom('identities')
      .select('display_name')
      .where('user_id', '=', noor.user.id)
      .where('kind', '=', 'personal')
      .where('is_default', '=', true)
      .executeTakeFirstOrThrow();
    expect(shown.display_name).toBe(user.display_name);
  });

  it('resyncs, once, the names renames left behind, and only the profile’s own', async () => {
    // As renames before this left them: Alex's shown name is still the one he signed up with.
    const shown = (userId: string) =>
      t.ctx.db
        .updateTable('identities')
        .where('user_id', '=', userId)
        .where('is_default', '=', true);
    await shown(alex.user.id).set({ display_name: 'Alex at sign-up' }).execute();
    const home = uuidv7();
    await t.ctx.db
      .insertInto('identities')
      .values({ id: home, user_id: alex.user.id, kind: 'personal', display_name: 'Alex at home' })
      .execute();
    // Sam is shown by a work identity with a name of its own.
    const sam = await signup(t, { displayName: 'Sam Rivera' });
    await shown(sam.user.id).set({ kind: 'professional', display_name: 'Sam at Acme' }).execute();
    const file = readFileSync(
      new URL('../src/db/migrations/0032_privacy_upkeep.sql', import.meta.url),
      'utf8',
    );
    const resync = file.match(/update identities[\s\S]*?;/)?.[0];
    expect(resync).toBeDefined();
    await sql.raw(resync as string).execute(t.ctx.db);
    const names = await t.ctx.db
      .selectFrom('identities')
      .select(['user_id', 'kind', 'is_default', 'display_name'])
      .where('user_id', 'in', [alex.user.id, sam.user.id])
      .orderBy('user_id')
      .orderBy('is_default', 'desc')
      .execute();
    expect(names).toEqual([
      { user_id: alex.user.id, kind: 'personal', is_default: true, display_name: 'Alex Kim' },
      { user_id: alex.user.id, kind: 'personal', is_default: false, display_name: 'Alex at home' },
      { user_id: sam.user.id, kind: 'professional', is_default: true, display_name: 'Sam at Acme' },
    ]);
    await t.ctx.db.deleteFrom('identities').where('id', '=', home).execute();
  });

  it('takes the notifications about a message deleted for everyone with it', async () => {
    const m = await send(noor, 'The door code is 4417');
    await t.ctx.flush();
    expect((await notesOf(alex.user.id)).map((n) => n.messageId)).toContain(m.id);
    const [note] = (await notesOf(alex.user.id)).filter((n) => n.messageId === m.id);
    // One that points at it without its words (a card moved, a follow-up) goes with it too.
    await t.ctx.db
      .insertInto('notifications')
      .values({
        id: uuidv7(),
        user_id: alex.user.id,
        kind: 'kit',
        level: 'activity',
        title: 'Noor: Shipped',
        body: 'Order · the door code',
        data: JSON.stringify({ conversationId: convo, messageId: m.id }),
      })
      .execute();
    await noor.del(`/v1/messages/${m.id}`);
    expect((await notesOf(alex.user.id)).map((n) => n.messageId)).not.toContain(m.id);
    expect(JSON.stringify(await alex.get('/v1/notifications'))).not.toMatch(/4417|door code/);
    // Alex's open apps drop it from their lists and lock screens.
    await drained();
    expect(told('notifications.read', (d) => d.ids?.includes(note?.id))).toEqual([alex.user.id]);
    // A browser of his that isn't open is sent the same line in its place, without the words.
    await runDueJobs(t.ctx);
    expect(pushed.filter((p) => p.id === note?.id && p.quiet)).toEqual([
      expect.objectContaining({
        userId: alex.user.id,
        title: note?.title,
        body: 'Message deleted',
        groupKey: `conv:${convo}`,
        pushTo: 'web',
      }),
    ]);
  });

  it('takes a message’s words out of a notification that told of several, and keeps the rest', async () => {
    const unread = () =>
      t.ctx.db
        .selectFrom('notifications')
        .select(['id', 'title', 'count', 'body'])
        .where('user_id', '=', alex.user.id)
        .where('read_at', 'is', null)
        .execute();
    const burst = async (...bodies: string[]) => {
      await alex.post('/v1/notifications/read', { all: true });
      const sent = [];
      for (const b of bodies) sent.push(await send(noor, b));
      await t.ctx.flush();
      const [note, ...others] = await unread();
      expect(others).toEqual([]);
      return { note, sent };
    };
    const replaced = async (id: string | undefined) => {
      await runDueJobs(t.ctx);
      return pushed.filter((p) => p.id === id && p.quiet);
    };
    // Hello, then a question, then a word more: one notification, showing the question (a lock
    // screen shows the hello, the first it was pushed).
    const first = await burst('Hi Alex', 'Is the gate code 5521?', 'ok');
    const [, question, ok] = first.sent;
    expect(first.note).toMatchObject({
      title: expect.stringMatching(/ sent 3 messages$/),
      count: 3,
      body: 'Is the gate code 5521?',
    });
    // "ok" going leaves it as it was: its words were never in it.
    await noor.del(`/v1/messages/${ok?.id}`);
    expect(await unread()).toEqual([first.note]);
    // The question going takes its words; that Noor wrote stays.
    await noor.del(`/v1/messages/${question?.id}`);
    expect(await unread()).toEqual([{ ...first.note, body: null }]);
    expect(JSON.stringify(await alex.get('/v1/notifications'))).not.toContain('5521');
    await drained();
    expect(told('notifications.read', (d) => d.ids?.includes(first.note?.id))).toEqual([
      alex.user.id,
    ]);
    expect(await replaced(first.note?.id)).toEqual([
      expect.objectContaining({ title: first.note?.title, body: null }),
    ]);

    // What a lock screen shows is the first message's: it going takes the preview too.
    const second = await burst('The alarm is 9031', 'Is that right?');
    expect(second.note).toMatchObject({ count: 2, body: 'Is that right?' });
    await noor.del(`/v1/messages/${second.sent[0]?.id}`);
    expect(await unread()).toEqual([{ ...second.note, body: null }]);
    expect(await replaced(second.note?.id)).toEqual([
      expect.objectContaining({ title: second.note?.title, body: null }),
    ]);
    expect(JSON.stringify(pushed.filter((p) => p.quiet))).not.toMatch(/5521|4417|9031/);
  });

  it('keeps nothing of a message’s words in what Caime offered from it, once it’s deleted', async () => {
    const m = await send(alex, 'Can you send me the door code 4417 by Friday?');
    await t.ctx.flush();
    const offers = () =>
      t.ctx.db
        .selectFrom('suggestions')
        .select(['id', 'user_id', 'status', 'title', 'rationale', 'payload'])
        .where('message_id', '=', m.id)
        .execute();
    const made = await offers();
    expect(made.length).toBeGreaterThan(0);
    expect(JSON.stringify(made)).toContain('4417');
    // One already turned down keeps nothing of it either.
    const first = made[0];
    await (first?.user_id === noor.user.id ? noor : alex).post(
      `/v1/suggestions/${first?.id}/dismiss`,
      {},
    );
    await alex.del(`/v1/messages/${m.id}`);
    const after = await offers();
    expect(after).toHaveLength(made.length);
    expect(JSON.stringify(after)).not.toContain('4417');
    expect(after.every((o) => o.status !== 'pending')).toBe(true);
  });

  it('takes the notifications about a message that disappeared with it, and says it went', async () => {
    const retention = (days: number | null) =>
      t.ctx.db
        .updateTable('conversations')
        .set({ retention_days: days })
        .where('id', '=', convo)
        .execute();
    const earlier = await send(alex, 'Sent before it was on');
    await retention(1);
    const asked = await send(alex, 'Can you send me the gate code 7788 by Friday?');
    await t.ctx.flush();
    await noor.post('/v1/notifications/read', { all: true });
    const m = await send(alex, 'Gone in a day');
    await t.ctx.flush();
    const [note] = (await notesOf(noor.user.id)).filter((n) => n.messageId === m.id);
    expect(note).toBeDefined();
    const offered = () =>
      t.ctx.db
        .selectFrom('suggestions')
        .select(['title', 'rationale', 'payload'])
        .where('message_id', '=', asked.id)
        .execute();
    expect(JSON.stringify(await offered())).toContain('7788');
    // Turned off again, what was sent meanwhile keeps its time; what comes after has none.
    await retention(null);
    const later = await send(alex, 'Sent after it was off');
    // More than a lot's worth, just after it: they all go, a lot at a time, oldest first.
    await sql`insert into messages (id, conversation_id, seq, sender_id, kind, body, created_at,
        expires_at)
      select gen_random_uuid(), ${convo}::uuid, 100000 + g, ${noor.user.id}::uuid, 'text',
        'old ' || g, ${t.clock.now}::timestamptz,
        ${new Date(t.clock.now.getTime() + DAY + 1000)}::timestamptz
      from generate_series(1, 501) g`.execute(t.ctx.db);
    t.clock.advance(2 * DAY);
    await runPeriodic(t.ctx);
    const state = await t.ctx.db
      .selectFrom('messages')
      .select(['id', 'body', 'deleted_at'])
      .where('id', 'in', [earlier.id, m.id, later.id])
      .execute();
    const of = (id: string) => state.find((x) => x.id === id);
    expect(of(m.id)).toMatchObject({ body: null, deleted_at: expect.any(Date) });
    // What Caime offered from one keeps none of its words.
    expect((await offered()).length).toBeGreaterThan(0);
    expect(JSON.stringify(await offered())).not.toContain('7788');
    expect(of(earlier.id)).toMatchObject({ body: 'Sent before it was on', deleted_at: null });
    expect(of(later.id)).toMatchObject({ body: 'Sent after it was off', deleted_at: null });
    const left = await t.ctx.db
      .selectFrom('messages')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('conversation_id', '=', convo)
      .where('body', 'like', 'old %')
      .executeTakeFirstOrThrow();
    expect(left.n).toBe(0);
    expect((await notesOf(noor.user.id)).map((n) => n.messageId)).not.toContain(m.id);
    // Both of them see it go at once, and Noor's devices drop what they showed of it.
    await drained();
    expect(told('message.deleted', (d) => d.id === m.id && d.conversationId === convo)).toEqual(
      [noor.user.id, alex.user.id].sort(),
    );
    expect(told('notifications.read', (d) => d.ids?.includes(note?.id))).toEqual([noor.user.id]);
  });

  it('keeps security records a year, ended sign-ins 30 days, the activity log 30 days', async () => {
    const put = (table: 'audit_log' | 'domain_events', row: object, days: number) =>
      t.ctx.db
        .insertInto(table)
        .values({ ...row, created_at: ago(days) } as never)
        .execute();
    // Oldest first, as they're written.
    await put('audit_log', { actor_id: noor.user.id, action: 'test.old', ip: '10.0.0.1' }, 400);
    await put('audit_log', { actor_id: noor.user.id, action: 'test.year', ip: '10.0.0.2' }, 300);
    await put('domain_events', { type: 'test.old', actor_id: noor.user.id, payload: {} }, 40);
    await put('domain_events', { type: 'search.outcome', payload: { found: true } }, 40);
    await put('domain_events', { type: 'search.outcome', payload: { found: true } }, 500);
    await put('domain_events', { type: 'test.new', actor_id: noor.user.id, payload: {} }, 1);
    const session = (id: string, over: object) =>
      t.ctx.db
        .insertInto('sessions')
        .values({
          id,
          user_id: noor.user.id,
          token_hash: Buffer.from(id),
          kind: 'native',
          ip: '10.0.0.3',
          expires_at: new Date(t.clock.now.getTime() + 30 * DAY),
          ...over,
        })
        .execute();
    const [revoked, expired, recent, live] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    await session(revoked, { revoked_at: ago(31) });
    await session(expired, { expires_at: ago(31) });
    await session(recent, { revoked_at: ago(5) });
    await session(live, {});

    await runPeriodic(t.ctx);

    const actions = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('action', 'like', 'test.%')
      .execute();
    expect(actions.map((a) => a.action)).toEqual(['test.year']);
    const events = await t.ctx.db
      .selectFrom('domain_events')
      .select(['type', 'created_at'])
      .where((eb) => eb.or([eb('type', 'like', 'test.%'), eb('type', '=', 'search.outcome')]))
      .orderBy('id')
      .execute();
    // What names nobody stays for the product's measures, back a year and more; the rest goes.
    expect(events.map((e) => e.type)).toEqual(['search.outcome', 'test.new']);
    expect(events[0]?.created_at.getTime()).toBe(ago(40).getTime());
    const sessions = await t.ctx.db
      .selectFrom('sessions')
      .select('id')
      .where('id', 'in', [revoked, expired, recent, live])
      .execute();
    expect(sessions.map((s) => s.id).sort()).toEqual([recent, live].sort());
    expect(KEPT_DAYS).toMatchObject({ securityRecords: 365, endedSignIns: 30, activity: 30 });
  });

  it('keeps who used an AI feature for 30 days, and counts that name nobody a year more', async () => {
    const run = (days: number, feature: string) =>
      t.ctx.db
        .insertInto('ai_runs')
        .values({
          id: uuidv7(),
          user_id: noor.user.id,
          conversation_id: convo,
          feature,
          provider: 'anthropic',
          outcome: 'ok',
          created_at: ago(days),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((r) => r.id);
    const recent = await run(29, 'rewrite');
    const old = await run(31, 'translate');
    const oldest = await run(401, 'catch_up');
    await runPeriodic(t.ctx);
    const runs = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['id', 'user_id', 'conversation_id', 'feature'])
      .where('id', 'in', [recent, old, oldest])
      .orderBy('created_at')
      .execute();
    expect(runs).toEqual([
      { id: old, user_id: null, conversation_id: null, feature: 'translate' },
      { id: recent, user_id: noor.user.id, conversation_id: convo, feature: 'rewrite' },
    ]);
    // What Noor downloads of hers is what's still hers.
    const mine = await noor.get('/v1/me/export');
    expect(JSON.stringify(mine)).toContain('rewrite');
    expect(JSON.stringify(mine)).not.toContain('translate');
  });

  it('sweeps a lot at a time until nothing old is left', async () => {
    await sql`insert into domain_events (type, actor_id, payload, created_at)
      select 'test.many', ${noor.user.id}::uuid, '{}', ${ago(31)}::timestamptz
      from generate_series(1, 5001)`.execute(t.ctx.db);
    await runPeriodic(t.ctx);
    const left = await t.ctx.db
      .selectFrom('domain_events')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('type', '=', 'test.many')
      .executeTakeFirstOrThrow();
    expect(left.n).toBe(0);
  });

  it('finds what’s due by indexes that name the measures the sweep keeps', async () => {
    const defs = await t.ctx.db
      .selectFrom(sql<{ indexname: string; indexdef: string }>`pg_indexes`.as('i'))
      .select(['indexname', 'indexdef'])
      .where('indexname', 'in', ['domain_events_activity', 'domain_events_measures'])
      .execute();
    expect(defs).toHaveLength(2);
    for (const d of defs) {
      const named = [...d.indexdef.matchAll(/'([a-z_.]+)'::text/g)].map((m) => m[1]).sort();
      expect(named, d.indexname).toEqual([...MEASURES].sort());
    }
  });

  it('keeps what was sent to an organization’s apps for 30 days', async () => {
    const org = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nileupkeep',
      kind: 'business',
    });
    const app = await noor.post(`/v1/orgs/${org.org.id}/apps`, {
      name: 'Front desk',
      scopes: [],
    });
    const delivery = (days: number) =>
      t.ctx.db
        .insertInto('webhook_deliveries')
        .values({
          id: uuidv7(),
          app_id: app.app.id,
          event: 'business.message',
          payload: JSON.stringify({ message: { body: `said ${days} days ago` } }),
          status: 'delivered',
          created_at: ago(days),
        })
        .execute();
    await delivery(31);
    await delivery(29);
    await runPeriodic(t.ctx);
    const left = await t.ctx.db
      .selectFrom('webhook_deliveries')
      .select('payload')
      .where('app_id', '=', app.app.id)
      .execute();
    expect(left.map((d) => (d.payload as any).message.body)).toEqual(['said 29 days ago']);
  });

  it('holds a handle someone let go of for a year, then forgets it', async () => {
    const day = (at: Date) => at.toISOString().slice(0, 10);
    const hold = (handle: string, releasedAgo: number) => ({
      handle,
      released_on: day(ago(releasedAgo)),
      held_until: day(ago(releasedAgo - KEPT_DAYS.heldHandles)),
    });
    await t.ctx.db
      .insertInto('released_handles')
      .values([hold('held.over', 400), hold('held.today', 365), hold('held.still', 364)])
      .execute();
    await runPeriodic(t.ctx);
    const left = await t.ctx.db
      .selectFrom('released_handles')
      .select('handle')
      .where('handle', 'like', 'held.%')
      .execute();
    expect(left).toEqual([{ handle: 'held.still' }]);
    expect(KEPT_DAYS.heldHandles).toBe(365);
  });

  it('asks the browser to let go of the photos it kept when someone signs out', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${alex.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['clear-site-data']).toBe('"cache"');
  });

  it('asks it too when the browser’s sign-in ended elsewhere, or the account was deleted', async () => {
    const signIn = async (who: Client) => {
      const login = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { identifier: who.user.handle, password: 'correct horse battery', client: 'web' },
      });
      expect(login.statusCode, login.body).toBe(200);
      return String(login.headers['set-cookie']).split(';')[0] ?? '';
    };
    const cookie = await signIn(noor);
    const sessions = (await noor.get('/v1/auth/sessions')).sessions as Array<{
      id: string;
      current: boolean;
      kind: string;
    }>;
    const web = sessions.filter((s) => s.kind === 'web' && !s.current);
    for (const s of web) await noor.del(`/v1/auth/sessions/${s.id}`);
    const ended = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie, 'x-caime-client': 'web' },
    });
    expect(ended.statusCode).toBe(401);
    expect(ended.headers['clear-site-data']).toBe('"cache"');

    const leaving = await signup(t, { displayName: 'Sam Leaving' });
    const theirs = await signIn(leaving);
    const gone = await t.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      payload: { password: 'correct horse battery' },
      headers: { cookie: theirs, 'x-caime-client': 'web' },
    });
    expect(gone.statusCode, gone.body).toBe(200);
    expect(gone.headers['clear-site-data']).toBe('"cache"');
  });
});
