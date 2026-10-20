/**
 * Where a meeting or a booking is, and what a calendar says of it (M16 F6, the owner's report of
 * 2026-10-19: a booking from their page was a card and not a meeting, and Google showed a meeting
 * as "Great Meeting test · Great Meeting test" with nobody named and its link in the notes).
 *
 * A person's item by the minute is a call on Caime unless it says it's at one of their places
 * anyone may see or somewhere else in their words; its booking's card says so, and one held here
 * is joined as a meeting is (the calendar, the feed, "starting now"); something ordered by the
 * piece may say it's sent here; the page says where each is; someone who booked without an
 * account is told it's a call, and a call to them says why it can't ring yet. A calendar event
 * names whom it's with, never the same words twice, with its join address for its place, and in
 * a business conversation the team reads the customer and the customer the organization.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planEvents } from '../src/lib/calendar-push';
import { memoryMailer } from '../src/lib/email';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
const mail = memoryMailer();
let sami: Client; // a tutor with a catalog of his own
let lina: Client; // books with an account
let fromLina: string;
let studio: string;
let home: string;

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Monday to Wednesday, 09:00–12:00 in Cairo (06:00–09:00Z in October 2026).
  days: [1, 2, 3].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const item = (patch: Record<string, unknown>) => ({
  id: 'x',
  name: 'X',
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
  ...patch,
});
const CATALOG = () => [
  item({ id: 'call', name: 'Arabic lesson' }),
  item({ id: 'studio', name: 'Studio lesson', placeId: studio }),
  item({ id: 'cafe', name: 'Cafe lesson', onCaime: false, whereNote: 'Cafe Riche, Talaat Harb' }),
  // A place wins over the rest: one of three is kept.
  item({ id: 'both', name: 'Both', placeId: studio, onCaime: true, whereNote: 'Never kept' }),
  item({
    id: 'notes',
    name: 'Lesson notes',
    unit: 'each',
    minutes: null,
    maxQuantity: 2,
    price: { value: 50, currency: 'EGP' },
    onCaime: true,
  }),
];

const window = { from: new Date('2026-10-19T00:00:00Z'), until: new Date('2026-11-02T00:00:00Z') };
const windowQuery = `from=${window.from.toISOString()}&to=${window.until.toISOString()}`;

/** Booked from the catalog as the app does: what it's for is the item's name. */
const book = (who: Client, conversationId: string, itemId: string, at: string) =>
  who.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: {
      kit: 'appointment',
      fields: {
        title: CATALOG().find((i) => i.id === itemId)?.name ?? itemId,
        start: { at, hasTime: true },
      },
      booking: { itemId, quantity: 1 },
    },
  });

const form = (url: string, fields: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });
const codeFor = (address: string) => {
  const sent = mail.outbox.filter((m) => m.to === address).at(-1);
  expect(sent, `a code to ${address}`).toBeDefined();
  return /^(\d{6}) /.exec(sent?.subject ?? '')?.[1] ?? '';
};
const paramOf = (location: string | undefined, name: string) =>
  new URL(location ?? '', 'http://x').searchParams.get(name);

beforeAll(async () => {
  // The app's shell, as the export leaves it: the pages are written into it (R44).
  const dir = mkdtempSync(join(tmpdir(), 'caime-card-where-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' }, { mail });
  // Monday 19 October 2026, 09:00 in Cairo.
  t.clock.set('2026-10-19T06:00:00Z');
  sami = await signup(t, {
    displayName: 'Sami Tutor',
    handle: 'sami.tutor',
    country: 'EG',
    timeZone: 'Africa/Cairo',
  });
  lina = await signup(t, { displayName: 'Lina Farah', timeZone: 'Africa/Cairo' });
  const { places } = await sami
    .req('PUT', '/v1/me/places', {
      places: [
        {
          kind: 'other',
          label: 'Studio',
          country: 'EG',
          city: 'Cairo',
          street: '9 Road 233',
          audience: { kind: 'everyone' },
        },
        {
          kind: 'home',
          country: 'EG',
          city: 'Cairo',
          street: '4 Nile Street',
          audience: { kind: 'connections' },
        },
      ],
    })
    .then((r) => r.json());
  [studio, home] = places.map((p: { id: string }) => p.id);
  fromLina = (await lina.post('/v1/conversations', { kind: 'direct', userId: sami.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

describe('where a booking is (M16 F6)', () => {
  it('a person’s item by the minute is a call on Caime unless it says where else; a save keeps one of three', async () => {
    // A place of theirs is one anyone may see: a booking copies its address to whoever books.
    const hidden = await sami.req('PUT', '/v1/me/booking', {
      booking: HOURS,
      items: [item({ id: 'home', name: 'At home', placeId: home })],
    });
    expect(hidden.statusCode).toBe(400);
    expect(hidden.json().error.message).toBe('Choose one of your places that anyone may see.');
    const saved = await sami.req('PUT', '/v1/me/booking', {
      booking: HOURS,
      items: CATALOG(),
      ordering: { fulfilment: ['pickup'], note: null },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const items = new Map(
      (await sami.get('/v1/me/booking')).items.map((i: { id: string }) => [i.id, i]),
    );
    expect(items.get('call')).toMatchObject({ placeId: null, whereNote: null });
    expect(items.get('call')).not.toHaveProperty('onCaime');
    expect(items.get('studio')).toMatchObject({ placeId: studio, whereNote: null });
    expect(items.get('cafe')).toMatchObject({
      placeId: null,
      onCaime: false,
      whereNote: 'Cafe Riche, Talaat Harb',
    });
    expect(items.get('both')).toMatchObject({ placeId: studio, whereNote: null });
    expect(items.get('both')).not.toHaveProperty('onCaime');
    expect(items.get('notes')).toMatchObject({ onCaime: true, whereNote: null });
  });

  it('its booking’s card says where: Caime, the place’s address, or the host’s words', async () => {
    const call = await book(lina, fromLina, 'call', '2026-10-20T06:00:00.000Z');
    expect(call.statusCode, call.body).toBe(201);
    expect(call.json().message.payload.fields.place).toBe('Caime');
    expect(call.json().message.payload.booking).toMatchObject({ where: 'Caime' });
    expect(call.json().message.payload.booking).not.toHaveProperty('placeId');
    // Sami answers her request by confirming it.
    await sami.post(`/v1/messages/${call.json().message.id}/kit`, { to: 'confirmed' });
    const atStudio = await book(lina, fromLina, 'studio', '2026-10-20T07:00:00.000Z');
    expect(atStudio.statusCode, atStudio.body).toBe(201);
    expect(atStudio.json().message.payload.booking).toMatchObject({ placeId: studio });
    expect(atStudio.json().message.payload.fields.place).toContain('9 Road 233');
    const cafe = await book(lina, fromLina, 'cafe', '2026-10-20T08:00:00.000Z');
    expect(cafe.statusCode, cafe.body).toBe(201);
    expect(cafe.json().message.payload.fields.place).toBe('Cafe Riche, Talaat Harb');
    for (const m of [atStudio, cafe])
      await sami.post(`/v1/messages/${m.json().message.id}/kit`, { to: 'confirmed' });

    // Held here, it's joined as a meeting is: in the calendar, with Join; elsewhere, not.
    for (const who of [sami, lina]) {
      const items = (await who.get(`/v1/calendar?${windowQuery}`)).items as Array<{
        id: string;
        heldHere?: boolean;
        state: string;
      }>;
      expect(items.find((i) => i.id === call.json().message.id)).toMatchObject({
        heldHere: true,
        state: 'agreed',
      });
      expect(items.find((i) => i.id === atStudio.json().message.id)?.heldHere).toBe(false);
      expect(items.find((i) => i.id === cafe.json().message.id)?.heldHere).toBe(false);
    }
    // What Caime writes into a connected calendar: whom by name, its join address for its place.
    const join = `https://caime.example/c/${fromLina}?seq=${call.json().message.seq}&join=${call.json().message.id}`;
    const events = await planEvents(t.ctx, sami.user.id, window);
    expect(events.get(`appointment-${call.json().message.id}@caime`)).toMatchObject({
      summary: 'Arabic lesson · Lina Farah',
      location: join,
      url: join,
      description: `With Lina Farah\n\nJoin in Caime: ${join}\n\nCaime keeps this up to date. Change it in Caime.`,
    });
    expect(events.get(`appointment-${cafe.json().message.id}@caime`)).toMatchObject({
      summary: 'Cafe lesson · Lina Farah',
      location: 'Cafe Riche, Talaat Harb',
      url: `https://caime.example/c/${fromLina}`,
    });
    // The feed her calendar app reads says the same.
    const { url } = await lina.post('/v1/calendar/feed');
    const res = await t.app.inject({ method: 'GET', url: new URL(url).pathname });
    const lines = res.body.replace(/\r\n /g, '').split('\r\n');
    const from = lines.indexOf(`UID:appointment-${call.json().message.id}@caime`);
    const ev = lines.slice(from, lines.indexOf('END:VEVENT', from));
    expect(ev).toEqual(
      expect.arrayContaining([
        'SUMMARY:Arabic lesson · Sami Tutor',
        `LOCATION:${join}`,
        `URL:${join}`,
      ]),
    );
  });

  it('an order of things sent on Caime says so', async () => {
    const placed = await lina.req('POST', `/v1/conversations/${fromLina}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'order_status',
        fields: {},
        order: { lines: [{ itemId: 'notes', quantity: 1 }], fulfilment: 'pickup' },
      },
    });
    expect(placed.statusCode, placed.body).toBe(201);
    expect(placed.json().message.payload.order).toMatchObject({ where: 'Caime' });
  });

  it('the page says where each is', async () => {
    const items = (await sami.get('/v1/me/booking')).items as Array<{ id: string; slug: string }>;
    const page = async (id: string) => {
      const slug = items.find((i) => i.id === id)?.slug;
      const res = await t.app.inject({
        url: `/@sami.tutor/${slug}`,
        headers: { accept: 'text/html' },
      });
      expect(res.statusCode).toBe(200);
      return res.body;
    };
    expect(await page('call')).toContain('A call on Caime');
    expect(await page('studio')).toContain('Studio');
    expect(await page('studio')).not.toContain('A call on Caime');
    expect(await page('cafe')).toContain('Cafe Riche, Talaat Harb');
    expect(await page('notes')).toContain('Sent on Caime');
    // Never a place anyone may not see.
    expect(await page('call')).not.toContain('4 Nile Street');
  });

  it('someone who booked without an account is told it’s a call, and a call to them says why it can’t ring yet', async () => {
    const start = await form('/v1/public/book', {
      host: 'sami.tutor',
      item: 'call',
      slot: '2026-10-21T06:00:00.000Z',
      name: 'Pia Visitor',
      email: 'pia@example.com',
      adult: 'on',
    });
    const claim = paramOf(start.headers.location as string, 'code');
    expect(claim, start.headers.location as string).toBeTruthy();
    await t.ctx.flush();
    const done = await form('/v1/public/book/confirm', {
      host: 'sami.tutor',
      item: 'call',
      claim: claim ?? '',
      code: codeFor('pia@example.com'),
    });
    expect(paramOf(done.headers.location as string, 'booked')).toBeTruthy();
    const conversations = await t.ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select('p.conversation_id')
      .where('u.email', '=', 'pia@example.com')
      .execute();
    const withPia = conversations[0]?.conversation_id as string;
    const card = (await sami.get(`/v1/conversations/${withPia}/messages`)).messages.find(
      (m: { kind: string }) => m.kind === 'kit',
    );
    expect(card.payload.booking.where).toBe('Caime');
    const before = mail.outbox.length;
    await sami.post(`/v1/messages/${card.id}/kit`, { to: 'confirmed' });
    await t.ctx.flush();
    const confirmed = mail.outbox.slice(before).find((m) => m.to === 'pia@example.com');
    expect(confirmed?.text).toContain('a call on Caime');
    expect(confirmed?.icalEvent?.content).toContain('A call on Caime with Sami Tutor');
    // Sami's Join rings nobody yet: he's told why, in his language.
    const rung = await sami.req('POST', `/v1/conversations/${withPia}/calls`, {
      kind: 'video',
      deviceId: uuidv4(),
    });
    expect(rung.statusCode).toBe(400);
    expect(rung.json().error.message).toBe(
      'Pia Visitor isn’t on Caime yet: a call reaches them once they join with their address.',
    );
  });

  it('at its time its people are told it’s starting, as for a meeting', async () => {
    const lesson = (await lina.get(`/v1/conversations/${fromLina}/messages`)).messages.find(
      (m: { kind: string; payload: { booking?: { itemId: string } } }) =>
        m.kind === 'kit' && m.payload.booking?.itemId === 'call',
    );
    t.clock.set('2026-10-20T06:00:05Z');
    await runDueJobs(t.ctx);
    for (const who of [sami, lina]) {
      const told = (await who.get('/v1/notifications')).notifications as Array<{
        title: string;
        data?: { path?: string };
      }>;
      const starting = told.find((n) => n.title === 'Starting now: Arabic lesson');
      expect(starting, who.user.displayName).toBeDefined();
      expect(starting?.data?.path).toContain(`join=${lesson.id}`);
    }
    // One at a place says nothing: nobody joins it here.
    const all = (await lina.get('/v1/notifications')).notifications as Array<{ title: string }>;
    expect(all.filter((n) => n.title.startsWith('Starting now'))).toHaveLength(1);
  });
});

describe('what a calendar event says (M16 F6)', () => {
  it('a meeting in its own space is named by its people, never by its title twice', async () => {
    t.clock.set('2026-10-19T06:00:00Z');
    const r = await sami.post('/v1/connections/requests', { toUserId: lina.user.id });
    await lina.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    const direct = (await sami.post('/v1/conversations', { kind: 'direct', userId: lina.user.id }))
      .conversation.id;
    const card = (
      await sami.post(`/v1/conversations/${direct}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Great Meeting test',
            start: { at: '2026-10-26T09:00:00.000Z', hasTime: true },
            durationMinutes: 30,
            place: 'Caime',
          },
        },
      })
    ).message;
    await lina.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    const { space } = await sami.post(`/v1/messages/${card.id}/guests`, {
      email: 'gus@example.com',
      name: 'Gus Guest',
    });
    const join = `https://caime.example/c/${space.conversationId}?seq=`;
    const event = (await planEvents(t.ctx, sami.user.id, window)).get(
      `meeting-${space.messageId}@caime`,
    );
    // Those who came together, by name.
    expect(event?.summary).toBe('Great Meeting test · Gus Guest and Lina Farah');
    expect(event?.description).toContain('With Gus Guest and Lina Farah');
    expect(event?.location).toContain(join);
    expect(event?.location).toBe(event?.url);
    // In the app's calendar too, its line names them.
    const mine = (await sami.get(`/v1/calendar?${windowQuery}`)).items.find(
      (i: { id: string }) => i.id === space.messageId,
    );
    expect(mine).toMatchObject({ heldHere: true, conversationTitle: 'Gus Guest and Lina Farah' });
  });

  it('a team reads its customer, a customer the organization, and nobody on the team is named', async () => {
    const noor = await signup(t, { displayName: 'Noor Haddad' });
    const org = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Dental',
        handle: 'nile.where',
        kind: 'clinic',
      })
    ).org;
    const convo = (await lina.post(`/v1/orgs/${org.id}/conversations`, {})).conversationId;
    const visit = (
      await noor.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: {
            title: 'Cleaning',
            start: { at: '2026-10-27T08:00:00.000Z', hasTime: true },
            // A business conversation holds no call yet: "Caime" there joins nothing.
            place: 'Caime',
          },
        },
      })
    ).message;
    await lina.post(`/v1/messages/${visit.id}/kit`, { to: 'confirmed' });
    const uid = `appointment-${visit.id}@caime`;
    const team = (await planEvents(t.ctx, noor.user.id, window)).get(uid);
    expect(team).toMatchObject({
      summary: 'Cleaning · Lina Farah',
      url: `https://caime.example/c/${convo}`,
    });
    expect(team?.description).toContain('With Lina Farah');
    expect(team?.description).toContain('Open in Caime');
    const customer = (await planEvents(t.ctx, lina.user.id, window)).get(uid);
    expect(customer).toMatchObject({ summary: 'Cleaning · Nile Dental' });
    expect(customer?.description).toContain('With Nile Dental');
    expect(JSON.stringify(customer)).not.toContain('Noor');
    for (const who of [noor, lina])
      expect(
        (await who.get(`/v1/calendar?${windowQuery}`)).items.find(
          (i: { id: string }) => i.id === visit.id,
        )?.heldHere,
      ).toBe(false);
  });
});
