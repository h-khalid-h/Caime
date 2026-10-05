/**
 * Payments between organizations (R64): someone who runs an organization writes to another as
 * it, in a conversation of its own beside their personal one; the team sees whom it answers,
 * and a Pay card the team sends pays that organization through its ways for those it knows.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owns Nile Dental, the seller
let karim: Client; // owns Acme Supply, the buyer
let sami: Client; // on Acme's team, not an admin
let nileId: string;
let acmeId: string;
let asAcme: string;

const send = (who: Client, conversationId: string, fields: Record<string, unknown>) =>
  who.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: { kit: 'payment_request', fields },
  });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  karim = await signup(t, { displayName: 'Karim Saleh' });
  sami = await signup(t, { displayName: 'Sami Aziz' });
  const org = (who: Client, name: string, handle: string) =>
    who.post('/v1/orgs', { country: 'EG', name, handle, kind: 'business' });
  nileId = (await org(noor, 'Nile Dental', 'nile.dental')).org.id;
  acmeId = (await org(karim, 'Acme Supply', 'acme.supply')).org.id;
  const r = await karim.post('/v1/connections/requests', { toUserId: sami.user.id });
  await sami.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await karim.post(`/v1/orgs/${acmeId}/members`, { userIds: [sami.user.id] });
  await karim.req('PUT', `/v1/orgs/${acmeId}/booking`, {
    booking: null,
    items: [],
    payments: {
      methods: [
        {
          id: 'qnb',
          kind: 'bank',
          label: 'QNB',
          details: 'EG12 0037 0000 0000 0000 1234 5678 9',
          audience: 'connections',
        },
        { id: 'cash', kind: 'cash', label: 'Cash', audience: 'public' },
      ],
      note: 'Invoice number in the reference, please.',
    },
  });
});
afterAll(async () => {
  await t.close();
});

describe('writing as an organization (R64)', () => {
  it('only its owner or admins write as it, beside their own conversation', async () => {
    const mine = await karim.post(`/v1/orgs/${nileId}/conversations`, {});
    const first = await karim.req('POST', `/v1/orgs/${nileId}/conversations`, { asOrgId: acmeId });
    expect(first.statusCode).toBe(201);
    asAcme = first.json().conversationId;
    expect(asAcme).not.toBe(mine.conversationId);
    // Asked again, the same one.
    const again = await karim.post(`/v1/orgs/${nileId}/conversations`, { asOrgId: acmeId });
    expect(again).toEqual({ conversationId: asAcme, created: false });
    expect(
      (await sami.req('POST', `/v1/orgs/${nileId}/conversations`, { asOrgId: acmeId })).statusCode,
    ).toBe(403);
    // Nile's own team never writes to it as anyone.
    expect(
      (await noor.req('POST', `/v1/orgs/${nileId}/conversations`, { asOrgId: acmeId })).statusCode,
    ).toBe(400);
  });

  it('the customer sees whom they write as; the team sees whom it answers', async () => {
    const theirs = (await karim.get(`/v1/conversations/${asAcme}`)).conversation;
    expect(theirs.business.asOrg).toMatchObject({ id: acmeId, name: 'Acme Supply' });
    const row = (await karim.get('/v1/inbox?view=all')).conversations.find(
      (c: { id: string }) => c.id === asAcme,
    );
    expect(row.title).toBe('Nile Dental, for Acme Supply');
    await karim.req('POST', `/v1/conversations/${asAcme}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'We would like to order 40 kits a month.',
    });
    const team = (await noor.get(`/v1/conversations/${asAcme}`)).conversation;
    expect(team.title).toBe('Acme Supply · Karim Saleh');
    expect(team.business.thread.customerOrg).toMatchObject({ id: acmeId });
    const thread = (await noor.get(`/v1/orgs/${nileId}/inbox?view=new`)).threads.find(
      (x: { conversationId: string }) => x.conversationId === asAcme,
    );
    expect(thread.customerOrg.name).toBe('Acme Supply');
  });

  it('a Pay card the team sends pays the customer’s organization, through its ways', async () => {
    const paid = await send(noor, asAcme, {
      direction: 'send',
      amount: { value: 1200, currency: 'EGP' },
      note: 'Refund for the returned kits',
    });
    expect(paid.statusCode, paid.body).toBe(201);
    const card = paid.json().message.payload;
    expect(card.payTo.name).toBe('Acme Supply');
    expect(card.payTo.methods.map((m: { id: string }) => m.id)).toEqual(['qnb', 'cash']);
    expect(card.payTo.note).toBe('Invoice number in the reference, please.');
    // Asked by the team, the seller is paid, as for any customer: Nile has no ways set yet.
    const asked = await send(noor, asAcme, {
      direction: 'ask',
      amount: { value: 4800, currency: 'EGP' },
    });
    expect(asked.statusCode).toBe(201);
    expect(asked.json().message.payload.payTo).toBeUndefined();
  });
});
