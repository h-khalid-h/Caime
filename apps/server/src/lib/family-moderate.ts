/**
 * A parent's answer to what Moderate put before them (R122 (2), M16 B8d; who it holds for and the
 * asking are lib/family-moderation.ts): done as the child would have done it, through each
 * thing's own way in, or let go; and what waits on a parent who no longer moderates goes on.
 */
import { tr } from '@caime/core';
import type { AppContext } from '../context';
import { audit } from './audit';
import { startCustomerConversation } from './business-threads';
import { AppError, notFound } from './errors';
import { describe, type GuardianAskWhat, moderatorOf } from './family-moderation';
import { liveJoinLinkById, nameOf } from './join-links';
import { askToJoin } from './join-requests';
import { participantsOf } from './messages';
import { notify } from './notify';
import { orgById } from './orgs';
import { answerPlaceInvite } from './place-invites';

type AskRow = {
  id: string;
  guardian_id: string;
  child_id: string;
  kind: GuardianAskWhat['kind'];
  place_invite_id: string | null;
  join_link_id: string | null;
  conversation_id: string | null;
  org_id: string | null;
};

const whatOf = (a: AskRow): GuardianAskWhat =>
  a.kind === 'invite'
    ? { kind: 'invite', inviteId: a.place_invite_id ?? '' }
    : a.kind === 'join'
      ? { kind: 'join', linkId: a.join_link_id ?? '' }
      : a.kind === 'request'
        ? { kind: 'request', conversationId: a.conversation_id ?? '' }
        : { kind: 'organization', orgId: a.org_id ?? '' };

/**
 * What the child would have done, done as them now that it's agreed (or let go, declined):
 * through each thing's own way in, so its own rules hold now too. False when it's no longer open.
 */
async function carryOut(ctx: AppContext, a: AskRow, yes: boolean): Promise<boolean> {
  const what = whatOf(a);
  try {
    if (what.kind === 'invite') {
      await answerPlaceInvite(ctx, a.child_id, what.inviteId, yes, { parentAgreed: true });
      return true;
    }
    if (what.kind === 'request') {
      const moved = await ctx.db
        .updateTable('participants')
        .set(
          yes
            ? { request_state: 'accepted', archived_at: null }
            : { request_state: 'declined', archived_at: ctx.now() },
        )
        .where('conversation_id', '=', what.conversationId)
        .where('user_id', '=', a.child_id)
        .where('request_state', '=', 'pending')
        .executeTakeFirst();
      if (Number(moved.numUpdatedRows) !== 1) return false;
      // Accepted, everyone in it hears; declined, only the child's own devices (R14).
      await ctx.bus.publish(
        yes
          ? (await participantsOf(ctx.db, what.conversationId)).map((p) => p.user_id)
          : [a.child_id],
        { type: 'conversation.updated', data: { conversationId: what.conversationId } },
      );
      return true;
    }
    if (!yes) return true;
    const child = await ctx.db
      .selectFrom('users')
      .select(['id', 'display_name', 'birth_date', 'time_zone', 'age_minor_until'])
      .where('id', '=', a.child_id)
      .executeTakeFirstOrThrow();
    if (what.kind === 'join') {
      const live = await liveJoinLinkById(ctx.db, what.linkId, ctx.now());
      if (!live) return false;
      await askToJoin(
        ctx,
        what.linkId,
        live.target,
        { id: child.id, displayName: child.display_name },
        await nameOf(ctx.db, live.target),
      );
      return true;
    }
    const org = await orgById(ctx.db, what.orgId);
    await startCustomerConversation(ctx, child, org, null);
    return true;
  } catch (err) {
    if (err instanceof AppError && (err.status === 404 || err.status === 403)) return false;
    throw err;
  }
}

/** The child told of their parent's answer, in their own words for each kind. */
async function tellChild(ctx: AppContext, a: AskRow, yes: boolean): Promise<void> {
  const d = await describe(ctx.db, a.child_id, whatOf(a), ctx.now());
  await notify(ctx, {
    userId: a.child_id,
    kind: 'family',
    level: 'activity',
    title: () =>
      a.kind === 'invite'
        ? yes
          ? tr('Your parent said yes: you’re in “{place}”', { place: d.place ?? '' })
          : tr('Your parent said no to “{place}”', { place: d.place ?? '' })
        : a.kind === 'join'
          ? yes
            ? tr('Your parent said yes: your ask to join “{place}” went to whoever runs it', {
                place: d.place ?? '',
              })
            : tr('Your parent said no to joining “{place}”', { place: d.place ?? '' })
          : a.kind === 'request'
            ? yes
              ? tr('Your parent said yes to {name}’s message', { name: d.who ?? '' })
              : tr('Your parent said no to {name}’s message', { name: d.who ?? '' })
            : yes
              ? tr('Your parent said yes: you can write to {org}', { org: d.org ?? '' })
              : tr('Your parent said no to writing to {org}', { org: d.org ?? '' }),
    body: null,
    data:
      a.kind === 'request' && yes
        ? { conversationId: a.conversation_id }
        : { family: a.guardian_id },
  });
  await ctx.bus.publish([a.child_id], { type: 'family.changed', data: {} });
}

/** The parent's answer: claimed once, done (or let go) as the child would have, the child told. */
export async function answerGuardianAsk(
  ctx: AppContext,
  guardianId: string,
  askId: string,
  yes: boolean,
): Promise<{ done: boolean }> {
  const a = await ctx.db
    .updateTable('guardian_asks')
    .set({ answered_at: ctx.now(), answer: yes ? 'yes' : 'no' })
    .where('id', '=', askId)
    .where('guardian_id', '=', guardianId)
    .where('answered_at', 'is', null)
    .returning([
      'id',
      'guardian_id',
      'child_id',
      'kind',
      'place_invite_id',
      'join_link_id',
      'conversation_id',
      'org_id',
    ])
    .executeTakeFirst();
  if (!a) throw notFound(tr('That request'));
  const done = await carryOut(ctx, a, yes);
  await audit(ctx.db, {
    actorId: guardianId,
    action: yes ? 'family.moderate_allowed' : 'family.moderate_declined',
    target: a.child_id,
  });
  ctx.metrics.family.inc({ step: yes ? 'moderate_allowed' : 'moderate_declined' });
  if (done) await tellChild(ctx, a, yes);
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
  return { done };
}

/**
 * What waits on a parent who no longer moderates (the child of age, the parent gone, Moderate
 * turned off) goes on as if agreed: the daily sweep, and at once when Moderate is turned off.
 */
export async function releaseModerated(ctx: AppContext, childId?: string): Promise<number> {
  const open = await ctx.db
    .selectFrom('guardian_asks')
    .select([
      'id',
      'guardian_id',
      'child_id',
      'kind',
      'place_invite_id',
      'join_link_id',
      'conversation_id',
      'org_id',
    ])
    .where('answered_at', 'is', null)
    .$if(Boolean(childId), (q) => q.where('child_id', '=', childId ?? ''))
    .orderBy('created_at')
    .limit(500)
    .execute();
  let released = 0;
  for (const a of open) {
    if ((await moderatorOf(ctx.db, a.child_id, ctx.now())) === a.guardian_id) continue;
    const claimed = await ctx.db
      .updateTable('guardian_asks')
      .set({ answered_at: ctx.now(), answer: 'yes' })
      .where('id', '=', a.id)
      .where('answered_at', 'is', null)
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) !== 1) continue;
    released++;
    if (await carryOut(ctx, a, true)) await tellChild(ctx, a, true);
  }
  return released;
}
