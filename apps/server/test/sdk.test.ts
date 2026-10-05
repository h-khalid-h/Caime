import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Caime, CaimeError, parseWebhook } from '@caime/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * The SDK (R39) against the real server: every method reaches its route through the app's
 * token, and a real delivery from the webhook job is checked by parseWebhook.
 */
let t: TestApp;
let noor: Client;
let lina: Client;
let orgId: string;
let convo: string;
let token: string;
let secret: string;
let caime: Caime;
let hook: Server;
const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> =
  [];

/** `fetch` over the test app's own request injection: the very routes, no port. */
const fetchViaInject: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const res = await t.app.inject({
    method: (init?.method ?? 'GET') as 'GET',
    url: url.pathname + url.search,
    headers: init?.headers as Record<string, string>,
    ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
  });
  return new Response(res.body, {
    status: res.statusCode,
    headers: Object.fromEntries(
      Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]),
    ),
  });
};

beforeAll(async () => {
  hook = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ headers: req.headers, body });
    res.writeHead(200).end('ok');
  });
  await new Promise<void>((done) => hook.listen(0, '127.0.0.1', done));
  t = await createTestApp({ WEBHOOKS_ALLOW_PRIVATE: 'true' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Tiles Co',
      handle: 'tiles.co',
      kind: 'shop',
    })
  ).org.id;
  const made = await noor.post(`/v1/orgs/${orgId}/apps`, {
    name: 'Tiles Assistant',
    scopes: ['inbox:read', 'messages:read', 'messages:write', 'threads:write', 'updates', 'kits'],
    webhookUrl: `http://127.0.0.1:${(hook.address() as AddressInfo).port}/caime`,
    events: ['business.message', 'business.thread'],
  });
  ({ token, webhookSecret: secret } = made);
  // On Business, so a second app can be made below: plans have their own tests (plans.test.ts).
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
  caime = new Caime({ token, baseUrl: 'http://caime.test', fetch: fetchViaInject });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
  await lina.post(`/v1/conversations/${convo}/messages`, {
    clientId: 'lina-0001',
    body: 'Do you have the blue tiles?',
  });
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => hook.close(done));
});

describe('@caime/sdk against the server (R39)', () => {
  it('says who the token is first, so an integration learns its organization’s id', async () => {
    const me = await caime.me();
    expect(me).toMatchObject({ name: 'Tiles Assistant', orgId, orgHandle: expect.any(String) });
    expect(me.scopes).toContain('inbox:read');
    expect(me.events).toEqual(['business.message', 'business.thread']);
    expect(me.botUserId).toEqual(expect.any(String));
  });

  it('reads the inbox, a conversation and its messages, and replies as the bot', async () => {
    const inbox = await caime.inbox(orgId, 'customer_waiting');
    expect(inbox.org.id).toBe(orgId);
    expect(inbox.threads.map((th) => th.conversationId)).toEqual([convo]);
    const conversation = await caime.conversation(convo);
    expect(conversation.id).toBe(convo);
    // A first message from a customer is new, and waits for the team all the same.
    expect(conversation.business?.thread?.state).toBe('new');
    const page = await caime.messages(convo, { limit: 10 });
    expect(page.messages.map((m) => m.body)).toEqual(['Do you have the blue tiles?']);
    const reply = await caime.send(convo, 'Yes, in 20×20 and 30×30.', { clientId: 'bot-00001' });
    expect(reply.automated).toBe(true);
    // The same clientId again is the same message, never a second.
    expect(
      (await caime.send(convo, 'Yes, in 20×20 and 30×30.', { clientId: 'bot-00001' })).id,
    ).toBe(reply.id);
    expect((await caime.messages(convo)).messages).toHaveLength(2);
  });

  it('moves threads, and its refusals come back as CaimeErrors with the server’s code', async () => {
    const resolved = await caime.resolve(convo);
    expect(resolved.state).toBe('resolved');
    const reopened = await caime.reopen(convo);
    expect(reopened.state).not.toBe('resolved');
    const escalated = await caime.escalate(convo, 'Big order');
    expect(escalated.escalated?.note).toBe('Big order');
    const calm = await caime.stopEscalating(convo);
    expect(calm.escalated).toBeNull();
    expect((await caime.assign(convo, null)).assignee).toBeNull();

    const err = await caime.conversation('00000000-0000-7000-8000-000000000000').catch((e) => e);
    expect(err).toBeInstanceOf(CaimeError);
    expect((err as CaimeError).status).toBe(404);
    const narrow = new Caime({
      token: (
        await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Reports', scopes: ['inbox:read'] })
      ).token,
      baseUrl: 'http://caime.test',
      fetch: fetchViaInject,
    });
    await expect(narrow.kits()).rejects.toMatchObject({ status: 403, code: 'token_scope' });
    const nobody = new Caime({
      token: 'cai_nobody',
      baseUrl: 'http://caime.test',
      fetch: fetchViaInject,
    });
    await expect(nobody.inbox(orgId, 'new')).rejects.toMatchObject({ status: 401 });
  });

  it('makes its own kind of card, sends one, moves and changes it, and takes the kind away', async () => {
    const kit = await caime.putKit('sample', {
      name: 'Sample',
      description: 'A tile sample on its way',
      fields: [
        { key: 'tile', label: 'Tile', type: 'text', required: true },
        { key: 'note', label: 'Note', type: 'text' },
      ],
      states: [
        { id: 'packed', label: 'Packed', tone: 'neutral' },
        { id: 'sent', label: 'Sent', tone: 'positive' },
      ],
      moves: [{ from: 'packed', to: 'sent', label: 'Sent', who: 'organization' }],
      adultsOnly: false,
    });
    expect(kit.key).toBe('sample');
    expect((await caime.kits()).map((k) => k.key)).toEqual(['sample']);
    const card = await caime.sendCard(convo, 'sample', { tile: 'Blue 20×20' });
    expect(card.payload).toMatchObject({ kit: 'custom', key: 'sample', state: 'packed' });
    const changed = await caime.changeCard(card.id, { note: 'Two of them' });
    expect((changed.payload as { fields: Record<string, unknown> }).fields.note).toBe(
      'Two of them',
    );
    const moved = await caime.moveCard(card.id, 'sent');
    expect((moved.payload as { state: string }).state).toBe('sent');
    await caime.removeKit('sample');
    expect(await caime.kits()).toEqual([]);
  });

  it('posts, changes and takes back the organization’s updates', async () => {
    const posted = await caime.postUpdate(orgId, 'New colours in this week.');
    expect(posted.postedBy?.automated).toBe(true);
    const edited = await caime.editUpdate(orgId, posted.id, 'New colours in next week.');
    expect(edited.body).toBe('New colours in next week.');
    expect((await caime.updates(orgId)).updates.map((u) => u.id)).toEqual([posted.id]);
    await caime.removeUpdate(orgId, posted.id);
    expect((await caime.updates(orgId)).updates).toEqual([]);
  });

  it('checks a real delivery: the customer’s message arrives signed, typed and de-duplicable', async () => {
    received.length = 0;
    await lina.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'lina-0002',
      body: 'Blue, please.',
    });
    await runDueJobs(t.ctx);
    // The first message's delivery goes out with it too: this one is the delivery of the new one.
    const message = received.find(
      (r) => r.headers['caime-event'] === 'business.message' && r.body.includes('Blue, please.'),
    );
    expect(message).toBeDefined();
    const now = t.clock.now.getTime();
    const event = parseWebhook(secret, message!.headers, message!.body, { now });
    expect(event.event).toBe('business.message');
    if (event.event === 'business.message') {
      expect(event.data.conversationId).toBe(convo);
      expect(event.data.message.body).toBe('Blue, please.');
      expect(event.data.customer).toMatchObject({ id: lina.user.id, under18: false });
      expect(event.id).toBe(message!.headers['caime-delivery']);
    }
    expect(() => parseWebhook('wrong', message!.headers, message!.body, { now })).toThrow(
      'doesn’t match',
    );
  });

  it('lists its own deliveries, and retries a failed one with the whole schedule again', async () => {
    const { deliveries } = await caime.deliveries();
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0]).toMatchObject({ status: 'delivered', event: expect.any(String) });
    // Newest first; from a cursor, forward.
    const oldest = deliveries[deliveries.length - 1]!;
    const forward = (await caime.deliveries({ after: oldest.id })).deliveries;
    expect(forward.map((d) => d.id)).toEqual(
      deliveries
        .map((d) => d.id)
        .filter((id) => id !== oldest.id)
        .reverse(),
    );
    // One that gave up (the endpoint was down): the app sees why, and asks for it again.
    await t.ctx.db
      .updateTable('webhook_deliveries')
      .set({ status: 'failed', attempts: 6, last_error: 'No answer within 10 seconds' })
      .where('id', '=', oldest.id)
      .execute();
    const [failed] = (await caime.deliveries({ status: 'failed' })).deliveries;
    expect(failed).toMatchObject({ id: oldest.id, lastError: 'No answer within 10 seconds' });
    received.length = 0;
    const again = await caime.retryDelivery(oldest.id);
    expect(again).toMatchObject({ id: oldest.id, status: 'pending', attempts: 0 });
    await runDueJobs(t.ctx);
    expect(received.map((r) => r.headers['caime-delivery'])).toContain(oldest.id);
    expect((await caime.deliveries({ status: 'failed' })).deliveries).toEqual([]);
    // Not failed, or not this app's: nothing to retry.
    await expect(caime.retryDelivery(oldest.id)).rejects.toMatchObject({ status: 404 });
  });

  it('reads a file the customer sent, as the team would, and nothing outside the conversation', async () => {
    const boundary = `----caime${Date.now()}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\n`,
      ),
      Buffer.from('My insurance number is 12345.'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await t.app.inject({
      method: 'POST',
      url: '/v1/files',
      payload,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        authorization: `Bearer ${lina.token}`,
      },
    });
    expect(up.statusCode).toBe(201);
    const fileId = up.json().file.id as string;
    // Not yet in any conversation the bot is in: nothing.
    await expect(caime.file(fileId)).rejects.toMatchObject({ status: 404 });
    await lina.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'lina-file-1',
      kind: 'media',
      body: 'My details',
      fileIds: [fileId],
    });
    const res = await caime.file(fileId);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('My insurance number is 12345.');
    await expect(caime.thumbnail(fileId)).rejects.toMatchObject({ status: 404 });
  });

  it('hears a message removed for everyone, and a conversation erased, so it drops its copies', async () => {
    const { apps } = await noor.get(`/v1/orgs/${orgId}/apps`);
    await noor.req('PATCH', `/v1/orgs/${orgId}/apps/${apps[0].id}`, {
      events: ['business.message', 'message.deleted', 'conversation.erased'],
    });
    received.length = 0;
    const sent = await lina.post(`/v1/conversations/${convo}/messages`, {
      clientId: 'lina-0003',
      body: 'Please forget my number.',
    });
    await lina.del(`/v1/messages/${sent.message.id}`);
    await runDueJobs(t.ctx);
    const deleted = received.find((r) => r.headers['caime-event'] === 'message.deleted');
    expect(deleted).toBeDefined();
    const now = t.clock.now.getTime();
    const event = parseWebhook(secret, deleted!.headers, deleted!.body, { now });
    expect(event.event).toBe('message.deleted');
    if (event.event === 'message.deleted')
      expect(event.data).toEqual({ conversationId: convo, messageId: sent.message.id });
    // Erased at the customer's request (R54): one event for the whole conversation.
    received.length = 0;
    const erased = await noor.req('DELETE', `/v1/orgs/${orgId}/conversations/${convo}`);
    expect(erased.statusCode).toBe(200);
    await runDueJobs(t.ctx);
    const gone = received.find((r) => r.headers['caime-event'] === 'conversation.erased');
    expect(gone).toBeDefined();
    const e2 = parseWebhook(secret, gone!.headers, gone!.body, { now });
    if (e2.event === 'conversation.erased') {
      expect(e2.data.conversationId).toBe(convo);
      expect(e2.data.erased).toBeGreaterThan(0);
    }
  });
});
