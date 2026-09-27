import type { SealedMessage } from '@caishy/core';
import { type DeviceKeys, newDeviceKeys, open, publicKeys, seal } from '@caishy/core/e2ee-crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client;
let zed: Client;
let convo: string;
let secret: string;
const heard: BusMessage[] = [];

/** A device of someone's, signed in on its own session, with its keys. */
interface Device {
  id: string;
  client: Client;
  keys: DeviceKeys;
}
async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
/** Another session for someone (another browser), signed in with their password. */
async function signIn(c: Client): Promise<Client> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: {
      identifier: `@${c.user.handle}`,
      password: 'correct horse battery',
      client: 'native',
    },
  });
  return clientFor(t, res.json().token, c.user);
}
async function device(c: Client, name = 'Browser'): Promise<Device> {
  const keys = await newDeviceKeys();
  const res = await c.req('POST', '/v1/e2ee/devices', { ...(await publicKeys(keys)), name });
  expect(res.statusCode, res.body).toBe(201);
  return { id: res.json().device.id, client: c, keys };
}
const devicesOf = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/devices`)).devices as Array<{
    id: string;
    userId: string;
    encryptionKey: any;
    signingKey: any;
  }>;
/** Seal a message on this device for these devices (all of the conversation's, by default). */
async function sealed(
  from: Device,
  conversationId: string,
  text: string,
  opts: { cid?: string; edit?: number; to?: Array<{ id: string; encryptionKey: any }> } = {},
): Promise<SealedMessage> {
  return seal({
    conversationId,
    cid: opts.cid ?? `cid-${Math.random().toString(36).slice(2, 12)}`,
    edit: opts.edit,
    payload: { body: text },
    from: { id: from.id, userId: from.client.user.id, keys: from.keys },
    to: opts.to ?? (await devicesOf(from.client, conversationId)),
  });
}
const send = (d: Device, conversationId: string, envelope: SealedMessage, extra = {}) =>
  d.client.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: envelope.cid,
    kind: 'text',
    sealed: envelope,
    ...extra,
  });
async function read(d: Device, conversationId: string, message: any) {
  const devices = await devicesOf(d.client, conversationId);
  return open({
    conversationId,
    sealed: message.sealed,
    me: { id: d.id, keys: d.keys },
    sender: devices.find((x) => x.id === message.sealed.from) ?? null,
  });
}

let noorLaptop: Device;
let noorPhone: Device;
let samLaptop: Device;

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  zed = await signup(t, { displayName: 'Zed Stranger' });
  convo = await connect(noor, sam);
  await connect(noor, omar);
  noorLaptop = await device(noor, 'Laptop');
  noorPhone = await device(await signIn(noor), 'Phone');
  samLaptop = await device(sam);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  heard.length = 0;
});

describe('private conversations (R18, PRD §61)', () => {
  it('a device registers its public keys for its own session, never a private one', async () => {
    const { devices } = await noor.get('/v1/e2ee/devices');
    expect(devices.map((d: any) => [d.name, d.current])).toEqual([
      ['Laptop', true],
      ['Phone', false],
    ]);
    const keys = await publicKeys(await newDeviceKeys());
    expect(
      (
        await zed.req('POST', '/v1/e2ee/devices', {
          ...keys,
          signingKey: { ...keys.signingKey, d: 'a-private-key-part-that-must-never-be-sent' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await zed.req('POST', '/v1/e2ee/devices', { ...keys, encryptionKey: { kty: 'RSA' } }))
        .statusCode,
    ).toBe(400);
    // Registering again on the same session replaces its device.
    const again = await device(zed);
    const once = await device(zed);
    expect((await zed.get('/v1/e2ee/devices')).devices.map((d: any) => d.id)).toEqual([once.id]);
    expect(again.id).not.toBe(once.id);
    // A token acts for someone; it never reads their private conversations.
    const pat = await zed.post('/v1/me/tokens', { name: 'Script', scopes: ['messages:read'] });
    const asToken = await t.app.inject({
      method: 'POST',
      url: '/v1/e2ee/devices',
      headers: { authorization: `Bearer ${pat.token}` },
      payload: keys,
    });
    expect(asToken.statusCode).toBe(403);
  });

  it('a private conversation is one of its own with a connection', async () => {
    const res = await noor.post('/v1/conversations', {
      kind: 'direct',
      userId: sam.user.id,
      private: true,
    });
    expect(res.conversation).toMatchObject({
      privacyClass: 'private',
      title: 'Private',
      kind: 'direct',
    });
    secret = res.conversation.id;
    expect(secret).not.toBe(convo);
    // Asked again, it's the same one; a named one is another.
    const again = await sam.post('/v1/conversations', {
      kind: 'direct',
      userId: noor.user.id,
      private: true,
    });
    expect(again.conversation.id).toBe(secret);
    const named = await noor.post('/v1/conversations', {
      kind: 'direct',
      userId: sam.user.id,
      private: true,
      title: 'Surprise for Omar',
    });
    expect(named.conversation).toMatchObject({
      privacyClass: 'private',
      title: 'Surprise for Omar',
    });
    expect(named.conversation.id).not.toBe(secret);
    expect(
      (
        await zed.req('POST', '/v1/conversations', {
          kind: 'direct',
          userId: noor.user.id,
          private: true,
        })
      ).json().error.message,
    ).toBe('Connect first to start a private conversation.');
    // Everyone's devices in it, to seal for; and nobody else's.
    expect((await devicesOf(noor, secret)).map((d) => d.id).sort()).toEqual(
      [noorLaptop.id, noorPhone.id, samLaptop.id].sort(),
    );
    expect((await zed.req('GET', `/v1/conversations/${secret}/devices`)).statusCode).toBe(404);
    expect((await noor.req('GET', `/v1/conversations/${convo}/devices`)).statusCode).toBe(400);
  });

  it('a message is kept only as an envelope each of their devices opens, and nothing else can', async () => {
    const envelope = await sealed(noorLaptop, secret, 'The door code is 4471');
    const res = await send(noorLaptop, secret, envelope);
    expect(res.statusCode, res.body).toBe(201);
    const message = res.json().message;
    expect(message).toMatchObject({ body: null, kind: 'text', entities: {} });
    // Nothing the server keeps reads as the message.
    const row = await t.ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', message.id)
      .executeTakeFirstOrThrow();
    expect(row.body).toBeNull();
    expect(JSON.stringify(row)).not.toContain('4471');
    // Sam's laptop reads it from what the server hands out; so do Noor's devices.
    const { messages } = await sam.get(`/v1/conversations/${secret}/messages`);
    for (const d of [samLaptop, noorLaptop, noorPhone])
      expect(await read(d, secret, messages.at(-1))).toEqual({
        ok: true,
        payload: { body: 'The door code is 4471' },
      });
    // Search never finds it; the inbox and the notification never say it.
    expect((await sam.get('/v1/search?q=4471')).results?.messages ?? []).toEqual([]);
    const inbox = await sam.get('/v1/inbox?view=all');
    const row2 = JSON.stringify(inbox);
    expect(row2).not.toContain('4471');
    await t.ctx.flush();
    const alerts = (await sam.get('/v1/notifications')).notifications.filter(
      (n: any) => n.data?.conversationId === secret,
    );
    expect(alerts.every((n: any) => !String(n.body).includes('4471'))).toBe(true);
  });

  it('sealed for every device of everyone in it, or it isn’t taken', async () => {
    const all = await devicesOf(noor, secret);
    const withoutSam = all.filter((d) => d.userId !== sam.user.id);
    const missing = await send(
      noorLaptop,
      secret,
      await sealed(noorLaptop, secret, 'hi', { to: withoutSam }),
    );
    expect(missing.statusCode).toBe(409);
    expect(missing.json().error.code).toBe('devices_changed');
    expect(
      missing
        .json()
        .error.details.devices.map((d: any) => d.id)
        .sort(),
    ).toEqual(all.map((d) => d.id).sort());
    // Only from one of the sender's own devices.
    const asSam = await sealed(samLaptop, secret, 'hi');
    expect((await send({ ...noorLaptop }, secret, asSam)).json().error.code).toBe('unknown_device');
    // And only as the person whose device it is: Noor's device can't sign as Sam.
    const signedAsSam = await seal({
      conversationId: secret,
      cid: 'cid-as-sam-01',
      payload: { body: 'hi' },
      from: { id: noorLaptop.id, userId: sam.user.id, keys: noorLaptop.keys },
      to: all,
    });
    expect((await send(noorLaptop, secret, signedAsSam)).json().error.code).toBe('unknown_device');
    // Only sealed text: no words the server could read, nothing it would have to.
    const env = await sealed(noorLaptop, secret, 'hi');
    expect((await send(noorLaptop, secret, env, { body: 'hi' })).statusCode).toBe(400);
    expect(
      (
        await noor.req('POST', `/v1/conversations/${secret}/messages`, {
          clientId: 'plain-000001',
          kind: 'text',
          body: 'hi',
        })
      ).statusCode,
    ).toBe(400);
    // Its id is the one it was sealed with.
    expect((await send(noorLaptop, secret, env, { clientId: 'another-cid-1' })).statusCode).toBe(
      400,
    );
    expect((await send(noorLaptop, convo, await sealed(noorLaptop, secret, 'hi'))).statusCode).toBe(
      400,
    );
  });

  it('edited by sealing it again, as its next edit; deleted, its envelope goes too', async () => {
    const env = await sealed(noorLaptop, secret, 'See you at 6');
    const message = (await send(noorLaptop, secret, env)).json().message;
    const edit = (e: SealedMessage) =>
      noor.req('PATCH', `/v1/messages/${message.id}`, { sealed: e });
    expect(
      (await edit(await sealed(noorLaptop, secret, 'See you at 7', { cid: env.cid }))).statusCode,
    ).toBe(400);
    expect(
      (
        await edit(
          await sealed(noorLaptop, secret, 'See you at 7', { cid: 'other-cid-9', edit: 1 }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await noor.req('PATCH', `/v1/messages/${message.id}`, { body: 'See you at 7' })).statusCode,
    ).toBe(400);
    const edited = await edit(
      await sealed(noorLaptop, secret, 'See you at 7', { cid: env.cid, edit: 1 }),
    );
    expect(edited.statusCode, edited.body).toBe(200);
    expect(await read(samLaptop, secret, edited.json().message)).toEqual({
      ok: true,
      payload: { body: 'See you at 7' },
    });
    await noor.del(`/v1/messages/${message.id}?forEveryone=true`);
    const row = await t.ctx.db
      .selectFrom('messages')
      .select('sealed')
      .where('id', '=', message.id)
      .executeTakeFirstOrThrow();
    expect(row.sealed).toBeNull();
  });

  it('what’s said in it stays in it: never forwarded, never written by a token', async () => {
    const message = (
      await send(noorLaptop, secret, await sealed(noorLaptop, secret, 'just us'))
    ).json().message;
    const fwd = await noor.req('POST', `/v1/messages/${message.id}/forward`, {
      conversationIds: [convo],
      clientId: 'forward-00001',
    });
    expect(fwd.statusCode).toBe(400);
    const plain = (
      await noor.post(`/v1/conversations/${convo}/messages`, {
        clientId: 'plain-00002',
        kind: 'text',
        body: 'hello',
      })
    ).message;
    const into = await noor.req('POST', `/v1/messages/${plain.id}/forward`, {
      conversationIds: [secret],
      clientId: 'forward-00002',
    });
    expect(into.statusCode).toBe(400);
    const pat = await noor.post('/v1/me/tokens', { name: 'Script', scopes: ['messages:write'] });
    const byToken = await t.app.inject({
      method: 'POST',
      url: `/v1/conversations/${secret}/messages`,
      headers: { authorization: `Bearer ${pat.token}` },
      payload: { clientId: 'token-000001', kind: 'text', body: 'from a script' },
    });
    expect(byToken.statusCode).toBe(403);
  });

  it('a new device is announced to those it shares private conversations with; a signed-out one is dropped', async () => {
    const tablet = await device(await signIn(sam), 'Tablet');
    expect(
      heard.filter((m) => m.event.type === 'devices.changed').map((m) => m.userIds),
    ).toContainEqual([noor.user.id]);
    expect((await devicesOf(noor, secret)).map((d) => d.id)).toContain(tablet.id);
    // Signed out on the tablet: nothing is sealed for it any more.
    await tablet.client.post('/v1/auth/logout', {});
    expect((await devicesOf(noor, secret)).map((d) => d.id)).not.toContain(tablet.id);
    const res = await send(noorLaptop, secret, await sealed(noorLaptop, secret, 'still here?'));
    expect(res.statusCode).toBe(201);
    // Removed from Settings: the same.
    expect((await noor.req('DELETE', `/v1/e2ee/devices/${noorPhone.id}`)).statusCode).toBe(200);
    expect((await devicesOf(sam, secret)).map((d) => d.id)).not.toContain(noorPhone.id);
    expect((await sam.req('DELETE', `/v1/e2ee/devices/${noorLaptop.id}`)).statusCode).toBe(404);
  });

  it('a private group seals for every device of everyone in it', async () => {
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Surprise party',
        memberIds: [sam.user.id, omar.user.id],
        private: true,
      })
    ).conversation;
    expect(group.privacyClass).toBe('private');
    // Omar has no device for private conversations yet: there's nothing to seal for him.
    const omarPhone = await device(omar);
    const env = await sealed(noorLaptop, group.id, 'Friday at 8');
    expect((await send(noorLaptop, group.id, env)).statusCode).toBe(201);
    const { messages } = await omar.get(`/v1/conversations/${group.id}/messages`);
    expect(await read(omarPhone, group.id, messages.at(-1))).toMatchObject({ ok: true });
  });
});
