/**
 * Booking before an account (R97 (1), block C): a visitor on an organization's item page picks
 * a time, proves an address with a code, and the booking lands as a provisional person's
 * appointment request to the team.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { productMetrics } from '../src/lib/product-metrics';
import { CLAIM_MS, openClaim, sealClaim } from '../src/lib/public-booking';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client;
let orgId: string;
const mail = memoryMailer();

/** The app's shell, as the export leaves it: the pages are written into it (R44). */
function shell(): string {
  const at = mkdtempSync(join(tmpdir(), 'caime-public-booking-'));
  writeFileSync(
    join(at, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(at, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(at, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  return at;
}
const HANDLE = 'nile.booking';
const PAGE = `/o/${HANDLE}/cleaning`;

const form = (url: string, fields: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });

const page = async (query = '') => {
  const res = await t.app.inject({ url: `${PAGE}${query}`, headers: { accept: 'text/html' } });
  expect(res.statusCode).toBe(200);
  return res.body;
};

const codeFor = (address: string) => {
  const sent = mail.outbox.filter((m) => m.to === address).at(-1);
  expect(sent, `a code to ${address}`).toBeDefined();
  return /^(\d{6}) /.exec(sent?.subject ?? '')?.[1] ?? '';
};

const paramOf = (location: string | undefined, name: string) =>
  new URL(location ?? '', 'http://x').searchParams.get(name);

beforeAll(async () => {
  dir = shell();
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' }, { mail });
  // The clock on a Monday morning in Cairo; the hours below are Monday to Wednesday.
  t.clock.set('2026-10-19T06:00:00Z');
  noor = await signup(t, { displayName: 'Noor Hassan', handle: 'noorb', country: 'EG' });
  const org = await noor.post('/v1/orgs', {
    country: 'EG',
    name: 'Nile Dental',
    handle: HANDLE,
    kind: 'clinic',
  });
  orgId = org.org.id;
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
  await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: {
      timeZone: 'Africa/Cairo',
      slotMinutes: 30,
      days: [1, 2, 3].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
      leadMinutes: 60,
      horizonDays: 14,
    },
    items: [
      item({
        id: 'cleaning',
        name: 'Cleaning',
        minutes: 30,
        price: { value: 400, currency: 'EGP' },
      }),
      item({ id: 'consult', name: 'Consultation', audience: 'connections' }),
    ],
  });
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('booking before an account (R97 (1))', () => {
  it('the item page lists the week’s open times by day, with the form, and pages the week', async () => {
    const html = await page();
    expect(html).toContain('id="book"');
    expect(html).toContain('action="/v1/public/book"');
    // Monday 09:00 Cairo is 06:00Z; the lead time (an hour from 06:00Z) leaves 10:00 Cairo on.
    expect(html).not.toContain('value="2026-10-19T06:00:00.000Z"');
    expect(html).toContain('value="2026-10-19T07:00:00.000Z"');
    expect(html).toContain('value="2026-10-21T08:30:00.000Z"');
    expect(html).not.toContain('value="2026-10-21T09:00:00.000Z"');
    // Thursday has no hours; the next week is a page away while the horizon reaches it.
    expect(html).not.toContain('2026-10-22T');
    expect(html).toContain(`href="${PAGE}?from=2026-10-26#book"`);
    const later = await page('?from=2026-10-26');
    expect(later).toContain('value="2026-10-26T07:00:00.000Z"');
    expect(later).toContain(`href="${PAGE}?from=2026-10-19#book"`);
    // An item not everyone may book has no form: the page offers joining, as before.
    const consult = await t.app.inject({ url: `/o/${HANDLE}/consultation` });
    expect(consult.statusCode).toBe(200);
    expect(consult.body).not.toContain('id="book"');
  });

  it('a time, a name and an address get a code; the code books as the provisional person', async () => {
    const start = await form('/v1/public/book', {
      host: HANDLE,
      item: 'cleaning',
      slot: '2026-10-20T07:00:00.000Z',
      name: 'Ana Costa',
      email: 'Ana@example.com',
      adult: 'on',
      lang: 'en',
    });
    expect(start.statusCode).toBe(303);
    const claim = paramOf(start.headers.location as string, 'code');
    expect(claim).toBeTruthy();
    expect(start.headers.location).toContain('lang=en');
    await t.ctx.flush();
    const code = codeFor('ana@example.com');
    expect(code).toMatch(/^\d{6}$/);
    // The code step, on the page, names the address and the time.
    const asking = await page(`?code=${claim}`);
    expect(asking).toContain('action="/v1/public/book/confirm"');
    expect(asking).toContain('ana@example.com');
    // The host's zone (Cairo, UTC+3), in the page's language's own order.
    expect(asking).toMatch(/Tuesday,? (20 October|October 20), 10:00/);
    // A wrong code counts and stays on the step.
    const wrong = await form('/v1/public/book/confirm', {
      host: HANDLE,
      item: 'cleaning',
      claim: claim as string,
      code: '000000',
    });
    expect(wrong.statusCode).toBe(303);
    expect(paramOf(wrong.headers.location as string, 'book-error')).toBe('wrong_code');
    expect(paramOf(wrong.headers.location as string, 'code')).toBe(claim);
    expect(await page(`?code=${claim}&book-error=wrong_code`)).toContain('isn’t right');
    const done = await form('/v1/public/book/confirm', {
      host: HANDLE,
      item: 'cleaning',
      claim: claim as string,
      code,
    });
    expect(done.statusCode).toBe(303);
    expect(paramOf(done.headers.location as string, 'booked')).toBe(claim);
    const booked = await page(`?booked=${claim}`);
    expect(booked).toContain('Nile Dental confirms in your conversation');
    expect(booked).toContain('ana@example.com');
    await t.ctx.flush();
    // The team sees the request from the provisional customer, as any booking.
    const inbox = await noor.get(`/v1/orgs/${orgId}/inbox`);
    const thread = inbox.threads.find((th: any) => th.customer?.displayName === 'Ana Costa');
    expect(thread).toBeDefined();
    const messages = await noor.get(`/v1/conversations/${thread.conversationId}/messages`);
    const card = messages.messages.find((m: any) => m.kind === 'kit');
    expect(card.payload.kit).toBe('appointment');
    expect(card.payload.state).toBe('requested');
    expect(card.payload.booking).toMatchObject({ itemId: 'cleaning', name: 'Cleaning' });
    expect(card.payload.fields.start.at).toBe('2026-10-20T07:00:00.000Z');
    const person = await t.ctx.db
      .selectFrom('users')
      .select(['kind', 'display_name', 'email'])
      .where('id', '=', card.senderId)
      .executeTakeFirstOrThrow();
    expect(person).toEqual({
      kind: 'provisional',
      display_name: 'Ana Costa',
      email: 'ana@example.com',
    });
    // Nothing of the team is on any of the visitor's pages (R15).
    for (const html of [booked, asking]) {
      expect(html).not.toContain('Noor Hassan');
      expect(html).not.toContain(noor.user.id);
    }
    // The time is held now: the page no longer offers it.
    expect(await page()).not.toContain('value="2026-10-20T07:00:00.000Z"');
    // The same claim again books nothing twice.
    const again = await form('/v1/public/book/confirm', {
      host: HANDLE,
      item: 'cleaning',
      claim: claim as string,
      code,
    });
    expect(paramOf(again.headers.location as string, 'book-error')).toBe('code_expired');
  });

  it('a taken time is said, a known account is sent to sign in, and the age box is required', async () => {
    const taken = await form('/v1/public/book', {
      host: HANDLE,
      item: 'cleaning',
      slot: '2026-10-20T07:00:00.000Z',
      name: 'Bea',
      email: 'bea@example.com',
      adult: 'on',
    });
    expect(paramOf(taken.headers.location as string, 'book-error')).toBe('slot_taken');
    expect(await page('?book-error=slot_taken')).toContain('just taken');
    const mailsToNoor = () => mail.outbox.filter((m) => m.to === noor.user.email).length;
    const before = mailsToNoor();
    const account = await form('/v1/public/book', {
      host: HANDLE,
      item: 'cleaning',
      slot: '2026-10-20T07:30:00.000Z',
      name: 'Noor',
      email: noor.user.email as string,
      adult: 'on',
    });
    expect(paramOf(account.headers.location as string, 'book-error')).toBe('account');
    expect(await page('?book-error=account')).toContain('Sign in to book');
    // No code went to the account's address: nobody is mailed behind their account (R93).
    await t.ctx.flush();
    expect(mailsToNoor()).toBe(before);
    const young = await form('/v1/public/book', {
      host: HANDLE,
      item: 'cleaning',
      slot: '2026-10-20T07:30:00.000Z',
      name: 'Kid',
      email: 'kid@example.com',
      adult: '',
    });
    expect(paramOf(young.headers.location as string, 'book-error')).toBe('adult');
    const stale = await page('?code=not-a-claim-at-all-really-not-one');
    expect(stale).toContain('took too long');
  });

  it('a claim is sealed to its purpose and runs out', async () => {
    const claim = {
      v: 1 as const,
      orgId,
      itemId: 'cleaning',
      at: '2026-10-20T08:00:00.000Z',
      personId: noor.user.id,
      name: 'X',
      email: 'x@example.com',
      e: t.ctx.now().getTime() + CLAIM_MS,
    };
    const token = await sealClaim(t.ctx, claim);
    expect(await openClaim(t.ctx, token)).toEqual(claim);
    expect(await openClaim(t.ctx, `${token.slice(0, -2)}AA`)).toBeNull();
    t.clock.advance(CLAIM_MS + 1000);
    expect(await openClaim(t.ctx, token)).toBeNull();
    t.clock.advance(-(CLAIM_MS + 1000));
  });

  it('without a mailer the page offers no form, only joining, and a post is refused', async () => {
    const plainDir = shell();
    const plain = await createTestApp({ WEB_DIR: plainDir, PUBLIC_URL: 'https://caime.example' });
    try {
      plain.clock.set('2026-10-19T06:00:00Z');
      const owner = await signup(plain, { displayName: 'Omar', handle: 'omarb', country: 'EG' });
      const org = await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Plain Clinic',
        handle: 'plain.booking',
        kind: 'clinic',
      });
      await owner.req('PUT', `/v1/orgs/${org.org.id}/booking`, {
        booking: {
          timeZone: 'Africa/Cairo',
          slotMinutes: 30,
          days: [1, 2].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
          leadMinutes: 60,
          horizonDays: 14,
        },
        items: [
          {
            id: 'visit',
            name: 'Visit',
            price: null,
            unit: 'minutes',
            minutes: 30,
            capacity: 1,
            maxQuantity: 1,
            audience: 'public',
            providers: null,
            askTopic: false,
          },
        ],
      });
      const res = await plain.app.inject({
        method: 'POST',
        url: '/v1/public/book',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({
          host: 'plain.booking',
          item: 'visit',
          slot: '2026-10-20T07:00:00.000Z',
          name: 'Ana',
          email: 'ana2@example.com',
          adult: 'on',
        }).toString(),
      });
      expect(paramOf(res.headers.location as string, 'book-error')).toBe('no_mail');
      // Nothing proves an address here, so the page never offers a form that could only end
      // in "not available": its Book goes the way it went before, through joining.
      const html = (await plain.app.inject({ url: '/o/plain.booking/visit' })).body;
      expect(html).not.toContain('id="book"');
      expect(html).not.toContain('action="/v1/public/book"');
      expect(html).toContain('/sign-in?link=');
    } finally {
      await plain.close();
      rmSync(plainDir, { recursive: true, force: true });
    }
  });
});

/** A visitor books a time from the page, through the code, as a customer without an account. */
async function bookAsVisitor(name: string, email: string, slot: string): Promise<void> {
  const start = await form('/v1/public/book', {
    host: HANDLE,
    item: 'cleaning',
    slot,
    name,
    email,
    adult: 'on',
  });
  const claim = paramOf(start.headers.location as string, 'code');
  expect(claim, String(start.headers.location)).toBeTruthy();
  await t.ctx.flush();
  const done = await form('/v1/public/book/confirm', {
    host: HANDLE,
    item: 'cleaning',
    claim: claim as string,
    code: codeFor(email),
  });
  expect(paramOf(done.headers.location as string, 'booked')).toBe(claim);
  await t.ctx.flush();
}

/** The team's view of the card a customer sent, by the customer's name. */
async function cardOf(customer: string): Promise<{ id: string; conversationId: string }> {
  const inbox = await noor.get(`/v1/orgs/${orgId}/inbox`);
  const thread = inbox.threads.find((th: any) => th.customer?.displayName === customer);
  expect(thread, customer).toBeDefined();
  const messages = await noor.get(`/v1/conversations/${thread.conversationId}/messages`);
  const card = messages.messages.find((m: any) => m.kind === 'kit');
  return { id: card.id, conversationId: thread.conversationId };
}

describe('after booking before an account (C1b)', () => {
  it('the team confirms and the booker hears by mail with the event; a cancel takes it off', async () => {
    await bookAsVisitor('Bea Lima', 'bea@example.com', '2026-10-21T07:00:00.000Z');
    const card = await cardOf('Bea Lima');
    const before = mail.outbox.length;
    expect(
      (await noor.req('POST', `/v1/messages/${card.id}/kit`, { to: 'confirmed' })).statusCode,
    ).toBe(200);
    await t.ctx.flush();
    const confirmed = mail.outbox.slice(before).find((m) => m.to === 'bea@example.com');
    expect(confirmed?.kind).toBe('booking');
    expect(confirmed?.subject).toBe('Confirmed: Cleaning with Nile Dental');
    // The time on the host's clock, as the page showed it, and the way into the conversation.
    expect(confirmed?.text).toMatch(/Wednesday,? 21 October 2026 at 10:00 \(Africa\/Cairo\)/);
    expect(confirmed?.text).toContain(
      `https://caime.example/sign-up?link=${encodeURIComponent(`/c/${card.conversationId}`)}`,
    );
    expect(confirmed?.text).toContain('Hi Bea,');
    // Nothing of the team in it (R15): the organization speaks.
    expect(confirmed?.text).not.toContain('Noor');
    expect(confirmed?.icalEvent?.method).toBe('REQUEST');
    expect(confirmed?.icalEvent?.content).toContain('METHOD:REQUEST');
    expect(confirmed?.icalEvent?.content).toContain(`UID:appointment-${card.id}@caime`);
    expect(confirmed?.icalEvent?.content).toContain('DTSTART:20261021T070000Z');
    expect(confirmed?.icalEvent?.content).toContain('DTEND:20261021T073000Z');
    const middle = mail.outbox.length;
    expect(
      (await noor.req('POST', `/v1/messages/${card.id}/kit`, { to: 'cancelled' })).statusCode,
    ).toBe(200);
    await t.ctx.flush();
    const cancelled = mail.outbox.slice(middle).find((m) => m.to === 'bea@example.com');
    expect(cancelled?.subject).toBe('Cancelled: Cleaning with Nile Dental');
    expect(cancelled?.icalEvent?.method).toBe('CANCEL');
    expect(cancelled?.icalEvent?.content).toContain('STATUS:CANCELLED');
    expect(cancelled?.icalEvent?.content).toContain('SEQUENCE:1');
    // Each step was counted by its outcome, from a fixed set.
    expect(t.ctx.metrics.publicBookings.get({ outcome: 'code_sent' })).toBeGreaterThanOrEqual(2);
    expect(t.ctx.metrics.publicBookings.get({ outcome: 'booked' })).toBeGreaterThanOrEqual(2);
    expect(t.ctx.metrics.publicBookings.get({ outcome: 'wrong_code' })).toBeGreaterThanOrEqual(1);
    expect(t.ctx.metrics.publicBookings.get({ outcome: 'account' })).toBeGreaterThanOrEqual(1);
  });

  it('a customer with an account is told in Caime, never by mail', async () => {
    const karim = await signup(t, { displayName: 'Karim Adel', country: 'EG' });
    const { conversationId } = await karim.post(`/v1/orgs/${orgId}/conversations`);
    await karim.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: 'karim-booking-0001',
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Cleaning', start: { at: '2026-10-21T07:30:00.000Z', hasTime: true } },
        booking: { itemId: 'cleaning' },
      },
    });
    await t.ctx.flush();
    const card = await cardOf('Karim Adel');
    const before = mail.outbox.filter((m) => m.to === karim.user.email).length;
    await noor.req('POST', `/v1/messages/${card.id}/kit`, { to: 'confirmed' });
    await t.ctx.flush();
    expect(mail.outbox.filter((m) => m.to === karim.user.email)).toHaveLength(before);
  });

  it('signing up with a booker’s address asks its code, and the booking comes with the account', async () => {
    const ask = {
      email: 'ana@example.com',
      password: 'correct horse battery',
      displayName: 'Ana Costa',
      handle: 'ana.costa',
      birthDate: '1992-04-03',
      country: 'EG',
      timeZone: 'Africa/Cairo',
      locale: 'en-US',
      client: 'native',
    };
    const provisional = await t.ctx.db
      .selectFrom('users')
      .select(['id', 'kind'])
      .where('email', '=', ask.email)
      .executeTakeFirstOrThrow();
    expect(provisional.kind).toBe('provisional');
    // Typing the address claims nothing: the code goes to it (review 2026-10-17 §2 H1).
    const asked = await t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload: ask });
    expect(asked.statusCode).toBe(409);
    expect(asked.json().error.code).toBe('email_code_needed');
    expect(asked.json().token).toBeUndefined();
    await t.ctx.flush();
    const code = codeFor(ask.email);
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...ask, emailCode: code === '000000' ? '111111' : '000000' },
    });
    expect(wrong.json().error.code).toBe('wrong_code');
    const ana = await signup(t, {
      displayName: ask.displayName,
      handle: ask.handle,
      email: ask.email,
      birthDate: ask.birthDate,
      country: 'EG',
      timeZone: 'Africa/Cairo',
      emailCode: code,
    });
    expect(ana.user.id).toBe(provisional.id);
    expect(ana.user.kind).toBe('human');
    // Their booking with Nile Dental is theirs, in their own inbox.
    const theirs = await cardOf('Ana Costa');
    const inbox = await ana.get('/v1/inbox?view=all');
    expect(inbox.conversations.some((i: any) => i.id === theirs.conversationId)).toBe(true);
    // The door's numbers (REVIEW §14, advantage 3): two bookings before an account this week.
    const now = await productMetrics(t.ctx, 7);
    expect(now.growth.door.booked).toBe(2);
    // A month on, of the two who first booked that way 30 to 60 days back, one joined within
    // thirty days of it.
    const was = t.ctx.now();
    t.clock.set(new Date(was.getTime() + 31 * 86_400_000).toISOString());
    try {
      const later = await productMetrics(t.ctx, 30);
      expect(later.growth.door.booked).toBe(0);
      expect(later.growth.door.joined).toMatchObject({ count: 1, of: 2 });
    } finally {
      t.clock.set(was.toISOString());
    }
  });
});
