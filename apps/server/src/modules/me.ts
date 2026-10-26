/**
 * The account owner's profile, preferences and privacy (PRD §34).
 */
import {
  BirthDateBody,
  clampForMinor,
  Handle,
  type PlanUsageView,
  PrivacyBody,
  plausibleBirthDate,
  safeLocale,
  UpdateMeBody,
} from '@caime/core';
import type {
  HandleAvailabilityResponse,
  HandleCandidatesResponse,
  MeResponse,
  PersonInsightsResponse,
  PrivacyResponse,
  UserResponse,
} from '@caime/core/api';
import { defaultWorkweek } from '@caime/core/countries';
import {
  HANDLE_POLICY_VERSION,
  hasHandleLetters,
  orgCandidates,
  personCandidates,
} from '@caime/core/handle-engine';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { UserUpdate } from '../db/schema';
import { USER_COLUMNS } from '../db/schema';
import { audit } from '../lib/audit';
import { scheduleBrief, scheduleDigest } from '../lib/cai';
import { badRequest } from '../lib/errors';
import { meViewFor, supervisorOf } from '../lib/family';
import { ageChangeFor, askCorrection, beginWait } from '../lib/family-asks';
import { currentZone, isCountry } from '../lib/geo';
import {
  assertHandleAvailable,
  claimLost,
  closedOrgAmong,
  closedOrgHolding,
  closedOrgMessage,
  HANDLE_UNAVAILABLE,
  releaseHandle,
  unavailableAmong,
} from '../lib/handles';
import { forgetLanguageOf } from '../lib/i18n';
import { personInsights } from '../lib/insights';
import { assertPersonInsights, planUsage } from '../lib/plans';
import { avatarUrl, minorOf, privacyOf, tooYoung } from '../lib/users';
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
    ctx.db.selectFrom('users').select(USER_COLUMNS).where('id', '=', id).executeTakeFirstOrThrow();

  app.get('/me', async (req): Promise<MeResponse> => {
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
    return { user: await meViewFor(ctx, user, Boolean(auth.waiting)) };
  });

  /** Your plan, and what you've used of it today. */
  /** How your relationships are going (R47), for you only; Pro. */
  app.get('/me/insights', async (req): Promise<PersonInsightsResponse> => {
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

  app.patch('/me', async (req): Promise<UserResponse> => {
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
    if (body.headline !== undefined) patch.headline = body.headline || null;
    if (body.pronouns !== undefined) patch.pronouns = body.pronouns;
    // Said, never guessed (R81): the form of what's written to them, from the next line on.
    if (body.gender !== undefined) patch.gender = body.gender;
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
    // Where they live decides the age rules that hold (R122 (2)), as their date of birth does: a
    // child their parent looks after asks that parent; anyone else moves, refused where they'd be
    // too young for Caime, and waiting for a parent's yes where that's what lets them in.
    let countryAsked: string | null = null;
    let beginsWait = false;
    if (body.country !== undefined && body.country !== current.country) {
      if (!isCountry(body.country)) throw badRequest(tr('Choose where you live.'));
      if (current.birth_date) {
        const change = await ageChangeFor(ctx, auth.userId, {
          birthDate: current.birth_date,
          country: body.country,
          timeZone: current.time_zone,
        });
        if (change === 'refused') throw tooYoung(ctx.config.MINIMUM_AGE, body.country);
        countryAsked = await supervisorOf(ctx.db, auth.userId, ctx.now());
        beginsWait = change === 'wait' && !countryAsked;
      }
      if (!countryAsked) {
        patch.country = body.country;
        // A work week that was where they lived's own follows them to the new one (R31); one
        // they set themselves stays theirs.
        const had = defaultWorkweek(current.country).join(',');
        if (body.workweek === undefined && (current.workweek ?? []).join(',') === had)
          patch.workweek = defaultWorkweek(body.country);
      }
    }
    if (body.workweek !== undefined)
      patch.workweek = [...new Set(body.workweek)].sort((a, b) => a - b);
    if (body.quietHours !== undefined)
      patch.quiet_hours = body.quietHours ? JSON.stringify(body.quietHours) : null;
    if (body.preferences !== undefined) {
      patch.preferences = JSON.stringify({ ...(current.preferences ?? {}), ...body.preferences });
    }
    // What's written to them follows their language from the next notification (R54).
    // What's written to them, and how Cai speaks Arabic with them (R72), follow at once.
    if (
      body.preferences !== undefined ||
      body.locale !== undefined ||
      body.country !== undefined ||
      body.gender !== undefined
    )
      forgetLanguageOf(auth.userId);
    // Cai's morning brief (R68): the next one queued once the choice is saved.
    const cai = (current.preferences ?? {}) as { caiBrief?: string | null; caiDigest?: boolean };
    const briefChanged =
      body.preferences?.caiBrief !== undefined && body.preferences.caiBrief !== cai.caiBrief;
    // The weekly digest: queued when it's turned on, and again when the brief's hour it keeps moves.
    const digestChanged = (body.preferences?.caiDigest === true && !cai.caiDigest) || briefChanged;
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
      await trx
        .updateTable('users')
        .set(patch)
        .where('id', '=', auth.userId)
        .execute()
        .catch((err) => {
          throw claimLost(err);
        });
      // The handle they had is held from everyone, so their links never open someone else.
      if (patch.handle !== undefined && patch.handle !== was.handle.toLowerCase())
        await releaseHandle(trx, was.handle, ctx.now());
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
    if (beginsWait) {
      await beginWait(ctx.db, auth.userId, 'corrected', ctx.now());
      ctx.metrics.family.inc({ step: 'corrected' });
    }
    if (countryAsked && body.country)
      await askCorrection(ctx, auth.userId, countryAsked, { country: body.country });
    const user = await load(auth.userId);
    await ctx.bus.publish([auth.userId], { type: 'me.updated', data: { id: auth.userId } });
    if (weekMoved) await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    if (briefChanged) await scheduleBrief(ctx, auth.userId);
    if (digestChanged) await scheduleDigest(ctx, auth.userId);
    return {
      user: await meViewFor(ctx, user),
      ...(countryAsked ? { askedParent: true } : {}),
    };
  });

  /**
   * A date of birth typed wrong at sign-up, corrected by its owner (the owner's report of
   * 2026-10-25), under sign-up's own rules (R122 (2)): a real day, three a day; under the age Caime
   * opens where they live, refused; where a parent's yes is what lets them in and none holds, saved
   * and the account waits for one, as at sign-up; a child their parent looks after asks that
   * parent, and nothing changes until they agree (or a document check says 18 or over). The
   * under-18 rules follow at once, since `privacyOf` and `minorOf` read it on every request; a
   * check of their age that found them under 18 still holds for its year whatever is declared
   * (M16 B7: the stricter reading wins). A new day is no longer the one a parent vouched for.
   * Audited without the date.
   */
  app.put('/me/birth-date', async (req): Promise<UserResponse> => {
    const auth = requireAuth(req);
    const { birthDate } = parse(BirthDateBody, req.body);
    ctx.limiter.hit(`birth-date:${auth.userId}`, ctx.config.isTest ? 1000 : 3, 86_400_000);
    const current = await load(auth.userId);
    const now = ctx.now();
    if (!plausibleBirthDate(birthDate, now, current.time_zone))
      throw badRequest(tr('Enter the day you were born.'), {
        fields: [{ path: 'birthDate', message: 'Enter the day you were born.' }],
      });
    if (birthDate === current.birth_date) return { user: await meViewFor(ctx, current) };
    const change = await ageChangeFor(ctx, auth.userId, {
      birthDate,
      country: current.country,
      timeZone: current.time_zone,
    });
    if (change === 'refused') throw tooYoung(ctx.config.MINIMUM_AGE, current.country);
    const supervisor = await supervisorOf(ctx.db, auth.userId, now);
    if (supervisor) {
      await askCorrection(ctx, auth.userId, supervisor, { bornOn: birthDate });
      return { user: await meViewFor(ctx, current), askedParent: true };
    }
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ birth_date: birthDate, birth_date_confirmed_at: null, updated_at: now })
        .where('id', '=', auth.userId)
        .execute();
      if (change === 'wait') await beginWait(trx, auth.userId, 'corrected', now);
    });
    if (change === 'wait') ctx.metrics.family.inc({ step: 'corrected' });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'account.birth_date',
      target: auth.userId,
    });
    await ctx.bus.publish([auth.userId], { type: 'me.updated', data: { id: auth.userId } });
    const user = await load(auth.userId);
    return { user: await meViewFor(ctx, user) };
  });

  app.put('/me/privacy', async (req): Promise<PrivacyResponse> => {
    const auth = requireAuth(req);
    const body = parse(PrivacyBody, req.body);
    const user = await load(auth.userId);
    const now = ctx.now();
    const current = privacyOf(user, now);
    const next = {
      fields: { ...current.fields, ...(body.fields ?? {}) },
      discoverByHandle: body.discoverByHandle ?? current.discoverByHandle,
      discoverByEmail: body.discoverByEmail ?? current.discoverByEmail,
      discoverByPhone: body.discoverByPhone ?? current.discoverByPhone,
      messageRequests: body.messageRequests ?? current.messageRequests,
      groupAdds: body.groupAdds ?? current.groupAdds,
    };
    // Protections for under-18 accounts are rules, not defaults (R29): what's saved is clamped.
    const saved = minorOf(user, now) ? clampForMinor(next) : next;
    await ctx.db
      .updateTable('users')
      .set({ privacy: JSON.stringify(saved), updated_at: now })
      .where('id', '=', auth.userId)
      .execute();
    return { privacy: saved };
  });

  /**
   * Public, so sign-up can check a handle as it's typed. Handles are public identifiers, but the
   * endpoint is rate-limited per address so it can't be used to list accounts.
   */
  /**
   * The handles a name could have, best first and free now (docs/HANDLES.md, core
   * `personCandidates` and `orgCandidates`, then the name with a short number), public for
   * sign-up and limited per address as the check below is.
   */
  app.get('/handles/candidates', async (req): Promise<HandleCandidatesResponse> => {
    ctx.limiter.hit(`handle:ip:${req.ip}`, ctx.config.isTest ? 10_000 : 60, 60_000);
    const q = parse(
      z.object({
        for: z.enum(['person', 'org']),
        name: z.string().max(120),
        latinName: z.string().max(120).optional(),
        legalName: z.string().max(200).optional(),
      }),
      req.query,
    );
    const ranked =
      q.for === 'person'
        ? personCandidates({ displayName: q.name, latinName: q.latinName ?? null })
        : orgCandidates({ name: q.name, legalName: q.legalName ?? null });
    const needsLatinName =
      ranked.length === 0 && q.name.trim().length > 0 && !hasHandleLetters(q.name);
    // Then the best with a short number, in order, never at random.
    const base = ranked[0]?.slice(0, 27);
    const numbered = base ? Array.from({ length: 8 }, (_, i) => `${base}${i + 2}`) : [];
    const all = [...ranked, ...numbered];
    const [unavailable, reclaimable] = await Promise.all([
      unavailableAmong(ctx.db, all, ctx.now()),
      q.for === 'org' ? closedOrgAmong(ctx.db, ranked) : null,
    ]);
    return {
      candidates: all.filter((h) => !unavailable.has(h)).slice(0, 4),
      needsLatinName,
      policyVersion: HANDLE_POLICY_VERSION,
      ...(reclaimable ? { reclaimable } : {}),
    };
  });

  app.get('/me/handle-available', async (req): Promise<HandleAvailabilityResponse> => {
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
      // A short number, in order, never at random (docs/HANDLES.md).
      ...Array.from({ length: 6 }, (_, i) => `${base}${i + 2}`),
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
}
