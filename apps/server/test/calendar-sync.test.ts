import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { accountReturnOf } from '@caime/core/accounts';
import { shownMeetingCode } from '@caime/core/meeting-codes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROW } from '../src/lib/connected-accounts';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Bookings and connected calendars in step (R96, the owner's report of 2026-10-17: a booking
 * taken over a meeting in their Google Calendar, and never shown in Google or Outlook). Busy
 * times come from every calendar of the person's own, and are read again before a slot is
 * offered or taken; a booking from someone's public catalog holds their time while its message
 * request waits; and with Plans on, Caime's meetings and appointments are written into the
 * calendar, kept in step as they move, and taken out when they're over for Caime. A stand-in
 * plays Google's and Microsoft's calendars, events included.
 */
let t: TestApp;
let noor: Client;
let lina: Client;
let sami: Client;
let omar: Client;
let stub: Server;
let base: string;

interface Seen {
  method: string;
  path: string;
  query: URLSearchParams;
  json?: Record<string, unknown>;
}
const seen: Seen[] = [];
const googleScope = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned',
].join(' ');
/** Each Google calendar's busy times, or its error, by id. */
let googleCalendars: Record<
  string,
  { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }
> = {};
let calendarList: Array<Record<string, unknown>> = [];
/** The events written into the stand-in's calendars, by id. */
const googleEvents = new Map<string, Record<string, unknown>>();
const microsoftEvents = new Map<string, Record<string, unknown>>();
let nextMicrosoft = 0;

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => resolve(raw));
  });

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    const raw = await body(req);
    const url = new URL(req.url ?? '/', 'http://stub');
    const entry: Seen = {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
    };
    if (raw && !req.headers['content-type']?.includes('form')) entry.json = JSON.parse(raw);
    seen.push(entry);
    const send = (status: number, value?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(value === undefined ? '' : JSON.stringify(value));
    };
    const p = url.pathname;
    if (p === '/google/token')
      return send(200, {
        access_token: 'g-access',
        expires_in: 3599,
        refresh_token: 'g-refresh',
        scope: googleScope,
      });
    if (p === '/google/userinfo') return send(200, { sub: 'g-1', email: 'noor@gmail.example' });
    if (p === '/google/revoke') return send(200, {});
    if (p === '/gcal/users/me/calendarList') return send(200, { items: calendarList });
    if (p === '/gcal/freeBusy') {
      const items = (entry.json?.items ?? []) as Array<{ id: string }>;
      return send(200, {
        calendars: Object.fromEntries(
          items.map(({ id }) => [id, googleCalendars[id] ?? { busy: [] }]),
        ),
      });
    }
    const event = p.match(/^\/gcal\/calendars\/primary\/events(?:\/([^/]+))?$/);
    if (event) {
      const id = event[1];
      if (req.method === 'POST') {
        const e = entry.json as { id: string };
        if (googleEvents.has(e.id)) return send(409, { error: { code: 409 } });
        googleEvents.set(e.id, e);
        return send(200, e);
      }
      if (!id || !googleEvents.has(id)) return send(404, { error: { code: 404 } });
      if (req.method === 'PUT') {
        googleEvents.set(id, { id, ...entry.json });
        return send(200, googleEvents.get(id));
      }
      if (req.method === 'DELETE') {
        googleEvents.delete(id);
        return send(204);
      }
    }
    if (p.endsWith('/oauth2/v2.0/token'))
      return send(200, {
        access_token: 'm-access',
        expires_in: 3599,
        refresh_token: 'm-refresh',
        scope: 'openid email offline_access User.Read Calendars.ReadBasic Calendars.ReadWrite',
      });
    if (p === '/graph/v1.0/me')
      return send(200, { id: 'm-1', mail: 'omar@work.example', userPrincipalName: 'omar' });
    if (p === '/graph/v1.0/me/calendars')
      return send(200, {
        value: [
          {
            id: 'default',
            isDefaultCalendar: true,
            canEdit: true,
            owner: { address: 'omar@work.example' },
          },
          {
            id: 'side',
            isDefaultCalendar: false,
            canEdit: true,
            owner: { address: 'omar@work.example' },
          },
          {
            id: 'shared',
            isDefaultCalendar: false,
            canEdit: false,
            owner: { address: 'boss@work.example' },
          },
        ],
      });
    if (p === '/graph/v1.0/me/calendarView') return send(200, { value: [] });
    if (p === '/graph/v1.0/me/calendars/side/calendarView')
      return send(200, {
        value: [
          {
            start: { dateTime: '2026-10-01T06:00:00.0000000' },
            end: { dateTime: '2026-10-01T06:30:00.0000000' },
            showAs: 'busy',
          },
        ],
      });
    const ms = p.match(/^\/graph\/v1\.0\/me\/events(?:\/([^/]+))?$/);
    if (ms) {
      const id = ms[1] ? decodeURIComponent(ms[1]) : null;
      if (req.method === 'POST') {
        const made = `m-ev-${++nextMicrosoft}`;
        microsoftEvents.set(made, entry.json ?? {});
        return send(201, { id: made });
      }
      if (!id || !microsoftEvents.has(id)) return send(404, {});
      if (req.method === 'PATCH') {
        microsoftEvents.set(id, { ...microsoftEvents.get(id), ...entry.json });
        return send(200, { id });
      }
      if (req.method === 'DELETE') {
        microsoftEvents.delete(id);
        return send(204);
      }
    }
    send(404, {});
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  t = await createTestApp({
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_AUTH_URL: `${base}/google/auth`,
    GOOGLE_TOKEN_URL: `${base}/google/token`,
    GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
    GOOGLE_CALENDAR_API: `${base}/gcal`,
    GOOGLE_REVOKE_URL: `${base}/google/revoke`,
    MICROSOFT_CLIENT_ID: 'ms-client',
    MICROSOFT_CLIENT_SECRET: 'ms-secret',
    MICROSOFT_LOGIN_BASE: base,
    MICROSOFT_GRAPH_API: `${base}/graph`,
  });
  // Thursday 1 October 2026, 05:00Z: 08:00 in Cairo.
  t.clock.set('2026-10-01T05:00:00Z');
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  sami = await signup(t, { displayName: 'Sami Aziz' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  const set = await noor.req('PUT', '/v1/me/booking', { booking: HOURS, items: [LESSON] });
  expect(set.statusCode, set.body).toBe(200);
});

afterAll(async () => {
  await t.close();
  await new Promise((r) => stub.close(r));
});

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday, 09:00–12:00 Cairo (06:00–09:00Z).
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const LESSON = {
  id: 'lesson',
  name: 'Arabic lesson',
  price: null,
  unit: 'minutes',
  minutes: 60,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const window = 'from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z';
const times = (view: { slots: string[] }) => view.slots.map((s) => s.slice(11, 16));
const at = (hhmm: string) => `2026-10-01T${hhmm}:00.000Z`;

async function book(who: Client, conversationId: string, hhmm: string) {
  return who.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: {
      kit: 'appointment',
      fields: { title: 'Arabic lesson', start: { at: at(hhmm), hasTime: true } },
      booking: { itemId: 'lesson', quantity: 1 },
    },
  });
}

async function connect(who: Client, provider: 'google' | 'microsoft') {
  const { url } = await who.post(`/v1/me/accounts/${provider}/start`, {
    uses: ['calendar', 'plans'],
    back: 'web',
  });
  const state = new URL(url).searchParams.get('state') ?? '';
  const res = await t.app.inject({
    method: 'GET',
    url: `/v1/accounts/${provider}/back?${new URLSearchParams({ code: 'one-time', state })}`,
  });
  const back = accountReturnOf(String(res.headers.location).split('#')[1] ?? '');
  if (!back || !('claim' in back)) throw new Error('no claim');
  return (await who.post(`/v1/me/accounts/${provider}/claim`, { claim: back.claim })).account;
}

/** What follows a change: the end of its ten-second bucket, then the jobs. */
async function settle() {
  t.clock.advance(12_000);
  await runDueJobs(t.ctx);
}

let fromLina: string;
let linaBooking: string;

describe('bookings and connected calendars in step (R96)', () => {
  it('a stranger’s booking from the public catalog holds the time while its request waits', async () => {
    fromLina = (await lina.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    const booked = await book(lina, fromLina, '06:00');
    expect(booked.statusCode, booked.body).toBe(201);
    linaBooking = booked.json().message.id;
    // Whose catalog it's from is kept with it.
    expect(booked.json().message.payload.booking.hostId).toBe(noor.user.id);
    // Noor hasn't answered Lina's request, and the slot is gone for anyone else all the same.
    expect(times(await sami.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`))).toEqual(
      ['07:00', '07:30', '08:00'],
    );
    const fromSami = (
      await sami.post('/v1/conversations', { kind: 'direct', userId: noor.user.id })
    ).conversation.id;
    const twice = await book(sami, fromSami, '06:00');
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.code).toBe('slot_taken');
    // It's on Noor's calendar, as asked.
    const cal = await noor.get(`/v1/calendar?${window}`);
    expect(cal.items.find((i: { id: string }) => i.id === linaBooking)).toMatchObject({
      state: 'asked',
    });
  });

  it('reads every calendar of Noor’s own, and one that can’t be read is left out', async () => {
    calendarList = [
      { id: 'noor@gmail.example', primary: true, selected: true },
      { id: 'work', selected: true },
      { id: 'hidden-old', selected: false },
      { id: 'gone', selected: true },
    ];
    googleCalendars = {
      primary: { busy: [{ start: at('07:00'), end: at('07:30') }] },
      work: { busy: [{ start: at('08:30'), end: at('09:00') }] },
      gone: { errors: [{ domain: 'global', reason: 'notFound' }] },
    };
    const account = await connect(noor, 'google');
    expect(account).toMatchObject({ uses: ['calendar', 'plans'], mainCalendarOnly: false });
    seen.length = 0;
    await runDueJobs(t.ctx);
    const asked = seen.find((s) => s.path === '/gcal/freeBusy');
    expect(asked?.json?.items).toEqual([{ id: 'primary' }, { id: 'work' }, { id: 'gone' }]);
    expect(
      seen.find((s) => s.path === '/gcal/users/me/calendarList')?.query.get('minAccessRole'),
    ).toBe('owner');
    // Lina's lesson at 06:00, busy at 07:00 in the main calendar and at 08:30 in the work one.
    expect(times(await sami.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`))).toEqual(
      ['07:30'],
    );
  });

  it('writes Noor’s plans into Google: asked as tentative, nobody invited', async () => {
    await settle();
    const posts = seen.filter(
      (s) => s.path === '/gcal/calendars/primary/events' && s.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]?.query.get('sendUpdates')).toBe('none');
    const [event] = [...googleEvents.values()];
    expect(event).toMatchObject({
      summary: 'Arabic lesson · Lina Farah',
      status: 'tentative',
      transparency: 'opaque',
      start: { dateTime: '2026-10-01T06:00:00.000Z' },
      end: { dateTime: '2026-10-01T07:00:00.000Z' },
      extendedProperties: { private: { caime: `appointment-${linaBooking}@caime` } },
    });
    expect(event?.attendees).toBeUndefined();
    // Its join address is the short one (M16 F6d), in the description and as its place.
    const { code } = await t.ctx.db
      .selectFrom('meeting_codes')
      .select('code')
      .where('message_id', '=', linaBooking)
      .executeTakeFirstOrThrow();
    expect(String(event?.description)).toContain(`/m/${shownMeetingCode(code)}`);
    expect(event?.location).toBe(`http://localhost:8787/m/${shownMeetingCode(code)}`);
    expect(String(event?.description)).not.toContain(`/c/${fromLina}`);
    expect(String(event?.description)).toContain('Asked, not agreed yet.');
    // Put in step again with nothing changed, nothing is written.
    seen.length = 0;
    await t.ctx.db.updateTable('connected_accounts').set({ pushed_at: null }).execute();
    const { pushAccountPlans } = await import('../src/lib/calendar-push');
    const row = await t.ctx.db
      .selectFrom('connected_accounts')
      .select(ACCOUNT_ROW)
      .where('user_id', '=', noor.user.id)
      .executeTakeFirstOrThrow();
    await pushAccountPlans(t.ctx, row);
    expect(seen.filter((s) => s.path.startsWith('/gcal/calendars'))).toEqual([]);
  });

  it('never holds a time twice: what Caime wrote is left out of what is read back', async () => {
    // Google now shows the lesson Caime wrote as busy, as it would.
    googleCalendars.primary = {
      busy: [
        { start: at('06:00'), end: at('07:00') },
        { start: at('07:00'), end: at('07:30') },
      ],
    };
    t.clock.advance(61_000);
    // A stale read is read again before the slots are offered.
    seen.length = 0;
    await sami.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`);
    expect(seen.some((s) => s.path === '/gcal/freeBusy')).toBe(true);
    const kept = await t.ctx.db
      .selectFrom('external_busy')
      .select(['start_at', 'end_at'])
      .where('user_id', '=', noor.user.id)
      .orderBy('start_at')
      .execute();
    expect(kept.map((k) => [k.start_at.toISOString(), k.end_at.toISOString()])).toEqual([
      [at('07:00'), at('07:30')],
      [at('08:30'), at('09:00')],
    ]);
  });

  it('a meeting put in Google a moment ago holds its slot when someone books it', async () => {
    googleCalendars.primary = {
      busy: [
        { start: at('06:00'), end: at('07:00') },
        { start: at('07:00'), end: at('08:00') },
      ],
    };
    t.clock.advance(61_000);
    const fromSami = (
      await sami.post('/v1/conversations', { kind: 'direct', userId: noor.user.id })
    ).conversation.id;
    // No sweep ran: the booking read Noor's calendar again first.
    const late = await book(sami, fromSami, '07:30');
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('slot_taken');
    googleCalendars.primary = { busy: [] };
  });

  it('keeps the event in step: agreed, then cancelled and taken out', async () => {
    // Noor answers Lina (accepting the request) and confirms the lesson.
    await noor.post(`/v1/conversations/${fromLina}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'See you then',
    });
    expect(
      (await noor.req('POST', `/v1/messages/${linaBooking}/kit`, { to: 'confirmed' })).statusCode,
    ).toBe(200);
    await settle();
    const [confirmed] = [...googleEvents.values()];
    expect(confirmed).toMatchObject({ status: 'confirmed' });
    expect(String(confirmed?.description)).not.toContain('Asked, not agreed yet.');
    expect(
      seen.some((s) => s.method === 'PUT' && s.path.startsWith('/gcal/calendars/primary/events/')),
    ).toBe(true);
    expect(
      (await noor.req('POST', `/v1/messages/${linaBooking}/kit`, { to: 'cancelled' })).statusCode,
    ).toBe(200);
    await settle();
    expect(googleEvents.size).toBe(0);
    expect(
      await t.ctx.db
        .selectFrom('calendar_pushes')
        .select('uid')
        .where('user_id', '=', noor.user.id)
        .execute(),
    ).toEqual([]);
  });

  it('writes Omar’s plans into Outlook, reads Omar’s own calendars only, and takes one removed out', async () => {
    const account = await connect(omar, 'microsoft');
    expect(account.mainCalendarOnly).toBe(false);
    seen.length = 0;
    await runDueJobs(t.ctx);
    // The default calendar and Omar's other own one; never the one shared with Omar.
    expect(seen.some((s) => s.path === '/graph/v1.0/me/calendars/side/calendarView')).toBe(true);
    expect(seen.some((s) => s.path.includes('/calendars/shared/'))).toBe(false);
    const kept = await t.ctx.db
      .selectFrom('external_busy')
      .select(['start_at'])
      .where('user_id', '=', omar.user.id)
      .execute();
    expect(kept.map((k) => k.start_at.toISOString())).toEqual([at('06:00')]);
    // Omar proposes coffee to Noor: on Omar's calendar as asked.
    const chat = (await omar.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    const coffee = await omar.post(`/v1/conversations/${chat}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Coffee',
          start: { at: '2026-10-02T10:00:00Z', hasTime: true },
          durationMinutes: 30,
          place: 'Zamalek',
        },
      },
    });
    await settle();
    const [made] = [...microsoftEvents.entries()];
    expect(made?.[1]).toMatchObject({
      subject: 'Coffee · Noor Haddad',
      showAs: 'tentative',
      isAllDay: false,
      start: { dateTime: '2026-10-02T10:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-10-02T10:30:00', timeZone: 'UTC' },
      location: { displayName: 'Zamalek' },
    });
    expect(typeof made?.[1].transactionId).toBe('string');
    // Taken down for everyone, it leaves Omar's calendar.
    await omar.req('DELETE', `/v1/messages/${coffee.message.id}`);
    await settle();
    expect(microsoftEvents.size).toBe(0);
  });

  it('disconnecting takes out what Caime wrote that is still ahead, then gives the permission back', async () => {
    const fromSami = (
      await sami.post('/v1/conversations', { kind: 'direct', userId: noor.user.id })
    ).conversation.id;
    // Google's meeting at 07:00 is gone since: read again, the slot is open.
    t.clock.advance(61_000);
    const booked = await book(sami, fromSami, '07:00');
    expect(booked.statusCode, booked.body).toBe(201);
    await settle();
    expect(googleEvents.size).toBe(1);
    const [account] = (await noor.get('/v1/me/accounts')).accounts;
    seen.length = 0;
    await noor.req('DELETE', `/v1/me/accounts/${account.id}`);
    const order = seen.map((s) => `${s.method} ${s.path.split('/').slice(0, 5).join('/')}`);
    expect(order.indexOf('DELETE /gcal/calendars/primary/events')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('DELETE /gcal/calendars/primary/events')).toBeLessThan(
      order.indexOf('POST /google/revoke'),
    );
    expect(googleEvents.size).toBe(0);
  });

  it('says on the privacy page what is written and kept', async () => {
    const page = (await t.app.inject({ method: 'GET', url: '/privacy' })).body.replace(/\s+/g, ' ');
    expect(page).toContain('When you turn its Plans on, Caime writes your meetings');
    expect(page).toContain('invites nobody by it');
    // A refused one (M16 G4), and an organization's that keeps its conversations (G3b).
    expect(page).toContain('One the calendar refuses on its own is tried 3 times as it is');
    expect(page).toContain('the organization&rsquo;s name and the time');
  });
});
