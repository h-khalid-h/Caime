/**
 * Actions (PRD §28–§30; PRODUCT-REVIEW R13): tasks, waiting items, requests and decisions, each
 * keeping the conversation, message and relationship it came from.
 */

import type { DecisionView, TaskDirection, TasksResponse, TaskView } from '@caishy/core';
import {
  CreateDecisionBody,
  CreateTaskBody,
  formatDue,
  UpdateTaskBody,
  uuidv4,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Task } from '../db/schema';
import { createDecision, createTask } from '../lib/actions';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { messagePreview, messageViews, participantsOf, sendMessage } from '../lib/messages';
import { notify } from '../lib/notify';
import { between } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership, sendSystem } from './conversations';

export type { TaskDirection };

export function directionOf(
  t: Pick<Task, 'owner_id' | 'assignee_id' | 'shared'>,
  me: string,
): TaskDirection {
  if (t.owner_id === me && t.assignee_id === me) return 'mine';
  if (t.owner_id === me) return t.shared ? 'i_asked' : 'waiting';
  return 'asked_me';
}

/** Who hears about a change: the owner, and the assignee when it was shared with them. */
function audienceOf(t: Pick<Task, 'owner_id' | 'assignee_id' | 'shared'>): string[] {
  return t.shared && t.assignee_id ? [t.owner_id, t.assignee_id] : [t.owner_id];
}

export async function taskViews(ctx: AppContext, rows: Task[], me: string): Promise<TaskView[]> {
  const userIds = [
    ...new Set(rows.flatMap((t) => (t.assignee_id ? [t.owner_id, t.assignee_id] : [t.owner_id]))),
  ];
  const messageIds = rows.map((t) => t.message_id).filter((x): x is string => Boolean(x));
  const [users, messages] = await Promise.all([
    userIds.length
      ? ctx.db
          .selectFrom('users')
          .select(['id', 'display_name'])
          .where('id', 'in', userIds)
          .execute()
      : [],
    messageIds.length
      ? ctx.db.selectFrom('messages').selectAll().where('id', 'in', messageIds).execute()
      : [],
  ]);
  const name = (id: string) => users.find((u) => u.id === id)?.display_name ?? 'Someone';
  return rows.map((t) => {
    const m = messages.find((x) => x.id === t.message_id);
    const snap = t.relationship_snapshot as { label?: string } | null;
    return {
      id: t.id,
      title: t.title,
      notes: t.notes,
      status: t.status,
      direction: directionOf(t, me),
      shared: t.shared,
      owner: { id: t.owner_id, displayName: name(t.owner_id) },
      assignee: t.assignee_id
        ? { id: t.assignee_id, displayName: name(t.assignee_id) }
        : { id: null, displayName: 'Deleted account' },
      dueAt: t.due_at?.toISOString() ?? null,
      dueHasTime: t.due_has_time,
      remindAt: t.remind_at?.toISOString() ?? null,
      conversationId: t.conversation_id,
      messageId: t.message_id,
      source: m
        ? {
            preview: messagePreview(m),
            senderId: m.sender_id,
            createdAt: m.created_at.toISOString(),
          }
        : null,
      contextId: t.context_id,
      relationship: snap?.label ?? null,
      origin: t.source,
      createdAt: t.created_at.toISOString(),
      completedAt: t.completed_at?.toISOString() ?? null,
    };
  });
}

async function visibleTask(ctx: AppContext, me: string, id: string): Promise<Task> {
  const t = await ctx.db.selectFrom('tasks').selectAll().where('id', '=', id).executeTakeFirst();
  if (!t || (t.owner_id !== me && !(t.shared && t.assignee_id === me))) throw notFound('That task');
  return t;
}

/** Keep the request card in the conversation in step with the task. */
async function syncRequestCard(ctx: AppContext, t: Task): Promise<void> {
  if (!t.conversation_id || !t.shared) return;
  const card = await ctx.db
    .selectFrom('messages')
    .selectAll()
    .where('conversation_id', '=', t.conversation_id)
    .where('kind', '=', 'kit')
    .where(sql<boolean>`payload->>'taskId' = ${t.id}`)
    .executeTakeFirst();
  if (!card) return;
  const updated = await ctx.db
    .updateTable('messages')
    .set({
      payload: JSON.stringify({
        ...(card.payload as object),
        state: t.status,
        title: t.title,
        dueAt: t.due_at?.toISOString() ?? null,
      }),
    })
    .where('id', '=', card.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  const [view] = await messageViews(ctx.db, [updated], t.owner_id);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, t.conversation_id)).map((p) => p.user_id),
    { type: 'message.updated', data: { ...view, clientId: null } },
  );
}

export async function actionRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/tasks', async (req): Promise<TasksResponse> => {
    const auth = requireAuth(req);
    const q = parse(
      z.object({
        view: z.enum(['todo', 'waiting', 'asked_me', 'i_asked', 'done', 'all']).default('todo'),
        conversationId: z.string().uuid().optional(),
        personId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      req.query,
    );
    const me = auth.userId;
    const open = ['open', 'accepted'] as const;
    let query = ctx.db
      .selectFrom('tasks')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('owner_id', '=', me),
          eb.and([eb('assignee_id', '=', me), eb('shared', '=', true)]),
        ]),
      );
    switch (q.view) {
      case 'todo':
        query = query.where('assignee_id', '=', me).where('status', 'in', open);
        break;
      case 'waiting':
        query = query
          .where('owner_id', '=', me)
          .where('assignee_id', 'is distinct from', me)
          .where('status', 'in', open);
        break;
      case 'asked_me':
        query = query
          .where('assignee_id', '=', me)
          .where('owner_id', '<>', me)
          .where('status', 'in', open);
        break;
      case 'i_asked':
        query = query
          .where('owner_id', '=', me)
          .where('assignee_id', 'is distinct from', me)
          .where('shared', '=', true)
          .where('status', 'in', open);
        break;
      case 'done':
        query = query.where('status', 'in', ['done', 'cancelled', 'declined']);
        break;
    }
    if (q.conversationId) query = query.where('conversation_id', '=', q.conversationId);
    if (q.personId) {
      query = query.where((eb) =>
        eb.or([
          eb.and([eb('owner_id', '=', me), eb('assignee_id', '=', q.personId!)]),
          eb.and([eb('owner_id', '=', q.personId!), eb('assignee_id', '=', me)]),
          sql<boolean>`relationship_snapshot->>'userId' = ${q.personId}`,
        ]),
      );
    }
    const rows = await query
      .orderBy(
        q.view === 'done' ? sql`completed_at` : sql`due_at`,
        q.view === 'done' ? sql`desc nulls last` : sql`asc nulls last`,
      )
      .orderBy('created_at', 'desc')
      .limit(q.limit)
      .execute();
    const counts = await ctx.db
      .selectFrom('tasks')
      .select([
        sql<number>`count(*) filter (where assignee_id = ${me} and status in ('open','accepted'))::int`.as(
          'todo',
        ),
        sql<number>`count(*) filter (where owner_id = ${me} and assignee_id is distinct from ${me} and status in ('open','accepted'))::int`.as(
          'waiting',
        ),
        sql<number>`count(*) filter (where assignee_id = ${me} and owner_id <> ${me} and shared and status in ('open','accepted'))::int`.as(
          'asked_me',
        ),
        sql<number>`count(*) filter (where assignee_id = ${me} and status in ('open','accepted') and due_at < ${ctx.now()})::int`.as(
          'overdue',
        ),
      ])
      .where((eb) =>
        eb.or([
          eb('owner_id', '=', me),
          eb.and([eb('assignee_id', '=', me), eb('shared', '=', true)]),
        ]),
      )
      .executeTakeFirstOrThrow();
    return { tasks: await taskViews(ctx, rows, me), counts };
  });

  app.post('/tasks', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateTaskBody, req.body);
    const me = auth.userId;
    const assignee = body.assigneeId ?? me;
    if (assignee !== me) {
      const b = await between(ctx.db, me, assignee);
      if (b.blockedByMe || b.blockedMe) throw forbidden('You can’t assign this person.');
      let related = b.connected;
      if (!related && body.conversationId) {
        const members = await participantsOf(ctx.db, body.conversationId);
        related =
          members.some((m) => m.user_id === me) && members.some((m) => m.user_id === assignee);
      }
      if (!related) throw forbidden('You can ask people you’re connected with.');
    }
    if (body.conversationId) await membership(ctx, me, body.conversationId);
    if (body.shared && assignee === me) throw badRequest('A request goes to someone else.');
    const task = await ctx.db.transaction().execute((trx) =>
      createTask(trx, ctx, {
        ownerId: me,
        assigneeId: assignee,
        shared: body.shared ?? false,
        title: body.title,
        notes: body.notes ?? null,
        dueAt: body.dueAt ?? null,
        dueHasTime: body.dueHasTime ?? false,
        remindAt: body.remindAt ?? null,
        conversationId: body.conversationId ?? null,
        messageId: body.messageId ?? null,
        contextId: body.contextId ?? null,
        source: body.shared ? 'request' : 'manual',
      }),
    );
    if (task.shared) {
      const owner = await ctx.db
        .selectFrom('users')
        .select(['display_name', 'time_zone'])
        .where('id', '=', me)
        .executeTakeFirstOrThrow();
      const assigneeUser = await ctx.db
        .selectFrom('users')
        .select(['time_zone'])
        .where('id', '=', assignee)
        .executeTakeFirstOrThrow();
      const due = task.due_at
        ? ` · due ${formatDue(task.due_at.toISOString(), ctx.now(), assigneeUser.time_zone, 'en', task.due_has_time)}`
        : '';
      if (body.conversationId) {
        // The structured request appears in the conversation as a live card (PRD §21).
        const sent = await sendMessage(
          ctx,
          me,
          body.conversationId,
          {
            clientId: body.clientId ?? `req:${uuidv4()}`,
            kind: 'kit',
            payload: {
              kit: 'request',
              fields: {},
              taskId: task.id,
              title: task.title,
              dueAt: task.due_at?.toISOString() ?? null,
              state: 'open',
              assigneeId: assignee,
            },
          },
          { trusted: true },
        );
        if (sent.created) {
          await ctx.db
            .updateTable('tasks')
            .set({ message_id: sent.message.id })
            .where('id', '=', task.id)
            .execute();
          const [view] = await messageViews(ctx.db, [sent.message], me);
          await ctx.bus.publish(
            (await participantsOf(ctx.db, body.conversationId)).map((p) => p.user_id),
            { type: 'message.created', data: { ...view, clientId: null } },
          );
        }
      }
      await notify(ctx, {
        userId: assignee,
        kind: 'request',
        level: 'attention',
        title: `${owner.display_name} asked you`,
        body: `${task.title}${due}`,
        data: { taskId: task.id, conversationId: task.conversation_id },
      });
      await ctx.bus.publish([assignee], { type: 'task.created', data: { id: task.id } });
    }
    await ctx.bus.publish([me], { type: 'task.created', data: { id: task.id } });
    reply.status(201);
    const fresh = await ctx.db
      .selectFrom('tasks')
      .selectAll()
      .where('id', '=', task.id)
      .executeTakeFirstOrThrow();
    return { task: (await taskViews(ctx, [fresh], me))[0] };
  });

  app.patch('/tasks/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(UpdateTaskBody, req.body);
    const me = auth.userId;
    const t = await visibleTask(ctx, me, id);
    const isOwner = t.owner_id === me;
    const isAssignee = t.assignee_id === me;
    const editsContent =
      body.title !== undefined ||
      body.notes !== undefined ||
      body.dueAt !== undefined ||
      body.remindAt !== undefined;
    if (editsContent && !isOwner) throw forbidden('Only the person who asked can change this.');
    if (body.status) {
      const assigneeOnly = ['accepted', 'declined'].includes(body.status);
      if (assigneeOnly && !(isAssignee && t.shared && !isOwner))
        throw badRequest('Only the person asked can accept or decline.');
      if (body.status === 'cancelled' && !isOwner)
        throw forbidden('Only the person who asked can cancel.');
      if (body.status === 'done' && !isOwner && !isAssignee) throw forbidden();
    }
    const done = body.status === 'done';
    const updated = await ctx.db
      .updateTable('tasks')
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.dueAt !== undefined ? { due_at: body.dueAt } : {}),
        ...(body.dueHasTime !== undefined ? { due_has_time: body.dueHasTime } : {}),
        ...(body.remindAt !== undefined ? { remind_at: body.remindAt, reminded_at: null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(done
          ? { completed_at: ctx.now(), completed_by: me }
          : body.status === 'open'
            ? { completed_at: null, completed_by: null }
            : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await recordEvent(ctx.db, done ? 'task.completed' : 'task.updated', me, {
      taskId: id,
      status: updated.status,
    });
    await ctx.bus.publish(audienceOf(t), { type: 'task.updated', data: { id } });
    if (t.shared && body.status && !isOwner) {
      // The person who asked hears back; their waiting item resolves with it (R13).
      const who = await ctx.db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', me)
        .executeTakeFirstOrThrow();
      const verb = {
        done: 'finished',
        accepted: 'accepted',
        declined: 'declined',
        open: 'reopened',
        cancelled: 'cancelled',
      }[body.status];
      await notify(ctx, {
        userId: t.owner_id,
        kind: 'waiting_resolved',
        level: body.status === 'done' ? 'attention' : 'activity',
        title: `${who.display_name} ${verb} your request`,
        body: t.title,
        data: { taskId: id, conversationId: t.conversation_id },
      });
    }
    await syncRequestCard(ctx, updated);
    return { task: (await taskViews(ctx, [updated], me))[0] };
  });

  app.delete('/tasks/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const t = await visibleTask(ctx, auth.userId, id);
    if (t.owner_id !== auth.userId)
      throw forbidden('Only the person who created this can delete it.');
    await ctx.db.deleteFrom('tasks').where('id', '=', id).execute();
    await ctx.bus.publish(audienceOf(t), {
      type: 'task.deleted',
      data: { id },
    });
    return { ok: true };
  });

  // --- Decisions (PRD §30) ------------------------------------------------------------------

  app.get('/decisions', async (req): Promise<{ decisions: DecisionView[] }> => {
    const auth = requireAuth(req);
    const q = parse(
      z.object({
        conversationId: z.string().uuid().optional(),
        contextId: z.string().uuid().optional(),
        q: z.string().trim().max(200).optional(),
      }),
      req.query,
    );
    const rows = await ctx.db
      .selectFrom('decisions as d')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'd.conversation_id').on('p.user_id', '=', auth.userId),
      )
      .leftJoin('users as u', 'u.id', 'd.decided_by')
      .selectAll('d')
      .select(['u.display_name as decided_by_name'])
      .where('p.left_at', 'is', null)
      .where('d.status', '=', 'active')
      .$if(Boolean(q.conversationId), (qb) => qb.where('d.conversation_id', '=', q.conversationId!))
      .$if(Boolean(q.contextId), (qb) => qb.where('d.context_id', '=', q.contextId!))
      .$if(Boolean(q.q), (qb) =>
        qb.where(sql<boolean>`d.search @@ websearch_to_tsquery('simple', ${q.q})`),
      )
      .orderBy('d.decided_at', 'desc')
      .limit(200)
      .execute();
    return {
      decisions: rows.map((d) => ({
        id: d.id,
        conversationId: d.conversation_id,
        messageId: d.message_id,
        contextId: d.context_id,
        title: d.title,
        notes: d.notes,
        decidedBy: d.decided_by ? { id: d.decided_by, displayName: d.decided_by_name } : null,
        decidedAt: d.decided_at.toISOString(),
      })),
    };
  });

  app.post('/decisions', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateDecisionBody, req.body);
    await membership(ctx, auth.userId, body.conversationId);
    const d = await ctx.db.transaction().execute((trx) =>
      createDecision(trx, ctx, {
        conversationId: body.conversationId,
        messageId: body.messageId ?? null,
        title: body.title,
        notes: body.notes ?? null,
        recordedBy: auth.userId,
        contextId: body.contextId ?? null,
      }),
    );
    await sendSystem(ctx, body.conversationId, auth.userId, 'decision_recorded', {
      decisionId: d.id,
      title: d.title,
    });
    await ctx.bus.publish(
      (await participantsOf(ctx.db, body.conversationId)).map((p) => p.user_id),
      { type: 'decision.created', data: { id: d.id, conversationId: body.conversationId } },
    );
    reply.status(201);
    return { id: d.id };
  });

  app.patch('/decisions/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z
        .object({
          title: z.string().trim().min(1).max(300).optional(),
          notes: z.string().trim().max(4000).nullable().optional(),
          status: z.enum(['active', 'reversed']).optional(),
        })
        .strict(),
      req.body,
    );
    const d = await ctx.db
      .selectFrom('decisions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!d) throw notFound('That decision');
    await membership(ctx, auth.userId, d.conversation_id);
    await ctx.db.updateTable('decisions').set(body).where('id', '=', id).execute();
    await ctx.bus.publish(
      (await participantsOf(ctx.db, d.conversation_id)).map((p) => p.user_id),
      { type: 'decision.updated', data: { id } },
    );
    return { ok: true };
  });
}
