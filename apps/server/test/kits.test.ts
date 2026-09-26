import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let outsider: Client;
let convo: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}

const card = (c: Client, conversationId: string, kit: string, fields: unknown, extra = {}) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: { kit, fields, ...extra },
  });

const move = (c: Client, messageId: string, to: string) =>
  c.req('POST', `/v1/messages/${messageId}/kit`, { to });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad', timeZone: 'Africa/Cairo' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  outsider = await signup(t, { displayName: 'Outsider' });
  convo = await connect(noor, sam);
});
afterAll(async () => {
  await t.close();
});

describe('kit cards (PRD §41)', () => {
  it('the server decides what a card says and where it starts', async () => {
    const res = await card(
      noor,
      convo,
      'meeting',
      {
        title: 'Venue walkthrough',
        start: { at: '2026-10-02T11:00:00Z', hasTime: true },
        durationMinutes: 45,
        sneaky: 'dropped',
      },
      { state: 'accepted', history: [{ state: 'accepted', by: sam.user.id }] },
    );
    expect(res.statusCode).toBe(201);
    const m = res.json().message;
    expect(m.payload).toEqual({
      kit: 'meeting',
      label: 'Meeting',
      title: 'Venue walkthrough',
      fields: {
        title: 'Venue walkthrough',
        start: { at: '2026-10-02T11:00:00.000Z', hasTime: true },
        durationMinutes: 45,
      },
      state: 'proposed',
      history: [],
    });
    expect(m.mode).toBe('plan');
    const { conversations } = await sam.get('/v1/inbox?view=all');
    expect(conversations.find((c: any) => c.id === convo).lastMessage.preview).toBe(
      'Meeting: Venue walkthrough',
    );
  });

  it('refuses incomplete cards, the server’s own request cards, and kits that don’t fit', async () => {
    const missing = await card(noor, convo, 'approval', {});
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.message).toBe('What needs approval is needed.');
    expect((await card(noor, convo, 'request', { title: 'x' })).statusCode).toBe(400);

    const lina = await signup(t, { displayName: 'Lina' });
    await connect(noor, lina);
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Venue team',
        memberIds: [sam.user.id, lina.user.id],
      })
    ).conversation;
    const invoice = await card(noor, group.id, 'invoice', {
      reference: 'INV-1',
      amount: { value: 100, currency: 'EGP' },
    });
    expect(invoice.statusCode).toBe(400);
    expect(invoice.json().error.message).toBe('Invoice cards are for one-to-one conversations.');
    expect((await card(noor, group.id, 'approval', { title: 'Book the hall' })).statusCode).toBe(
      201,
    );

    // Money cards are never offered to or by anyone under 18 (R29).
    const teen = await signup(t, { displayName: 'Tess Teen', birthYear: 2011 });
    const r = await teen.post('/v1/connections/requests', { toUserId: noor.user.id });
    const withTeen = (await noor.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
      .conversationId;
    const pay = { amount: { value: 20, currency: 'USD' } };
    expect((await card(noor, withTeen, 'payment_request', pay)).statusCode).toBe(403);
    expect((await card(teen, withTeen, 'payment_request', pay)).statusCode).toBe(403);
    const study = { title: 'Study group', start: { at: '2026-10-02T15:00:00Z', hasTime: true } };
    expect((await card(teen, withTeen, 'meeting', study)).statusCode).toBe(201);
  });

  it('moves only the way its kit allows, by the person the move belongs to', async () => {
    const m = (await card(noor, convo, 'approval', { title: 'Budget for the venue' })).json()
      .message;
    // Noor asked; she can't answer her own approval. Outsiders can't touch it at all.
    expect((await move(noor, m.id, 'approved')).statusCode).toBe(403);
    expect((await move(outsider, m.id, 'approved')).statusCode).toBe(404);
    expect((await move(sam, m.id, 'teleported')).statusCode).toBe(403);

    const done = await move(sam, m.id, 'approved');
    expect(done.statusCode).toBe(200);
    expect(done.json().message.payload).toMatchObject({
      state: 'approved',
      history: [{ state: 'approved', by: sam.user.id }],
    });
    // Final: nothing moves it on.
    expect((await move(sam, m.id, 'rejected')).statusCode).toBe(403);

    // Noor hears the answer.
    await t.ctx.flush();
    const { notifications } = await noor.get('/v1/notifications');
    expect(notifications[0]).toMatchObject({
      kind: 'kit',
      title: 'Sam Rivera: Approved',
      body: 'Approval · Budget for the venue',
      level: 'attention',
    });
  });

  it('applies one of two moves made at the same moment', async () => {
    const m = (
      await card(noor, convo, 'payment_request', { amount: { value: 1200, currency: 'EGP' } })
    ).json().message;
    const [a, b] = await Promise.all([move(sam, m.id, 'paid'), move(sam, m.id, 'declined')]);
    // One wins; the other finds the card already moved (409) or no longer allowing it (403).
    const [won, lost] = [a.statusCode, b.statusCode].sort();
    expect(won).toBe(200);
    expect([403, 409]).toContain(lost);
    const row = await t.ctx.db
      .selectFrom('messages')
      .select('payload')
      .where('id', '=', m.id)
      .executeTakeFirstOrThrow();
    expect((row.payload as { history: unknown[] }).history).toHaveLength(1);
  });

  it('keeps the server’s request cards working as before', async () => {
    const res = await noor.post('/v1/tasks', {
      title: 'Send the floor plan',
      assigneeId: sam.user.id,
      shared: true,
      conversationId: convo,
    });
    const page = await sam.get(`/v1/conversations/${convo}/messages`);
    const req = page.messages.find(
      (x: any) => x.kind === 'kit' && x.payload.taskId === res.task.id,
    );
    expect(req.payload).toMatchObject({
      kit: 'request',
      title: 'Send the floor plan',
      state: 'open',
    });
  });
});
