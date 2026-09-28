/**
 * Actions made or ticked offline (PRD §49): on screen at once, marked Pending, kept on the
 * device, and sent when the network allows, with the device's id so a retry is the same action.
 */
import type { TasksResponse, TaskView } from '@caime/core/api';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const stored = new Map<string, string>();
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  class NetworkError extends Error {}
  return {
    stored,
    ApiError,
    NetworkError,
    storage: {
      getItem: async (k: string) => stored.get(k) ?? null,
      setItem: async (k: string, v: string) => void stored.set(k, v),
      removeItem: async (k: string) => void stored.delete(k),
    },
    endpoints: {
      createTask: vi.fn(),
      updateTask: vi.fn(),
    },
    toast: vi.fn(),
    queryClient: { current: null as unknown as QueryClient },
  };
});
vi.mock('@react-native-async-storage/async-storage', () => ({ default: h.storage }));
vi.mock('@/api/client', () => ({ ApiError: h.ApiError, NetworkError: h.NetworkError }));
vi.mock('@/api/endpoints', () => ({ endpoints: h.endpoints }));
vi.mock('@/api/queryClient', () => ({
  get queryClient() {
    return h.queryClient.current;
  },
}));
vi.mock('@/ui/Toast', () => ({ toast: h.toast }));

const task = (id: string, status: TaskView['status'] = 'open') =>
  ({ id, title: `Task ${id}`, status, conversationId: null }) as unknown as TaskView;

const load = async ({ signedIn = true } = {}) => {
  const mod = await import('./taskOutbox');
  // The store rehydrates from storage first; start each test from an empty queue.
  await vi.advanceTimersByTimeAsync(0);
  if (signedIn) mod.setTaskOutboxUser('me');
  return mod;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  h.stored.clear();
  h.endpoints.createTask.mockReset();
  h.endpoints.updateTask.mockReset();
  h.toast.mockReset();
  h.queryClient.current = new QueryClient();
});
afterEach(() => vi.useRealTimers());

describe('actions made offline', () => {
  it('wait on the device as Pending, and go with the same id until they arrive', async () => {
    const { useTaskOutbox } = await load();
    h.endpoints.createTask
      .mockRejectedValueOnce(new h.NetworkError())
      .mockResolvedValue({ task: task('srv-1') });
    const id = useTaskOutbox.getState().add({ title: 'Renew the passport', dueAt: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(useTaskOutbox.getState().ops).toEqual([
      expect.objectContaining({ kind: 'create', id, state: 'queued', attempts: 1 }),
    ]);
    // Kept on the device: it's there when the app opens again.
    expect(h.stored.get('caime.task-outbox')).toContain('Renew the passport');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.endpoints.createTask).toHaveBeenCalledTimes(2);
    for (const [body] of h.endpoints.createTask.mock.calls)
      expect(body).toEqual({ title: 'Renew the passport', dueAt: null, clientId: id });
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });

  it('ticked before it was sent, it’s finished as soon as it’s made', async () => {
    const { useTaskOutbox, pendingTaskView } = await load();
    h.endpoints.createTask
      .mockRejectedValueOnce(new h.NetworkError())
      .mockResolvedValue({ task: task('srv-2') });
    h.endpoints.updateTask.mockResolvedValue({ task: task('srv-2', 'done') });
    const id = useTaskOutbox.getState().add({ title: 'Call the bank' });
    await vi.advanceTimersByTimeAsync(0);
    useTaskOutbox.getState().setStatus({ id, title: 'Call the bank' }, 'done');
    const [op] = useTaskOutbox.getState().ops;
    expect(pendingTaskView(op as never, { id: 'me', displayName: 'Me' })).toMatchObject({
      id,
      title: 'Call the bank',
      status: 'done',
      direction: 'mine',
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.endpoints.updateTask).toHaveBeenCalledWith('srv-2', { status: 'done' });
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });

  it('refused, it says why and waits for Try again or Discard', async () => {
    const { useTaskOutbox } = await load();
    h.endpoints.createTask.mockRejectedValue(new h.ApiError(400, 'invalid', 'That’s too long.'));
    const id = useTaskOutbox.getState().add({ title: 'x'.repeat(300) });
    await vi.advanceTimersByTimeAsync(0);
    expect(useTaskOutbox.getState().ops).toEqual([
      expect.objectContaining({ id, state: 'failed', error: 'That’s too long.' }),
    ]);
    // Nothing is retried by itself.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.endpoints.createTask).toHaveBeenCalledTimes(1);
    h.endpoints.createTask.mockResolvedValue({ task: task('srv-3') });
    useTaskOutbox.getState().retry(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.createTask).toHaveBeenCalledTimes(2);
    expect(useTaskOutbox.getState().ops).toEqual([]);
    h.endpoints.createTask.mockRejectedValue(new h.ApiError(403, 'forbidden', 'No.'));
    const other = useTaskOutbox.getState().add({ title: 'Another' });
    await vi.advanceTimersByTimeAsync(0);
    useTaskOutbox.getState().discard(other);
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });
});

describe('ticking an action offline', () => {
  it('shows at once, and sends only the last word once the network is back', async () => {
    const { useTaskOutbox } = await load();
    const qc = h.queryClient.current;
    qc.setQueryData<TasksResponse>(['tasks', 'todo', ''], {
      tasks: [task('t1'), task('t2')],
      counts: { todo: 2, waiting: 0, asked_me: 0, overdue: 0 },
    });
    h.endpoints.updateTask.mockRejectedValue(new h.NetworkError());
    useTaskOutbox.getState().setStatus(task('t1'), 'done');
    const shown = () =>
      qc.getQueryData<TasksResponse>(['tasks', 'todo', ''])!.tasks.map((x) => x.status);
    expect(shown()).toEqual(['done', 'open']);
    await vi.advanceTimersByTimeAsync(0);
    useTaskOutbox.getState().setStatus(task('t1'), 'open');
    useTaskOutbox.getState().setStatus(task('t1'), 'done');
    expect(shown()).toEqual(['done', 'open']);
    await vi.advanceTimersByTimeAsync(0);
    h.endpoints.updateTask.mockReset();
    h.endpoints.updateTask.mockResolvedValue({ task: task('t1', 'done') });
    await vi.advanceTimersByTimeAsync(30_000);
    // In order, so the last word is the one the server keeps.
    expect(h.endpoints.updateTask.mock.calls.at(-1)).toEqual(['t1', { status: 'done' }]);
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });

  it('changed again before it went, it goes once, as it was left', async () => {
    const { useTaskOutbox } = await load();
    // Something else is on its way first, so the tick waits its turn.
    let made: (v: unknown) => void = () => {};
    h.endpoints.createTask.mockReturnValue(new Promise((resolve) => (made = resolve)));
    h.endpoints.updateTask.mockResolvedValue({ task: task('t3', 'open') });
    useTaskOutbox.getState().add({ title: 'First' });
    useTaskOutbox.getState().setStatus(task('t3'), 'done');
    useTaskOutbox.getState().setStatus(task('t3'), 'open');
    expect(useTaskOutbox.getState().ops.filter((o) => o.kind === 'status')).toEqual([
      expect.objectContaining({ taskId: 't3', status: 'open', state: 'queued' }),
    ]);
    made({ task: task('srv-4') });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.updateTask).toHaveBeenCalledTimes(1);
    expect(h.endpoints.updateTask).toHaveBeenCalledWith('t3', { status: 'open' });
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });

  it('refused, it’s dropped and said, and the list shows it as it really is', async () => {
    const { useTaskOutbox } = await load();
    const qc = h.queryClient.current;
    const refetched = vi.spyOn(qc, 'invalidateQueries');
    h.endpoints.updateTask.mockRejectedValue(
      new h.ApiError(404, 'not_found', 'That action isn’t here any more.'),
    );
    useTaskOutbox.getState().setStatus(task('gone'), 'done');
    await vi.advanceTimersByTimeAsync(0);
    expect(useTaskOutbox.getState().ops).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith(
      'Couldn’t update “Task gone”: That action isn’t here any more.',
      { tone: 'danger' },
    );
    expect(refetched).toHaveBeenCalledWith({ queryKey: ['tasks'] });
  });
});

describe('the queue on the device', () => {
  it('sends again what was mid-send when the app closed', async () => {
    h.stored.set(
      'caime.task-outbox',
      JSON.stringify({
        state: {
          ops: [
            {
              kind: 'create',
              id: 'dev-1',
              body: { title: 'Pack' },
              createdAt: '2026-09-27T10:00:00Z',
              state: 'sending',
              attempts: 1,
            },
          ],
        },
        version: 0,
      }),
    );
    const { useTaskOutbox, setTaskOutboxUser } = await load({ signedIn: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(useTaskOutbox.getState().ops).toEqual([
      expect.objectContaining({ id: 'dev-1', state: 'queued' }),
    ]);
    // Nothing goes while nobody is signed in; once they are, it does.
    useTaskOutbox.getState().flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.createTask).not.toHaveBeenCalled();
    h.endpoints.createTask.mockResolvedValue({ task: task('srv-9') });
    setTaskOutboxUser('me');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.createTask).toHaveBeenCalledWith({ title: 'Pack', clientId: 'dev-1' });
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });
});

describe('ticks as an action arrives, and in more than one tab', () => {
  it('a tick while it’s being sent, and one just after, go to the server’s action', async () => {
    const { useTaskOutbox } = await load();
    let answer: (v: unknown) => void = () => {};
    h.endpoints.createTask.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    h.endpoints.updateTask.mockResolvedValue({ task: task('srv-9', 'done') });
    const id = useTaskOutbox.getState().add({ title: 'Paid rent' });
    await vi.advanceTimersByTimeAsync(0);
    // Ticked while its create is on its way: done is sent once it lands.
    useTaskOutbox.getState().setStatus({ id, title: 'Paid rent' }, 'done');
    answer({ task: task('srv-9') });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.updateTask).toHaveBeenCalledWith('srv-9', { status: 'done' });
    expect(useTaskOutbox.getState().ops).toEqual([]);
    // Undone a moment later from the same row (still this device's id): the server's action.
    h.endpoints.updateTask.mockClear();
    h.endpoints.updateTask.mockResolvedValue({ task: task('srv-9') });
    useTaskOutbox.getState().setStatus({ id, title: 'Paid rent' }, 'open');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.updateTask).toHaveBeenCalledWith('srv-9', { status: 'open' });
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('the last tick wins even when two are waiting', async () => {
    const { useTaskOutbox } = await load();
    h.endpoints.updateTask.mockRejectedValue(new h.NetworkError());
    const t = { id: 'srv-3', title: 'Call the bank' };
    useTaskOutbox.getState().setStatus(t, 'done');
    await vi.advanceTimersByTimeAsync(0);
    // While the first is sending, it's untouched: the second waits after it.
    useTaskOutbox.setState((s) => ({
      ops: s.ops.map((o) => ({ ...o, state: 'sending' as const })),
    }));
    useTaskOutbox.getState().setStatus(t, 'open');
    useTaskOutbox.setState((s) => ({
      ops: s.ops.map((o) => ({ ...o, state: 'queued' as const })),
    }));
    // Both waiting: a tick now changes the one that goes last.
    useTaskOutbox.getState().setStatus(t, 'done');
    const statuses = useTaskOutbox
      .getState()
      .ops.map((o) => (o.kind === 'status' ? o.status : null));
    expect(statuses.at(-1)).toBe('done');
  });

  it('never sends someone else’s, even when it comes back from storage after signing in', async () => {
    const mod = await load();
    // Another tab wrote down someone else's (signed in there before), and it's read again here.
    h.stored.set(
      'caime.task-outbox',
      JSON.stringify({
        state: {
          ops: [
            {
              kind: 'create',
              id: 'theirs',
              body: { title: 'Their thing' },
              createdAt: '2026-09-27T10:00:00Z',
              state: 'queued',
              attempts: 0,
              userId: 'someone',
            },
          ],
        },
        version: 0,
      }),
    );
    await mod.useTaskOutbox.persist.rehydrate();
    await vi.advanceTimersByTimeAsync(0);
    expect(mod.useTaskOutbox.getState().ops.map((o) => o.id)).toEqual(['theirs']);
    h.endpoints.createTask.mockResolvedValue({ task: task('srv-x') });
    mod.useTaskOutbox.getState().flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.createTask).not.toHaveBeenCalled();
  });

  it('two tabs keep each other’s, and never send another person’s', async () => {
    const { useTaskOutbox, setTaskOutboxUser } = await load();
    const g = globalThis as { document?: unknown };
    g.document = {};
    try {
      h.endpoints.createTask.mockRejectedValue(new h.NetworkError());
      h.endpoints.updateTask.mockRejectedValue(new h.NetworkError());
      // Another tab added one while offline, and wrote it down.
      h.stored.set(
        'caime.task-outbox',
        JSON.stringify({
          state: {
            ops: [
              {
                kind: 'create',
                id: 'other-tab',
                body: { title: 'Renew passport' },
                createdAt: new Date(Date.now() + 1000).toISOString(),
                state: 'queued',
                attempts: 0,
                userId: 'me',
              },
            ],
          },
          version: 0,
        }),
      );
      // This one ticks something: what it writes keeps the other tab's too.
      useTaskOutbox.getState().setStatus({ id: 'srv-5', title: 'Call the bank' }, 'done');
      await vi.advanceTimersByTimeAsync(0);
      const written = JSON.parse(h.stored.get('caime.task-outbox') ?? '{}');
      expect(written.state.ops.map((o: { id: string }) => o.id)).toContain('other-tab');
      // Someone else signs in here: what was queued as the last person is never sent as theirs.
      useTaskOutbox.setState((s) => ({
        ops: [...s.ops, { ...s.ops[0]!, id: 'x', kind: 'status' as const, userId: 'me' } as never],
      }));
      h.endpoints.updateTask.mockClear();
      setTaskOutboxUser('someone-else');
      await vi.advanceTimersByTimeAsync(5000);
      expect(h.endpoints.updateTask).not.toHaveBeenCalled();
      expect(useTaskOutbox.getState().ops).toEqual([]);
    } finally {
      delete g.document;
    }
  });

  it('sent again after an answer was lost, it starts from what the server has', async () => {
    const { useTaskOutbox } = await load();
    h.endpoints.createTask.mockRejectedValueOnce(new h.NetworkError());
    const id = useTaskOutbox.getState().add({ title: 'Pay rent' });
    await vi.advanceTimersByTimeAsync(0);
    useTaskOutbox.getState().setStatus({ id, title: 'Pay rent' }, 'done');
    // Back: the server makes it and ticks it, but the tick's answer never arrives.
    h.endpoints.createTask.mockResolvedValueOnce({ task: task('srv-4') });
    h.endpoints.updateTask.mockRejectedValueOnce(new h.NetworkError());
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.endpoints.updateTask).toHaveBeenCalledWith('srv-4', { status: 'done' });
    // Unticked meanwhile. Sent again, the server has it done: it's made open again.
    useTaskOutbox.getState().setStatus({ id, title: 'Pay rent' }, 'open');
    h.endpoints.createTask.mockResolvedValueOnce({ task: task('srv-4', 'done') });
    h.endpoints.updateTask.mockResolvedValue({ task: task('srv-4') });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.endpoints.updateTask).toHaveBeenLastCalledWith('srv-4', { status: 'open' });
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });

  it('landed, it leaves every list due to be read again', async () => {
    const { useTaskOutbox } = await load();
    const qc = h.queryClient.current;
    // A list not on screen, from earlier.
    qc.setQueryData(['tasks', 'done', ''], { tasks: [] });
    h.endpoints.createTask
      .mockRejectedValueOnce(new h.NetworkError())
      .mockResolvedValue({ task: task('srv-8') });
    h.endpoints.updateTask.mockResolvedValue({ task: task('srv-8', 'done') });
    const id = useTaskOutbox.getState().add({ title: 'Paid rent' });
    await vi.advanceTimersByTimeAsync(0);
    useTaskOutbox.getState().setStatus({ id, title: 'Paid rent' }, 'done');
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.endpoints.updateTask).toHaveBeenCalledWith('srv-8', { status: 'done' });
    expect(qc.getQueryState(['tasks', 'done', ''])?.isInvalidated).toBe(true);
  });

  it('an open tab shows and sends what another tab queued, as it heard of it', async () => {
    const g = globalThis as { document?: unknown; window?: unknown };
    const heard: Record<string, (e: { key: string; newValue: string | null }) => void> = {};
    g.document = {};
    g.window = {
      addEventListener: (type: string, fn: never) => {
        heard[type] = fn;
      },
    };
    try {
      const { useTaskOutbox } = await load();
      h.endpoints.createTask.mockResolvedValue({ task: task('srv-7') });
      const op = (id: string, userId: string, title: string) => ({
        kind: 'create',
        id,
        body: { title },
        createdAt: new Date(Date.now() + 1000).toISOString(),
        state: 'queued',
        attempts: 0,
        userId,
      });
      // The other tab wrote down one of this person's, and one of someone else's.
      const written = JSON.stringify({
        state: { ops: [op('other-tab', 'me', 'Renew passport'), op('theirs', 'them', 'Secret')] },
        version: 0,
      });
      h.stored.set('caime.task-outbox', written);
      heard.storage?.({ key: 'caime.task-outbox', newValue: written });
      await vi.advanceTimersByTimeAsync(0);
      expect(h.endpoints.createTask).toHaveBeenCalledTimes(1);
      expect(h.endpoints.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Renew passport', clientId: 'other-tab' }),
      );
      expect(useTaskOutbox.getState().ops).toEqual([]);
    } finally {
      delete g.document;
      delete g.window;
    }
  });

  it('of two tabs’ copies of one waiting, the later change is sent', async () => {
    const g = globalThis as { document?: unknown };
    g.document = {};
    try {
      const { useTaskOutbox } = await load();
      h.endpoints.updateTask.mockRejectedValueOnce(new h.NetworkError());
      useTaskOutbox.getState().setStatus({ id: 'srv-5', title: 'Call the bank' }, 'done');
      await vi.advanceTimersByTimeAsync(0);
      const [mine] = useTaskOutbox.getState().ops;
      // Another tab unticked it afterwards, and wrote that down.
      h.stored.set(
        'caime.task-outbox',
        JSON.stringify({
          state: {
            ops: [
              { ...mine, status: 'open', changedAt: new Date(Date.now() + 5000).toISOString() },
            ],
          },
          version: 0,
        }),
      );
      h.endpoints.updateTask.mockResolvedValue({ task: task('srv-5') });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(h.endpoints.updateTask).toHaveBeenLastCalledWith('srv-5', { status: 'open' });
      expect(useTaskOutbox.getState().ops).toEqual([]);
    } finally {
      delete g.document;
    }
  });

  it('writing the queue down keeps another tab’s later change to one both have', async () => {
    const g = globalThis as { document?: unknown };
    g.document = {};
    try {
      const { useTaskOutbox } = await load();
      h.endpoints.updateTask.mockRejectedValue(new h.NetworkError());
      h.endpoints.createTask.mockRejectedValue(new h.NetworkError());
      const made = useTaskOutbox.getState().add({ title: 'Book the car' });
      useTaskOutbox.getState().setStatus({ id: 'srv-6', title: 'Call the garage' }, 'done');
      await vi.advanceTimersByTimeAsync(0);
      const ops = useTaskOutbox.getState().ops;
      const tick = ops.find((o) => o.kind === 'status')!;
      // Another tab unticked the garage afterwards, and wrote that down.
      h.stored.set(
        'caime.task-outbox',
        JSON.stringify({
          state: {
            ops: ops.map((o) =>
              o.id === tick.id
                ? { ...o, status: 'open', changedAt: new Date(Date.now() + 5000).toISOString() }
                : o,
            ),
          },
          version: 0,
        }),
      );
      // This tab ticks the car, which waits to be made (nothing is sent): what it writes keeps
      // the other tab's untick.
      useTaskOutbox.getState().setStatus({ id: made, title: 'Book the car' }, 'done');
      await vi.advanceTimersByTimeAsync(0);
      const written = JSON.parse(h.stored.get('caime.task-outbox') ?? '{}');
      expect(written.state.ops.find((o: { id: string }) => o.id === tick.id)).toMatchObject({
        status: 'open',
      });
      expect(written.state.ops.find((o: { id: string }) => o.id === made)).toMatchObject({
        done: true,
      });
    } finally {
      delete g.document;
    }
  });
});
