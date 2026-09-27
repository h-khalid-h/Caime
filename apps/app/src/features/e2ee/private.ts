/**
 * Private conversations on this device (R18, PRD §61): its keys, sealing what it sends for every
 * device of everyone in the conversation, opening what it's sent, and each person's security
 * code. The keys live only in this browser (keystore); the server sees envelopes.
 */
import type { DeviceView, MessageView } from '@caishy/core/api';
import type { PublicDevice, SealedMessage } from '@caishy/core/e2ee';
import {
  type DeviceKeys,
  e2eeSupported,
  newDeviceKeys,
  type OpenResult,
  open,
  publicKeys,
  seal,
  securityCode,
} from '@caishy/core/e2ee-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '@/api/client';
import { endpoints, type SendBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { flatMessages, type MessagePages } from '@/state/cache';
import { useSession } from '@/state/session';
import {
  forgetDevice,
  keystoreSupported,
  loadDevice,
  loadSeen,
  type SeenCode,
  saveDevice,
  saveSeen,
} from './keystore';

/** Private conversations open here: the web, for now. */
export const privateSupported = keystoreSupported && e2eeSupported();

interface Mine {
  userId: string;
  id: string;
  keys: DeviceKeys;
}
let mine: Mine | null = null;
let ensuring: Promise<Mine> | null = null;

/** A name for this device in Settings: the browser and the system it's on. */
function deviceName(): string {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'A browser';
  const system = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? /iPhone|iPad/.test(ua)
        ? 'iOS'
        : 'Mac'
      : /Android/.test(ua)
        ? 'Android'
        : /Linux/.test(ua)
          ? 'Linux'
          : null;
  return system ? `${browser} on ${system}` : browser;
}

/**
 * This device's keys: the ones kept here while the server still has them for this session, or
 * new ones, registered now (a new browser, or its session ended).
 */
export async function ensureDevice(fresh = false): Promise<Mine> {
  const userId = useSession.getState().user?.id;
  if (!userId || !privateSupported)
    throw new Error('Private conversations open in Caishy on the web.');
  watchSignOut();
  if (!fresh && mine?.userId === userId) return mine;
  ensuring ??= (async () => {
    let stored = fresh ? null : await loadDevice(userId);
    if (stored) {
      const { devices } = await endpoints.myDevices();
      if (!devices.some((d) => d.id === stored?.id && d.current)) stored = null;
    }
    if (!stored) {
      const keys = await newDeviceKeys();
      const { device } = await endpoints.registerDevice({
        ...(await publicKeys(keys)),
        name: deviceName(),
      });
      stored = { id: device.id, keys };
      await saveDevice(userId, stored);
    }
    mine = { userId, id: stored.id, keys: stored.keys };
    return mine;
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
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
  opened.clear();
  known.clear();
  await forgetDevice(userId).catch(() => {});
}

/** Devices seen per conversation, to check senders with: live ones and past senders. */
const known = new Map<string, Map<string, DeviceView>>();
function remember(conversationId: string, devices: DeviceView[]) {
  const map = known.get(conversationId) ?? new Map<string, DeviceView>();
  for (const d of devices) map.set(d.id, d);
  known.set(conversationId, map);
}
async function senderDevice(conversationId: string, deviceId: string): Promise<DeviceView | null> {
  const hit = known.get(conversationId)?.get(deviceId);
  if (hit) return hit;
  const { devices, senders } = await endpoints.conversationDevices(conversationId, [deviceId]);
  remember(conversationId, [...devices, ...senders]);
  return known.get(conversationId)?.get(deviceId) ?? null;
}
/** Someone's devices changed: what's known of that conversation is asked for again. */
export function devicesChanged(conversationIds: string[]): void {
  for (const id of conversationIds) known.delete(id);
  for (const f of codeListeners) f();
}

/** Seal text on this device for these devices (all of the conversation's now, by default). */
export async function sealText(
  conversationId: string,
  cid: string,
  text: string,
  edit = 0,
  devices?: DeviceView[],
): Promise<SealedMessage> {
  const me = await ensureDevice();
  const to = devices ?? (await endpoints.conversationDevices(conversationId)).devices;
  remember(conversationId, to);
  return seal({ conversationId, cid, edit, payload: { body: text }, from: me, to });
}

/**
 * Seal and send, sealing again if someone's devices changed meanwhile, or registering this
 * device again if the server no longer has it (its session ended).
 */
export async function sendPrivate(
  conversationId: string,
  body: SendBody,
): Promise<{ message: MessageView }> {
  let devices: DeviceView[] | undefined;
  for (let tries = 0; ; tries++) {
    const sealed = await sealText(conversationId, body.clientId, body.body ?? '', 0, devices);
    try {
      return await endpoints.send(conversationId, {
        clientId: body.clientId,
        kind: 'text',
        replyToId: body.replyToId ?? null,
        sealed,
      });
    } catch (e) {
      if (tries >= 2 || !(e instanceof ApiError)) throw e;
      if (e.code === 'devices_changed') devices = e.details?.devices as DeviceView[] | undefined;
      else if (e.code === 'unknown_device') {
        await ensureDevice(true);
        devices = undefined;
      } else throw e;
    }
  }
}

/** An edit: sealed again, as the next edit of the same message. */
export async function editPrivate(message: MessageView, text: string): Promise<MessageView> {
  const sealed = message.sealed;
  if (!sealed) throw new Error('That message isn’t private.');
  let devices: DeviceView[] | undefined;
  for (let tries = 0; ; tries++) {
    const next = await sealText(message.conversationId, sealed.cid, text, sealed.edit + 1, devices);
    try {
      return (await endpoints.editMessage(message.id, { sealed: next })).message;
    } catch (e) {
      if (tries >= 2 || !(e instanceof ApiError) || e.code !== 'devices_changed') throw e;
      devices = e.details?.devices as DeviceView[] | undefined;
    }
  }
}

const opened = new Map<string, OpenResult>();
/** A private message opened on this device, once (by its version). */
export async function openMessage(m: MessageView): Promise<OpenResult> {
  const sealed = m.sealed;
  if (!sealed) return { ok: false, reason: 'unreadable' };
  const key = `${m.id}|${sealed.edit}|${sealed.sig}`;
  const hit = opened.get(key);
  if (hit) return hit;
  const me = await ensureDevice();
  const sender = await senderDevice(m.conversationId, sealed.from);
  // The device it says it's from must be its sender's, and signed as theirs: the server can't
  // pass one person's device, or words, off as another's.
  const result =
    sender && sender.userId === m.senderId && sealed.by === m.senderId
      ? await open({ conversationId: m.conversationId, sealed, me, sender })
      : ({ ok: false, reason: 'unverified' } as const);
  opened.set(key, result);
  return result;
}

/** What a private message says here, or why it can't be shown. */
export interface Opened {
  text: string | null;
  note: string | null;
  loading: boolean;
}
export function noteFor(result: OpenResult): string | null {
  if (result.ok) return null;
  return result.reason === 'not_for_this_device'
    ? 'Sent before this device could read private messages.'
    : result.reason === 'unverified'
      ? 'This message couldn’t be checked, so it isn’t shown.'
      : 'This message can’t be read on this device.';
}

/** Open a private message for the screen; for any other message, its body as it is. */
export function useOpened(m: MessageView | null | undefined): Opened {
  const sealed = m?.sealed ?? null;
  const [state, setState] = useState<Opened>(() =>
    sealed
      ? privateSupported
        ? { text: null, note: null, loading: true }
        : { text: null, note: 'Open Caishy on the web to read private messages.', loading: false }
      : { text: m?.body ?? null, note: null, loading: false },
  );
  const key = sealed ? `${m?.id}|${sealed.edit}|${sealed.sig}` : `${m?.id}|${m?.body ?? ''}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the message's version
  useEffect(() => {
    if (!m) return;
    if (!sealed) {
      setState({ text: m.body, note: null, loading: false });
      return;
    }
    if (!privateSupported) return;
    let live = true;
    void openMessage(m)
      .catch(() => ({ ok: false, reason: 'unreadable' }) as const)
      .then((r) => {
        if (live)
          setState(
            r.ok
              ? { text: r.payload.body, note: null, loading: false }
              : { text: null, note: noteFor(r), loading: false },
          );
      });
    return () => {
      live = false;
    };
  }, [key]);
  return state;
}

const codeListeners = new Set<() => void>();

/** Each person's security code in a conversation, and whether it changed since last seen here. */
export interface PersonCode {
  userId: string;
  code: string | null;
  changed: boolean;
  verified: boolean;
}

/** The codes of everyone in a private conversation (this person's own too). */
export async function codesFor(conversationId: string): Promise<PersonCode[]> {
  const me = useSession.getState().user?.id ?? '';
  const { devices } = await endpoints.conversationDevices(conversationId);
  remember(conversationId, devices);
  const byUser = new Map<string, PublicDevice[]>();
  for (const d of devices) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
  const out: PersonCode[] = [];
  for (const [userId, list] of byUser) {
    const code = await securityCode(list);
    const key = `${me}|${userId}`;
    const seen = await loadSeen(key);
    // The first time a person's code is seen here, it's remembered; after that, a new one shows.
    if (!seen) await saveSeen(key, { code, verified: false });
    out.push({
      userId,
      code,
      changed: Boolean(seen && seen.code !== code),
      verified: Boolean(seen?.verified && seen.code === code),
    });
  }
  return out;
}

/** Seen (or compared with them): this code is theirs now. */
export async function acceptCode(userId: string, code: string, verified: boolean): Promise<void> {
  const me = useSession.getState().user?.id ?? '';
  const was: SeenCode | null = await loadSeen(`${me}|${userId}`);
  await saveSeen(`${me}|${userId}`, {
    code,
    verified: verified || Boolean(was?.verified && was.code === code),
  });
  for (const f of codeListeners) f();
}

/** The codes in a conversation, kept up to date as devices change. */
export function useCodes(conversationId: string | null): PersonCode[] | null {
  const [codes, setCodes] = useState<PersonCode[] | null>(null);
  useEffect(() => {
    if (!conversationId || !privateSupported) return;
    let live = true;
    const load = () =>
      void codesFor(conversationId)
        .then((c) => live && setCodes(c))
        .catch(() => {});
    load();
    codeListeners.add(load);
    return () => {
      live = false;
      codeListeners.delete(load);
    };
  }, [conversationId]);
  return codes;
}

/** A reply's quote: the words it answers, opened here when it's private (the server has none). */
export function useReplyPreview(replyTo: MessageView['replyTo'], conversationId: string): string {
  const qc = useQueryClient();
  const original =
    replyTo && !replyTo.preview
      ? flatMessages(qc.getQueryData<MessagePages>(qk.messages(conversationId))).find(
          (x) => x.id === replyTo.id,
        )
      : undefined;
  const opened = useOpened(original ?? null);
  if (!replyTo) return '';
  return replyTo.preview || opened.text || 'Message';
}
