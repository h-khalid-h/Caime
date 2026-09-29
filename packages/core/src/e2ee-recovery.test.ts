import { describe, expect, it } from 'vitest';
import type { IntroducedDevice, PublicDevice } from './e2ee';
import * as web from './e2ee-crypto';
import * as noble from './e2ee-noble';
import {
  formatRecoveryKey,
  looksLikeRecoveryKey,
  newRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_BYTES,
  recoveryDevice,
} from './e2ee-recovery';

const CONVO = '0193b3a4-1111-7000-8000-000000000001';

describe('the recovery key (R41)', () => {
  it('is 32 letters and digits in eight groups, and reads back however it was written', () => {
    const key = newRecoveryKey();
    expect(key).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const bytes = parseRecoveryKey(key);
    expect(bytes).toHaveLength(RECOVERY_KEY_BYTES);
    expect(formatRecoveryKey(bytes as Uint8Array)).toBe(key);
    // Lowercase, no dashes, spaces, and the look-alikes.
    const sloppy = key.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'l');
    expect(parseRecoveryKey(sloppy)).toEqual(bytes);
    expect(looksLikeRecoveryKey(sloppy)).toBe(true);
    expect(parseRecoveryKey(key.slice(0, -1))).toBeNull();
    expect(parseRecoveryKey(`${key.slice(0, -1)}U`)).toBeNull();
    expect(newRecoveryKey()).not.toBe(key);
  });

  it('stands for one device, the same every time, with a UUID the server takes', () => {
    const bytes = parseRecoveryKey(newRecoveryKey()) as Uint8Array;
    const a = recoveryDevice(bytes);
    const b = recoveryDevice(new Uint8Array(bytes));
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b.id).toBe(a.id);
    expect(b.keys.encryption.publicKey).toEqual(a.keys.encryption.publicKey);
    expect(b.keys.signing.publicKey).toEqual(a.keys.signing.publicKey);
    expect(a.keys.signing.publicKey).not.toEqual(a.keys.encryption.publicKey);
    const other = recoveryDevice(parseRecoveryKey(newRecoveryKey()) as Uint8Array);
    expect(other.id).not.toBe(a.id);
    expect(() => recoveryDevice(bytes.slice(1))).toThrow();
  });

  for (const [madeOn, restoredOn] of [
    ['web', 'noble'],
    ['noble', 'web'],
    ['web', 'web'],
    ['noble', 'noble'],
  ] as const)
    it(`registered from ${madeOn}, restored on ${restoredOn}: reads what was sealed for it, and vouches for the new device`, async () => {
      // biome-ignore lint/suspicious/noExplicitAny: each backend's keys go only to that backend.
      const backends = { web, noble } as Record<string, any>;
      const maker = backends[madeOn] as typeof web;
      const restorer = backends[restoredOn] as typeof web;
      // Noor's first device makes a recovery key and introduces the recovery device.
      const first = await maker.newDeviceKeys();
      const firstPub: PublicDevice = {
        id: 'dev-1',
        userId: 'noor',
        ...(await maker.publicKeys(first)),
      };
      const key = parseRecoveryKey(newRecoveryKey()) as Uint8Array;
      const recovery = recoveryDevice(key);
      const recoveryPub: PublicDevice = {
        id: recovery.id,
        userId: 'noor',
        encryptionKey: recovery.keys.encryption.publicKey,
        signingKey: recovery.keys.signing.publicKey,
      };
      const chain: IntroducedDevice[] = [
        {
          ...firstPub,
          introducedBy: null,
          introduction: await maker.introduce({ keys: first }, firstPub),
        },
        {
          ...recoveryPub,
          introducedBy: 'dev-1',
          introduction: await maker.introduce({ keys: first }, recoveryPub),
        },
      ];
      // Sam seals for both of Noor's devices.
      const sam = await maker.newDeviceKeys();
      const samPub: PublicDevice = {
        id: 'dev-sam',
        userId: 'sam',
        ...(await maker.publicKeys(sam)),
      };
      const sealed = await maker.seal({
        conversationId: CONVO,
        cid: 'client-000001',
        payload: { body: 'The door code is 4471' },
        from: { id: 'dev-sam', userId: 'sam', keys: sam },
        to: [firstPub, recoveryPub, samPub],
      });
      // Every device lost: a new one types the key.
      const restored = await restorer.importDeviceKeys(recoveryDevice(key).keys);
      expect(await restorer.publicKeys(restored)).toEqual({
        encryptionKey: recoveryPub.encryptionKey,
        signingKey: recoveryPub.signingKey,
      });
      expect(
        await restorer.open({
          conversationId: CONVO,
          sealed,
          me: { id: recovery.id, keys: restored },
          sender: samPub,
        }),
      ).toEqual({ ok: true, payload: { body: 'The door code is 4471' } });
      // The new device is introduced by the recovery device: its chain still ends at dev-1, so
      // Noor's code is unchanged, and the introduction holds up on either side.
      const fresh = await restorer.newDeviceKeys();
      const freshPub: PublicDevice = {
        id: 'dev-2',
        userId: 'noor',
        ...(await restorer.publicKeys(fresh)),
      };
      const introduced: IntroducedDevice = {
        ...freshPub,
        introducedBy: recovery.id,
        introduction: await restorer.introduce({ keys: restored }, freshPub),
      };
      const all = [...chain, introduced];
      for (const b of Object.values(backends)) {
        expect(
          (await b.chainRoot(introduced, (id: string) => all.find((d) => d.id === id)))?.id,
        ).toBe('dev-1');
        expect(await b.securityCode([chain[0] as PublicDevice])).toBe(
          await b.securityCode([firstPub]),
        );
      }
      // A wrong key derives another device, which opens nothing and vouches for nothing.
      const wrong = await restorer.importDeviceKeys(
        recoveryDevice(parseRecoveryKey(newRecoveryKey()) as Uint8Array).keys,
      );
      expect(
        (
          await restorer.open({
            conversationId: CONVO,
            sealed,
            me: { id: recovery.id, keys: wrong },
            sender: samPub,
          })
        ).ok,
      ).toBe(false);
      const forged: IntroducedDevice = {
        ...freshPub,
        introducedBy: recovery.id,
        introduction: await restorer.introduce({ keys: wrong }, freshPub),
      };
      expect(
        await web.chainRoot(forged, (id) => [...chain, forged].find((d) => d.id === id)),
      ).toBeNull();
    });
});
