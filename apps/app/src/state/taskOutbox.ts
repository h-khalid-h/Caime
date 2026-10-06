/**
 * Actions made or ticked while offline (PRD §49, ADR-8): on screen at once and marked Pending,
 * kept when the app closes, and sent in order when the network allows. A new one carries this
 * device's id for it, so sending it again after a lost answer is the same action on the server.
 */
import type { MemoryView, TasksResponse, TaskView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ApiError, NetworkError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
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
  /** Whose it is: only ever sent, or shown, while they're the one signed in. */
  userId?: string;
  /** When it was last changed where it waits (ticked again): of two tabs' copies, the later. */
  changedAt?: string;
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
  userId?: string;
  changedAt?: string;
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
/**
 * An action made here, by this device's id for it, once the server has it: a tick or an Undo
 * on its row a moment later goes to the server's.
 */
const landed = new Map<string, string>();

const KEY = 'caime.task-outbox';

/** Of two copies of one op (two tabs'), whether `a` was changed after `b`. */
const later = (a: PendingTaskOp, b: PendingTaskOp) =>
  (a.changedAt ?? a.createdAt) > (b.changedAt ?? b.createdAt);

/** Who's signed in (session.ts says): the queue is only ever theirs. */
let owner: string | null = null;
const mine = (o: PendingTaskOp) => !o.userId || o.userId === owner;

/**
 * Ops this device finished with (sent, discarded, or someone else's), and when the queue was
 * last cleared: never brought back from what another tab wrote.
 */
const finished = new Set<string>();
let clearedAt = 0;

export function setTaskOutboxUser(id: string | null): void {
  if (id === owner) return;
  owner = id;
  if (!id) return;
  // Someone else's, left by another tab or before a sign-out: never sent as this person's.
  const theirs = useTaskOutbox.getState().ops.filter((o) => !mine(o));
  for (const o of theirs) finished.add(o.id);
  if (theirs.length) useTaskOutbox.setState((s) => ({ ops: s.ops.filter((o) => mine(o)) }));
  useTaskOutbox.getState().flush();
}

/**
 * On the web, a browser's tabs share one queue in one place: each write keeps what another tab
 * added meanwhile, so an action added offline in one isn't lost to a tick in another.
 */
const shared = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
  setItem: async (key: string, value: string) => {
    // (Only a browser has other tabs: there's a document there, and never in the phone apps.)
    if (typeof document === 'undefined') return AsyncStorage.setItem(key, value);
    try {
      const next = JSON.parse(value) as { state: { ops: PendingTaskOp[] } };
      const stored = JSON.parse((await AsyncStorage.getItem(key)) ?? 'null') as {
        state?: { ops?: PendingTaskOp[] };
      } | null;
      const theirs = new Map(
        (stored?.state?.ops ?? [])
          .filter((o) => !finished.has(o.id) && Date.parse(o.createdAt) > clearedAt)
          .map((o) => [o.id, o]),
      );
      // One both have, still waiting: whichever tab changed it last.
      next.state.ops = next.state.ops.map((o) => {
        const t = theirs.get(o.id);
        return t && o.state === 'queued' && later(t, o)
          ? ({ ...t, state: 'queued' } as PendingTaskOp)
          : o;
      });
      const here = new Set(next.state.ops.map((o) => o.id));
      const others = [...theirs.values()].filter((o) => !here.has(o.id));
      if (others.length) next.state.ops = [...next.state.ops, ...others];
      return AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {
      return AsyncStorage.setItem(key, value);
    }
  },
};

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
  queryClient.setQueriesData<TasksResponse>({ queryKey: qk.allTasks }, (data) =>
    data?.tasks.some((t) => t.id === taskId) ? { ...data, tasks: change(data.tasks) } : data,
  );
  queryClient.setQueriesData<MemoryView>({ queryKey: qk.allMemory }, (data) =>
    data?.openItems.some((t) => t.id === taskId)
      ? { ...data, openItems: change(data.openItems) }
      : data,
  );
}

async function refresh(conversationId?: string | null): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.allTasks }),
    queryClient.invalidateQueries({ queryKey: qk.attentionHome }),
    conversationId ? queryClient.invalidateQueries({ queryKey: qk.memory(conversationId) }) : null,
    queryClient.invalidateQueries({ queryKey: qk.allPeople }),
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
      landed.set(op.id, task.id);
      // Ticked while it waited, or while it was being sent (or unticked again): what the server
      // has is made to match the row, read again after every answer until nothing changed.
      const doneNow = () =>
        Boolean(
          (useTaskOutbox.getState().ops.find((o) => o.id === op.id) as PendingCreate | undefined)
            ?.done,
        );
      // Sent before (its answer lost), the server may have it done already.
      let sent = task.status === 'done';
      const match = async () => {
        while (doneNow() !== sent) {
          sent = doneNow();
          await endpoints.updateTask(task.id, { status: sent ? 'done' : 'open' });
        }
      };
      await match();
      const read = sent;
      await refresh(op.body.conversationId);
      await match();
      // Ticked or unticked while the lists were read again: the rows say so, and every list is
      // left due to be read again as refresh() left it (a write to the cache calls it fresh).
      if (sent !== read) {
        showStatus(task.id, sent ? 'done' : 'open');
        void queryClient.invalidateQueries({ queryKey: qk.allTasks, refetchType: 'none' });
        void queryClient.invalidateQueries({ queryKey: qk.allMemory, refetchType: 'none' });
      }
    } else {
      const { task } = await endpoints.updateTask(op.taskId, { status: op.status });
      await refresh(task.conversationId);
    }
    finished.add(op.id);
    useTaskOutbox.setState((s) => ({ ops: s.ops.filter((o) => o.id !== op.id) }));
    return 'sent';
  } catch (err) {
    if (waits(err)) {
      update({ state: 'queued' });
      return 'offline';
    }
    const message = err instanceof ApiError ? err.message : tr('Couldn’t save it.');
    if (op.kind === 'create') {
      update({ state: 'failed', error: message });
    } else {
      // Nothing to keep: say so, and show the action as it really is.
      finished.add(op.id);
      useTaskOutbox.setState((s) => ({ ops: s.ops.filter((o) => o.id !== op.id) }));
      toast(tr('Couldn’t update “{title}”: {message}', { title: op.title, message }), {
        tone: 'danger',
      });
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
          ...(owner ? { userId: owner } : {}),
        };
        set((s) => ({ ops: [...s.ops, op] }));
        get().flush();
        return id;
      },
      setStatus: (row, status) => {
        const made = get().ops.find(
          (o): o is PendingCreate => o.kind === 'create' && o.id === row.id,
        );
        if (made) {
          const changedAt = new Date().toISOString();
          set((s) => ({
            ops: s.ops.map((o) =>
              o.id === made.id ? { ...made, done: status === 'done', changedAt } : o,
            ),
          }));
          return;
        }
        // A row still showing this device's id for an action the server has now: the server's.
        const task = { ...row, id: landed.get(row.id) ?? row.id };
        showStatus(task.id, status);
        // The last word wins: the last one that hasn't gone yet is changed rather than followed
        // (an earlier one sends first, and this one after it).
        let waiting: PendingStatus | undefined;
        for (const o of get().ops)
          if (o.kind === 'status' && o.taskId === task.id && o.state === 'queued') waiting = o;
        if (waiting) {
          const changedAt = new Date().toISOString();
          set((s) => ({
            ops: s.ops.map((o) => (o.id === waiting.id ? { ...waiting, status, changedAt } : o)),
          }));
        } else
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
                ...(owner ? { userId: owner } : {}),
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
      discard: (id) => {
        finished.add(id);
        set((s) => ({ ops: s.ops.filter((o) => o.id !== id) }));
      },
      flush: () => {
        // Nobody signed in: nothing is anybody's to send.
        if (flushing || !owner) return;
        flushing = true;
        void (async () => {
          try {
            // In a browser, what another tab queued is this one's to send too.
            if (typeof document !== 'undefined')
              adopt(await AsyncStorage.getItem(KEY).catch(() => null));
            // In order, one at a time: an action is made before it's ticked.
            for (;;) {
              const next = get().ops.find((o) => o.state === 'queued' && mine(o));
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
      clear: () => {
        for (const o of get().ops) finished.add(o.id);
        clearedAt = Date.now();
        set({ ops: [] });
      },
    }),
    {
      name: KEY,
      storage: createJSONStorage(() => shared),
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
    caiFollowUp: false,
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
/**
 * What another tab of this browser queued, or changed since: shown and sent here too, never
 * someone else's, one this device finished with, or one from before the queue was last cleared.
 * One being sent here is left alone.
 */
function adopt(raw: string | null): void {
  let stored: PendingTaskOp[];
  try {
    stored =
      (JSON.parse(raw ?? 'null') as { state?: { ops?: PendingTaskOp[] } } | null)?.state?.ops ?? [];
  } catch {
    return;
  }
  const take = stored.filter(
    (o) => mine(o) && !finished.has(o.id) && Date.parse(o.createdAt) > clearedAt,
  );
  if (!take.length) return;
  useTaskOutbox.setState((s) => {
    const byId = new Map(s.ops.map((o) => [o.id, o]));
    let changed = false;
    for (const t of take) {
      const here = byId.get(t.id);
      if (!here) byId.set(t.id, { ...t, state: t.state === 'sending' ? 'queued' : t.state });
      else if (here.state === 'queued' && later(t, here))
        byId.set(t.id, { ...t, state: 'queued', attempts: here.attempts } as PendingTaskOp);
      else continue;
      changed = true;
    }
    if (!changed) return s;
    // In the order they were made: an action is made before it's ticked.
    return {
      ops: [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    };
  });
}

// Another tab wrote the queue down: it's this one's to show and send too.
if (typeof window !== 'undefined' && typeof document !== 'undefined')
  window.addEventListener?.('storage', (e: StorageEvent) => {
    if (e.key !== KEY) return;
    adopt(e.newValue);
    useTaskOutbox.getState().flush();
  });

export function usePendingTasks(): {
  creates: PendingCreate[];
  /** By action id: "queued" while it waits, "failed" with why when the server refused it. */
  pending: Map<string, { state: SendState; error?: string }>;
} {
  const all = useTaskOutbox((s) => s.ops);
  return useMemo(() => {
    const ops = all.filter(mine);
    const creates = ops.filter((o): o is PendingCreate => o.kind === 'create');
    const pending = new Map<string, { state: SendState; error?: string }>();
    for (const o of ops)
      pending.set(o.kind === 'create' ? o.id : o.taskId, {
        state: o.state,
        ...(o.kind === 'create' && o.error ? { error: o.error } : {}),
      });
    return { creates, pending };
  }, [all]);
}
