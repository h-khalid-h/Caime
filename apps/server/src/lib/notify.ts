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
  for (const hook of hooks)
    await hook(ctx, id, input).catch((err) => ctx.log.warn({ err }, 'notification hook failed'));
  return id;
}
