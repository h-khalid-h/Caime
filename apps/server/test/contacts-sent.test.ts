/**
 * A contact sent in a conversation (M16 E8c): someone on Caime the sender knows, kept as their id
 * alone and read by each reader through the profile route, whose rules decide what they see; never
 * a stranger to the sender, one of Caime's own accounts, or anyone in an organization's
 * conversation, whose customer meets the organization alone (R15).
 */
import { uuidv4 } from '@caime/core';
import { CAI_ID } from '@caime/core/system-ids';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let cleo: Client;
let dan: Client;
let mia: Client;
let chat: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'friend' },
  });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  return (await a.post('/v1/conversations', { kind: 'direct', userId: b.user.id })).conversation
    .id as string;
}
const sendContact = (c: Client, conversationId: string, payload: unknown) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'contact',
    payload,
  });

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Sharer' });
  ben = await signup(t, { displayName: 'Ben Reader' });
  cleo = await signup(t, { displayName: 'Cleo Known' });
  dan = await signup(t, { displayName: 'Dan Stranger' });
  mia = await signup(t, { displayName: 'Mia Young', birthDate: '2012-03-01' });
  chat = await connect(ana, ben);
  await connect(ana, cleo);
  await connect(mia, ana);
});
afterAll(async () => {
  await t.close();
});

describe('a contact sent in a conversation (M16 E8c)', () => {
  it('names someone the sender is connected with, kept as their id alone', async () => {
    const res = await sendContact(ana, chat, { userId: cleo.user.id, name: 'Not kept' });
    expect(res.statusCode, res.body).toBe(201);
    const page = await ben.get(`/v1/conversations/${chat}/messages`);
    const card = (page.messages as Array<{ kind: string; payload: unknown }>).find(
      (m) => m.kind === 'contact',
    );
    expect(card?.payload).toEqual({ userId: cleo.user.id });
    // Ben reads Cleo as her profile shows her to him.
    const seen = await ben.req('GET', `/v1/people/${cleo.user.id}`);
    expect(seen.statusCode).toBe(200);
    expect(seen.json().person.displayName).toBe('Cleo Known');
    // The sender's own contact goes too.
    expect((await sendContact(ana, chat, { userId: ana.user.id })).statusCode).toBe(201);
  });

  it('refuses a stranger to the sender, one of Caime’s own accounts, and nobody', async () => {
    expect((await sendContact(ana, chat, { userId: dan.user.id })).statusCode).toBe(400);
    expect((await sendContact(ana, chat, { userId: CAI_ID })).statusCode).toBe(400);
    expect((await sendContact(ana, chat, { userId: uuidv4() })).statusCode).toBe(400);
  });

  it('shows someone under 18 to an adult who doesn’t know them as nobody', async () => {
    expect((await sendContact(ana, chat, { userId: mia.user.id })).statusCode).toBe(201);
    // The card names Mia's id; Ben, an adult in touch with her no way, reads nobody there.
    expect((await ben.req('GET', `/v1/people/${mia.user.id}`)).statusCode).toBe(404);
  });

  it('is never sent in an organization’s conversation', async () => {
    const orgId = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Zarqa Dental',
        handle: 'zarqa.dental',
        kind: 'clinic',
      })
    ).org.id as string;
    const thread = (await ben.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId as string;
    await ben.post(`/v1/conversations/${thread}/messages`, { clientId: uuidv4(), body: 'Hello' });
    expect((await sendContact(ana, thread, { userId: cleo.user.id })).statusCode).toBe(400);
    expect((await sendContact(ben, thread, { userId: ana.user.id })).statusCode).toBe(400);
  });
});
