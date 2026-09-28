import type { MessagesPage, MessageView } from '@caime/core/api';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { qk } from '@/api/keys';
import {
  flatMessages,
  type MessagePages,
  patchPinned,
  updateMessage,
  upsertMessage,
} from './cache';

const id = 'c1';
const msg = (seq: number, body = `m${seq}`): MessageView =>
  ({ id: `m${seq}`, conversationId: id, seq, body, clientId: null }) as unknown as MessageView;
const page = (...seqs: number[]): MessagesPage =>
  ({
    messages: seqs.map((s) => msg(s)),
    hasMore: false,
    lastSeq: Math.max(...seqs),
  }) as MessagesPage;

/** Load the first page through a query function that answers only when told. */
function loadPage(qc: QueryClient) {
  let answer: (p: MessagesPage) => void = () => {};
  const done = qc.fetchInfiniteQuery({
    queryKey: qk.messages(id),
    queryFn: () =>
      new Promise<MessagesPage>((resolve) => {
        answer = resolve;
      }),
    initialPageParam: undefined as number | undefined,
    staleTime: 0,
  });
  return { answer: (p: MessagesPage) => answer(p), done };
}

const seqs = (qc: QueryClient) =>
  flatMessages(qc.getQueryData<MessagePages>(qk.messages(id))).map((m) => m.seq);

describe('live messages and loading pages', () => {
  it('keeps a message that arrives while the first page is loading', async () => {
    const qc = new QueryClient();
    const load = loadPage(qc);
    upsertMessage(qc, msg(3)); // live, before the page (read without it) lands
    load.answer(page(1, 2));
    await load.done;
    expect(seqs(qc)).toEqual([1, 2, 3]);
  });

  it('keeps a message that arrives while a refresh is in flight', async () => {
    const qc = new QueryClient();
    qc.setQueryData<MessagePages>(qk.messages(id), {
      pages: [page(1, 2)],
      pageParams: [undefined],
    });
    const load = loadPage(qc);
    upsertMessage(qc, msg(3));
    expect(seqs(qc)).toEqual([1, 2, 3]); // shown at once
    load.answer(page(1, 2)); // the refresh was read before it
    await load.done;
    expect(seqs(qc)).toEqual([1, 2, 3]);
  });

  it('doesn’t double a message the page already has', async () => {
    const qc = new QueryClient();
    const load = loadPage(qc);
    upsertMessage(qc, msg(3, 'live'));
    load.answer(page(1, 2, 3));
    await load.done;
    expect(seqs(qc)).toEqual([1, 2, 3]);
  });
  it('a live message doesn’t make a copy restored on the device look complete', async () => {
    const qc = new QueryClient();
    // Restored from the device, then marked for a refetch (the app does this after restoring).
    qc.setQueryData<MessagePages>(qk.messages(id), {
      pages: [page(1, 2)],
      pageParams: [undefined],
    });
    const fetchedAt = qc.getQueryState(qk.messages(id))?.dataUpdatedAt;
    await qc.invalidateQueries({ queryKey: qk.messages(id), refetchType: 'none' });
    // Seq 3 was sent just before the reload; 4 arrives live before the conversation opens.
    upsertMessage(qc, msg(4));
    expect(seqs(qc)).toEqual([1, 2, 4]);
    const state = qc.getQueryState(qk.messages(id));
    // Still due for its refetch, which brings 3; its age is still the fetch's.
    expect(state?.isInvalidated).toBe(true);
    expect(state?.dataUpdatedAt).toBe(fetchedAt);
  });
});

describe('a message someone else changed', () => {
  const shown = (m: Partial<MessageView>) => ({ ...msg(2), ...m }) as MessageView;
  const withPoll = (mine: string[], reactions: MessageView['reactions']) =>
    shown({
      poll: { counts: { a: 1, b: 1 }, mine, voters: 2 },
      reactions,
    } as Partial<MessageView>);

  it('changes only one already shown, and keeps what’s the viewer’s own', () => {
    const qc = new QueryClient();
    const mine = withPoll(['a'], [{ emoji: '👍', count: 1, mine: true, userIds: ['me'] }]);
    qc.setQueryData<MessagePages>(qk.messages(id), {
      pages: [{ ...page(1), messages: [msg(1), mine] }],
      pageParams: [undefined],
    });
    // As the one who changed it sees it: their vote, their reactions.
    const theirs = {
      ...withPoll(
        ['b'],
        [
          { emoji: '👍', count: 2, mine: false, userIds: ['me', 'them'] },
          { emoji: '🎉', count: 1, mine: true, userIds: ['them'] },
        ],
      ),
      body: 'Edited',
      pinnedAt: '2026-09-27T10:00:00.000Z',
    } as MessageView;
    updateMessage(qc, theirs, 'me');
    const now = flatMessages(qc.getQueryData<MessagePages>(qk.messages(id))).find(
      (m) => m.id === 'm2',
    );
    expect(now).toMatchObject({ body: 'Edited', pinnedAt: '2026-09-27T10:00:00.000Z' });
    expect(now?.poll?.mine).toEqual(['a']);
    expect(now?.reactions).toEqual([
      { emoji: '👍', count: 2, mine: true, userIds: ['me', 'them'] },
      { emoji: '🎉', count: 1, mine: false, userIds: ['them'] },
    ]);
    // One further back, or deleted for oneself, isn't brought in by it.
    updateMessage(qc, { ...theirs, id: 'm0', seq: 0 } as MessageView, 'me');
    expect(seqs(qc)).toEqual([1, 2]);
  });

  it('at the top of the conversation, says what it says now', () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.pins(id), { messages: [msg(2, 'Rehearsal at 5pm'), msg(4, 'Bus at 6')] });
    patchPinned(qc, { ...msg(2, 'Rehearsal at 6pm'), reactions: [] } as unknown as MessageView);
    patchPinned(qc, { ...msg(9, 'Not pinned'), reactions: [] } as unknown as MessageView);
    const top = qc.getQueryData<{ messages: MessageView[] }>(qk.pins(id))?.messages ?? [];
    expect(top.map((m) => m.body)).toEqual(['Rehearsal at 6pm', 'Bus at 6']);
  });
});
