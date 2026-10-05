/**
 * Connect Kits an organization's app makes (PRD §74, §86 "Custom"). The app keeps its kinds of
 * card here through its token (`kits`); the organization's team sends them from a customer's
 * conversation, and the app sends them, moves them and changes what they say. What a kit is,
 * and every check on one, is core's custom-kits.ts.
 */
import {
  CUSTOM_KIT_LIMITS,
  customTitle,
  isCustomCard,
  mergeCustomFields,
  parseCustomKit,
  uuidv7,
} from '@caime/core';
import type {
  AppKitResponse,
  AppKitsResponse,
  CustomKitsResponse,
  MessageResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS } from '../db/schema';
import { audit } from '../lib/audit';
import { assertCanWrite } from '../lib/blocks';
import { customerMask } from '../lib/business';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { appKitView } from '../lib/kits';
import { messageViews, participantsOf } from '../lib/messages';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership } from './conversations';

const keyParam = z.object({ key: z.string().max(40) });
const idParam = z.object({ id: z.string().uuid() });

/** Only an app's own token keeps its kits: never a person, whoever they are. */
function appOf(req: FastifyRequest) {
  const auth = requireAuth(req);
  if (!auth.app) throw forbidden(tr('Only an app’s token does this.'));
  return { auth, app: auth.app };
}

export async function kitRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/kits', async (req): Promise<AppKitsResponse> => {
    const { app: me } = appOf(req);
    const rows = await ctx.db
      .selectFrom('app_kits')
      .select(['definition', 'created_at', 'updated_at'])
      .where('app_id', '=', me.id)
      .orderBy('created_at')
      .orderBy('key')
      .execute();
    return { kits: rows.map(appKitView) };
  });

  // Made, or replaced whole. Cards already sent keep the kit they were sent with.
  app.put('/kits/:key', async (req, reply): Promise<AppKitResponse> => {
    const { auth, app: me } = appOf(req);
    const { key } = parse(keyParam, req.params);
    const parsed = parseCustomKit(key, req.body);
    if (!parsed.ok) throw badRequest(parsed.error);
    ctx.limiter.hit(`kits:${me.id}`, ctx.config.isTest ? 10_000 : 120, 60 * 60_000);
    const row = await ctx.db.transaction().execute(async (trx) => {
      // One at a time for each app, so two at once never pass its limit.
      await sql`select pg_advisory_xact_lock(hashtext(${`kits:${me.id}`}))`.execute(trx);
      const existing = await trx
        .selectFrom('app_kits')
        .select('id')
        .where('app_id', '=', me.id)
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing)
        return {
          created: false,
          row: await trx
            .updateTable('app_kits')
            .set({ definition: JSON.stringify(parsed.def), updated_at: ctx.now() })
            .where('id', '=', existing.id)
            .returning(['definition', 'created_at', 'updated_at'])
            .executeTakeFirstOrThrow(),
        };
      const { n } = await trx
        .selectFrom('app_kits')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('app_id', '=', me.id)
        .executeTakeFirstOrThrow();
      if (Number(n) >= CUSTOM_KIT_LIMITS.perApp)
        throw new AppError(
          409,
          'limit',
          tr('An app has up to {perApp} kinds of card. Remove one to make another.', {
            perApp: CUSTOM_KIT_LIMITS.perApp,
          }),
        );
      return {
        created: true,
        row: await trx
          .insertInto('app_kits')
          .values({
            id: uuidv7(),
            app_id: me.id,
            org_id: me.orgId,
            key,
            definition: JSON.stringify(parsed.def),
          })
          .returning(['definition', 'created_at', 'updated_at'])
          .executeTakeFirstOrThrow(),
      };
    });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'app.kit_saved',
      target: me.id,
      metadata: { orgId: me.orgId, key },
    });
    if (row.created) reply.status(201);
    return { kit: appKitView(row.row) };
  });

  app.delete('/kits/:key', async (req): Promise<OkResponse> => {
    const { auth, app: me } = appOf(req);
    const { key } = parse(keyParam, req.params);
    const gone = await ctx.db
      .deleteFrom('app_kits')
      .where('app_id', '=', me.id)
      .where('key', '=', key)
      .returning('id')
      .executeTakeFirst();
    if (!gone) throw notFound(tr('That kit'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'app.kit_removed',
      target: me.id,
      metadata: { orgId: me.orgId, key },
    });
    return { ok: true };
  });

  /**
   * The kinds of card someone on the organization's team may send in a customer's conversation:
   * its apps' own, while they're connected, and none about money when the customer is under 18.
   */
  app.get('/conversations/:id/kits', async (req): Promise<CustomKitsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await membership(ctx, auth.userId, id);
    const mask = await customerMask(ctx.db, id);
    if (!mask || mask.customerId === auth.userId) return { kits: [] };
    const rows = await ctx.db
      .selectFrom('app_kits as k')
      .innerJoin('org_apps as a', 'a.id', 'k.app_id')
      .select(['k.definition', 'a.id as app_id', 'a.name as app_name'])
      .where('a.org_id', '=', mask.orgId)
      .where('a.revoked_at', 'is', null)
      .orderBy('a.created_at')
      .orderBy('k.created_at')
      .orderBy('k.key')
      .execute();
    if (!rows.length) return { kits: [] };
    const people = await ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['u.birth_date', 'u.time_zone'])
      .where('p.conversation_id', '=', id)
      .where('p.left_at', 'is', null)
      .execute();
    const minor = people.some((u) => minorOf(u, ctx.now()));
    return {
      kits: rows
        .filter((r) => !(minor && r.definition.adultsOnly))
        .map((r) => ({
          app: { id: r.app_id, name: r.app_name },
          key: r.definition.key,
          name: r.definition.name,
          description: r.definition.description,
          icon: r.definition.icon,
          fields: r.definition.fields,
        })),
    };
  });

  /**
   * What one of an app's cards says, changed by the app (a delivery's new time, a tracking
   * number): the fields it names, checked against the card's own kit. Where the card stands
   * changes only by a move.
   */
  app.patch('/messages/:id/kit', async (req): Promise<MessageResponse> => {
    const { auth, app: me } = appOf(req);
    const { id } = parse(idParam, req.params);
    const { fields } = parse(z.object({ fields: z.record(z.string(), z.unknown()) }), req.body);
    const m = await ctx.db
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, m.conversation_id);
    const card = m.payload;
    if (m.kind !== 'kit' || m.deleted_at || !isCustomCard(card))
      throw badRequest(tr('That isn’t one of an app’s cards.'));
    if (card.app.id !== me.id) throw forbidden(tr('An app changes only its own cards.'));
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    // One change at a time (the card's row is locked, and read again under the lock), so two at
    // once never undo each other, and none is written into a card taken back meanwhile.
    const updated = await ctx.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('messages')
        .select(['deleted_at', 'payload'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      const now = row?.payload;
      if (!row || row.deleted_at || !isCustomCard(now))
        throw badRequest(tr('That isn’t one of an app’s cards.'));
      const merged = mergeCustomFields(now.def, now.fields, fields);
      if (!merged.ok) throw badRequest(merged.error);
      return trx
        .updateTable('messages')
        .set({
          // Merged, so where the card stands (a move's) is kept as it is.
          payload: sql`payload || ${JSON.stringify({
            fields: merged.fields,
            title: customTitle({ name: now.label, fields: now.def.fields }, merged.fields),
          })}::jsonb`,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
    const [view] = await messageViews(ctx.db, [updated], auth.userId);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    return { message: view! };
  });
}
