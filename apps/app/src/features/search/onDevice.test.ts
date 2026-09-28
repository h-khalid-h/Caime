import type {
  ConnectionView,
  InboxAllResponse,
  MessagesPage,
  MessageView,
  TasksResponse,
  TaskView,
} from '@caime/core/api';
import { snippetParts } from '@caime/core/format';
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
        relationships: [{ label: 'Manager', orgName: 'DATA C', sphere: 'work', role: 'manager' }],
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
        status: 'open',
        direction: 'mine',
        owner: { id: 'me', displayName: 'Me' },
        assignee: { id: 'me', displayName: 'Me' },
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
        status: 'open',
        direction: 'mine',
        owner: { id: 'me', displayName: 'Me' },
        assignee: { id: 'me', displayName: 'Me' },
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

  it('understands a search as the server does: who you know how, whose actions, a last “?”', () => {
    expect(searchOnDevice(device(), 'my manager', 'me').people?.map((p) => p.person.id)).toEqual([
      'sarah',
    ]);
    expect(searchOnDevice(device(), 'invoice?', 'me').messages?.map((m) => m.id)).toEqual([
      'm22',
      'm1',
    ]);
    // "invoice from Sarah": her words, not everyone's.
    expect(searchOnDevice(device(), 'invoice from Sarah', 'me').messages?.map((m) => m.id)).toEqual(
      ['m1'],
    );
    expect(searchOnDevice(device(), 'my tasks', 'me').tasks?.map((t) => t.id)).toEqual(['t1']);
  });

  it('reads who and what as the server does: nicknames, organizations, only what’s still to do', () => {
    const qc = device();
    const task = (id: string, extra: Record<string, unknown>) =>
      ({ id, title: `Task ${id}`, notes: null, relationship: null, ...extra }) as never;
    const me = { id: 'me', displayName: 'Me' };
    const sarah = { id: 'sarah', displayName: 'Sarah Smith' };
    const noor = { id: 'noor', displayName: 'Noor Haddad' };
    qc.setQueryData<TasksResponse>(['tasks', 'done', ''], {
      tasks: [
        task('done-noor', { status: 'done', direction: 'waiting', owner: me, assignee: noor }),
        task('open-noor', { status: 'open', direction: 'waiting', owner: me, assignee: noor }),
        task('from-sarah', {
          status: 'accepted',
          direction: 'asked_me',
          owner: sarah,
          assignee: me,
        }),
        task('to-sarah', { status: 'open', direction: 'waiting', owner: me, assignee: sarah }),
        task('mine-done', { status: 'done', direction: 'mine', owner: me, assignee: me }),
      ],
      counts: { todo: 0, waiting: 0, asked_me: 0, overdue: 0 },
    });
    const ids = (term: string) => searchOnDevice(qc, term, 'me').tasks?.map((t) => t.id);
    // Finished, declined or cancelled: never found, as the server finds nothing of them.
    expect(ids('waiting on Noor')).toEqual(['open-noor']);
    expect(ids('my tasks')).toEqual(['t1', 'open-noor', 'from-sarah', 'to-sarah']);
    // "Tasks from Sarah": what she asked, not what was asked of her.
    expect(ids('tasks from Sarah')).toEqual(['from-sarah']);
    // "From" someone by what you call them, and in a group they've left since.
    qc.setQueryData(['messages', 'c2'], {
      pages: [
        {
          messages: [msg('m7', 'c2', 'The invoice is paid', { senderId: 'omar' })],
          lastSeq: 7,
          hasMore: false,
        },
      ],
      pageParams: [undefined],
    });
    for (const term of ['invoice from Uncle O', 'invoice from Omar', 'invoice from @omar'])
      expect(
        searchOnDevice(qc, term, 'me').messages?.map((m) => m.id),
        term,
      ).toEqual(['m7']);
    // With an organization, its messages are the organization's, never anyone on its team.
    qc.setQueryData<InboxAllResponse>(['inbox', 'all'], {
      conversations: [
        {
          id: 'c9',
          title: 'Nile Dental',
          kind: 'business',
          privacyClass: 'standard',
          topic: null,
          space: null,
          org: { id: 'org1', name: 'Nile Dental' },
        },
      ] as never,
      counts: {} as never,
      headline: '',
    });
    qc.setQueryData(['conversation', 'c9'], { conversation: { participants: [] } });
    qc.setQueryData(['messages', 'c9'], {
      pages: [
        {
          messages: [msg('m8', 'c9', 'Your appointment is on Tuesday', { senderId: 'org1' })],
          lastSeq: 8,
          hasMore: false,
        },
      ],
      pageParams: [undefined],
    });
    expect(searchOnDevice(qc, 'appointment', 'me').messages?.[0]).toMatchObject({
      id: 'm8',
      senderName: 'Nile Dental',
    });
  });

  it('names nobody for a message from someone no longer in a group, never the group', () => {
    const qc = device();
    qc.setQueryData(['messages', 'c2'], {
      pages: [
        {
          messages: [msg('m5', 'c2', 'The invoice is in the drive', { senderId: 'left' })],
          lastSeq: 1,
          hasMore: false,
        },
      ],
      pageParams: [undefined],
    });
    const [hit] = searchOnDevice(qc, 'drive', 'me').messages ?? [];
    expect(hit).toMatchObject({ id: 'm5', senderName: null, conversationTitle: 'Café plans' });
  });

  it('builds what it shows only for what it keeps', () => {
    const qc = device();
    const many = Array.from({ length: 300 }, (_, i) =>
      msg(`m${1000 + i}`, 'c2', `invoice number ${i}`, {
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      }),
    );
    qc.setQueryData(['messages', 'c2'], {
      pages: [{ messages: many, lastSeq: many.length, hasMore: false }],
      pageParams: [undefined],
    });
    const r = searchOnDevice(qc, 'invoice', 'me');
    expect(r.messages).toHaveLength(20);
    // Newest first: the two from Sarah's conversation, then the latest of the three hundred.
    expect(r.messages?.slice(0, 3).map((m) => m.id)).toEqual(['m22', 'm1', 'm1299']);
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
