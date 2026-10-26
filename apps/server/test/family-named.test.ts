/**
 * A child's own way to their parent (R122 (2), M16 B8c): where a parent's consent lets someone in
 * (Egypt from 13), they sign up without a link and the account waits; they name their parent by
 * handle, having seen who it is, or send a parent not on Caime a link of their own; whoever is
 * asked agrees (vouching for the day of birth they saw) or says it isn't their child's, and is
 * never asked again; three noes end the account. A date of birth or a country corrected follows
 * sign-up's rules: under 13 refused, into a parent's yes a wait, and a child their parent looks
 * after asks that parent, who agrees or declines (or a document check says 18 or over).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lapseUnanswered } from '../src/lib/family';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mum: Client;
let dad: Client;
let aunt: Client;
let stranger: Client;

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_URL: 'https://caime.example' });
  mum = await signup(t, { displayName: 'Mona Mother', country: 'EG', timeZone: 'Africa/Cairo' });
  dad = await signup(t, { displayName: 'Karim Father', country: 'EG', timeZone: 'Africa/Cairo' });
  aunt = await signup(t, { displayName: 'Hala Aunt', country: 'EG', timeZone: 'Africa/Cairo' });
  stranger = await signup(t, { displayName: 'Some One', country: 'EG', timeZone: 'Africa/Cairo' });
});
afterAll(() => t.close());

let n = 0;
/** A child signing up in Egypt on their own, no link. */
async function child(birthDate = '2012-05-01'): Promise<Client> {
  n++;
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: {
      email: `named${n}@example.com`,
      password: 'correct horse battery',
      displayName: `Yara ${n}`,
      handle: `named${n}x${Date.now().toString(36)}`,
      birthDate,
      country: 'EG',
      timeZone: 'Africa/Cairo',
      locale: 'en-EG',
      client: 'native',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  expect(res.json().user.waitsForParent).toBe(true);
  return clientFor(t, res.json().token, res.json().user);
}

const handleOf = (c: Client) => c.user.handle as string;

describe('a child asks their own parent (R122 (2))', () => {
  it('signs up without a link, sees who a handle is, asks them, and goes on when they agree', async () => {
    const yara = await child();
    // Waiting, they reach only their wait.
    expect((await yara.req('GET', '/v1/inbox')).statusCode).toBe(403);
    const wait = (await yara.get('/v1/me/family')).wait;
    expect(wait).toMatchObject({ began: 'sign_up', asked: null, asksLeft: 3, refusals: 0 });
    // Who a handle is, before asking: the person as anyone sees them; a child is nobody to ask.
    const seen = (await yara.get(`/v1/me/family/parent?handle=${handleOf(mum)}`)).parent;
    expect(seen).toMatchObject({ id: mum.user.id, displayName: 'Mona Mother' });
    const other = await child();
    const notAParent = await yara.req('GET', `/v1/me/family/parent?handle=${handleOf(other)}`);
    expect(notAParent.statusCode).toBe(404);
    expect(notAParent.json().error.message).toBe(
      'Nobody by that handle can be asked. Check it with your parent.',
    );
    // Asked: the parent is told, and sees the day of birth to vouch for.
    expect(
      (await yara.req('POST', '/v1/me/family/parent', { handle: handleOf(mum) })).statusCode,
    ).toBe(200);
    await t.ctx.flush();
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select('title')
      .where('user_id', '=', mum.user.id)
      .where('kind', '=', 'family')
      .execute();
    expect(told.map((x) => x.title)).toContain(
      `${yara.user.displayName} asks you to agree to their account on Caime`,
    );
    const asked = (await mum.get('/v1/me/family')).children[0];
    expect(asked).toMatchObject({ state: 'asked', how: 'named', birthDate: '2012-05-01' });
    expect((await yara.get('/v1/me/family')).wait.asked.id).toBe(mum.user.id);
    // Agreed: in, connected, and the day of birth is the parent's to vouch for now.
    expect(
      (await mum.req('POST', `/v1/me/family/children/${yara.user.id}/consent`)).statusCode,
    ).toBe(200);
    expect((await yara.req('GET', '/v1/inbox')).statusCode).toBe(200);
    expect((await yara.get('/v1/me')).user.ageSource).toBe('parent');
  });

  it('a "not my child" ends that ask, never asked again; the third ends the account', async () => {
    const yara = await child('2011-07-07');
    for (const [i, adult] of [stranger, dad].entries()) {
      await yara.post('/v1/me/family/parent', { handle: handleOf(adult) });
      expect(
        (await adult.req('POST', `/v1/me/family/children/${yara.user.id}/refuse`)).statusCode,
      ).toBe(200);
      const wait = (await yara.get('/v1/me/family')).wait;
      expect(wait).toMatchObject({ asked: null, refusals: i + 1, asksLeft: 3 - (i + 1) });
      // The account is still there, waiting.
      expect((await yara.req('GET', '/v1/me')).statusCode).toBe(200);
    }
    // Never asked again by this account: the same answer as nobody at all.
    expect(
      (await yara.req('GET', `/v1/me/family/parent?handle=${handleOf(stranger)}`)).statusCode,
    ).toBe(404);
    // The third, and last, says no too: the account is deleted.
    await yara.post('/v1/me/family/parent', { handle: handleOf(aunt) });
    await aunt.req('POST', `/v1/me/family/children/${yara.user.id}/refuse`);
    const gone = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', yara.user.id)
      .executeTakeFirst();
    expect(gone).toBeUndefined();
  });

  it('sends a parent who isn’t on Caime a link, which they take once signed in', async () => {
    const yara = await child('2012-09-09');
    const made = await yara.req('POST', '/v1/me/family/parent-link');
    expect(made.statusCode).toBe(201);
    const token = made.json().url.split('/family/')[1] as string;
    expect(token).toMatch(/^famk_/);
    // Its page names whose ask it is, and nothing else.
    expect((await t.app.inject({ method: 'GET', url: `/v1/family/${token}` })).json()).toEqual({
      kind: 'ask',
      guardianName: null,
      childName: yara.user.displayName,
    });
    // The parent signs up, then takes it: they're the one asked.
    const parent = await signup(t, {
      displayName: 'New Parent',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    const taken = await parent.req('POST', '/v1/me/family/asks', { token });
    expect(taken.statusCode).toBe(200);
    expect(taken.json().child.id).toBe(yara.user.id);
    expect((await parent.get('/v1/me/family')).children[0]).toMatchObject({ state: 'asked' });
    // Spent: nobody else takes it.
    expect((await dad.req('POST', '/v1/me/family/asks', { token })).statusCode).toBe(404);
    // A child is never anyone's parent.
    const kid = await child('2012-10-10');
    const link2 = (await kid.req('POST', '/v1/me/family/parent-link'))
      .json()
      .url.split('/family/')[1];
    const other = await child('2012-11-11');
    expect((await other.req('POST', '/v1/me/family/asks', { token: link2 })).statusCode).toBe(403);
  });
});

describe('a date of birth or a country corrected, as sign-up has it (R122 (2))', () => {
  it('under 13 is refused; a parent’s age begins a wait; a looked-after child asks their parent', async () => {
    // An adult in Egypt corrects to 15: the account waits for a parent.
    const teen = await signup(t, {
      displayName: 'Was Adult',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    expect(
      (await teen.req('PUT', '/v1/me/birth-date', { birthDate: '2016-01-01' })).statusCode,
    ).toBe(400);
    const waited = await teen.req('PUT', '/v1/me/birth-date', { birthDate: '2011-04-04' });
    expect(waited.statusCode).toBe(200);
    expect(waited.json().user.waitsForParent).toBe(true);
    expect((await teen.get('/v1/me/family')).wait).toMatchObject({ began: 'corrected' });
    expect((await teen.req('GET', '/v1/inbox')).statusCode).toBe(403);
    // Their parent agrees; looked after now, a new day of birth asks that parent.
    await teen.post('/v1/me/family/parent', { handle: handleOf(dad) });
    await dad.post(`/v1/me/family/children/${teen.user.id}/consent`);
    const asked = await teen.req('PUT', '/v1/me/birth-date', { birthDate: '2007-04-04' });
    expect(asked.json()).toMatchObject({ askedParent: true, user: { birthDate: '2011-04-04' } });
    const seen = (await dad.get('/v1/me/family')).children.find(
      (c: { person: { id: string } }) => c.person.id === teen.user.id,
    );
    expect(seen.correction).toMatchObject({ birthDate: '2007-04-04', fromBirthDate: '2011-04-04' });
    // So does a country; declined, nothing changes.
    expect((await teen.req('PATCH', '/v1/me', { country: 'FR' })).json().askedParent).toBe(true);
    await dad.post(`/v1/me/family/children/${teen.user.id}/correction/decline`);
    expect((await teen.get('/v1/me')).user.country).toBe('EG');
    // A day asked again and agreed: theirs, vouched for by the parent.
    await teen.req('PUT', '/v1/me/birth-date', { birthDate: '2010-04-04' });
    await dad.post(`/v1/me/family/children/${teen.user.id}/correction/agree`);
    const now = (await teen.get('/v1/me')).user;
    expect(now).toMatchObject({ birthDate: '2010-04-04', ageSource: 'parent' });
  });

  it('a country changed into a parent’s age begins a wait; elsewhere it’s said as declared', async () => {
    const lina = await signup(t, {
      displayName: 'Lina France',
      birthDate: '2011-06-06',
      country: 'FR',
      timeZone: 'Europe/Paris',
    });
    expect((await lina.get('/v1/me')).user.ageSource).toBe('declared');
    const moved = await lina.req('PATCH', '/v1/me', { country: 'EG' });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().user.waitsForParent).toBe(true);
    expect((await lina.get('/v1/me/family')).wait).toMatchObject({ began: 'corrected' });
  });
});

describe('a wait nobody answers (R122 (2))', () => {
  it('a week without a yes deletes it, as a link’s does', async () => {
    const yara = await child('2013-01-01');
    t.clock.advance(8 * 86_400_000);
    expect(await lapseUnanswered(t.ctx)).toBeGreaterThanOrEqual(1);
    const gone = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', yara.user.id)
      .executeTakeFirst();
    expect(gone).toBeUndefined();
    t.clock.set('2026-09-23T14:00:00Z');
  });
});
