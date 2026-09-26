/**
 * Accounts and sessions (PRD §35, §55; PRODUCT-REVIEW R24, R29; ADR-7).
 */

import type { AuthResponse, DeviceSessionView, SessionResponse } from '@caishy/core';
import {
  ChangePasswordBody,
  defaultPrivacy,
  isMinor,
  isValidTimeZone,
  LoginBody,
  meetsMinimumAge,
  plausibleBirthYear,
  RecoverBody,
  SignupBody,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import {
  decoyHash,
  hashPassword,
  hashToken,
  newToken,
  normaliseRecoveryCode,
  recoveryCodes,
  verifyPassword,
} from '../lib/crypto';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { meView, regionFromLocale, seedDefaults, workweekFor } from '../lib/users';
import { parse } from '../lib/validate';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../plugins/auth';

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

async function storeRecoveryCodes(ctx: AppContext, userId: string): Promise<string[]> {
  const codes = recoveryCodes();
  await ctx.db.deleteFrom('recovery_codes').where('user_id', '=', userId).execute();
  await ctx.db
    .insertInto('recovery_codes')
    .values(
      codes.map((c) => ({
        id: uuidv7(),
        user_id: userId,
        code_hash: hashToken(normaliseRecoveryCode(c)),
      })),
    )
    .execute();
  return codes;
}

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/auth/signup', async (req, reply): Promise<AuthResponse> => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`signup:ip:${ip}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const body = parse(SignupBody, req.body);
    const now = ctx.now();
    if (!plausibleBirthYear(body.birthYear, now)) throw badRequest('Enter the year you were born.');
    if (!meetsMinimumAge(body.birthYear, now, ctx.config.MINIMUM_AGE)) {
      throw new AppError(
        400,
        'too_young',
        `You need to be at least ${ctx.config.MINIMUM_AGE} to use Caishy.`,
      );
    }
    const existing = await ctx.db
      .selectFrom('users')
      .select(['email', 'handle'])
      .where((eb) => eb.or([eb('email', '=', body.email), eb('handle', '=', body.handle)]))
      .execute();
    if (existing.some((u) => u.email.toLowerCase() === body.email)) {
      throw conflict('email_taken', 'That email already has an account. Sign in instead?');
    }
    if (existing.some((u) => u.handle.toLowerCase() === body.handle)) {
      throw conflict('handle_taken', 'That handle is taken. Try another.');
    }
    const id = uuidv7();
    const region = regionFromLocale(body.locale);
    const workweek = workweekFor(region, body.locale);
    const timeZone = body.timeZone && isValidTimeZone(body.timeZone) ? body.timeZone : 'UTC';
    const passwordHash = await hashPassword(body.password);
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('users')
        .values({
          id,
          email: body.email,
          handle: body.handle,
          password_hash: passwordHash,
          display_name: body.displayName,
          birth_year: body.birthYear,
          locale: body.locale ?? 'en',
          time_zone: timeZone,
          region,
          workweek,
          privacy: JSON.stringify(defaultPrivacy({ minor: isMinor(body.birthYear, now) })),
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
    ctx.limiter.hit(`login:id:${identifier}`, ctx.config.isTest ? 1000 : 10, 600_000);
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where((eb) => eb.or([eb('email', '=', identifier), eb('handle', '=', identifier)]))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await decoyHash()));
    if (!user || !ok) {
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
        'That email or handle and password don’t match.',
      );
    }
    const token = await createSession(ctx, req, reply, user.id, body.client, body.deviceName);
    await audit(ctx.db, { actorId: user.id, action: 'auth.login', ip, userAgent });
    return { user: meView(user, ctx.now()), token };
  });

  app.post('/auth/logout', async (req, reply) => {
    const auth = req.auth;
    if (auth) {
      await ctx.db
        .updateTable('sessions')
        .set({ revoked_at: ctx.now() })
        .where('id', '=', auth.sessionId)
        .execute();
      await audit(ctx.db, { actorId: auth.userId, action: 'auth.logout', ...clientInfo(req) });
    }
    clearSessionCookie(reply, ctx);
    return { ok: true };
  });

  app.get('/auth/session', async (req): Promise<SessionResponse> => {
    const auth = requireAuth(req);
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
    const res = await ctx.db
      .updateTable('sessions')
      .set({ revoked_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound('That session');
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
    const body = parse(ChangePasswordBody, req.body);
    const user = await ctx.db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw new AppError(400, 'wrong_password', 'Your current password isn’t right.');
    }
    await ctx.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(body.newPassword), updated_at: ctx.now() })
      .where('id', '=', auth.userId)
      .execute();
    // Changing the password signs out every other device.
    await ctx.db
      .updateTable('sessions')
      .set({ revoked_at: ctx.now() })
      .where('user_id', '=', auth.userId)
      .where('id', '<>', auth.sessionId)
      .where('revoked_at', 'is', null)
      .execute();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.password_changed',
      ...clientInfo(req),
    });
    return { ok: true };
  });

  app.post('/auth/recovery-codes', async (req) => {
    const auth = requireAuth(req);
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body);
    const user = await ctx.db
      .selectFrom('users')
      .select(['password_hash'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new AppError(400, 'wrong_password', 'Your password isn’t right.');
    }
    const codes = await storeRecoveryCodes(ctx, auth.userId);
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.recovery_codes_regenerated',
      ...clientInfo(req),
    });
    return { recoveryCodes: codes };
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
      'That recovery code doesn’t match this account.',
    );
    if (!user) throw failure;
    const used = await ctx.db
      .updateTable('recovery_codes')
      .set({ used_at: ctx.now() })
      .where('user_id', '=', user.id)
      .where('code_hash', '=', hashToken(normaliseRecoveryCode(body.code)))
      .where('used_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!used) throw failure;
    await ctx.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(body.newPassword), updated_at: ctx.now() })
      .where('id', '=', user.id)
      .execute();
    await ctx.db
      .updateTable('sessions')
      .set({ revoked_at: ctx.now() })
      .where('user_id', '=', user.id)
      .where('revoked_at', 'is', null)
      .execute();
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
