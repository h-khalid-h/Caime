/**
 * Search what's on this device (PRD §49): offline, the people, conversations, messages and
 * actions the device already keeps are searched instead of the server, and the results say so.
 * Only what the device shows is found: a private conversation's words (R18) are never kept on
 * it, so they never are.
 */
import type {
  ConnectionView,
  ConversationView,
  InboxAllResponse,
  InboxItemView,
  InboxResponse,
  MessagesPage,
  SearchMessageHit,
  SearchResults,
  TasksResponse,
  TaskView,
} from '@caishy/core/api';
import { MATCH_END, MATCH_START } from '@caishy/core/format';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

const MAX = 20;
/** Around a match in a message: enough to recognise it. */
const AROUND = 40;

/** Without case, nor the accents a letter can go without ("cafe" finds "Café"). */
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLocaleLowerCase();

/** The words searched for, each to be found. */
export function searchWords(term: string): string[] {
  return fold(term)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

const hasAll = (text: string, words: string[]) => {
  const folded = fold(text);
  return words.every((w) => folded.includes(w));
};

/**
 * The text around the first word found, with the words found marked for `snippetParts`. Folding
 * can change a text's length ("ﬁ" is "fi"), so matches are found in the folded text and marked
 * in the original, a character at a time.
 */
export function snippetOf(text: string, words: string[]): string {
  const chars = Array.from(text);
  let folded = '';
  const origin: number[] = [];
  chars.forEach((ch, i) => {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) origin.push(i);
  });
  const marked = new Array<boolean>(chars.length).fill(false);
  let first = -1;
  for (const w of words) {
    let at = folded.indexOf(w);
    while (at >= 0) {
      const from = origin[at] ?? 0;
      const to = origin[at + w.length - 1] ?? from;
      for (let i = from; i <= to; i++) marked[i] = true;
      if (first < 0 || from < first) first = from;
      at = folded.indexOf(w, at + w.length);
    }
  }
  if (first < 0) return chars.slice(0, AROUND * 2).join('');
  const start = Math.max(0, first - AROUND);
  const end = Math.min(chars.length, first + AROUND * 2);
  let out = start > 0 ? '…' : '';
  let open = false;
  for (let i = start; i < end; i++) {
    if (marked[i] && !open) out += MATCH_START;
    if (!marked[i] && open) out += MATCH_END;
    open = Boolean(marked[i]);
    out += chars[i];
  }
  if (open) out += MATCH_END;
  return end < chars.length ? `${out}…` : out;
}

function conversations(qc: QueryClient): InboxItemView[] {
  const byId = new Map<string, InboxItemView>();
  const all = qc.getQueryData<InboxAllResponse>(['inbox', 'all']);
  for (const c of all?.conversations ?? []) byId.set(c.id, c);
  const inbox = qc.getQueryData<InboxResponse>(['inbox']);
  for (const s of inbox?.sections ?? [])
    for (const c of s.items) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()];
}

/** Who wrote a message, as the conversation on this device names them. */
function senderName(
  qc: QueryClient,
  conversationId: string,
  senderId: string | null,
  meId: string,
  fallback: string | null,
): string | null {
  if (!senderId) return fallback;
  if (senderId === meId) return 'You';
  const convo = qc.getQueryData<{ conversation: ConversationView }>([
    'conversation',
    conversationId,
  ])?.conversation;
  const p = convo?.participants.find((x) => x.userId === senderId);
  return p?.person.displayName ?? fallback;
}

export function searchOnDevice(qc: QueryClient, term: string, meId: string): SearchResults {
  const words = searchWords(term);
  if (!words.length) return {};
  const convos = conversations(qc);
  const titleOf = new Map(convos.map((c) => [c.id, c.title]));

  const connections = qc.getQueryData<{ connections: ConnectionView[] }>(['connections']);
  const people = (connections?.connections ?? [])
    .filter((c) =>
      hasAll(
        [
          c.person.displayName,
          c.person.handle,
          c.nickname ?? '',
          ...c.relationships.map((r) => `${r.label} ${r.orgName ?? ''}`),
        ].join(' '),
        words,
      ),
    )
    .slice(0, MAX)
    .map((c) => ({ person: c.person, relationship: c.relationships[0] ?? null }));

  const contexts = convos
    .filter(
      (c) =>
        c.privacyClass === 'standard' &&
        hasAll([c.title, c.topic ?? '', c.space?.name ?? ''].join(' '), words),
    )
    .slice(0, MAX)
    .map((c) => ({ conversationId: c.id, title: c.title, kind: c.kind, context: null }));

  const messages: SearchMessageHit[] = [];
  for (const [key, data] of qc.getQueriesData<InfiniteData<MessagesPage>>({
    queryKey: ['messages'],
  })) {
    const conversationId = String(key[1]);
    for (const page of data?.pages ?? [])
      for (const m of page.messages) {
        // Only words the device holds: never a private one's (sealed), never one taken back.
        if (!m.body || m.sealed || m.deletedAt || m.kind === 'system') continue;
        if (!hasAll(m.body, words)) continue;
        messages.push({
          id: m.id,
          conversationId,
          seq: m.seq,
          senderId: m.senderId,
          senderName: senderName(
            qc,
            conversationId,
            m.senderId,
            meId,
            titleOf.get(conversationId) ?? null,
          ),
          conversationTitle: titleOf.get(conversationId) ?? null,
          snippet: snippetOf(m.body, words),
          createdAt: m.createdAt,
        });
      }
  }
  messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const tasks = new Map<string, TaskView>();
  for (const [, data] of qc.getQueriesData<TasksResponse>({ queryKey: ['tasks'] }))
    for (const t of data?.tasks ?? [])
      if (
        !tasks.has(t.id) &&
        hasAll(
          [
            t.title,
            t.notes ?? '',
            t.owner.displayName,
            t.assignee.displayName,
            t.relationship ?? '',
          ].join(' '),
          words,
        )
      )
        tasks.set(t.id, t);

  return {
    people,
    contexts,
    messages: messages.slice(0, MAX),
    tasks: [...tasks.values()].slice(0, MAX),
  };
}
