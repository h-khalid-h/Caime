/**
 * An organization's door (R53): its page asks to be written to, its team gets the link and a QR
 * code of it, and nobody else does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { qrPath, qrSvg } from '../src/lib/door';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let omar: Client;
let lina: Client;
let orgId: string;

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_URL: 'https://caime.example' });
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  omar = await signup(t, { displayName: 'Omar Farouk', handle: 'omar' });
  lina = await signup(t, { displayName: 'Lina Customer', handle: 'lina' });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
});
afterAll(async () => {
  await t.close();
});

describe('the QR code', () => {
  it('is a square of modules drawn as one path, with the finder pattern where it belongs', () => {
    const qr = qrPath('https://caime.example/o/nile.dental?write');
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.size % 4).toBe(1);
    // The top-left finder pattern: seven dark modules across the first row.
    expect(qr.path.startsWith('M0 0h7v1h-7z')).toBe(true);
    // Nothing drawn outside the square.
    for (const m of qr.path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      expect(Number(m[1]) + Number(m[3])).toBeLessThanOrEqual(qr.size);
      expect(Number(m[2])).toBeLessThan(qr.size);
    }
    const svg = qrSvg(qr);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`viewBox="-4 -4 ${qr.size + 8} ${qr.size + 8}"`);
    // Different content, a different code; the same content, the same code.
    expect(qrPath('https://caime.example/o/river.books?write').path).not.toBe(qr.path);
    expect(qrPath('https://caime.example/o/nile.dental?write')).toEqual(qr);
  });
});

describe('the door', () => {
  it('is the team’s to see: the link and its code, the same for everyone on it', async () => {
    const mine = await noor.get(`/v1/orgs/${orgId}/door`);
    expect(mine.url).toBe('https://caime.example/o/nile.dental?write');
    expect(mine.qr.size).toBeGreaterThanOrEqual(21);
    expect(mine.qr.path).toBe(qrPath(mine.url).path);
    const theirs = await omar.get(`/v1/orgs/${orgId}/door`);
    expect(theirs).toEqual(mine);
    const res = await noor.req('GET', `/v1/orgs/${orgId}/door`);
    // Asked again each time: the Book link beside it follows the catalog (C2a).
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('carries the way to book beside it once something can be booked from a page (C2a)', async () => {
    expect((await noor.get(`/v1/orgs/${orgId}/door`)).book).toBeNull();
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
    const hours = {
      timeZone: 'Africa/Cairo',
      slotMinutes: 30,
      days: [1, 2, 3].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
      leadMinutes: 60,
      horizonDays: 14,
    };
    // One public item (a connections-only one doesn't count): its own page, with the times.
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: hours,
      items: [
        item({ id: 'cleaning', name: 'Cleaning' }),
        item({ id: 'consult', name: 'Consultation', audience: 'connections' }),
      ],
    });
    const one = (await noor.get(`/v1/orgs/${orgId}/door`)).book;
    expect(one.url).toBe('https://caime.example/o/nile.dental/cleaning');
    expect(one.qr.path).toBe(qrPath(one.url).path);
    // Two: the organization's page, which lists them.
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: hours,
      items: [
        item({ id: 'cleaning', name: 'Cleaning' }),
        item({ id: 'whitening', name: 'Whitening' }),
      ],
    });
    expect((await omar.get(`/v1/orgs/${orgId}/door`)).book.url).toBe(
      'https://caime.example/o/nile.dental',
    );
    // No hours, nothing to book: none.
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: null, items: [] });
    expect((await noor.get(`/v1/orgs/${orgId}/door`)).book).toBeNull();
  });

  it('is not a customer’s, nor a stranger’s', async () => {
    const res = await lina.req('GET', `/v1/orgs/${orgId}/door`);
    expect(res.statusCode).toBe(404);
  });
});
