/**
 * An organization's door on its own website (R117, M17 I17a): `/o/<handle>/widget` is its page
 * made compact for a frame, framed only by the domain it proved (and what's under it), never the
 * app, kept out of every index; its forms and the way to an item stay in the frame at every step,
 * while every other link opens on Caime in a new tab. What starts there is counted as from its
 * website, and its setup's door hands it the one line to paste.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { productMetrics } from '../src/lib/product-metrics';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const HANDLE = 'nile.widget';
const WIDGET = `/o/${HANDLE}/widget`;
/** The item's own address, from its name (R61). */
const ITEM = `/o/${HANDLE}/teeth-cleaning`;

let t: TestApp;
let dir: string;
let noor: Client;
let orgId: string;
const mail = memoryMailer();

/** The app's shell, as the export leaves it: the pages are written into it (R44). */
function shell(): string {
  const at = mkdtempSync(join(tmpdir(), 'caime-widget-'));
  writeFileSync(
    join(at, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(at, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(at, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  return at;
}

const get = (url: string) => t.app.inject({ url, headers: { accept: 'text/html' } });

const form = (url: string, fields: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });

const paramOf = (location: string | undefined, name: string) =>
  new URL(location ?? '', 'http://x').searchParams.get(name);

const codeFor = (address: string) =>
  /^(\d{6}) /.exec(mail.outbox.filter((m) => m.to === address).at(-1)?.subject ?? '')?.[1] ?? '';

beforeAll(async () => {
  dir = shell();
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' }, { mail });
  noor = await signup(t, { displayName: 'Noor Hassan', handle: 'noorwidget', country: 'EG' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: HANDLE,
      kind: 'clinic',
    })
  ).org.id;
  await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: {
      timeZone: 'Africa/Cairo',
      slotMinutes: 30,
      days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
      leadMinutes: 60,
      horizonDays: 14,
    },
    items: [
      {
        id: 'cleaning',
        name: 'Teeth cleaning',
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
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('an organization’s door on its own website (M17 I17a)', () => {
  it('is nobody’s to frame until the organization proves a domain', async () => {
    const res = await get(WIDGET);
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect((await noor.get(`/v1/orgs/${orgId}/door`)).widget).toBeNull();
    // An item asked for framed is its plain page, which nobody frames.
    const item = await get(`${ITEM}?embed=1`);
    expect(item.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('is framed by its verified domain alone, compact, out of every index, never the app', async () => {
    await sql`update organizations set domain = 'nile-dental.example', verified_at = now()
      where id = ${orgId}`.execute(t.ctx.db);
    const res = await get(WIDGET);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain(
      'frame-ancestors https://nile-dental.example https://*.nile-dental.example;',
    );
    expect(res.headers['x-frame-options']).toBeUndefined();
    const html = res.body;
    expect(html).not.toContain('<script src=');
    expect(html).toContain('<meta name="robots" content="noindex">');
    // Links open on Caime in a new tab; the form and the way to an item stay in the frame.
    expect(html).toContain('<base target="_blank">');
    expect(html).toContain(
      '<form class="form" method="post" action="/v1/public/write" target="_self">',
    );
    expect(html).toContain('<input type="hidden" name="embed" value="1">');
    expect(html).toContain(`href="${ITEM}?embed=1" target="_self"`);
    // Its own page is unchanged: nobody frames it.
    const own = await get(`/o/${HANDLE}`);
    expect(own.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(own.body).not.toContain('<base target');
  });

  it('keeps every step of writing in the frame, and counts it as from its website', async () => {
    const started = await form('/v1/public/write', {
      org: HANDLE,
      name: 'Karim',
      email: 'karim@visitor.example',
      message: 'Do you see children on Saturdays?',
      embed: '1',
    });
    expect(started.statusCode).toBe(303);
    const location = started.headers.location as string;
    expect(location.startsWith(`${WIDGET}?write-code=`)).toBe(true);
    expect(location.endsWith('#write')).toBe(true);
    const step = await get(location.replace(/#.*$/, ''));
    expect(step.body).toContain(
      '<form class="form" method="post" action="/v1/public/write/confirm" target="_self">',
    );
    await t.ctx.flush();
    const done = await form('/v1/public/write/confirm', {
      org: HANDLE,
      claim: paramOf(location, 'write-code') ?? '',
      code: codeFor('karim@visitor.example'),
      embed: '1',
    });
    expect(done.headers.location).toMatch(new RegExp(`^${WIDGET}\\?written=`));
    const sent = await t.ctx.db
      .selectFrom('messages')
      .select('client_id')
      .where('body', '=', 'Do you see children on Saturdays?')
      .executeTakeFirstOrThrow();
    expect(sent.client_id).toMatch(/^public-write:site:/);
    const metrics = await productMetrics(t.ctx, 7);
    expect(metrics.growth.door.written).toBe(1);
    expect(metrics.growth.door.fromSites).toBe(1);
  });

  it('books an item in the frame, every step back to the framed page', async () => {
    const res = await get(`${ITEM}?embed=1`);
    expect(res.headers['content-security-policy']).toContain(
      'frame-ancestors https://nile-dental.example',
    );
    expect(res.body).toContain(
      '<form class="form" method="post" action="/v1/public/book" target="_self">',
    );
    expect(res.body).toContain(`href="${WIDGET}" target="_self"`);
    const slot = /name="slot" value="([^"]+)"/.exec(res.body)?.[1];
    expect(slot).toBeTruthy();
    const started = await form('/v1/public/book', {
      host: HANDLE,
      item: 'cleaning',
      slot: slot ?? '',
      name: 'Laila',
      email: 'laila@visitor.example',
      adult: 'on',
      embed: '1',
    });
    expect(started.headers.location).toMatch(
      new RegExp(`^${ITEM.replace('.', '\\.')}\\?embed=1&code=`),
    );
  });

  it('hands its setup one line to paste, framed by its own domain', async () => {
    const door = (await noor.get(`/v1/orgs/${orgId}/door`)).widget;
    expect(door).toEqual({
      url: `https://caime.example${WIDGET}`,
      domain: 'nile-dental.example',
      snippet: `<iframe src="https://caime.example${WIDGET}" title="Nile Dental" loading="lazy" style="width:100%;max-width:440px;height:640px;border:0"></iframe>`,
    });
  });
});
