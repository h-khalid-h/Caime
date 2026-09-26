import type { MessagesPage, MessageView } from '@caishy/core/api';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { qk } from '@/api/keys';
import { flatMessages, type MessagePages, upsertMessage } from './cache';

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
});
