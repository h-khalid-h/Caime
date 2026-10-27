/**
 * A checked age shown (R122 (2), M16 B8e): an age check that found someone 18 or over is theirs to
 * show, through the privacy field `ageChecked` (nobody by default), as "18 or over, checked" on
 * their profile and, where everyone may see it, their public page: never an age or a date, and
 * nothing for someone under 18 whatever they saved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publicPageFor, renderPublic } from '../src/lib/public-pages';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let lina: Client;
let omar: Client;
let teen: Client;

const checked = (userId: string, outcome: 'adult' | 'minor') =>
  t.ctx.db
    .updateTable('users')
    .set({ age_check: outcome, age_check_method: 'estimate', age_checked_at: new Date() })
    .where('id', '=', userId)
    .execute();

beforeAll(async () => {
  t = await createTestApp();
  lina = await signup(t, { displayName: 'Lina Checked' });
  omar = await signup(t, { displayName: 'Omar Looking' });
  teen = await signup(t, { displayName: 'Sami Young', birthDate: '2011-03-01' });
});
afterAll(() => t.close());

describe('a checked age (M16 B8e)', () => {
  it('shows to nobody until they say, then as "18 or over, checked" alone', async () => {
    await checked(lina.user.id, 'adult');
    expect((await omar.get(`/v1/people/${lina.user.id}`)).ageChecked).toBe(false);
    await lina.req('PUT', '/v1/me/privacy', { fields: { ageChecked: { kind: 'everyone' } } });
    const seen = await omar.get(`/v1/people/${lina.user.id}`);
    expect(seen.ageChecked).toBe(true);
    // Nothing of an age or a date comes with it.
    expect(JSON.stringify(seen)).not.toContain('birth');
    // Their public page says it, in its facts.
    const path = `/@${lina.user.handle}`;
    const page = await publicPageFor(t.ctx, path, t.ctx.now());
    expect(page).toMatchObject({ kind: 'person', ageChecked: true });
    expect(renderPublic(page, 'https://caime.test', path).body).toContain('18 or over, checked');
    // Hidden again, it's gone from both.
    await lina.req('PUT', '/v1/me/privacy', { fields: { ageChecked: { kind: 'nobody' } } });
    expect((await omar.get(`/v1/people/${lina.user.id}`)).ageChecked).toBe(false);
  });

  it('says nothing without a check that found an adult, nor for someone under 18', async () => {
    await omar.req('PUT', '/v1/me/privacy', { fields: { ageChecked: { kind: 'everyone' } } });
    expect((await lina.get(`/v1/people/${omar.user.id}`)).ageChecked).toBe(false);
    await checked(omar.user.id, 'minor');
    expect((await lina.get(`/v1/people/${omar.user.id}`)).ageChecked).toBe(false);
    // Under 18 by their date of birth, an adult's check changes nothing here.
    await checked(teen.user.id, 'adult');
    await teen.req('PUT', '/v1/me/privacy', { fields: { ageChecked: { kind: 'connections' } } });
    // Under 18, Sami asks (an adult can't ask a stranger under 18, R29).
    const r = await teen.post('/v1/connections/requests', { toUserId: lina.user.id });
    await lina.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    expect((await lina.get(`/v1/people/${teen.user.id}`)).ageChecked).toBe(false);
  });
});
