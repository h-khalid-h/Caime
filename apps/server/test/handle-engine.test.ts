/**
 * The handle engine on the server (docs/HANDLES.md): candidates best first and free now,
 * lookalikes refused across people and organizations, the database's skeleton the same as core's,
 * and gender asked at sign-up but never required.
 */
import { handleSkeleton } from '@caime/core/handle-engine';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.close();
});

const candidates = async (query: string) =>
  (await t.app.inject({ method: 'GET', url: `/v1/handles/candidates?${query}` })).json();

describe('handle candidates (docs/HANDLES.md)', () => {
  it('offers a person’s best handles first, and only free ones', async () => {
    const first = await candidates('for=person&name=Hussein%20Khalid');
    expect(first.candidates[0]).toBe('hussein.khalid');
    expect(first.policyVersion).toBe(1);
    await signup(t, { displayName: 'Hussein Khalid', handle: 'hussein.khalid' });
    const after = await candidates('for=person&name=Hussein%20Khalid');
    // Taken, and its lookalike (husseinkhalid reads the same): neither is offered.
    expect(after.candidates).not.toContain('hussein.khalid');
    expect(after.candidates).not.toContain('husseinkhalid');
    expect(after.candidates[0]).toBe('h.khalid');
  });

  it('asks for the Latin spelling of a name in another script, and never guesses one', async () => {
    const arabic = await candidates(`for=person&name=${encodeURIComponent('حسين خالد')}`);
    expect(arabic).toMatchObject({ candidates: [], needsLatinName: true });
    const spelled = await candidates(
      `for=person&name=${encodeURIComponent('حسين خالد')}&latinName=Hossam%20Khaled`,
    );
    expect(spelled.candidates[0]).toBe('hossam.khaled');
  });

  it('offers an organization its brand first, and refuses a lookalike of it to anyone else', async () => {
    const owner = await signup(t, { displayName: 'Mona Saad' });
    expect(
      (await candidates('for=org&name=Macrocare&legalName=Macrocare%20Medical%20Tourism%20LLC'))
        .candidates[0],
    ).toBe('macrocare');
    await owner.post('/v1/orgs', {
      country: 'EG',
      name: 'Macrocare',
      handle: 'macrocare',
      kind: 'clinic',
    });
    for (const handle of ['macro.care', 'rnacrocare', 'macr0care']) {
      const res = await t.app.inject({
        method: 'GET',
        url: `/v1/me/handle-available?handle=${handle}`,
      });
      expect([handle, res.json().available]).toEqual([handle, false]);
    }
    const refused = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'pose@example.com',
        password: 'a long enough password',
        displayName: 'Posing',
        handle: 'macro.care',
        birthDate: '1990-01-01',
        country: 'EG',
      },
    });
    expect(refused.json().error.code).toBe('handle_taken');
  });

  it('keeps generic words for Caime: nobody may be @customers or @best.team', async () => {
    for (const handle of ['customers', 'best.team', 'the_family']) {
      const res = await t.app.inject({
        method: 'GET',
        url: `/v1/me/handle-available?handle=${handle}`,
      });
      expect([handle, res.json().available]).toEqual([handle, false]);
    }
  });

  it('has the database read a handle’s skeleton exactly as core does', async () => {
    const someone = await signup(t, { displayName: 'Skeleton Test' });
    for (const handle of ['rn.vv_0i5', 'lina.saad', 'a1_b.c5']) {
      await t.ctx.db
        .updateTable('users')
        .set({ handle })
        .where('id', '=', someone.user.id)
        .execute();
      const row = await t.ctx.db
        .selectFrom('users')
        .select('handle_skeleton')
        .where('id', '=', someone.user.id)
        .executeTakeFirstOrThrow();
      expect([handle, row.handle_skeleton]).toEqual([handle, handleSkeleton(handle)]);
    }
    expect((await sql`select 1 as ok`.execute(t.ctx.db)).rows).toHaveLength(1);
  });

  it('asks gender at sign-up and keeps it only when someone says it', async () => {
    const said = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'rana@example.com',
        password: 'a long enough password',
        displayName: 'Rana Adel',
        handle: 'rana.adel',
        birthDate: '1992-03-04',
        country: 'EG',
        gender: 'woman',
      },
    });
    expect(said.statusCode).toBe(201);
    const unsaid = await signup(t, { displayName: 'Sam Lee' });
    const rows = await t.ctx.db
      .selectFrom('users')
      .select(['handle', 'gender'])
      .where('handle', 'in', ['rana.adel', unsaid.user.handle])
      .orderBy('handle')
      .execute();
    expect(rows.find((r) => r.handle === 'rana.adel')?.gender).toBe('woman');
    expect(rows.find((r) => r.handle === unsaid.user.handle)?.gender).toBeNull();
  });

  it('lets one of two claims of the same handle at once through, and tells the other it’s taken', async () => {
    const claim = (email: string) =>
      t.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: {
          email,
          password: 'a long enough password',
          displayName: 'Yara Nabil',
          handle: 'yara.nabil',
          birthDate: '1991-05-06',
          country: 'EG',
        },
      });
    const both = await Promise.all([claim('yara.one@example.com'), claim('yara.two@example.com')]);
    const codes = both.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409]);
    const refused = both.find((r) => r.statusCode === 409);
    expect(refused?.json().error.code).toBe('handle_taken');
    const held = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('handle', '=', 'yara.nabil')
      .execute();
    expect(held).toHaveLength(1);
  });
});
