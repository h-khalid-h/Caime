import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // runs the school's office
let rami: Client; // a student, 15
let lina: Client; // a parent
let orgId: string;

const send = (c: Client, conversationId: string, body: Record<string, unknown>) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), ...body });
const open = async (c: Client) =>
  (await c.post(`/v1/orgs/${orgId}/conversations`)).conversationId as string;

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  rami = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
  lina = await signup(t, { displayName: 'Lina Parent' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile School',
      handle: 'nile.school',
      kind: 'school',
    })
  ).org.id;
});

afterAll(async () => {
  await t.close();
});

describe('customers under 18 (R29)', () => {
  let studentConvo: string;

  it('write only to an organization that has verified who it is', async () => {
    const early = await rami.req('POST', `/v1/orgs/${orgId}/conversations`);
    expect(early.statusCode).toBe(403);
    expect(early.json().error.message).toBe(
      'Under 18, you can message organizations that have verified who they are. Nile School hasn’t yet.',
    );
    // Verifying the domain has its own test (orgs.test.ts).
    await t.ctx.db
      .updateTable('organizations')
      .set({ domain: 'nileschool.example', verified_at: t.ctx.now() })
      .where('id', '=', orgId)
      .execute();
    studentConvo = await open(rami);
    expect(
      (await send(rami, studentConvo, { body: 'Is the trip form due Friday?' })).statusCode,
    ).toBe(201);
  });

  it('are known to be to the team, and no card about money reaches them', async () => {
    const team = (await noor.get(`/v1/orgs/${orgId}/inbox?view=new`)).threads;
    expect(team.find((x: any) => x.conversationId === studentConvo)).toMatchObject({
      customerUnder18: true,
    });
    expect((await noor.get(`/v1/conversations/${studentConvo}`)).conversation.hasMinor).toBe(true);
    const invoice = await send(noor, studentConvo, {
      kind: 'kit',
      payload: {
        kit: 'invoice',
        fields: { reference: 'TRIP-7', amount: { value: 250, currency: 'EGP' } },
      },
    });
    expect(invoice.statusCode).toBe(403);
    expect(invoice.json().error.message).toBe(
      'Invoice cards aren’t available in this conversation.',
    );
    expect(
      (await send(noor, studentConvo, { body: 'Yes, Friday. See you then!' })).statusCode,
    ).toBe(201);

    // An adult's conversation with it is an ordinary one.
    const parentConvo = await open(lina);
    await send(lina, parentConvo, { body: 'How much is the trip?' });
    const parent = (await noor.get(`/v1/orgs/${orgId}/inbox?view=new`)).threads.find(
      (x: any) => x.conversationId === parentConvo,
    );
    expect(parent.customerUnder18).toBe(false);
    expect((await noor.get(`/v1/conversations/${parentConvo}`)).conversation.hasMinor).toBe(false);
    expect(
      (
        await send(noor, parentConvo, {
          kind: 'kit',
          payload: {
            kit: 'invoice',
            fields: { reference: 'TRIP-7', amount: { value: 250, currency: 'EGP' } },
          },
        })
      ).statusCode,
    ).toBe(201);
  });
});
