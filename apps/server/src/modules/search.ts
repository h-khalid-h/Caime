/**
 * Search as a communication knowledge layer (PRD §25): people, relationships, organizations,
 * messages, meaning-shaped questions, assets, actions and contexts, from one box.
 */

import type { SearchResponse, SearchResults } from '@caishy/core';
import { type ParsedQuery, parseSearchQuery } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { fileView } from '../lib/messages';
import { personViewsFor } from '../lib/people-batch';
import { relationshipView } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { taskViews } from './actions';

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Resolve a name in the query to people the searcher knows (connections or conversation partners). */
async function resolvePeople(ctx: AppContext, me: string, name: string): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('users as u')
    .leftJoin('connection_sides as s', (j) =>
      j.onRef('s.other_id', '=', 'u.id').on('s.owner_id', '=', me),
    )
    .select('u.id')
    .where('u.id', '<>', me)
    .where((eb) =>
      eb.or([
        eb('u.display_name', 'ilike', like(name)),
        eb('s.nickname', 'ilike', like(name)),
        sql<boolean>`u.handle::text ilike ${`${name.replace(/^@/, '')}%`}`,
      ]),
    )
    .where((eb) =>
      eb.or([
        eb('s.owner_id', 'is not', null),
        eb.exists(
          eb
            .selectFrom('participants as a')
            .innerJoin('participants as b', 'b.conversation_id', 'a.conversation_id')
            .select('a.conversation_id')
            .where('a.user_id', '=', me)
            .whereRef('b.user_id', '=', 'u.id'),
        ),
      ]),
    )
    .limit(10)
    .execute();
  return rows.map((r) => r.id);
}

export async function runSearch(
  ctx: AppContext,
  me: string,
  parsed: ParsedQuery,
  limit = 20,
): Promise<SearchResponse> {
  const scope = parsed.scope;
  const want = (s: ParsedQuery['scope']) => scope === 'all' || scope === s;
  const personIds = parsed.person ? await resolvePeople(ctx, me, parsed.person) : null;
  const text = parsed.text;
  const results: SearchResults = {};

  if (want('people') && (text || parsed.relationship)) {
    const rels = await ctx.db
      .selectFrom('relationships as r')
      .innerJoin('users as u', 'u.id', 'r.subject_id')
      .leftJoin('connection_sides as s', (j) =>
        j.onRef('s.other_id', '=', 'r.subject_id').on('s.owner_id', '=', me),
      )
      .selectAll('r')
      .where('r.owner_id', '=', me)
      .where('r.status', '=', 'active')
      .where('u.deleted_at', 'is', null)
      .$if(Boolean(parsed.relationship), (qb) =>
        qb
          .where('r.sphere', '=', parsed.relationship!.sphere)
          .$if(Boolean(parsed.relationship!.role), (q2) =>
            q2.where('r.role', '=', parsed.relationship!.role!),
          ),
      )
      .$if(Boolean(text) && !parsed.relationship, (qb) =>
        qb.where((eb) =>
          eb.or([
            eb('u.display_name', 'ilike', like(text)),
            eb('s.nickname', 'ilike', like(text)),
            eb('r.org_name', 'ilike', like(text)),
            eb('r.role_label', 'ilike', like(text)),
            sql<boolean>`u.handle::text ilike ${`${text.replace(/^@/, '')}%`}`,
          ]),
        ),
      )
      .orderBy('r.is_primary', 'desc')
      .limit(limit * 2)
      .execute();
    // Connections without a relationship still match by name.
    const unclassified =
      !parsed.relationship && text
        ? await ctx.db
            .selectFrom('connection_sides as s')
            .innerJoin('connections as c', 'c.id', 's.connection_id')
            .innerJoin('users as u', 'u.id', 's.other_id')
            .select('u.id')
            .where('s.owner_id', '=', me)
            .where('c.status', '=', 'active')
            .where((eb) =>
              eb.or([
                eb('u.display_name', 'ilike', like(text)),
                eb('s.nickname', 'ilike', like(text)),
              ]),
            )
            .limit(limit)
            .execute()
        : [];
    const ids = [
      ...new Set([...rels.map((r) => r.subject_id), ...unclassified.map((u) => u.id)]),
    ].slice(0, limit);
    const views = await personViewsFor(ctx, me, ids);
    results.people = ids.flatMap((id) => {
      const person = views.get(id);
      if (!person) return [];
      const rel =
        rels.find((r) => r.subject_id === id && r.is_primary) ??
        rels.find((r) => r.subject_id === id);
      return [{ person, relationship: rel ? relationshipView(rel) : null }];
    });
    // Organizations are the "org" part of relationships: "DATA C" finds everyone there.
    if (text && !parsed.relationship) {
      const orgs = await ctx.db
        .selectFrom('relationships')
        .select(['org_name', sql<number>`count(distinct subject_id)::int`.as('people')])
        .where('owner_id', '=', me)
        .where('status', '=', 'active')
        .where('org_name', 'ilike', like(text))
        .groupBy('org_name')
        .limit(5)
        .execute();
      results.organizations = orgs.map((o) => ({ name: o.org_name, people: o.people }));
    }
  }

  if (want('messages') && (text || personIds)) {
    if (personIds && personIds.length === 0) results.messages = [];
    else {
      const rows = await ctx.db
        .selectFrom('messages as m')
        .innerJoin('participants as p', (j) =>
          j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', me),
        )
        .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
        .leftJoin('users as u', 'u.id', 'm.sender_id')
        .select([
          'm.id',
          'm.conversation_id',
          'm.seq',
          'm.sender_id',
          'm.created_at',
          'u.display_name as sender_name',
          'c.title as conversation_title',
          'c.kind as conversation_kind',
          text
            ? sql<string>`ts_headline('simple', coalesce(m.body, ''), websearch_to_tsquery('simple', ${text}), 'StartSel=«,StopSel=»,MaxWords=18,MinWords=6')`.as(
                'snippet',
              )
            : sql<string>`left(coalesce(m.body, ''), 140)`.as('snippet'),
        ])
        .where('p.left_at', 'is', null)
        .where('m.deleted_at', 'is', null)
        .where('c.privacy_class', '=', 'standard')
        .where('m.kind', '<>', 'system')
        .$if(Boolean(text), (qb) =>
          qb.where((eb) =>
            eb.or([
              sql<boolean>`m.search @@ websearch_to_tsquery('simple', ${text})`,
              eb('m.body', 'ilike', like(text)),
            ]),
          ),
        )
        .$if(Boolean(personIds?.length), (qb) => qb.where('m.sender_id', 'in', personIds!))
        .orderBy('m.created_at', 'desc')
        .limit(limit)
        .execute();
      results.messages = rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        seq: Number(r.seq),
        senderId: r.sender_id,
        senderName: r.sender_name,
        conversationTitle: r.conversation_kind === 'direct' ? null : r.conversation_title,
        snippet: r.snippet,
        createdAt: r.created_at.toISOString(),
      }));
    }
  }

  if (want('files') || want('links')) {
    const kinds =
      scope === 'links'
        ? ['link']
        : scope === 'files'
          ? parsed.fileKind === 'image'
            ? ['photo']
            : parsed.fileKind === 'video'
              ? ['video']
              : parsed.fileKind === 'audio'
                ? ['audio']
                : parsed.fileKind === 'document' || parsed.fileKind === 'pdf'
                  ? ['document']
                  : ['photo', 'video', 'audio', 'document']
          : ['photo', 'video', 'audio', 'document', 'link'];
    if (personIds && personIds.length === 0) results.files = [];
    else if (scope !== 'all' || text) {
      const rows = await ctx.db
        .selectFrom('assets as a')
        .innerJoin('participants as p', (j) =>
          j.onRef('p.conversation_id', '=', 'a.conversation_id').on('p.user_id', '=', me),
        )
        .leftJoin('files as f', 'f.id', 'a.file_id')
        .select([
          'a.id',
          'a.kind',
          'a.url',
          'a.host',
          'a.title',
          'a.conversation_id',
          'a.message_id',
          'a.sender_id',
          'a.created_at',
          'f.id as file_id',
          'f.name',
          'f.mime',
          'f.size',
          'f.kind as file_kind',
          'f.width',
          'f.height',
          'f.duration_ms',
          'f.thumb_key',
        ])
        .where('a.kind', 'in', kinds as never)
        .where('p.left_at', 'is', null)
        .$if(parsed.fileKind === 'pdf', (qb) => qb.where('f.mime', '=', 'application/pdf'))
        .$if(Boolean(personIds?.length), (qb) => qb.where('a.sender_id', 'in', personIds!))
        .$if(Boolean(text) && scope === 'all', (qb) =>
          qb.where((eb) =>
            eb.or([eb('a.title', 'ilike', like(text)), eb('a.url', 'ilike', like(text))]),
          ),
        )
        .orderBy('a.created_at', 'desc')
        .limit(limit)
        .execute();
      results.files = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        url: r.url,
        host: r.host,
        title: r.title,
        conversationId: r.conversation_id,
        messageId: r.message_id,
        senderId: r.sender_id,
        createdAt: r.created_at.toISOString(),
        file: r.file_id
          ? fileView({
              id: r.file_id,
              name: r.name!,
              mime: r.mime!,
              size: r.size!,
              kind: r.file_kind!,
              width: r.width,
              height: r.height,
              duration_ms: r.duration_ms,
              thumb_key: r.thumb_key,
            })
          : null,
      }));
    }
  }

  if (want('tasks') || want('waiting') || (scope === 'all' && text)) {
    let q = ctx.db
      .selectFrom('tasks')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('owner_id', '=', me),
          eb.and([eb('assignee_id', '=', me), eb('shared', '=', true)]),
        ]),
      )
      .where('status', 'in', ['open', 'accepted']);
    if (scope === 'waiting')
      q = q.where('owner_id', '=', me).where('assignee_id', 'is distinct from', me);
    if (personIds) {
      if (personIds.length === 0) q = q.where(sql<boolean>`false`);
      else if (parsed.direction === 'asked_me' || scope === 'tasks') {
        // "Things Sarah asked me to do": her requests, and my tasks that came from her messages.
        q = q.where((eb) =>
          eb.or([
            eb.and([eb('owner_id', 'in', personIds), eb('assignee_id', '=', me)]),
            eb.and([
              eb('owner_id', '=', me),
              eb('assignee_id', '=', me),
              eb.exists(
                eb
                  .selectFrom('messages')
                  .select('id')
                  .whereRef('messages.id', '=', 'tasks.message_id')
                  .where('messages.sender_id', 'in', personIds),
              ),
            ]),
          ]),
        );
      } else if (parsed.direction === 'i_asked' || scope === 'waiting')
        q = q.where('assignee_id', 'in', personIds);
    }
    if (text && scope === 'all')
      q = q.where(sql<boolean>`search @@ websearch_to_tsquery('simple', ${text})`);
    const rows = await q.orderBy(sql`due_at`, sql`asc nulls last`).limit(limit).execute();
    results.tasks = await taskViews(ctx, rows, me);
  }

  if (want('decisions') || (scope === 'all' && text)) {
    const rows = await ctx.db
      .selectFrom('decisions as d')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'd.conversation_id').on('p.user_id', '=', me),
      )
      .select(['d.id', 'd.title', 'd.conversation_id', 'd.message_id', 'd.decided_at'])
      .where('d.status', '=', 'active')
      .$if(Boolean(text), (qb) =>
        qb.where((eb) =>
          eb.or([
            sql<boolean>`d.search @@ websearch_to_tsquery('simple', ${text})`,
            eb('d.title', 'ilike', like(text)),
          ]),
        ),
      )
      .orderBy('d.decided_at', 'desc')
      .limit(limit)
      .execute();
    results.decisions = rows.map((d) => ({
      id: d.id,
      title: d.title,
      conversationId: d.conversation_id,
      messageId: d.message_id,
      decidedAt: d.decided_at.toISOString(),
    }));
  }

  if ((want('contexts') || scope === 'all') && text) {
    const rows = await ctx.db
      .selectFrom('conversations as c')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', me),
      )
      .leftJoin('contexts as x', 'x.id', 'c.context_id')
      .select([
        'c.id',
        'c.title',
        'c.kind',
        'x.title as context_title',
        'x.kind as context_kind',
        'c.last_message_at',
      ])
      .where('p.left_at', 'is', null)
      .where((eb) =>
        eb.or([eb('c.title', 'ilike', like(text)), eb('x.title', 'ilike', like(text))]),
      )
      .orderBy('c.last_message_at', sql`desc nulls last`)
      .limit(limit)
      .execute();
    results.contexts = rows.map((r) => ({
      conversationId: r.id,
      title: r.title ?? r.context_title,
      kind: r.kind,
      context: r.context_title ? { title: r.context_title, kind: r.context_kind } : null,
    }));
  }

  return { query: parsed, interpretation: parsed.interpretation, results };
}

export async function searchRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/search', async (req) => {
    const auth = requireAuth(req);
    const { q, limit } = parse(
      z.object({
        q: z.string().trim().min(1).max(200),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      req.query,
    );
    ctx.limiter.hit(`search:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    return runSearch(ctx, auth.userId, parseSearchQuery(q), limit);
  });
}
