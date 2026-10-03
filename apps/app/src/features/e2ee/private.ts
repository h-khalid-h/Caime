/**
 * Private conversations on this device (R18, PRD §61): its keys, sealing what it sends for the
 * devices of the people in the conversation that this device has confirmed as theirs (./trust),
 * opening what it's sent only from a device confirmed as its sender's, and each person's security
 * code. A new device of mine waits until one of mine approves it; this device approves those.
 * The keys live only in this browser (keystore); the server sees envelopes.
 */
import type { DeviceView, MessageView, MyDeviceView } from '@caime/core/api';
import type { PrivatePayload, SealedMessage } from '@caime/core/e2ee';
import { newRecoveryKey, parseRecoveryKey, recoveryDevice } from '@caime/core/e2ee-recovery';
import { msg, tr } from '@caime/core/i18n';
import { uuidv7 } from '@caime/core/ids';
import { ApiError } from '@/api/client';
import { endpoints, type SendBody } from '@/api/endpoints';
import { useSession } from '@/state/session';
import {
  type DeviceKeys,
  e2eeSupported,
  importDeviceKeys,
  introduce,
  newDeviceKeys,
  type OpenResult,
  open,
  publicKeys,
  seal,
} from './crypto';
import { deviceName } from './device';
import {
  dropDevice,
  forgetDevice,
  forgetRecovery,
  keystoreSupported,
  loadDevice,
  loadOpened,
  loadRecovery,
  loadSeen,
  saveDevice,
  saveOpened,
  saveRecovery,
  saveSeen,
} from './keystore';
import { forgetKnown } from './known';
import { codeOf, judge, pinned, pinSelf } from './trust';

export { privateSupported } from './support';

export interface Mine {
  userId: string;
  id: string;
  keys: DeviceKeys;
  /** Approved by one of theirs (or the first): until then nothing is sealed for it. */
  approved: boolean;
}
let mine: Mine | null = null;
let checkedAt = 0;
let ensuring: Promise<Mine> | null = null;
const RECHECK_MS = 30_000;

/** One tab at a time registers this browser's device: two at once would retire each other's. */
function oneTab<T>(userId: string, f: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
  return locks ? (locks.request(`caime-e2ee:${userId}`, f) as Promise<T>) : f();
}

const signedInUser = () => {
  const userId = useSession.getState().user?.id;
  if (!userId || !keystoreSupported || !e2eeSupported())
    throw new Error(tr('Private conversations don’t open on this device.'));
  return userId;
};

async function register(userId: string, startOver: boolean): Promise<Mine> {
  const keys = await newDeviceKeys();
  const id = uuidv7();
  const pub = { id, userId, ...(await publicKeys(keys)) };
  const { device } = await endpoints.registerDevice({
    id,
    encryptionKey: pub.encryptionKey,
    signingKey: pub.signingKey,
    // Its own word that these keys are its: the first of a chain, or until one of theirs approves.
    introduction: await introduce({ keys }, pub),
    name: deviceName(),
    ...(startOver ? { startOver: true } : {}),
  });
  await saveDevice(userId, { id, keys });
  // Starting over retires the recovery device with the rest: its keys here are no use now.
  if (startOver) await forgetRecovery(userId).catch(() => {});
  await pinSelf(userId, device);
  return { userId, id, keys, approved: device.approved };
}

/**
 * The device kept here, whose session ended (a phone signed out and in again, a browser's session
 * expired), taken up again with these very keys (R41): the server binds it to this session, and
 * its approval stands. Null where the server no longer has it (removed from another device, or
 * the account started over there): then it registers afresh.
 */
async function resume(
  userId: string,
  stored: { id: string; keys: DeviceKeys },
): Promise<Mine | null> {
  const pub = { id: stored.id, userId, ...(await publicKeys(stored.keys)) };
  try {
    const { device } = await endpoints.registerDevice({
      id: stored.id,
      encryptionKey: pub.encryptionKey,
      signingKey: pub.signingKey,
      introduction: await introduce({ keys: stored.keys }, pub),
      name: deviceName(),
      resume: true,
    });
    return { userId, id: stored.id, keys: stored.keys, approved: device.approved };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'not_resumable') {
      await dropDevice(userId).catch(() => {});
      return null;
    }
    throw e;
  }
}

/**
 * This device's keys: the ones kept here while the server still has them for this session (a
 * device another tab registered is taken up, never replaced), or new ones, registered now (a new
 * browser, or its session ended). Checked with the server now and then, and when asked to.
 */
/** The last listing of my devices, good for a moment: a launch asks the server once, not twice. */
let listing: {
  at: number;
  value: Promise<{ devices: MyDeviceView[]; chain: DeviceView[] }>;
} | null = null;
const LISTING_MS = 5_000;

async function listDevices(fresh = false) {
  if (!fresh && listing && Date.now() - listing.at < LISTING_MS) return listing.value;
  const value = endpoints.myDevices();
  listing = { at: Date.now(), value };
  value.catch(() => {
    listing = null;
  });
  return value;
}

export async function ensureDevice(opts: { recheck?: boolean } = {}): Promise<Mine> {
  const userId = signedInUser();
  watchSignOut();
  if (!opts.recheck && mine?.userId === userId && Date.now() - checkedAt < RECHECK_MS) return mine;
  ensuring ??= oneTab(userId, async () => {
    const stored = await loadDevice(userId);
    const { devices } = await listDevices(opts.recheck);
    const current = stored ? devices.find((d) => d.id === stored.id && d.current) : undefined;
    const was = mine;
    mine =
      stored && current
        ? { userId, id: stored.id, keys: stored.keys, approved: current.approved }
        : (stored && (await resume(userId, stored))) || (await register(userId, false));
    checkedAt = Date.now();
    if (was && (was.id !== mine.id || was.approved !== mine.approved)) {
      opened.clear();
      tell();
    }
    return mine;
  }).finally(() => {
    ensuring = null;
  });
  return ensuring;
}

/**
 * Start over here: this device becomes the first of a new chain, and every other device of mine
 * is retired. Everyone who compared my code sees it changed.
 */
export async function startOver(): Promise<Mine> {
  const userId = signedInUser();
  watchSignOut();
  mine = await oneTab(userId, () => register(userId, true));
  checkedAt = Date.now();
  opened.clear();
  recoveryHere.delete(userId);
  tell();
  return mine;
}

/**
 * Signed out (here, or from elsewhere): this browser's keys for the account go with the session.
 * Watched from the first use, never at load: the session store and this module import each other.
 */
let watching = false;
function watchSignOut(): void {
  if (watching) return;
  watching = true;
  useSession.subscribe((s, before) => {
    if (before.user && !s.user) void forgetThisDevice(before.user.id);
  });
}

/** Signed out: this browser's keys for the account are forgotten with the session. */
export async function forgetThisDevice(userId: string): Promise<void> {
  mine = null;
  checkedAt = 0;
  opened.clear();
  recoveryHere.delete(userId);
  forgetKnown();
  await forgetDevice(userId).catch(() => {});
}

/** The recovery device's keys, if the key was typed here (R41), by account: read once. */
const recoveryHere = new Map<string, Promise<{ id: string; keys: DeviceKeys } | null>>();
const recoveryKeysOf = (userId: string) => {
  let got = recoveryHere.get(userId);
  if (!got) {
    got = loadRecovery(userId).catch(() => null);
    recoveryHere.set(userId, got);
  }
  return got;
};

/** Whether this device has the recovery device's keys (R41), so it reads what was sealed for it. */
export const hasRecoveryKeysHere = async () =>
  Boolean(await recoveryKeysOf(useSession.getState().user?.id ?? ''));

/**
 * A recovery key (R41), made here and shown once: the recovery device it stands for is introduced
 * into my chain by this device, and every private message is sealed for it from now on. This
 * device keeps nothing of the key. A new key replaces the last.
 */
export async function makeRecoveryKey(): Promise<string> {
  const me = await ensureDevice();
  if (!me.approved)
    throw new Error(
      tr(
        'Make a recovery key on a device that reads your private conversations already: this one doesn’t yet.',
      ),
    );
  const key = newRecoveryKey();
  const rec = recoveryDevice(parseRecoveryKey(key) as Uint8Array);
  const pub = {
    id: rec.id,
    userId: me.userId,
    encryptionKey: rec.keys.encryption.publicKey,
    signingKey: rec.keys.signing.publicKey,
  };
  const { device } = await endpoints.registerRecovery({
    id: rec.id,
    encryptionKey: pub.encryptionKey,
    signingKey: pub.signingKey,
    introduction: await introduce(me, pub),
  });
  await pinSelf(me.userId, device);
  // A key typed here before stood for the recovery device this one replaces.
  await forgetRecovery(me.userId).catch(() => {});
  recoveryHere.delete(me.userId);
  tell();
  return key;
}

/**
 * The recovery key typed here (R41): the recovery device's keys are derived from it and kept on
 * this device, so everything sealed for that device opens here; and this device, if it was
 * waiting, is introduced by the recovery device, so it's approved without another of mine, and
 * my chain (and code) is as it was.
 */
export async function restoreFromRecoveryKey(typed: string): Promise<void> {
  const bytes = parseRecoveryKey(typed);
  if (!bytes)
    throw new Error(
      tr('That isn’t a recovery key: it’s 32 letters and digits, in eight groups of four.'),
    );
  const me = await ensureDevice({ recheck: true });
  const { devices } = await endpoints.myDevices();
  const listed = devices.find((d) => d.recovery);
  if (!listed) throw new Error(tr('No recovery key is set up for this account.'));
  const rec = recoveryDevice(bytes);
  const same = (a: { x: string; y: string }, b: { x: string; y: string }) =>
    a.x === b.x && a.y === b.y;
  if (
    listed.id !== rec.id ||
    !same(listed.encryptionKey, rec.keys.encryption.publicKey) ||
    !same(listed.signingKey, rec.keys.signing.publicKey)
  )
    throw new Error(tr('That isn’t the recovery key for this account.'));
  const keys = await importDeviceKeys(rec.keys);
  if (!me.approved) {
    const pub = { id: me.id, userId: me.userId, ...(await publicKeys(me.keys)) };
    const { device } = await endpoints.restoreDevice(me.id, {
      introduction: await introduce({ keys }, pub),
    });
    mine = { ...me, approved: device.approved };
    checkedAt = Date.now();
  }
  await saveRecovery(me.userId, { id: rec.id, keys });
  recoveryHere.set(me.userId, Promise.resolve({ id: rec.id, keys }));
  await pinSelf(me.userId, listed);
  opened.clear();
  tell();
}

/** Someone's devices changed (mine too): what was opened is looked at again, codes too. */
export function devicesChanged(userId: string): void {
  opened.clear();
  if (userId === useSession.getState().user?.id) checkedAt = 0;
  tell();
}

/** Why a private message can't be sent from here: said as it is, never sent some other way. */
const refused = (code: string, message: string, details?: Record<string, unknown>) =>
  new ApiError(409, code, message, details);
const WAITING = msg(
  'This device can’t write in private conversations until you approve it on another device where you’re signed in to Caime.',
);

interface Recipients {
  people: string[];
  devices: DeviceView[];
  chain: DeviceView[];
}

/**
 * Seal text on this device for the devices of the people in the conversation that it confirms as
 * theirs (never one it can't), with the message it answers inside, so it can't be moved.
 */
export async function sealText(
  conversationId: string,
  cid: string,
  text: string,
  edit = 0,
  given?: Recipients,
  replyTo?: PrivatePayload['replyTo'],
): Promise<SealedMessage> {
  const me = await ensureDevice();
  if (!me.approved) throw refused('waiting', tr(WAITING));
  const view = given ?? (await endpoints.conversationDevices(conversationId));
  const j = await judge(me.userId, view.devices, view.chain);
  if (j.held.size)
    throw refused(
      'code_changed',
      'Someone’s security code changed since you compared it: check it in this conversation’s details, then send again.',
      { userIds: [...j.held] },
    );
  const people = new Set(view.people);
  const to: Array<Pick<DeviceView, 'id' | 'encryptionKey'>> = j.trusted.filter((d) =>
    people.has(d.userId),
  );
  // This device reads what it sent, whatever it's told.
  if (!to.some((d) => d.id === me.id))
    to.push({ id: me.id, encryptionKey: (await publicKeys(me.keys)).encryptionKey });
  return seal({
    conversationId,
    cid,
    edit,
    payload: replyTo ? { body: text, replyTo } : { body: text },
    from: me,
    to,
  });
}

/** What a 409 says the conversation's devices are now, to seal for again. */
const recipientsIn = (e: ApiError): Recipients | undefined => {
  const d = e.details as Partial<Recipients> | undefined;
  return d?.devices && d.people
    ? { people: d.people, devices: d.devices, chain: d.chain ?? [] }
    : undefined;
};

/**
 * Seal and send, sealing again if someone's devices changed meanwhile, or checking this device
 * again if the server no longer has it (its session ended, or another tab replaced it).
 */
export async function sendPrivate(
  conversationId: string,
  body: SendBody,
  replyTo?: PrivatePayload['replyTo'],
): Promise<{ message: MessageView }> {
  let given: Recipients | undefined;
  for (let tries = 0; ; tries++) {
    const sealed = await sealText(
      conversationId,
      body.clientId,
      body.body ?? '',
      0,
      given,
      replyTo,
    );
    try {
      return await endpoints.send(conversationId, {
        clientId: body.clientId,
        kind: 'text',
        replyToId: body.replyToId ?? null,
        sealed,
      });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.code === 'devices_changed') {
        if (tries >= 2)
          throw refused(
            'unconfirmed_devices',
            'A device listed for someone here couldn’t be confirmed as theirs, so this wasn’t sent. Check their security code in this conversation’s details.',
          );
        given = recipientsIn(e);
      } else if (e.code === 'unknown_device' && tries < 2) {
        await ensureDevice({ recheck: true });
        given = undefined;
      } else throw e;
    }
  }
}

/** An edit: sealed again, as the next edit of the same message (answering what it answered). */
export async function editPrivate(message: MessageView, text: string): Promise<MessageView> {
  const sealed = message.sealed;
  if (!sealed) throw new Error(tr('That message isn’t private.'));
  const was = await openMessage(message, message.conversationId);
  const replyTo = was.ok ? was.payload.replyTo : undefined;
  let given: Recipients | undefined;
  for (let tries = 0; ; tries++) {
    const next = await sealText(
      message.conversationId,
      sealed.cid,
      text,
      sealed.edit + 1,
      given,
      replyTo,
    );
    try {
      return (await endpoints.editMessage(message.id, { sealed: next })).message;
    } catch (e) {
      if (tries >= 2 || !(e instanceof ApiError) || e.code !== 'devices_changed') throw e;
      given = recipientsIn(e);
    }
  }
}

/** Why a private message isn't shown here, beyond what opening it says. */
export type Opened =
  | OpenResult
  /** This device is waiting to be approved: nothing is sealed for it yet. */
  | { ok: false; reason: 'waiting' }
  /** Its sender's code changed since it was compared: held until checked. */
  | { ok: false; reason: 'held' }
  /** An older version of a message edited since. */
  | { ok: false; reason: 'stale' };

/**
 * The sender's device, as this device confirmed it: never as the server says now. Judged with
 * the rest of that person's devices, so one confirmed before (my own recovery device on a
 * restored device, this device itself once approved) says which first device is theirs: judged
 * alone, a device of mine sent before this one was approved wouldn't hold up until something
 * else (the codes, sealing) had judged them together, and what it answered would be kept.
 */
async function senderOf(me: string, conversationId: string, deviceId: string) {
  const pin = await pinned(me, deviceId);
  if (pin) return { pin, held: false };
  const view = await endpoints.conversationDevices(conversationId, [deviceId]);
  const all = [...view.devices, ...view.chain];
  const d = all.find((x) => x.id === deviceId);
  if (!d) return { pin: null, held: false };
  const theirs = all.filter((x) => x.userId === d.userId);
  const j = await judge(me, theirs, all);
  return {
    pin: j.trusted.length ? await pinned(me, deviceId) : null,
    held: j.held.has(d.userId),
  };
}

const opened = new Map<string, Opened>();
/**
 * A private message opened on this device, once (by its version): only in the conversation shown
 * (`conversationId`), only from a device confirmed as its sender's, and only its newest edit.
 */
export async function openMessage(m: MessageView, conversationId: string): Promise<Opened> {
  const sealed = m.sealed;
  if (!sealed || m.conversationId !== conversationId) return { ok: false, reason: 'unverified' };
  const key = `${conversationId}|${m.id}|${sealed.edit}|${sealed.sig}`;
  const hit = opened.get(key);
  if (hit) return hit;
  let me = await ensureDevice();
  // Not sealed for this device: perhaps another tab replaced it with the one this is for.
  if (!sealed.keys[me.id]) me = await ensureDevice({ recheck: true });
  // Nor for this one, but for the recovery device, whose keys were typed here (R41): those read
  // it, as the person's own.
  const recovery = sealed.keys[me.id] ? null : await recoveryKeysOf(me.userId);
  const reader = recovery && sealed.keys[recovery.id] ? { ...me, ...recovery } : me;
  const result = await (async (): Promise<Opened> => {
    if (!me.approved) return { ok: false, reason: 'waiting' };
    const sender = await senderOf(me.userId, conversationId, sealed.from);
    if (sender.held) return { ok: false, reason: 'held' };
    // The device it says it's from must be one confirmed as its sender's, and signed as theirs.
    // Someone whose account is gone since (no sender) is checked by their device alone.
    if (
      !sender.pin ||
      sender.pin.userId !== sealed.by ||
      (m.senderId !== null && m.senderId !== sealed.by)
    )
      return { ok: false, reason: 'unverified' };
    const r = await open({
      conversationId,
      sealed,
      me: reader,
      sender: { id: sealed.from, userId: sender.pin.userId, signingKey: sender.pin.signingKey },
    });
    if (!r.ok) return r;
    // Only its newest edit, and only as the one message it is.
    const at = `${me.userId}|${conversationId}|${sealed.by}|${sealed.cid}`;
    const before = await loadOpened(at);
    if (before && before.id !== m.id) return { ok: false, reason: 'unverified' };
    if (before && sealed.edit < before.edit) return { ok: false, reason: 'stale' };
    if (!before || sealed.edit > before.edit) await saveOpened(at, { id: m.id, edit: sealed.edit });
    return r;
  })();
  opened.set(key, result);
  return result;
}

export function noteFor(result: Opened): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case 'not_for_this_device':
      return tr('Sent before this device could read private messages.');
    case 'waiting':
      return tr(
        'This device reads private messages once you approve it on another of your devices.',
      );
    case 'held':
      return tr(
        'Their security code changed since you compared it: check it in this conversation’s details to read this.',
      );
    case 'stale':
      return tr('An older version of a message that was edited since.');
    case 'unverified':
      return tr('This message couldn’t be checked, so it isn’t shown.');
    default:
      return tr('This message can’t be read on this device.');
  }
}

const listeners = new Set<() => void>();
const tell = () => {
  // Devices changed: the next listing asks the server.
  listing = null;
  for (const f of listeners) f();
};

/** Each person's security code in a conversation, and whether it changed since last seen here. */
export interface PersonCode {
  userId: string;
  code: string | null;
  /** The first device of their chain now: what accepting their code accepts. */
  rootId: string | null;
  changed: boolean;
  verified: boolean;
  /** Changed since it was compared: nothing is sealed for them, or read from them, until checked. */
  held: boolean;
  /** Devices listed as theirs that don't hold up as theirs: never sealed for. */
  unconfirmed: number;
}

/** The codes of everyone in a private conversation (this person's own too). */
export async function codesFor(conversationId: string): Promise<PersonCode[]> {
  const me = signedInUser();
  const view = await endpoints.conversationDevices(conversationId);
  const j = await judge(me, view.devices, view.chain);
  const out: PersonCode[] = [];
  for (const userId of new Set(view.people)) {
    const listed = view.devices.filter((d) => d.userId === userId);
    if (!listed.length) continue;
    // Their code is from the first device of the chain their confirmed devices hold up to.
    const root = j.roots.get(userId) ?? null;
    const code = root ? await codeOf(root) : null;
    const seen = await loadSeen(`${me}|${userId}`);
    const changed = Boolean(seen && code && seen.code !== code);
    out.push({
      userId,
      code,
      rootId: root?.id ?? null,
      changed,
      verified: Boolean(seen?.verified && !changed),
      held: j.held.has(userId),
      unconfirmed: j.unconfirmed.filter((d) => d.userId === userId).length,
    });
  }
  return out;
}

/** Seen (or compared with them): this code is theirs now, and so is the device it's from. */
export async function acceptCode(
  userId: string,
  code: string,
  verified: boolean,
  rootId: string | null,
): Promise<void> {
  const me = signedInUser();
  const was = await loadSeen(`${me}|${userId}`);
  await saveSeen(`${me}|${userId}`, {
    code,
    verified: verified || Boolean(was?.verified && was.code === code),
    roots: [...new Set([...(was?.roots ?? []), ...(rootId ? [rootId] : [])])],
  });
  opened.clear();
  tell();
}

/** My devices, as this device sees them: which it is, which wait, and any it can't confirm. */
export interface MyDevice extends MyDeviceView {
  /** Listed as mine and approved, but its approval doesn't hold up: never sealed for. */
  unconfirmed: boolean;
}
export async function myDevices(): Promise<MyDevice[]> {
  const me = await ensureDevice();
  const { devices, chain } = await listDevices();
  const approved = devices.filter((d) => d.approved && d.id !== me.id);
  const j = me.approved ? await judge(me.userId, approved, chain) : null;
  return devices.map((d) => ({
    ...d,
    unconfirmed: Boolean(j?.unconfirmed.some((x) => x.id === d.id)),
  }));
}

/** This device approves another of mine that's waiting: it's mine, and sealed for from now. */
export async function approveDevice(deviceId: string): Promise<void> {
  const me = await ensureDevice();
  if (!me.approved) throw new Error(tr(WAITING));
  const { devices } = await endpoints.myDevices();
  const d = devices.find((x) => x.id === deviceId && !x.approved);
  if (!d) throw new Error(tr('That device isn’t waiting any more.'));
  const introduction = await introduce(me, {
    id: d.id,
    userId: me.userId,
    encryptionKey: d.encryptionKey,
    signingKey: d.signingKey,
  });
  await endpoints.approveDevice(deviceId, { introduction });
  await pinSelf(me.userId, { ...d, userId: me.userId });
  tell();
}

/** Removed: nothing more is sealed for it, and it's signed out (this one too, if it's this). */
export async function removeDevice(deviceId: string): Promise<void> {
  const { signedOut } = await endpoints.removeDevice(deviceId);
  tell();
  if (signedOut) await useSession.getState().signOut({ remote: false });
}

/** Told whenever codes or devices may have changed (devices, a code accepted, an approval). */
export function onCodesChanged(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}
