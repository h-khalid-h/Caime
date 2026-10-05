/**
 * The account owner's profile, preferences, privacy and identities (PRD §34, §35).
 */
import {
  defaultWorkweek,
  Handle,
  IdentityBody,
  type PersonInsightsView,
  type PlanUsageView,
  PrivacyBody,
  safeLocale,
  UpdateMeBody,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { UserUpdate } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { currentZone, isCountry } from '../lib/geo';
import {
  assertHandleAvailable,
  closedOrgHolding,
  closedOrgMessage,
  HANDLE_UNAVAILABLE,
  releaseHandle,
  unavailableAmong,
} from '../lib/handles';
import { forgetLanguageOf } from '../lib/i18n';
import { personInsights } from '../lib/insights';
import { assertPersonInsights, planUsage } from '../lib/plans';
import { avatarUrl, meView, minorOf, privacyOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Insights look back 30, 90 or 365 days (a quarter by default). */
const InsightsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => d === 30 || d === 90 || d === 365, 'Choose 30, 90 or 365 days.')
    .default(90),
});

/** A zone Postgres and Intl both know, or UTC: a bad value from one device breaks nothing. */
function zoneOrUtc(zone: string | null): string {
  if (!zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

export async function meRoutes(app: FastifyInstance, ctx: AppContext) {
  const load = (id: string) =>
    ctx.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  app.get('/me', async (req) => {
    const auth = requireAuth(req);
    const user = await load(auth.userId);
    // A token sees who it acts for, not their email, privacy or plan (PRD §74).
    if (auth.grant)
      return {
        user: {
          id: user.id,
          handle: user.handle,
          displayName: user.display_name,
          avatarUrl: avatarUrl(user),
          timeZone: user.time_zone,
          locale: user.locale,
        },
      };
    return { user: meView(user, ctx.now()) };
  });

  /** Your plan, and what you've used of it today. */
  /** How your relationships are going (R47), for you only; Pro. */
  app.get('/me/insights', async (req): Promise<{ insights: PersonInsightsView }> => {
    const auth = requireAuth(req);
    await assertPersonInsights(ctx, auth.userId);
    const { days } = parse(InsightsQuery, req.query);
    const me = await ctx.db
      .selectFrom('users')
      .select('time_zone')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    return { insights: await personInsights(ctx, auth.userId, days, zoneOrUtc(me.time_zone)) };
  });

  app.get('/me/plan', async (req): Promise<PlanUsageView> => {
    const auth = requireAuth(req);
    return planUsage(ctx, auth.userId);
  });

  app.patch('/me', async (req) => {
    const auth = requireAuth(req);
    const body = parse(UpdateMeBody, req.body);
    const current = await load(auth.userId);
    const patch: UserUpdate = { updated_at: ctx.now() };
    if (body.displayName !== undefined) patch.display_name = body.displayName;
    // Their own handle stays theirs, even one reserved since they took it.
    if (body.handle !== undefined && body.handle !== current.handle.toLowerCase()) {
      await assertHandleAvailable(ctx.db, body.handle, ctx.now(), { userId: auth.userId });
      patch.handle = body.handle;
    }
    if (body.bio !== undefined) patch.bio = body.bio;
    if (body.pronouns !== undefined) patch.pronouns = body.pronouns;
    if (body.statusText !== undefined) patch.status_text = body.statusText;
    if (body.statusEmoji !== undefined) patch.status_emoji = body.statusEmoji;
    if (body.presence !== undefined) patch.presence = body.presence;
    if (body.timeZone !== undefined) {
      // By the name it has now: a device may still report an older one (Asia/Calcutta).
      const zone = currentZone(body.timeZone);
      if (!zone) throw badRequest(tr('Choose a time zone from the list.'));
      patch.time_zone = zone;
    }
    if (body.locale !== undefined) patch.locale = safeLocale(body.locale);
    if (body.country !== undefined && body.country !== current.country) {
      if (!isCountry(body.country)) throw badRequest(tr('Choose where you live.'));
      patch.country = body.country;
      // A work week that was where they lived's own follows them to the new one (R31); one they
      // set themselves stays theirs.
      const had = defaultWorkweek(current.country).join(',');
      if (body.workweek === undefined && (current.workweek ?? []).join(',') === had)
        patch.workweek = defaultWorkweek(body.country);
    }
    if (body.workweek !== undefined)
      patch.workweek = [...new Set(body.workweek)].sort((a, b) => a - b);
    if (body.quietHours !== undefined)
      patch.quiet_hours = body.quietHours ? JSON.stringify(body.quietHours) : null;
    if (body.preferences !== undefined) {
      patch.preferences = JSON.stringify({ ...(current.preferences ?? {}), ...body.preferences });
    }
    // What's written to them follows their language from the next notification (R54).
    if (body.preferences !== undefined || body.locale !== undefined) forgetLanguageOf(auth.userId);
    if (body.aiEnabled !== undefined) patch.ai_enabled = body.aiEnabled;
    if (body.avatarFileId !== undefined) {
      if (body.avatarFileId) {
        const file = await ctx.db
          .selectFrom('files')
          .select(['id', 'kind'])
          .where('id', '=', body.avatarFileId)
          .where('owner_id', '=', auth.userId)
          .executeTakeFirst();
        if (file?.kind !== 'image') throw badRequest(tr('Choose an image you uploaded.'));
      }
      patch.avatar_file_id = body.avatarFileId;
    }
    if (body.onboarded) patch.onboarded_at = current.onboarded_at ?? ctx.now();
    if (body.recoveryCodesSeen)
      patch.recovery_codes_seen_at = current.recovery_codes_seen_at ?? ctx.now();
    const week = (days: number[]) => [...days].sort((a, b) => a - b).join(',');
    const oldWeek = week(current.workweek ?? []);
    const weekMoved = patch.workweek !== undefined && week(patch.workweek as number[]) !== oldWeek;
    await ctx.db.transaction().execute(async (trx) => {
      // The name and handle as they are now, with changes from other devices one at a time.
      const was = await trx
        .selectFrom('users')
        .select(['display_name', 'handle'])
        .where('id', '=', auth.userId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await trx.updateTable('users').set(patch).where('id', '=', auth.userId).execute();
      // The handle they had is held from everyone, so their links never open someone else.
      if (patch.handle !== undefined && patch.handle !== was.handle.toLowerCase())
        await releaseHandle(trx, was.handle, ctx.now());
      // People see someone by the identity they're shown (lib/users.ts identityShownTo): the
      // personal one is the profile's own name, so it's renamed with it. One given a name of its
      // own keeps it.
      if (patch.display_name !== undefined && patch.display_name !== was.display_name)
        await trx
          .updateTable('identities')
          .set({ display_name: patch.display_name })
          .where('user_id', '=', auth.userId)
          .where('kind', '=', 'personal')
          .where('display_name', '=', was.display_name)
          .execute();
      if (!weekMoved) return;
      // The rules that keep to the work week move with it (work, customers, professionals):
      // those whose days are the week it was. A rule with days of its own keeps them.
      const rules = await trx
        .selectFrom('relationship_policies')
        .select(['id', 'settings'])
        .where('user_id', '=', auth.userId)
        .execute();
      for (const r of rules) {
        const settings = (r.settings ?? {}) as { schedule?: { days?: number[] } };
        if (!settings.schedule?.days || week(settings.schedule.days) !== oldWeek) continue;
        await trx
          .updateTable('relationship_policies')
          .set({
            settings: JSON.stringify({
              ...settings,
              schedule: { ...settings.schedule, days: patch.workweek },
            }),
            updated_at: ctx.now(),
          })
          .where('id', '=', r.id)
          .execute();
      }
    });
    const user = await load(auth.userId);
    await ctx.bus.publish([auth.userId], { type: 'me.updated', data: { id: auth.userId } });
    if (weekMoved) await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
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
    if (minorOf(user, now)) {
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
    // Taken (one namespace with organizations), held or reserved all read the same, and none of
    // them is ever suggested (lib/handles.ts).
    const unavailable = await unavailableAmong(ctx.db, candidates, ctx.now());
    const free = (h: string) => !unavailable.has(h);
    if (free(wanted)) return { available: true, reason: null, suggestion: null };
    // A closed organization's, verified: named, so that the organization itself can take it
    // back (R42).
    const closedOrg = await closedOrgHolding(ctx.db, wanted);
    return {
      available: false,
      reason: closedOrg ? closedOrgMessage(closedOrg) : HANDLE_UNAVAILABLE(),
      suggestion: candidates.slice(1).find(free) ?? null,
      ...(closedOrg ? { closedOrg } : {}),
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
    if (Number(count.n) >= 10) throw badRequest(tr('You can have up to 10 identities.'));
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
    if (!existing) throw notFound(tr('That identity'));
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
    if (!existing) throw notFound(tr('That identity'));
    if (existing.is_default) throw badRequest(tr('Make another identity your default first.'));
    await ctx.db.deleteFrom('identities').where('id', '=', id).execute();
    return { ok: true };
  });
}
