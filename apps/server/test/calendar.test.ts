import { uuidv4 } from '@caishy/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let withBen: string;

async function connect(a: Client, b: Client, relationship?: object): Promise<string> {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    ...(relationship ? { relationship } : {}),
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

/** What a calendar app reads: no session, no token, only the address. */
const read = (url: string) =>
  t.app.inject({
    method: 'GET',
    url: new URL(url).pathname,
    headers: { 'user-agent': 'Google-Calendar-Importer' },
  });

const lines = async (url: string) => {
  const res = await read(url);
  expect(res.statusCode).toBe(200);
  return res.body.replace(/\r\n /g, '').split('\r\n');
};

/** The lines of one event, found by its UID. */
const event = (all: string[], uid: string) => {
  const at = all.indexOf(`UID:${uid}`);
  if (at < 0) return null;
  return all.slice(at, all.indexOf('END:VEVENT', at));
};

const card = (c: Client, conversationId: string, kit: string, fields: unknown) =>
  c
    .post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit, fields },
    })
    .then((r) => r.message);

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Calendar', timeZone: 'Africa/Cairo' });
  ben = await signup(t, { displayName: 'Ben Calendar', timeZone: 'Europe/London' });
  withBen = await connect(ana, ben, { sphere: 'work', role: 'colleague' });
});
afterAll(async () => {
  await t.close();
});

describe('a calendar feed (PRD §72)', () => {
  it('is an address shown once, read with no sign-in, ended by a new one or by stopping it', async () => {
    expect((await ana.get('/v1/calendar/feed')).feed).toEqual({
      enabled: false,
      createdAt: null,
      lastReadAt: null,
    });
    const first = await ana.post('/v1/calendar/feed');
    expect(first.url).toMatch(/^http:\/\/localhost:8787\/v1\/calendar\/cal_[\w-]{43}\.ics$/);
    expect(first.feed).toMatchObject({ enabled: true, lastReadAt: null });
    const res = await read(first.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(res.body).toContain('X-WR-TIMEZONE:Africa/Cairo');
    expect((await ana.get('/v1/calendar/feed')).feed.lastReadAt).toBe(t.clock.now.toISOString());
    // Only its hash is kept.
    const stored = await t.ctx.db
      .selectFrom('calendar_feeds')
      .selectAll()
      .where('user_id', '=', ana.user.id)
      .executeTakeFirstOrThrow();
    const token = /cal_[\w-]{43}/.exec(first.url)![0];
    expect(stored.token_hash.toString('hex')).not.toContain(Buffer.from(token).toString('hex'));
    expect(stored.token_hash).toHaveLength(32);
    // A new address ends the old one.
    const second = await ana.post('/v1/calendar/feed');
    expect(second.url).not.toBe(first.url);
    expect(second.feed.lastReadAt).toBeNull();
    expect((await read(first.url)).statusCode).toBe(404);
    expect((await read(second.url)).statusCode).toBe(200);
    // Stopped, nothing reads it.
    await ana.del('/v1/calendar/feed');
    expect((await read(second.url)).statusCode).toBe(404);
    expect((await ana.get('/v1/calendar/feed')).feed.enabled).toBe(false);
    const third = await ana.post('/v1/calendar/feed');
    // Nothing that isn't an address is looked up, a live one without its .ics included.
    expect((await read(third.url.replace(/\.ics$/, ''))).statusCode).toBe(404);
    expect((await read(third.url)).statusCode).toBe(200);
    await ana.del('/v1/calendar/feed');
    for (const path of ['/v1/calendar/feed.ics', '/v1/calendar/cal_short.ics', '/v1/calendar/x'])
      expect((await t.app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
    const audited = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('actor_id', '=', ana.user.id)
      .where('action', 'like', 'calendar.%')
      .execute();
    expect(audited.map((a) => a.action).sort()).toEqual([
      'calendar.feed_created',
      'calendar.feed_created',
      'calendar.feed_created',
      'calendar.feed_stopped',
      'calendar.feed_stopped',
    ]);
  });

  it('is made only by the person signed in, and only by an adult', async () => {
    const made = await ana.req('POST', '/v1/me/tokens', {
      name: 'Script',
      scopes: ['actions:read'],
      days: 30,
    });
    expect(made.statusCode).toBe(201);
    const token = made.json().token as string;
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const res = await t.app.inject({
        method,
        url: '/v1/calendar/feed',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, method).toBe(403);
      expect(res.json().error.code).toBe('token_route');
    }
    expect((await t.app.inject({ method: 'POST', url: '/v1/calendar/feed' })).statusCode).toBe(401);
    const teen = await signup(t, { displayName: 'Tess Teen', birthYear: 2011 });
    const refused = await teen.req('POST', '/v1/calendar/feed', {});
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe('Calendars are for people over 18.');
  });

  it('shows open actions with a due date on their day, or at their time, and what’s awaited', async () => {
    const { url } = await ana.post('/v1/calendar/feed');
    const benFeed = (await ben.post('/v1/calendar/feed')).url as string;
    // 21:30 UTC on 1 October is already 2 October in Cairo.
    const passport = (
      await ana.post('/v1/tasks', {
        title: 'Renew the passport',
        dueAt: '2026-10-01T21:30:00.000Z',
        dueHasTime: false,
      })
    ).task;
    const bank = (
      await ana.post('/v1/tasks', {
        title: 'Call the bank, then the notary',
        notes: 'Ask about the fee',
        dueAt: '2026-10-05T07:00:00.000Z',
        dueHasTime: true,
      })
    ).task;
    const deck = (
      await ana.post('/v1/tasks', {
        title: 'Send the deck',
        assigneeId: ben.user.id,
        shared: true,
        conversationId: withBen,
        dueAt: '2026-10-03T12:00:00.000Z',
        dueHasTime: true,
      })
    ).task;
    const quiet = (
      await ana.post('/v1/tasks', {
        title: 'Contract from Ben',
        assigneeId: ben.user.id,
        dueAt: '2026-10-04T12:00:00.000Z',
      })
    ).task;
    const undated = (await ana.post('/v1/tasks', { title: 'Someday' })).task;
    const all = await lines(url);
    expect(event(all, `task-${passport.id}@caishy`)).toEqual(
      expect.arrayContaining([
        'DTSTART;VALUE=DATE:20261002',
        'DTEND;VALUE=DATE:20261003',
        'SUMMARY:Renew the passport',
        'TRANSP:TRANSPARENT',
        'URL:http://localhost:8787/actions',
      ]),
    );
    expect(event(all, `task-${bank.id}@caishy`)).toEqual(
      expect.arrayContaining([
        'DTSTART:20261005T070000Z',
        'DTEND:20261005T073000Z',
        'SUMMARY:Call the bank\\, then the notary',
        'DESCRIPTION:Ask about the fee\\n\\nOne of your actions. In Caishy: http://localhost:8787/actions',
      ]),
    );
    expect(event(all, `task-${deck.id}@caishy`)).toEqual(
      expect.arrayContaining([
        'SUMMARY:Waiting on Ben Calendar: Send the deck',
        `URL:http://localhost:8787/c/${withBen}`,
      ]),
    );
    expect(event(all, `task-${quiet.id}@caishy`)).toEqual(
      expect.arrayContaining(['SUMMARY:Waiting on Ben Calendar: Contract from Ben']),
    );
    expect(event(all, `task-${undated.id}@caishy`)).toBeNull();
    // Ben sees what he was asked, in his own time zone, and never what Ana keeps to herself.
    const his = await lines(benFeed);
    expect(his).toContain('X-WR-TIMEZONE:Europe/London');
    expect(event(his, `task-${deck.id}@caishy`)).toEqual(
      expect.arrayContaining([
        'SUMMARY:Send the deck',
        `DESCRIPTION:Ana Calendar asked you. In Caishy: http://localhost:8787/c/${withBen}`,
      ]),
    );
    expect(event(his, `task-${quiet.id}@caishy`)).toBeNull();
    expect(event(his, `task-${passport.id}@caishy`)).toBeNull();
    // Done, it leaves the calendar.
    await ana.patch(`/v1/tasks/${passport.id}`, { status: 'done' });
    expect(event(await lines(url), `task-${passport.id}@caishy`)).toBeNull();
  });

  it('shows meetings and appointments once agreed, and not once taken back or left', async () => {
    const { url } = await ana.post('/v1/calendar/feed');
    const benFeed = (await ben.post('/v1/calendar/feed')).url as string;
    const meeting = await card(ana, withBen, 'meeting', {
      title: 'Venue walkthrough',
      start: { at: '2026-10-02T11:00:00Z', hasTime: true },
      durationMinutes: 45,
      place: 'Hall B, 2nd floor',
    });
    const uid = `meeting-${meeting.id}@caishy`;
    expect(event(await lines(url), uid)).toBeNull();
    expect(
      (await ben.req('POST', `/v1/messages/${meeting.id}/kit`, { to: 'accepted' })).statusCode,
    ).toBe(200);
    for (const feed of [url, benFeed])
      expect(event(await lines(feed), uid)).toEqual(
        expect.arrayContaining([
          'DTSTART:20261002T110000Z',
          'DTEND:20261002T114500Z',
          'SUMMARY:Venue walkthrough',
          'LOCATION:Hall B\\, 2nd floor',
          'TRANSP:OPAQUE',
          `URL:http://localhost:8787/c/${withBen}`,
        ]),
      );
    // Deleted for himself, it's gone from his calendar only.
    await ben.del(`/v1/messages/${meeting.id}?forEveryone=false`);
    expect(event(await lines(benFeed), uid)).toBeNull();
    expect(event(await lines(url), uid)).not.toBeNull();
    // Cancelled, it's gone from everyone's.
    await ana.post(`/v1/messages/${meeting.id}/kit`, { to: 'cancelled' });
    expect(event(await lines(url), uid)).toBeNull();

    // A day without a time is an all-day event, on the day in the reader's time zone.
    const allDay = await card(ana, withBen, 'meeting', {
      title: 'Offsite',
      start: { at: '2026-10-09T22:00:00Z', hasTime: false },
    });
    await ben.post(`/v1/messages/${allDay.id}/kit`, { to: 'accepted' });
    expect(event(await lines(url), `meeting-${allDay.id}@caishy`)).toEqual(
      expect.arrayContaining(['DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261011']),
    );
    expect(event(await lines(benFeed), `meeting-${allDay.id}@caishy`)).toEqual(
      expect.arrayContaining(['DTSTART;VALUE=DATE:20261009', 'DTEND;VALUE=DATE:20261010']),
    );
    // Deleted for everyone, it's gone from everyone's.
    await ana.del(`/v1/messages/${allDay.id}`);
    expect(event(await lines(url), `meeting-${allDay.id}@caishy`)).toBeNull();
    expect(event(await lines(benFeed), `meeting-${allDay.id}@caishy`)).toBeNull();

    // An appointment is there once confirmed.
    const dentist = await signup(t, { displayName: 'Dr Dee' });
    const clinic = await connect(ana, dentist, { sphere: 'service_provider' });
    const visit = await card(ana, clinic, 'appointment', {
      title: 'Check-up',
      start: { at: '2026-10-06T08:30:00Z', hasTime: true },
    });
    expect(event(await lines(url), `appointment-${visit.id}@caishy`)).toBeNull();
    await dentist.post(`/v1/messages/${visit.id}/kit`, { to: 'confirmed' });
    expect(event(await lines(url), `appointment-${visit.id}@caishy`)).toEqual(
      expect.arrayContaining(['DTSTART:20261006T083000Z', 'DTEND:20261006T093000Z']),
    );

    // Someone who leaves a group has its meetings leave their calendar.
    const cy = await signup(t, { displayName: 'Cy Calendar' });
    await connect(ana, cy);
    const group = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Venue team',
        memberIds: [ben.user.id, cy.user.id],
      })
    ).conversation.id;
    const standup = await card(ana, group, 'meeting', {
      title: 'Stand-up',
      start: { at: '2026-10-07T09:00:00Z', hasTime: true },
    });
    await cy.post(`/v1/messages/${standup.id}/kit`, { to: 'accepted' });
    expect(event(await lines(benFeed), `meeting-${standup.id}@caishy`)).not.toBeNull();
    await ben.del(`/v1/conversations/${group}/members/${ben.user.id}`);
    expect(event(await lines(benFeed), `meeting-${standup.id}@caishy`)).toBeNull();
    expect(event(await lines(url), `meeting-${standup.id}@caishy`)).not.toBeNull();
  });

  it('ends when the account is recovered: whoever had it may have made it', async () => {
    const eve = await signup(t, { displayName: 'Eve Recovered' });
    const { url } = await eve.post('/v1/calendar/feed');
    expect((await read(url)).statusCode).toBe(200);
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/recover',
      payload: {
        identifier: eve.user.handle,
        code: eve.recoveryCodes[0],
        newPassword: 'a brand new passphrase',
        client: 'native',
      },
    });
    expect(res.statusCode).toBe(200);
    expect((await read(url)).statusCode).toBe(404);
  });

  it('never has what a message request asked, and a request refused leaves no action', async () => {
    const mal = await signup(t, { displayName: 'Mal Stranger' });
    const vic = await signup(t, { displayName: 'Vic Asked' });
    const { url } = await vic.post('/v1/calendar/feed');
    const dm = (await mal.post('/v1/conversations', { kind: 'direct', userId: vic.user.id }))
      .conversation.id;
    const ask = (title: string) =>
      mal.req('POST', '/v1/tasks', {
        title,
        assigneeId: vic.user.id,
        shared: true,
        conversationId: dm,
        dueAt: '2026-10-01T09:00:00Z',
        dueHasTime: true,
      });
    // Its one message is the request's card, waiting in Requests: not in Vic's calendar.
    const first = await ask('Verify your account');
    expect(first.statusCode).toBe(201);
    expect(event(await lines(url), `task-${first.json().task.id}@caishy`)).toBeNull();
    // Another has nowhere to go: refused, and nothing of it is kept.
    const second = await ask('Verify it again');
    expect(second.statusCode).toBe(403);
    const made = await t.ctx.db
      .selectFrom('tasks')
      .select('title')
      .where('owner_id', '=', mal.user.id)
      .execute();
    expect(made.map((m) => m.title)).toEqual(['Verify your account']);
  });

  it('keeps what’s ahead, however much is behind it', async () => {
    const kai = await signup(t, { displayName: 'Kai Busy' });
    const lu = await signup(t, { displayName: 'Lu Busy' });
    const withLu = await connect(kai, lu);
    const { url } = await kai.post('/v1/calendar/feed');
    const ahead = await card(kai, withLu, 'meeting', {
      title: 'Next Tuesday',
      start: { at: '2026-10-06T09:00:00Z', hasTime: true },
    });
    await lu.post(`/v1/messages/${ahead.id}/kit`, { to: 'accepted' });
    // Hundreds agreed since, for long ago: never in the window, never crowding it out.
    await sql`
      insert into messages (id, conversation_id, seq, sender_id, kind, payload, created_at)
      select gen_random_uuid(), conversation_id, seq + 1000 + g, sender_id, kind,
        jsonb_set(payload, '{fields,start,at}', '"2025-01-06T09:00:00.000Z"'),
        created_at + make_interval(secs => g)
      from messages, generate_series(1, 510) g where id = ${ahead.id}`.execute(t.ctx.db);
    // And hundreds of actions overdue, with one coming up.
    const soon = (
      await kai.post('/v1/tasks', { title: 'Coming up', dueAt: '2026-10-02T09:00:00Z' })
    ).task.id;
    await t.ctx.db
      .insertInto('tasks')
      .values(
        Array.from({ length: 505 }, (_, i) => ({
          id: uuidv4(),
          owner_id: kai.user.id,
          assignee_id: kai.user.id,
          title: `Overdue ${i}`,
          due_at: new Date(Date.parse('2026-08-01T09:00:00Z') + i * 60_000),
        })),
      )
      .execute();
    const all = await lines(url);
    expect(event(all, `meeting-${ahead.id}@caishy`)).not.toBeNull();
    expect(event(all, `task-${soon}@caishy`)).not.toBeNull();
  });

  it('goes with the account', async () => {
    const dot = await signup(t, { displayName: 'Dot Gone' });
    const { url } = await dot.post('/v1/calendar/feed');
    expect((await read(url)).statusCode).toBe(200);
    expect(
      (await dot.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    expect((await read(url)).statusCode).toBe(404);
  });
});

describe('what’s coming up (PRD §41)', () => {
  it('in a conversation: asked and agreed, soonest first, never past, declined or deleted', async () => {
    const cal = await signup(t, { displayName: 'Cal Upcoming' });
    const dan = await signup(t, { displayName: 'Dan Upcoming' });
    const convo = await connect(cal, dan);
    const at = (iso: string) => ({ at: iso, hasTime: true });
    const later = await card(cal, convo, 'meeting', {
      title: 'Budget review',
      start: at('2026-10-05T10:00:00Z'),
    });
    const sooner = await card(cal, convo, 'meeting', {
      title: 'Venue walkthrough',
      start: at('2026-10-03T09:00:00Z'),
      durationMinutes: 45,
      place: 'Hall B',
    });
    const declined = await card(cal, convo, 'meeting', {
      title: 'Lunch',
      start: at('2026-10-04T12:00:00Z'),
    });
    const past = await card(cal, convo, 'meeting', {
      title: 'Kick-off',
      start: at('2026-09-01T09:00:00Z'),
    });
    await dan.post(`/v1/messages/${sooner.id}/kit`, { to: 'accepted' });
    await dan.post(`/v1/messages/${declined.id}/kit`, { to: 'declined' });
    await dan.post(`/v1/messages/${past.id}/kit`, { to: 'accepted' });
    // One in another of Cal's conversations belongs to that one.
    const eve = await signup(t, { displayName: 'Eve Upcoming' });
    const elsewhere = await connect(cal, eve);
    await card(cal, elsewhere, 'meeting', {
      title: 'Elsewhere',
      start: at('2026-10-02T09:00:00Z'),
    });
    const upcoming = async (c: Client) =>
      (await c.get(`/v1/conversations/${convo}/memory`)).upcoming as any[];
    expect(await upcoming(cal)).toEqual([
      {
        messageId: sooner.id,
        conversationId: convo,
        seq: sooner.seq,
        kit: 'meeting',
        title: 'Venue walkthrough',
        at: '2026-10-03T09:00:00.000Z',
        hasTime: true,
        durationMinutes: 45,
        place: 'Hall B',
        agreed: true,
      },
      expect.objectContaining({ messageId: later.id, agreed: false, durationMinutes: null }),
    ]);
    // Deleted for himself, it's gone from his list only; cancelled, from everyone's.
    await dan.del(`/v1/messages/${later.id}?forEveryone=false`);
    expect((await upcoming(dan)).map((u) => u.messageId)).toEqual([sooner.id]);
    expect((await upcoming(cal)).map((u) => u.messageId)).toEqual([sooner.id, later.id]);
    await cal.post(`/v1/messages/${sooner.id}/kit`, { to: 'cancelled' });
    expect((await upcoming(cal)).map((u) => u.messageId)).toEqual([later.id]);
  });

  it('in a space: its calendar, from the conversations of it each person is in', async () => {
    const dee = await signup(t, { displayName: 'Dee Space' });
    const eli = await signup(t, { displayName: 'Eli Space' });
    await connect(dee, eli);
    const space = (
      await dee.post('/v1/spaces', {
        name: 'The Nile family',
        kind: 'family',
        memberIds: [eli.user.id],
      })
    ).space;
    const dinner = await card(dee, space.generalId, 'meeting', {
      title: 'Dinner at Grandma’s',
      start: { at: '2026-10-04T17:00:00Z', hasTime: true },
    });
    await eli.post(`/v1/messages/${dinner.id}/kit`, { to: 'accepted' });
    // A conversation of the space only Dee is in.
    const hers = (await dee.post(`/v1/spaces/${space.id}/conversations`, { title: 'Gift ideas' }))
      .conversation.id;
    const surprise = await card(dee, hers, 'meeting', {
      title: 'Buy the cake',
      start: { at: '2026-10-03T10:00:00Z', hasTime: true },
    });
    const view = async (c: Client) =>
      (await c.get(`/v1/spaces/${space.id}`)).space.upcoming as any[];
    expect((await view(dee)).map((u) => [u.title, u.conversationTitle, u.agreed])).toEqual([
      ['Buy the cake', 'Gift ideas', false],
      ['Dinner at Grandma’s', 'The Nile family', true],
    ]);
    expect((await view(eli)).map((u) => u.messageId)).toEqual([dinner.id]);
    expect(surprise.id).toBeTruthy();
  });
});
