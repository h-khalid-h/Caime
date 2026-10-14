/**
 * Stock that runs out (R60): a host counts what it sells by the piece, an order takes from the
 * count under its lock and is refused when fewer are left, and what an open order took comes
 * back, once, when it's cancelled, taken down or erased first.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { busSettled, type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let sami: Client; // another customer
let orgId: string;
let linaConvo: string;
let samiConvo: string;
const heard: BusMessage[] = [];

const KUNAFA = {
  id: 'kunafa',
  name: 'Kunafa',
  price: { value: 60, currency: 'EGP' },
  unit: 'each',
  minutes: null,
  capacity: 1,
  maxQuantity: 2,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const CLEANING = {
  id: 'cleaning',
  name: 'Cleaning',
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};

const save = (items: unknown[]) =>
  noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: HOURS,
    items,
    ordering: { fulfilment: ['pickup'], note: null },
  });
const order = (who: Client, conversationId: string, quantity: number) =>
  who.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: {
      kit: 'order_status',
      fields: {},
      order: { lines: [{ itemId: 'kunafa', quantity }] },
    },
  });
const kunafa = async (who: Client) =>
  (await who.get(`/v1/orgs/${orgId}`)).org.bookingItems.find(
    (i: { id: string }) => i.id === 'kunafa',
  );
const left = async () =>
  (
    await t.ctx.db
      .selectFrom('item_stock')
      .select('remaining')
      .where('host_id', '=', orgId)
      .where('item_id', '=', 'kunafa')
      .executeTakeFirst()
  )?.remaining;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-stock-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  t.ctx.bus.subscribe((m) => heard.push(m));
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  sami = await signup(t, { displayName: 'Sami Nasr' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Sweet Corner',
      handle: 'sweet.corner',
      kind: 'shop',
    })
  ).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  linaConvo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  samiConvo = (await sami.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('stock that runs out (R60)', () => {
  it('a count is set with the catalog, kept apart from it, and only on what’s sold by the piece', async () => {
    const set = await save([CLEANING, { ...KUNAFA, stock: 5 }]);
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json().items.find((i: { id: string }) => i.id === 'kunafa').stock).toBe(5);
    // The catalog keeps what the item is; the count is the counts' own.
    const row = await t.ctx.db
      .selectFrom('organizations')
      .select('booking_items')
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(row.booking_items)).not.toContain('stock');
    expect(await left()).toBe(5);
    // Something booked in time isn't counted.
    expect((await save([{ ...CLEANING, stock: 3 }, KUNAFA])).statusCode).toBe(400);
    // The team reads the count; a customer only once it limits an order (2 at most here).
    expect((await kunafa(omar)).stock).toBe(5);
    expect((await kunafa(lina)).stock).toBeUndefined();
  });

  it('an order takes from it; fewer left than asked is refused with the count', async () => {
    const a = await order(lina, linaConvo, 2);
    expect(a.statusCode, a.body).toBe(201);
    expect(await left()).toBe(3);
    const b = await order(sami, samiConvo, 2);
    expect(b.statusCode, b.body).toBe(201);
    expect(await left()).toBe(1);
    // One left: a customer sees it now, since it limits what they may order.
    expect((await kunafa(lina)).stock).toBe(1);
    const tooMany = await order(lina, linaConvo, 2);
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error).toMatchObject({
      code: 'sold_out',
      message: 'Kunafa: only one left.',
    });
    expect((await order(lina, linaConvo, 1)).statusCode).toBe(201);
    expect(await left()).toBe(0);
    const none = await order(sami, samiConvo, 1);
    expect(none.statusCode).toBe(409);
    expect(none.json().error.message).toBe('Kunafa is sold out.');
    expect((await kunafa(sami)).stock).toBe(0);
    // A refused order leaves nothing behind: no card, nothing taken.
    const cards = await t.ctx.db
      .selectFrom('order_stock')
      .select(({ fn }) => fn.sum<number>('quantity').as('n'))
      .where('host_id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(Number(cards.n)).toBe(5);
  });

  it('two orders for the last one at once: one is taken, one refused', async () => {
    await save([CLEANING, { ...KUNAFA, stock: 1 }]);
    const both = await Promise.all([order(lina, linaConvo, 1), order(sami, samiConvo, 1)]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await left()).toBe(0);
  });

  it('a save that leaves the count out keeps it; null stops counting', async () => {
    await save([CLEANING, { ...KUNAFA, stock: 4 }]);
    await order(lina, linaConvo, 1);
    // The form was opened at 4; the order since then isn't undone by saving it unchanged.
    const kept = await save([CLEANING, KUNAFA]);
    expect(kept.json().items.find((i: { id: string }) => i.id === 'kunafa').stock).toBe(3);
    const off = await save([CLEANING, { ...KUNAFA, stock: null }]);
    expect(off.json().items.find((i: { id: string }) => i.id === 'kunafa').stock).toBeUndefined();
    expect(await left()).toBeUndefined();
    // Not counted, anything within an order goes.
    expect((await order(lina, linaConvo, 2)).statusCode).toBe(201);
    // An item gone from the catalog takes its count with it.
    await save([CLEANING, { ...KUNAFA, stock: 2 }]);
    await save([CLEANING]);
    expect(await left()).toBeUndefined();
  });

  it('cancelled, an order gives back what it took, once; on its way, it’s spent', async () => {
    await save([CLEANING, { ...KUNAFA, stock: 4 }]);
    const a = (await order(lina, linaConvo, 2)).json().message.id;
    const b = (await order(sami, samiConvo, 2)).json().message.id;
    expect(await left()).toBe(0);
    heard.length = 0;
    await omar.post(`/v1/messages/${a}/kit`, { to: 'confirmed' });
    await omar.post(`/v1/messages/${a}/kit`, { to: 'cancelled' });
    expect(await left()).toBe(2);
    // The team's screens read the offer again (M15), as after a save.
    await busSettled(t, heard);
    expect(
      heard.some(
        (m) =>
          m.event.type === 'booking.changed' &&
          m.userIds.includes(omar.user.id) &&
          m.userIds.includes(noor.user.id),
      ),
    ).toBe(true);
    // Ready to collect: the stock is spent, and taking the card down later gives nothing back.
    await omar.post(`/v1/messages/${b}/kit`, { to: 'confirmed' });
    await omar.post(`/v1/messages/${b}/kit`, { to: 'ready' });
    expect((await sami.req('DELETE', `/v1/messages/${b}`)).statusCode).toBe(200);
    expect(await left()).toBe(2);
  });

  it('an open order taken down, or erased, gives back what it took', async () => {
    const rana = await signup(t, { displayName: 'Rana Aziz' });
    const ranaConvo = (await rana.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
    await save([CLEANING, { ...KUNAFA, stock: 4 }]);
    const a = (await order(lina, linaConvo, 2)).json().message.id;
    const b = (await order(rana, ranaConvo, 2)).json().message.id;
    expect(await left()).toBe(0);
    // Its sender deletes it for everyone while it's placed: back on the shelf.
    expect((await lina.req('DELETE', `/v1/messages/${a}`)).statusCode).toBe(200);
    expect(await left()).toBe(2);
    // The organization erases a customer's conversation on their request (R54): the same.
    const erased = await noor.req('DELETE', `/v1/orgs/${orgId}/conversations/${ranaConvo}`);
    expect(erased.statusCode, erased.body).toBe(200);
    expect(await left()).toBe(4);
    const held = await t.ctx.db
      .selectFrom('order_stock')
      .select('message_id')
      .where('message_id', 'in', [a, b])
      .execute();
    expect(held).toEqual([]);
  });

  it('a visitor reads sold out on the item’s page, with no way to order it', async () => {
    await save([CLEANING, { ...KUNAFA, stock: 1 }]);
    await order(lina, linaConvo, 1);
    const page = await t.app.inject({
      method: 'GET',
      url: '/o/sweet.corner/kunafa',
      headers: { accept: 'text/html' },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Sold out');
    expect(page.body).toContain('https://schema.org/OutOfStock');
    expect(page.body).not.toContain('kunafa%3Forder');
    // One back on the shelf: limited, and orderable again.
    await save([CLEANING, { ...KUNAFA, stock: 1 }]);
    const again = await t.app.inject({
      method: 'GET',
      url: '/o/sweet.corner/kunafa',
      headers: { accept: 'text/html' },
    });
    expect(again.body).toContain('Only one left');
    expect(again.body).toContain('https://schema.org/LimitedAvailability');
    expect(again.body).toContain('kunafa%3Forder');
  });

  it('a person counts their own the same way, and their export says how many are left', async () => {
    const mine = await noor.get('/v1/me/booking');
    const set = await noor.req('PUT', '/v1/me/booking', {
      booking: mine.booking,
      items: [{ ...KUNAFA, id: 'jam', name: 'Fig jam', audience: ['friend'], stock: 1 }],
      ordering: { fulfilment: ['pickup'], note: null },
    });
    expect(set.statusCode, set.body).toBe(200);
    expect((await noor.get('/v1/me/booking')).items[0].stock).toBe(1);
    // A friend sees the one left (it limits an order of up to two).
    const r = await noor.post('/v1/connections/requests', { toUserId: lina.user.id });
    await lina.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    await noor.post('/v1/relationships', {
      userId: lina.user.id,
      sphere: 'friend',
      role: 'friend',
    });
    const direct = (await lina.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    const profile = await lina.get(`/v1/people/${noor.user.id}`);
    expect(profile.ordering?.items[0]).toMatchObject({ id: 'jam', stock: 1 });
    const placed = await lina.req('POST', `/v1/conversations/${direct}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'order_status',
        fields: {},
        order: { lines: [{ itemId: 'jam', quantity: 1 }] },
      },
    });
    expect(placed.statusCode, placed.body).toBe(201);
    const exported = await noor.get('/v1/me/export');
    expect(exported.account.booking.items[0]).toMatchObject({ id: 'jam', stock: 0 });
  });
});
