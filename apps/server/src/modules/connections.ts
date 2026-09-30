/**
 * Connections and connection requests (PRD §5.2, §11, §52; PRODUCT-REVIEW R4, R14, R29).
 */

import type { ConnectionRequestView, ConnectionView } from '@caime/core';
import {
  AcceptRequestBody,
  ConnectionRequestBody,
  type RelationshipInputT,
  SPHERE_DEFS,
  type Sphere,
  UpdateConnectionBody,
  uuidv7,
} from '@caime/core';
import type { FastifyInstance } from 'fastify';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { ensureDirectConversation } from '../lib/conversations';
import { rerootMerged, suggestDuplicatesOf } from '../lib/duplicates';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { leaveGroupCallsAfterDisconnect } from '../lib/group-calls';
import { notify } from '../lib/notify';
import {
  activeRelationships,
  between,
  pairKey,
  relationshipView,
  shareAConnection,
  viewerRelation,
} from '../lib/relations';
import { suggestRelationships } from '../lib/suggest';
import { minorOf, personView, privacyOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { identityShownTo } from './people';
import { createRelationship } from './relationships';

const DECLINE_COOLDOWN_DAYS = 30;

async function formConnection(
  trx: Transaction<Database>,
  a: string,
  b: string,
  opts: { requesterIdentityId?: string | null },
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
        identity_id: owner === a ? (opts.requesterIdentityId ?? null) : null,
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

async function afterConnected(
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
    title: viaInvite
      ? `${accepter.display_name} joined through your invite`
      : `${accepter.display_name} accepted your request`,
    body: viaInvite ? 'You’re connected. Say hi.' : 'Say hi when you’re ready.',
    data: { userId: accepterId, conversationId },
  });
}

export async function connectionRoutes(app: FastifyInstance, ctx: AppContext) {
  // --- Requests ------------------------------------------------------------------------------

  app.post('/connections/requests', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(ConnectionRequestBody, req.body);
    if (body.toUserId === auth.userId) throw badRequest('That’s you.');
    ctx.limiter.hit(`conn-request:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 86_400_000);
    const target = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', body.toUserId)
      .where('deleted_at', 'is', null)
      .where('kind', '=', 'human') // An app's bot is nobody to connect with.
      .executeTakeFirst();
    if (!target) throw notFound('That person');
    const b = await between(ctx.db, auth.userId, target.id);
    if (b.blockedMe || b.blockedByMe) throw forbidden('You can’t connect with this person.');
    if (b.connected) throw conflict('already_connected', 'You’re already connected.');
    const me = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    const now = ctx.now();

    // They already asked me: connecting is mutual, so accept theirs instead.
    if (b.incomingRequestId) {
      const result = await acceptRequest(ctx, auth.userId, b.incomingRequestId, body.relationship);
      return { status: 'connected', ...result };
    }
    if (b.outgoingRequestId)
      throw conflict('already_requested', 'Your request is waiting for them.');

    const privacy = privacyOf(target, now);
    const targetMinor = minorOf(target, now);
    const allowed =
      privacy.messageRequests === 'everyone' ||
      (privacy.messageRequests === 'shared_connections' &&
        (await shareAConnection(ctx.db, auth.userId, target.id)));
    if (
      !allowed ||
      (targetMinor &&
        !minorOf(me, now) &&
        !(await shareAConnection(ctx.db, auth.userId, target.id)))
    ) {
      throw new AppError(
        403,
        'not_accepting_requests',
        `${target.display_name} isn’t accepting requests from people they don’t know yet.`,
      );
    }
    const recentDecline = await ctx.db
      .selectFrom('connection_requests')
      .select('responded_at')
      .where('from_user', '=', auth.userId)
      .where('to_user', '=', target.id)
      .where('status', '=', 'declined')
      .where('responded_at', '>', new Date(now.getTime() - DECLINE_COOLDOWN_DAYS * 86_400_000))
      .executeTakeFirst();
    if (recentDecline)
      throw new AppError(429, 'recently_declined', 'You can send another request later.');

    if (body.identityId) {
      const owned = await ctx.db
        .selectFrom('identities')
        .select('id')
        .where('id', '=', body.identityId)
        .where('user_id', '=', auth.userId)
        .executeTakeFirst();
      if (!owned) throw badRequest('Choose one of your identities.');
    }
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('connection_requests')
        .values({
          id,
          from_user: auth.userId,
          to_user: target.id,
          note: body.note ?? null,
          context_sphere: body.context?.sphere ?? null,
          context_org_name: body.context?.orgName ?? null,
          from_identity_id: body.identityId ?? null,
          pending_relationship: body.relationship ? JSON.stringify(body.relationship) : null,
        })
        .execute();
      await recordEvent(trx, 'connection.requested', auth.userId, { requestId: id, to: target.id });
    });
    const contextLine = body.context?.sphere
      ? [SPHERE_DEFS[body.context.sphere as Sphere]?.label, body.context.orgName]
          .filter(Boolean)
          .join(' · ')
      : null;
    await notify(ctx, {
      userId: target.id,
      kind: 'connection_request',
      level: 'attention',
      title: `${me.display_name} wants to connect with you`,
      body: contextLine ?? body.note ?? null,
      data: { requestId: id, userId: auth.userId },
    });
    await ctx.bus.publish([target.id, auth.userId], {
      type: 'connection.request',
      data: { requestId: id, from: auth.userId, to: target.id },
    });
    reply.status(201);
    return { status: 'requested', requestId: id };
  });

  app.get('/connections/requests', async (req): Promise<{ requests: ConnectionRequestView[] }> => {
    const auth = requireAuth(req);
    const { direction } = parse(
      z.object({ direction: z.enum(['incoming', 'outgoing']).default('incoming') }),
      req.query,
    );
    const rows = await ctx.db
      .selectFrom('connection_requests as r')
      .innerJoin('users as u', 'u.id', direction === 'incoming' ? 'r.from_user' : 'r.to_user')
      .selectAll('u')
      .select([
        'r.id as request_id',
        'r.note',
        'r.context_sphere',
        'r.context_org_name',
        'r.created_at as requested_at',
      ])
      .where(direction === 'incoming' ? 'r.to_user' : 'r.from_user', '=', auth.userId)
      .where('r.status', '=', 'pending')
      .where('u.deleted_at', 'is', null)
      .orderBy('r.created_at', 'desc')
      .execute();
    const now = ctx.now();
    const requests = await Promise.all(
      rows.map(async (row) => {
        const relation = await viewerRelation(ctx.db, row.id, auth.userId);
        const identity = await identityShownTo(ctx, row.id, auth.userId);
        return {
          id: row.request_id,
          direction,
          person: personView(row, relation, now, identity),
          note: row.note,
          // Context the requester chose to share (PRD §52). Their private classification never is.
          context: row.context_sphere
            ? {
                sphere: row.context_sphere as Sphere,
                label: SPHERE_DEFS[row.context_sphere as Sphere]?.label ?? row.context_sphere,
                orgName: row.context_org_name,
              }
            : null,
          createdAt: row.requested_at.toISOString(),
        };
      }),
    );
    return { requests };
  });

  app.post('/connections/requests/:id/accept', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(AcceptRequestBody, req.body ?? {});
    return {
      status: 'connected',
      ...(await acceptRequest(ctx, auth.userId, id, body.relationship)),
    };
  });

  app.post('/connections/requests/:id/decline', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const res = await ctx.db
      .updateTable('connection_requests')
      .set({ status: 'declined', responded_at: ctx.now() })
      .where('id', '=', id)
      .where('to_user', '=', auth.userId)
      .where('status', '=', 'pending')
      .returning(['from_user'])
      .executeTakeFirst();
    if (!res) throw notFound('That request');
    // The requester is not told it was declined; it simply stays unanswered on their side.
    await ctx.bus.publish([auth.userId], {
      type: 'connection.request.resolved',
      data: { requestId: id },
    });
    return { ok: true };
  });

  app.delete('/connections/requests/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const res = await ctx.db
      .updateTable('connection_requests')
      .set({ status: 'cancelled', responded_at: ctx.now() })
      .where('id', '=', id)
      .where('from_user', '=', auth.userId)
      .where('status', '=', 'pending')
      .returning(['to_user'])
      .executeTakeFirst();
    if (!res) throw notFound('That request');
    await ctx.bus.publish([auth.userId, res.to_user], {
      type: 'connection.request.resolved',
      data: { requestId: id },
    });
    return { ok: true };
  });

  // --- Connections ---------------------------------------------------------------------------

  app.get('/connections', async (req): Promise<{ connections: ConnectionView[] }> => {
    const auth = requireAuth(req);
    const { sphere, q } = parse(
      z.object({ sphere: z.string().optional(), q: z.string().trim().max(100).optional() }),
      req.query,
    );
    const rows = await ctx.db
      .selectFrom('connection_sides as s')
      .innerJoin('connections as c', 'c.id', 's.connection_id')
      .innerJoin('users as u', 'u.id', 's.other_id')
      .selectAll('u')
      .select([
        's.connection_id',
        's.nickname',
        's.attention',
        's.muted_until',
        's.archived_at',
        's.last_interaction_at',
        's.merged_into',
        'c.created_at as connected_at',
      ])
      .where('s.owner_id', '=', auth.userId)
      .where('c.status', '=', 'active')
      .where('u.deleted_at', 'is', null)
      .$if(Boolean(q), (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('u.display_name', 'ilike', `%${q}%`),
            eb('s.nickname', 'ilike', `%${q}%`),
            eb('u.handle', 'ilike', `${q}%`),
          ]),
        ),
      )
      .orderBy('u.display_name')
      .execute();
    const rels = await activeRelationships(
      ctx.db,
      auth.userId,
      rows.map((r) => r.id),
    );
    const now = ctx.now();
    const conversations = rows.length
      ? await ctx.db
          .selectFrom('conversations')
          .select(['id', 'direct_key'])
          .where('is_general', '=', true)
          .where(
            'direct_key',
            'in',
            rows.map((r) => pairKey(auth.userId, r.id).key),
          )
          .execute()
      : [];
    const out = await Promise.all(
      rows.map(async (u) => {
        const relation = await viewerRelation(ctx.db, u.id, auth.userId);
        const identity = await identityShownTo(ctx, u.id, auth.userId);
        const mine = rels.filter((r) => r.subject_id === u.id).map(relationshipView);
        return {
          connectionId: u.connection_id,
          person: personView(u, relation, now, identity),
          nickname: u.nickname,
          attention: u.attention,
          mutedUntil: u.muted_until?.toISOString() ?? null,
          archived: u.archived_at !== null,
          connectedAt: u.connected_at.toISOString(),
          lastInteractionAt: u.last_interaction_at?.toISOString() ?? null,
          relationships: mine,
          conversationId:
            conversations.find((c) => c.direct_key === pairKey(auth.userId, u.id).key)?.id ?? null,
          also: [] as ConnectionView['also'],
          mergedInto: u.merged_into,
        };
      }),
    );
    // Accounts said to be the same person (PRD §51) show under the one they're merged into. What
    // it was merged into may be gone (no longer connected, or not in this search): it stands on
    // its own again. Found before anything changes, and never round in a circle.
    const byId = new Map(out.map((c) => [c.person.id, c]));
    const shownUnder = out.map((c) => {
      const seen = new Set<string>();
      let at = c;
      while (at.mergedInto && !seen.has(at.person.id)) {
        seen.add(at.person.id);
        const up = byId.get(at.mergedInto);
        if (!up) break;
        at = up;
      }
      return at;
    });
    for (const [i, c] of out.entries()) {
      const into = shownUnder[i] as (typeof out)[number];
      c.mergedInto = into === c ? null : into.person.id;
      if (into !== c)
        into.also.push({
          connectionId: c.connectionId,
          person: c.person,
          conversationId: c.conversationId,
        });
    }
    if (!sphere) return { connections: out };
    // One person, however many accounts: in a sphere if any of them is, unclassified if none is.
    const one = (c: (typeof out)[number]) => c.mergedInto ?? c.person.id;
    const labelled = new Set(
      out
        .filter((c) =>
          sphere === 'unclassified'
            ? c.relationships.length > 0
            : c.relationships.some((r) => r.sphere === sphere),
        )
        .map(one),
    );
    return {
      connections: out.filter((c) => labelled.has(one(c)) !== (sphere === 'unclassified')),
    };
  });

  app.patch('/connections/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(UpdateConnectionBody, req.body);
    const side = await ctx.db
      .selectFrom('connection_sides')
      .selectAll()
      .where('connection_id', '=', id)
      .where('owner_id', '=', auth.userId)
      .executeTakeFirst();
    if (!side) throw notFound('That connection');
    if (body.identityId) {
      const owned = await ctx.db
        .selectFrom('identities')
        .select('id')
        .where('id', '=', body.identityId)
        .where('user_id', '=', auth.userId)
        .executeTakeFirst();
      if (!owned) throw badRequest('Choose one of your identities.');
    }
    await ctx.db
      .updateTable('connection_sides')
      .set({
        ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.attention !== undefined ? { attention: body.attention } : {}),
        ...(body.mutedUntil !== undefined ? { muted_until: body.mutedUntil } : {}),
        ...(body.archived !== undefined ? { archived_at: body.archived ? ctx.now() : null } : {}),
        ...(body.identityId !== undefined ? { identity_id: body.identityId } : {}),
      })
      .where('connection_id', '=', id)
      .where('owner_id', '=', auth.userId)
      .execute();
    await ctx.bus.publish([auth.userId], {
      type: 'connection.updated',
      data: { connectionId: id },
    });
    if (body.nickname) await suggestDuplicatesOf(ctx, auth.userId, side.other_id);
    return { ok: true };
  });

  /** Not the same person after all (PRD §51): the merged account stands on its own again. */
  app.post('/connections/:id/separate', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const side = await ctx.db
      .updateTable('connection_sides')
      .set({ merged_into: null })
      .where('connection_id', '=', id)
      .where('owner_id', '=', auth.userId)
      .where('merged_into', 'is not', null)
      .returning('connection_id')
      .executeTakeFirst();
    if (!side) throw notFound('That merged connection');
    await ctx.bus.publish([auth.userId], {
      type: 'connection.updated',
      data: { connectionId: id },
    });
    return { ok: true };
  });

  app.delete('/connections/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const conn = await ctx.db
      .selectFrom('connections')
      .selectAll()
      .where('id', '=', id)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!conn || (conn.user_a !== auth.userId && conn.user_b !== auth.userId))
      throw notFound('That connection');
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('connections')
        .set({ status: 'removed', removed_at: ctx.now() })
        .where('id', '=', id)
        .execute();
      // Anyone either had merged under the other stays one person, under the next of them.
      await rerootMerged(trx, conn.user_b, [conn.user_a]);
      await rerootMerged(trx, conn.user_a, [conn.user_b]);
      await recordEvent(trx, 'connection.removed', auth.userId, { connectionId: id });
    });
    await ctx.bus.publish([conn.user_a, conn.user_b], {
      type: 'connection.removed',
      data: { connectionId: id },
    });
    // Someone under 18 is in a call only with people they're connected with (R29).
    await leaveGroupCallsAfterDisconnect(
      ctx,
      auth.userId,
      conn.user_a === auth.userId ? conn.user_b : conn.user_a,
    );
    return { ok: true };
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
  if (!request) throw notFound('That request');
  let result!: { connectionId: string; conversationId: string };
  let mine: Awaited<ReturnType<typeof createRelationship>> | null = null;
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('connection_requests')
      .set({ status: 'accepted', responded_at: ctx.now() })
      .where('id', '=', requestId)
      .execute();
    result = await formConnection(trx, request.from_user, userId, {
      requesterIdentityId: request.from_identity_id,
    });
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
  return { ...result, relationship: mine ? relationshipView(mine) : null };
}
