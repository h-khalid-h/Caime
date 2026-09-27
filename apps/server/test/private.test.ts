import { type PublicDevice, type SealedMessage, uuidv4, uuidv7 } from '@caishy/core';
import {
  chainRoot,
  type DeviceKeys,
  introduce,
  newDeviceKeys,
  open,
  publicKeys,
  seal,
} from '@caishy/core/e2ee-crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { runPeriodic } from '../src/lib/jobs';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client;
let zed: Client;
let convo: string;
let secret: string;
const heard: BusMessage[] = [];
/**
 * Everything published so far has reached the bus's listener: events travel by NOTIFY, which
 * arrives a moment after the request that sent them answers, in the order they were sent. So a
 * marker sent now, once heard, means everything before it was.
 */
async function drained() {
  const mark = uuidv4();
  await t.ctx.bus.publish([mark], { type: 'me.updated', data: {} });
  for (let i = 0; i < 300 && !heard.some((m) => m.userIds.includes(mark)); i++)
    await new Promise((r) => setTimeout(r, 10));
  const at = heard.findIndex((m) => m.userIds.includes(mark));
  if (at < 0) throw new Error('the bus never delivered its marker');
  heard.splice(at, 1);
}

/** A device of someone's, signed in on its own session, with its keys. */
interface Device {
  id: string;
  client: Client;
  keys: DeviceKeys;
  pub: PublicDevice;
  approved: boolean;
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
/** A new device registers: its keys, and its own signature over them. */
async function register(c: Client, name = 'Browser', extra: Record<string, unknown> = {}) {
  const keys = await newDeviceKeys();
  const pub: PublicDevice = { id: uuidv7(), userId: c.user.id, ...(await publicKeys(keys)) };
  const res = await c.req('POST', '/v1/e2ee/devices', {
    ...pub,
    userId: undefined,
    introduction: await introduce({ keys }, pub),
    name,
    ...extra,
  });
  return { res, keys, pub };
}
async function device(c: Client, name = 'Browser', extra: Record<string, unknown> = {}) {
  const { res, keys, pub } = await register(c, name, extra);
  expect(res.statusCode, res.body).toBe(201);
  const d: Device = { id: pub.id, client: c, keys, pub, approved: res.json().device.approved };
  return d;
}
/** One of theirs approves another of theirs that's waiting. */
const approve = async (by: Device, d: Device) =>
  by.client.req('POST', `/v1/e2ee/devices/${d.id}/approve`, {
    introduction: await introduce(by, d.pub),
  });
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
  expect((await approve(noorLaptop, noorPhone)).statusCode).toBe(200);
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
    const { devices, chain } = await noor.get('/v1/e2ee/devices');
    expect(devices.map((d: any) => [d.name, d.current, d.approved, d.introducedBy])).toEqual([
      ['Laptop', true, true, null],
      ['Phone', false, true, noorLaptop.id],
    ]);
    expect(chain.map((d: any) => d.id).sort()).toEqual([noorLaptop.id, noorPhone.id].sort());
    const keys = await publicKeys(await newDeviceKeys());
    const shaped = { id: uuidv7(), introduction: 'c2lnbmF0dXJl' };
    expect(
      (
        await zed.req('POST', '/v1/e2ee/devices', {
          ...shaped,
          ...keys,
          signingKey: { ...keys.signingKey, d: 'a-private-key-part-that-must-never-be-sent' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await zed.req('POST', '/v1/e2ee/devices', {
          ...shaped,
          ...keys,
          encryptionKey: { kty: 'RSA' },
        })
      ).statusCode,
    ).toBe(400);
    expect((await zed.req('POST', '/v1/e2ee/devices', keys)).statusCode).toBe(400);
    // Registering again on the same session replaces its device; an id is used once.
    const again = await device(zed);
    const once = await device(zed);
    expect((await zed.get('/v1/e2ee/devices')).devices.map((d: any) => d.id)).toEqual([once.id]);
    expect(again.id).not.toBe(once.id);
    expect(
      (
        await zed.req('POST', '/v1/e2ee/devices', {
          ...once.pub,
          userId: undefined,
          introduction: await introduce(once, once.pub),
        })
      ).json().error.code,
    ).toBe('device_exists');
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
    // Everyone's devices in it, to seal for, and what vouches for them; nobody else's.
    const view = await noor.get(`/v1/conversations/${secret}/devices`);
    expect(view.people.sort()).toEqual([noor.user.id, sam.user.id].sort());
    expect(view.devices.map((d: any) => d.id).sort()).toEqual(
      [noorLaptop.id, noorPhone.id, samLaptop.id].sort(),
    );
    // Nothing else of them: not when they were added, nor their names or sessions.
    expect(Object.keys(view.devices[0]).sort()).toEqual(
      ['encryptionKey', 'id', 'introducedBy', 'introduction', 'signingKey', 'userId'].sort(),
    );
    expect(view.chain.map((d: any) => d.id).sort()).toEqual(
      [noorLaptop.id, noorPhone.id, samLaptop.id].sort(),
    );
    expect((await zed.req('GET', `/v1/conversations/${secret}/devices`)).statusCode).toBe(404);
    expect((await noor.req('GET', `/v1/conversations/${convo}/devices`)).statusCode).toBe(400);
  });

  it('a message is kept only as an envelope each of their devices opens, and nothing else can', async () => {
    const envelope = await sealed(noorLaptop, secret, 'The door code is QUOKKA');
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
    expect(JSON.stringify(row)).not.toContain('QUOKKA');
    // Sam's laptop reads it from what the server hands out; so do Noor's devices.
    const { messages } = await sam.get(`/v1/conversations/${secret}/messages`);
    for (const d of [samLaptop, noorLaptop, noorPhone])
      expect(await read(d, secret, messages.at(-1))).toEqual({
        ok: true,
        payload: { body: 'The door code is QUOKKA' },
      });
    // Search never finds it; the inbox and the notification never say it.
    expect((await sam.get('/v1/search?q=QUOKKA')).results?.messages ?? []).toEqual([]);
    const inbox = await sam.get('/v1/inbox?view=all');
    const row2 = JSON.stringify(inbox);
    expect(row2).not.toContain('QUOKKA');
    await t.ctx.flush();
    const alerts = (await sam.get('/v1/notifications')).notifications.filter(
      (n: any) => n.data?.conversationId === secret,
    );
    expect(alerts.every((n: any) => !String(n.body).includes('QUOKKA'))).toBe(true);
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

  it('a later device waits until one of theirs approves it; only then is anything sealed for it', async () => {
    const tablet = await device(await signIn(sam), 'Tablet');
    expect(tablet.approved).toBe(false);
    // Sam's own devices hear of it (it's theirs to approve); nobody else yet.
    const told = () =>
      heard.filter((m) => m.event.type === 'devices.changed').flatMap((m) => m.userIds);
    await drained();
    expect(told()).toEqual([sam.user.id]);
    expect((await devicesOf(noor, secret)).map((d) => d.id)).not.toContain(tablet.id);
    // Waiting, it isn't sealed for, and can't write either.
    expect(
      (await send(noorLaptop, secret, await sealed(noorLaptop, secret, 'hi'))).statusCode,
    ).toBe(201);
    expect(
      (await send(tablet, secret, await sealed(tablet, secret, 'from the tablet'))).json().error
        .code,
    ).toBe('unknown_device');
    // It can't approve itself, nor can anyone else's device approve it.
    expect((await approve(tablet, tablet)).statusCode).toBe(403);
    expect((await approve(noorLaptop, tablet)).statusCode).toBe(404);
    // Approved from Sam's laptop: it's his, and sealed for from now on.
    heard.length = 0;
    const ok = await approve(samLaptop, tablet);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().device).toMatchObject({ approved: true, introducedBy: samLaptop.id });
    await drained();
    expect(told()).toContain(noor.user.id);
    expect((await devicesOf(noor, secret)).map((d) => d.id)).toContain(tablet.id);
    expect((await approve(samLaptop, tablet)).statusCode).toBe(404);
    // Signed out on the tablet: nothing is sealed for it any more.
    await tablet.client.post('/v1/auth/logout', {});
    expect((await devicesOf(noor, secret)).map((d) => d.id)).not.toContain(tablet.id);
    const res = await send(noorLaptop, secret, await sealed(noorLaptop, secret, 'still here?'));
    expect(res.statusCode).toBe(201);
  });

  it('what vouches for a device is handed out even once the device that approved it is gone', async () => {
    const kim = await signup(t, { displayName: 'Kim Chain' });
    await connect(noor, kim);
    const kimPhone = await device(kim, 'Phone');
    const kimLaptop = await device(await signIn(kim), 'Laptop');
    expect((await approve(kimPhone, kimLaptop)).statusCode).toBe(200);
    await kimPhone.client.post('/v1/auth/logout', {});
    const direct = (
      await noor.post('/v1/conversations', { kind: 'direct', userId: kim.user.id, private: true })
    ).conversation.id;
    const view = await noor.get(`/v1/conversations/${direct}/devices`);
    expect(view.devices.map((d: any) => d.id)).toEqual(
      expect.arrayContaining([kimLaptop.id, noorLaptop.id]),
    );
    expect(view.devices.map((d: any) => d.id)).not.toContain(kimPhone.id);
    const laptop = view.devices.find((d: any) => d.id === kimLaptop.id);
    expect(laptop.introducedBy).toBe(kimPhone.id);
    expect(view.chain.find((d: any) => d.id === kimPhone.id)).toMatchObject({ introducedBy: null });
    // A device checks it itself: the laptop's approval holds up to Kim's first device.
    const lookup = (id: string) => view.chain.find((d: any) => d.id === id);
    expect((await chainRoot(laptop, lookup))?.id).toBe(kimPhone.id);
  });

  it('removing a device signs it out, so it can’t simply come back', async () => {
    const extra = await device(await signIn(noor), 'Old laptop');
    expect((await approve(noorLaptop, extra)).statusCode).toBe(200);
    const gone = await noor.req('DELETE', `/v1/e2ee/devices/${extra.id}`);
    expect(gone.json()).toEqual({ ok: true, signedOut: false });
    expect((await devicesOf(sam, secret)).map((d) => d.id)).not.toContain(extra.id);
    expect((await extra.client.req('GET', '/v1/me')).statusCode).toBe(401);
    expect((await register(extra.client)).res.statusCode).toBe(401);
    expect((await sam.req('DELETE', `/v1/e2ee/devices/${noorLaptop.id}`)).statusCode).toBe(404);
    // One waiting that isn't theirs ("Not me"): removed, and that sign-in ends.
    const stranger = await device(await signIn(noor), 'Unknown');
    expect(stranger.approved).toBe(false);
    expect((await noor.req('DELETE', `/v1/e2ee/devices/${stranger.id}`)).statusCode).toBe(200);
    expect((await stranger.client.req('GET', '/v1/me')).statusCode).toBe(401);
  });

  it('starting over on a device retires the others: nothing is sealed for them after', async () => {
    const omarPhone = await device(omar, 'Phone');
    expect(omarPhone.approved).toBe(true);
    const laptop = await device(await signIn(omar), 'Laptop');
    expect(laptop.approved).toBe(false);
    const fresh = await device(await signIn(omar), 'New phone', { startOver: true });
    expect(fresh.approved).toBe(true);
    const { devices } = await omar.get('/v1/e2ee/devices');
    expect(devices.map((d: any) => d.id)).toEqual([fresh.id]);
  });

  it('a private group seals for every device of everyone in it, and holds up to 64 people', async () => {
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Surprise party',
        memberIds: [sam.user.id, omar.user.id],
        private: true,
      })
    ).conversation;
    expect(group.privacyClass).toBe('private');
    const omarPhone = (await omar.get('/v1/e2ee/devices')).devices[0];
    expect(omarPhone).toBeDefined();
    const env = await sealed(noorLaptop, group.id, 'Friday at 8');
    expect((await send(noorLaptop, group.id, env)).statusCode).toBe(201);
    expect(Object.keys(env.keys)).toContain(omarPhone.id);
    // Each message is sealed for every device in it, so it can't grow past 64 people.
    const many = Array.from({ length: 64 }, () => uuidv7());
    const tooBig = await noor.req('POST', '/v1/conversations', {
      kind: 'group',
      title: 'Everyone',
      memberIds: many,
      private: true,
    });
    expect(tooBig.statusCode).toBe(400);
    expect(tooBig.json().error.message).toMatch(/^A private group holds up to 64 people/);
    for (const id of many.slice(0, 61))
      await sql`insert into users (id, email, handle, password_hash, display_name, privacy)
        values (${id}, ${`${id}@example.com`}, ${`u${id.slice(-12)}`}, 'x', 'Someone', '{}')`.execute(
        t.ctx.db,
      );
    await t.ctx.db
      .insertInto('participants')
      .values(many.slice(0, 61).map((u) => ({ conversation_id: group.id, user_id: u })))
      .execute();
    const zedFriend = await connect(noor, zed);
    expect(zedFriend).toBeTruthy();
    const full = await noor.req('POST', `/v1/conversations/${group.id}/members`, {
      userIds: [zed.user.id],
    });
    expect(full.statusCode).toBe(400);
    expect(full.json().error.message).toMatch(/^A private group holds up to 64 people/);
  });

  it('what’s being written stays on the device; what disappears goes, envelope and all', async () => {
    const draft = await noor.req('PATCH', `/v1/conversations/${secret}`, { draft: 'The code is' });
    expect(draft.statusCode).toBe(400);
    expect(
      (await noor.req('PATCH', `/v1/conversations/${convo}`, { draft: 'hello' })).statusCode,
    ).toBe(200);
    // Clearing one is fine: there's nothing in it.
    expect(
      (await noor.req('PATCH', `/v1/conversations/${secret}`, { draft: null })).statusCode,
    ).toBe(200);
    await noor.patch(`/v1/conversations/${secret}`, { retentionDays: 1 });
    const message = (
      await send(noorLaptop, secret, await sealed(noorLaptop, secret, 'gone tomorrow'))
    ).json().message;
    t.clock.advance(2 * 86_400_000);
    await runPeriodic(t.ctx);
    const row = await t.ctx.db
      .selectFrom('messages')
      .select(['sealed', 'deleted_at'])
      .where('id', '=', message.id)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.sealed).toBeNull();
  });

  it('someone blocked sees nothing of the other’s devices, nor hears of new ones', async () => {
    const pia = await signup(t, { displayName: 'Pia Blocked' });
    await connect(noor, pia);
    const piaLaptop = await device(pia);
    const direct = (
      await noor.post('/v1/conversations', { kind: 'direct', userId: pia.user.id, private: true })
    ).conversation.id;
    expect((await devicesOf(pia, direct)).map((d) => d.userId)).toContain(noor.user.id);
    await noor.post('/v1/blocks', { userId: pia.user.id });
    expect((await devicesOf(pia, direct)).map((d) => d.userId)).toEqual([pia.user.id]);
    heard.length = 0;
    const another = await device(await signIn(noor), 'Tablet');
    await approve(noorLaptop, another);
    await drained();
    expect(
      heard.filter((m) => m.event.type === 'devices.changed').flatMap((m) => m.userIds),
    ).not.toContain(pia.user.id);
    expect(piaLaptop.approved).toBe(true);
  });

  it('a deleted account’s devices stay, keys only, so what it sent can still be checked', async () => {
    const ada = await signup(t, { displayName: 'Ada Leaving' });
    await connect(noor, ada);
    const adaLaptop = await device(ada, 'Ada’s laptop');
    const direct = (
      await noor.post('/v1/conversations', { kind: 'direct', userId: ada.user.id, private: true })
    ).conversation.id;
    const env = await sealed(adaLaptop, direct, 'Keep this: the safe is 1234');
    const sent = (await send(adaLaptop, direct, env)).json().message;
    expect(
      (await ada.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBeLessThan(300);
    const { messages } = await noor.get(`/v1/conversations/${direct}/messages`);
    const kept = messages.find((m: any) => m.id === sent.id);
    expect(kept.senderId).toBeNull();
    // Nothing is sealed for it any more, but its keys still check what it sent.
    const view = await noor.get(`/v1/conversations/${direct}/devices?ids=${adaLaptop.id}`);
    expect(view.devices.map((d: any) => d.userId)).not.toContain(ada.user.id);
    const theirs = view.chain.find((d: any) => d.id === adaLaptop.id);
    expect(theirs).toMatchObject({ userId: ada.user.id, introducedBy: null });
    const row = await t.ctx.db
      .selectFrom('e2ee_devices')
      .select(['name', 'revoked_at'])
      .where('id', '=', adaLaptop.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ name: null });
    expect(row.revoked_at).not.toBeNull();
    expect(
      await open({
        conversationId: direct,
        sealed: kept.sealed,
        me: { id: noorLaptop.id, keys: noorLaptop.keys },
        sender: theirs,
      }),
    ).toMatchObject({ ok: true, payload: { body: 'Keep this: the safe is 1234' } });
  });
});
