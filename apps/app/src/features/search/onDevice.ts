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
} from '@caime/core/api';
import { MATCH_END, MATCH_START } from '@caime/core/format';
import { parseSearchQuery, type SearchScope } from '@caime/core/search';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

const MAX = 20;
/** Around a match in a message: enough to recognise it. */
const AROUND = 40;

/**
 * Without case, nor the accents a letter can go without ("cafe" finds "Café"): the same on every
 * device, whatever its language (a Turkish one's capital I is still i).
 */
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase();

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

/**
 * Who wrote a message, as the conversation on this device names them. Someone it doesn't list
 * (who has left a group) has no name here rather than the group's; in a one-to-one, the other
 * person is the conversation.
 */
function senderName(
  qc: QueryClient,
  conversationId: string,
  senderId: string | null,
  meId: string,
  direct: string | null,
): string | null {
  if (!senderId) return direct;
  if (senderId === meId) return 'You';
  const convo = qc.getQueryData<{ conversation: ConversationView }>([
    'conversation',
    conversationId,
  ])?.conversation;
  const p = convo?.participants.find((x) => x.userId === senderId);
  return p?.person.displayName ?? direct;
}

/** What the server would look for, understood the same way ("my manager", "tasks from Sarah"). */
export function searchOnDevice(qc: QueryClient, term: string, meId: string): SearchResults {
  const q = parseSearchQuery(term);
  const words = searchWords(q.text);
  const person = q.person ? searchWords(q.person) : [];
  const rel = q.relationship;
  // As typed (without a last "?"): someone is also found by what they're called ("uncle" is
  // Omar, nicknamed "Uncle O", as well as whoever is labelled an uncle).
  const plain = searchWords(term.trim().replace(/[?.!]+$/, ''));
  // Files, links and decisions aren't kept on the device to be searched: offline, nothing.
  if (!words.length && !person.length && !rel && !['people', 'tasks', 'waiting'].includes(q.scope))
    return {};
  const wants = (scope: SearchScope) => q.scope === 'all' || q.scope === scope;
  const convos = conversations(qc);
  const titleOf = new Map(convos.map((c) => [c.id, c.title]));
  // Whose a one-to-one is: the other person, or, in a customer's conversation with an
  // organization, the organization (as the server names its team to them).
  const directOf = new Map(
    convos.map((c) => [c.id, c.org ? c.org.name : c.kind === 'direct' ? c.title : null]),
  );

  const connections = qc.getQueryData<{ connections: ConnectionView[] }>(['connections']);
  // Whom "from X" means, as the server finds them: a connection by name, nickname or handle,
  // known by id, so it holds in a group they've since left.
  const handle = fold((q.person ?? '').trim().replace(/^@/, ''));
  const fromIds = new Set(
    person.length
      ? (connections?.connections ?? [])
          .filter(
            (c) =>
              hasAll(c.person.displayName, person) ||
              hasAll(c.nickname ?? '', person) ||
              (handle.length > 0 && fold(c.person.handle).startsWith(handle)),
          )
          .map((c) => c.person.id)
      : [],
  );
  const people = wants('people')
    ? (connections?.connections ?? [])
        .filter(
          (c) =>
            (rel !== null &&
              c.relationships.some(
                (r) => r.sphere === rel.sphere && (!rel.role || r.role === rel.role),
              )) ||
            (plain.length > 0 &&
              hasAll(
                [
                  c.person.displayName,
                  c.person.handle,
                  c.nickname ?? '',
                  ...c.relationships.map((r) => `${r.label} ${r.orgName ?? ''}`),
                ].join(' '),
                plain,
              )),
        )
        .slice(0, MAX)
        .map((c) => ({ person: c.person, relationship: c.relationships[0] ?? null }))
    : [];

  const contexts =
    wants('contexts') && words.length
      ? convos
          .filter(
            (c) =>
              c.privacyClass === 'standard' &&
              hasAll([c.title, c.topic ?? '', c.space?.name ?? ''].join(' '), words),
          )
          .slice(0, MAX)
          .map((c) => ({ conversationId: c.id, title: c.title, kind: c.kind, context: null }))
      : [];

  // Every message that matches, newest first, and only the ones shown made into hits.
  const found: Array<{ m: MessagesPage['messages'][number]; conversationId: string }> = [];
  if (wants('messages') && (words.length || person.length))
    for (const [key, data] of qc.getQueriesData<InfiniteData<MessagesPage>>({
      queryKey: ['messages'],
    })) {
      const conversationId = String(key[1]);
      for (const page of data?.pages ?? [])
        for (const m of page.messages) {
          // Only words the device holds: never a private one's (sealed), never one taken back.
          if (!m.body || m.sealed || m.deletedAt || m.kind === 'system') continue;
          if (words.length && !hasAll(m.body, words)) continue;
          if (
            person.length &&
            !(m.senderId !== null && fromIds.has(m.senderId)) &&
            !hasAll(
              senderName(
                qc,
                conversationId,
                m.senderId,
                meId,
                directOf.get(conversationId) ?? null,
              ) ?? '',
              person,
            )
          )
            continue;
          found.push({ m, conversationId });
        }
    }
  found.sort((a, b) => b.m.createdAt.localeCompare(a.m.createdAt));
  const messages: SearchMessageHit[] = found.slice(0, MAX).map(({ m, conversationId }) => ({
    id: m.id,
    conversationId,
    seq: m.seq,
    senderId: m.senderId,
    senderName: senderName(
      qc,
      conversationId,
      m.senderId,
      meId,
      directOf.get(conversationId) ?? null,
    ),
    conversationTitle: titleOf.get(conversationId) ?? null,
    snippet: snippetOf(m.body ?? '', words),
    createdAt: m.createdAt,
  }));

  // Actions: what the words find; "tasks from Sarah", "what Sarah asked me", "waiting on Sarah".
  const directions =
    q.scope === 'waiting'
      ? ['waiting', 'i_asked']
      : q.direction === 'asked_me' || (q.scope === 'tasks' && !q.direction && person.length > 0)
        ? ['asked_me']
        : q.direction === 'i_asked'
          ? ['i_asked', 'waiting']
          : null;
  const tasks = new Map<string, TaskView>();
  if (wants('tasks') || q.scope === 'waiting')
    for (const [, data] of qc.getQueriesData<TasksResponse>({ queryKey: ['tasks'] }))
      for (const t of data?.tasks ?? []) {
        if (tasks.has(t.id)) continue;
        // As the server's search: only what's still to happen, never one done, declined or
        // cancelled.
        if (t.status !== 'open' && t.status !== 'accepted') continue;
        if (directions && !directions.includes(t.direction)) continue;
        if (
          words.length &&
          !hasAll(
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
          continue;
        if (
          person.length &&
          !fromIds.has(t.owner.id) &&
          !(t.assignee.id !== null && fromIds.has(t.assignee.id)) &&
          !hasAll(`${t.owner.displayName} ${t.assignee.displayName}`, person)
        )
          continue;
        if (!words.length && !person.length && q.scope === 'all') continue;
        tasks.set(t.id, t);
      }

  return {
    people,
    contexts,
    messages,
    tasks: [...tasks.values()].slice(0, MAX),
  };
}
