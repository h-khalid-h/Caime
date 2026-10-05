import { randomInt, timingSafeEqual } from 'node:crypto';
/**
 * Accounts and sessions (PRD §35, §55; PRODUCT-REVIEW R24, R29; ADR-7).
 */

import type { AuthResponse, DeviceSessionView, SessionResponse } from '@caime/core';
import {
  ChangePasswordBody,
  defaultPrivacy,
  EmailCodeBody,
  isMinor,
  LoginBody,
  meetsMinimumAge,
  normalizeHandle,
  plausibleBirthDate,
  RecoverBody,
  ResetConfirmBody,
  ResetRequestBody,
  SignupBody,
  safeLocale,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import {
  decoyHash,
  hashPassword,
  hashRecoveryCode,
  hashToken,
  matchRecoveryCode,
  newToken,
  recoveryCodes,
  recoverySalt,
  verifyPassword,
} from '../lib/crypto';
import { verificationMail } from '../lib/email';
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
import { assertHandleAvailable } from '../lib/handles';
import { endAllAccess } from '../lib/moderation';
import { sendResetLink } from '../lib/reset';
import { endSessions } from '../lib/sessions';
import { meView, seedDefaults, workweekFor } from '../lib/users';
import { parse } from '../lib/validate';
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  suspended,
  tokenFrom,
} from '../plugins/auth';

function clientInfo(req: FastifyRequest) {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

function platformFrom(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone|iPad|iOS/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Windows|Linux|CrOS/i.test(userAgent)) return 'web';
  return null;
}

const CODE_LIFE_MS = 24 * 3_600_000;
const CODE_TRIES = 10;

/** Six digits to the address, kept hashed, a day, ten tries; a new one replaces the last. */
async function sendEmailCode(ctx: AppContext, userId: string, email: string, name: string) {
  if (!ctx.mail) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await ctx.db
    .insertInto('email_codes')
    .values({
      user_id: userId,
      code_hash: hashToken(code),
      attempts: 0,
      expires_at: new Date(ctx.now().getTime() + CODE_LIFE_MS),
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        code_hash: hashToken(code),
        attempts: 0,
        expires_at: new Date(ctx.now().getTime() + CODE_LIFE_MS),
      }),
    )
    .execute();
  const mail = ctx.mail;
  ctx.defer('email.code', () => mail.send(verificationMail(email, name, code)));
}

export async function createSession(
  ctx: AppContext,
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  client: 'web' | 'native',
  deviceName?: string,
): Promise<string | null> {
  const token = newToken('csy');
  const { ip, userAgent } = clientInfo(req);
  await ctx.db
    .insertInto('sessions')
    .values({
      id: uuidv7(),
      user_id: userId,
      token_hash: hashToken(token),
      kind: client,
      device_name: deviceName?.slice(0, 80) ?? null,
      platform: platformFrom(userAgent),
      ip,
      user_agent: userAgent?.slice(0, 300) ?? null,
      expires_at: new Date(ctx.now().getTime() + ctx.config.SESSION_DAYS * 86_400_000),
    })
    .execute();
  if (client === 'web') {
    setSessionCookie(reply, ctx, token);
    return null;
  }
  return token;
}

/**
 * Confirming the password while signed in: few tries, so a session someone took can't find the
 * password it'd take to keep the account (a new password, new recovery codes).
 */
function passwordTry(ctx: AppContext, userId: string): void {
  ctx.limiter.hit(`password-try:${userId}`, ctx.config.isTest ? 1000 : 10, 600_000);
}

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
    // Their birthday, where they are.
    if (!meetsMinimumAge(body.birthDate, now, ctx.config.MINIMUM_AGE, timeZone)) {
      throw new AppError(
        400,
        'too_young',
        tr('You need to be at least {MINIMUM_AGE} to use Caime.', {
          MINIMUM_AGE: ctx.config.MINIMUM_AGE,
        }),
      );
    }
    const existing = await ctx.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', body.email)
      .executeTakeFirst();
    if (existing) {
      throw conflict('email_taken', tr('That email already has an account. Sign in instead?'));
    }
    await assertHandleAvailable(ctx.db, body.handle, now);
    const id = uuidv7();
    const locale = safeLocale(body.locale);
    if (!isCountry(body.country))
      throw badRequest(tr('Choose where you live.'), {
        fields: [{ path: 'country', message: 'Choose where you live.' }],
      });
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
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('users')
        .values({
          id,
          email: body.email,
          handle: body.handle,
          password_hash: passwordHash,
          display_name: body.displayName,
          birth_date: body.birthDate,
          locale,
          time_zone: timeZone,
          country: body.country,
          workweek,
          privacy: JSON.stringify(
            defaultPrivacy({ minor: isMinor(body.birthDate, now, timeZone) }),
          ),
          invited_by: inviter?.id ?? null,
          invited_by_org: inviterOrg?.id ?? null,
        })
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
    });
    const codes = await storeRecoveryCodes(ctx, id);
    const token = await createSession(ctx, req, reply, id, body.client, body.deviceName);
    await audit(ctx.db, { actorId: id, action: 'auth.signup', ...clientInfo(req) });
    // A code to confirm the address, when mail can go out (R48); nothing waits on it.
    if (ctx.mail) await sendEmailCode(ctx, id, body.email, body.displayName);
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    reply.status(201);
    return { user: meView(user, now), token, recoveryCodes: codes };
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
      .selectAll()
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
    return { user: meView(user, ctx.now()), token };
  });

  app.post('/auth/logout', async (req, reply) => {
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
      .selectAll()
      .where('id', '=', auth.userId)
      .executeTakeFirst();
    if (!user) throw unauthorized();
    return { user: meView(user, ctx.now()), session: { id: auth.sessionId, kind: auth.kind } };
  });

  app.get('/auth/sessions', async (req): Promise<{ sessions: DeviceSessionView[] }> => {
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

  app.delete('/auth/sessions/:id', async (req) => {
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

  app.post('/auth/password', async (req) => {
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

  app.post('/auth/recovery-codes', async (req) => {
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
  app.post('/auth/email/send', async (req) => {
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
  app.post('/auth/email/verify', async (req) => {
    const auth = requireAuth(req);
    const body = parse(EmailCodeBody, req.body);
    // Six digits: a few tries a minute is a person reading the mail, not a search.
    ctx.limiter.hit(`email-verify:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 600_000);
    const wrong = new AppError(
      400,
      'wrong_code',
      tr('That code isn’t right. Check the email again.'),
    );
    const row = await ctx.db
      .selectFrom('email_codes')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (!row || row.expires_at <= ctx.now())
      throw new AppError(400, 'code_expired', tr('That code has run out. Send a new one.'));
    if (row.attempts >= CODE_TRIES)
      throw new AppError(400, 'code_expired', tr('Too many tries with that code. Send a new one.'));
    if (!timingSafeEqual(row.code_hash, hashToken(body.code))) {
      // Counted in the database, not from the row read above: a burst of parallel guesses would
      // otherwise each write 1 and the code would take any number of tries.
      await ctx.db
        .updateTable('email_codes')
        .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
        .where('user_id', '=', auth.userId)
        .execute();
      throw wrong;
    }
    const user = await ctx.db
      .updateTable('users')
      .set({ email_verified_at: ctx.now(), updated_at: ctx.now() })
      .where('id', '=', auth.userId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await ctx.db.deleteFrom('email_codes').where('user_id', '=', auth.userId).execute();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.email_verified',
      ...clientInfo(req),
    });
    return { user: meView(user, ctx.now()) };
  });

  /**
   * A forgotten password: a link to the address, if it's an account's. The answer is the same
   * either way, so nobody learns which addresses are here.
   */
  app.post('/auth/reset', async (req) => {
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
  app.post('/auth/reset/confirm', async (req, reply) => {
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
    return { user: meView(user, ctx.now()), token };
  });

  app.post('/auth/recover', async (req, reply) => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`recover:ip:${ip}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const body = parse(RecoverBody, req.body);
    const identifier = body.identifier.toLowerCase().replace(/^@/, '');
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
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
    return { user: meView(user, ctx.now()), token, recoveryCodesLeft: remaining.n };
  });
}
