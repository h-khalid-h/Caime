/**
 * Direct edits to cached server state, so a message shows the moment it arrives rather than
 * after a refetch. Every edit is by id and idempotent: the same event applied twice is harmless.
 */
import type {
  InboxAllResponse,
  InboxItemView,
  InboxResponse,
  MessagesPage,
  MessageView,
} from '@caishy/core/api';
import { messagePreview } from '@caishy/core/format';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { qk } from '@/api/keys';

export type MessagePages = InfiniteData<MessagesPage, unknown>;

const bySeq = (a: MessageView, b: MessageView) => a.seq - b.seq;

/** Oldest first, across every loaded page (page 0 is the newest chunk). */
export function flatMessages(data: MessagePages | undefined): MessageView[] {
  if (!data) return [];
  const out: MessageView[] = [];
  for (let i = data.pages.length - 1; i >= 0; i--) out.push(...(data.pages[i]?.messages ?? []));
  return out;
}

export function maxSeq(data: MessagePages | undefined): number {
  let max = 0;
  for (const p of data?.pages ?? []) for (const m of p.messages) if (m.seq > max) max = m.seq;
  return max;
}

/**
 * A live change that lands while a conversation's page is loading would be lost: there is nothing
 * to apply it to yet, or the response in flight was read before it and replaces it. Such changes
 * are applied now and again once that response is in.
 */
const afterLoad = new WeakMap<QueryClient, Map<string, Array<() => void>>>();

function applyLive(qc: QueryClient, conversationId: string, change: () => void): void {
  change();
  if (qc.getQueryState(qk.messages(conversationId))?.fetchStatus !== 'fetching') return;
  let waiting = afterLoad.get(qc);
  if (!waiting) {
    const byConversation = new Map<string, Array<() => void>>();
    waiting = byConversation;
    afterLoad.set(qc, byConversation);
    qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const [scope, id] = event.query.queryKey as [string, string];
      const changes = scope === 'messages' ? byConversation.get(id) : undefined;
      if (!changes) return;
      byConversation.delete(id);
      for (const again of changes) again();
    });
  }
  waiting.set(conversationId, [...(waiting.get(conversationId) ?? []), change]);
}

export function upsertMessage(qc: QueryClient, m: MessageView): void {
  applyLive(qc, m.conversationId, () => upsertNow(qc, m));
}

function upsertNow(qc: QueryClient, m: MessageView): void {
  qc.setQueryData<MessagePages>(qk.messages(m.conversationId), (data) => {
    if (!data || data.pages.length === 0) return data;
    let found = false;
    const pages = data.pages.map((p) => {
      const i = p.messages.findIndex((x) => x.id === m.id);
      if (i === -1) return p;
      found = true;
      const messages = p.messages.slice();
      // Keep a clientId we already know: other devices' echoes arrive without it.
      messages[i] = { ...m, clientId: m.clientId ?? messages[i]?.clientId ?? null };
      return { ...p, messages };
    });
    if (found) return { ...data, pages };
    const first = pages[0];
    if (!first) return data;
    pages[0] = {
      ...first,
      messages: [...first.messages, m].sort(bySeq),
      lastSeq: Math.max(first.lastSeq, m.seq),
    };
    return { ...data, pages };
  });
}

export function patchMessage(
  qc: QueryClient,
  conversationId: string,
  id: string,
  fn: (m: MessageView) => MessageView,
): void {
  applyLive(qc, conversationId, () => patchNow(qc, conversationId, id, fn));
}

function patchNow(
  qc: QueryClient,
  conversationId: string,
  id: string,
  fn: (m: MessageView) => MessageView,
): void {
  qc.setQueryData<MessagePages>(qk.messages(conversationId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((p) =>
        p.messages.some((m) => m.id === id)
          ? { ...p, messages: p.messages.map((m) => (m.id === id ? fn(m) : m)) }
          : p,
      ),
    };
  });
}

export function removeMessage(qc: QueryClient, conversationId: string, id: string): void {
  qc.setQueryData<MessagePages>(qk.messages(conversationId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== id) })),
    };
  });
}

function patchItems(
  qc: QueryClient,
  conversationId: string,
  fn: (item: InboxItemView) => InboxItemView,
): boolean {
  let found = false;
  qc.setQueryData<InboxResponse>(qk.inbox, (data) => {
    if (!data) return data;
    return {
      ...data,
      sections: data.sections.map((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.id !== conversationId) return i;
          found = true;
          return fn(i);
        }),
      })),
    };
  });
  qc.setQueryData<InboxAllResponse>(qk.inboxAll, (data) => {
    if (!data) return data;
    return {
      ...data,
      conversations: data.conversations
        .map((i) => {
          if (i.id !== conversationId) return i;
          found = true;
          return fn(i);
        })
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
        ),
    };
  });
  return found;
}

/** Show a new message in the inbox row right away; the refetch that follows re-sections it. */
export function applyMessageToInbox(
  qc: QueryClient,
  m: MessageView,
  opts: { mine: boolean; reading: boolean },
): boolean {
  return patchItems(qc, m.conversationId, (item) => ({
    ...item,
    lastMessage: {
      id: m.id,
      seq: m.seq,
      senderId: m.senderId,
      kind: m.kind,
      preview: messagePreview({ ...m, deleted: m.deletedAt !== null }),
      mine: opts.mine,
      createdAt: m.createdAt,
    },
    lastSeq: Math.max(item.lastSeq, m.seq),
    lastActivityAt: m.createdAt,
    unreadCount: opts.mine || opts.reading ? item.unreadCount : item.unreadCount + 1,
    draft: opts.mine ? null : item.draft,
  }));
}

/** An edit changes a conversation's preview only when it's the last message there. */
export function applyEditToInbox(qc: QueryClient, m: MessageView): void {
  patchItems(qc, m.conversationId, (item) =>
    item.lastMessage?.id === m.id
      ? {
          ...item,
          lastMessage: {
            ...item.lastMessage,
            preview: messagePreview({ ...m, deleted: m.deletedAt !== null }),
          },
        }
      : item,
  );
}

export function markInboxRead(qc: QueryClient, conversationId: string): void {
  patchItems(qc, conversationId, (item) => ({ ...item, unreadCount: 0, unreadMentions: 0 }));
}

export function setInboxDraft(qc: QueryClient, conversationId: string, draft: string | null): void {
  patchItems(qc, conversationId, (item) => ({ ...item, draft }));
}
