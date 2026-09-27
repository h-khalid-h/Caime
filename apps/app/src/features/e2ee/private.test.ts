/**
 * Private conversations on this device (R18) against the real Web Crypto, a stand-in server and
 * an in-memory keystore: this device's keys made once and kept while the server has them,
 * sealing for every device (and again when someone's devices changed), opening only what a
 * sender's own device signed, and each person's security code remembered and compared.
 */
import type { DeviceView, MessageView } from '@caishy/core/api';
import { newDeviceKeys, publicKeys, seal } from '@caishy/core/e2ee-crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    conversationDevices: vi.fn(),
    send: vi.fn(),
    editMessage: vi.fn(),
  };
  const stored = new Map<string, unknown>();
  const seen = new Map<string, unknown>();
  const keystore = {
    keystoreSupported: true,
    loadDevice: vi.fn(async (userId: string) => stored.get(userId) ?? null),
    saveDevice: vi.fn(async (userId: string, d: unknown) => void stored.set(userId, d)),
    forgetDevice: vi.fn(async (userId: string) => void stored.delete(userId)),
    loadSeen: vi.fn(async (key: string) => seen.get(key) ?? null),
    saveSeen: vi.fn(async (key: string, s: unknown) => void seen.set(key, s)),
  };
  let user: { id: string } | null = { id: 'noor' };
  const subscribers: Array<(s: { user: unknown }, before: { user: unknown }) => void> = [];
  const useSession = {
    getState: () => ({ user }),
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
  return { ApiError, endpoints, keystore, stored, seen, useSession, signOut, signIn };
});
vi.mock('@/api/client', () => ({ ApiError: h.ApiError }));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));
vi.mock('@/state/session', () => ({ useSession: h.useSession }));
vi.mock('./keystore', () => h.keystore);

type Private = typeof import('./private');
let p: Private;
const conversationId = '0193b3a4-1111-7000-8000-00000000000a';
let n = 0;

/** Another device, with keys of its own, as the server lists it. */
async function someone(userId: string, id = `dev-${userId}-${++n}`) {
  const keys = await newDeviceKeys();
  const view: DeviceView = {
    id,
    userId,
    ...(await publicKeys(keys)),
    createdAt: new Date().toISOString(),
  };
  return { keys, view };
}
/** This device as the server lists it, once it has registered. */
const registered = () => {
  const [[body]] = h.endpoints.registerDevice.mock.calls.slice(-1) as [[Record<string, unknown>]];
  return {
    id: `dev-noor-${h.endpoints.registerDevice.mock.calls.length}`,
    userId: 'noor',
    ...body,
  };
};
const message = (sealed: unknown, senderId: string, id = `m-${++n}`) =>
  ({ id, conversationId, senderId, body: null, sealed }) as unknown as MessageView;

beforeEach(async () => {
  vi.resetModules();
  h.stored.clear();
  h.seen.clear();
  h.signIn();
  for (const f of Object.values(h.endpoints)) f.mockReset();
  h.endpoints.registerDevice.mockImplementation(async (body: Record<string, unknown>) => ({
    device: {
      id: `dev-noor-${h.endpoints.registerDevice.mock.calls.length}`,
      userId: 'noor',
      ...body,
      createdAt: new Date().toISOString(),
      current: true,
    },
  }));
  h.endpoints.myDevices.mockImplementation(async () => ({
    devices: [...h.stored.values()].map((d) => ({ id: (d as { id: string }).id, current: true })),
  }));
  p = await import('./private');
});

describe('private conversations on this device (R18)', () => {
  it('makes this device’s keys once, and keeps them while the server has the device', async () => {
    const first = await p.ensureDevice();
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(1);
    // Only public keys go to the server.
    const [[body]] = h.endpoints.registerDevice.mock.calls as [[Record<string, any>]];
    expect(Object.keys(body.encryptionKey).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(Object.keys(body.signingKey).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(await p.ensureDevice()).toBe(first);
    // The page opened again: the same keys, as long as the server still lists the device.
    vi.resetModules();
    p = await import('./private');
    expect((await p.ensureDevice()).id).toBe(first.id);
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(1);
    // Its session ended meanwhile, so the server forgot it: new keys, registered again.
    vi.resetModules();
    p = await import('./private');
    h.endpoints.myDevices.mockResolvedValueOnce({ devices: [] });
    expect((await p.ensureDevice()).id).not.toBe(first.id);
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(2);
  });

  it('seals for every device in the conversation, and again when someone’s devices changed', async () => {
    await p.ensureDevice();
    const sam = await someone('sam');
    const samNew = await someone('sam');
    const mine = registered();
    h.endpoints.conversationDevices.mockResolvedValue({ devices: [mine, sam.view], senders: [] });
    h.endpoints.send
      .mockRejectedValueOnce(
        new h.ApiError(409, 'devices_changed', 'Someone’s devices changed.', {
          devices: [mine, sam.view, samNew.view],
        }),
      )
      .mockImplementation(async (_id: string, body: Record<string, unknown>) => ({
        message: message(body.sealed, 'noor'),
      }));
    await p.sendPrivate(conversationId, { clientId: 'client-000001', body: 'The code is 4471' });
    const sent = h.endpoints.send.mock.calls.map((c) => c[1] as Record<string, any>);
    expect(sent).toHaveLength(2);
    expect(Object.keys(sent[0].sealed.keys).sort()).toEqual([mine.id, sam.view.id].sort());
    expect(Object.keys(sent[1].sealed.keys).sort()).toEqual(
      [mine.id, sam.view.id, samNew.view.id].sort(),
    );
    // No words go to the server, only the envelope.
    for (const b of sent) {
      expect(b.body).toBeUndefined();
      expect(JSON.stringify(b)).not.toContain('4471');
      expect(b).toMatchObject({ clientId: 'client-000001', kind: 'text' });
    }
    // Sam's new device reads it.
    const latest = h.endpoints.send.mock.results.at(-1);
    if (!latest) throw new Error('Nothing was sent.');
    const sealed = ((await latest.value) as { message: MessageView }).message.sealed;
    const { open } = await import('@caishy/core/e2ee-crypto');
    expect(
      await open({
        conversationId,
        sealed: sealed as never,
        me: { id: samNew.view.id, keys: samNew.keys },
        sender: mine as never,
      }),
    ).toEqual({ ok: true, payload: { body: 'The code is 4471' } });
  });

  it('a device the server forgot (its session ended) registers again, and sends', async () => {
    await p.ensureDevice();
    h.endpoints.conversationDevices.mockImplementation(async () => ({
      devices: [registered()],
      senders: [],
    }));
    h.endpoints.send
      .mockRejectedValueOnce(new h.ApiError(403, 'unknown_device', 'This device isn’t known.'))
      .mockImplementation(async (_id: string, body: Record<string, unknown>) => ({
        message: message(body.sealed, 'noor'),
      }));
    await p.sendPrivate(conversationId, { clientId: 'client-000002', body: 'hi' });
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(2);
    const [, second] = h.endpoints.send.mock.calls.map((c) => c[1] as Record<string, any>);
    expect(second?.sealed.from).toBe('dev-noor-2');
    // Anything else goes to the outbox as a failure, after a few tries at most.
    h.endpoints.send.mockReset();
    h.endpoints.send.mockRejectedValue(new h.ApiError(403, 'forbidden', 'No.'));
    await expect(
      p.sendPrivate(conversationId, { clientId: 'client-000003', body: 'x' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(h.endpoints.send).toHaveBeenCalledTimes(1);
  });

  it('opens only what the sender’s own device signed', async () => {
    const me = await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    const sealed = await seal({
      conversationId,
      cid: 'client-000010',
      payload: { body: 'Meet at 6' },
      from: { id: sam.view.id, userId: 'sam', keys: sam.keys },
      to: [mine as never, sam.view],
    });
    h.endpoints.conversationDevices.mockResolvedValue({ devices: [], senders: [sam.view] });
    expect(await p.openMessage(message(sealed, 'sam'))).toEqual({
      ok: true,
      payload: { body: 'Meet at 6' },
    });
    expect(me.id).toBe(mine.id);
    // The server says it's from Omar, and that Sam's device is his: it isn't shown.
    vi.resetModules();
    p = await import('./private');
    h.endpoints.conversationDevices.mockResolvedValue({
      devices: [],
      senders: [{ ...sam.view, userId: 'omar' }],
    });
    expect(await p.openMessage(message(sealed, 'omar'))).toEqual({
      ok: false,
      reason: 'unverified',
    });
    expect(p.noteFor({ ok: false, reason: 'unverified' })).toBe(
      'This message couldn’t be checked, so it isn’t shown.',
    );
    // Sealed before this device could read private messages: said so.
    vi.resetModules();
    p = await import('./private');
    const before = await seal({
      conversationId,
      cid: 'client-000011',
      payload: { body: 'Earlier' },
      from: { id: sam.view.id, userId: 'sam', keys: sam.keys },
      to: [sam.view],
    });
    h.endpoints.conversationDevices.mockResolvedValue({ devices: [], senders: [sam.view] });
    const result = await p.openMessage(message(before, 'sam'));
    expect(result).toEqual({ ok: false, reason: 'not_for_this_device' });
    expect(p.noteFor(result)).toBe('Sent before this device could read private messages.');
  });

  it('remembers each person’s code the first time, and says when it changes', async () => {
    await p.ensureDevice();
    const mine = registered();
    const sam = await someone('sam');
    h.endpoints.conversationDevices.mockResolvedValue({ devices: [mine, sam.view], senders: [] });
    const first = await p.codesFor(conversationId);
    const samCode = first.find((c) => c.userId === 'sam');
    expect(samCode).toMatchObject({ changed: false, verified: false });
    expect(samCode?.code).toMatch(/^\d{5}( \d{5}){5}$/);
    expect(first.find((c) => c.userId === 'noor')?.code).toMatch(/^\d{5}/);
    // Compared with Sam: it's his.
    await p.acceptCode('sam', samCode?.code ?? '', true);
    expect((await p.codesFor(conversationId)).find((c) => c.userId === 'sam')).toMatchObject({
      changed: false,
      verified: true,
    });
    // Sam signs in on another device: his code changes, and isn't the one compared.
    const samPhone = await someone('sam');
    h.endpoints.conversationDevices.mockResolvedValue({
      devices: [mine, sam.view, samPhone.view],
      senders: [],
    });
    const after = (await p.codesFor(conversationId)).find((c) => c.userId === 'sam');
    expect(after).toMatchObject({ changed: true, verified: false });
    expect(after?.code).not.toBe(samCode?.code);
    // Seen and accepted (not compared): no longer "changed", not verified either.
    await p.acceptCode('sam', after?.code ?? '', false);
    expect((await p.codesFor(conversationId)).find((c) => c.userId === 'sam')).toMatchObject({
      changed: false,
      verified: false,
    });
  });

  it('signed out, this browser’s keys for the account are gone', async () => {
    await p.ensureDevice();
    expect(h.stored.has('noor')).toBe(true);
    h.signOut();
    await vi.waitFor(() => expect(h.stored.has('noor')).toBe(false));
    h.signIn();
    await p.ensureDevice();
    expect(h.endpoints.registerDevice).toHaveBeenCalledTimes(2);
  });
});
