/**
 * Ways to be paid and the Pay card (R62): a host's ways with their audiences, set with the rest
 * of what it offers; a Pay card carries the payee's ways the payer may see, fixed by the server;
 * the payer says it's sent, the payee says it arrived. Nothing is paid through Caime.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owns the clinic, and is paid by friends
let omar: Client; // on the clinic's team
let lina: Client; // the clinic's customer, Noor's connection
let sami: Client; // a stranger to Noor
let teen: Client; // under 18
let orgId: string;
let convo: string;
let direct: string;

const BANK = {
  id: 'cib',
  kind: 'bank',
  label: 'CIB',
  details: 'EG38 0019 0005 0000 0000 2631 8000 2',
  audience: 'connections',
};
const CASH = { id: 'cash', kind: 'cash', label: 'Cash', audience: 'public' };
const LINK = {
  id: 'online',
  kind: 'link',
  label: 'Pay online',
  url: 'https://pay.example/nile',
  audience: 'connections',
};

const send = (who: Client, conversationId: string, fields: Record<string, unknown>) =>
  who.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: { kit: 'payment_request', fields },
  });
const move = (who: Client, id: string, to: string) =>
  who.req('POST', `/v1/messages/${id}/kit`, { to });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  sami = await signup(t, { displayName: 'Sami Aziz' });
  teen = await signup(t, { displayName: 'Yara Teen', birthDate: '2012-01-01' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  for (const who of [omar, lina]) {
    const r = await noor.post('/v1/connections/requests', { toUserId: who.user.id });
    await who.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  }
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  direct = (await lina.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

describe('ways to be paid (R62)', () => {
  it('are set with the rest of what a host offers, kept when left out, and only an adult’s', async () => {
    const saved = await noor.req('PUT', '/v1/me/booking', {
      booking: null,
      items: [],
      payments: { methods: [BANK, CASH], note: 'Put your name in the reference.' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().payments.methods.map((m: { id: string }) => m.id)).toEqual(['cib', 'cash']);
    // Left out, they stay.
    await noor.req('PUT', '/v1/me/booking', { booking: null, items: [] });
    expect((await noor.get('/v1/me/booking')).payments.note).toBe(
      'Put your name in the reference.',
    );
    // A link is https, a bank says its account.
    for (const bad of [
      { ...LINK, url: 'http://pay.example' },
      { ...BANK, details: null },
    ])
      expect(
        (
          await noor.req('PUT', '/v1/me/booking', {
            booking: null,
            items: [],
            payments: { methods: [bad] },
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await teen.req('PUT', '/v1/me/booking', {
          booking: null,
          items: [],
          payments: { methods: [CASH] },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('a profile says Pay only to whom a way is for; the ways stay the owner’s', async () => {
    expect((await lina.get(`/v1/people/${noor.user.id}`)).payable).toBe(true);
    // Cash is for everyone, so a stranger may pay too.
    expect((await sami.get(`/v1/people/${noor.user.id}`)).payable).toBe(true);
    await noor.req('PUT', '/v1/me/booking', {
      booking: null,
      items: [],
      payments: { methods: [BANK], note: null },
    });
    expect((await sami.get(`/v1/people/${noor.user.id}`)).payable).toBe(false);
    expect((await noor.get(`/v1/people/${noor.user.id}`)).payable).toBe(false);
    expect(JSON.stringify(await lina.get(`/v1/people/${noor.user.id}`))).not.toContain('EG38');
  });

  it('an organization’s are for everyone or its customers, shown only to its managers', async () => {
    const team = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: null,
      items: [],
      payments: { methods: [{ ...BANK, audience: ['family'] }] },
    });
    expect(team.statusCode).toBe(403);
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: null,
      items: [],
      payments: { methods: [LINK, CASH], note: null },
    });
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.payments.methods).toHaveLength(2);
    expect((await omar.get(`/v1/orgs/${orgId}`)).org.payments).toBeNull();
    const customer = (await lina.get(`/v1/orgs/${orgId}`)).org;
    expect(customer.payments).toBeNull();
    expect(customer.payable).toBe(true);
  });
});

describe('the Pay card (R62)', () => {
  it('asked by the team: the organization is paid, its ways for customers on the card', async () => {
    const asked = await send(omar, convo, {
      direction: 'ask',
      amount: { value: 400, currency: 'EGP' },
      note: 'Cleaning',
    });
    expect(asked.statusCode).toBe(201);
    const card = asked.json().message.payload;
    expect(card.state).toBe('requested');
    expect(card.label).toBe('Pay');
    expect(card.payTo).toMatchObject({ name: 'Nile Dental' });
    expect(card.payTo.methods.map((m: { id: string }) => m.id)).toEqual(['online', 'cash']);
    expect(card.payTo.methods[0]).not.toHaveProperty('audience');
    const id = asked.json().message.id;
    // The team can't say it's sent; the customer can.
    expect((await move(omar, id, 'sent')).statusCode).toBe(403);
    expect((await move(lina, id, 'paid')).statusCode).toBe(403);
    expect((await move(lina, id, 'sent')).statusCode).toBe(200);
    // Only the team says it arrived, or that it hasn't yet.
    expect((await move(lina, id, 'paid')).statusCode).toBe(403);
    expect((await move(omar, id, 'not_received')).statusCode).toBe(200);
    expect((await move(lina, id, 'sent')).statusCode).toBe(200);
    const done = await move(noor, id, 'paid');
    expect(done.statusCode).toBe(200);
    expect(done.json().message.payload.state).toBe('paid');
  });

  it('paying: starts sent, the other side is paid, with the ways that person may see', async () => {
    await noor.req('PUT', '/v1/me/booking', {
      booking: null,
      items: [],
      payments: { methods: [BANK, CASH], note: null },
    });
    const paid = await send(lina, direct, {
      direction: 'send',
      amount: { value: 150, currency: 'EGP' },
      note: 'Dinner',
    });
    expect(paid.statusCode).toBe(201);
    const card = paid.json().message.payload;
    expect(card.state).toBe('sent');
    expect(card.payTo.name).toBe('Noor Haddad');
    // Lina is Noor's connection: the bank account and cash.
    expect(card.payTo.methods.map((m: { id: string }) => m.id)).toEqual(['cib', 'cash']);
    const id = paid.json().message.id;
    expect((await move(lina, id, 'paid')).statusCode).toBe(403);
    expect((await move(noor, id, 'paid')).statusCode).toBe(200);
  });

  it('a stranger paying sees only the ways for everyone; a group only asks', async () => {
    const dm = (await sami.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    const card = (
      await send(sami, dm, { direction: 'send', amount: { value: 20, currency: 'EGP' } })
    ).json().message.payload;
    expect(card.payTo.methods.map((m: { id: string }) => m.id)).toEqual(['cash']);
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Dinner',
        memberIds: [lina.user.id, omar.user.id],
      })
    ).conversation.id;
    expect(
      (await send(lina, group, { direction: 'send', amount: { value: 20, currency: 'EGP' } }))
        .statusCode,
    ).toBe(400);
    const asked = (
      await send(noor, group, { direction: 'ask', amount: { value: 20, currency: 'EGP' } })
    ).json().message.payload;
    expect(asked.payTo.methods.map((m: { id: string }) => m.id)).toEqual(['cash']);
  });

  it('a priced order names whom it’s paid to, for the payer’s Pay', async () => {
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: null,
      ordering: { fulfilment: ['pickup'], note: null },
      items: [
        {
          id: 'brush',
          name: 'Soft toothbrush',
          price: { value: 90, currency: 'EGP' },
          unit: 'each',
          minutes: null,
          capacity: 1,
          maxQuantity: 5,
          audience: 'public',
          providers: null,
          askTopic: false,
        },
      ],
    });
    const ordered = await lina.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'order_status',
        fields: {},
        order: { lines: [{ itemId: 'brush', quantity: 2 }], fulfilment: 'pickup' },
      },
    });
    expect(ordered.statusCode, ordered.body).toBe(201);
    expect(ordered.json().message.payload.payee).toEqual({ kind: 'org', id: orgId });
  });
});
