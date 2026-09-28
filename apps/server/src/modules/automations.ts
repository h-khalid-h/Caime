/**
 * Automations and what's saved (PRD §69). Automations are set up here by the person they act for
 * (lib/automations.ts runs them); a message, or one file or link of it, is saved by hand from its
 * actions. What's saved is listed only while its owner can still see it where it was said.
 */
import {
  AUTOMATIONS_MAX,
  AutomationBody,
  AutomationPatch,
  type AutomationView,
  collectionName,
  MoveSavedBody,
  RenameCollectionBody,
  SAVED_DEFAULT,
  SAVED_MAX,
  SaveBody,
  type SavedCollectionsResponse,
  type SavedCollectionView,
  type SavedItemsResponse,
  uuidv7,
  wordsFrom,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { automationView, lockSaved, savedCount, visibleSaved } from '../lib/automations';
import { maskId, masksFor } from '../lib/business';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { fileView } from '../lib/messages';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Stands in for "the whole message" where a saved item's file or link is compared. */
const NO_ASSET = '00000000-0000-0000-0000-000000000000';

/** A kept name is tidied, and the words typed together are split and deduplicated. */
function tidyWhen(when: z.infer<typeof AutomationBody>['when']) {
  return {
    scope_sphere: when.sphere ?? null,
    scope_role: when.sphere ? (when.role ?? null) : null,
    kinds: [...new Set(when.kinds)],
    words: wordsFrom((when.words ?? []).join(',')),
  };
}

/**
 * A collection by the name the person already has for it, whatever its case or spacing
 * ("customer files" is their "Customer Files"), else as it's written: never the same one twice.
 */
async function theirCollection(
  db: AppContext['db'],
  userId: string,
  typed: string | null | undefined,
): Promise<string> {
  const name = collectionName(typed);
  const same = sql<boolean>`lower(collection) = ${name.toLowerCase()}`;
  const had =
    (await db
      .selectFrom('saved_items')
      .select(sql<string>`min(collection)`.as('collection'))
      .where('user_id', '=', userId)
      .where(same)
      .executeTakeFirst()) ?? null;
  if (had?.collection) return had.collection;
  const set = await db
    .selectFrom('automations')
    .select(sql<string>`min(collection)`.as('collection'))
    .where('user_id', '=', userId)
    .where(same)
    .executeTakeFirst();
  return set?.collection ?? name;
}

export async function automationRoutes(app: FastifyInstance, ctx: AppContext) {
  const changed = (userId: string) =>
    ctx.bus.publish([userId], { type: 'automations.changed', data: {} });
  const savedChanged = (userId: string) =>
    ctx.bus.publish([userId], { type: 'saved.changed', data: {} });

  // --- Automations --------------------------------------------------------------------------

  app.get('/automations', async (req): Promise<{ automations: AutomationView[] }> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('automations')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return { automations: rows.map(automationView) };
  });

  app.post('/automations', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(AutomationBody, req.body);
    const id = uuidv7();
    // Counted and added one at a time for each person, so the most holds with two at once.
    await ctx.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`automations:${auth.userId}`}))`.execute(
        trx,
      );
      const { n } = await trx
        .selectFrom('automations')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('user_id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      if (n >= AUTOMATIONS_MAX)
        throw conflict(
          'too_many_automations',
          `You have ${AUTOMATIONS_MAX} automations. Remove one to add another.`,
        );
      await trx
        .insertInto('automations')
        .values({
          id,
          user_id: auth.userId,
          name: body.name?.trim() || null,
          ...tidyWhen(body.when),
          collection: await theirCollection(trx, auth.userId, body.collection),
          enabled: body.enabled ?? true,
          created_at: ctx.now(),
          updated_at: ctx.now(),
        })
        .execute();
    });
    await changed(auth.userId);
    reply.status(201);
    return { id };
  });

  app.patch('/automations/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(AutomationPatch, req.body);
    const collection =
      body.collection !== undefined
        ? await theirCollection(ctx.db, auth.userId, body.collection)
        : undefined;
    const res = await ctx.db
      .updateTable('automations')
      .set({
        ...(body.name !== undefined ? { name: body.name?.trim() || null } : {}),
        ...(body.when ? tidyWhen(body.when) : {}),
        ...(collection !== undefined ? { collection } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound('That automation');
    await changed(auth.userId);
    return { ok: true };
  });

  app.delete('/automations/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const res = await ctx.db
      .deleteFrom('automations')
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw notFound('That automation');
    // What it saved stays saved.
    await changed(auth.userId);
    return { ok: true };
  });

  // --- What's saved -------------------------------------------------------------------------

  /** Saved items their owner can still see (lib/automations.ts). */
  const visible = (userId: string) => visibleSaved(ctx.db, userId);

  app.get('/saved', async (req): Promise<SavedCollectionsResponse> => {
    const auth = requireAuth(req);
    const [rows, named, total] = await Promise.all([
      visible(auth.userId)
        .select([
          's.collection',
          sql<number>`count(*)::int`.as('n'),
          sql<Date>`max(s.created_at)`.as('latest'),
        ])
        .groupBy('s.collection')
        .execute(),
      ctx.db
        .selectFrom('automations')
        .select(['collection', sql<number>`count(*)::int`.as('n')])
        .where('user_id', '=', auth.userId)
        .groupBy('collection')
        .execute(),
      savedCount(ctx.db, auth.userId),
    ]);
    const byName = new Map<string, SavedCollectionView>(
      rows.map((r) => [
        r.collection,
        { name: r.collection, count: r.n, latestAt: r.latest.toISOString(), automations: 0 },
      ]),
    );
    // A collection an automation saves to is there before it has anything in it.
    for (const a of named) {
      const c = byName.get(a.collection) ?? {
        name: a.collection,
        count: 0,
        latestAt: null,
        automations: 0,
      };
      c.automations = a.n;
      byName.set(a.collection, c);
    }
    const collections = [...byName.values()].sort(
      (a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? '') || a.name.localeCompare(b.name),
    );
    return { collections, total, max: SAVED_MAX };
  });

  app.get('/saved/items', async (req): Promise<SavedItemsResponse> => {
    const auth = requireAuth(req);
    const { collection, before, limit } = parse(
      z.object({
        collection: z.string().trim().min(1).max(60).optional(),
        before: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
      req.query,
    );
    const rows = await visible(auth.userId)
      .innerJoin('conversations as c', 'c.id', 's.conversation_id')
      .leftJoin('users as u', 'u.id', 'm.sender_id')
      .leftJoin('assets as a', 'a.id', 's.asset_id')
      .select([
        's.id',
        's.collection',
        's.created_at',
        's.automation_id',
        's.asset_id',
        'c.id as conversation_id',
        'c.kind as conversation_kind',
        'c.title as conversation_title',
        'm.id as message_id',
        'm.seq',
        'm.kind as message_kind',
        'm.sender_id',
        'm.body',
        'm.created_at as message_at',
        'u.display_name as sender_name',
        'a.kind as asset_kind',
        'a.file_id as asset_file_id',
        'a.url as asset_url',
        'a.host as asset_host',
        'a.title as asset_title',
      ])
      .$if(Boolean(collection), (qb) => qb.where('s.collection', '=', collectionName(collection)))
      .$if(Boolean(before), (qb) => qb.where('s.id', '<', before!))
      .orderBy('s.id', 'desc')
      .limit(limit + 1)
      .execute();
    const page = rows.slice(0, limit);
    // The files kept: the one saved, or all of a message saved whole.
    const whole = page.filter((r) => !r.asset_id).map((r) => r.message_id);
    const single = page.map((r) => r.asset_file_id).filter((f): f is string => Boolean(f));
    const files = await ctx.db
      .selectFrom('files as f')
      .leftJoin('message_files as mf', 'mf.file_id', 'f.id')
      .select([
        'f.id',
        'f.name',
        'f.mime',
        'f.size',
        'f.kind',
        'f.width',
        'f.height',
        'f.duration_ms',
        'f.thumb_key',
        'mf.message_id',
        'mf.position',
      ])
      .where((w) =>
        w.or([
          whole.length ? w('mf.message_id', 'in', whole) : sql<boolean>`false`,
          single.length ? w('f.id', 'in', single) : sql<boolean>`false`,
        ]),
      )
      .orderBy('mf.position', 'asc')
      .execute();
    const masks = await masksFor(
      ctx,
      auth.userId,
      page.filter((r) => r.conversation_kind === 'business').map((r) => r.conversation_id),
    );
    return {
      nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      items: page.map((r) => {
        const mask = masks.get(r.conversation_id);
        const masked = mask && r.sender_id !== auth.userId;
        const kept = r.asset_id
          ? files.filter((f) => f.id === r.asset_file_id)
          : files.filter((f) => f.message_id === r.message_id);
        return {
          id: r.id,
          collection: r.collection,
          savedAt: r.created_at.toISOString(),
          automationId: r.automation_id,
          conversation: {
            id: r.conversation_id,
            kind: r.conversation_kind,
            title: mask
              ? mask.orgName
              : r.conversation_kind === 'direct'
                ? null
                : r.conversation_title,
          },
          message: {
            id: r.message_id,
            seq: Number(r.seq),
            kind: r.message_kind,
            senderId: mask ? maskId(mask, r.sender_id) : r.sender_id,
            senderName: masked ? mask.orgName : r.sender_name,
            body: r.body,
            createdAt: r.message_at.toISOString(),
          },
          files: [...new Map(kept.map((f) => [f.id, fileView(f)])).values()],
          link:
            r.asset_kind === 'link' && r.asset_url
              ? { url: r.asset_url, host: r.asset_host, title: r.asset_title }
              : null,
        };
      }),
    };
  });

  app.post('/messages/:id/save', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(SaveBody, req.body ?? {});
    const m = await ctx.db
      .selectFrom('messages as m')
      .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', auth.userId),
      )
      .select([
        'm.id',
        'm.kind',
        'm.conversation_id',
        'm.deleted_at',
        'c.privacy_class',
        'p.left_at',
        'p.request_state',
      ])
      .where('m.id', '=', id)
      .executeTakeFirst();
    if (!m || m.deleted_at || m.left_at) throw notFound('That message');
    if (m.privacy_class === 'private')
      throw forbidden('A private conversation keeps to itself: nothing in it is saved elsewhere.');
    if (m.request_state === 'pending' || m.request_state === 'declined')
      throw new AppError(
        403,
        'awaiting_acceptance',
        'Accept the message request to save anything from it.',
      );
    if (m.kind === 'system') throw badRequest('A line about the conversation isn’t saved.');
    const hidden = await ctx.db
      .selectFrom('hidden_messages')
      .select('message_id')
      .where('message_id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (hidden) throw notFound('That message');
    if (body.assetId) {
      const asset = await ctx.db
        .selectFrom('assets')
        .select('id')
        .where('id', '=', body.assetId)
        .where('message_id', '=', id)
        .executeTakeFirst();
      if (!asset) throw notFound('That file');
    }
    ctx.limiter.hit(`save:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 60_000);
    const collection = await theirCollection(ctx.db, auth.userId, body.collection ?? SAVED_DEFAULT);
    const find = () =>
      ctx.db
        .selectFrom('saved_items')
        .select('id')
        .where('user_id', '=', auth.userId)
        .where('collection', '=', collection)
        .where('message_id', '=', id)
        .where(
          sql<boolean>`coalesce(asset_id, ${NO_ASSET}::uuid) = ${body.assetId ?? NO_ASSET}::uuid`,
        )
        .executeTakeFirst();
    const existing = await find();
    if (existing) return { id: existing.id, collection, existing: true };
    // Counted and added under the person's lock, so saving on two devices at once can't pass
    // the most there's room for.
    const inserted = await ctx.db.transaction().execute(async (trx) => {
      await lockSaved(trx, auth.userId);
      if ((await savedCount(trx, auth.userId)) >= SAVED_MAX)
        throw conflict(
          'saved_full',
          `You’ve saved ${SAVED_MAX} things, the most there’s room for. Remove some to save more.`,
        );
      return trx
        .insertInto('saved_items')
        .values({
          id: uuidv7(),
          user_id: auth.userId,
          collection,
          conversation_id: m.conversation_id,
          message_id: id,
          asset_id: body.assetId ?? null,
          created_at: ctx.now(),
        })
        .onConflict((oc) => oc.doNothing())
        .returning('id')
        .executeTakeFirst();
    });
    // Saved at the same moment from another device: that one.
    const savedId = inserted?.id ?? (await find())?.id;
    if (!savedId) throw notFound('That message');
    await savedChanged(auth.userId);
    reply.status(inserted ? 201 : 200);
    return { id: savedId, collection, ...(inserted ? {} : { existing: true }) };
  });

  /** Moved to another collection; already there, the two are one. */
  app.patch('/saved/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { collection: to } = parse(MoveSavedBody, req.body);
    const collection = await theirCollection(ctx.db, auth.userId, to);
    const item = await ctx.db
      .selectFrom('saved_items')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (!item) throw notFound('That saved item');
    if (item.collection !== collection) {
      await ctx.db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom('saved_items')
          .where('user_id', '=', auth.userId)
          .where('collection', '=', collection)
          .where('message_id', '=', item.message_id)
          .where(
            sql<boolean>`coalesce(asset_id, ${NO_ASSET}::uuid) = ${item.asset_id ?? NO_ASSET}::uuid`,
          )
          .execute();
        await trx.updateTable('saved_items').set({ collection }).where('id', '=', id).execute();
      });
      await savedChanged(auth.userId);
    }
    return { ok: true };
  });

  app.delete('/saved/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const res = await ctx.db
      .deleteFrom('saved_items')
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw notFound('That saved item');
    await savedChanged(auth.userId);
    return { ok: true };
  });

  /** A collection renamed, its automations with it; into one that exists, the two become one. */
  app.post('/saved/collections/rename', async (req) => {
    const auth = requireAuth(req);
    const body = parse(RenameCollectionBody, req.body);
    const from = collectionName(body.from);
    // Into one they have, by its own name; renamed to its own name in another case, as asked.
    const to =
      collectionName(body.to).toLowerCase() === from.toLowerCase()
        ? collectionName(body.to)
        : await theirCollection(ctx.db, auth.userId, body.to);
    if (from === to) return { ok: true, collection: to };
    await ctx.db.transaction().execute(async (trx) => {
      // Whatever is in both stays once, where it's going.
      await sql`
        delete from saved_items a using saved_items b
        where a.user_id = ${auth.userId} and b.user_id = ${auth.userId}
          and a.collection = ${from} and b.collection = ${to} and a.message_id = b.message_id
          and coalesce(a.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(b.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)`.execute(trx);
      await trx
        .updateTable('saved_items')
        .set({ collection: to })
        .where('user_id', '=', auth.userId)
        .where('collection', '=', from)
        .execute();
      await trx
        .updateTable('automations')
        .set({ collection: to, updated_at: ctx.now() })
        .where('user_id', '=', auth.userId)
        .where('collection', '=', from)
        .execute();
    });
    await savedChanged(auth.userId);
    await changed(auth.userId);
    return { ok: true, collection: to };
  });

  /** Everything in a collection unsaved; never one an automation saves to. */
  app.delete('/saved/collections', async (req) => {
    const auth = requireAuth(req);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.query);
    const collection = collectionName(name);
    const used = await ctx.db
      .selectFrom('automations')
      .select('id')
      .where('user_id', '=', auth.userId)
      .where('collection', '=', collection)
      .executeTakeFirst();
    if (used)
      throw conflict(
        'collection_in_use',
        `An automation saves to ${collection}. Change it or remove it first.`,
      );
    await ctx.db
      .deleteFrom('saved_items')
      .where('user_id', '=', auth.userId)
      .where('collection', '=', collection)
      .execute();
    await savedChanged(auth.userId);
    return { ok: true };
  });
}
