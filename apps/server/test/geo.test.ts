import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
const get = (url: string) => t.app.inject({ method: 'GET', url });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad', timeZone: 'Asia/Calcutta', country: 'IN' });
});
afterAll(async () => {
  await t.close();
});

describe('choosing where, and in what (the pickers’ lists)', () => {
  it('lists every currency a country uses, named in the asker’s language', async () => {
    const en = (await get('/v1/currencies?locale=en')).json().currencies;
    expect(en).toContainEqual({ code: 'EGP', name: 'Egyptian Pound' });
    expect(en).toContainEqual({ code: 'EUR', name: 'Euro' });
    const names = en.map((c: { name: string }) => c.name);
    expect(names).toEqual([...names].sort(new Intl.Collator('en').compare));
    const ar = (await get('/v1/currencies?locale=ar-EG')).json().currencies;
    expect(ar).toContainEqual({ code: 'EGP', name: 'جنيه مصري' });
    expect((await get('/v1/currencies')).headers['cache-control']).toBe('public, max-age=86400');
  });

  it('lists time zones by the names they have now, with their city, country and offset', async () => {
    const res = await get('/v1/time-zones?locale=en&timeZone=Asia/Calcutta');
    const { zones, suggested } = res.json();
    // A device still reporting an old name is offered the zone as it's called now.
    expect(suggested).toBe('Asia/Kolkata');
    const cairo = zones.find((z: { zone: string }) => z.zone === 'Africa/Cairo');
    expect(cairo).toEqual({
      zone: 'Africa/Cairo',
      city: 'Cairo',
      country: 'EG',
      countryName: 'Egypt',
      offset: expect.stringMatching(/^GMT\+[23]$/),
    });
    const names = zones.map((z: { zone: string }) => z.zone);
    expect(names).toContain('UTC');
    expect(names).toContain('Europe/Kyiv');
    expect(names).not.toContain('Asia/Calcutta');
    expect(names).not.toContain('Europe/Kiev');
    // Ordered by city, in the asker's language.
    const ar = (await get('/v1/time-zones?locale=ar')).json().zones;
    expect(ar.find((z: { zone: string }) => z.zone === 'Africa/Cairo').countryName).toBe('مصر');
    expect((await get('/v1/time-zones?timeZone=Nowhere/Else')).json().suggested).toBeNull();
  });

  it('keeps someone’s time zone by the name it has now', async () => {
    expect((await noor.get('/v1/me')).user.timeZone).toBe('Asia/Kolkata');
    const { user } = await noor.patch('/v1/me', { timeZone: 'Europe/Kiev' });
    expect(user.timeZone).toBe('Europe/Kyiv');
  });

  it('says what an organization’s cards are in: its country’s currency', async () => {
    const lina = await signup(t, { displayName: 'Lina Aziz', country: 'US' });
    const org = (
      await noor.post('/v1/orgs', {
        name: 'Nile Dental',
        handle: 'nile.geo',
        kind: 'clinic',
        country: 'EG',
      })
    ).org;
    const convo = (await lina.post(`/v1/orgs/${org.id}/conversations`)).conversationId;
    const seen = (await noor.get(`/v1/conversations/${convo}`)).conversation;
    expect(seen.business.org).toMatchObject({ id: org.id, currency: 'EGP' });
    expect((await lina.get('/v1/me')).user.currency).toBe('USD');
  });
});
