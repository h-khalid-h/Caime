/**
 * The slipping tell (M17 I15a2, R115): a customer in "Needs a reply" (core `customerWaiting`) past
 * core `REPLY_TARGET_MINUTES` while the organization is open, with nobody on it (nobody assigned,
 * its AI agent not having answered their latest), is told once to whoever runs it (its
 * `MANAGING_ROLES`) in their Cai chat, unless they asked Cai for less (core `tellsSlipping`). One
 * job a wait, queued as it starts (keyed by the team's last place in the thread and its last
 * reopening, so the customer's next words in the same wait queue nothing), read again when it
 * runs and moved to the next opening while the organization is closed. No model, no poll: the
 * team's own inbox is what it reads.
 */
import {
  type BookingHours,
  CAI_ID,
  MANAGING_ROLES,
  REPLY_TARGET_MINUTES,
  replyTimeText,
  systemAccountOf,
  tr,
} from '@caime/core';
import { initiativeOf, tellsSlipping } from '@caime/core/initiative';
import { nextOpening, openAt } from '@caime/core/opening';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { STANDING_DRAFT } from './agent-drafts';
import { onCustomerMessage } from './business';
import { asReader } from './i18n';
import { enqueue, registerJob } from './jobs';
import { notify } from './notify';
import { postAs } from './post-as';
import { openSystemConversation } from './system-accounts';

const SLIP_JOB = 'org.slipping';
const TARGET_MS = REPLY_TARGET_MINUTES * 60_000;

/** A customer wrote: the wait their words start is looked at once its target has passed. */
async function queueSlipCheck(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
): Promise<void> {
  const t = await ctx.db
    .selectFrom('business_threads')
    .select(['last_team_seq', 'reopened_at'])
    .where('conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (!t) return;
  const teamSeq = Number(t.last_team_seq);
  const wait = `${conversationId}:${teamSeq}:${t.reopened_at?.getTime() ?? 0}`;
  await enqueue(
    ctx,
    SLIP_JOB,
    { orgId, conversationId, teamSeq },
    {
      runAt: new Date(ctx.now().getTime() + TARGET_MS),
      dedupeKey: `org-slip:${wait}`,
      maxAttempts: 3,
    },
  );
}

async function slipJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const orgId = String(payload.orgId);
  const conversationId = String(payload.conversationId);
  const teamSeq = Number(payload.teamSeq);
  const now = ctx.now();
  const row = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .leftJoin('users as c', 'c.id', 't.customer_id')
    .select((eb) => [
      't.assignee_id',
      't.resolved_at',
      't.customer_id',
      't.last_customer_seq',
      't.last_team_seq',
      't.agent_seq',
      't.agent_handed_over_at',
      'o.name as org_name',
      'o.handle',
      'o.booking',
      'o.archived_at',
      'o.suspended_at',
      'c.display_name as customer',
      eb
        .exists(
          eb
            .selectFrom('agent_drafts as d')
            .select('d.conversation_id')
            .whereRef('d.conversation_id', '=', 't.conversation_id')
            .where(STANDING_DRAFT),
        )
        .as('draft_waiting'),
    ])
    .where('t.conversation_id', '=', conversationId)
    .where('t.org_id', '=', orgId)
    .executeTakeFirst();
  if (!row || row.archived_at || row.suspended_at || row.resolved_at) return;
  // Answered since, or someone has it: not slipping.
  if (Number(row.last_team_seq) !== teamSeq || Number(row.last_customer_seq) <= teamSeq) return;
  if (row.assignee_id) return;
  // Its AI agent answered their latest and stayed with it: they have an answer.
  if (
    Number(row.agent_seq) >= Number(row.last_customer_seq) &&
    !row.agent_handed_over_at &&
    !row.draft_waiting
  )
    return;
  const hours = row.booking as BookingHours | null;
  if (hours && !openAt(hours, now)) {
    // Closed: looked at again as it opens, when the wait is past its target already.
    const next = nextOpening(hours, now);
    if (next)
      await enqueue(ctx, SLIP_JOB, payload, {
        runAt: next,
        dedupeKey: `org-slip:${conversationId}:${teamSeq}:at:${next.getTime()}`,
        maxAttempts: 3,
      });
    return;
  }
  const first = await ctx.db
    .selectFrom('messages')
    .select(sql<Date | null>`min(created_at)`.as('at'))
    .where('conversation_id', '=', conversationId)
    .where('seq', '>', String(teamSeq))
    .where('sender_id', '=', row.customer_id ?? '')
    .executeTakeFirst();
  const since = first?.at ? new Date(first.at) : null;
  if (!since || now.getTime() - since.getTime() < TARGET_MS) return;
  const managers = await ctx.db
    .selectFrom('org_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['u.id', 'u.preferences'])
    .where('m.org_id', '=', orgId)
    .where('m.left_at', 'is', null)
    .where('m.role', 'in', [...MANAGING_ROLES])
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where('u.suspended_at', 'is', null)
    .execute();
  const told = managers.filter((m) => tellsSlipping(initiativeOf(m.preferences)));
  const minutes = (now.getTime() - since.getTime()) / 60_000;
  const link = `${ctx.config.PUBLIC_URL}/c/${conversationId}`;
  for (const { id: userId } of told) {
    const { id: chat } = await openSystemConversation(ctx, userId, systemAccountOf(CAI_ID)!);
    const line = await asReader(ctx, userId, async () =>
      tr('{name} has waited {time} for a reply from {org}, and nobody has taken it yet.', {
        name: row.customer ?? tr('A customer'),
        time: replyTimeText(minutes),
        org: row.org_name,
      }),
    );
    const open = await asReader(ctx, userId, async () =>
      tr('Their conversation: {link}', { link }),
    );
    await postAs(ctx, CAI_ID, chat, `${line}\n${open}`);
    await notify(ctx, {
      userId,
      kind: 'reminder',
      level: 'attention',
      title: () => tr('Cai'),
      body: line,
      data: { conversationId: chat },
    });
  }
  ctx.metrics.caiTells.inc({
    scope: 'org',
    kind: 'slipping',
    outcome: told.length ? 'crossed' : 'quiet',
  });
}

export function registerOrgSlipping(): void {
  onCustomerMessage((ctx, orgId, conversationId) => queueSlipCheck(ctx, orgId, conversationId));
  registerJob(SLIP_JOB, slipJob);
}
