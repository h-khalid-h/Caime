import type {
  ConnectionView,
  InboxAllResponse,
  MessagesPage,
  MessageView,
  TasksResponse,
  TaskView,
} from '@caishy/core/api';
import { snippetParts } from '@caishy/core/format';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { searchOnDevice, searchWords, snippetOf } from './onDevice';

const msg = (id: string, conversationId: string, body: string | null, extra = {}): MessageView =>
  ({
    id,
    conversationId,
    seq: Number(id.replace(/\D/g, '')) || 1,
    senderId: 'sarah',
    kind: 'text',
    body,
    sealed: null,
    deletedAt: null,
    createdAt: `2026-09-2${id.length}T10:00:00.000Z`,
    ...extra,
  }) as unknown as MessageView;

function device(): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData<InboxAllResponse>(['inbox', 'all'], {
    conversations: [
      {
        id: 'c1',
        title: 'Sarah Smith',
        kind: 'direct',
        privacyClass: 'standard',
        topic: null,
        space: null,
      },
      {
        id: 'c2',
        title: 'Café plans',
        kind: 'group',
        privacyClass: 'standard',
        topic: null,
        space: null,
      },
      {
        id: 'c3',
        title: 'Secret',
        kind: 'direct',
        privacyClass: 'private',
        topic: null,
        space: null,
      },
    ] as never,
    counts: {} as never,
    headline: '',
  });
  qc.setQueryData(['conversation', 'c1'], {
    conversation: { participants: [{ userId: 'sarah', person: { displayName: 'Sarah Smith' } }] },
  });
  const pages = (messages: MessageView[]) => ({
    pages: [{ messages, lastSeq: messages.length, hasMore: false } satisfies MessagesPage],
    pageParams: [undefined],
  });
  qc.setQueryData(
    ['messages', 'c1'],
    pages([
      msg('m1', 'c1', 'The invoice for the café is attached'),
      msg('m22', 'c1', 'Can you send the INVOICE again?', { senderId: 'me' }),
      msg('m333', 'c1', 'invoice (deleted)', { deletedAt: '2026-09-25T00:00:00Z' }),
    ]),
  );
  qc.setQueryData(['messages', 'c3'], pages([msg('m4', 'c3', null, { sealed: { v: 1 } })]));
  qc.setQueryData<{ connections: ConnectionView[] }>(['connections'], {
    connections: [
      {
        person: { id: 'sarah', displayName: 'Sarah Smith', handle: 'sarah' },
        nickname: null,
        relationships: [{ label: 'Manager', orgName: 'DATA C' }],
      },
      {
        person: { id: 'omar', displayName: 'Omar Haddad', handle: 'omar' },
        nickname: 'Uncle O',
        relationships: [],
      },
    ] as never,
  });
  qc.setQueryData<TasksResponse>(['tasks', 'todo', ''], {
    tasks: [
      {
        id: 't1',
        title: 'Pay the invoice',
        notes: null,
        owner: { displayName: 'Me' },
        assignee: { displayName: 'Me' },
        relationship: null,
      },
    ] as unknown as TaskView[],
    counts: { todo: 1, waiting: 0, asked_me: 0, overdue: 0 },
  });
  qc.setQueryData<TasksResponse>(['tasks', 'all', ''], {
    tasks: [
      {
        id: 't1',
        title: 'Pay the invoice',
        notes: null,
        owner: { displayName: 'Me' },
        assignee: { displayName: 'Me' },
        relationship: null,
      },
    ] as unknown as TaskView[],
    counts: { todo: 1, waiting: 0, asked_me: 0, overdue: 0 },
  });
  return qc;
}

describe('searching what’s on the device (PRD §49)', () => {
  it('finds messages, people, conversations and actions, every word, without case or accents', () => {
    const r = searchOnDevice(device(), 'invoice', 'me');
    expect(r.messages?.map((m) => m.id)).toEqual(['m22', 'm1']);
    expect(r.messages?.map((m) => m.senderName)).toEqual(['You', 'Sarah Smith']);
    expect(r.tasks?.map((t) => t.id)).toEqual(['t1']);
    expect(searchOnDevice(device(), 'cafe', 'me').contexts?.map((c) => c.conversationId)).toEqual([
      'c2',
    ]);
    expect(searchOnDevice(device(), 'cafe invoice', 'me').messages?.map((m) => m.id)).toEqual([
      'm1',
    ]);
    // People by name, handle, nickname, or how you know them.
    expect(
      searchOnDevice(device(), 'data c manager', 'me').people?.map((p) => p.person.id),
    ).toEqual(['sarah']);
    expect(searchOnDevice(device(), 'uncle', 'me').people?.map((p) => p.person.id)).toEqual([
      'omar',
    ]);
    expect(searchOnDevice(device(), '   ', 'me')).toEqual({});
  });

  it('never finds a private conversation, its messages, or a message taken back', () => {
    const r = searchOnDevice(device(), 'secret', 'me');
    expect(r.contexts).toEqual([]);
    const deleted = searchOnDevice(device(), 'deleted', 'me');
    expect(deleted.messages).toEqual([]);
  });

  it('marks what was found in the words as written', () => {
    const s = snippetOf('Das Café öffnet um acht', searchWords('cafe OFFNET'));
    expect(snippetParts(s)).toEqual([
      { text: 'Das ', match: false },
      { text: 'Café', match: true },
      { text: ' ', match: false },
      { text: 'öffnet', match: true },
      { text: ' um acht', match: false },
    ]);
    // A long message is cut around the first match.
    const long = `${'a '.repeat(60)}needle${' b'.repeat(60)}`;
    const cut = snippetParts(snippetOf(long, ['needle']));
    expect(cut[0]!.text.startsWith('…')).toBe(true);
    expect(cut.find((p) => p.match)?.text).toBe('needle');
    expect(cut.at(-1)!.text.endsWith('…')).toBe(true);
  });
});
