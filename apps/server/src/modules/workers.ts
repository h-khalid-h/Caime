/**
 * Background handlers: follow-up checks (PRD §69), reminders (PRD §28), held notifications
 * released when their window opens (PRD §32), retention (PRD §60) and temporary conversations.
 */
import { previewText, resolvePolicy, tr } from '@caime/core';
import { sql } from 'kysely';
import { tellSaved } from '../lib/automations';
import { enqueue, registerJob, registerPeriodic } from '../lib/jobs';
import { participantsOf } from '../lib/messages';
import {
  forgetNotificationsOf,
  notify,
  replaceShown,
  runNotificationHooks,
  tellForgotten,
} from '../lib/notify';
import { eraseMessagesWhere } from '../lib/org-data';
import {
  activeRelationships,
  isBlockedEitherWay,
  loadPolicies,
  policyTargetFor,
} from '../lib/relations';
import { sweepRecords } from '../lib/retention';

export function registerWorkers(): void {
  registerJob('follow_up_check', async (ctx, p) => {
    const reply = await ctx.db
      .selectFrom('messages')
      .select('id')
      .where('conversation_id', '=', String(p.conversationId))
      .where('sender_id', '=', String(p.otherId))
      .where('seq', '>', String(p.seq))
      .executeTakeFirst();
    if (reply) return;
    const senderId = String(p.senderId);
    const otherId = String(p.otherId);
    const [original, other, conversation, seat, hidden, blocked] = await Promise.all([
      ctx.db
        .selectFrom('messages')
        .select(['body', 'deleted_at', 'created_at'])
        .where('id', '=', String(p.messageId))
        .executeTakeFirst(),
      ctx.db
        .selectFrom('users')
        .select(['display_name'])
        .where('id', '=', otherId)
        .executeTakeFirst(),
      ctx.db
        .selectFrom('conversations')
        .select('connection_id')
        .where('id', '=', String(p.conversationId))
        .executeTakeFirst(),
      ctx.db
        .selectFrom('participants')
        .select('user_id')
        .where('conversation_id', '=', String(p.conversationId))
        .where('user_id', '=', senderId)
        .where('left_at', 'is', null)
        .executeTakeFirst(),
      ctx.db
        .selectFrom('hidden_messages')
        .select('message_id')
        .where('message_id', '=', String(p.messageId))
        .where('user_id', '=', senderId)
        .executeTakeFirst(),
      isBlockedEitherWay(ctx.db, senderId, otherId),
    ]);
    // Only what they'd still want: a message they can still see, from someone they can still
    // hear from, and a rule that still says to remind them (it may have changed since).
    if (!original || original.deleted_at || !other || !conversation || !seat || hidden || blocked)
      return;
    const [policies, rels] = await Promise.all([
      loadPolicies(ctx.db, senderId),
      activeRelationships(ctx.db, senderId, [otherId]),
    ]);
    const hours = resolvePolicy(
      policies,
      policyTargetFor(rels[0], conversation.connection_id),
    ).followUpHours;
    if (!hours) return;
    const due = new Date(original.created_at.getTime() + hours * 3_600_000);
    if (due > ctx.now()) {
      // Made longer since it was asked: then.
      await enqueue(ctx, 'follow_up_check', p, {
        runAt: due,
        dedupeKey: `follow_up:${String(p.messageId)}:${hours}`,
      });
      return;
    }
    await notify(ctx, {
      userId: String(p.senderId),
      kind: 'follow_up',
      level: 'attention',
      title: () => tr('No reply from {name} yet', { name: other.display_name }),
      body: () =>
        original.body
          ? tr('Follow up on “{text}”?', { text: previewText(original.body, 70) })
          : tr('Follow up?'),
      data: { conversationId: p.conversationId, messageId: p.messageId },
    });
  });

  registerPeriodic({
    name: 'realtime-large',
    everyMs: 60_000,
    run: (ctx) => ctx.bus.sweep(),
  });

  registerPeriodic({
    name: 'reminders',
    everyMs: 30_000,
    run: async (ctx) => {
      const due = await ctx.db
        .updateTable('tasks')
        .set({ reminded_at: ctx.now() })
        .where('remind_at', '<=', ctx.now())
        .where('reminded_at', 'is', null)
        .where('status', 'in', ['open', 'accepted'])
        .returning(['id', 'owner_id', 'title', 'conversation_id', 'due_at'])
        .execute();
      for (const t of due) {
        await notify(ctx, {
          userId: t.owner_id,
          kind: 'reminder',
          level: 'attention',
          title: t.title,
          body: () => tr('Reminder'),
          data: { taskId: t.id, conversationId: t.conversation_id },
        });
      }
    },
  });

  registerPeriodic({
    name: 'held-notifications',
    everyMs: 30_000,
    run: async (ctx) => {
      const ready = await ctx.db
        .updateTable('notifications')
        .set({ delivery: 'push', updated_at: ctx.now() })
        .where('delivery', '=', 'held')
        .where('hold_until', '<=', ctx.now())
        .where('pushed_at', 'is', null)
        .where('read_at', 'is', null)
        .returningAll()
        .execute();
      for (const n of ready) {
        await runNotificationHooks(ctx, n.id, {
          userId: n.user_id,
          kind: n.kind,
          level: n.level,
          title: n.title,
          body: n.body,
          data: (n.data ?? {}) as Record<string, unknown>,
          groupKey: n.group_key,
          delivery: 'push',
        });
      }
    },
  });

  // What Caime records of how it's used goes when its time is up (lib/retention.ts).
  registerPeriodic({ name: 'records', everyMs: 86_400_000, background: true, run: sweepRecords });

  // A browser that isn't open still shows what it was pushed of a message that's gone: the same
  // line, quietly, without the words (lib/notify.ts tellForgotten).
  registerJob('notifications.replace', async (ctx, p) => {
    const notes = p.notes as Array<{
      id: string;
      kind: string;
      title: string;
      groupKey: string | null;
      data: Record<string, unknown>;
      kept: boolean;
    }>;
    for (const n of notes)
      await replaceShown(ctx, n.id, {
        userId: String(p.userId),
        kind: n.kind,
        level: 'activity',
        title: n.title,
        body: () => (n.kept ? null : tr('Message deleted')),
        data: n.data,
        groupKey: n.groupKey,
      });
  });

  registerPeriodic({
    name: 'retention',
    everyMs: 3_600_000,
    background: true,
    run: async (ctx) => {
      // Disappeared (PRD §60), its own time up: its words and envelope go, and so does everything
      // kept of it elsewhere, as when it's deleted for everyone: the files and links in the
      // conversation's index and memory, an album's photos, a pin, what anyone saved of it, the
      // words of what Caime offered from it, and the notifications showing its words. A lot at a
      // time, each lot with all that's kept of it.
      const LOT = 500;
      const told = new Map<string, number>();
      const members = new Map<string, string[]>();
      for (;;) {
        const { done, forgotten } = await ctx.db.transaction().execute(async (trx) => {
          // The same statement an erasure runs (lib/org-data.ts): what goes with a message is
          // decided once.
          const done = await eraseMessagesWhere(
            trx,
            sql`select id from messages
              where expires_at < ${ctx.now()} and deleted_at is null
              order by expires_at
              limit ${LOT} for update skip locked`,
            ctx.now(),
          );
          const gone = done.filter((r) => r.what === 'gone').map((r) => r.id);
          return { done, forgotten: await forgetNotificationsOf(trx, gone) };
        });
        // Whoever had saved something of it sees their lists without it, on every device.
        await tellSaved(
          ctx,
          done.filter((r) => r.what === 'saved').map((r) => r.id),
        );
        await tellForgotten(ctx, forgotten);
        // The open apps in its conversation show it gone (a few hundred at most; more, as they
        // reload).
        const gone = done.filter((r) => r.what === 'gone');
        for (const r of gone) {
          if (!r.conversation_id || (told.get(r.conversation_id) ?? 0) >= 200) continue;
          told.set(r.conversation_id, (told.get(r.conversation_id) ?? 0) + 1);
          let who = members.get(r.conversation_id);
          if (!who) {
            who = (await participantsOf(ctx.db, r.conversation_id)).map((p) => p.user_id);
            members.set(r.conversation_id, who);
          }
          await ctx.bus.publish(who, {
            type: 'message.deleted',
            data: { id: r.id, conversationId: r.conversation_id },
          });
        }
        if (gone.length < LOT) break;
      }
      await ctx.db
        .updateTable('participants')
        .set({ archived_at: ctx.now() })
        .where('archived_at', 'is', null)
        .where(
          'conversation_id',
          'in',
          ctx.db.selectFrom('conversations').select('id').where('temporary_until', '<', ctx.now()),
        )
        .execute();
    },
  });
}
