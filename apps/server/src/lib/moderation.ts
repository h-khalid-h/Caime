import type { AppealView, ReportEvidenceView, ReportView } from '@caime/core';
import { tr } from '@caime/core';
import { type Insertable, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, Message, ReportEvidenceTable } from '../db/schema';
import { builtinCountsChanged } from './app-directory';
import { emitWebhook, forgetDeliveries } from './apps';
import { audit } from './audit';
import { tellSaved } from './automations';
import { queueCalendarPush } from './calendar-push';
import { disconnectAllAccounts } from './connected-accounts';
import { appealDecisionMail, visitorReportDecisionMail } from './email';
import { recordEvent } from './events';
import { removeStored } from './files';
import { notHiddenFor, participantsOf } from './messages';
import { forgetNotificationsOf, notify, tellForgotten } from './notify';
import { revokeGrantsOf } from './oauth';
import { dropErasedFiles, eraseMessagesWhere } from './org-data';
import { endSessions } from './sessions';
import { forgetSitemaps } from './sitemap-cache';
import { tellStockChanged } from './stock';
import { storageFor } from './storage';
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
  const { rows, forgotten, dated, stored } = await ctx.db.transaction().execute(async (trx) => {
    // An open order taken down gives back what it took (R60): the card's lock first, as its
    // cancel takes them, so the two wait on each other in one order and only one gives it back.
    const [locked] = await trx
      .selectFrom('messages')
      .select(['id', 'card_start_at'])
      .where('id', '=', m.id)
      .forUpdate()
      .execute();
    // What goes with a message is decided once, the statement a disappearance and an erasure
    // run (lib/org-data.ts): its words and pin, its files, what anyone saved of it (PRD §69),
    // the words of what Caime offered from it, its mail copy, and an open order's stock.
    const rows = await eraseMessagesWhere(trx, sql`select ${m.id}::uuid as id`, ctx.now());
    // What an organization's apps were sent of it leaves their delivery log too (M16 B2).
    await forgetDeliveries(trx, m.conversation_id, [m.id]);
    await recordEvent(trx, 'message.deleted', actorId, { messageId: m.id });
    // Nobody keeps its words in a notification either.
    return {
      rows,
      forgotten: await forgetNotificationsOf(trx, [m.id]),
      dated: Boolean(locked?.card_start_at),
      stored: await dropErasedFiles(trx, rows),
    };
  });
  await removeStored(ctx, storageFor(ctx.config), stored, 'removed for everyone');
  const savers = rows.filter((r) => r.what === 'saved').map((r) => r.id);
  await tellStockChanged(
    ctx,
    rows.filter((r) => r.what === 'stock').map((r) => r.id),
  );
  // A dated card gone leaves its people's own calendars too (R96).
  if (dated)
    await queueCalendarPush(
      ctx,
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
    );
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
      'r.closed_at',
      'r.visitor_name',
      'r.visitor_email',
      'r.page',
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
      'o.suspended_at as org_suspended_at',
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
    // A child's safety first while it's open (M16 B3), then the newest.
    .orderBy(
      sql`case when r.reason = 'child_safety' and r.status in ('open', 'reviewing') then 0 else 1 end`,
    )
    .orderBy('r.created_at', 'desc')
    .limit(where.limit);
  if (where.status !== 'all') q = q.where('r.status', '=', where.status);
  if (where.id) q = q.where('r.id', '=', where.id);
  const rows = await q.execute();
  // What each held as its reporter saw it, in one query for the page.
  const kept = rows.length
    ? await ctx.db
        .selectFrom('report_evidence')
        .selectAll()
        .where(
          'report_id',
          'in',
          rows.map((r) => r.id),
        )
        .orderBy('report_id')
        .orderBy('position')
        .execute()
    : [];
  const evidence = new Map<string, ReportEvidenceView[]>();
  for (const e of kept)
    evidence.set(e.report_id, [
      ...(evidence.get(e.report_id) ?? []),
      {
        messageId: e.message_id,
        senderId: e.sender_id,
        senderName: e.sender_name,
        kind: e.kind,
        body: e.body,
        sentAt: e.sent_at.toISOString(),
        reported: e.reported,
        imported: e.imported,
      },
    ]);
  const evidenceOf = (reportId: string): ReportEvidenceView[] => evidence.get(reportId) ?? [];
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at.toISOString(),
    closedAt: r.closed_at?.toISOString() ?? null,
    evidence: evidenceOf(r.id),
    reporter:
      r.reporter_id && r.reporter_handle && r.reporter_name
        ? { id: r.reporter_id, handle: r.reporter_handle, displayName: r.reporter_name }
        : null,
    visitor: r.page ? { name: r.visitor_name, email: r.visitor_email, page: r.page } : null,
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
        ? {
            id: r.org_id,
            handle: r.org_handle,
            name: r.org_name,
            suspended: r.org_suspended_at !== null,
          }
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

/** How many messages before the reported one go with a report, as its reporter saw them. */
export const EVIDENCE_BEFORE = 4;

/**
 * What the reporter saw when they reported it (M16 B3), kept with the report whatever is deleted
 * since: the reported message and up to `EVIDENCE_BEFORE` before it in its conversation, those
 * the reporter could see (never one deleted, hidden for them or sealed: a private message's
 * words are nobody's to keep), each with its sender's name then; or the reported update's words.
 */
export async function keepEvidence(
  trx: Transaction<Database>,
  reportId: string,
  reporterId: string,
  target: { messageId?: string; updateId?: string },
): Promise<void> {
  const rows: Insertable<ReportEvidenceTable>[] = [];
  if (target.messageId) {
    const reported = await trx
      .selectFrom('messages')
      .select(['id', 'conversation_id', 'seq'])
      .where('id', '=', target.messageId)
      .executeTakeFirst();
    if (reported) {
      const around = await trx
        .selectFrom('messages as m')
        .leftJoin('users as u', 'u.id', 'm.sender_id')
        .select(['m.id', 'm.sender_id', 'u.display_name', 'm.kind', 'm.body', 'm.created_at'])
        .select(sql<boolean>`(m.payload -> 'imported') is not null`.as('imported'))
        .where('m.conversation_id', '=', reported.conversation_id)
        .where('m.seq', '<=', reported.seq)
        .where('m.deleted_at', 'is', null)
        .where('m.sealed', 'is', null)
        .where(notHiddenFor(reporterId, 'm.id'))
        .orderBy('m.seq', 'desc')
        .limit(EVIDENCE_BEFORE + 1)
        .execute();
      for (const [position, m] of around.reverse().entries())
        rows.push({
          report_id: reportId,
          position,
          message_id: m.id,
          sender_id: m.sender_id,
          sender_name: m.display_name,
          kind: m.kind,
          body: m.body,
          sent_at: m.created_at,
          reported: m.id === reported.id,
          imported: m.imported,
        });
    }
  } else if (target.updateId) {
    const update = await trx
      .selectFrom('org_updates')
      .select(['id', 'body', 'created_at'])
      .where('id', '=', target.updateId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (update)
      rows.push({
        report_id: reportId,
        position: 0,
        message_id: null,
        sender_id: null,
        sender_name: null,
        kind: 'update',
        body: update.body,
        sent_at: update.created_at,
        reported: true,
      });
  }
  if (rows.length) await trx.insertInto('report_evidence').values(rows).execute();
}

/**
 * An organization suspended by the operator, or lifted (M16 B3): nothing written as it or to it
 * (`sendMessage`, a new customer conversation, its updates), its page and handle answer as
 * nobody's, its apps' tokens are refused and its agent says nothing; nothing of it is removed,
 * and lifting it brings all of it back. Its team is told the organization changed.
 */
export async function setOrgSuspended(
  ctx: AppContext,
  orgId: string,
  suspended: boolean,
  reason: string | null,
  operator: string,
): Promise<void> {
  await ctx.db
    .updateTable('organizations')
    .set(
      suspended
        ? { suspended_at: ctx.now(), suspended_reason: reason }
        : { suspended_at: null, suspended_reason: null },
    )
    .where('id', '=', orgId)
    .execute();
  await audit(ctx.db, {
    actorId: null,
    action: suspended ? 'moderation.org_suspended' : 'moderation.org_unsuspended',
    target: orgId,
    metadata: { ...(reason ? { reason } : {}), operator },
  });
  forgetSitemaps();
  const team = await ctx.db
    .selectFrom('org_members')
    .select('user_id')
    .where('org_id', '=', orgId)
    .where('left_at', 'is', null)
    .execute();
  await ctx.bus.publish(
    team.map((m) => m.user_id),
    { type: 'business.updated', data: { orgId } },
  );
}

/**
 * Every way into an account closed: sessions, passkeys (R36: one someone else added would open it
 * again), personal tokens, app grants, a calendar's address. What a recovery code or a reset
 * link does before signing the person in afresh, and what a suspension does for good (R49).
 * `who` is the request behind it, or null for the operator.
 */
export async function endAllAccess(
  ctx: AppContext,
  userId: string,
  who: { ip: string | null; userAgent: string | null } | null,
): Promise<void> {
  await endSessions(ctx, { userId });
  const passkeys = await ctx.db
    .deleteFrom('passkeys')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (Number(passkeys.numDeletedRows) > 0)
    await audit(ctx.db, {
      actorId: who ? userId : null,
      action: 'auth.passkey_removed',
      target: userId,
      ...(who ?? {}),
      metadata: { all: Number(passkeys.numDeletedRows) },
    });
  await ctx.db
    .updateTable('personal_tokens')
    .set({ revoked_at: ctx.now() })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();
  await revokeGrantsOf(ctx, userId);
  // Their Google and Microsoft accounts are let go of too (R90), revoked where the provider can.
  await disconnectAllAccounts(ctx, userId);
  const feed = await ctx.db
    .deleteFrom('calendar_feeds')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  // Their bridges and calendar address went with their tokens: Discover's counts changed.
  builtinCountsChanged(ctx);
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
    .select(['status', 'reporter_id', 'visitor_name', 'visitor_email', 'page'])
    .where('id', '=', reportId)
    .executeTakeFirst();
  if (!before) return;
  const settled = status === 'actioned' || status === 'dismissed';
  const wasSettled = before.status === 'actioned' || before.status === 'dismissed';
  // Closed, its time to be kept starts (M16 B3); opened again, it stops.
  await ctx.db
    .updateTable('reports')
    .set({
      status,
      closed_at: settled ? (wasSettled ? sql`coalesce(closed_at, ${ctx.now()})` : ctx.now()) : null,
    })
    .where('id', '=', reportId)
    .execute();
  if (!settled || wasSettled) return;
  // A visitor who left an address hears what became of it, once (M16 B6, the DSA's Art. 16(5)).
  const mail = ctx.mail;
  if (!before.reporter_id && before.visitor_email && before.page && mail) {
    const to = before.visitor_email;
    const page = `${ctx.config.PUBLIC_URL}${before.page}`;
    ctx.defer('email.report', () =>
      mail.send(visitorReportDecisionMail(to, before.visitor_name, page, status === 'actioned')),
    );
  }
  if (!before.reporter_id) return;
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

/** Appeals as the operator reads them (M16 B6): the waiting ones first, oldest first. */
export async function appealViews(
  ctx: AppContext,
  where: { waiting: boolean; limit: number; id?: string },
): Promise<AppealView[]> {
  let q = ctx.db
    .selectFrom('appeals as a')
    .innerJoin('users as u', 'u.id', 'a.user_id')
    .select([
      'a.id',
      'a.body',
      'a.created_at',
      'a.decided_at',
      'a.outcome',
      'a.note',
      'u.id as user_id',
      'u.handle',
      'u.display_name',
      'u.suspended_at',
      'u.suspended_reason',
    ])
    .orderBy(sql`a.decided_at is null`, 'desc')
    .orderBy('a.created_at', 'asc')
    .limit(where.limit);
  if (where.waiting) q = q.where('a.decided_at', 'is', null);
  if (where.id) q = q.where('a.id', '=', where.id);
  const rows = await q.execute();
  return rows.map((r) => ({
    id: r.id,
    person: {
      id: r.user_id,
      handle: r.handle,
      displayName: r.display_name,
      suspended: r.suspended_at !== null,
    },
    reason: r.suspended_reason,
    body: r.body,
    createdAt: r.created_at.toISOString(),
    decidedAt: r.decided_at?.toISOString() ?? null,
    outcome: r.outcome,
    note: r.note,
  }));
}

/**
 * An appeal decided (M16 B6): lifting ends the suspension as the operator's lift does; upholding
 * keeps it. Either way the person is mailed, once, and the decision is in the audit log with the
 * operator's name. False when it was decided already.
 */
export async function decideAppeal(
  ctx: AppContext,
  id: string,
  decision: 'lift' | 'uphold',
  note: string | null,
  operator: string,
): Promise<boolean> {
  // The decision and what it lifts land together: never an appeal that says lifted beside an
  // account still suspended.
  const decided = await ctx.db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('appeals')
      .set({
        decided_at: ctx.now(),
        outcome: decision === 'lift' ? 'lifted' : 'upheld',
        note,
      })
      .where('id', '=', id)
      .where('decided_at', 'is', null)
      .returning('user_id')
      .executeTakeFirst();
    if (!row) return null;
    if (decision === 'lift') {
      await trx
        .updateTable('users')
        .set({ suspended_at: null, suspended_reason: null, updated_at: ctx.now() })
        .where('id', '=', row.user_id)
        .execute();
      await audit(trx, {
        actorId: null,
        action: 'moderation.unsuspended',
        target: row.user_id,
        metadata: { operator },
      });
    }
    await audit(trx, {
      actorId: null,
      action: decision === 'lift' ? 'moderation.appeal_lifted' : 'moderation.appeal_upheld',
      target: row.user_id,
      metadata: { appealId: id, operator },
    });
    return row;
  });
  if (!decided) return false;
  ctx.metrics.appeals.inc({ outcome: decision === 'lift' ? 'lifted' : 'upheld' });
  const person = await ctx.db
    .selectFrom('users')
    .select(['email', 'display_name'])
    .where('id', '=', decided.user_id)
    .executeTakeFirst();
  const mail = ctx.mail;
  if (person?.email && mail) {
    const to = person.email;
    ctx.defer('email.appeal', () =>
      mail.send(appealDecisionMail(to, person.display_name, decision === 'lift', note)),
    );
  }
  return true;
}
