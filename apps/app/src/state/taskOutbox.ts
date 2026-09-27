/**
 * Actions made or ticked while offline (PRD §49, ADR-8): on screen at once and marked Pending,
 * kept when the app closes, and sent in order when the network allows. A new one carries this
 * device's id for it, so sending it again after a lost answer is the same action on the server.
 */
import type { MemoryView, TasksResponse, TaskView } from '@caishy/core/api';
import { uuidv4 } from '@caishy/core/ids';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ApiError, NetworkError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { toast } from '@/ui/Toast';

export interface NewTask {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  dueHasTime?: boolean;
  conversationId?: string;
  messageId?: string;
}

type SendState = 'queued' | 'sending' | 'failed';

/** An action made here and not yet on the server: its id is this device's id for it. */
export interface PendingCreate {
  kind: 'create';
  id: string;
  body: NewTask;
  createdAt: string;
  state: SendState;
  error?: string;
  attempts: number;
  /** Ticked before it was sent: finished as soon as it's made. */
  done?: boolean;
}

/** Finishing an action, or undoing that, not yet on the server. */
export interface PendingStatus {
  kind: 'status';
  id: string;
  taskId: string;
  title: string;
  status: 'open' | 'done';
  createdAt: string;
  state: SendState;
  attempts: number;
}

export type PendingTaskOp = PendingCreate | PendingStatus;

interface TaskOutboxState {
  ops: PendingTaskOp[];
  /** A new action of one's own. Returns this device's id for it. */
  add: (body: NewTask) => string;
  /** Finish an action or open it again, a pending one too. */
  setStatus: (task: Pick<TaskView, 'id' | 'title'>, status: 'open' | 'done') => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
  flush: () => void;
  clear: () => void;
}

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(attempts: number): void {
  if (retryTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    useTaskOutbox.getState().flush();
  }, delay);
}

/** Offline, or the server couldn't take it just now: it waits and goes again. */
const waits = (err: unknown) =>
  err instanceof NetworkError ||
  (err instanceof ApiError && (err.status >= 500 || err.status === 429));

/** Every list of actions on screen shows the change now, before the server has it. */
function showStatus(taskId: string, status: 'open' | 'done'): void {
  const change = (tasks: TaskView[]) =>
    tasks.map((t) =>
      t.id === taskId
        ? { ...t, status, completedAt: status === 'done' ? new Date().toISOString() : null }
        : t,
    );
  queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (data) =>
    data?.tasks.some((t) => t.id === taskId) ? { ...data, tasks: change(data.tasks) } : data,
  );
  queryClient.setQueriesData<MemoryView>({ queryKey: ['memory'] }, (data) =>
    data?.openItems.some((t) => t.id === taskId)
      ? { ...data, openItems: change(data.openItems) }
      : data,
  );
}

async function refresh(conversationId?: string | null): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    conversationId ? queryClient.invalidateQueries({ queryKey: ['memory', conversationId] }) : null,
    queryClient.invalidateQueries({ queryKey: ['person'] }),
  ]);
}

async function sendOne(op: PendingTaskOp): Promise<'sent' | 'offline' | 'failed'> {
  const update = (patch: Partial<PendingTaskOp>) =>
    useTaskOutbox.setState((s) => ({
      ops: s.ops.map((o) => (o.id === op.id ? ({ ...o, ...patch } as PendingTaskOp) : o)),
    }));
  update({ state: 'sending', attempts: op.attempts + 1 });
  try {
    if (op.kind === 'create') {
      const { task } = await endpoints.createTask({ ...op.body, clientId: op.id });
      // Ticked while it waited: read again now, since it may have been ticked while sending.
      const done = (useTaskOutbox.getState().ops.find((o) => o.id === op.id) as PendingCreate)
        ?.done;
      if (done) await endpoints.updateTask(task.id, { status: 'done' });
      await refresh(op.body.conversationId);
    } else {
      const { task } = await endpoints.updateTask(op.taskId, { status: op.status });
      await refresh(task.conversationId);
    }
    useTaskOutbox.setState((s) => ({ ops: s.ops.filter((o) => o.id !== op.id) }));
    return 'sent';
  } catch (err) {
    if (waits(err)) {
      update({ state: 'queued' });
      return 'offline';
    }
    const message = err instanceof ApiError ? err.message : 'Couldn’t save it.';
    if (op.kind === 'create') {
      update({ state: 'failed', error: message });
    } else {
      // Nothing to keep: say so, and show the action as it really is.
      useTaskOutbox.setState((s) => ({ ops: s.ops.filter((o) => o.id !== op.id) }));
      toast(`Couldn’t update “${op.title}”: ${message}`, { tone: 'danger' });
      void refresh();
    }
    return 'failed';
  }
}

export const useTaskOutbox = create<TaskOutboxState>()(
  persist(
    (set, get) => ({
      ops: [],
      add: (body) => {
        const id = uuidv4();
        const op: PendingCreate = {
          kind: 'create',
          id,
          body,
          createdAt: new Date().toISOString(),
          state: 'queued',
          attempts: 0,
        };
        set((s) => ({ ops: [...s.ops, op] }));
        get().flush();
        return id;
      },
      setStatus: (task, status) => {
        const made = get().ops.find(
          (o): o is PendingCreate => o.kind === 'create' && o.id === task.id,
        );
        if (made) {
          set((s) => ({
            ops: s.ops.map((o) => (o.id === made.id ? { ...made, done: status === 'done' } : o)),
          }));
          return;
        }
        showStatus(task.id, status);
        // The last word wins: one that hasn't gone yet is changed rather than followed.
        const waiting = get().ops.find(
          (o): o is PendingStatus =>
            o.kind === 'status' && o.taskId === task.id && o.state === 'queued',
        );
        if (waiting)
          set((s) => ({
            ops: s.ops.map((o) => (o.id === waiting.id ? { ...waiting, status } : o)),
          }));
        else
          set((s) => ({
            ops: [
              ...s.ops,
              {
                kind: 'status',
                id: uuidv4(),
                taskId: task.id,
                title: task.title,
                status,
                createdAt: new Date().toISOString(),
                state: 'queued',
                attempts: 0,
              },
            ],
          }));
        get().flush();
      },
      retry: (id) => {
        set((s) => ({
          ops: s.ops.map((o) =>
            o.id === id && o.kind === 'create' ? { ...o, state: 'queued', error: undefined } : o,
          ),
        }));
        get().flush();
      },
      discard: (id) => set((s) => ({ ops: s.ops.filter((o) => o.id !== id) })),
      flush: () => {
        if (flushing) return;
        flushing = true;
        void (async () => {
          try {
            // In order, one at a time: an action is made before it's ticked.
            for (;;) {
              const next = get().ops.find((o) => o.state === 'queued');
              if (!next) break;
              const result = await sendOne(next);
              if (result === 'offline') {
                scheduleRetry(next.attempts + 1);
                break;
              }
            }
          } finally {
            flushing = false;
          }
        })();
      },
      clear: () => set({ ops: [] }),
    }),
    {
      name: 'caishy.task-outbox',
      storage: createJSONStorage(() => AsyncStorage),
      // Anything mid-send when the app closed goes back in the queue.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setTimeout(() => {
          useTaskOutbox.setState((s) => ({
            ops: s.ops.map((o) => (o.state === 'sending' ? { ...o, state: 'queued' } : o)),
          }));
        }, 0);
      },
    },
  ),
);

/** A new action not yet sent, drawn as one: it's on screen the moment it's made. */
export function pendingTaskView(
  op: PendingCreate,
  me: { id: string; displayName: string },
): TaskView {
  return {
    id: op.id,
    title: op.body.title,
    notes: op.body.notes ?? null,
    status: op.done ? 'done' : 'open',
    direction: 'mine',
    shared: false,
    owner: { id: me.id, displayName: me.displayName },
    assignee: { id: me.id, displayName: me.displayName },
    dueAt: op.body.dueAt ?? null,
    dueHasTime: op.body.dueHasTime ?? false,
    remindAt: null,
    conversationId: op.body.conversationId ?? null,
    messageId: op.body.messageId ?? null,
    source: null,
    contextId: null,
    relationship: null,
    origin: 'manual',
    createdAt: op.createdAt,
    completedAt: null,
  };
}

/** What a row says about an action still on this device: waiting to go, or refused. */
export function usePendingTasks(): {
  creates: PendingCreate[];
  /** By action id: "queued" while it waits, "failed" with why when the server refused it. */
  pending: Map<string, { state: SendState; error?: string }>;
} {
  const ops = useTaskOutbox((s) => s.ops);
  return useMemo(() => {
    const creates = ops.filter((o): o is PendingCreate => o.kind === 'create');
    const pending = new Map<string, { state: SendState; error?: string }>();
    for (const o of ops)
      pending.set(o.kind === 'create' ? o.id : o.taskId, {
        state: o.state,
        ...(o.kind === 'create' && o.error ? { error: o.error } : {}),
      });
    return { creates, pending };
  }, [ops]);
}
