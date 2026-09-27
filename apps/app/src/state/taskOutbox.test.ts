/**
 * Actions made or ticked offline (PRD §49): on screen at once, marked Pending, kept on the
 * device, and sent when the network allows, with the device's id so a retry is the same action.
 */
import type { TasksResponse, TaskView } from '@caishy/core/api';
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

const load = async () => {
  const mod = await import('./taskOutbox');
  // The store rehydrates from storage first; start each test from an empty queue.
  await vi.advanceTimersByTimeAsync(0);
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
    expect(h.stored.get('caishy.task-outbox')).toContain('Renew the passport');
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
      'caishy.task-outbox',
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
    const { useTaskOutbox } = await load();
    await vi.advanceTimersByTimeAsync(0);
    expect(useTaskOutbox.getState().ops).toEqual([
      expect.objectContaining({ id: 'dev-1', state: 'queued' }),
    ]);
    h.endpoints.createTask.mockResolvedValue({ task: task('srv-9') });
    useTaskOutbox.getState().flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.endpoints.createTask).toHaveBeenCalledWith({ title: 'Pack', clientId: 'dev-1' });
    expect(useTaskOutbox.getState().ops).toEqual([]);
  });
});
