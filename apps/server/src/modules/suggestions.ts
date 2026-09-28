/**
 * Suggestions (PRODUCT-REVIEW R12): inferences that become facts only when accepted.
 */

import type { SuggestionView } from '@caime/core';
import { AcceptSuggestionBody, type RelationshipInputT, TopicBody } from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Suggestion } from '../db/schema';
import { createDecision, createTask } from '../lib/actions';
import { assertCanWrite } from '../lib/blocks';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { isBlockedEitherWay, relationshipView } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { assertCanStartTopic, createTopicConversation, membership } from './conversations';
import { createRelationship, mayClassify } from './relationships';

export function suggestionView(s: Suggestion): SuggestionView {
  return {
    id: s.id,
    kind: s.kind,
    title: s.title,
    rationale: s.rationale,
    confidence: s.confidence,
    payload: s.payload,
    conversationId: s.conversation_id,
    messageId: s.message_id,
    subjectUserId: s.subject_user_id,
    dueAt: s.due_at?.toISOString() ?? null,
    dueText: s.due_text,
    createdAt: s.created_at.toISOString(),
  };
}

export async function suggestionRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/suggestions', async (req): Promise<{ suggestions: SuggestionView[] }> => {
    const auth = requireAuth(req);
    const q = parse(
      z.object({
        conversationId: z.string().uuid().optional(),
        kind: z.string().optional(),
        subjectUserId: z.string().uuid().optional(),
      }),
      req.query,
    );
    const rows = await ctx.db
      .selectFrom('suggestions')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .where('status', '=', 'pending')
      .$if(Boolean(q.conversationId), (qb) => qb.where('conversation_id', '=', q.conversationId!))
      .$if(Boolean(q.kind), (qb) => qb.where('kind', '=', q.kind!))
      .$if(Boolean(q.subjectUserId), (qb) => qb.where('subject_user_id', '=', q.subjectUserId!))
      // What someone may be to you, only while you haven't said, and never across a block.
      .where(({ or, and, eb, not, exists, selectFrom }) =>
        or([
          eb('kind', '<>', 'relationship'),
          and([
            not(
              exists(
                selectFrom('relationships as r')
                  .select('r.id')
                  .whereRef('r.owner_id', '=', 'suggestions.user_id')
                  .whereRef('r.subject_id', '=', 'suggestions.subject_user_id')
                  .where('r.status', '=', 'active'),
              ),
            ),
            not(
              exists(
                selectFrom('blocks as b')
                  .select('b.blocker_id')
                  .where((w) =>
                    w.or([
                      w.and([
                        w('b.blocker_id', '=', w.ref('suggestions.user_id')),
                        w('b.blocked_id', '=', w.ref('suggestions.subject_user_id')),
                      ]),
                      w.and([
                        w('b.blocker_id', '=', w.ref('suggestions.subject_user_id')),
                        w('b.blocked_id', '=', w.ref('suggestions.user_id')),
                      ]),
                    ]),
                  ),
              ),
            ),
          ]),
        ]),
      )
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();
    return { suggestions: rows.map(suggestionView) };
  });

  app.post('/suggestions/:id/accept', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const edits = parse(AcceptSuggestionBody, req.body ?? {});
    const s = await ctx.db
      .selectFrom('suggestions')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    // A topic someone else here started from the same suggestion is the topic: it opens.
    if (s?.kind === 'topic' && s.status === 'expired') {
      const started = await ctx.db
        .selectFrom('suggestions')
        .select('result_ref')
        .where('fingerprint', '=', s.fingerprint)
        .where('status', '=', 'accepted')
        .executeTakeFirst();
      const ref = started?.result_ref as { type?: string; id?: string } | null | undefined;
      if (ref?.type === 'conversation' && ref.id) {
        const seat = await ctx.db
          .selectFrom('participants')
          .select('user_id')
          .where('conversation_id', '=', ref.id)
          .where('user_id', '=', auth.userId)
          .where('left_at', 'is', null)
          .executeTakeFirst();
        if (seat) return { accepted: { type: 'conversation', id: ref.id } };
      }
    }
    if (s?.status !== 'pending') throw notFound('That suggestion');
    // About a conversation they're no longer in: nothing of it is theirs to act on any more (a
    // decision would be recorded in a group they've left, a task would quote it).
    if (s.conversation_id && ['decision', 'task', 'reminder', 'waiting'].includes(s.kind)) {
      const inIt = await ctx.db
        .selectFrom('participants')
        .select('user_id')
        .where('conversation_id', '=', s.conversation_id)
        .where('user_id', '=', auth.userId)
        .where('left_at', 'is', null)
        .executeTakeFirst();
      if (!inIt) {
        await ctx.db
          .updateTable('suggestions')
          .set({ status: 'expired', resolved_at: ctx.now() })
          .where('id', '=', id)
          .execute();
        throw notFound('That suggestion');
      }
    }
    const title = edits.title ?? s.title;
    const dueAt = edits.dueAt !== undefined ? edits.dueAt : (s.due_at?.toISOString() ?? null);
    const payload = (s.payload ?? {}) as Record<string, unknown>;

    if (s.kind === 'topic') {
      const parentId = String(payload.parentId ?? s.conversation_id);
      // Started this way as it is from the conversation's details: the same rules and name.
      const { title: name } = parse(TopicBody, { title });
      const { conversation } = await membership(ctx, auth.userId, parentId);
      await assertCanStartTopic(ctx, auth.userId, conversation);
      const conversationId = await createTopicConversation(ctx, auth.userId, parentId, name);
      await ctx.db
        .updateTable('suggestions')
        .set({
          status: 'accepted',
          resolved_at: ctx.now(),
          result_ref: JSON.stringify({ type: 'conversation', id: conversationId }),
        })
        .where('id', '=', id)
        .execute();
      // Everyone else's copy of this topic suggestion is now answered too, and goes from their
      // screens.
      const others = await ctx.db
        .updateTable('suggestions')
        .set({ status: 'expired', resolved_at: ctx.now() })
        .where('fingerprint', '=', s.fingerprint)
        .where('status', '=', 'pending')
        .returning(['id', 'user_id'])
        .execute();
      await ctx.bus.publish([auth.userId], {
        type: 'suggestion.resolved',
        data: { id, status: 'accepted' },
      });
      for (const o of others)
        await ctx.bus.publish([o.user_id], {
          type: 'suggestion.resolved',
          data: { id: o.id, status: 'expired' },
        });
      return { accepted: { type: 'conversation', id: conversationId } };
    }

    const result = await ctx.db.transaction().execute(async (trx) => {
      let ref: { type: string; id: string; view?: unknown };
      switch (s.kind) {
        case 'duplicate': {
          // The same person (PRD §51): the one merged shows under the one kept, in their view
          // only. Both accounts and their conversations stay as they are.
          const pair = [String(payload.keep), String(payload.merge)];
          const kept = edits.keep ?? pair[0];
          if (!kept || !pair.includes(kept)) throw badRequest('Keep one of the two.');
          const merged = pair.find((p) => p !== kept) as string;
          const sideOf = (otherId: string) =>
            trx
              .selectFrom('connection_sides as s')
              .innerJoin('connections as c', 'c.id', 's.connection_id')
              .select(['s.connection_id', 's.merged_into'])
              .where('s.owner_id', '=', auth.userId)
              .where('s.other_id', '=', otherId)
              .where('c.status', '=', 'active')
              .forUpdate()
              .executeTakeFirst();
          // Who someone shows under: the one they're merged into, while that one is still theirs.
          const shownUnder = async (otherId: string) => {
            const side = await sideOf(otherId);
            if (!side) return null;
            const up = side.merged_into ? await sideOf(side.merged_into) : undefined;
            return { side, one: up && side.merged_into ? side.merged_into : otherId };
          };
          const keeping = await shownUnder(kept);
          const merging = await shownUnder(merged);
          if (!keeping || !merging)
            throw badRequest('You aren’t connected with both of them any more.');
          // Someone blocked either way (since it was offered) isn't anyone's duplicate.
          for (const other of pair)
            if (await isBlockedEitherWay(trx, auth.userId, other))
              throw badRequest('One of them is blocked: it can’t be merged.');
          const into = keeping.one;
          if (into !== merging.one) {
            // The one kept under stands on its own; the one merged, and anyone already under it,
            // go under it: one person, one row.
            await trx
              .updateTable('connection_sides')
              .set({ merged_into: null })
              .where('owner_id', '=', auth.userId)
              .where('other_id', '=', into)
              .execute();
            await trx
              .updateTable('connection_sides')
              .set({ merged_into: into })
              .where('owner_id', '=', auth.userId)
              .where((eb) =>
                eb.or([eb('other_id', '=', merging.one), eb('merged_into', '=', merging.one)]),
              )
              .execute();
          }
          // Any other pair now within this one person has nothing left to ask; gone, rather than
          // spent, so it can be asked again if they're ever apart.
          const one = await trx
            .selectFrom('connection_sides')
            .select('other_id')
            .where('owner_id', '=', auth.userId)
            .where((eb) => eb.or([eb('other_id', '=', into), eb('merged_into', '=', into)]))
            .execute();
          const ids = one.map((r) => r.other_id);
          await trx
            .deleteFrom('suggestions')
            .where('user_id', '=', auth.userId)
            .where('kind', '=', 'duplicate')
            .where('status', '=', 'pending')
            .where('id', '<>', id)
            .where(sql<string>`payload->>'keep'`, 'in', ids)
            .where(sql<string>`payload->>'merge'`, 'in', ids)
            .execute();
          ref = {
            type: 'person',
            id: into,
            view: { connectionId: merging.side.connection_id },
          };
          break;
        }
        case 'relationship': {
          if (!s.subject_user_id) throw badRequest('This suggestion is missing its person.');
          // As when it's said by hand: never about someone blocked, either way.
          if (
            (await isBlockedEitherWay(trx, auth.userId, s.subject_user_id)) ||
            !(await mayClassify(trx, auth.userId, s.subject_user_id))
          )
            throw forbidden('Connect with this person first.');
          const input = (edits.relationship ?? payload) as RelationshipInputT;
          const r = await createRelationship(trx, ctx, auth.userId, s.subject_user_id, input, {
            source: 'suggestion',
          });
          ref = { type: 'relationship', id: r.id, view: relationshipView(r) };
          break;
        }
        case 'task':
        case 'reminder': {
          const t = await createTask(trx, ctx, {
            ownerId: auth.userId,
            assigneeId: auth.userId,
            title,
            dueAt,
            dueHasTime: Boolean(payload.dueHasTime),
            remindAt: s.kind === 'reminder' ? dueAt : null,
            conversationId: s.conversation_id,
            messageId: s.message_id,
            counterpartId: s.subject_user_id,
            source: 'suggestion',
          });
          ref = { type: 'task', id: t.id };
          break;
        }
        case 'waiting': {
          if (!s.subject_user_id) throw badRequest('This suggestion is missing its person.');
          const t = await createTask(trx, ctx, {
            ownerId: auth.userId,
            assigneeId: s.subject_user_id,
            shared: false,
            title,
            dueAt,
            conversationId: s.conversation_id,
            messageId: s.message_id,
            source: 'suggestion',
          });
          ref = { type: 'task', id: t.id };
          break;
        }
        case 'decision': {
          if (!s.conversation_id) throw badRequest('This suggestion is missing its conversation.');
          // Its line goes in the conversation: only from someone who may write there (blocks).
          await assertCanWrite(ctx, s.conversation_id, auth.userId);
          const d = await createDecision(trx, ctx, {
            conversationId: s.conversation_id,
            messageId: s.message_id,
            title,
            recordedBy: auth.userId,
            decidedBy: (payload.decidedBy as string | undefined) ?? auth.userId,
          });
          ref = { type: 'decision', id: d.id };
          // One decision per message: other participants' suggestions for it are answered.
          await trx
            .updateTable('suggestions')
            .set({ status: 'expired', resolved_at: ctx.now() })
            .where('message_id', '=', s.message_id)
            .where('kind', '=', 'decision')
            .where('status', '=', 'pending')
            .where('id', '<>', id)
            .execute();
          break;
        }
        default:
          throw badRequest(`Accepting a ${s.kind} suggestion isn’t supported yet.`);
      }
      await trx
        .updateTable('suggestions')
        .set({
          status: 'accepted',
          resolved_at: ctx.now(),
          result_ref: JSON.stringify({ type: ref.type, id: ref.id }),
        })
        .where('id', '=', id)
        .execute();
      await recordEvent(trx, 'suggestion.accepted', auth.userId, {
        suggestionId: id,
        kind: s.kind,
        result: { type: ref.type, id: ref.id },
      });
      return ref;
    });
    const affected = [auth.userId];
    if (result.type === 'decision' && s.conversation_id) {
      const members = await ctx.db
        .selectFrom('participants')
        .select('user_id')
        .where('conversation_id', '=', s.conversation_id)
        .where('left_at', 'is', null)
        .execute();
      affected.push(...members.map((m) => m.user_id));
    }
    if (result.type === 'person')
      await ctx.bus.publish([auth.userId], {
        type: 'connection.updated',
        data: { connectionId: (result.view as { connectionId: string }).connectionId },
      });
    // How they know them now, on every device: their page, People, the inbox.
    else if (result.type === 'relationship')
      await ctx.bus.publish([auth.userId], {
        type: 'relationship.changed',
        data: { subjectId: s.subject_user_id },
      });
    else
      await ctx.bus.publish(affected, {
        type: `${result.type}.created`,
        data: { id: result.id, conversationId: s.conversation_id },
      });
    await ctx.bus.publish([auth.userId], {
      type: 'suggestion.resolved',
      data: { id, status: 'accepted' },
    });
    return { accepted: result };
  });

  app.post('/suggestions/:id/dismiss', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const res = await ctx.db
      .updateTable('suggestions')
      .set({ status: 'dismissed', resolved_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound('That suggestion');
    await ctx.bus.publish([auth.userId], {
      type: 'suggestion.resolved',
      data: { id, status: 'dismissed' },
    });
    return { ok: true };
  });
}
