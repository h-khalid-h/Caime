import { describe, expect, it } from 'vitest';
import type { IntroducedDevice, PublicDevice, SealedMessage } from './e2ee';
import * as web from './e2ee-crypto';
import * as noble from './e2ee-noble';

/** The two backends: the browser's Web Crypto (Node's here) and the phones' pure JavaScript. */
const BACKENDS = { web, noble } as const;
type Name = keyof typeof BACKENDS;
const PAIRS: Array<[Name, Name]> = [
  ['web', 'noble'],
  ['noble', 'web'],
  ['noble', 'noble'],
];

interface Device {
  on: Name;
  keys: unknown;
  pub: PublicDevice;
}
async function device(on: Name, id: string, userId: string): Promise<Device> {
  const b = BACKENDS[on];
  const keys = await b.newDeviceKeys();
  // biome-ignore lint/suspicious/noExplicitAny: each backend's keys go only to that backend.
  return { on, keys, pub: { id, userId, ...(await b.publicKeys(keys as any)) } };
}
const sealWith = (from: Device, input: Omit<Parameters<typeof web.seal>[0], 'from'>) =>
  BACKENDS[from.on].seal({
    ...input,
    // biome-ignore lint/suspicious/noExplicitAny: as above.
    from: { id: from.pub.id, userId: from.pub.userId, keys: from.keys as any },
  });
const openWith = (
  me: Device,
  sealed: SealedMessage,
  sender: PublicDevice | null,
  conversationId = CONVO,
) =>
  BACKENDS[me.on].open({
    conversationId,
    sealed,
    // biome-ignore lint/suspicious/noExplicitAny: as above.
    me: { id: me.pub.id, keys: me.keys as any },
    sender,
  });

const CONVO = '0193b3a4-1111-7000-8000-000000000001';
/** Every script a message might hold. */
const BODY = 'Meet at 7 — عند الباب 🌿 門 é\u{1F600}';

describe('the phones’ encryption is the browser’s, byte for byte (R18)', () => {
  it('exports the same functions as Web Crypto’s module', () => {
    expect(Object.keys(noble).sort()).toEqual(Object.keys(web).sort());
  });

  for (const [a, b] of PAIRS)
    it(`a message sealed on ${a} opens on ${b}, and only for the devices it was sealed for`, async () => {
      const sender = await device(a, 'dev-noor', 'noor');
      const reader = await device(b, 'dev-sam', 'sam');
      const later = await device(b, 'dev-sam-new', 'sam');
      const payload = { body: BODY, replyTo: { by: 'sam', cid: 'client-000000' } };
      const sealed = await sealWith(sender, {
        conversationId: CONVO,
        cid: 'client-000001',
        payload,
        to: [sender.pub, reader.pub],
      });
      expect(JSON.stringify(sealed)).not.toContain('Meet');
      expect(await openWith(reader, sealed, sender.pub)).toEqual({ ok: true, payload });
      expect(await openWith(sender, sealed, sender.pub)).toEqual({ ok: true, payload });
      expect(await openWith(later, sealed, sender.pub)).toEqual({
        ok: false,
        reason: 'not_for_this_device',
      });
    });

  it('a lone surrogate comes through as it was on either side (JSON escapes it)', async () => {
    for (const [a, b] of [...PAIRS, ['web', 'web'] as [Name, Name]]) {
      const sender = await device(a, 'dev-a', 'noor');
      const reader = await device(b, 'dev-b', 'sam');
      const sealed = await sealWith(sender, {
        conversationId: CONVO,
        cid: 'client-000009',
        payload: { body: 'half \uD83D here' },
        to: [reader.pub],
      });
      expect(await openWith(reader, sealed, sender.pub)).toEqual({
        ok: true,
        payload: { body: 'half \uD83D here' },
      });
    }
  });

  for (const [a, b] of PAIRS)
    it(`what ${b} refuses from ${a}: altered, forged, moved or passed off`, async () => {
      const sender = await device(a, 'dev-noor', 'noor');
      const reader = await device(b, 'dev-sam', 'sam');
      const other = await device(a, 'dev-omar', 'omar');
      const sealed = await sealWith(sender, {
        conversationId: CONVO,
        cid: 'client-000002',
        payload: { body: 'The door code is 4471' },
        to: [reader.pub],
      });
      const unverified = { ok: false, reason: 'unverified' };
      // Another conversation, another sender's keys, another person, text or key swapped.
      expect(await openWith(reader, sealed, sender.pub, `${CONVO.slice(0, -1)}2`)).toEqual(
        unverified,
      );
      expect(
        await openWith(reader, sealed, { ...sender.pub, signingKey: other.pub.signingKey }),
      ).toEqual(unverified);
      expect(await openWith(reader, sealed, { ...sender.pub, userId: 'omar' })).toEqual(unverified);
      expect(await openWith(reader, sealed, null)).toEqual(unverified);
      const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
      expect(await openWith(reader, { ...sealed, ct: flip(sealed.ct) }, sender.pub)).toEqual(
        unverified,
      );
      expect(await openWith(reader, { ...sealed, edit: 1 }, sender.pub)).toEqual(unverified);
      // Signed right, but the key inside was made for someone else: nothing to read.
      const resigned = { ...sealed, keys: { [reader.pub.id]: flip(sealed.keys[reader.pub.id]!) } };
      const { sig: _, ...body } = resigned;
      const forged = await sealWith(sender, {
        conversationId: CONVO,
        cid: body.cid,
        payload: { body: 'x' },
        to: [],
      });
      expect(await openWith(reader, { ...resigned, sig: forged.sig }, sender.pub)).toEqual(
        unverified,
      );
    });

  it('Web Crypto’s signatures verify here whichever half of the curve their s is on', async () => {
    // Web Crypto doesn't normalize s: about half its signatures have a high one, which a
    // verifier that insists on low s would refuse. Forty in a row can't all be low by chance
    // (one in 2^40).
    const sender = await device('web', 'dev-noor', 'noor');
    const reader = await device('noble', 'dev-sam', 'sam');
    for (let i = 0; i < 40; i++) {
      const sealed = await sealWith(sender, {
        conversationId: CONVO,
        cid: `client-${String(i).padStart(6, '0')}`,
        payload: { body: `message ${i}` },
        to: [reader.pub],
      });
      expect((await openWith(reader, sealed, sender.pub)).ok).toBe(true);
    }
  });

  it('a chain of devices made on both holds on both, and a security code is the same', async () => {
    const first = await device('web', 'dev-1', 'noor');
    const phone = await device('noble', 'dev-2', 'noor');
    const tablet = await device('web', 'dev-3', 'noor');
    const intro = async (d: Device, by: Device | null): Promise<IntroducedDevice> => ({
      ...d.pub,
      introducedBy: by ? by.pub.id : null,
      // biome-ignore lint/suspicious/noExplicitAny: as above.
      introduction: await BACKENDS[(by ?? d).on].introduce({ keys: (by ?? d).keys as any }, d.pub),
    });
    // The browser starts the chain, the phone joins it, and the phone approves the tablet.
    const chain = [await intro(first, null), await intro(phone, first), await intro(tablet, phone)];
    const lookup = (id: string) => chain.find((d) => d.id === id);
    for (const b of Object.values(BACKENDS)) {
      expect((await b.chainRoot(chain[2]!, lookup))?.id).toBe('dev-1');
      // A link broken by someone else's signature doesn't hold.
      const bad = { ...chain[2]!, introduction: chain[1]!.introduction };
      expect(await b.chainRoot(bad, lookup)).toBeNull();
    }
    const devices = [first.pub, phone.pub];
    expect(await noble.securityCode(devices)).toBe(await web.securityCode(devices));
    expect(await noble.securityCode(devices)).toMatch(/^(\d{5} ){5}\d{5}$/);
  });

  it('keys and envelopes made on a phone are what a browser takes', async () => {
    const phone = await device('noble', 'dev-phone', 'noor');
    for (const k of [phone.pub.encryptionKey, phone.pub.signingKey]) {
      expect(Object.keys(k).sort()).toEqual(['crv', 'kty', 'x', 'y']);
      expect(k).toMatchObject({ kty: 'EC', crv: 'P-256' });
      await expect(
        crypto.subtle.importKey('jwk', k, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
          'verify',
        ]),
      ).resolves.toBeTruthy();
    }
    // Off the curve: refused, never used.
    const reader = await device('noble', 'dev-sam', 'sam');
    const bent = { ...phone.pub.encryptionKey, y: phone.pub.signingKey.y };
    await expect(
      sealWith(phone, {
        conversationId: CONVO,
        cid: 'client-000003',
        payload: { body: 'x' },
        to: [{ id: reader.pub.id, encryptionKey: bent }],
      }),
    ).rejects.toThrow();
  });

  it('base64url reads and writes as the browser’s does, at every length', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(n));
      const s = noble.toBase64Url(bytes);
      expect(s).toBe(web.toBase64Url(bytes));
      expect([...noble.fromBase64Url(s)]).toEqual([...bytes]);
    }
    expect(() => noble.fromBase64Url('a*b')).toThrow();
  });
});
