/**
 * What an organization's conversations came to (M16 H4): bookings made and where they stand,
 * orders and what they come to, what the organization was paid, which customers bought and which
 * came back, what was booked or ordered most and when customers write, with the period before to
 * compare. For its owner and admins on Business; counts and sums only, never a word or a name of
 * a customer's. The operator's metrics count the same cards for advantage 2 (REVIEW §14).
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'admin-token-for-the-org-insights-test-0123456789';
const DAY = 86_400_000;
const CHECKUP = {
  id: 'checkup',
  name: 'Check-up',
  price: { value: 400, currency: 'EGP' },
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const BRUSH = {
  id: 'brush',
  name: 'Toothbrush',
  price: { value: 50, currency: 'EGP' },
  unit: 'each',
  minutes: null,
  capacity: 1,
  maxQuantity: 5,
  audience: 'public',
  providers: null,
  askTopic: false,
};
// Open every day, all day, so the test finds a time whenever it runs.
const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '23:30' })),
  leadMinutes: 0,
  horizonDays: 14,
};
const CASH = { id: 'cash', kind: 'cash', label: 'Cash', audience: 'public' };

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // books, and pays
let rana: Client; // orders, and pays an invoice
let sami: Client; // a customer from before, who writes again
let dina: Client; // asks, and is offered a time she hasn't taken
let orgId: string;
let linaConvo: string;
let ranaConvo: string;
let samiConvo: string;

const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const card = async (c: Client, conversationId: string, payload: Record<string, unknown>) => {
  const res = await c.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().message.id as string;
};
const move = async (c: Client, id: string, to: string) => {
  const res = await c.req('POST', `/v1/messages/${id}/kit`, { to });
  expect(res.statusCode, res.body).toBe(200);
};
const insights = async (c: Client, days = 7) =>
  c.req('GET', `/v1/orgs/${orgId}/insights?days=${days}`);
/** Ten days ago: what the database's clock wrote is moved there by hand. */
const tenDaysAgo = () => new Date(Date.now() - 10 * DAY);
const messageBack = (id: string) =>
  t.ctx.db.updateTable('messages').set({ created_at: tenDaysAgo() }).where('id', '=', id).execute();
const threadBack = (conversationId: string) =>
  t.ctx.db
    .updateTable('business_threads')
    .set({ created_at: tenDaysAgo() })
    .where('conversation_id', '=', conversationId)
    .execute();

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  // Messages take the database's clock: start this one at the same time.
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  rana = await signup(t, { displayName: 'Rana Said' });
  sami = await signup(t, { displayName: 'Sami Aziz' });
  dina = await signup(t, { displayName: 'Dina Nour' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  // On Business, where insights are: plans have their own tests.
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  const saved = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: HOURS,
    items: [CHECKUP, BRUSH],
    ordering: { fulfilment: ['pickup'], note: null },
    payments: { methods: [CASH], note: null },
  });
  expect(saved.statusCode, saved.body).toBe(200);

  // Sami has been its customer for a while: his conversation and its first words are ten days
  // old, and so are an appointment and what he paid then.
  samiConvo = (await sami.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  const first = (await say(sami, samiConvo, 'Do you take new patients?')).message.id as string;
  await messageBack(first);
  await threadBack(samiConvo);
  const before = await card(omar, samiConvo, {
    kit: 'appointment',
    fields: {
      title: 'Consult',
      start: { at: new Date(Date.now() + DAY).toISOString(), hasTime: true },
    },
  });
  await messageBack(before);
  const paidBefore = await card(omar, samiConvo, {
    kit: 'payment_request',
    fields: { direction: 'ask', amount: { value: 200, currency: 'EGP' } },
  });
  await move(sami, paidBefore, 'sent');
  t.clock.set(new Date(Date.now() - 10 * DAY).toISOString());
  await move(omar, paidBefore, 'paid');
  t.clock.set(new Date().toISOString());
  await say(sami, samiConvo, 'Back again, for a cleaning this time.');

  // Lina books two check-ups from the catalog: the team confirms one, she cancels the other;
  // the team asks her to pay for it, and she does.
  linaConvo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await say(lina, linaConvo, 'Hello, I need a check-up.');
  const window = `from=${new Date().toISOString()}&to=${new Date(Date.now() + 3 * DAY).toISOString()}`;
  const slots = (await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=checkup`))
    .slots as string[];
  expect(slots.length).toBeGreaterThan(1);
  const book = (at: string) =>
    card(lina, linaConvo, {
      kit: 'appointment',
      fields: { title: 'Check-up', start: { at, hasTime: true } },
      booking: { itemId: 'checkup', quantity: 1 },
    });
  const kept = await book(slots[0] as string);
  const dropped = await book(slots[1] as string);
  await move(omar, kept, 'confirmed');
  await move(lina, dropped, 'cancelled');
  const pay = await card(omar, linaConvo, {
    kit: 'payment_request',
    fields: { direction: 'ask', amount: { value: 400, currency: 'EGP' }, note: 'Check-up' },
  });
  await move(lina, pay, 'sent');
  await move(noor, pay, 'paid');

  // Rana orders three toothbrushes, and one more she cancels; the team proposes a time it
  // hasn't confirmed, and invoices her in dollars, which she pays.
  ranaConvo = (await rana.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await say(rana, ranaConvo, 'Hi, do you sell toothbrushes?');
  await card(rana, ranaConvo, {
    kit: 'order_status',
    fields: {},
    order: { lines: [{ itemId: 'brush', quantity: 3 }] },
  });
  const undone = await card(rana, ranaConvo, {
    kit: 'order_status',
    fields: {},
    order: { lines: [{ itemId: 'brush', quantity: 1 }] },
  });
  await move(rana, undone, 'cancelled');
  await card(omar, ranaConvo, {
    kit: 'appointment',
    fields: {
      title: 'Whitening',
      start: { at: new Date(Date.now() + 2 * DAY).toISOString(), hasTime: true },
    },
  });
  const invoice = await card(omar, ranaConvo, {
    kit: 'invoice',
    fields: { reference: 'INV-7', amount: { value: 75, currency: 'USD' } },
  });
  await move(rana, invoice, 'paid');

  // Dina asks; the team offers her a time she hasn't taken: a booking asked for, not bought.
  const dinaConvo = (await dina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await say(dina, dinaConvo, 'Is there anything on Saturday?');
  await card(omar, dinaConvo, {
    kit: 'appointment',
    fields: {
      title: 'Saturday visit',
      start: { at: new Date(Date.now() + 4 * DAY).toISOString(), hasTime: true },
    },
  });
});

afterAll(async () => {
  await t.close();
});

describe('what the conversations came to (M16 H4)', () => {
  it('counts bookings, orders and money, and who bought and came back, for owners and admins', async () => {
    const res = await insights(noor);
    expect(res.statusCode, res.body).toBe(200);
    const c = res.json().insights.commerce;
    // Four asked for: two from the catalog (one confirmed, one cancelled), two the team offered.
    expect(c.bookings).toEqual({
      made: 4,
      confirmed: 1,
      cancelled: 1,
      requested: 2,
      fromCatalog: 2,
    });
    // Two orders, one cancelled: the other's three toothbrushes.
    expect(c.orders).toEqual({
      placed: 2,
      cancelled: 1,
      value: [{ value: 150, currency: 'EGP' }],
    });
    // Paid: Lina's Pay card and Rana's invoice, each in its currency, the largest first.
    expect(c.paid).toEqual([
      { value: 400, currency: 'EGP' },
      { value: 75, currency: 'USD' },
    ]);
    // All four wrote; Lina and Rana bought (a time offered and not taken isn't bought); Sami
    // was a customer before.
    expect(c.customers).toEqual({ wrote: 4, bought: 2, returning: 1 });
    // Booked or ordered most: by name, an order's line by its quantity, nothing cancelled.
    expect(c.top).toEqual([
      { name: 'Toothbrush', count: 3 },
      { name: 'Check-up', count: 1 },
    ]);
    // The ten days before: Sami's appointment and what he paid then.
    expect(c.previous).toEqual({
      bookings: 1,
      orders: 0,
      paid: [{ value: 200, currency: 'EGP' }],
    });
    // When customers wrote, on Cairo's clock: eight messages, all in this hour (or the last).
    expect(c.timeZone).toBe('Africa/Cairo');
    expect(c.byHour).toHaveLength(24);
    expect(c.byWeekday).toHaveLength(7);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(c.byHour)).toBe(8);
    expect(sum(c.byWeekday)).toBe(8);
    const cairo = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      hourCycle: 'h23',
    });
    const hour = Number(cairo.format(new Date()));
    expect((c.byHour[hour] ?? 0) + (c.byHour[(hour + 23) % 24] ?? 0)).toBe(8);
    // Counts and sums only: nobody's words or names.
    const said = JSON.stringify(res.json());
    for (const word of ['Lina', 'Rana', 'Sami', 'Dina', 'Hello', 'toothbrushes?', 'INV-7'])
      expect(said).not.toContain(word);
  });

  it('a period of thirty days takes in the ten-day-old ones', async () => {
    const c = (await insights(noor, 30)).json().insights.commerce;
    expect(c.bookings.made).toBe(5);
    expect(c.paid).toEqual([
      { value: 600, currency: 'EGP' },
      { value: 75, currency: 'USD' },
    ]);
    expect(c.customers.returning).toBe(0);
  });

  it('are the owner’s and admins’ alone', async () => {
    // Omar is on the team, but doesn't run it; to a customer they aren't there at all.
    expect((await insights(omar)).statusCode).toBe(403);
    expect((await insights(lina)).statusCode).toBe(404);
  });

  it('give the operator advantage 2’s number: bookings and orders made in conversations', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics?days=7',
      headers: { authorization: `Bearer ${ADMIN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().metrics.business.commerce).toEqual({
      bookings: 4,
      orders: 2,
      organizations: 1,
    });
  });
});
