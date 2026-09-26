/**
 * Context and memory (PRD §17, §24, §27, §57): what a conversation is about, and what it holds —
 * people, decisions, open items, dates, documents, links, amounts — without scrolling.
 */

import type { MemoryView } from '@caishy/core';
import { CreateContextBody, formatDue, joinNames, UpdateContextBody, uuidv7 } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { participantsOf } from '../lib/messages';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { taskViews } from './actions';
import { membership } from './conversations';

async function contextVisible(
  ctx: AppContext,
  userId: string,
  contextId: string,
): Promise<boolean> {
  const row = await ctx.db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', userId),
    )
    .select('c.id')
    .where('c.context_id', '=', contextId)
    .where('p.left_at', 'is', null)
    .executeTakeFirst();
  if (row) return true;
  const own = await ctx.db
    .selectFrom('contexts')
    .select('id')
    .where('id', '=', contextId)
    .where('created_by', '=', userId)
    .executeTakeFirst();
  return Boolean(own);
}

export async function memoryRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/contexts', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateContextBody, req.body);
    if (body.conversationId) await membership(ctx, auth.userId, body.conversationId);
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('contexts')
        .values({
          id,
          created_by: auth.userId,
          kind: body.kind,
          title: body.title,
          purpose: body.purpose ?? null,
          deadline_at: body.deadlineAt ?? null,
          external_ref: body.externalRef ?? null,
        })
        .execute();
      if (body.conversationId)
        await trx
          .updateTable('conversations')
          .set({ context_id: id })
          .where('id', '=', body.conversationId)
          .execute();
      await recordEvent(trx, 'context.created', auth.userId, { contextId: id });
    });
    if (body.conversationId) {
      await ctx.bus.publish(
        (await participantsOf(ctx.db, body.conversationId)).map((p) => p.user_id),
        { type: 'conversation.updated', data: { conversationId: body.conversationId } },
      );
    }
    reply.status(201);
    return { id };
  });

  app.patch('/contexts/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(UpdateContextBody, req.body);
    if (!(await contextVisible(ctx, auth.userId, id))) throw notFound('That context');
    await ctx.db
      .updateTable('contexts')
      .set({
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
        ...(body.deadlineAt !== undefined ? { deadline_at: body.deadlineAt } : {}),
        ...(body.externalRef !== undefined ? { external_ref: body.externalRef } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .execute();
    const convos = await ctx.db
      .selectFrom('conversations')
      .select('id')
      .where('context_id', '=', id)
      .execute();
    for (const c of convos) {
      await ctx.bus.publish(
        (await participantsOf(ctx.db, c.id)).map((p) => p.user_id),
        { type: 'conversation.updated', data: { conversationId: c.id } },
      );
    }
    return { ok: true };
  });

  app.get('/contexts', async (req) => {
    const auth = requireAuth(req);
    const { q } = parse(z.object({ q: z.string().trim().max(120).optional() }), req.query);
    const rows = await ctx.db
      .selectFrom('contexts as x')
      .selectAll('x')
      .where((eb) =>
        eb.or([
          eb('x.created_by', '=', auth.userId),
          eb.exists(
            eb
              .selectFrom('conversations as c')
              .innerJoin('participants as p', 'p.conversation_id', 'c.id')
              .select('c.id')
              .whereRef('c.context_id', '=', 'x.id')
              .where('p.user_id', '=', auth.userId)
              .where('p.left_at', 'is', null),
          ),
        ]),
      )
      .$if(Boolean(q), (qb) => qb.where('x.title', 'ilike', `%${q}%`))
      .orderBy('x.updated_at', 'desc')
      .limit(100)
      .execute();
    return {
      contexts: rows.map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title,
        purpose: c.purpose,
        status: c.status,
        deadlineAt: c.deadline_at?.toISOString() ?? null,
        externalRef: c.external_ref,
      })),
    };
  });

  app.get('/contexts/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await contextVisible(ctx, auth.userId, id))) throw notFound('That context');
    const c = await ctx.db
      .selectFrom('contexts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const convos = await ctx.db
      .selectFrom('conversations as cv')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'cv.id').on('p.user_id', '=', auth.userId),
      )
      .select(['cv.id', 'cv.title', 'cv.kind', 'cv.last_message_at'])
      .where('cv.context_id', '=', id)
      .execute();
    const ids = convos.map((x) => x.id);
    const [files, decisions, tasks] = await Promise.all([
      ids.length
        ? ctx.db
            .selectFrom('assets')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('conversation_id', 'in', ids)
            .where('kind', 'in', ['photo', 'video', 'document', 'audio'])
            .executeTakeFirstOrThrow()
        : { n: 0 },
      ids.length
        ? ctx.db
            .selectFrom('decisions')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('conversation_id', 'in', ids)
            .where('status', '=', 'active')
            .executeTakeFirstOrThrow()
        : { n: 0 },
      ctx.db
        .selectFrom('tasks')
        .select(sql<number>`count(*)::int`.as('n'))
        .where((eb) =>
          eb.or([
            eb('context_id', '=', id),
            ids.length ? eb('conversation_id', 'in', ids) : sql<boolean>`false`,
          ]),
        )
        .where('status', 'in', ['open', 'accepted'])
        .where((eb) =>
          eb.or([
            eb('owner_id', '=', auth.userId),
            eb.and([eb('assignee_id', '=', auth.userId), eb('shared', '=', true)]),
          ]),
        )
        .executeTakeFirstOrThrow(),
    ]);
    return {
      context: {
        id: c.id,
        kind: c.kind,
        title: c.title,
        purpose: c.purpose,
        status: c.status,
        deadlineAt: c.deadline_at?.toISOString() ?? null,
        externalRef: c.external_ref,
      },
      conversations: convos.map((x) => ({
        id: x.id,
        title: x.title,
        kind: x.kind,
        lastMessageAt: x.last_message_at?.toISOString() ?? null,
      })),
      counts: { files: files.n, decisions: decisions.n, openActions: tasks.n },
    };
  });

  /** Conversation memory (PRD §24). */
  app.get('/conversations/:id/memory', async (req): Promise<MemoryView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { conversation } = await membership(ctx, auth.userId, id);
    const now = ctx.now();
    const me = await ctx.db
      .selectFrom('users')
      .select(['time_zone', 'locale'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    const [people, decisions, openTasks, recent, assets, stats] = await Promise.all([
      ctx.db
        .selectFrom('participants as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select(['u.id', 'u.display_name', 'p.role'])
        .where('p.conversation_id', '=', id)
        .where('p.left_at', 'is', null)
        .execute(),
      ctx.db
        .selectFrom('decisions')
        .selectAll()
        .where('conversation_id', '=', id)
        .where('status', '=', 'active')
        .orderBy('decided_at', 'desc')
        .limit(20)
        .execute(),
      ctx.db
        .selectFrom('tasks')
        .selectAll()
        .where('conversation_id', '=', id)
        .where('status', 'in', ['open', 'accepted'])
        .where((eb) =>
          eb.or([
            eb('owner_id', '=', auth.userId),
            eb.and([eb('assignee_id', '=', auth.userId), eb('shared', '=', true)]),
          ]),
        )
        .orderBy(sql`due_at`, sql`asc nulls last`)
        .execute(),
      ctx.db
        .selectFrom('messages')
        .select(['id', 'entities', 'created_at', 'sender_id'])
        .where('conversation_id', '=', id)
        .where('deleted_at', 'is', null)
        .orderBy('seq', 'desc')
        .limit(300)
        .execute(),
      ctx.db
        .selectFrom('assets')
        .select(['id', 'kind', 'title', 'url', 'host', 'file_id', 'message_id', 'created_at'])
        .where('conversation_id', '=', id)
        .orderBy('created_at', 'desc')
        .limit(50)
        .execute(),
      ctx.db
        .selectFrom('messages')
        .select([
          sql<number>`count(*)::int`.as('total'),
          sql<number>`count(*) filter (where created_at > ${new Date(now.getTime() - 7 * 86_400_000)})::int`.as(
            'week',
          ),
        ])
        .where('conversation_id', '=', id)
        .where('deleted_at', 'is', null)
        .where('kind', '<>', 'system')
        .executeTakeFirstOrThrow(),
    ]);
    type Entities = {
      dates?: Array<{ text: string; date: string; time: string | null; at: string; past: boolean }>;
      amounts?: Array<{ text: string; value: number; currency: string | null }>;
      topics?: string[];
    };
    const dates: Array<{ text: string; at: string; messageId: string }> = [];
    const amounts: Array<{
      text: string;
      value: number;
      currency: string | null;
      messageId: string;
    }> = [];
    const topicCount = new Map<string, number>();
    for (const m of recent) {
      const e = (m.entities ?? {}) as Entities;
      for (const d of e.dates ?? [])
        if (Date.parse(d.at) > now.getTime() && dates.length < 10)
          dates.push({ text: d.text, at: d.at, messageId: m.id });
      for (const a of e.amounts ?? [])
        if (amounts.length < 10) amounts.push({ ...a, messageId: m.id });
      for (const t of e.topics ?? []) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
    }
    const tasks = await taskViews(ctx, openTasks, auth.userId);
    const mineCount = tasks.filter(
      (t) => t.direction === 'mine' || t.direction === 'asked_me',
    ).length;
    const waitingCount = tasks.filter(
      (t) => t.direction === 'waiting' || t.direction === 'i_asked',
    ).length;
    const next = dates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    // Extractive "current state" — deterministic, no model needed (R17).
    const summary = [
      stats.week > 0
        ? `${stats.week} message${stats.week === 1 ? '' : 's'} this week.`
        : 'Quiet this week.',
      mineCount ? `${mineCount} open for you.` : null,
      waitingCount ? `Waiting on ${waitingCount}.` : null,
      decisions[0] ? `Last decision: ${decisions[0].title}.` : null,
      next ? `Next date: ${formatDue(next.at, now, me.time_zone, me.locale)}.` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return {
      summary,
      people: people.map((p) => ({ id: p.id, displayName: p.display_name, role: p.role })),
      peopleLine: joinNames(people.filter((p) => p.id !== auth.userId).map((p) => p.display_name)),
      decisions: decisions.map((d) => ({
        id: d.id,
        title: d.title,
        messageId: d.message_id,
        decidedAt: d.decided_at.toISOString(),
      })),
      openItems: tasks,
      dates,
      amounts,
      documents: assets
        .filter((a) => a.kind === 'document')
        .slice(0, 10)
        .map((a) => ({ id: a.id, title: a.title, fileId: a.file_id, messageId: a.message_id })),
      links: assets
        .filter((a) => a.kind === 'link')
        .slice(0, 10)
        .map((a) => ({ id: a.id, url: a.url, host: a.host, messageId: a.message_id })),
      places: assets
        .filter((a) => a.kind === 'location')
        .slice(0, 10)
        .map((a) => ({ id: a.id, title: a.title, messageId: a.message_id })),
      topics: [...topicCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t]) => t),
      counts: { messages: stats.total, decisions: decisions.length, openItems: tasks.length },
      privacyClass: conversation.privacy_class,
    };
  });
}
