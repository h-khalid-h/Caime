import { describe, expect, it } from 'vitest';
import { canonical, isPublicKey, isSealed, type PublicDevice, type SealedMessage } from './e2ee';
import {
  type DeviceKeys,
  newDeviceKeys,
  open,
  publicKeys,
  seal,
  securityCode,
} from './e2ee-crypto';

async function device(
  id: string,
  userId: string,
): Promise<{ keys: DeviceKeys; pub: PublicDevice }> {
  const keys = await newDeviceKeys();
  return { keys, pub: { id, userId, ...(await publicKeys(keys)) } };
}
const conversationId = '0193b3a4-1111-7000-8000-000000000001';

describe('end-to-end encryption (R18, PRD §61)', () => {
  it('only the devices a message was sealed for read it, each on its own', async () => {
    const noorLaptop = await device('dev-noor-laptop', 'noor');
    const noorPhone = await device('dev-noor-phone', 'noor');
    const sam = await device('dev-sam', 'sam');
    const later = await device('dev-sam-new', 'sam');
    const sealed = await seal({
      conversationId,
      cid: 'client-000001',
      payload: { body: 'The door code is 4471' },
      from: { id: noorLaptop.pub.id, userId: 'noor', keys: noorLaptop.keys },
      to: [noorLaptop.pub, noorPhone.pub, sam.pub],
    });
    // Nothing in it reads as the message.
    expect(JSON.stringify(sealed)).not.toContain('4471');
    for (const reader of [noorLaptop, noorPhone, sam])
      expect(
        await open({
          conversationId,
          sealed,
          me: { id: reader.pub.id, keys: reader.keys },
          sender: noorLaptop.pub,
        }),
      ).toEqual({ ok: true, payload: { body: 'The door code is 4471' } });
    // A device added after it was sent can't read it.
    expect(
      await open({
        conversationId,
        sealed,
        me: { id: later.pub.id, keys: later.keys },
        sender: noorLaptop.pub,
      }),
    ).toEqual({ ok: false, reason: 'not_for_this_device' });
  });

  it('the server can’t alter a message, forge one, or move it to another conversation', async () => {
    const noor = await device('dev-noor', 'noor');
    const sam = await device('dev-sam', 'sam');
    const server = await device('dev-noor', 'noor'); // keys the server made up, under Noor's id
    const sealed = await seal({
      conversationId,
      cid: 'client-000002',
      payload: { body: 'Meet at 6' },
      from: { id: noor.pub.id, userId: 'noor', keys: noor.keys },
      to: [noor.pub, sam.pub],
    });
    const read = (s: SealedMessage, over: Partial<Parameters<typeof open>[0]> = {}) =>
      open({
        conversationId,
        sealed: s,
        me: { id: sam.pub.id, keys: sam.keys },
        sender: noor.pub,
        ...over,
      });
    const flip = (b64: string) => (b64[0] === 'A' ? 'B' : 'A') + b64.slice(1);
    expect(await read({ ...sealed, ct: flip(sealed.ct) })).toEqual({
      ok: false,
      reason: 'unverified',
    });
    expect(await read({ ...sealed, edit: 1 })).toEqual({ ok: false, reason: 'unverified' });
    expect(
      await read({ ...sealed, keys: { [sam.pub.id]: sealed.keys[noor.pub.id] as string } }),
    ).toEqual({
      ok: false,
      reason: 'unverified',
    });
    expect(await read(sealed, { conversationId: '0193b3a4-2222-7000-8000-000000000002' })).toEqual({
      ok: false,
      reason: 'unverified',
    });
    // Signed by any other key, it isn't Noor's.
    const forged = await seal({
      conversationId,
      cid: 'client-000003',
      payload: { body: 'Send me the code' },
      from: { id: 'dev-noor', userId: 'noor', keys: server.keys },
      to: [sam.pub],
    });
    expect(await read(forged)).toEqual({ ok: false, reason: 'unverified' });
    expect(await read(sealed, { sender: null })).toEqual({ ok: false, reason: 'unverified' });
    expect(await read(sealed)).toMatchObject({ ok: true });
    // Nor pass Noor's words off as someone else's: her device listed as Sam's, or the envelope
    // saying it's Sam's, doesn't open.
    expect(await read(sealed, { sender: { ...noor.pub, userId: 'sam' } })).toEqual({
      ok: false,
      reason: 'unverified',
    });
    expect(
      await read({ ...sealed, by: 'sam' }, { sender: { ...noor.pub, userId: 'sam' } }),
    ).toEqual({ ok: false, reason: 'unverified' });
  });

  it('a device’s private keys never leave it', async () => {
    const { keys } = await device('dev-a', 'a');
    await expect(
      globalThis.crypto.subtle.exportKey('jwk', keys.encryption.privateKey),
    ).rejects.toThrow();
    await expect(
      globalThis.crypto.subtle.exportKey('jwk', keys.signing.privateKey),
    ).rejects.toThrow();
    const pub = await publicKeys(keys);
    expect(isPublicKey(pub.encryptionKey) && isPublicKey(pub.signingKey)).toBe(true);
    expect(Object.keys(pub.signingKey).sort()).toEqual(['crv', 'kty', 'x', 'y']);
  });

  it('a security code is the same wherever it’s worked out, and changes with the devices', async () => {
    const a = await device('dev-1', 'sam');
    const b = await device('dev-2', 'sam');
    const code = await securityCode([a.pub, b.pub]);
    expect(code).toMatch(/^\d{5}( \d{5}){5}$/);
    expect(await securityCode([b.pub, a.pub])).toBe(code);
    expect(await securityCode([a.pub])).not.toBe(code);
  });

  it('checks an envelope’s shape before it’s stored', async () => {
    const noor = await device('dev-noor', 'noor');
    const sealed = await seal({
      conversationId,
      cid: 'client-000004',
      payload: { body: 'hi' },
      from: { id: noor.pub.id, userId: 'noor', keys: noor.keys },
      to: [noor.pub],
    });
    expect(isSealed(sealed)).toBe(true);
    expect(isSealed(JSON.parse(JSON.stringify(sealed)))).toBe(true);
    expect(isSealed({ ...sealed, v: 2 })).toBe(false);
    expect(isSealed({ ...sealed, ct: 'not base64!' })).toBe(false);
    expect(isSealed({ ...sealed, epk: { ...sealed.epk, d: 'secret' } })).toBe(false);
    expect(isSealed({ ...sealed, keys: {} })).toBe(false);
    expect(isSealed({ ...sealed, by: '' })).toBe(false);
    expect(isSealed({ body: 'plain text' })).toBe(false);
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});
