/**
 * Private conversations for the screens (R18): a message opened on this device, a reply's quote,
 * and each person's security code. What opens and seals them (./private, and Web Crypto) loads
 * the first time a private message is on screen, never with the app.
 */
import type { MessageView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { qk } from '@/api/keys';
import { flatMessages, type MessagePages } from '@/state/cache';
import type { PersonCode } from './private';
import { privateSupported } from './support';

export const loadPrivate = () => import('./private');

/** What a private message says here, or why it can't be shown. */
export interface Opened {
  text: string | null;
  note: string | null;
  loading: boolean;
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
    void loadPrivate()
      .then(async (p) => {
        const r = await p
          .openMessage(m)
          .catch(() => ({ ok: false, reason: 'unreadable' }) as const);
        if (live)
          setState(
            r.ok
              ? { text: r.payload.body, note: null, loading: false }
              : { text: null, note: p.noteFor(r), loading: false },
          );
      })
      .catch(() => {
        if (live)
          setState({
            text: null,
            note: 'This message can’t be read on this device.',
            loading: false,
          });
      });
    return () => {
      live = false;
    };
  }, [key]);
  return state;
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

/** The codes in a conversation, kept up to date as devices change. */
export function useCodes(conversationId: string | null): PersonCode[] | null {
  const [codes, setCodes] = useState<PersonCode[] | null>(null);
  useEffect(() => {
    if (!conversationId || !privateSupported) return;
    let live = true;
    let stop: (() => void) | null = null;
    void loadPrivate().then((p) => {
      if (!live) return;
      const load = () =>
        void p
          .codesFor(conversationId)
          .then((c) => live && setCodes(c))
          .catch(() => {});
      load();
      stop = p.onCodesChanged(load);
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [conversationId]);
  return codes;
}
