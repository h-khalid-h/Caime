/**
 * An organization's branches as booking hosts (R92): an item is done at one of its places, for
 * its customers or everyone, on that place's own days when it has them; a booking copies the
 * branch's address into the card's "Where"; a branch let go of, or kept for the team alone,
 * leaves the items that pointed at it done wherever.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let lina: Client; // a customer
let orgId: string;
let convo: string;
let maadi: string;
let zamalek: string;
let store: string;

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday, 09:00–12:00 Cairo (06:00–09:00Z in October 2026).
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const item = (id: string, placeId: string | null) => ({
  id,
  name: id === 'maadi-cleaning' ? 'Deep cleaning' : 'Cleaning',
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
  placeId,
});
const window = 'from=2026-10-01T00:00:00Z&to=2026-10-03T00:00:00Z';
const times = (r: { slots: string[] }) => r.slots.map((s) => s.slice(0, 16));

beforeAll(async () => {
  // The web app's shell, for the organization's public page.
  const dir = mkdtempSync(join(tmpdir(), 'caime-branches-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div></body></html>',
  );
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  // Thursday 1 October 2026, 05:00Z: 08:00 in Cairo.
  t.clock.set('2026-10-01T05:00:00Z');
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  const { places } = await noor
    .req('PUT', `/v1/orgs/${orgId}/places`, {
      places: [
        {
          kind: 'branch',
          label: 'Maadi',
          country: 'EG',
          city: 'Cairo',
          street: '9 Road 233',
          orgAudience: 'customers',
        },
        {
          kind: 'branch',
          label: 'Zamalek',
          country: 'EG',
          city: 'Cairo',
          street: '26 July Street',
          orgAudience: 'everyone',
        },
        { kind: 'other', label: 'Store room', country: 'EG', city: 'Giza', orgAudience: 'team' },
      ],
    })
    .then((r) => r.json());
  [maadi, zamalek, store] = places.map((p: { id: string }) => p.id);
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('branches as booking hosts (R92)', () => {
  it('an item is done at a branch customers may see, never one kept for the team', async () => {
    const team = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: [item('stored', store)],
    });
    expect(team.statusCode).toBe(400);
    const hoursAtTeam = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: { ...HOURS, placeHours: [{ placeId: store, days: HOURS.days }] },
      items: [],
    });
    expect(hoursAtTeam.statusCode).toBe(400);
    // A person's own catalog names only their own places (M16 F6), and has no branches' days.
    const mine = await noor.req('PUT', '/v1/me/booking', {
      booking: HOURS,
      items: [item('mine', maadi)],
    });
    expect(mine.statusCode).toBe(400);
    const myDays = await noor.req('PUT', '/v1/me/booking', {
      booking: { ...HOURS, placeHours: [{ placeId: maadi, days: HOURS.days }] },
      items: [],
    });
    expect(myDays.statusCode).toBe(403);

    const saved = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      // Maadi opens on Friday afternoons only.
      booking: {
        ...HOURS,
        placeHours: [{ placeId: maadi, days: [{ weekday: 5, start: '14:00', end: '15:00' }] }],
      },
      items: [item('maadi-cleaning', maadi), item('cleaning', null), item('zamalek', zamalek)],
    });
    expect(saved.statusCode).toBe(200);
  });

  it('a branch’s item is booked on its days, and the card says where', async () => {
    const atMaadi = await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=maadi-cleaning`);
    expect(times(atMaadi)).toEqual(['2026-10-02T11:00', '2026-10-02T11:30']);
    // Anything else keeps the organization's days (Thursday from 09:00, an hour's lead on).
    const anywhere = await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=cleaning`);
    expect(times(anywhere)[0]).toBe('2026-10-01T06:00');

    const sent = await lina.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Cleaning', start: { at: atMaadi.slots[0], hasTime: true } },
        booking: { itemId: 'maadi-cleaning' },
      },
    });
    expect(sent.message.payload.fields.place).toBe('9 Road 233, Cairo, Egypt');
    expect(sent.message.payload.booking.where).toBe('9 Road 233, Cairo, Egypt');
    // A time outside the branch's days is refused, though the organization is open then.
    const refused = await lina.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Cleaning', start: { at: anywhere.slots[0], hasTime: true } },
        booking: { itemId: 'maadi-cleaning' },
      },
    });
    expect(refused.statusCode).toBe(409);
  });

  it('a page names a branch only when it’s everyone’s', async () => {
    const page = await t.app.inject({
      method: 'GET',
      url: '/o/nile.dental',
      headers: { accept: 'text/html' },
    });
    expect(page.body).toContain('Zamalek');
    expect(page.body).not.toContain('Maadi');
  });

  it('a branch kept for the team alone, or let go of, leaves its items done wherever', async () => {
    const { places } = await noor
      .req('PUT', `/v1/orgs/${orgId}/places`, {
        places: [
          {
            id: maadi,
            kind: 'branch',
            label: 'Maadi',
            country: 'EG',
            city: 'Cairo',
            orgAudience: 'team',
          },
        ],
      })
      .then((r) => r.json());
    expect(places).toHaveLength(1);
    const org = (await noor.get(`/v1/orgs/${orgId}`)).org;
    expect(org.bookingItems.map((i: { placeId: string | null }) => i.placeId)).toEqual([
      null,
      null,
      null,
    ]);
    expect(org.booking.placeHours).toBeUndefined();
  });
});

describe('a branch’s own people (R92)', () => {
  let omar: Client; // on the team, works at Zamalek
  beforeAll(async () => {
    omar = await signup(t, { displayName: 'Omar Farouk' });
    const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
    await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
    // The test before let Zamalek go: a branch for customers again.
    const { places } = await noor
      .req('PUT', `/v1/orgs/${orgId}/places`, {
        places: [
          {
            kind: 'branch',
            label: 'Zamalek',
            country: 'EG',
            city: 'Cairo',
            street: '26 July Street',
            orgAudience: 'customers',
          },
        ],
      })
      .then((r) => r.json());
    zamalek = places[0].id;
  });

  it('are people on the team; its items go to whoever of them is free, and hold them', async () => {
    const save = (staff: string[]) =>
      noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
        booking: { ...HOURS, placeHours: [{ placeId: zamalek, days: [], staff }] },
        items: [item('zam-a', zamalek), item('zam-b', zamalek)],
      });
    // Only someone on the team works at a branch.
    expect((await save([lina.user.id])).statusCode).toBe(403);
    const ok = await save([omar.user.id]);
    expect(ok.statusCode, ok.body).toBe(200);
    // No days of its own: the organization's.
    const open = await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=zam-a`);
    expect(times(open)[0]).toBe('2026-10-01T06:00');
    const sent = await lina.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Cleaning', start: { at: open.slots[0], hasTime: true } },
        booking: { itemId: 'zam-a' },
      },
    });
    expect(sent.message.payload.booking.placeId).toBe(zamalek);
    // Confirmed by the owner, it goes to the one person who works there, not the owner.
    const confirmed = await noor.post(`/v1/messages/${sent.message.id}/kit`, { to: 'confirmed' });
    expect(confirmed.message.payload.booking.providerId).toBe(omar.user.id);
    // Omar is busy then: the branch's other item has no room at that time.
    const other = await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=zam-b`);
    expect(other.slots).not.toContain(open.slots[0]);
    // Anyone else at the branch can't be handed it.
    const handed = await noor.req('POST', `/v1/messages/${sent.message.id}/booking/provider`, {
      userId: noor.user.id,
    });
    expect(handed.statusCode).toBe(403);
  });
});
