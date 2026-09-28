/**
 * Private conversations for the screens (R18): a message opened on this device, a reply's quote,
 * each person's security code, this device's own standing (approved, or waiting for one of mine
 * to approve it), and my devices. What opens and seals them (./private, and Web Crypto) loads
 * the first time a private message is on screen, never with the app.
 */
import type { MessageView } from '@caime/core/api';
import type { PrivatePayload } from '@caime/core/e2ee';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { qk } from '@/api/keys';
import { flatMessages, type MessagePages } from '@/state/cache';
import { privateSupported } from './support';

export const loadPrivate = () => import('./private');

export const UNVERIFIED = 'This message couldn’t be checked, so it isn’t shown.';

/**
 * How a message is read in the conversation shown: opened on this device (sealed), shown as it
 * is (plain), or not shown at all. In a private conversation only sealed text is ever written,
 * so anything else there (words in the clear, a card, a file, a poll) didn't come from anyone's
 * device; only its own lines about the conversation are shown as they are.
 */
export function readAs(
  m: Pick<MessageView, 'kind' | 'sealed'>,
  where: { private: boolean },
): 'sealed' | 'plain' | 'unverified' {
  if (m.kind === 'system') return 'plain';
  if (where.private) return m.sealed && m.kind === 'text' ? 'sealed' : 'unverified';
  return m.sealed ? 'sealed' : 'plain';
}

/**
 * Why nothing can be written here from this device, if it can't: a conversation seen as private
 * here that the server now says isn't, or this browser waiting to be approved.
 */
export function whyNotWritten(
  where: { private: boolean },
  saysPrivate: boolean,
  thisDevice: 'approved' | 'waiting' | null,
): string | null {
  if (where.private && !saysPrivate)
    return 'This conversation was private on this device, and Caime now says it isn’t, so nothing is sent from here. Start a new private conversation instead.';
  if (where.private && thisDevice === 'waiting')
    return 'This browser reads and writes private messages once you approve it on another device where you’re signed in to Caime.';
  return null;
}

/**
 * Whether a link in a message is one to ask about before opening: from what the server found in
 * its words, or, for a private one (whose words the server never had), checked here (the check
 * loaded when first needed).
 */
export async function suspiciousLink(
  m: Pick<MessageView, 'sealed' | 'entities'>,
  url: string,
): Promise<boolean> {
  if (m.sealed) return (await import('@caime/core/safety')).assessLink(url).suspicious;
  const links = (m.entities as { links?: Array<{ url: string; suspicious?: boolean }> }).links;
  return (links ?? []).some((l) => l.url === url && l.suspicious);
}

/** What a private message says here, or why it can't be shown. */
export interface Opened {
  text: string | null;
  note: string | null;
  loading: boolean;
  /** The message it answers, as sealed inside it. */
  replyTo?: PrivatePayload['replyTo'];
}

/**
 * Open a private message for the screen, in the conversation shown; in a private conversation
 * anything not sealed (but its own lines about the conversation) isn't shown. Any other message
 * is its body as it is.
 */
export function useOpened(
  m: MessageView | null | undefined,
  where: { conversationId: string; private: boolean },
): Opened {
  const as = m ? readAs(m, where) : 'plain';
  const sealed = as === 'sealed' ? (m?.sealed ?? null) : null;
  const unsealedHere = as === 'unverified';
  const initial = (): Opened =>
    unsealedHere
      ? { text: null, note: UNVERIFIED, loading: false }
      : sealed
        ? privateSupported
          ? { text: null, note: null, loading: true }
          : {
              text: null,
              note: 'Open Caime on the web to read private messages.',
              loading: false,
            }
        : { text: m?.body ?? null, note: null, loading: false };
  const [state, setState] = useState<Opened>(initial);
  const [again, setAgain] = useState(0);
  // Couldn't be asked (offline, the server away): tried again, sooner at first, then less often.
  const failures = useRef(0);
  const key = `${where.conversationId}|${as}|${m?.id}|${
    sealed ? `${sealed.edit}|${sealed.sig}` : (m?.body ?? '')
  }|${again}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the message's version
  useEffect(() => {
    if (!m) return;
    if (!sealed || unsealedHere) {
      setState(initial());
      return;
    }
    if (!privateSupported) return;
    let live = true;
    let stop: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    void loadPrivate()
      .then(async (p) => {
        // A code accepted, or this device approved: opened again.
        stop = p.onCodesChanged(() => live && setAgain((n) => n + 1));
        const r = await p.openMessage(m, where.conversationId);
        failures.current = 0;
        if (live)
          setState(
            r.ok
              ? { text: r.payload.body, note: null, loading: false, replyTo: r.payload.replyTo }
              : { text: null, note: p.noteFor(r), loading: false },
          );
      })
      .catch(() => {
        // Not an answer about the message: it's still being opened, and tried again shortly.
        if (!live) return;
        failures.current = Math.min(failures.current + 1, 5);
        setState({ text: null, note: null, loading: true });
        retry = setTimeout(() => live && setAgain((n) => n + 1), 1000 * 2 ** failures.current);
      });
    return () => {
      live = false;
      stop?.();
      if (retry) clearTimeout(retry);
    };
  }, [key]);
  return state;
}

/**
 * A reply's quote: the words it answers. In a private conversation only from the message sealed
 * inside the reply as the one it answers, opened here (never what the server says it quoted).
 */
export function useReplyPreview(
  replyTo: MessageView['replyTo'],
  where: { conversationId: string; private: boolean },
  sealedRef?: PrivatePayload['replyTo'],
): string {
  const qc = useQueryClient();
  const original =
    replyTo && (where.private || !replyTo.preview)
      ? flatMessages(qc.getQueryData<MessagePages>(qk.messages(where.conversationId))).find(
          (x) => x.id === replyTo.id,
        )
      : undefined;
  const opened = useOpened(original ?? null, where);
  if (!replyTo) return '';
  if (!where.private) return replyTo.preview || opened.text || 'Message';
  const same =
    original?.sealed &&
    sealedRef &&
    original.sealed.by === sealedRef.by &&
    original.sealed.cid === sealedRef.cid;
  return (same && opened.text) || 'Message';
}

/** Loads the private module and hears when codes or devices change, while mounted. */
export function usePrivate<T>(
  load: ((p: typeof import('./private')) => Promise<T>) | null,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!load || !privateSupported) return;
    let live = true;
    let stop: (() => void) | null = null;
    void loadPrivate().then((p) => {
      if (!live) return;
      const run = () =>
        void load(p)
          .then((v) => live && setValue(v))
          .catch(() => {});
      run();
      stop = p.onCodesChanged(run);
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [load]);
  return value;
}

/** This device for private conversations: approved, or waiting for one of mine to approve it. */
export function useThisDevice(on: boolean): 'approved' | 'waiting' | null {
  const load = useCallback(
    async (p: typeof import('./private')) =>
      (await p.ensureDevice()).approved ? ('approved' as const) : ('waiting' as const),
    [],
  );
  return usePrivate(on ? load : null);
}

/** Whether this conversation was seen as private here before (whatever the server says now). */
export function useKnownPrivate(conversationId: string, isPrivate: boolean): boolean {
  const [known, setKnown] = useState(false);
  useEffect(() => {
    if (!privateSupported) return;
    let live = true;
    void import('./known').then(async (k) => {
      if (isPrivate) await k.rememberPrivate(conversationId);
      const seen = await k.knownPrivate(conversationId);
      if (live) setKnown(seen);
    });
    return () => {
      live = false;
    };
  }, [conversationId, isPrivate]);
  return known;
}
