/**
 * Background handlers: follow-up checks (PRD §69), reminders (PRD §28), held notifications
 * released when their window opens (PRD §32), retention (PRD §60) and temporary conversations.
 */
import { previewText, resolvePolicy } from '@caishy/core';
import { sql } from 'kysely';
import { tellSaved } from '../lib/automations';
import { enqueue, registerJob, registerPeriodic } from '../lib/jobs';
import { notify, runNotificationHooks } from '../lib/notify';
import {
  activeRelationships,
  isBlockedEitherWay,
  loadPolicies,
  policyTargetFor,
} from '../lib/relations';

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
      title: `No reply from ${other.display_name} yet`,
      body: original.body ? `Follow up on “${previewText(original.body, 70)}”?` : 'Follow up?',
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
          body: 'Reminder',
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

  registerPeriodic({
    name: 'retention',
    everyMs: 3_600_000,
    run: async (ctx) => {
      // Disappeared (PRD §60): its words and envelope go, and so does everything kept of it
      // elsewhere, as when it's deleted for everyone: the files and links in the conversation's
      // index and memory, a pin, what anyone saved of it, and what Caishy was about to offer.
      const savers = await sql<{ user_id: string }>`
        with gone as (
          update messages m set deleted_at = ${ctx.now()}, body = null, payload = '{}',
            entities = '{}', sealed = null, pinned_at = null, pinned_by = null
          from conversations c
          where m.conversation_id = c.id and c.retention_days is not null and m.deleted_at is null
            and m.created_at < ${ctx.now()}::timestamptz - make_interval(days => c.retention_days)
          returning m.id
        ),
        assets_gone as (delete from assets where message_id in (select id from gone)),
        files_gone as (delete from message_files where message_id in (select id from gone)),
        saved_gone as (
          delete from saved_items where message_id in (select id from gone) returning user_id
        ),
        offers_gone as (
          update suggestions set status = 'expired', resolved_at = ${ctx.now()}
          where status = 'pending' and message_id in (select id from gone)
        )
        select distinct user_id from saved_gone`.execute(ctx.db);
      // Whoever had saved something of it sees their lists without it, on every device.
      await tellSaved(
        ctx,
        savers.rows.map((r) => r.user_id),
      );
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
