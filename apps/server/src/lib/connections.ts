import { type RelationshipInputT, tr, uuidv7 } from '@caime/core';
import type { Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { ensureDirectConversation } from './conversations';
import { suggestDuplicatesOf } from './duplicates';
import { notFound } from './errors';
import { recordEvent } from './events';
import { notify } from './notify';
import { personViewsFor } from './people-batch';
import { pairKey, relationshipView } from './relations';
import { createRelationship } from './relationships';
import { suggestRelationships } from './suggest';

export async function formConnection(
  trx: Transaction<Database>,
  a: string,
  b: string,
): Promise<{ connectionId: string; conversationId: string }> {
  const { low, high } = pairKey(a, b);
  const existing = await trx
    .selectFrom('connections')
    .selectAll()
    .where('user_a', '=', low)
    .where('user_b', '=', high)
    .executeTakeFirst();
  let connectionId: string;
  if (existing) {
    connectionId = existing.id;
    await trx
      .updateTable('connections')
      .set({ status: 'active', removed_at: null })
      .where('id', '=', existing.id)
      .execute();
  } else {
    connectionId = uuidv7();
    await trx
      .insertInto('connections')
      .values({ id: connectionId, user_a: low, user_b: high })
      .execute();
  }
  for (const [owner, other] of [
    [a, b],
    [b, a],
  ]) {
    await trx
      .insertInto('connection_sides')
      .values({
        connection_id: connectionId,
        owner_id: owner!,
        other_id: other!,
      })
      .onConflict((oc) => oc.columns(['connection_id', 'owner_id']).doNothing())
      .execute();
  }
  // Relationships created before the connection existed now point at it.
  await trx
    .updateTable('relationships')
    .set({ connection_id: connectionId })
    .where((eb) =>
      eb.or([
        eb.and([eb('owner_id', '=', a), eb('subject_id', '=', b)]),
        eb.and([eb('owner_id', '=', b), eb('subject_id', '=', a)]),
      ]),
    )
    .where('connection_id', 'is', null)
    .execute();
  const conversation = await ensureDirectConversation(trx, a, b, { connectionId, createdBy: a });
  await recordEvent(trx, 'connection.created', a, { connectionId, users: [a, b] });
  return { connectionId, conversationId: conversation.id };
}

export async function afterConnected(
  ctx: AppContext,
  requesterId: string,
  accepterId: string,
  connectionId: string,
  conversationId: string,
  context: { sphere: string | null; orgName: string | null },
  /** The request was an invite link (R1): whoever opened it is the accepter, landing in the conversation. */
  viaInvite = false,
) {
  const users = await ctx.db
    .selectFrom('users')
    .select(['id', 'email', 'display_name'])
    .where('id', 'in', [requesterId, accepterId])
    .execute();
  const requester = users.find((u) => u.id === requesterId)!;
  const accepter = users.find((u) => u.id === accepterId)!;
  await suggestRelationships(
    ctx,
    { id: requester.id, email: requester.email, displayName: requester.display_name },
    { id: accepter.id, email: accepter.email, displayName: accepter.display_name },
    { fromUserId: requesterId, sphere: context.sphere, orgName: context.orgName },
  );
  // Perhaps someone either of them knows already (PRD §51): offered, never merged for them.
  await suggestDuplicatesOf(ctx, requesterId, accepterId);
  await suggestDuplicatesOf(ctx, accepterId, requesterId);
  await ctx.bus.publish([requesterId, accepterId], {
    type: 'connection.created',
    data: { connectionId, conversationId, users: [requesterId, accepterId] },
  });
  await notify(ctx, {
    userId: requesterId,
    kind: 'connection_accepted',
    level: 'activity',
    title: () =>
      viaInvite
        ? tr('{name} joined through your invite', { name: accepter.display_name })
        : tr('{name} accepted your request', { name: accepter.display_name }),
    body: () => (viaInvite ? tr('You’re connected. Say hi.') : tr('Say hi when you’re ready.')),
    data: { userId: accepterId, conversationId },
  });
}

export async function acceptRequest(
  ctx: AppContext,
  userId: string,
  requestId: string,
  myRelationship?: RelationshipInputT,
  opts: { viaInvite?: boolean } = {},
): Promise<{
  connectionId: string;
  conversationId: string;
  relationship: ReturnType<typeof relationshipView> | null;
}> {
  const request = await ctx.db
    .selectFrom('connection_requests')
    .selectAll()
    .where('id', '=', requestId)
    .where('to_user', '=', userId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  if (!request) throw notFound(tr('That request'));
  let result!: { connectionId: string; conversationId: string };
  let mine: Awaited<ReturnType<typeof createRelationship>> | null = null;
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('connection_requests')
      .set({ status: 'accepted', responded_at: ctx.now() })
      .where('id', '=', requestId)
      .execute();
    result = await formConnection(trx, request.from_user, userId);
    const theirs = request.pending_relationship as RelationshipInputT | null;
    if (theirs) {
      await createRelationship(trx, ctx, request.from_user, userId, theirs, {
        source: opts.viaInvite ? 'invite' : 'user',
        connectionId: result.connectionId,
      });
    }
    if (myRelationship) {
      mine = await createRelationship(trx, ctx, userId, request.from_user, myRelationship, {
        source: 'user',
        connectionId: result.connectionId,
      });
    }
  });
  await afterConnected(
    ctx,
    request.from_user,
    userId,
    result.connectionId,
    result.conversationId,
    { sphere: request.context_sphere, orgName: request.context_org_name },
    opts.viaInvite,
  );
  // The label's form is theirs as shown to the accepter (R81).
  const them = mine
    ? (await personViewsFor(ctx, userId, [request.from_user])).get(request.from_user)
    : undefined;
  return { ...result, relationship: mine ? relationshipView(mine, them?.gender ?? null) : null };
}
