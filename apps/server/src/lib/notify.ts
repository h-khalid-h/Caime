/**
 * In-app notifications plus realtime delivery. The full pipeline (relationship policy, burst
 * consolidation, push) lives in modules/notifications; this is the entry point every module uses.
 */
import { uuidv7 } from '@caishy/core';
import { type Kysely, sql } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { enqueue } from './jobs';

export interface NotifyInput {
  userId: string;
  kind: string;
  level: 'activity' | 'attention' | 'urgency';
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  /** The messages whose words it shows (a preview, a card's title): it goes when they do. */
  quotes?: string[];
  groupKey?: string | null;
  delivery?: 'push' | 'silent' | 'held';
  holdUntil?: Date | null;
  reason?: string | null;
  /** How long a push is worth delivering to a device that's offline (default a day). */
  ttlSeconds?: number;
  /** Which devices it goes to as a push: all of them, or browsers only. */
  pushTo?: 'all' | 'web';
  /**
   * Replaces what a device shows under the same group key without a sound (a ring that's over):
   * still something shown, since a browser takes pushes away from a site whose pushes show nothing.
   */
  quiet?: boolean;
}

export type NotifyHook = (ctx: AppContext, id: string, input: NotifyInput) => Promise<void>;
const hooks: NotifyHook[] = [];

/** Push delivery registers here so this module stays free of push dependencies. */
export function onNotification(hook: NotifyHook): void {
  hooks.push(hook);
}

export async function notify(ctx: AppContext, input: NotifyInput): Promise<string> {
  const id = uuidv7();
  await ctx.db
    .insertInto('notifications')
    .values({
      id,
      user_id: input.userId,
      kind: input.kind,
      level: input.level,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? {},
      quotes: input.quotes ?? [],
      group_key: input.groupKey ?? null,
      delivery: input.delivery ?? 'push',
      hold_until: input.holdUntil ?? null,
      reason: input.reason ?? null,
    })
    .execute();
  await ctx.bus.publish([input.userId], {
    type: 'notification.created',
    data: {
      id,
      kind: input.kind,
      level: input.level,
      title: input.title,
      body: input.body ?? null,
      data: input.data ?? {},
    },
  });
  if ((input.delivery ?? 'push') === 'push') await runNotificationHooks(ctx, id, input);
  return id;
}

/** Deliver a notification to devices (web push, mobile push) through the registered hooks. */
export async function runNotificationHooks(
  ctx: AppContext,
  id: string,
  input: NotifyInput,
): Promise<void> {
  for (const hook of hooks) {
    await hook(ctx, id, input).catch((err) => ctx.log.warn({ err }, 'notification hook failed'));
  }
}

/**
 * A notification that's over (a ring answered, turned down or ended), replaced in browsers that
 * show it by a line saying so, quietly. Only browsers: the phone apps' own notifications go when
 * it's read.
 */
export async function replaceShown(
  ctx: AppContext,
  id: string,
  input: Omit<NotifyInput, 'quiet' | 'pushTo'>,
): Promise<void> {
  await runNotificationHooks(ctx, id, { ...input, quiet: true, pushTo: 'web' });
}

/** A notification a message took with it when it went, as its devices are told. */
export interface ForgottenNotification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  group_key: string | null;
  data: Record<string, unknown>;
  /** It told of other messages too, so it stays, without the words. */
  kept: boolean;
  /** Pushed, and neither read nor dismissed since: a lock screen may still show it. */
  shown: boolean;
}

const NOTE_FIELDS = [
  'id',
  'user_id',
  'kind',
  'title',
  'group_key',
  'data',
  sql<boolean>`(delivery = 'push' or pushed_at is not null) and read_at is null and dismissed_at is null`.as(
    'shown',
  ),
] as const;

/**
 * Messages gone for everyone (deleted, or disappeared) take with them what notifications kept of
 * their words: a notification about one of them alone goes, and one that also told of others (a
 * burst: "Noor sent 3 messages") stays, without its preview. It's about a message when it shows
 * that message's words, or, showing none, when it points at it. Run in the transaction that
 * empties the messages, so the words never outlast them; tellForgotten says so after.
 */
export async function forgetNotificationsOf(
  db: Kysely<Database>,
  messageIds: string[],
): Promise<ForgottenNotification[]> {
  const forgotten: ForgottenNotification[] = [];
  for (let i = 0; i < messageIds.length; i += 1000) {
    const ids = messageIds.slice(i, i + 1000);
    const about = sql<boolean>`(quotes && ${ids}::uuid[]
      or (quotes = '{}' and data->>'messageId' = any(${ids}::text[])))`;
    const gone = await db
      .deleteFrom('notifications')
      .where(about)
      .where('count', '<=', 1)
      .returning(NOTE_FIELDS)
      .execute();
    const kept = await db
      .updateTable('notifications')
      .set({ body: null, quotes: [], data: sql`data || '{"salient": false}'` })
      .where(about)
      .where('count', '>', 1)
      .returning(NOTE_FIELDS)
      .execute();
    for (const n of gone) forgotten.push({ ...n, kept: false });
    for (const n of kept) forgotten.push({ ...n, kept: true });
  }
  return forgotten;
}

/**
 * Every open app drops them from its list and its browser's lock screen; a browser that isn't
 * open is sent the same line in their place, quietly, without the words (modules/workers.ts).
 */
export async function tellForgotten(
  ctx: AppContext,
  forgotten: ForgottenNotification[],
): Promise<void> {
  const byUser = new Map<string, ForgottenNotification[]>();
  for (const n of forgotten) {
    const theirs = byUser.get(n.user_id);
    if (theirs) theirs.push(n);
    else byUser.set(n.user_id, [n]);
  }
  for (const [userId, notes] of byUser) {
    await ctx.bus.publish([userId], {
      type: 'notifications.read',
      data: { ids: notes.map((n) => n.id), all: false },
    });
    const shown = notes.filter((n) => n.shown);
    if (shown.length)
      await enqueue(ctx, 'notifications.replace', {
        userId,
        notes: shown.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          groupKey: n.group_key,
          data: n.data,
          kept: n.kept,
        })),
      });
  }
}
