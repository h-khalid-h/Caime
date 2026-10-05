import type { ReportView } from '@caime/core';
import { tr } from '@caime/core';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { emitWebhook } from './apps';
import { audit } from './audit';
import { dropSaved, tellSaved } from './automations';
import { recordEvent } from './events';
import { participantsOf } from './messages';
import { forgetNotificationsOf, notify, tellForgotten } from './notify';
import { revokeGrantsOf } from './oauth';
import { endSessions } from './sessions';
import { retellUpdate, tellUpdatesChanged } from './updates';

/**
 * Taking things down (R49): what a sender, a group's admin or the operator does to a message,
 * and what a poster or the operator does to an organization's update. One place, so the
 * operator's review does exactly what the person's own delete does.
 */

/**
 * A message gone for everyone: its words, files, pins, offers and notifications with it; that
 * there was one stays as a deleted line. `actorId` is null when the operator did it.
 */
export async function removeForEveryone(
  ctx: AppContext,
  m: Pick<Message, 'id' | 'conversation_id' | 'pinned_at'>,
  actorId: string | null,
): Promise<void> {
  const { savers, forgotten } = await ctx.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('messages')
      .set({
        deleted_at: ctx.now(),
        body: null,
        payload: '{}',
        entities: '{}',
        sealed: null,
        // Gone for everyone, it's pinned for nobody.
        pinned_at: null,
        pinned_by: null,
      })
      .where('id', '=', m.id)
      .execute();
    // Whoever saved it no longer has it (PRD §69).
    const savers = await dropSaved(trx, [m.id]);
    await trx.deleteFrom('assets').where('message_id', '=', m.id).execute();
    await trx.deleteFrom('message_files').where('message_id', '=', m.id).execute();
    await trx.deleteFrom('album_photos').where('message_id', '=', m.id).execute();
    // What Caime offered from it: an offer still open closes, and none keeps its words.
    await trx
      .updateTable('suggestions')
      .set({ status: 'expired', resolved_at: ctx.now() })
      .where('message_id', '=', m.id)
      .where('status', '=', 'pending')
      .execute();
    await trx
      .updateTable('suggestions')
      .set({ title: '', rationale: '', payload: '{}', due_text: null })
      .where('message_id', '=', m.id)
      .execute();
    await recordEvent(trx, 'message.deleted', actorId, { messageId: m.id });
    // Nobody keeps its words in a notification either.
    return { savers, forgotten: await forgetNotificationsOf(trx, [m.id]) };
  });
  // Nor does an organization's app, if the message was in one of its customer conversations.
  const business = await ctx.db
    .selectFrom('business_threads')
    .select('org_id')
    .where('conversation_id', '=', m.conversation_id)
    .executeTakeFirst();
  if (business)
    await emitWebhook(ctx, business.org_id, 'message.deleted', {
      conversationId: m.conversation_id,
      messageId: m.id,
    });
  const people = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
  await ctx.bus.publish(people, {
    type: 'message.deleted',
    data: { id: m.id, conversationId: m.conversation_id },
  });
  await tellForgotten(ctx, forgotten);
  await tellSaved(ctx, savers);
  if (m.pinned_at)
    await ctx.bus.publish(people, {
      type: 'pins.changed',
      data: { conversationId: m.conversation_id },
    });
}

/**
 * An organization's update taken back: its words go, from its page and from every follower's
 * notifications; that there was one stays, for the audit log. False when there's none to take.
 */
export async function takeBackUpdate(
  ctx: AppContext,
  orgId: string,
  updateId: string,
  actorId: string | null,
  operator?: string,
): Promise<boolean> {
  const row = await ctx.db
    .updateTable('org_updates')
    .set({ body: '', deleted_at: ctx.now() })
    .where('id', '=', updateId)
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();
  if (!row) return false;
  await audit(ctx.db, {
    actorId,
    action: actorId ? 'org.update_removed' : 'moderation.update_removed',
    target: orgId,
    metadata: operator ? { updateId, operator } : { updateId },
  });
  await retellUpdate(ctx, updateId, null);
  ctx.defer('updates', () => tellUpdatesChanged(ctx, orgId));
  return true;
}

/** Reports as the operator reads them: who, what, and what's left of it now. */
export async function reportViews(
  ctx: AppContext,
  where: { status: ReportView['status'] | 'all'; limit: number; id?: string },
): Promise<ReportView[]> {
  let q = ctx.db
    .selectFrom('reports as r')
    .leftJoin('users as reporter', 'reporter.id', 'r.reporter_id')
    .leftJoin('users as person', 'person.id', 'r.target_user_id')
    .leftJoin('organizations as o', 'o.id', 'r.org_id')
    .leftJoin('messages as m', 'm.id', 'r.message_id')
    .leftJoin('org_updates as u', 'u.id', 'r.update_id')
    .select([
      'r.id',
      'r.status',
      'r.reason',
      'r.details',
      'r.created_at',
      'reporter.id as reporter_id',
      'reporter.handle as reporter_handle',
      'reporter.display_name as reporter_name',
      'person.id as person_id',
      'person.handle as person_handle',
      'person.display_name as person_name',
      'person.suspended_at as person_suspended_at',
      'o.id as org_id',
      'o.handle as org_handle',
      'o.name as org_name',
      'm.id as message_id',
      'm.conversation_id as message_conversation_id',
      'm.kind as message_kind',
      'm.body as message_body',
      'm.sealed as message_sealed',
      'm.deleted_at as message_deleted_at',
      'm.sender_id as message_sender_id',
      'm.created_at as message_created_at',
      'm.payload as message_payload',
      'u.id as update_id',
      'u.body as update_body',
      'u.deleted_at as update_deleted_at',
    ])
    .orderBy('r.created_at', 'desc')
    .limit(where.limit);
  if (where.status !== 'all') q = q.where('r.status', '=', where.status);
  if (where.id) q = q.where('r.id', '=', where.id);
  const rows = await q.execute();
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at.toISOString(),
    reporter:
      r.reporter_id && r.reporter_handle && r.reporter_name
        ? { id: r.reporter_id, handle: r.reporter_handle, displayName: r.reporter_name }
        : null,
    person:
      r.person_id && r.person_handle && r.person_name
        ? {
            id: r.person_id,
            handle: r.person_handle,
            displayName: r.person_name,
            suspended: r.person_suspended_at !== null,
          }
        : null,
    org:
      r.org_id && r.org_handle && r.org_name
        ? { id: r.org_id, handle: r.org_handle, name: r.org_name }
        : null,
    message:
      r.message_id && r.message_conversation_id && r.message_kind && r.message_created_at
        ? {
            id: r.message_id,
            conversationId: r.message_conversation_id,
            kind: r.message_kind,
            body: r.message_sealed || r.message_deleted_at ? null : r.message_body,
            sealed: r.message_sealed !== null,
            removed: r.message_deleted_at !== null,
            senderId: r.message_sender_id,
            createdAt: r.message_created_at.toISOString(),
            imported: Boolean((r.message_payload as { imported?: unknown } | null)?.imported),
          }
        : null,
    update: r.update_id
      ? {
          id: r.update_id,
          body: r.update_deleted_at ? null : r.update_body,
          removed: r.update_deleted_at !== null,
        }
      : null,
  }));
}

/**
 * Every way into an account closed: sessions, personal tokens, app grants, a calendar's
 * address. What a recovery code or a reset link does before signing the person in afresh, and
 * what a suspension does for good (R49). `who` is the request behind it, or null for the operator.
 */
export async function endAllAccess(
  ctx: AppContext,
  userId: string,
  who: { ip: string | null; userAgent: string | null } | null,
): Promise<void> {
  await endSessions(ctx, { userId });
  await ctx.db
    .updateTable('personal_tokens')
    .set({ revoked_at: ctx.now() })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();
  await revokeGrantsOf(ctx, userId);
  const feed = await ctx.db
    .deleteFrom('calendar_feeds')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (Number(feed.numDeletedRows) > 0)
    await audit(ctx.db, {
      actorId: who ? userId : null,
      action: 'calendar.feed_stopped',
      target: userId,
      ...(who ?? {}),
    });
}

/** The operator suspends an account, or lifts it (R49). Nothing of theirs is removed. */
export async function setSuspended(
  ctx: AppContext,
  userId: string,
  suspended: boolean,
  reason: string | null,
  operator?: string,
): Promise<void> {
  await ctx.db
    .updateTable('users')
    .set(
      suspended
        ? { suspended_at: ctx.now(), suspended_reason: reason, updated_at: ctx.now() }
        : { suspended_at: null, suspended_reason: null, updated_at: ctx.now() },
    )
    .where('id', '=', userId)
    .execute();
  if (suspended) await endAllAccess(ctx, userId, null);
  await audit(ctx.db, {
    actorId: null,
    action: suspended ? 'moderation.suspended' : 'moderation.unsuspended',
    target: userId,
    metadata: { ...(reason ? { reason } : {}), ...(operator ? { operator } : {}) },
  });
}

/**
 * A report settled (R49): its reporter is told once that it was looked at, and whether Caime
 * acted, never what was done or to whom. Nothing is said while it's open or being reviewed,
 * and nothing twice.
 */
export async function settleReport(
  ctx: AppContext,
  reportId: string,
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed',
): Promise<void> {
  const before = await ctx.db
    .selectFrom('reports')
    .select(['status', 'reporter_id'])
    .where('id', '=', reportId)
    .executeTakeFirst();
  if (!before) return;
  await ctx.db.updateTable('reports').set({ status }).where('id', '=', reportId).execute();
  const settled = status === 'actioned' || status === 'dismissed';
  const wasSettled = before.status === 'actioned' || before.status === 'dismissed';
  if (!settled || wasSettled || !before.reporter_id) return;
  await notify(ctx, {
    userId: before.reporter_id,
    kind: 'report',
    level: 'activity',
    title: () => tr('Your report was reviewed'),
    body: () =>
      status === 'actioned'
        ? tr('Thanks for reporting it: Caime looked and acted.')
        : tr('Thanks for reporting it: Caime looked, and didn’t act on it this time.'),
    data: { reportId },
    delivery: 'silent',
  });
}
