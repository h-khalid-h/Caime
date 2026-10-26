/**
 * Passkeys (R36): adding one (the password first, as new recovery codes ask), listing and
 * removing them, and signing in with one: a discoverable credential, so nothing is typed, and
 * the same session, cookie and audit a password's sign-in makes. A passkey on an account that
 * is suspended, deleted or a bot's opens nothing.
 */

import { PasskeyAddBody, PasskeySignInBody, PasskeyStartBody } from '@caime/core';
import type {
  AuthResponse,
  OkResponse,
  PasskeyCeremonyResponse,
  PasskeyResponse,
  PasskeySignInOptionsResponse,
  PasskeysResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { USER_COLUMNS } from '../db/schema';
import { audit } from '../lib/audit';
import { verifyPassword } from '../lib/crypto';
import { deviceNameOf } from '../lib/device-names';
import { AppError, notFound } from '../lib/errors';
import { meViewFor } from '../lib/family';
import {
  answeredChallenge,
  keepChallenge,
  PASSKEYS_MAX,
  passkeyView,
  readSigninChallenge,
  relyingParty,
  signinChallenge,
  signingKey,
  spendSigninChallenge,
  takeChallenge,
} from '../lib/passkeys';
import { clientInfo, createSession, passwordTry } from '../lib/sessions';
import { suspendedRefusal } from '../lib/suspension';
import { meView } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const tooLate = () =>
  new AppError(400, 'passkey_failed', tr('That took too long. Try your passkey again.'));
const notThisPasskey = () =>
  new AppError(401, 'invalid_credentials', tr('That passkey doesn’t open a Caime account.'));

export async function passkeyRoutes(app: FastifyInstance, ctx: AppContext) {
  const rp = relyingParty(ctx.config);
  // The sign-in challenges' key, read once (made once, for every instance), asked again on failure.
  let key: Promise<Buffer> | null = null;
  const signing = () =>
    (key ??= signingKey(ctx).catch((err) => {
      key = null;
      throw err;
    }));

  app.get('/me/passkeys', async (req): Promise<PasskeysResponse> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('passkeys')
      .select(['id', 'name', 'backed_up', 'created_at', 'last_used_at'])
      .where('user_id', '=', auth.userId)
      .orderBy('created_at')
      .execute();
    return { passkeys: rows.map(passkeyView) };
  });

  /** Adding one, step one: the password says it's them, then the browser makes the passkey. */
  app.post('/auth/passkeys/start', async (req): Promise<PasskeyCeremonyResponse> => {
    const auth = requireAuth(req);
    passwordTry(ctx, auth.userId);
    const { password } = parse(PasskeyStartBody, req.body);
    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'handle', 'display_name', 'password_hash'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(password, user.password_hash)))
      throw new AppError(400, 'wrong_password', tr('Your password isn’t right.'));
    const existing = await ctx.db
      .selectFrom('passkeys')
      .select(['id', 'transports'])
      .where('user_id', '=', auth.userId)
      .execute();
    if (existing.length >= PASSKEYS_MAX)
      throw new AppError(
        409,
        'limit',
        tr('This account has as many passkeys as it can keep. Remove one first.'),
      );
    const options = await generateRegistrationOptions({
      rpName: rp.name,
      rpID: rp.id,
      userName: user.handle,
      userDisplayName: user.display_name,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      // One per authenticator: the browser says so rather than making a second.
      excludeCredentials: existing.map((p) => ({
        id: p.id,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const challengeId = await keepChallenge(ctx, auth.userId, options.challenge);
    return { challengeId, options: options as unknown as Record<string, unknown> };
  });

  /** Adding one, step two: what the browser made, checked, then kept. */
  app.post('/auth/passkeys', async (req): Promise<PasskeyResponse> => {
    const auth = requireAuth(req);
    const body = parse(PasskeyAddBody, req.body);
    const challenge = await takeChallenge(ctx, body.challengeId, auth.userId);
    if (!challenge) throw tooLate();
    const checked = await verifyRegistrationResponse({
      response: body.credential as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
    }).catch(() => null);
    if (!checked?.verified)
      throw new AppError(
        400,
        'passkey_failed',
        tr('That passkey couldn’t be checked, so it wasn’t added. Try again.'),
      );
    const { credential, credentialBackedUp } = checked.registrationInfo;
    const { userAgent, ip } = clientInfo(req);
    const row = await ctx.db
      .insertInto('passkeys')
      .values({
        id: credential.id,
        user_id: auth.userId,
        public_key: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        backed_up: credentialBackedUp,
        name: deviceNameOf(userAgent),
        created_at: ctx.now(),
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .returning(['id', 'name', 'backed_up', 'created_at', 'last_used_at'])
      .executeTakeFirst();
    if (!row)
      throw new AppError(409, 'passkey_failed', tr('That passkey is already on an account.'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.passkey_added',
      target: row.id,
      ip,
      userAgent,
    });
    return { passkey: passkeyView(row) };
  });

  app.delete('/me/passkeys/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().regex(/^[\w-]{1,1366}$/) }), req.params);
    const gone = await ctx.db
      .deleteFrom('passkeys')
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .returning('id')
      .executeTakeFirst();
    if (!gone) throw notFound(tr('That passkey'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'auth.passkey_removed',
      target: id,
      ...clientInfo(req),
    });
    return { ok: true };
  });

  /**
   * Signing in, step one: a challenge for whichever passkey this device holds for Caime, signed
   * and with its own deadline, so asking for one stores nothing.
   */
  app.post('/auth/passkeys/signin/options', async (req): Promise<PasskeySignInOptionsResponse> => {
    const { ip } = clientInfo(req);
    ctx.limiter.hit(`passkey-options:${ip}`, ctx.config.isTest ? 1000 : 60, 600_000);
    const options = await generateAuthenticationOptions({
      rpID: rp.id,
      userVerification: 'preferred',
      challenge: signinChallenge(await signing(), ctx.now()),
    });
    return { options: options as unknown as Record<string, unknown> };
  });

  /** Signing in, step two: the passkey's answer checked against the key it was made with. */
  app.post('/auth/passkeys/signin', async (req, reply): Promise<AuthResponse> => {
    const { ip, userAgent } = clientInfo(req);
    ctx.limiter.hit(`login:ip:${ip}`, ctx.config.isTest ? 1000 : 30, 600_000);
    const body = parse(PasskeySignInBody, req.body);
    const response = body.credential as unknown as AuthenticationResponseJSON;
    // The challenge the passkey signed must be one this server signed, still in its time.
    const challenge = answeredChallenge(response.response?.clientDataJSON);
    const issued = challenge ? readSigninChallenge(await signing(), challenge, ctx.now()) : null;
    if (!challenge || !issued) throw tooLate();
    const found =
      typeof response.id === 'string'
        ? await ctx.db
            .selectFrom('passkeys as p')
            .innerJoin('users as u', 'u.id', 'p.user_id')
            .select([
              'p.id',
              'p.user_id',
              'p.public_key',
              'p.counter',
              'p.transports',
              'u.kind',
              'u.deleted_at',
              'u.suspended_at',
              'u.suspended_reason',
            ])
            .where('p.id', '=', response.id)
            .executeTakeFirst()
        : undefined;
    const refused = async () => {
      await audit(ctx.db, {
        actorId: found?.user_id ?? null,
        action: 'auth.login_failed',
        ip,
        userAgent,
        metadata: { method: 'passkey' },
      });
      return notThisPasskey();
    };
    if (!found || found.deleted_at || found.kind !== 'human') throw await refused();
    // The account the passkey was made for, as the authenticator remembers it, must be its own.
    const handle = response.response?.userHandle;
    if (handle && Buffer.from(handle, 'base64url').toString('utf8') !== found.user_id)
      throw await refused();
    const checked = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: found.id,
        publicKey: new Uint8Array(found.public_key),
        counter: Number(found.counter),
        transports: found.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    }).catch(() => null);
    if (!checked?.verified) throw await refused();
    // Once only: the same answer sent again (or twice at once) finds its challenge spent.
    if (!(await spendSigninChallenge(ctx, challenge, issued))) throw tooLate();
    if (found.suspended_at)
      throw await suspendedRefusal(
        ctx,
        { id: found.user_id, suspended_reason: found.suspended_reason },
        true,
      );
    await ctx.db
      .updateTable('passkeys')
      .set({
        counter: checked.authenticationInfo.newCounter,
        backed_up: checked.authenticationInfo.credentialBackedUp,
        last_used_at: ctx.now(),
      })
      .where('id', '=', found.id)
      .execute();
    const user = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', '=', found.user_id)
      .executeTakeFirstOrThrow();
    const token = await createSession(ctx, req, reply, user.id, body.client, body.deviceName);
    await audit(ctx.db, {
      actorId: user.id,
      action: 'auth.login',
      ip,
      userAgent,
      metadata: { method: 'passkey' },
    });
    return { user: await meViewFor(ctx, user), token };
  });
}
