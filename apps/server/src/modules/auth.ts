/**
 * Accounts and sessions (PRD §35, §55; PRODUCT-REVIEW R24, R29; ADR-7).
 */

import type { AuthResponse, SessionResponse } from '@caime/core';
import {
  ChangePasswordBody,
  defaultPrivacy,
  EmailCodeBody,
  isMinor,
  LoginBody,
  normalizeHandle,
  plausibleBirthDate,
  RecoverBody,
  ResetConfirmBody,
  ResetRequestBody,
  SignupBody,
  safeLocale,
  uuidv7,
} from '@caime/core';
import type {
  GuestKeepResponse,
  JoinResponse,
  JoinView,
  OkResponse,
  RecoverResponse,
  RecoveryCodesResponse,
  SessionsResponse,
  UserResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { USER_COLUMNS } from '../db/schema';
import { audit } from '../lib/audit';
import {
  decoyHash,
  hashPassword,
  hashRecoveryCode,
  hashToken,
  matchRecoveryCode,
  recoveryCodes,
  recoverySalt,
  verifyPassword,
} from '../lib/crypto';
import { offerTeamByDomain } from '../lib/domain-join';
import { sendEmailCode, spendEmailCode } from '../lib/email-codes';
import {
  AppError,
  badRequest,
  conflict,
  mailUnavailable,
  notFound,
  unauthorized,
} from '../lib/errors';
import { recordEvent } from '../lib/events';
import { currentZone, isCountry } from '../lib/geo';
import { keepFor, keepRanOut, keptGuest } from '../lib/guest-keep';
import { assertHandleAvailable, claimLost } from '../lib/handles';
import { guestLink } from '../lib/meeting-join';
import { endAllAccess } from '../lib/moderation';
import { sendResetLink } from '../lib/reset';
import { clearSessionCookie } from '../lib/session-cookie';
import { clientInfo, createSession, endSessions, passwordTry } from '../lib/sessions';
import { meView, oldEnoughIn, seedDefaults, tooYoung, workweekFor } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth, suspended, tokenFrom } from '../plugins/auth';

/**
 * New recovery codes in place of the old, all under one salt: made one set at a time for an
 * account (its row locked), so two made at once never leave codes of both behind, nor a second
 * salt that would make a try on the account take two slow hashes.
 */
async function storeRecoveryCodes(ctx: AppContext, userId: string): Promise<string[]> {
  const codes = recoveryCodes();
  const salt = recoverySalt();
  const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c, salt)));
  await ctx.db.transaction().execute(async (trx) => {
    await trx.selectFrom('users').select('id').where('id', '=', userId).forUpdate().execute();
    await trx.deleteFrom('recovery_codes').where('user_id', '=', userId).execute();
    await trx
      .insertInto('recovery_codes')
      .values(hashes.map((code_hash) => ({ id: uuidv7(), user_id: userId, code_hash, salt })))
      .execute();
  });
  return codes;
}

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/auth/signup', async (req, reply): Promise<AuthResponse> => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`signup:ip:${ip}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const body = parse(SignupBody, req.body);
    const now = ctx.now();
    // The device's zone by the name it has now; UTC for one that isn't a zone.
    const timeZone = currentZone(body.timeZone) ?? 'UTC';
    if (!plausibleBirthDate(body.birthDate, now, timeZone))
      throw badRequest(tr('Enter the day you were born.'), {
        fields: [{ path: 'birthDate', message: 'Enter the day you were born.' }],
      });
    if (!isCountry(body.country))
      throw badRequest(tr('Choose where you live.'), {
        fields: [{ path: 'country', message: 'Choose where you live.' }],
      });
    // Their birthday, where they are, against the age where they live.
    if (!oldEnoughIn(ctx.config.MINIMUM_AGE, body.country, body.birthDate, now, timeZone))
      throw tooYoung(ctx.config.MINIMUM_AGE, body.country);
    // A meeting's guest by link keeping it (M16 C3f): the claim their own page was handed names
    // the guest this account becomes, so the meeting comes with it.
    const keeping = body.keep ? await keptGuest(ctx, body.keep) : null;
    if (body.keep && !keeping) throw keepRanOut();
    // Its guests are strangers to each other, and nobody under 18 is ever with one (R29).
    if (keeping && isMinor(body.birthDate, now, timeZone)) {
      const message = tr('Keeping a meeting is for people over 18.');
      throw new AppError(403, 'forbidden', message, { fields: [{ path: 'birthDate', message }] });
    }
    const existing = await ctx.db
      .selectFrom('users')
      .select(['id', 'kind'])
      .where('email', '=', body.email)
      .executeTakeFirst();
    if (existing && existing.kind !== 'provisional') {
      throw conflict('email_taken', tr('That email already has an account. Sign in instead?'));
    }
    // The address has history of its own, for whoever proves it: never folded into a guest's.
    if (keeping && existing)
      throw conflict(
        'email_taken',
        tr(
          'Messages are waiting for this address on Caime. Keep the meeting with another address.',
        ),
      );
    // Someone who wrote in by mail, was a meeting's guest or booked before an account (R75, R84,
    // R97) claims that provisional person: the same row, so the conversations they're already in
    // are theirs the moment they're in.
    const claiming = existing?.kind === 'provisional' ? existing.id : null;
    await assertHandleAvailable(ctx.db, body.handle, now);
    // That history goes only to whoever proves the address (review 2026-10-17 §2 H1): the six
    // digits sent to it, asked for once everything else on the form is right. Without a mailer
    // nothing can prove it, and the form says so rather than handing it over.
    if (claiming) {
      if (!body.emailCode) {
        if (!ctx.mail)
          throw new AppError(
            409,
            'email_unprovable',
            tr(
              'Messages are waiting for this address on Caime, and this Caime can’t send the code that proves it’s yours yet. Use another address, or try again later.',
            ),
          );
        ctx.limiter.hit(`signup-code:${body.email}`, ctx.config.isTest ? 1000 : 3, 3_600_000);
        await sendEmailCode(ctx, claiming, body.email, body.displayName);
        throw new AppError(
          409,
          'email_code_needed',
          tr(
            'Messages are waiting for this address on Caime. We sent it a six-digit code: type it here to bring them into your account.',
          ),
        );
      }
      await spendEmailCode(ctx, claiming, body.emailCode.trim());
    }
    const id = claiming ?? keeping ?? uuidv7();
    const locale = safeLocale(body.locale);
    const workweek = workweekFor(body.country);
    const passwordHash = await hashPassword(body.password);
    // The link that brought them, if it named someone (PRD §82); a handle that names nobody
    // is simply not counted.
    const via = body.invite ? normalizeHandle(body.invite) : null;
    const [inviter, inviterOrg] = via
      ? await Promise.all([
          ctx.db
            .selectFrom('users')
            .select('id')
            .where('handle', '=', via)
            .where('kind', '=', 'human')
            .where('deleted_at', 'is', null)
            .executeTakeFirst(),
          ctx.db
            .selectFrom('organizations')
            .select('id')
            .where('handle', '=', via)
            .where('archived_at', 'is', null)
            .executeTakeFirst(),
        ])
      : [undefined, undefined];
    // A provisional person's sessions were a guest's, for one meeting (R84): none of them becomes
    // the account's, whoever's device it is on, so they end before the row turns into one...
    if (claiming || keeping) await endSessions(ctx, { userId: id });
    await ctx.db
      .transaction()
      .execute(async (trx) => {
        const account = {
          email: body.email,
          handle: body.handle,
          password_hash: passwordHash,
          display_name: body.displayName,
          birth_date: body.birthDate,
          // Said, or not (R81): "Prefer not to say" leaves it null, as it is by default.
          gender: body.gender ?? null,
          locale,
          time_zone: timeZone,
          country: body.country,
          workweek,
          privacy: JSON.stringify(
            defaultPrivacy({ minor: isMinor(body.birthDate, now, timeZone) }),
          ),
          invited_by: inviter?.id ?? null,
          invited_by_org: inviterOrg?.id ?? null,
        };
        if (claiming || keeping) {
          // A claimed address is proven by the code just spent; a kept guest's address is new, and
          // confirmed by the code sent next. When it was claimed is kept for the numbers that ask
          // (product metrics' door, bookers who joined; and guests who kept their meeting).
          const done = await trx
            .updateTable('users')
            .set({
              ...account,
              kind: 'human',
              email_verified_at: claiming ? now : null,
              claimed_at: now,
            })
            .where('id', '=', id)
            .where('kind', '=', 'provisional')
            .executeTakeFirst();
          // Someone else's sign-up made it an account a moment ago: never a session to theirs.
          if (Number(done.numUpdatedRows) !== 1)
            throw claiming
              ? conflict('email_taken', tr('That email already has an account. Sign in instead?'))
              : keepRanOut();
        } else
          await trx
            .insertInto('users')
            .values({ id, ...account })
            .execute();
        await trx
          .insertInto('identities')
          .values({
            id: uuidv7(),
            user_id: id,
            kind: 'personal',
            display_name: body.displayName,
            is_default: true,
          })
          .execute();
        await seedDefaults(trx, id, workweek);
        await recordEvent(trx, 'user.created', id, { userId: id });
      })
      .catch((err) => {
        throw claimLost(err);
      });
    // ...and again once it has, for one a guest's link took meanwhile.
    if (claiming || keeping) await endSessions(ctx, { userId: id });
    const codes = await storeRecoveryCodes(ctx, id);
    const token = await createSession(ctx, req, reply, id, body.client, body.deviceName);
    await audit(ctx.db, {
      actorId: id,
      action: 'auth.signup',
      ...clientInfo(req),
      ...(keeping ? { metadata: { keptMeeting: true } } : {}),
    });
    // A code to confirm the address, when mail can go out (R48); nothing waits on it. A claim
    // proved it already.
    if (ctx.mail && !claiming) await sendEmailCode(ctx, id, body.email, body.displayName);
    const user = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    reply.status(201);
    return { user: meView(user, now, ctx.config), token, recoveryCodes: codes };
  });

  app.post('/auth/login', async (req, reply): Promise<AuthResponse> => {
    const { ip, userAgent } = clientInfo(req);
    const body = parse(LoginBody, req.body);
    const identifier = body.identifier.toLowerCase().replace(/^@/, '');
    const heavy = ctx.config.isTest ? 1000 : 30;
    ctx.limiter.hit(`login:ip:${ip}`, heavy, 600_000);
    // Per handle and address: a stranger's wrong guesses at a known handle slow that stranger,
    // never the person signing in from somewhere else.
    ctx.limiter.hit(`login:id:${identifier}:${ip}`, ctx.config.isTest ? 1000 : 10, 600_000);
    const user = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where((eb) => eb.or([eb('email', '=', identifier), eb('handle', '=', identifier)]))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await decoyHash()));
    if (ok && user?.suspended_at) throw suspended();
    // Bots act only through their app's token, never a session (R16).
    if (!user || !ok || user.kind !== 'human') {
      await audit(ctx.db, {
        actorId: user?.id ?? null,
        action: 'auth.login_failed',
        ip,
        userAgent,
        metadata: { identifier: identifier.slice(0, 80) },
      });
      throw new AppError(
        401,
        'invalid_credentials',
        tr('That email or handle and password don’t match.'),
      );
    }
    const token = await createSession(ctx, req, reply, user.id, body.client, body.deviceName);
    await audit(ctx.db, { actorId: user.id, action: 'auth.login', ip, userAgent });
    return { user: meView(user, ctx.now(), ctx.config), token };
  });

  app.post('/auth/logout', async (req, reply): Promise<OkResponse> => {
    const auth = req.auth;
    if (auth) {
      await endSessions(ctx, { userId: auth.userId, ids: [auth.sessionId] });
      await audit(ctx.db, { actorId: auth.userId, action: 'auth.logout', ...clientInfo(req) });
    }
    clearSessionCookie(reply, ctx);
    return { ok: true };
  });

  app.get('/auth/session', async (req, reply): Promise<SessionResponse> => {
    // No credentials at all is a normal state (a signed-out browser), not an error.
    const presented = tokenFrom(req);
    if (!presented) return { user: null, session: null };
    if (!req.auth) {
      // A stale cookie from a revoked or expired session: clear it so it stops being sent.
      if (presented.via === 'cookie') clearSessionCookie(reply, ctx);
      throw unauthorized();
    }
    const auth = req.auth;
    const user = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', '=', auth.userId)
      .executeTakeFirst();
    if (!user) throw unauthorized();
    return {
      user: meView(user, ctx.now(), ctx.config),
      session: { id: auth.sessionId, kind: auth.kind },
    };
  });

  app.get('/auth/sessions', async (req): Promise<SessionsResponse> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('sessions')
      .select(['id', 'kind', 'device_name', 'platform', 'created_at', 'last_seen_at'])
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', ctx.now())
      .orderBy('last_seen_at', 'desc')
      .execute();
    return {
      sessions: rows.map((s) => ({
        id: s.id,
        kind: s.kind,
        deviceName: s.device_name,
        platform: s.platform,
        createdAt: s.created_at.toISOString(),
        lastSeenAt: s.last_seen_at.toISOString(),
        current: s.id === auth.sessionId,
      })),
    };
  });

  app.delete('/auth/sessions/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const ended = await endSessions(ctx, { userId: auth.userId, ids: [id] });
    if (ended.length === 0) throw notFound(tr('That session'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'session.revoked',
      target: id,
      ...clientInfo(req),
    });
    return { ok: true };
  });

  app.post('/auth/password', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    passwordTry(ctx, auth.userId);
    const body = parse(ChangePasswordBody, req.body);
    const user = await ctx.db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw new AppError(400, 'wrong_password', tr('Your current password isn’t right.'));
    }
    await ctx.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(body.newPassword), updated_at: ctx.now() })
      .where('id', '=', auth.userId)
      .execute();
    // Changing the password signs out every other device.
    await endSessions(ctx, { userId: auth.userId, except: auth.sessionId });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.password_changed',
      ...clientInfo(req),
    });
    return { ok: true };
  });

  app.post('/auth/recovery-codes', async (req): Promise<RecoveryCodesResponse> => {
    const auth = requireAuth(req);
    passwordTry(ctx, auth.userId);
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body);
    const user = await ctx.db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new AppError(400, 'wrong_password', tr('Your password isn’t right.'));
    }
    const codes = await storeRecoveryCodes(ctx, auth.userId);
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.recovery_codes_regenerated',
      ...clientInfo(req),
    });
    return { recoveryCodes: codes };
  });

  // --- Email (R48) ------------------------------------------------------------------------------

  /** Another code to the address, for someone who didn't get the first. */
  app.post('/auth/email/send', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    if (!ctx.mail) throw mailUnavailable();
    ctx.limiter.hit(`email-code:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const user = await ctx.db
      .selectFrom('users')
      .select(['email', 'display_name', 'email_verified_at'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (user.email_verified_at)
      throw conflict('already_verified', tr('This address is confirmed.'));
    await sendEmailCode(ctx, auth.userId, user.email, user.display_name);
    return { ok: true };
  });

  /** The six digits, back: the address is theirs. */
  app.post('/auth/email/verify', async (req): Promise<UserResponse> => {
    const auth = requireAuth(req);
    const body = parse(EmailCodeBody, req.body);
    // Six digits: a few tries a minute is a person reading the mail, not a search.
    ctx.limiter.hit(`email-verify:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 600_000);
    await spendEmailCode(ctx, auth.userId, body.code);
    const user = await ctx.db
      .updateTable('users')
      .set({ email_verified_at: ctx.now(), updated_at: ctx.now() })
      .where('id', '=', auth.userId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.email_verified',
      ...clientInfo(req),
    });
    // An address at a verified organization's domain may let them onto its team (M16 C3b).
    ctx.defer('team-domain', () => offerTeamByDomain(ctx, auth.userId, user.email));
    return { user: meView(user, ctx.now(), ctx.config) };
  });

  /**
   * A forgotten password: a link to the address, if it's an account's. The answer is the same
   * either way, so nobody learns which addresses are here.
   */
  app.post('/auth/reset', async (req): Promise<OkResponse> => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`reset:ip:${ip}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    if (!ctx.mail) throw mailUnavailable();
    const body = parse(ResetRequestBody, req.body);
    ctx.limiter.hit(`reset:email:${body.email}`, ctx.config.isTest ? 1000 : 3, 3_600_000);
    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'email', 'display_name'])
      .where('email', '=', body.email)
      .where('deleted_at', 'is', null)
      .where('kind', '=', 'human')
      .executeTakeFirst();
    if (user) {
      await sendResetLink(ctx, ctx.mail, user);
      await audit(ctx.db, { actorId: user.id, action: 'auth.reset_requested', ...clientInfo(req) });
    }
    return { ok: true };
  });

  /** The link, back, with a new password: signed in here, signed out everywhere else. */
  app.post('/auth/reset/confirm', async (req, reply): Promise<AuthResponse> => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`reset-confirm:ip:${ip}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const body = parse(ResetConfirmBody, req.body);
    const failure = new AppError(
      400,
      'invalid_reset',
      tr('That link has been used or has run out. Ask for a new one.'),
    );
    const row = await ctx.db
      .selectFrom('password_resets')
      .selectAll()
      .where('token_hash', '=', hashToken(body.token))
      .executeTakeFirst();
    if (!row || row.used_at || row.expires_at <= ctx.now()) throw failure;
    // Once: a second try with the same link at the same moment finds it used.
    const used = await ctx.db
      .updateTable('password_resets')
      .set({ used_at: ctx.now() })
      .where('id', '=', row.id)
      .where('used_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!used) throw failure;
    // Opening the link proves the mailbox: the address is confirmed too.
    const user = await ctx.db
      .updateTable('users')
      .set({
        password_hash: await hashPassword(body.newPassword),
        email_verified_at: sql`coalesce(email_verified_at, ${ctx.now()})`,
        updated_at: ctx.now(),
      })
      .where('id', '=', row.user_id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!user) throw failure;
    await endAllAccess(ctx, user.id, clientInfo(req));
    await ctx.db.deleteFrom('password_resets').where('user_id', '=', user.id).execute();
    const token = await createSession(ctx, req, reply, user.id, body.client);
    await audit(ctx.db, { actorId: user.id, action: 'auth.reset', ...clientInfo(req) });
    return { user: meView(user, ctx.now(), ctx.config), token };
  });

  app.post('/auth/recover', async (req, reply): Promise<RecoverResponse> => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`recover:ip:${ip}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const body = parse(RecoverBody, req.body);
    const identifier = body.identifier.toLowerCase().replace(/^@/, '');
    const user = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where((eb) => eb.or([eb('email', '=', identifier), eb('handle', '=', identifier)]))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    const failure = new AppError(
      400,
      'invalid_recovery',
      tr('That recovery code doesn’t match this account.'),
    );
    const unused = user
      ? await ctx.db
          .selectFrom('recovery_codes')
          .select(['id', 'code_hash', 'salt'])
          .where('user_id', '=', user.id)
          .where('used_at', 'is', null)
          .execute()
      : [];
    const matched = await matchRecoveryCode(body.code, unused);
    if (!user || !matched) throw failure;
    // Once: a second try with the same code at the same moment finds it used.
    const used = await ctx.db
      .updateTable('recovery_codes')
      .set({ used_at: ctx.now() })
      .where('id', '=', matched)
      .where('used_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!used) throw failure;
    await ctx.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(body.newPassword), updated_at: ctx.now() })
      .where('id', '=', user.id)
      .execute();
    await endAllAccess(ctx, user.id, clientInfo(req));
    const remaining = await ctx.db
      .selectFrom('recovery_codes')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('user_id', '=', user.id)
      .where('used_at', 'is', null)
      .executeTakeFirstOrThrow();
    const token = await createSession(ctx, req, reply, user.id, body.client);
    await audit(ctx.db, { actorId: user.id, action: 'auth.recovered', ...clientInfo(req) });
    return { user: meView(user, ctx.now(), ctx.config), token, recoveryCodesLeft: remaining.n };
  });

  // A meeting's guest (R84): their own link is their way in, for that meeting only.
  const TokenParams = z.object({ token: z.string().min(1).max(200) });
  const JoinBody = z.object({
    name: z.string().trim().min(1).max(80).nullish(),
    /** Whether they said they're 18 or over (R85 (3)); not saying is no. */
    adult: z.boolean(),
    client: z.enum(['web', 'native']).default('web'),
  });
  /** Tried from one address: enough for a family behind one router, never a guessing machine. */
  const tries = (ip: string) =>
    ctx.limiter.hit(`join:${ip}`, ctx.config.isTest ? 1000 : 60, 60 * 60_000);

  /** A guest's link (R84): what the meeting is, who asked, and whether to sign in instead. */
  app.get('/join/:token', async (req): Promise<JoinView> => {
    tries(req.ip);
    const { token } = parse(TokenParams, req.params);
    const link = await guestLink(ctx, token);
    return {
      meeting: {
        title: link.title,
        at: link.at.toISOString(),
        durationMinutes: link.durationMinutes,
        host: link.host,
      },
      guest: { name: link.guestName },
      // The address is someone's on Caime: they sign in, and find it among their requests.
      signIn: link.userKind === 'human',
      // Taken already, by this very guest: their meeting, so the page opens it.
      space:
        req.auth?.userId === link.userId
          ? { conversationId: link.conversationId, messageId: link.messageId, seq: link.seq }
          : null,
    };
  });

  /**
   * Keeping the meeting (M16 C3f): what the guest's page takes to sign-up. A guest by address
   * proves it there with its code; a guest by link is handed a claim naming them.
   */
  app.post('/guest/keep', async (req): Promise<GuestKeepResponse> => {
    const auth = requireAuth(req);
    ctx.limiter.hit(`guest-keep:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    return keepFor(ctx, auth.userId);
  });

  /** Taking the link: signed in as the guest, for that meeting only, until a day after it. */
  app.post('/join/:token', async (req, reply): Promise<JoinResponse> => {
    tries(req.ip);
    const { token } = parse(TokenParams, req.params);
    const body = parse(JoinBody, req.body);
    const link = await guestLink(ctx, token);
    if (link.userKind !== 'provisional')
      throw new AppError(409, 'sign_in', tr('This invitation is for your Caime account: sign in.'));
    // Already signed in here as someone else: never signed out by a link.
    if (req.auth && req.auth.userId !== link.userId)
      throw new AppError(
        409,
        'wrong_account',
        tr('Someone else is signed in here. Open the link in another browser, or sign out first.'),
      );
    if (body.name && body.name !== link.guestName)
      await ctx.db
        .updateTable('users')
        .set({ display_name: body.name })
        .where('id', '=', link.userId)
        .execute();
    await ctx.db
      .updateTable('meeting_guests')
      .set({ adult: body.adult, joined_at: ctx.now() })
      .where('id', '=', link.guestRowId)
      .execute();
    const session = req.auth
      ? null
      : await createSession(ctx, req, reply, link.userId, body.client, 'Guest', link.endsAt);
    return {
      conversationId: link.conversationId,
      messageId: link.messageId,
      seq: link.seq,
      ...(session ? { token: session } : {}),
    };
  });
}
