/**
 * The site's other machine-read files: `security.txt` (RFC 9116) says where a weakness is reported,
 * in which languages, until when, from the canonical address on every name the service answers;
 * `change-password` sends a password manager to Settings · Security.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let mailed: TestApp;
let plain: TestApp;

beforeAll(async () => {
  mailed = await createTestApp({
    PUBLIC_URL: 'https://caime.example',
    CONTACT_EMAIL: 'hello@caime.example',
    MAIL_DOMAIN: 'caime.example',
    MAIL_PROVIDER: 'postmark',
    MAIL_PROVIDER_TOKEN: 'test-postmark-token',
    MAIL_WEBHOOK_SECRET: 'a-webhook-secret-of-length',
    MAIL_STAFF_HANDLE: 'caime.staff',
  });
  plain = await createTestApp({
    PUBLIC_URL: 'https://caime.example',
    CONTACT_EMAIL: 'hello@caime.example',
  });
  mailed.clock.set('2026-10-25T21:30:00Z');
});
afterAll(async () => {
  await mailed.close();
  await plain.close();
});

const get = (t: TestApp, url: string, host = 'caime.example') =>
  t.app.inject({ method: 'GET', url, headers: { accept: 'text/html', host } });

describe('the site’s well-known files', () => {
  it('security.txt says where to write, until when, from its canonical address', async () => {
    const res = await get(mailed, '/.well-known/security.txt');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.body).toBe(
      [
        'Contact: mailto:security@caime.example',
        'Contact: mailto:hello@caime.example',
        'Expires: 2027-04-23T00:00:00.000Z',
        'Preferred-Languages: en, ar, fr, tr',
        'Canonical: https://caime.example/.well-known/security.txt',
        'Policy: https://caime.example/security',
        '',
      ].join('\n'),
    );
    // On another of the service's names it answers too, never sent to the canonical one.
    const elsewhere = await get(mailed, '/.well-known/security.txt', 'old.caime.example');
    expect(elsewhere.statusCode).toBe(200);
    expect(elsewhere.body).toContain('Canonical: https://caime.example/.well-known/security.txt');
  });

  it('names only the contact address where Caime’s own mail routes nothing', async () => {
    const res = await get(plain, '/.well-known/security.txt');
    expect(res.body.match(/^Contact: .*$/gm)).toEqual(['Contact: mailto:hello@caime.example']);
  });

  it('sends a password manager to Settings · Security', async () => {
    const res = await get(plain, '/.well-known/change-password');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://caime.example/settings/security');
  });
});
