/**
 * Finding people and the relationship profile (PRD §25 "People", §50, §54, §67).
 */

import type { ConnectionStateView, PeopleSearchResult, PersonProfileView } from '@caime/core';
import { ADULT_AGE, resolvePolicy, rhythmOf } from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { notHiddenFor } from '../lib/messages';
import {
  activeRelationships,
  between,
  loadPolicies,
  mutualFit,
  pairKey,
  policyTargetFor,
  relationshipView,
  viewerRelation,
} from '../lib/relations';
import { identityShownTo, minorOf, personView } from '../lib/users';

export { identityShownTo };

import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export function connectionState(b: Awaited<ReturnType<typeof between>>): ConnectionStateView {
  return {
    state: b.connected
      ? 'connected'
      : b.outgoingRequestId
        ? 'outgoing'
        : b.incomingRequestId
          ? 'incoming'
          : 'none',
    connectionId: b.connectionId,
    requestId: b.outgoingRequestId ?? b.incomingRequestId,
  };
}

export async function peopleRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/people/search', async (req): Promise<{ results: PeopleSearchResult[] }> => {
    const auth = requireAuth(req);
    const { q, limit } = parse(
      z.object({
        q: z.string().trim().min(1).max(100),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      req.query,
    );
    ctx.limiter.hit(`people-search:${auth.userId}`, ctx.config.isTest ? 1000 : 120, 60_000);
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    const now = ctx.now();
    const viewerIsMinor = minorOf(me, now);
    const term = q.replace(/^@/, '').toLowerCase();
    const like = `${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const contains = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const rows = await ctx.db
      .selectFrom('users as u')
      .leftJoin('connection_sides as s', (j) =>
        j.onRef('s.other_id', '=', 'u.id').on('s.owner_id', '=', auth.userId),
      )
      .leftJoin('connections as c', (j) =>
        j.onRef('c.id', '=', 's.connection_id').on('c.status', '=', 'active'),
      )
      .selectAll('u')
      .select([
        sql<boolean>`c.id is not null`.as('is_connection'),
        sql<number>`greatest(similarity(u.display_name, ${term}), similarity(u.handle::text, ${term}), coalesce(similarity(s.nickname, ${term}), 0))`.as(
          'score',
        ),
      ])
      .where('u.id', '<>', auth.userId)
      .where('u.deleted_at', 'is', null)
      .where('u.kind', '=', 'human')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('blocks')
              .select('blocker_id')
              .where((b) =>
                b.or([
                  b.and([b('blocker_id', '=', auth.userId), b('blocked_id', '=', b.ref('u.id'))]),
                  b.and([b('blocker_id', '=', b.ref('u.id')), b('blocked_id', '=', auth.userId)]),
                ]),
              ),
          ),
        ),
      )
      .where((eb) =>
        eb.or([
          // People I'm connected to are always findable by me, including by my nickname for them.
          eb.and([
            sql<boolean>`c.id is not null`,
            eb.or([
              eb('u.display_name', 'ilike', contains),
              sql<boolean>`u.handle::text ilike ${like}`,
              eb('s.nickname', 'ilike', contains),
            ]),
          ]),
          // Everyone else, only as their privacy allows.
          eb.and([
            sql<boolean>`coalesce((u.privacy->>'discoverByHandle')::boolean, true)`,
            eb.or([
              sql<boolean>`u.handle::text ilike ${like}`,
              sql<boolean>`similarity(u.display_name, ${term}) > 0.35`,
              eb('u.display_name', 'ilike', contains),
            ]),
          ]),
          eb.and([
            sql<boolean>`coalesce((u.privacy->>'discoverByEmail')::boolean, false)`,
            sql<boolean>`u.email = ${term}`,
          ]),
        ]),
      )
      // Adults never find under-18 accounts (R29) unless already connected: here everyone who
      // may be 18 somewhere today (no zone is more than a day ahead of UTC), and below, exactly,
      // whoever is 18 on the day where they are.
      .$if(!viewerIsMinor, (qb) =>
        qb.where((eb) =>
          eb.or([
            sql<boolean>`c.id is not null`,
            eb('u.birth_date', 'is', null),
            sql<boolean>`u.birth_date <= (${now}::timestamptz at time zone 'UTC')::date + 1 - ${`${ADULT_AGE} years`}::interval`,
          ]),
        ),
      )
      .orderBy(sql`c.id is not null`, 'desc')
      .orderBy(sql`u.handle::text = ${term}`, 'desc')
      .orderBy(sql`u.handle::text ilike ${like}`, 'desc')
      .orderBy('score', 'desc')
      .limit(limit)
      .execute();

    // Their birthday where they are (packages/core safety.ts isMinor), as every other gate has it.
    const found = viewerIsMinor ? rows : rows.filter((u) => u.is_connection || !minorOf(u, now));
    const ids = found.map((r) => r.id);
    const mine = await activeRelationships(ctx.db, auth.userId, ids);
    const results = await Promise.all(
      found.map(async (u) => {
        const [relation, b, identity] = await Promise.all([
          viewerRelation(ctx.db, u.id, auth.userId),
          between(ctx.db, auth.userId, u.id),
          identityShownTo(ctx, u.id, auth.userId),
        ]);
        const rel = mine.find((r) => r.subject_id === u.id);
        return {
          person: personView(u, relation, now, identity),
          connection: connectionState(b),
          relationship: rel ? relationshipView(rel) : null,
        };
      }),
    );
    return { results };
  });

  app.get('/people/:id', async (req): Promise<PersonProfileView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user) throw notFound('That person');
    const [relation, b, identity, mine] = await Promise.all([
      viewerRelation(ctx.db, id, auth.userId),
      between(ctx.db, auth.userId, id),
      identityShownTo(ctx, id, auth.userId),
      id === auth.userId ? Promise.resolve([]) : activeRelationships(ctx.db, auth.userId, [id]),
    ]);
    // Being blocked by them looks exactly like not existing.
    if (b.blockedMe) throw notFound('That person');
    const now = ctx.now();
    const { key } = pairKey(auth.userId, id);
    const conversations = await ctx.db
      .selectFrom('conversations as cv')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'cv.id').on('p.user_id', '=', auth.userId),
      )
      .select(['cv.id', 'cv.title', 'cv.is_general', 'cv.last_message_at', 'cv.context_id'])
      .where('cv.direct_key', '=', key)
      .orderBy('cv.is_general', 'desc')
      .orderBy('cv.last_message_at', sql`desc nulls last`)
      .execute();
    const conversationIds = conversations.map((c) => c.id);
    const counts = conversationIds.length
      ? await ctx.db
          .selectNoFrom([
            (eb) =>
              eb
                .selectFrom('messages')
                .select(sql<number>`count(*)::int`.as('n'))
                .where('conversation_id', 'in', conversationIds)
                .where('deleted_at', 'is', null)
                .where(notHiddenFor(auth.userId, 'messages.id'))
                .as('messages'),
            (eb) =>
              eb
                .selectFrom('assets')
                .select(sql<number>`count(*)::int`.as('n'))
                .where('conversation_id', 'in', conversationIds)
                .where('kind', 'in', ['photo', 'video', 'document', 'audio'])
                .where(notHiddenFor(auth.userId, 'assets.message_id'))
                .as('files'),
            (eb) =>
              eb
                .selectFrom('assets')
                .select(sql<number>`count(*)::int`.as('n'))
                .where('conversation_id', 'in', conversationIds)
                .where('kind', '=', 'link')
                .where(notHiddenFor(auth.userId, 'assets.message_id'))
                .as('links'),
            (eb) =>
              eb
                .selectFrom('decisions')
                .select(sql<number>`count(*)::int`.as('n'))
                .where('conversation_id', 'in', conversationIds)
                .where('status', '=', 'active')
                .as('decisions'),
          ])
          .executeTakeFirstOrThrow()
      : { messages: 0, files: 0, links: 0, decisions: 0 };
    const actions = await ctx.db
      .selectNoFrom([
        (eb) =>
          eb
            .selectFrom('tasks')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('owner_id', '=', auth.userId)
            .where('assignee_id', '=', id)
            .where('status', 'in', ['open', 'accepted'])
            .as('waiting'),
        (eb) =>
          eb
            .selectFrom('tasks')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('assignee_id', '=', auth.userId)
            .where((w) =>
              w.or([
                w.and([w('owner_id', '=', id), w('shared', '=', true)]),
                w.and([
                  w('owner_id', '=', auth.userId),
                  conversationIds.length
                    ? w('conversation_id', 'in', conversationIds)
                    : sql<boolean>`false`,
                ]),
              ]),
            )
            .where('status', 'in', ['open', 'accepted'])
            .as('open'),
      ])
      .executeTakeFirstOrThrow();
    const primary = mine[0];
    // How the two of them are in touch (PRD §67, §71), in words and for the viewer only.
    const talk = conversationIds.length
      ? await ctx.db
          .selectFrom('messages')
          .select([
            sql<number>`count(distinct date_trunc('week', created_at)) filter (where created_at > ${new Date(now.getTime() - 84 * 86_400_000)})::int`.as(
              'weeks',
            ),
            sql<Date | null>`max(created_at)`.as('last'),
            // Ids are in the order messages were sent (uuidv7), to the millisecond and beyond.
            sql<string | null>`max(id::text) filter (where sender_id = ${auth.userId})`.as('mine'),
            sql<string | null>`max(id::text) filter (where sender_id = ${id})`.as('theirs'),
          ])
          .where('conversation_id', 'in', conversationIds)
          .where('deleted_at', 'is', null)
          .where('kind', '<>', 'system')
          // What the viewer deleted for themselves isn't part of it for them.
          .where(notHiddenFor(auth.userId, 'messages.id'))
          .executeTakeFirstOrThrow()
      : { weeks: 0, last: null, mine: null, theirs: null };
    const asks = async (from: string, since: string | null) =>
      conversationIds.length
        ? (
            await ctx.db
              .selectFrom('messages')
              .select(sql<number>`count(*)::int`.as('n'))
              .where('conversation_id', 'in', conversationIds)
              .where('sender_id', '=', from)
              .where('deleted_at', 'is', null)
              .where(notHiddenFor(auth.userId, 'messages.id'))
              .where((w) => w.or([w('is_question', '=', true), w('is_request', '=', true)]))
              .$if(Boolean(since), (qb) => qb.where('id', '>', since!))
              .executeTakeFirstOrThrow()
          ).n
        : 0;
    const [theirAsks, myAsks, contexts, policies] = await Promise.all([
      id === auth.userId ? 0 : asks(id, talk.mine),
      id === auth.userId ? 0 : asks(auth.userId, talk.theirs),
      conversationIds.length
        ? ctx.db
            .selectFrom('conversations as c')
            .innerJoin('contexts as x', 'x.id', 'c.context_id')
            .select(['x.id', 'x.title', 'x.kind'])
            .distinct()
            .where('c.id', 'in', conversationIds)
            .execute()
        : [],
      loadPolicies(ctx.db, auth.userId),
    ]);
    const privacy = resolvePolicy(policies, policyTargetFor(primary, b.connectionId)).privacy;
    return {
      person: personView(user, relation, now, identity),
      connection: connectionState(b),
      blockedByMe: b.blockedByMe,
      relationships: mine.map(relationshipView),
      mutual: primary ? await mutualFit(ctx.db, auth.userId, id, primary) : null,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.is_general ? 'General' : (c.title ?? 'Topic'),
        isGeneral: c.is_general,
        lastMessageAt: c.last_message_at?.toISOString() ?? null,
      })),
      summary: {
        messages: Number(counts.messages ?? 0),
        files: Number(counts.files ?? 0),
        links: Number(counts.links ?? 0),
        decisions: Number(counts.decisions ?? 0),
        openActions: Number(actions.open ?? 0),
        waiting: Number(actions.waiting ?? 0),
        contexts: contexts.map((x) => ({ id: x.id, title: x.title, kind: x.kind })),
        rhythm: rhythmOf(talk.weeks, talk.last !== null),
        lastTalkedAt: talk.last?.toISOString() ?? null,
        theirAsks,
        myAsks,
        privacy: privacy === 'limited' ? 'limited' : 'standard',
      },
    };
  });
}
