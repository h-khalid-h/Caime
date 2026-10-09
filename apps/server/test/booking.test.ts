import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let orgId: string;
let convo: string;

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday, 09:00–12:00 Cairo (UTC+3 in October 2026: 06:00–09:00Z).
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const window = 'from=2026-10-01T00:00:00Z&to=2026-10-03T00:00:00Z';

beforeAll(async () => {
  t = await createTestApp();
  // Thursday 1 October 2026, 05:00Z: 08:00 in Cairo.
  t.clock.set('2026-10-01T05:00:00Z');
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('bookings (R51)', () => {
  it('its owner or admins set bookable hours; everyone sees them on its page; off is null', async () => {
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.booking).toBeNull();
    // Nothing to book from without hours: a day and time are written as for any card.
    expect(await lina.get(`/v1/orgs/${orgId}/slots?${window}`)).toEqual({
      timeZone: null,
      slotMinutes: null,
      item: null,
      slots: [],
    });
    // Only the owner or an admin sets them.
    expect(
      (await omar.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS })).statusCode,
    ).toBe(403);
    expect(
      (await lina.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS })).statusCode,
    ).toBe(404);
    // And only hours that make sense.
    for (const bad of [
      { ...HOURS, timeZone: 'Mars/Olympus' },
      { ...HOURS, slotMinutes: 25 },
      { ...HOURS, days: [{ weekday: 1, start: '12:00', end: '09:00' }] },
      {
        ...HOURS,
        days: [
          { weekday: 1, start: '09:00', end: '12:00' },
          { weekday: 1, start: '13:00', end: '14:00' },
        ],
      },
      { ...HOURS, days: [] },
      { ...HOURS, horizonDays: 400 },
    ])
      expect(
        (await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: bad })).statusCode,
      ).toBe(400);
    const set = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS });
    expect(set.json().booking).toEqual(HOURS);
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.booking).toEqual(HOURS);
    const audited = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', orgId)
      .where('action', 'like', 'org.booking%')
      .execute();
    expect(audited.map((a) => a.action)).toEqual(['org.booking_set']);
  });

  it('the open slots are the hours cut to size, after the lead, less what’s booked', async () => {
    const open = await lina.get(`/v1/orgs/${orgId}/slots?${window}`);
    expect(open.timeZone).toBe('Africa/Cairo');
    expect(open.slotMinutes).toBe(30);
    // 08:00 in Cairo now, an hour's lead: from 09:00 (06:00Z) to the last at 11:30 (08:30Z);
    // Friday has none.
    expect(open.slots).toEqual([
      '2026-10-01T06:00:00.000Z',
      '2026-10-01T06:30:00.000Z',
      '2026-10-01T07:00:00.000Z',
      '2026-10-01T07:30:00.000Z',
      '2026-10-01T08:00:00.000Z',
      '2026-10-01T08:30:00.000Z',
    ]);
    // Lina books one: an appointment card at that slot, which the team confirms.
    const booked = (
      await lina.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: { title: 'Cleaning', start: { at: '2026-10-01T07:00:00Z', hasTime: true } },
        },
      })
    ).message;
    expect(booked.payload.state).toBe('requested');
    const after = (await omar.get(`/v1/orgs/${orgId}/slots?${window}`)).slots;
    expect(after).not.toContain('2026-10-01T07:00:00.000Z');
    expect(after).toHaveLength(5);
    // It's a booking for the team, asked; confirmed once Omar confirms it.
    const bookings = (await omar.get(`/v1/orgs/${orgId}/calendar?${window}`)).items;
    expect(bookings).toMatchObject([
      { messageId: booked.id, customer: { displayName: 'Lina Farah' }, state: 'requested' },
    ]);
    await omar.post(`/v1/messages/${booked.id}/kit`, { to: 'confirmed' });
    expect((await omar.get(`/v1/orgs/${orgId}/calendar?${window}`)).items[0].state).toBe(
      'confirmed',
    );
    // Cancelled, the slot is open again.
    await omar.post(`/v1/messages/${booked.id}/kit`, { to: 'cancelled' });
    expect((await lina.get(`/v1/orgs/${orgId}/slots?${window}`)).slots).toHaveLength(6);
    // Off: nothing to book from, and the page says nothing.
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: null });
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.booking).toBeNull();
    expect((await lina.get(`/v1/orgs/${orgId}/slots?${window}`)).slots).toEqual([]);
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS });
  });
});

const CLEANING = {
  id: 'cleaning',
  name: 'Cleaning',
  price: { value: 400, currency: 'EGP' },
  unit: 'minutes',
  minutes: 45,
  capacity: 2,
  maxQuantity: 2,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const CONSULT = {
  id: 'consult',
  name: 'Consultation',
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'connections',
  providers: [] as string[],
  askTopic: true,
};
describe('the catalog (R58)', () => {
  const book = (
    who: Client,
    conversationId: string,
    fields: Record<string, unknown>,
    booking: Record<string, unknown> | undefined,
  ) =>
    who.req('POST', `/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'appointment', fields, ...(booking ? { booking } : {}) },
    });
  const at = (hhmm: string) => `2026-10-01T${hhmm}:00.000Z`;
  const times = (view: { slots: string[] }) => view.slots.map((s) => s.slice(11, 16));

  it('items are set with the hours; a provider is someone on the team', async () => {
    CONSULT.providers = [omar.user.id];
    const bad = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: [{ ...CONSULT, providers: [lina.user.id] }],
    });
    expect(bad.statusCode).toBe(403);
    const set = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: [CLEANING, CONSULT],
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().items).toHaveLength(2);
    // A customer sees what they may book; the team the whole catalog.
    expect(
      (await lina.get(`/v1/orgs/${orgId}`)).org.bookingItems.map((i: { id: string }) => i.id),
    ).toEqual(['cleaning', 'consult']);
    expect((await omar.get(`/v1/orgs/${orgId}`)).org.bookingItems).toHaveLength(2);
  });

  it('slots are the item’s length on the grid, full only at its capacity; the card keeps the price', async () => {
    const open = await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=cleaning`);
    expect(open.slotMinutes).toBe(45);
    expect(open.item).toMatchObject({ id: 'cleaning', name: 'Cleaning', maxQuantity: 2 });
    // 09:00 Cairo on, every half hour, each 45 minutes, the last ending by 12:00.
    expect(times(open)).toEqual(['06:00', '06:30', '07:00', '07:30', '08:00']);
    // For two: both chairs at 09:00, 800 EGP, until 09:45.
    const booked = await book(
      lina,
      convo,
      { title: 'Cleaning', start: { at: at('06:00'), hasTime: true } },
      { itemId: 'cleaning', quantity: 2 },
    );
    expect(booked.statusCode, booked.body).toBe(201);
    expect(booked.json().message.payload.booking).toMatchObject({
      itemId: 'cleaning',
      name: 'Cleaning',
      quantity: 2,
      price: { value: 800, currency: 'EGP' },
      endAt: at('06:45'),
      providerId: null,
    });
    // Full at 09:00, and 09:30 would run into it; 10:00 on is open.
    expect(times(await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=cleaning`))).toEqual([
      '07:00',
      '07:30',
      '08:00',
    ]);
    const taken = await book(
      lina,
      convo,
      { title: 'Cleaning', start: { at: at('06:00'), hasTime: true } },
      { itemId: 'cleaning', quantity: 1 },
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('slot_taken');
    const many = await book(
      lina,
      convo,
      { title: 'Cleaning', start: { at: at('07:00'), hasTime: true } },
      { itemId: 'cleaning', quantity: 3 },
    );
    expect(many.statusCode).toBe(403);
    expect(many.json().error.code).toBe('not_bookable');
    // An appointment written without the catalog (R51) holds its time outright.
    const plain = await book(
      lina,
      convo,
      { title: 'Question', start: { at: at('07:30'), hasTime: true } },
      undefined,
    );
    expect(plain.statusCode).toBe(201);
    expect(times(await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=cleaning`))).toEqual([
      '08:00',
    ]);
  });

  it('who does it is decided when the team confirms, kept from the customer, changed in a tap', async () => {
    const asked = await book(
      lina,
      convo,
      { title: 'Tax question', start: { at: at('08:30'), hasTime: true } },
      { itemId: 'consult', quantity: 1 },
    );
    expect(asked.statusCode, asked.body).toBe(201);
    const id = asked.json().message.id;
    const mine = () =>
      omar
        .get(`/v1/orgs/${orgId}/calendar?${window}`)
        .then((r) => r.items.find((i: { messageId: string }) => i.messageId === id));
    expect((await mine()).booking.providerId).toBeNull();
    await omar.post(`/v1/messages/${id}/kit`, { to: 'confirmed' });
    expect((await mine()).booking).toMatchObject({
      providerId: omar.user.id,
      providerName: 'Omar Farouk',
    });
    // The customer's copy names nobody.
    const theirs = await lina.req('GET', `/v1/conversations/${convo}/messages`);
    const card = theirs.json().messages.find((m: { id: string }) => m.id === id);
    expect(card.payload.booking.providerId).toBeNull();
    expect(card.payload.booking.providerName).toBeNull();
    expect(theirs.body).not.toContain('Omar');
    // Omar is taken at 11:30 now: the consultation is nobody else's to do, so it isn't offered.
    expect(times(await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=consult`))).not.toContain(
      '08:30',
    );
    // The team changes it; the customer can't.
    expect(
      (await lina.req('POST', `/v1/messages/${id}/booking/provider`, { userId: null })).statusCode,
    ).toBe(403);
    const off = await noor.req('POST', `/v1/messages/${id}/booking/provider`, { userId: null });
    expect(off.statusCode).toBe(200);
    expect((await mine()).booking.providerId).toBeNull();
  });

  it('a person takes bookings too: by relationship, a friend’s rate, a stranger’s public item', async () => {
    const LESSON = {
      id: 'lesson',
      name: 'Arabic lesson',
      price: { value: 300, currency: 'EGP' },
      unit: 'minutes',
      minutes: 60,
      capacity: 1,
      maxQuantity: 1,
      audience: ['friend'],
      providers: null,
      askTopic: false,
    };
    const CHAT = {
      id: 'chat',
      name: 'A quick chat',
      price: null,
      unit: 'minutes',
      minutes: 30,
      capacity: 1,
      maxQuantity: 1,
      audience: 'public',
      providers: null,
      askTopic: true,
    };
    expect(
      (
        await noor.req('PUT', '/v1/me/booking', {
          booking: HOURS,
          items: [{ ...LESSON, providers: [omar.user.id] }],
        })
      ).statusCode,
    ).toBe(403);
    const set = await noor.req('PUT', '/v1/me/booking', { booking: HOURS, items: [LESSON, CHAT] });
    expect(set.statusCode, set.body).toBe(200);
    expect((await noor.get('/v1/me/booking')).items).toHaveLength(2);
    // Omar is a friend: both; Lina, a stranger: the public one.
    await noor.post('/v1/relationships', {
      userId: omar.user.id,
      sphere: 'friend',
      role: 'friend',
    });
    const toOmar = (await omar.get(`/v1/people/${noor.user.id}`)).booking;
    expect(toOmar.hours).toEqual(HOURS);
    expect(toOmar.items.map((i: { id: string }) => i.id)).toEqual(['lesson', 'chat']);
    expect(
      (await lina.get(`/v1/people/${noor.user.id}`)).booking.items.map((i: { id: string }) => i.id),
    ).toEqual(['chat']);
    // An hour's lesson on the half-hour grid, after the hour's lead.
    const open = await omar.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`);
    expect(times(open)).toEqual(['06:00', '06:30', '07:00', '07:30', '08:00']);
    expect(
      (await lina.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`)).slots,
    ).toEqual([]);
    // Omar books one in their conversation; it's on Noor's calendar and the slot is gone.
    const direct = (await omar.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    const lesson = await book(
      omar,
      direct,
      { title: 'Arabic lesson', start: { at: at('06:00'), hasTime: true } },
      { itemId: 'lesson', quantity: 1 },
    );
    expect(lesson.statusCode, lesson.body).toBe(201);
    expect(lesson.json().message.payload.booking.price).toEqual({ value: 300, currency: 'EGP' });
    expect(times(await omar.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`))).toEqual(
      ['07:00', '07:30', '08:00'],
    );
    const cal = await noor.get(`/v1/calendar?${window}`);
    expect(cal.items.map((i: { id: string }) => i.id)).toContain(lesson.json().message.id);
    // A stranger may book the public item (a message request), not the friends' one.
    const asStranger = (
      await lina.post('/v1/conversations', { kind: 'direct', userId: noor.user.id })
    ).conversation.id;
    const refused = await book(
      lina,
      asStranger,
      { title: 'Arabic lesson', start: { at: at('07:00'), hasTime: true } },
      { itemId: 'lesson', quantity: 1 },
    );
    expect(refused.statusCode).toBe(403);
    const chat = await book(
      lina,
      asStranger,
      { title: 'About your talk', start: { at: at('07:00'), hasTime: true } },
      { itemId: 'chat', quantity: 1 },
    );
    expect(chat.statusCode, chat.body).toBe(201);
    expect(chat.json().message.payload.booking.name).toBe('A quick chat');
  });
});

describe('orders from the catalog (R60)', () => {
  const SHAWARMA = {
    id: 'shawarma',
    name: 'Shawarma',
    price: { value: 85, currency: 'EGP' },
    unit: 'each',
    minutes: null,
    capacity: 1,
    maxQuantity: 5,
    audience: 'public',
    providers: null,
    askTopic: false,
  };
  const order = (
    who: Client,
    conversationId: string,
    ask: unknown,
    fields: Record<string, unknown> = {},
  ) =>
    who.req('POST', `/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'order_status', fields, ...(ask ? { order: ask } : {}) },
    });

  it('a host takes orders: items by the piece, how they’re had, kept with the catalog', async () => {
    const before = (await noor.get(`/v1/orgs/${orgId}`)).org;
    const set = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: [...before.bookingItems, SHAWARMA],
      ordering: { fulfilment: ['pickup', 'delivery'], note: 'Ready in 20 minutes' },
    });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json().ordering).toEqual({
      fulfilment: ['pickup', 'delivery'],
      note: 'Ready in 20 minutes',
    });
    // Left out, ordering stays; an ordered item names nobody to do it.
    const again = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: [...before.bookingItems, SHAWARMA],
    });
    expect(again.json().ordering).toMatchObject({ fulfilment: ['pickup', 'delivery'] });
    expect(
      (
        await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
          booking: HOURS,
          items: [{ ...SHAWARMA, providers: [omar.user.id] }],
        })
      ).statusCode,
    ).toBe(400);
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.ordering).toMatchObject({
      note: 'Ready in 20 minutes',
    });
    // No slots for something ordered by the piece.
    expect((await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=shawarma`)).slots).toEqual([]);
  });

  it('an order is fixed on the card: its lines, its total, a number, how it’s had', async () => {
    const placed = await order(lina, convo, {
      lines: [{ itemId: 'shawarma', quantity: 2 }],
      fulfilment: 'delivery',
    });
    expect(placed.statusCode, placed.body).toBe(201);
    const card = placed.json().message.payload;
    expect(card.order).toEqual({
      lines: [
        {
          itemId: 'shawarma',
          name: 'Shawarma',
          quantity: 2,
          price: { value: 170, currency: 'EGP' },
        },
      ],
      total: { value: 170, currency: 'EGP' },
      fulfilment: 'delivery',
    });
    expect(card.fields.summary).toBe('2 × Shawarma');
    expect(card.fields.amount).toEqual({ value: 170, currency: 'EGP' });
    expect(card.fields.reference).toMatch(/^[A-Z2-9]{6}$/);
    expect(card.state).toBe('placed');
    // The team confirms; it's ready to collect, then collected.
    const id = placed.json().message.id;
    await omar.post(`/v1/messages/${id}/kit`, { to: 'confirmed' });
    expect((await omar.post(`/v1/messages/${id}/kit`, { to: 'ready' })).message.payload.state).toBe(
      'ready',
    );
    expect(
      (await lina.post(`/v1/messages/${id}/kit`, { to: 'delivered' })).message.payload.state,
    ).toBe('delivered');
  });

  it('refuses a booked item, too many, a way not offered; by hand it needs a number', async () => {
    const no = async (ask: unknown, fields?: Record<string, unknown>) => {
      const r = await order(lina, convo, ask, fields);
      return [r.statusCode, r.json().error?.code];
    };
    expect(await no({ lines: [{ itemId: 'cleaning', quantity: 1 }] })).toEqual([
      403,
      'not_bookable',
    ]);
    expect(await no({ lines: [{ itemId: 'shawarma', quantity: 6 }] })).toEqual([
      403,
      'not_bookable',
    ]);
    expect(await no({ lines: [{ itemId: 'nope', quantity: 1 }] })).toEqual([403, 'not_bookable']);
    expect(await no(null)).toEqual([400, 'invalid_request']);
    const byHand = await order(lina, convo, null, { reference: 'INV-7', summary: 'Two coffees' });
    expect(byHand.statusCode).toBe(201);
    // Ordering off: nothing to order.
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: (await noor.get(`/v1/orgs/${orgId}`)).org.bookingItems,
      ordering: null,
    });
    expect(await no({ lines: [{ itemId: 'shawarma', quantity: 1 }] })).toEqual([
      403,
      'not_bookable',
    ]);
  });

  it('a person takes orders too, and the profile says what this viewer may order', async () => {
    const CAKE = {
      ...SHAWARMA,
      id: 'cake',
      name: 'Orange cake',
      audience: ['friend'],
      maxQuantity: 2,
    };
    const mine = await noor.get('/v1/me/booking');
    const set = await noor.req('PUT', '/v1/me/booking', {
      booking: mine.booking,
      items: [...mine.items, CAKE],
      ordering: { fulfilment: ['pickup'], note: null },
    });
    expect(set.statusCode, set.body).toBe(200);
    expect(
      (await omar.get(`/v1/people/${noor.user.id}`)).ordering.items.map(
        (i: { id: string }) => i.id,
      ),
    ).toEqual(['cake']);
    expect((await lina.get(`/v1/people/${noor.user.id}`)).ordering).toBeNull();
    const direct = (await omar.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    const placed = await order(omar, direct, { lines: [{ itemId: 'cake', quantity: 2 }] });
    expect(placed.statusCode, placed.body).toBe(201);
    expect(placed.json().message.payload.order.fulfilment).toBe('pickup');
    expect(
      (
        await order(omar, direct, {
          lines: [{ itemId: 'cake', quantity: 1 }],
          fulfilment: 'delivery',
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('what a booker may see or say (review 2026-10-09)', () => {
  it('a customer names nobody on the team, and no item shows team ids to one', async () => {
    const items = (await lina.get(`/v1/orgs/${orgId}`)).org.bookingItems as Array<
      Record<string, unknown>
    >;
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => 'providers' in i)).toBe(false);
    const named = await lina.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Consult', start: { at: '2026-10-07T07:00:00.000Z', hasTime: true } },
        booking: { itemId: 'consult', providerId: omar.user.id },
      },
    });
    expect(named.statusCode).toBe(403);
    expect(named.json().error.message).toBe('Who does it is for the team to say.');
  });

  it('a person’s free and busy times are theirs: a stranger gets no hours without an item', async () => {
    const bare = await lina.get(`/v1/people/${noor.user.id}/slots?${window}`);
    expect(bare).toEqual({ timeZone: null, slotMinutes: null, item: null, slots: [] });
    expect(
      (await lina.req('GET', `/v1/people/${noor.user.id}/slots?${window}&item=chat`)).statusCode,
    ).toBe(200);
  });
});
