/**
 * Private conversations on this device (R18) with the phones' encryption (./crypto, as vitest
 * resolves it) talking to everyone else's browsers (the real Web Crypto), a stand-in server and
 * an in-memory keystore: this device's keys made once and kept while the server has them, sealing
 * only for devices that hold up as their people's (and again when someone's devices changed),
 * opening only what a device confirmed as its sender's signed, in the conversation shown and at
 * its newest edit, and each person's security code: their first device's, remembered and
 * compared.
 */
import type { DeviceView, MessageView } from '@caime/core/api';
import { type IntroducedDevice, introductionText } from '@caime/core/e2ee';
import {
  type DeviceKeys,
  introduce,
  newDeviceKeys,
  open,
  publicKeys,
  seal,
} from '@caime/core/e2ee-crypto';
import { parseRecoveryKey, recoveryDevice } from '@caime/core/e2ee-recovery';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as thisDevice from './crypto';

const h = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: Record<string, unknown>,
    ) {
      super(message);
    }
  }
  const endpoints = {
    myDevices: vi.fn(),
    registerDevice: vi.fn(),
    approveDevice: vi.fn(),
    removeDevice: vi.fn(),
    registerRecovery: vi.fn(),
    restoreDevice: vi.fn(),
    conversationDevices: vi.fn(),
    send: vi.fn(),
    editMessage: vi.fn(),
  };
  const stores = {
    devices: new Map<string, unknown>(),
    seen: new Map<string, unknown>(),
    pins: new Map<string, unknown>(),
    private: new Map<string, unknown>(),
    edits: new Map<string, unknown>(),
    recovery: new Map<string, unknown>(),
  };
  const kv = (m: Map<string, unknown>) => ({
    load: vi.fn(async (k: string) => m.get(k) ?? null),
    save: vi.fn(async (k: string, v: unknown) => void m.set(k, v)),
  });
  const [devices, seen, pins, priv, edits] = [
    kv(stores.devices),
    kv(stores.seen),
    kv(stores.pins),
    kv(stores.private),
    kv(stores.edits),
  ];
  const keystore = {
    keystoreSupported: true,
    keystoreKeepsKeys: false,
    loadRecovery: vi.fn(async (u: string) => stores.recovery.get(u) ?? null),
    saveRecovery: vi.fn(async (u: string, v: unknown) => void stores.recovery.set(u, v)),
    forgetRecovery: vi.fn(async (u: string) => void stores.recovery.delete(u)),
    dropDevice: vi.fn(async (u: string) => {
      stores.devices.delete(u);
      stores.recovery.delete(u);
    }),
    loadDevice: devices.load,
    saveDevice: devices.save,
    loadSeen: seen.load,
    saveSeen: seen.save,
    loadPin: pins.load,
    savePin: pins.save,
    loadPrivate: vi.fn(async (k: string) => Boolean(stores.private.get(k))),
    savePrivate: vi.fn(async (k: string) => void stores.private.set(k, true)),
    loadOpened: edits.load,
    saveOpened: edits.save,
    forgetDevice: vi.fn(async (userId: string) => {
      stores.devices.delete(userId);
      stores.recovery.delete(userId);
      for (const m of [stores.seen, stores.pins, stores.private, stores.edits])
        for (const k of [...m.keys()]) if (k.startsWith(`${userId}|`)) m.delete(k);
    }),
  };
  let user: { id: string } | null = { id: 'noor' };
  const subscribers: Array<(s: { user: unknown }, before: { user: unknown }) => void> = [];
  const useSession = {
    getState: () => ({ user, signOut: vi.fn() }),
    subscribe: (f: (typeof subscribers)[number]) => {
      subscribers.push(f);
      return () => {};
    },
  };
  const signOut = () => {
    const before = { user };
    user = null;
    for (const f of subscribers) f({ user }, before);
  };
  const signIn = (id = 'noor') => {
    user = { id };
  };
  void priv;
  return { ApiError, endpoints, keystore, stores, useSession, signOut, signIn };
});
vi.mock('@/api/client', () => ({ ApiError: h.ApiError }));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));
vi.mock('@/state/session', () => ({ useSession: h.useSession }));
vi.mock('./keystore', () => h.keystore);

type Private = typeof import('./private');
let p: Private;
const conversationId = '0193b3a4-1111-7000-8000-00000000000a';
const elsewhere = '0193b3a4-1111-7000-8000-00000000000b';
let n = 0;

interface Other {
  keys: DeviceKeys;
  view: DeviceView;
}
/** Another device, with keys of its own: the first of its person's, or approved by `by`. */
async function someone(userId: string, by?: Other): Promise<Other> {
  const keys = await newDeviceKeys();
  const pub = { id: `dev-${userId}-${++n}`, userId, ...(await publicKeys(keys)) };
  const view: DeviceView = {
    ...pub,
    introducedBy: by?.view.id ?? null,
    introduction: await introduce(by ?? { keys }, pub),
  };
  return { keys, view };
}
/** This device as the server lists it, once it has registered. */
const registered = (): DeviceView => {
  const [[body]] = h.endpoints.registerDevice.mock.calls.slice(-1) as [[Record<string, any>]];
  return {
    id: body.id,
    userId: 'noor',
    encryptionKey: body.encryptionKey,
    signingKey: body.signingKey,
    introducedBy: null,
    introduction: body.introduction,
  };
};
const message = (
  sealed: unknown,
  senderId: string | null,
  id = `m-${++n}`,
  conv = conversationId,
) =>
  ({
    id,
    conversationId: conv,
    senderId,
    body: null,
    kind: 'text',
    sealed,
  }) as unknown as MessageView;
/** The server's list of a conversation's devices (everyone's in it, and what vouches for them). */
const listed = (devices: DeviceView[], people = ['noor', 'sam'], chain: DeviceView[] = []) =>
  h.endpoints.conversationDevices.mockResolvedValue({ people, devices, chain });
/** What the last send was sealed for. */
const sealedFor = (i = -1) => {
  const call = h.endpoints.send.mock.calls.at(i);
  if (!call) throw new Error('Nothing was sent.');
  return Object.keys((call[1] as Record<string, any>).sealed.keys).sort();
};
const sentOk = () =>
  h.endpoints.send.mockImplementation(async (_id: string, body: Record<string, unknown>) => ({
    message: message(body.sealed, 'noor'),
  }));
const from = (o: Other) => ({ id: o.view.id, userId: o.view.userId, keys: o.keys });

let approved = true;
beforeEach(async () => {
  vi.resetModules();
  for (const m of Object.values(h.stores)) m.clear();
  h.signIn();
  approved = true;
  for (const f of Object.values(h.endpoints)) f.mockReset();
  h.endpoints.registerDevice.mockImplementation(async (body: Record<string, unknown>) => {
    // As the server answers: a device it doesn't have can't be picked up, only registered.
    if (body.resume) throw new h.ApiError(409, 'not_resumable', 'Afresh.');
    return {
      device: {
        ...body,
        userId: 'noor',
        introducedBy: null,
        createdAt: new Date().toISOString(),
        current: true,
        approved,
        name: body.name ?? null,
      },
    };
  });
  h.endpoints.myDevices.mockImplementation(async () => ({
    devices: [...h.stores.devices.values()].map((d) => ({
      id: (d as { id: string }).id,
      current: true,
      approved,
    })),
    chain: [],
  }));
  p = await import('./private');
});

describe('private conversations on this device (R18)', () => {
  it('makes this device’s keys once, vouches for them, and keeps them while the server has it', async () => {
    const first = await p.ensureDevice();
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(1);
    // Only public keys go to the server, with this device's own word that they're its.
    const [[body]] = h.endpoints.registerDevice.mock.calls as [[Record<string, any>]];
    expect(Object.keys(body.encryptionKey).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(Object.keys(body.signingKey).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    const signing = await crypto.subtle.importKey(
      'jwk',
      body.signingKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const { fromBase64Url } = await import('@caime/core/e2ee-crypto');
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        signing,
        fromBase64Url(body.introduction),
        new TextEncoder().encode(introductionText({ ...body, userId: 'noor' } as never)),
      ),
    ).toBe(true);
    expect(await p.ensureDevice()).toBe(first);
    // The page opened again: the same keys, as long as the server still lists the device.
    vi.resetModules();
    p = await import('./private');
    expect((await p.ensureDevice()).id).toBe(first.id);
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(1);
    // Its session ended meanwhile, so the server forgot it: new keys, registered again.
    vi.resetModules();
    p = await import('./private');
    h.endpoints.myDevices.mockResolvedValueOnce({ devices: [], chain: [] });
    expect((await p.ensureDevice()).id).not.toBe(first.id);
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(3); // once to take the device up (refused), once afresh
  });

  it('seals only for the devices of those in it that hold up as theirs, and again when they change', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    const samNew = await someone('sam', sam);
    // Listed as Sam's, but no device of his approved it; and a device of someone not in it.
    const added = await someone('sam');
    const forged = { ...added.view, introducedBy: sam.view.id };
    const eve = await someone('eve');
    listed([mine, sam.view, forged, eve.view]);
    h.endpoints.send
      .mockRejectedValueOnce(
        new h.ApiError(409, 'devices_changed', 'Someone’s devices changed.', {
          people: ['noor', 'sam'],
          devices: [mine, sam.view, samNew.view, forged, eve.view],
          chain: [],
        }),
      )
      .mockImplementationOnce(async (_id: string, body: Record<string, unknown>) => ({
        message: message(body.sealed, 'noor'),
      }));
    const { message: sent } = await p.sendPrivate(conversationId, {
      clientId: 'client-000001',
      body: 'The code is 4471',
    });
    expect(sealedFor(0)).toEqual([mine.id, sam.view.id].sort());
    expect(sealedFor(1)).toEqual([mine.id, sam.view.id, samNew.view.id].sort());
    // No words go to the server, only the envelope.
    for (const [, b] of h.endpoints.send.mock.calls as Array<[string, Record<string, any>]>) {
      expect(b.body).toBeUndefined();
      expect(JSON.stringify(b)).not.toContain('4471');
      expect(b).toMatchObject({ clientId: 'client-000001', kind: 'text' });
    }
    // Sam's new device reads it; the device added as Sam's, and Eve's, never could.
    expect(
      await open({
        conversationId,
        sealed: sent.sealed as never,
        me: { id: samNew.view.id, keys: samNew.keys },
        sender: mine as never,
      }),
    ).toEqual({ ok: true, payload: { body: 'The code is 4471' } });
    // A server that keeps asking for a device that doesn't hold up gets nothing sent.
    h.endpoints.send.mockReset();
    h.endpoints.send.mockRejectedValue(
      new h.ApiError(409, 'devices_changed', 'Someone’s devices changed.', {
        people: ['noor', 'sam'],
        devices: [mine, sam.view, forged],
        chain: [],
      }),
    );
    await expect(
      p.sendPrivate(conversationId, { clientId: 'client-000002', body: 'x' }),
    ).rejects.toMatchObject({ code: 'unconfirmed_devices' });
    expect(h.endpoints.send).toHaveBeenCalledTimes(3);
  });

  it('a device the server forgot (its session ended) registers again, and sends', async () => {
    await p.ensureDevice();
    const first = registered();
    h.endpoints.conversationDevices.mockImplementation(async () => ({
      people: ['noor'],
      devices: [registered()],
      chain: [],
    }));
    h.endpoints.send.mockRejectedValueOnce(
      new h.ApiError(403, 'unknown_device', 'This device isn’t known.'),
    );
    sentOk();
    h.endpoints.myDevices.mockResolvedValueOnce({ devices: [], chain: [] });
    await p.sendPrivate(conversationId, { clientId: 'client-000003', body: 'hi' });
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(3); // once to take the device up (refused), once afresh
    const [, second] = h.endpoints.send.mock.calls.map((c) => c[1] as Record<string, any>);
    expect(second?.sealed.from).toBe(registered().id);
    expect(second?.sealed.from).not.toBe(first.id);
    // Anything else goes to the outbox as a failure, after a few tries at most.
    h.endpoints.send.mockReset();
    h.endpoints.send.mockRejectedValue(new h.ApiError(403, 'forbidden', 'No.'));
    await expect(
      p.sendPrivate(conversationId, { clientId: 'client-000004', body: 'x' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(h.endpoints.send).toHaveBeenCalledTimes(1);
  });

  it('opens only what a device confirmed as its sender’s signed, whatever the server says later', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    const sealed = await seal({
      conversationId,
      cid: 'client-000010',
      payload: { body: 'Meet at 6' },
      from: from(sam),
      to: [mine, sam.view],
    });
    listed([], ['noor', 'sam'], [sam.view]);
    expect(await p.openMessage(message(sealed, 'sam'), conversationId)).toEqual({
      ok: true,
      payload: { body: 'Meet at 6' },
    });
    // Later the server says that device has other keys: a message signed with those isn't his.
    const impostor = await newDeviceKeys();
    const swapped = { ...sam.view, ...(await publicKeys(impostor)) };
    listed([swapped], ['noor', 'sam'], [swapped]);
    const forged = await seal({
      conversationId,
      cid: 'client-000011',
      payload: { body: 'New account for the rent: 12-3456-78' },
      from: { id: sam.view.id, userId: 'sam', keys: impostor },
      to: [mine],
    });
    expect(await p.openMessage(message(forged, 'sam'), conversationId)).toEqual({
      ok: false,
      reason: 'unverified',
    });
    // Nor is anything sealed for that device with its new keys: they'd be someone else's.
    listed([mine, swapped], ['noor', 'sam'], [swapped]);
    sentOk();
    await p.sendPrivate(conversationId, { clientId: 'client-000013', body: 'Still you?' });
    expect(sealedFor()).toEqual([mine.id]);
    expect((await p.codesFor(conversationId)).find((c) => c.userId === 'sam')).toMatchObject({
      unconfirmed: 1,
    });
    // Nor is one the server says is Omar's.
    expect(await p.openMessage(message(sealed, 'omar', 'm-other'), conversationId)).toEqual({
      ok: false,
      reason: 'unverified',
    });
    expect(p.noteFor({ ok: false, reason: 'unverified' })).toBe(
      'This message couldn’t be checked, so it isn’t shown.',
    );
    // Sealed before this device could read private messages: said so.
    const before = await seal({
      conversationId,
      cid: 'client-000012',
      payload: { body: 'Earlier' },
      from: from(sam),
      to: [sam.view],
    });
    const result = await p.openMessage(message(before, 'sam'), conversationId);
    expect(result).toEqual({ ok: false, reason: 'not_for_this_device' });
    expect(p.noteFor(result)).toBe('Sent before this device could read private messages.');
  });

  it('opens a message only in its own conversation, at its newest edit, once', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    listed([sam.view], ['noor', 'sam'], [sam.view]);
    const edit = (text: string, e: number) =>
      seal({
        conversationId,
        cid: 'client-000020',
        edit: e,
        payload: { body: text },
        from: from(sam),
        to: [mine, sam.view],
      });
    const yes = await edit('Yes, sign it', 0);
    const no = await edit('No, don’t sign it', 1);
    // Moved into another conversation's page: it isn't that conversation's.
    expect(await p.openMessage(message(yes, 'sam', 'm-20'), elsewhere)).toMatchObject({
      ok: false,
      reason: 'unverified',
    });
    expect(await p.openMessage(message(yes, 'sam', 'm-20'), conversationId)).toMatchObject({
      ok: true,
    });
    expect(await p.openMessage(message(no, 'sam', 'm-20'), conversationId)).toMatchObject({
      ok: true,
      payload: { body: 'No, don’t sign it' },
    });
    // The first words, served again as current: an older version, not shown as the message.
    vi.resetModules();
    p = await import('./private');
    const stale = await p.openMessage(message(yes, 'sam', 'm-20'), conversationId);
    expect(stale).toEqual({ ok: false, reason: 'stale' });
    expect(p.noteFor(stale)).toBe('An older version of a message that was edited since.');
    // The same envelope as another message, later on: it's one message, already shown.
    expect(await p.openMessage(message(no, 'sam', 'm-21'), conversationId)).toEqual({
      ok: false,
      reason: 'unverified',
    });
  });

  it('what a message answers is sealed inside it', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    listed([mine, sam.view]);
    sentOk();
    const { message: sent } = await p.sendPrivate(
      conversationId,
      { clientId: 'client-000030', body: 'Yes', replyToId: 'm-pizza' },
      { by: 'sam', cid: 'client-pizza' },
    );
    expect(
      await open({
        conversationId,
        sealed: sent.sealed as never,
        me: { id: sam.view.id, keys: sam.keys },
        sender: mine as never,
      }),
    ).toEqual({ ok: true, payload: { body: 'Yes', replyTo: { by: 'sam', cid: 'client-pizza' } } });
  });

  it('what someone deleted since sent still opens, by the device that sent it', async () => {
    await p.ensureDevice();
    const mine = registered();
    const ada = await someone('ada');
    const sealed = await seal({
      conversationId,
      cid: 'client-000040',
      payload: { body: 'Keep this: the safe is 1234' },
      from: from(ada),
      to: [mine, ada.view],
    });
    listed([], ['noor'], [ada.view]);
    expect(await p.openMessage(message(sealed, null), conversationId)).toMatchObject({
      ok: true,
      payload: { body: 'Keep this: the safe is 1234' },
    });
  });

  it('a person’s code is their first device’s: approving a device keeps it, a device none of theirs approved doesn’t count', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    listed([mine, sam.view]);
    const first = await p.codesFor(conversationId);
    const samCode = first.find((c) => c.userId === 'sam');
    expect(samCode).toMatchObject({ changed: false, verified: false, held: false, unconfirmed: 0 });
    expect(samCode?.code).toMatch(/^\d{5}( \d{5}){5}$/);
    const myCode = first.find((c) => c.userId === 'noor');
    expect(myCode?.code).toMatch(/^\d{5}/);
    // Compared with Sam: it's his.
    await p.acceptCode('sam', samCode?.code ?? '', true, samCode?.rootId ?? null);
    // He approves his phone: his code is the same, still compared, and the phone is sealed for.
    const samPhone = await someone('sam', sam);
    // The server adds a device of its own as Sam's, and one as mine: neither counts.
    const added = { ...(await someone('sam')).view, introducedBy: sam.view.id };
    const asMe = await someone('noor');
    listed([mine, sam.view, samPhone.view, added, asMe.view]);
    const after = await p.codesFor(conversationId);
    expect(after.find((c) => c.userId === 'sam')).toMatchObject({
      code: samCode?.code,
      changed: false,
      verified: true,
      unconfirmed: 1,
    });
    expect(after.find((c) => c.userId === 'noor')).toMatchObject({
      code: myCode?.code,
      unconfirmed: 1,
    });
    sentOk();
    await p.sendPrivate(conversationId, { clientId: 'client-000050', body: 'hi' });
    expect(sealedFor()).toEqual([mine.id, sam.view.id, samPhone.view.id].sort());
  });

  it('someone starting over: their code changes, and once compared, nothing goes until it’s compared again', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    const omar = await someone('omar');
    listed([mine, sam.view, omar.view], ['noor', 'sam', 'omar']);
    const codes = await p.codesFor(conversationId);
    const samCode = codes.find((c) => c.userId === 'sam');
    await p.acceptCode('sam', samCode?.code ?? '', true, samCode?.rootId ?? null);
    // Both start over on new devices (or someone poses as them).
    const samAgain = await someone('sam');
    const omarAgain = await someone('omar');
    listed([mine, samAgain.view, omarAgain.view], ['noor', 'sam', 'omar']);
    const after = await p.codesFor(conversationId);
    // Omar, never compared: his new code shows as changed, and messages still reach him.
    expect(after.find((c) => c.userId === 'omar')).toMatchObject({ changed: true, held: false });
    // Sam, compared: held, and nothing is sent until his new code is compared.
    const held = after.find((c) => c.userId === 'sam');
    expect(held).toMatchObject({ changed: true, held: true, verified: false });
    sentOk();
    await expect(
      p.sendPrivate(conversationId, { clientId: 'client-000060', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'code_changed' });
    expect(h.endpoints.send).not.toHaveBeenCalled();
    // Compared again: it's his.
    await p.acceptCode('sam', held?.code ?? '', true, held?.rootId ?? null);
    await p.sendPrivate(conversationId, { clientId: 'client-000061', body: 'hi' });
    expect(sealedFor()).toEqual([mine.id, samAgain.view.id, omarAgain.view.id].sort());
  });

  it('a device waiting for approval reads and writes nothing, and one of mine approves it', async () => {
    approved = false;
    await p.ensureDevice();
    listed([]);
    await expect(
      p.sendPrivate(conversationId, { clientId: 'client-000070', body: 'hi' }),
    ).rejects.toMatchObject({ code: 'waiting' });
    const sam = await someone('sam');
    const sealed = await seal({
      conversationId,
      cid: 'client-000071',
      payload: { body: 'hello' },
      from: from(sam),
      to: [sam.view],
    });
    const waiting = await p.openMessage(message(sealed, 'sam'), conversationId);
    expect(waiting).toEqual({ ok: false, reason: 'waiting' });
    // On an approved device of mine, the one waiting is approved: signed by this one.
    vi.resetModules();
    for (const m of Object.values(h.stores)) m.clear();
    approved = true;
    p = await import('./private');
    const me = await p.ensureDevice();
    const laptop = await someone('noor');
    h.endpoints.myDevices.mockResolvedValue({
      devices: [
        { ...registered(), current: true, approved: true },
        { ...laptop.view, current: false, approved: false },
      ],
      chain: [],
    });
    h.endpoints.approveDevice.mockResolvedValue({ device: { ...laptop.view, approved: true } });
    await p.approveDevice(laptop.view.id);
    const [[id, body]] = h.endpoints.approveDevice.mock.calls as [
      [string, { introduction: string }],
    ];
    expect(id).toBe(laptop.view.id);
    const { chainRoot } = await import('@caime/core/e2ee-crypto');
    const self = registered();
    const approvedLaptop = { ...laptop.view, introducedBy: me.id, introduction: body.introduction };
    expect((await chainRoot(approvedLaptop, (x) => (x === self.id ? self : undefined)))?.id).toBe(
      self.id,
    );
  });

  it('a device another tab registered is taken up, never replaced', async () => {
    const one = await p.ensureDevice();
    // Another tab registered this browser again (its session was renewed there).
    // Made as this device makes its keys; everyone else's are a browser's (Web Crypto).
    const other = await thisDevice.newDeviceKeys();
    const otherId = 'dev-noor-other-tab';
    h.stores.devices.set('noor', { id: otherId, keys: other });
    h.endpoints.myDevices.mockResolvedValue({
      devices: [{ id: otherId, current: true, approved: true }],
      chain: [],
    });
    const sam = await someone('sam');
    const pub = await thisDevice.publicKeys(other);
    const sealed = await seal({
      conversationId,
      cid: 'client-000080',
      payload: { body: 'for the other tab’s device' },
      from: from(sam),
      to: [{ id: otherId, encryptionKey: pub.encryptionKey }, sam.view],
    });
    listed([], ['noor', 'sam'], [sam.view]);
    expect(await p.openMessage(message(sealed, 'sam'), conversationId)).toMatchObject({
      ok: true,
    });
    expect((await p.ensureDevice()).id).toBe(otherId);
    expect(one.id).not.toBe(otherId);
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(1);
  });

  it('signed out, this browser’s keys and all it kept for the account are gone', async () => {
    await p.ensureDevice();
    const sam = await someone('sam');
    listed([registered(), sam.view]);
    await p.codesFor(conversationId);
    expect(h.stores.devices.has('noor')).toBe(true);
    expect([...h.stores.pins.keys()].some((k) => k.startsWith('noor|'))).toBe(true);
    h.signOut();
    await vi.waitFor(() => expect(h.stores.devices.has('noor')).toBe(false));
    expect([...h.stores.pins.keys()].some((k) => k.startsWith('noor|'))).toBe(false);
    expect([...h.stores.seen.keys()].some((k) => k.startsWith('noor|'))).toBe(false);
    h.signIn();
    await p.ensureDevice();
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(2);
  });

  it('a recovery key made here stands for a device of mine (R41): introduced by this one, kept nowhere', async () => {
    const me = await p.ensureDevice();
    h.endpoints.registerRecovery.mockImplementation(async (body: Record<string, unknown>) => ({
      device: { ...body, userId: 'noor', introducedBy: me.id, approved: true, recovery: true },
    }));
    const key = await p.makeRecoveryKey();
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const [[body]] = h.endpoints.registerRecovery.mock.calls as [[Record<string, any>]];
    const rec = recoveryDevice(parseRecoveryKey(key) as Uint8Array);
    expect(body.id).toBe(rec.id);
    expect(body.encryptionKey).toEqual(rec.keys.encryption.publicKey);
    // Signed by this device, so my chain vouches for it.
    const { chainRoot } = await import('@caime/core/e2ee-crypto');
    const self = registered();
    expect(
      (
        await chainRoot(
          { ...(body as IntroducedDevice), userId: 'noor', introducedBy: me.id },
          (x) => (x === self.id ? self : undefined),
        )
      )?.id,
    ).toBe(self.id);
    // The key itself is on this device nowhere, and a waiting device can't make one.
    expect(h.stores.recovery.size).toBe(0);
    expect(JSON.stringify([...h.stores.devices.values()])).not.toContain(key.slice(0, 9));
    approved = false;
    vi.resetModules();
    p = await import('./private');
    for (const m of Object.values(h.stores)) m.clear();
    await expect(p.makeRecoveryKey()).rejects.toThrow('reads your private conversations already');
  });

  it('the key typed on a new device: it reads what was sealed for the recovery device before it, and is mine', async () => {
    // Noor's first device made a key; Sam sealed a message for it; every device was lost since.
    const first = await someone('noor');
    const key = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789';
    const rec = recoveryDevice(parseRecoveryKey(key) as Uint8Array);
    const recView: DeviceView = {
      id: rec.id,
      userId: 'noor',
      encryptionKey: rec.keys.encryption.publicKey,
      signingKey: rec.keys.signing.publicKey,
      introducedBy: first.view.id,
      introduction: await introduce(first, {
        id: rec.id,
        userId: 'noor',
        encryptionKey: rec.keys.encryption.publicKey,
        signingKey: rec.keys.signing.publicKey,
      }),
    };
    const sam = await someone('sam');
    const sealed = await seal({
      conversationId,
      cid: 'client-000090',
      payload: { body: 'The door code is 4471' },
      from: from(sam),
      to: [first.view, recView, sam.view],
    });
    // This new device waits.
    approved = false;
    const me = await p.ensureDevice();
    h.endpoints.myDevices.mockImplementation(async () => ({
      devices: [
        { ...registered(), current: true, approved, recovery: false },
        { ...recView, current: false, approved: true, recovery: true },
      ],
      chain: [first.view],
    }));
    listed([sam.view, recView], ['noor', 'sam'], [first.view]);
    expect(await p.openMessage(message(sealed, 'sam'), conversationId)).toEqual({
      ok: false,
      reason: 'waiting',
    });
    await expect(p.restoreFromRecoveryKey('not a key')).rejects.toThrow('isn’t a recovery key');
    await expect(
      p.restoreFromRecoveryKey('0000-0000-0000-0000-0000-0000-0000-0000'),
    ).rejects.toThrow('isn’t the recovery key for this account');
    expect(h.endpoints.restoreDevice).not.toHaveBeenCalled();
    h.endpoints.restoreDevice.mockImplementation(async () => {
      approved = true;
      return { device: { ...registered(), introducedBy: rec.id, approved: true } };
    });
    await p.restoreFromRecoveryKey(key.toLowerCase().replaceAll('-', ' '));
    const [[id, body]] = h.endpoints.restoreDevice.mock.calls as [
      [string, { introduction: string }],
    ];
    expect(id).toBe(me.id);
    // Its introduction is the recovery device's signature: the chain ends at Noor's first device.
    const { chainRoot } = await import('@caime/core/e2ee-crypto');
    const restored: DeviceView = {
      ...registered(),
      introducedBy: rec.id,
      introduction: body.introduction,
    };
    const all = [first.view, recView, restored];
    expect((await chainRoot(restored, (x) => all.find((d) => d.id === x)))?.id).toBe(first.view.id);
    expect((await p.ensureDevice()).approved).toBe(true);
    // The old message opens here now, with the recovery device's keys; new ones with its own.
    expect(await p.openMessage(message(sealed, 'sam'), conversationId)).toEqual({
      ok: true,
      payload: { body: 'The door code is 4471' },
    });
    const later = await seal({
      conversationId,
      cid: 'client-000091',
      payload: { body: 'and after' },
      from: from(sam),
      to: [registered(), recView, sam.view],
    });
    expect(await p.openMessage(message(later, 'sam'), conversationId)).toMatchObject({ ok: true });
    expect(await p.hasRecoveryKeysHere()).toBe(true);
    // Starting over here lets go of them: the recovery device is retired with the rest.
    await p.startOver();
    expect(h.stores.recovery.size).toBe(0);
  });

  it('a device the server still has after its session ended is taken up again, never once removed', async () => {
    const me = await p.ensureDevice();
    // Signed in again: the server lists nothing for this session, but the device stands.
    vi.resetModules();
    p = await import('./private');
    h.endpoints.myDevices.mockResolvedValue({ devices: [], chain: [] });
    h.endpoints.registerDevice.mockImplementation(async (body: Record<string, any>) => {
      if (!body.resume) throw new Error('registered afresh');
      return {
        device: {
          ...body,
          userId: 'noor',
          introducedBy: null,
          current: true,
          approved: true,
          name: null,
        },
      };
    });
    const back = await p.ensureDevice();
    expect(back.id).toBe(me.id);
    expect(h.endpoints.registerDevice).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: me.id, resume: true }),
    );
    // Removed meanwhile: the server refuses, its keys here go, and a new device registers.
    vi.resetModules();
    p = await import('./private');
    h.endpoints.registerDevice.mockImplementation(async (body: Record<string, any>) => {
      if (body.resume) throw new h.ApiError(409, 'not_resumable', 'Afresh.');
      return {
        device: {
          ...body,
          userId: 'noor',
          introducedBy: null,
          current: true,
          approved: false,
          name: null,
        },
      };
    });
    const fresh = await p.ensureDevice();
    expect(fresh.id).not.toBe(me.id);
    expect(h.keystore.dropDevice).toHaveBeenCalledWith('noor');
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(4);
  });
});
