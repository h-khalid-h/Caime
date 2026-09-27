/**
 * In-app notifications plus realtime delivery. The full pipeline (relationship policy, burst
 * consolidation, push) lives in modules/notifications; this is the entry point every module uses.
 */
import { uuidv7 } from '@caishy/core';
import type { AppContext } from '../context';

export interface NotifyInput {
  userId: string;
  kind: string;
  level: 'activity' | 'attention' | 'urgency';
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
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
