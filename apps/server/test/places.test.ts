/**
 * Places (R92): a person's are shown by their own rules (connections here, nobody by default,
 * never beyond family under 18), an organization's to anyone on its page with a postal address
 * in its JSON-LD, to its customers, or to its team; a conversation offers both sides' to a
 * card's "Where", and both exports carry them.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sara: Client;
let omar: Client;
let teen: Client;
let direct: string;

const HOME = {
  kind: 'home',
  country: 'EG',
  city: 'Cairo',
  area: 'Maadi',
  street: '9 Road 233',
  building: 'Building 12',
  floor: '3',
  unit: '7',
  directions: 'The green gate',
  point: { lat: 29.96, lng: 31.25 },
  audience: { kind: 'connections' },
};

beforeAll(async () => {
  // The web app's shell, for the organization's public page.
  const dir = mkdtempSync(join(tmpdir(), 'caime-places-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div></body></html>',
  );
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  noor = await signup(t, { displayName: 'Noor Places' });
  sara = await signup(t, { displayName: 'Sara Places' });
  omar = await signup(t, { displayName: 'Omar Places' });
  teen = await signup(t, { displayName: 'Teen Places', birthDate: '2011-12-31' });
  const r = await noor.post('/v1/connections/requests', { toUserId: sara.user.id });
  direct = (await sara.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
});

afterAll(async () => {
  await t.close();
});

describe('a person’s places', () => {
  it('are saved whole, in order, and shown by their rules', async () => {
    const { places } = await noor
      .req('PUT', '/v1/me/places', {
        places: [
          HOME,
          {
            kind: 'work',
            label: 'The studio',
            country: 'EG',
            city: 'Giza',
            audience: { kind: 'everyone' },
          },
          { kind: 'other', country: 'EG', city: 'Alexandria' },
        ],
      })
      .then((r) => r.json());
    expect(places.map((p: { kind: string }) => p.kind)).toEqual(['home', 'work', 'other']);
    // Left without one, a place is shown to nobody.
    expect(places[2].audience).toEqual({ kind: 'nobody' });

    // Sara, a connection, sees home and the studio; Omar, a stranger, the studio alone.
    const toSara = await sara.get(`/v1/people/${noor.user.id}`);
    expect(toSara.places.map((p: { kind: string }) => p.kind)).toEqual(['home', 'work']);
    // Who sees it is said to its owner alone.
    expect(toSara.places[0].audience).toBeNull();
    expect(toSara.places[0].point).toEqual({ lat: 29.96, lng: 31.25 });
    const toOmar = await omar.get(`/v1/people/${noor.user.id}`);
    expect(toOmar.places.map((p: { label: string }) => p.label)).toEqual(['The studio']);

    // Saved again: one kept by its id stays that place, one left out goes.
    const again = await noor
      .req('PUT', '/v1/me/places', { places: [{ ...places[1], city: 'Sheikh Zayed' }] })
      .then((r) => r.json());
    expect(again.places).toEqual([
      expect.objectContaining({ id: places[1].id, city: 'Sheikh Zayed' }),
    ]);
    await noor.req('PUT', '/v1/me/places', { places: [HOME, places[1]] });
  });

  it('under 18, are never shown beyond family', async () => {
    const { places } = await teen
      .req('PUT', '/v1/me/places', { places: [{ ...HOME, audience: { kind: 'everyone' } }] })
      .then((r) => r.json());
    expect(places[0].audience).toEqual({ kind: 'spheres', spheres: ['family'] });
    // An adult with no tie to them doesn't reach their profile at all (R29)…
    expect((await omar.req('GET', `/v1/people/${teen.user.id}`)).statusCode).toBe(404);
    // …and a connection who isn't family sees it without the place.
    const asked = await teen.post('/v1/connections/requests', { toUserId: omar.user.id });
    await omar.post(`/v1/connections/requests/${asked.requestId}/accept`, {});
    expect((await omar.get(`/v1/people/${teen.user.id}`)).places).toEqual([]);
  });

  it('refuse a country that isn’t one, a kind for organizations, and too many', async () => {
    const bad = await noor.req('PUT', '/v1/me/places', { places: [{ ...HOME, country: 'ZZ' }] });
    expect(bad.statusCode).toBe(400);
    const branch = await noor.req('PUT', '/v1/me/places', {
      places: [{ ...HOME, kind: 'branch' }],
    });
    expect(branch.statusCode).toBe(400);
    const many = await noor.req('PUT', '/v1/me/places', {
      places: Array.from({ length: 21 }, () => HOME),
    });
    expect(many.statusCode).toBe(400);
  });

  it('are offered to a card’s “Where” in a one-to-one, both sides’, and travel in the export', async () => {
    const offered = await sara.get(`/v1/conversations/${direct}/places`);
    expect(offered.mine).toEqual([]);
    expect(offered.theirs).toEqual([
      {
        owner: 'Noor Places',
        places: [
          expect.objectContaining({ kind: 'home' }),
          expect.objectContaining({ kind: 'work' }),
        ],
      },
    ]);
    const archive = (await noor.req('GET', '/v1/me/export')).json();
    expect(archive.places.map((p: { kind: string }) => p.kind)).toEqual(['home', 'work']);
  });
});

describe('an organization’s places', () => {
  it('are shown to anyone on its page, to its customers, or to its team', async () => {
    const { org } = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Bakery',
      handle: 'nile.bakery',
      kind: 'business',
    });
    const saved = await noor
      .req('PUT', `/v1/orgs/${org.id}/places`, {
        places: [
          {
            kind: 'hq',
            country: 'EG',
            city: 'Cairo',
            street: '26 July Street',
            orgAudience: 'everyone',
            point: { lat: 30.05, lng: 31.23 },
          },
          {
            kind: 'branch',
            label: 'Maadi kitchen',
            country: 'EG',
            city: 'Cairo',
            area: 'Maadi',
            orgAudience: 'customers',
          },
          { kind: 'other', label: 'Warehouse', country: 'EG', city: 'Giza', orgAudience: 'team' },
        ],
      })
      .then((r) => r.json());
    expect(saved.places).toHaveLength(3);
    // Nobody but its owner and admins sets them.
    expect((await sara.req('PUT', `/v1/orgs/${org.id}/places`, { places: [] })).statusCode).toBe(
      404,
    );

    // A visitor's page: the public one, its map, and a postal address in its JSON-LD.
    const page = await t.app.inject({
      method: 'GET',
      url: '/o/nile.bakery',
      headers: { accept: 'text/html' },
    });
    expect(page.body).toContain('26 July Street, Cairo, Egypt');
    expect(page.body).toContain('openstreetmap.org/?mlat=30.050000');
    expect(page.body).toContain('"@type":"PostalAddress"');
    expect(page.body).not.toContain('Maadi kitchen');
    expect(page.body).not.toContain('Warehouse');

    // Someone who isn't its customer sees the public one; a customer the branch too.
    const before = await sara.get(`/v1/orgs/${org.id}`);
    expect(before.org.places.map((p: { kind: string }) => p.kind)).toEqual(['hq']);
    const { conversationId } = await sara.post(`/v1/orgs/${org.id}/conversations`, {});
    const after = await sara.get(`/v1/orgs/${org.id}`);
    expect(after.org.places.map((p: { kind: string }) => p.kind)).toEqual(['hq', 'branch']);
    expect(after.org.places[0].orgAudience).toBeNull();
    // Its team sees all three, and who each is for.
    const team = await noor.get(`/v1/orgs/${org.id}`);
    expect(team.org.places.map((p: { orgAudience: string }) => p.orgAudience)).toEqual([
      'everyone',
      'customers',
      'team',
    ]);

    // In the customer's conversation, the card's "Where" offers what the customer may see.
    const offered = await sara.get(`/v1/conversations/${conversationId}/places`);
    expect(offered.theirs).toEqual([
      {
        owner: 'Nile Bakery',
        places: [
          expect.objectContaining({ kind: 'hq' }),
          expect.objectContaining({ kind: 'branch' }),
        ],
      },
    ]);
    // Its team is offered the same, since the customer reads the card: never the warehouse kept
    // for the team, nor a team member's own places (Noor keeps two of her own, M16 F6).
    expect((await noor.get('/v1/me/places')).places.length).toBeGreaterThan(0);
    const teamOffered = await noor.get(`/v1/conversations/${conversationId}/places`);
    expect(teamOffered.mine).toEqual([]);
    expect(
      teamOffered.theirs[0].places.map((p: { label: string | null; kind: string }) => p.kind),
    ).toEqual(['hq', 'branch']);
    // And its export carries them.
    const exported = (await noor.req('GET', `/v1/orgs/${org.id}/export`)).json();
    expect(exported.places).toHaveLength(3);
  });
});
