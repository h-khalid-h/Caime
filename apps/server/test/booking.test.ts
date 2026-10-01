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
  });
});
