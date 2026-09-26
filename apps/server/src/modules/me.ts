/**
 * The account owner's profile, preferences, privacy and identities (PRD §34, §35).
 */
import {
  Handle,
  IdentityBody,
  isMinor,
  isValidTimeZone,
  PrivacyBody,
  safeLocale,
  UpdateMeBody,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { UserUpdate } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { meView, privacyOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function meRoutes(app: FastifyInstance, ctx: AppContext) {
  const load = (id: string) =>
    ctx.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  app.get('/me', async (req) => {
    const auth = requireAuth(req);
    return { user: meView(await load(auth.userId), ctx.now()) };
  });

  app.patch('/me', async (req) => {
    const auth = requireAuth(req);
    const body = parse(UpdateMeBody, req.body);
    const current = await load(auth.userId);
    const patch: UserUpdate = { updated_at: ctx.now() };
    if (body.displayName !== undefined) patch.display_name = body.displayName;
    if (body.handle !== undefined && body.handle !== current.handle.toLowerCase()) {
      const taken = await ctx.db
        .selectFrom('users')
        .select('id')
        .where('handle', '=', body.handle)
        .executeTakeFirst();
      if (taken) throw conflict('handle_taken', 'That handle is taken. Try another.');
      patch.handle = body.handle;
    }
    if (body.bio !== undefined) patch.bio = body.bio;
    if (body.pronouns !== undefined) patch.pronouns = body.pronouns;
    if (body.statusText !== undefined) patch.status_text = body.statusText;
    if (body.statusEmoji !== undefined) patch.status_emoji = body.statusEmoji;
    if (body.presence !== undefined) patch.presence = body.presence;
    if (body.timeZone !== undefined) {
      if (!isValidTimeZone(body.timeZone)) throw badRequest('Unknown time zone.');
      patch.time_zone = body.timeZone;
    }
    if (body.locale !== undefined) patch.locale = safeLocale(body.locale);
    if (body.region !== undefined) patch.region = body.region;
    if (body.workweek !== undefined)
      patch.workweek = [...new Set(body.workweek)].sort((a, b) => a - b);
    if (body.quietHours !== undefined)
      patch.quiet_hours = body.quietHours ? JSON.stringify(body.quietHours) : null;
    if (body.preferences !== undefined) {
      patch.preferences = JSON.stringify({ ...(current.preferences ?? {}), ...body.preferences });
    }
    if (body.aiEnabled !== undefined) patch.ai_enabled = body.aiEnabled;
    if (body.avatarFileId !== undefined) {
      if (body.avatarFileId) {
        const file = await ctx.db
          .selectFrom('files')
          .select(['id', 'kind'])
          .where('id', '=', body.avatarFileId)
          .where('owner_id', '=', auth.userId)
          .executeTakeFirst();
        if (file?.kind !== 'image') throw badRequest('Choose an image you uploaded.');
      }
      patch.avatar_file_id = body.avatarFileId;
    }
    if (body.onboarded) patch.onboarded_at = current.onboarded_at ?? ctx.now();
    await ctx.db.updateTable('users').set(patch).where('id', '=', auth.userId).execute();
    const user = await load(auth.userId);
    await ctx.bus.publish([auth.userId], { type: 'me.updated', data: { id: auth.userId } });
    return { user: meView(user, ctx.now()) };
  });

  app.put('/me/privacy', async (req) => {
    const auth = requireAuth(req);
    const body = parse(PrivacyBody, req.body);
    const user = await load(auth.userId);
    const now = ctx.now();
    const current = privacyOf(user, now);
    const next = {
      fields: { ...current.fields, ...(body.fields ?? {}) },
      discoverByHandle: body.discoverByHandle ?? current.discoverByHandle,
      discoverByEmail: body.discoverByEmail ?? current.discoverByEmail,
      messageRequests: body.messageRequests ?? current.messageRequests,
    };
    if (isMinor(user.birth_year, now)) {
      // Protections for under-18 accounts are rules, not defaults (R29).
      next.discoverByEmail = false;
      if (next.messageRequests === 'everyone') next.messageRequests = 'shared_connections';
    }
    await ctx.db
      .updateTable('users')
      .set({ privacy: JSON.stringify(next), updated_at: now })
      .where('id', '=', auth.userId)
      .execute();
    return { privacy: next };
  });

  /**
   * Public, so sign-up can check a handle as it's typed. Handles are public identifiers, but the
   * endpoint is rate-limited per address so it can't be used to list accounts.
   */
  app.get('/me/handle-available', async (req) => {
    ctx.limiter.hit(`handle:ip:${req.ip}`, ctx.config.isTest ? 10_000 : 60, 60_000);
    const { handle } = parse(z.object({ handle: z.string().max(60) }), req.query);
    const parsed = Handle.safeParse(handle);
    if (!parsed.success)
      return {
        available: false,
        reason: parsed.error.issues[0]?.message ?? 'Invalid handle.',
        suggestion: null,
      };
    const wanted = parsed.data;
    const base = wanted.slice(0, 26);
    const candidates = [
      wanted,
      ...Array.from({ length: 6 }, () => `${base}${Math.floor(10 + Math.random() * 990)}`),
    ];
    const taken = new Set(
      (
        await ctx.db
          .selectFrom('users')
          .select('handle')
          .where('handle', 'in', candidates)
          .execute()
      ).map((r) => String(r.handle)),
    );
    if (!taken.has(wanted)) return { available: true, reason: null, suggestion: null };
    return {
      available: false,
      reason: 'That handle is taken.',
      suggestion: candidates.slice(1).find((c) => !taken.has(c)) ?? null,
    };
  });

  // --- Identities (PRD §35): how I appear to different people ---------------------------------

  app.get('/me/identities', async (req) => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('identities')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .orderBy('is_default', 'desc')
      .orderBy('created_at')
      .execute();
    return {
      identities: rows.map((i) => ({
        id: i.id,
        kind: i.kind,
        displayName: i.display_name,
        headline: i.headline,
        orgName: i.org_name,
        isDefault: i.is_default,
      })),
    };
  });

  app.post('/me/identities', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(IdentityBody, req.body);
    const count = await ctx.db
      .selectFrom('identities')
      .select(ctx.db.fn.countAll<number>().as('n'))
      .where('user_id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (Number(count.n) >= 10) throw badRequest('You can have up to 10 identities.');
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      if (body.isDefault)
        await trx
          .updateTable('identities')
          .set({ is_default: false })
          .where('user_id', '=', auth.userId)
          .execute();
      await trx
        .insertInto('identities')
        .values({
          id,
          user_id: auth.userId,
          kind: body.kind,
          display_name: body.displayName,
          headline: body.headline ?? null,
          org_name: body.orgName ?? null,
          is_default: body.isDefault ?? false,
        })
        .execute();
    });
    reply.status(201);
    return { id };
  });

  app.patch('/me/identities/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(IdentityBody.partial(), req.body);
    const existing = await ctx.db
      .selectFrom('identities')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (!existing) throw notFound('That identity');
    await ctx.db.transaction().execute(async (trx) => {
      if (body.isDefault)
        await trx
          .updateTable('identities')
          .set({ is_default: false })
          .where('user_id', '=', auth.userId)
          .execute();
      await trx
        .updateTable('identities')
        .set({
          kind: body.kind ?? existing.kind,
          display_name: body.displayName ?? existing.display_name,
          headline: body.headline !== undefined ? body.headline : existing.headline,
          org_name: body.orgName !== undefined ? body.orgName : existing.org_name,
          is_default: body.isDefault ?? existing.is_default,
        })
        .where('id', '=', id)
        .execute();
    });
    return { ok: true };
  });

  app.delete('/me/identities/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const existing = await ctx.db
      .selectFrom('identities')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (!existing) throw notFound('That identity');
    if (existing.is_default) throw badRequest('Make another identity your default first.');
    await ctx.db.deleteFrom('identities').where('id', '=', id).execute();
    return { ok: true };
  });
}
