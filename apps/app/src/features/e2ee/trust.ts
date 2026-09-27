/**
 * Which devices are whose (R18), as this device confirms them, never as the server says. A device
 * is someone's if this device confirmed it before, with the same keys (a pin), or if its chain of
 * introductions holds up to a first device of theirs accepted here. The first time someone is
 * seen, their first device is taken as theirs, and their code is there to compare. After that, a
 * new first device is them starting over: shown as their code changing, and held back (nothing
 * sealed for it) if their code was compared. A device of mine that doesn't hold up to mine is
 * never taken as mine.
 */
import type { DeviceView } from '@caishy/core/api';
import type { PublicJwk } from '@caishy/core/e2ee';
import { chainRoot, securityCode } from '@caishy/core/e2ee-crypto';
import { loadPin, loadSeen, type Pin, type SeenCode, savePin, saveSeen } from './keystore';

const same = (a: PublicJwk, b: PublicJwk) => a.x === b.x && a.y === b.y;
const matches = (p: Pin, d: Pick<DeviceView, 'userId' | 'encryptionKey' | 'signingKey'>) =>
  p.userId === d.userId &&
  same(p.encryptionKey, d.encryptionKey) &&
  same(p.signingKey, d.signingKey);
const pinOf = (d: DeviceView): Pin => ({
  userId: d.userId,
  encryptionKey: d.encryptionKey,
  signingKey: d.signingKey,
});

export interface Judgement {
  /** Confirmed as theirs. */
  trusted: DeviceView[];
  /** Listed as someone's, but not confirmed: never sealed for, never believed. */
  unconfirmed: DeviceView[];
  /** People whose first device changed since their code was compared: held until accepted. */
  held: Set<string>;
  /**
   * Each person's first device now (for their code): the one their confirmed devices hold up to,
   * or, with none confirmed, whichever the listed ones do.
   */
  roots: Map<string, DeviceView>;
}

/** A person's code: from the first device of their chain. */
export const codeOf = (root: DeviceView) => securityCode([root]);

/** Chains already walked in this page, by device and introduction: each is checked once. */
const walked = new Map<string, DeviceView | null>();
async function rootOf(d: DeviceView, byId: Map<string, DeviceView>): Promise<DeviceView | null> {
  const key = `${d.id}|${d.signingKey.x}|${d.introduction}`;
  if (walked.has(key)) return walked.get(key) ?? null;
  const root = (await chainRoot(d, (id) => byId.get(id))) as DeviceView | null;
  walked.set(key, root);
  return root;
}

/** What this device makes of devices the server listed, with what vouches for them. */
export async function judge(
  me: string,
  devices: DeviceView[],
  chain: DeviceView[] = [],
): Promise<Judgement> {
  const byId = new Map<string, DeviceView>();
  for (const d of [...chain, ...devices]) if (!byId.has(d.id)) byId.set(d.id, d);
  const out: Judgement = { trusted: [], unconfirmed: [], held: new Set(), roots: new Map() };
  const listedRoots = new Map<string, DeviceView>();
  const seenOf = new Map<string, SeenCode | null>();
  const seen = async (userId: string) => {
    if (!seenOf.has(userId)) seenOf.set(userId, await loadSeen(`${me}|${userId}`));
    return seenOf.get(userId) ?? null;
  };
  // Those confirmed before go first: they say which first device is each person's.
  const pins = new Map<string, Pin | null>();
  for (const d of devices) pins.set(d.id, await loadPin(`${me}|${d.id}`));
  const order = [...devices].sort((a, b) => Number(!pins.get(a.id)) - Number(!pins.get(b.id)));
  for (const d of order) {
    const pin = pins.get(d.id);
    const root = await rootOf(d, byId);
    if (root && !listedRoots.has(d.userId)) listedRoots.set(d.userId, root);
    // Confirmed before: only with the very keys it had then.
    if (pin) {
      if (!matches(pin, d)) {
        out.unconfirmed.push(d);
        continue;
      }
      out.trusted.push(d);
      const s = await seen(d.userId);
      if (root && !s?.roots) {
        // What it was confirmed under is theirs (a device's own chain, for me).
        const next = {
          code: s?.code ?? (await codeOf(root)),
          verified: s?.verified ?? false,
          roots: [root.id],
        };
        await saveSeen(`${me}|${d.userId}`, next);
        seenOf.set(d.userId, next);
      }
      const accepted = (await seen(d.userId))?.roots ?? [];
      if (root && accepted.includes(root.id) && !out.roots.has(d.userId))
        out.roots.set(d.userId, root);
      continue;
    }
    if (!root) {
      out.unconfirmed.push(d);
      continue;
    }
    const rootPin = await loadPin(`${me}|${root.id}`);
    if (rootPin && !matches(rootPin, root)) {
      out.unconfirmed.push(d);
      continue;
    }
    const s = await seen(d.userId);
    const accepted = s?.roots ?? [];
    let ok = accepted.includes(root.id);
    // Mine are only ever what my own devices' chain holds up to: never taken on sight.
    if (!ok && d.userId !== me) {
      if (!s || (!s.roots && s.code === (await codeOf(root)))) {
        // Seen for the first time here: their first device is theirs, and their code is shown.
        const next = {
          code: s?.code ?? (await codeOf(root)),
          verified: s?.verified ?? false,
          roots: [root.id],
        };
        await saveSeen(`${me}|${d.userId}`, next);
        seenOf.set(d.userId, next);
        ok = true;
      } else if (!s.verified) {
        // A new first device, for someone not compared: they started over. Their code shows
        // as changed until it's seen.
        const next = { ...s, roots: [...accepted, root.id] };
        await saveSeen(`${me}|${d.userId}`, next);
        seenOf.set(d.userId, next);
        ok = true;
      } else out.held.add(d.userId);
    }
    if (!ok) {
      out.unconfirmed.push(d);
      continue;
    }
    await savePin(`${me}|${root.id}`, pinOf(root));
    await savePin(`${me}|${d.id}`, pinOf(d));
    out.trusted.push(d);
    if (!out.roots.has(d.userId)) out.roots.set(d.userId, root);
  }
  for (const [userId, root] of listedRoots) if (!out.roots.has(userId)) out.roots.set(userId, root);
  return out;
}

/** A device this one confirmed before, as it was then. */
export const pinned = (me: string, id: string) => loadPin(`${me}|${id}`);

/** This device's own keys, as it made them: it's always its own. */
export async function pinSelf(me: string, d: DeviceView): Promise<void> {
  await savePin(`${me}|${d.id}`, pinOf(d));
}
