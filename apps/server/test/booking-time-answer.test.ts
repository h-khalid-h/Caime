/**
 * Another time for a booking made before an account, answered from the mail (M16 F5c): the team
 * suggests another time for a page booker's appointment, the booker is asked by mail with a link
 * to the organization's page, and their yes or no there moves the card as theirs: the calendar
 * follows by mail, the team hears it, and the link says where it stands from then on.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client;
let orgId: string;
const mail = memoryMailer();
const HANDLE = 'nile.time';
const PUBLIC = 'https://caime.example';

function shell(): string {
  const at = mkdtempSync(join(tmpdir(), 'caime-time-answer-'));
  writeFileSync(
    join(at, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(at, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(at, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  return at;
}

const form = (url: string, fields: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });
const page = async (path: string) => {
  const res = await t.app.inject({ url: path, headers: { accept: 'text/html' } });
  expect(res.statusCode).toBe(200);
  return res.body;
};
const lastTo = (address: string, subject: string) =>
  mail.outbox.filter((m) => m.to === address && m.subject.startsWith(subject)).at(-1);
const card = (id: string) =>
  t.ctx.db
    .selectFrom('messages')
    .select(['payload', 'card_start_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();

/** A visitor books Cleaning at `slot` from the item's page, as anyone without an account does. */
async function bookFromPage(name: string, email: string, slot: string): Promise<string> {
  const start = await form('/v1/public/book', {
    host: HANDLE,
    item: 'cleaning',
    slot,
    name,
    email,
    adult: 'on',
  });
  expect(start.statusCode).toBe(303);
  const claim = new URL(start.headers.location as string, PUBLIC).searchParams.get('code') ?? '';
  await t.ctx.flush();
  const code = /^(\d{6}) /.exec(lastTo(email, '')?.subject ?? '')?.[1] ?? '';
  const done = await form('/v1/public/book/confirm', {
    host: HANDLE,
    item: 'cleaning',
    claim,
    code,
  });
  expect(done.statusCode).toBe(303);
  await t.ctx.flush();
  const row = await t.ctx.db
    .selectFrom('messages as m')
    .innerJoin('users as u', 'u.id', 'm.sender_id')
    .select('m.id')
    .where('u.email', '=', email)
    .where('m.kind', '=', 'kit')
    .executeTakeFirstOrThrow();
  return row.id;
}
const retime = (id: string, at: string) =>
  noor.req('POST', `/v1/messages/${id}/time`, { start: { at, hasTime: true } });
/** The answer link the last "New time" mail to `email` carries, as a path on the site. */
function answerLink(email: string): { path: string; claim: string } {
  const asked = lastTo(email, 'New time suggested');
  const url = /https:\/\/caime\.example(\S+)#time/.exec(asked?.text ?? '')?.[1] ?? '';
  return { path: url, claim: new URL(url, PUBLIC).searchParams.get('time') ?? '' };
}

beforeAll(async () => {
  dir = shell();
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: PUBLIC }, { mail });
  // A Monday morning in Cairo; the hours are Monday to Wednesday, nine to twelve.
  t.clock.set('2026-10-19T06:00:00Z');
  noor = await signup(t, { displayName: 'Noor Hassan', handle: 'noort', country: 'EG' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: HANDLE,
      kind: 'clinic',
    })
  ).org.id;
  const put = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: {
      timeZone: 'Africa/Cairo',
      slotMinutes: 30,
      days: [1, 2, 3].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
      leadMinutes: 60,
      horizonDays: 14,
    },
    items: [
      {
        id: 'cleaning',
        name: 'Cleaning',
        price: { value: 400, currency: 'EGP' },
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
  expect(put.statusCode, put.body).toBe(200);
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('another time, answered from the mail (M16 F5c)', () => {
  it('asks the booker by mail; their yes on the page books the new time as theirs', async () => {
    const id = await bookFromPage('Ana Costa', 'ana@example.com', '2026-10-20T07:00:00.000Z');
    expect((await noor.req('POST', `/v1/messages/${id}/kit`, { to: 'confirmed' })).statusCode).toBe(
      200,
    );
    await t.ctx.flush();
    const asked = t.ctx.metrics.publicBookings.get({ outcome: 'time_asked' });
    // Tuesday 10:00 in Cairo can't be kept: the clinic suggests Wednesday 11:00.
    const res = await retime(id, '2026-10-21T08:00:00.000Z');
    expect(res.statusCode, res.body).toBe(200);
    await t.ctx.flush();
    expect(t.ctx.metrics.publicBookings.get({ outcome: 'time_asked' })).toBe(asked + 1);
    const mailed = lastTo('ana@example.com', 'New time suggested: Cleaning with Nile Dental');
    expect(mailed?.text).toContain('Nile Dental suggests another time for your booking:');
    expect(mailed?.text).toMatch(/Wednesday,? 21 October 2026 at 11:00 \(Africa\/Cairo\)/);
    expect(mailed?.text).toMatch(/It was Tuesday,? 20 October 2026 at 10:00 \(Africa\/Cairo\)\./);
    // A question, not yet a time: nothing for their calendar until they say yes.
    expect(mailed?.icalEvent).toBeUndefined();
    const link = answerLink('ana@example.com');
    expect(link.path.startsWith(`/o/${HANDLE}?time=`)).toBe(true);

    // The organization's page, from the link: what was asked, a yes and a no.
    const asking = await page(link.path);
    expect(asking).toContain('id="time"');
    expect(asking).toContain('action="/v1/public/time"');
    expect(asking).toMatch(
      /Nile Dental suggests another time for Cleaning: Wednesday,? (21 October|October 21), 11:00( AM)?\./,
    );
    expect(asking).toMatch(/It was Tuesday,? (20 October|October 20), 10:00( AM)?\./);
    expect(asking).not.toContain('Noor Hassan');
    // Only the host's own page says it: another page with the claim says nothing of it.
    expect(await page(`/@noort?time=${encodeURIComponent(link.claim)}`)).not.toContain('id="time"');

    const yes = await form('/v1/public/time', { claim: link.claim, answer: 'yes', lang: 'en' });
    expect(yes.statusCode).toBe(303);
    const back = new URL(yes.headers.location as string, PUBLIC);
    expect(back.pathname).toBe(`/o/${HANDLE}`);
    expect(back.searchParams.get('time')).toBe(link.claim);
    expect(back.searchParams.get('lang')).toBe('en');
    await t.ctx.flush();
    const now = (await card(id)).payload as {
      state: string;
      sequence: number;
      history: Array<{ by: string }>;
    };
    expect(now.state).toBe('confirmed');
    expect(now.sequence).toBe(1);
    const booker = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'ana@example.com')
      .executeTakeFirstOrThrow();
    expect(now.history.at(-1)?.by).toBe(booker.id);
    // Their mail says it was their answer, and moves the event in their calendar.
    const booked = lastTo('ana@example.com', 'Confirmed: Cleaning with Nile Dental');
    expect(booked?.text).toContain('You said yes to the new time. Your booking with Nile Dental:');
    expect(booked?.icalEvent?.content).toContain('SEQUENCE:1');
    expect(booked?.icalEvent?.content).toContain('DTSTART:20261021T080000Z');
    expect(t.ctx.metrics.publicBookings.get({ outcome: 'time_accepted' })).toBe(1);
    // The link says it's booked from now on, and answering again changes nothing.
    expect(await page(link.path)).toMatch(/It’s booked with Nile Dental/);
    await form('/v1/public/time', { claim: link.claim, answer: 'no' });
    expect(((await card(id)).payload as { state: string }).state).toBe('confirmed');
  });

  it('a time changed since answers nothing; their no on the latest takes the booking off', async () => {
    const id = await bookFromPage('Bea Lima', 'bea@example.com', '2026-10-20T08:00:00.000Z');
    await noor.req('POST', `/v1/messages/${id}/kit`, { to: 'confirmed' });
    expect((await retime(id, '2026-10-21T07:00:00.000Z')).statusCode).toBe(200);
    await t.ctx.flush();
    const first = answerLink('bea@example.com');
    // The clinic thinks again before Bea answers: the first link no longer asks.
    expect((await retime(id, '2026-10-21T07:30:00.000Z')).statusCode).toBe(200);
    await t.ctx.flush();
    const latest = answerLink('bea@example.com');
    expect(latest.claim).not.toBe(first.claim);
    expect(await page(first.path)).toContain('the time has changed since');
    await form('/v1/public/time', { claim: first.claim, answer: 'yes' });
    expect((await card(id)).payload).toMatchObject({ state: 'requested', sequence: 2 });

    const no = await form('/v1/public/time', { claim: latest.claim, answer: 'no' });
    expect(no.statusCode).toBe(303);
    await t.ctx.flush();
    expect((await card(id)).payload).toMatchObject({ state: 'cancelled', sequence: 2 });
    const off = lastTo('bea@example.com', 'Cancelled: Cleaning with Nile Dental');
    expect(off?.text).toContain(
      'You said no to the new time, so your booking with Nile Dental is off:',
    );
    expect(off?.text).toContain(`To book another time: ${PUBLIC}/o/${HANDLE}`);
    expect(off?.icalEvent?.content).toContain('METHOD:CANCEL');
    expect(off?.icalEvent?.content).toContain('SEQUENCE:3');
    expect(await page(latest.path)).toContain('You said no, so Cleaning with Nile Dental is off.');
  });

  it('a link that was tampered with or has run out says so, and books nothing', async () => {
    expect(await page(`/o/${HANDLE}?time=${'x'.repeat(48)}`)).toContain('This link has run out.');
    const id = await bookFromPage('Cy Moss', 'cy@example.com', '2026-10-20T08:30:00.000Z');
    expect((await retime(id, '2026-10-21T08:30:00.000Z')).statusCode).toBe(200);
    await t.ctx.flush();
    const link = answerLink('cy@example.com');
    // Past the time it asked about, the link has run out.
    t.clock.set('2026-10-21T08:35:00Z');
    expect(await page(link.path)).toContain('This link has run out.');
    await form('/v1/public/time', { claim: link.claim, answer: 'yes' });
    expect(((await card(id)).payload as { state: string }).state).toBe('requested');
    t.clock.set('2026-10-19T06:00:00Z');
  });
});
