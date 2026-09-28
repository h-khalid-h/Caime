import { crc32, deflateSync } from 'node:zlib';
import { type BrowserContext, expect, type Page } from '@playwright/test';

/** Cookie-authenticated writes need this header (docs/SECURITY.md, CSRF). */
export const CLIENT = { 'x-caime-client': 'web' };
export const PASSWORD = 'a long enough passphrase';
/** The E2E server's operator tokens (playwright.config.ts): plans, and /metrics. */
export const ADMIN_TOKEN = 'e2e-operator-token-0123456789abcdef';
export const METRICS_TOKEN = 'e2e-metrics-token-0123456789abcdef';
/** The DNS stand-in (e2e/dns-stub.mjs) organizations verify their domains against. */
export const DNS_STUB = `http://127.0.0.1:${Number(process.env.E2E_DNS_STUB_PORT ?? 8797)}`;

/** Publish a TXT record where the server will look for it. */
export async function publishTxt(name: string, values: string[]) {
  const res = await fetch(`${DNS_STUB}/records`, {
    method: 'POST',
    body: JSON.stringify({ name, values }),
  });
  expect(res.ok).toBe(true);
}

/** A page that records every script error, console error and failed API call. */
export async function newPerson(
  context: BrowserContext,
): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/v1/'))
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return { page, errors };
}

/** Text that is on screen (tabs stay mounted, so hidden copies exist on phones). */
export const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/**
 * Signs up and finishes onboarding through the API, sharing the context's cookies, for tests
 * about what comes after sign-up (the sign-up screens have their own test).
 */
let signups = 0;

export async function apiSignUp(
  context: BrowserContext,
  displayName: string,
  handle: string,
  opts: { birthDate?: string } = {},
) {
  const res = await context.request.post('/v1/auth/signup', {
    // Each from a network of its own (a documentation range), as people sign up: the server
    // takes only a few sign-ups an hour from one address, and the suite makes more than that.
    headers: { ...CLIENT, 'x-forwarded-for': `198.51.100.${(signups++ % 250) + 1}` },
    data: {
      email: `${handle}@example.com`,
      password: PASSWORD,
      displayName,
      handle,
      birthDate: opts.birthDate ?? '1990-12-31',
      country: 'EG',
      timeZone: 'UTC',
      client: 'web',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const { user } = (await res.json()) as { user: { id: string; handle: string } };
  const done = await context.request.patch('/v1/me', {
    headers: CLIENT,
    data: { onboarded: true },
  });
  expect(done.ok(), await done.text()).toBe(true);
  return user;
}

/** A small photo to upload: a PNG shading from one colour to another, corner to corner. */
export function photo(width: number, height: number, from: number[], to: number[]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const k = (x + y) / (width + height - 2);
      for (let c = 0; c < 3; c++)
        rows[y * (width * 3 + 1) + 1 + x * 3 + c] = Math.round(
          (from[c] ?? 0) + ((to[c] ?? 0) - (from[c] ?? 0)) * k,
        );
    }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
