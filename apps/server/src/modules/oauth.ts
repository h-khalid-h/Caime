/**
 * OAuth for third-party apps (PRD §74). A developer registers an app with the addresses people
 * return to; someone the app sends to Caishy sees who made it and what it asks to do, and lets
 * it in or not; the app trades the code it gets back, with its PKCE verifier, for tokens that act
 * as that person, within what they allowed. They see and end it under Connected apps.
 *
 * The token and revocation endpoints answer as RFC 6749 and RFC 7009 say, so any OAuth library
 * works with them: `{ "error": "invalid_grant" }` rather than Caishy's own error shape.
 */
import {
  type ConnectedAppView,
  CreateOAuthAppBody,
  isMinor,
  isPersonalScope,
  OAUTH_REFRESH_PREFIX,
  type OAuthAppView,
  OAuthAuthorizeRequest,
  type OAuthConsentView,
  PERSONAL_SCOPE_LABELS,
  PERSONAL_SCOPES,
  type PersonalScope,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type Selectable, sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { OAuthClientsTable } from '../db/schema';
import { audit } from '../lib/audit';
import { hashToken } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import {
  allowedNow,
  CODE_TTL_MS,
  issueTokens,
  newClientId,
  newClientSecret,
  newCode,
  pkceMatches,
  revokeGrant,
  secretMatches,
} from '../lib/oauth';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const MAX_APPS = 20;

function appView(c: Selectable<OAuthClientsTable>): OAuthAppView {
  return {
    id: c.id,
    clientId: c.client_id,
    name: c.name,
    website: c.website,
    redirectUris: c.redirect_uris,
    confidential: c.secret_hash !== null,
    createdAt: c.created_at.toISOString(),
  };
}

/** An OAuth error, in the shape the specifications give (never Caishy's own). */
function oauthError(reply: FastifyReply, status: number, error: string, description: string) {
  reply.status(status).header('cache-control', 'no-store');
  return { error, error_description: description };
}

const nothingLeft = (reply: FastifyReply) =>
  oauthError(reply, 400, 'invalid_grant', 'The person no longer allows what this was for.');

/** A client's id and secret, from HTTP Basic or the body (RFC 6749 §2.3.1). */
function clientCredentials(req: FastifyRequest, body: Record<string, unknown>) {
  const basic = req.headers.authorization?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    // id:secret, split at the first colon, each half form-encoded. Garbled, it names no client.
    const pair = Buffer.from(basic, 'base64').toString('utf8');
    const colon = pair.indexOf(':');
    try {
      return {
        clientId: decodeURIComponent(colon < 0 ? pair : pair.slice(0, colon)),
        secret: colon < 0 ? undefined : decodeURIComponent(pair.slice(colon + 1)),
      };
    } catch {
      return { clientId: '', secret: undefined };
    }
  }
  return {
    clientId: typeof body.client_id === 'string' ? body.client_id : '',
    secret: typeof body.client_secret === 'string' ? body.client_secret : undefined,
  };
}

export async function oauthRoutes(app: FastifyInstance, ctx: AppContext) {
  // --- Apps a developer registers -------------------------------------------------------------

  app.get('/me/oauth-apps', async (req): Promise<{ apps: OAuthAppView[] }> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('oauth_clients')
      .selectAll()
      .where('owner_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    return { apps: rows.map(appView) };
  });

  app.post('/me/oauth-apps', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateOAuthAppBody, req.body);
    const me = await ctx.db
      .selectFrom('users')
      .select('birth_year')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (isMinor(me.birth_year, ctx.now())) throw forbidden('Apps are made by people over 18.');
    ctx.limiter.hit(`oauth-app:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const live = await ctx.db
      .selectFrom('oauth_clients')
      .select('id')
      .where('owner_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .execute();
    if (live.length >= MAX_APPS) throw badRequest(`You have ${MAX_APPS} apps. Remove one first.`);
    const secret = body.confidential ? newClientSecret() : null;
    const row = await ctx.db
      .insertInto('oauth_clients')
      .values({
        id: uuidv7(),
        client_id: newClientId(),
        owner_id: auth.userId,
        name: body.name,
        website: body.website ?? null,
        redirect_uris: [...new Set(body.redirectUris)],
        secret_hash: secret ? hashToken(secret) : null,
        created_at: ctx.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, { actorId: auth.userId, action: 'oauth.app_created', target: row.id });
    reply.status(201);
    // The secret, this once: only its hash is kept.
    return { app: appView(row), clientSecret: secret };
  });

  app.delete('/me/oauth-apps/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const done = await ctx.db
      .updateTable('oauth_clients')
      .set({ revoked_at: ctx.now() })
      .where('id', '=', id)
      .where('owner_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!done) throw notFound('That app');
    // Everyone it acted for is let go of at once.
    const grants = await ctx.db
      .selectFrom('oauth_grants')
      .select('id')
      .where('client_id', '=', id)
      .where('revoked_at', 'is', null)
      .execute();
    for (const g of grants) await revokeGrant(ctx, g.id);
    await audit(ctx.db, { actorId: auth.userId, action: 'oauth.app_removed', target: id });
    return { ok: true };
  });

  // --- Someone lets an app in -------------------------------------------------------------------

  /** The request an app made, checked: nothing is shown for one that isn't what it says. */
  async function checkRequest(raw: unknown) {
    const r = parse(OAuthAuthorizeRequest, raw);
    const client = await ctx.db
      .selectFrom('oauth_clients as c')
      .innerJoin('users as u', 'u.id', 'c.owner_id')
      .select([
        'c.id',
        'c.name',
        'c.website',
        'c.redirect_uris',
        'u.display_name as owner_name',
        'u.handle as owner_handle',
      ])
      .where('c.client_id', '=', r.client_id)
      .where('c.revoked_at', 'is', null)
      .executeTakeFirst();
    if (!client) throw badRequest('That app isn’t registered with Caishy.');
    // Exactly one it registered, or nowhere at all: never an address it didn't name.
    if (!client.redirect_uris.includes(r.redirect_uri))
      throw badRequest('That app didn’t register this return address.');
    const scopes = [...new Set(r.scope.split(/\s+/).filter(Boolean))];
    if (!scopes.length) throw badRequest('The app didn’t say what it wants to do.');
    const unknown = scopes.find((s) => !isPersonalScope(s));
    if (unknown) throw badRequest(`“${unknown}” isn’t something an app can ask for.`);
    return { r, client, scopes: scopes as PersonalScope[] };
  }

  app.get('/oauth/authorize', async (req): Promise<OAuthConsentView> => {
    const auth = requireAuth(req);
    const { r, client, scopes } = await checkRequest(req.query);
    const before = await ctx.db
      .selectFrom('oauth_grants')
      .select('scopes')
      .where('client_id', '=', client.id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return {
      app: {
        name: client.name,
        website: client.website,
        owner: { displayName: client.owner_name, handle: client.owner_handle },
      },
      scopes: scopes.map((s) => ({ scope: s, label: PERSONAL_SCOPE_LABELS[s] })),
      redirectUri: r.redirect_uri,
      allowedBefore: Boolean(before && scopes.every((s) => before.scopes.includes(s))),
    };
  });

  app.post('/oauth/authorize', async (req) => {
    const auth = requireAuth(req);
    const { decision, ...rest } = (req.body ?? {}) as Record<string, unknown>;
    const { r, client, scopes } = await checkRequest(rest);
    const back = new URL(r.redirect_uri);
    if (r.state) back.searchParams.set('state', r.state);
    if (decision !== 'allow') {
      back.searchParams.set('error', 'access_denied');
      return { redirect: back.toString() };
    }
    const me = await ctx.db
      .selectFrom('users')
      .select('birth_year')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (isMinor(me.birth_year, ctx.now())) throw forbidden('Apps act for people over 18.');
    ctx.limiter.hit(`oauth-allow:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    // One grant per app and person, and allowing again only adds to it: an app asking for one
    // more thing (or another install of it asking for less) never loses what it was allowed.
    // The person takes it all back by removing the app. One statement, so two at once agree.
    const { id: grantId } = await ctx.db
      .insertInto('oauth_grants')
      .values({
        id: uuidv7(),
        client_id: client.id,
        user_id: auth.userId,
        scopes,
        created_at: ctx.now(),
      })
      .onConflict((oc) =>
        oc
          .columns(['client_id', 'user_id'])
          .where('revoked_at', 'is', null)
          .doUpdateSet({
            scopes: sql<string[]>`array(
              select s from unnest(oauth_grants.scopes || excluded.scopes) with ordinality as t(s, i)
              group by s order by min(i))`,
          }),
      )
      .returning('id')
      .executeTakeFirstOrThrow();
    const code = newCode();
    await ctx.db
      .insertInto('oauth_codes')
      .values({
        code_hash: hashToken(code),
        grant_id: grantId,
        redirect_uri: r.redirect_uri,
        code_challenge: r.code_challenge,
        scopes,
        expires_at: new Date(ctx.now().getTime() + CODE_TTL_MS),
      })
      .execute();
    await audit(ctx.db, { actorId: auth.userId, action: 'oauth.allowed', target: client.id });
    back.searchParams.set('code', code);
    return { redirect: back.toString() };
  });

  // --- The app trades a code, or a refresh token, for tokens ------------------------------------

  /**
   * The app calling the token or revocation endpoint: a confidential one proves itself with its
   * secret; a public one only names itself here, and proves itself by PKCE.
   */
  async function callingClient(req: FastifyRequest, body: Record<string, unknown>) {
    const { clientId, secret } = clientCredentials(req, body);
    const client = clientId
      ? await ctx.db
          .selectFrom('oauth_clients')
          .select(['id', 'secret_hash'])
          .where('client_id', '=', clientId)
          .where('revoked_at', 'is', null)
          .executeTakeFirst()
      : undefined;
    if (!client || (client.secret_hash && !secretMatches(secret, client.secret_hash))) return null;
    return client;
  }
  const unknownClient = (reply: FastifyReply) =>
    oauthError(reply, 401, 'invalid_client', 'That app isn’t known, or its secret is wrong.');

  // Only these two take forms, as OAuth clients send them, and they answer every refusal the
  // way RFC 6749 does. A form anywhere else would let any site post to Caishy: a login, say.
  await app.register(async (forms) => {
    forms.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 16_384 },
      (_req, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );
    forms.setErrorHandler((error, req, reply) => {
      const err = error as Error & { statusCode?: number };
      if (err instanceof AppError && err.code === 'rate_limited') {
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)
          ?.retryAfterSeconds;
        if (retry) reply.header('retry-after', String(retry));
        return reply.send(
          oauthError(reply, 429, 'temporarily_unavailable', 'Too many requests. Try again soon.'),
        );
      }
      const status = err instanceof AppError ? err.status : err.statusCode;
      if (status && status >= 400 && status < 500)
        return reply.send(oauthError(reply, status, 'invalid_request', err.message));
      req.log.error({ err }, 'unhandled error');
      return reply.send(
        oauthError(reply, 500, 'server_error', 'Something went wrong on our side.'),
      );
    });
    await tokenEndpoints(forms);
  });

  async function tokenEndpoints(app: FastifyInstance) {
    app.post('/oauth/token', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      reply.header('cache-control', 'no-store');
      // Generous: a server-side app refreshes for everyone it acts for, from one address.
      ctx.limiter.hit(`oauth-token:${req.ip}`, ctx.config.isTest ? 10_000 : 600, 60_000);
      const client = await callingClient(req, body);
      if (!client) return unknownClient(reply);

      if (body.grant_type === 'authorization_code') {
        const code = typeof body.code === 'string' ? body.code : '';
        const found = await ctx.db
          .selectFrom('oauth_codes as k')
          .innerJoin('oauth_grants as g', 'g.id', 'k.grant_id')
          .select([
            'k.code_hash',
            'k.grant_id',
            'k.redirect_uri',
            'k.code_challenge',
            'k.scopes',
            'k.expires_at',
            'k.used_at',
            'g.client_id',
            'g.revoked_at',
            'g.scopes as grant_scopes',
          ])
          .where('k.code_hash', '=', hashToken(code))
          .executeTakeFirst();
        if (!found || found.client_id !== client.id || found.revoked_at)
          return oauthError(reply, 400, 'invalid_grant', 'That code isn’t valid.');
        // Expired first: a dead code turning up later (from a log, a history) harms nothing, so
        // it ends nothing either.
        if (found.expires_at <= ctx.now())
          return oauthError(reply, 400, 'invalid_grant', 'That code has expired.');
        if (found.used_at) {
          // A code used twice in its ten minutes was taken: end what it gave (RFC 6749 §4.1.2).
          await revokeGrant(ctx, found.grant_id);
          return oauthError(reply, 400, 'invalid_grant', 'That code was already used.');
        }
        if (body.redirect_uri !== found.redirect_uri)
          return oauthError(reply, 400, 'invalid_grant', 'The return address doesn’t match.');
        const verifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';
        if (!pkceMatches(verifier, found.code_challenge))
          return oauthError(reply, 400, 'invalid_grant', 'The PKCE verifier doesn’t match.');
        const claimed = await ctx.db
          .updateTable('oauth_codes')
          .set({ used_at: ctx.now() })
          .where('code_hash', '=', found.code_hash)
          .where('used_at', 'is', null)
          .returning('grant_id')
          .executeTakeFirst();
        if (!claimed) return oauthError(reply, 400, 'invalid_grant', 'That code was already used.');
        // Allowed again for less since this code was made: the person's latest answer holds.
        const scopes = allowedNow(found.scopes, found.grant_scopes);
        if (!scopes.length) return nothingLeft(reply);
        return issueTokens(ctx, found.grant_id, scopes);
      }

      if (body.grant_type === 'refresh_token') {
        const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
        if (!token.startsWith(OAUTH_REFRESH_PREFIX))
          return oauthError(reply, 400, 'invalid_grant', 'That refresh token isn’t valid.');
        const found = await ctx.db
          .selectFrom('oauth_tokens as k')
          .innerJoin('oauth_grants as g', 'g.id', 'k.grant_id')
          .select([
            'k.id',
            'k.grant_id',
            'k.scopes',
            'k.expires_at',
            'k.used_at',
            'k.revoked_at',
            'g.client_id',
            'g.revoked_at as grant_revoked_at',
            'g.scopes as grant_scopes',
          ])
          .where('k.token_hash', '=', hashToken(token))
          .where('k.kind', '=', 'refresh')
          .executeTakeFirst();
        if (!found || found.client_id !== client.id || found.grant_revoked_at || found.revoked_at)
          return oauthError(reply, 400, 'invalid_grant', 'That refresh token isn’t valid.');
        if (found.used_at) {
          // Used twice: one of the two is a thief's. End the grant for both.
          await revokeGrant(ctx, found.grant_id);
          return oauthError(reply, 400, 'invalid_grant', 'That refresh token was already used.');
        }
        if (found.expires_at <= ctx.now())
          return oauthError(reply, 400, 'invalid_grant', 'That refresh token has expired.');
        const claimed = await ctx.db
          .updateTable('oauth_tokens')
          .set({ used_at: ctx.now() })
          .where('id', '=', found.id)
          .where('used_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (!claimed) {
          await revokeGrant(ctx, found.grant_id);
          return oauthError(reply, 400, 'invalid_grant', 'That refresh token was already used.');
        }
        const scopes = allowedNow(found.scopes, found.grant_scopes);
        if (!scopes.length) return nothingLeft(reply);
        return issueTokens(ctx, found.grant_id, scopes);
      }

      return oauthError(
        reply,
        400,
        'unsupported_grant_type',
        'Use authorization_code or refresh_token.',
      );
    });

    /**
     * RFC 7009: the app gives a token back. Only its own: another app's token, or one that isn't
     * a token at all, answers "ok" all the same, so nothing is learned from asking.
     */
    app.post('/oauth/revoke', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      reply.header('cache-control', 'no-store');
      ctx.limiter.hit(`oauth-revoke:${req.ip}`, ctx.config.isTest ? 10_000 : 120, 60_000);
      const client = await callingClient(req, body);
      if (!client) return unknownClient(reply);
      const token = typeof body.token === 'string' ? body.token : '';
      const found = token
        ? await ctx.db
            .selectFrom('oauth_tokens as k')
            .innerJoin('oauth_grants as g', 'g.id', 'k.grant_id')
            .select(['k.id', 'k.grant_id', 'k.kind'])
            .where('k.token_hash', '=', hashToken(token))
            .where('g.client_id', '=', client.id)
            .executeTakeFirst()
        : undefined;
      if (found) {
        // Giving back the refresh token ends the grant; an access token, only itself.
        if (found.kind === 'refresh') await revokeGrant(ctx, found.grant_id);
        else
          await ctx.db
            .updateTable('oauth_tokens')
            .set({ revoked_at: ctx.now() })
            .where('id', '=', found.id)
            .execute();
      }
      return {};
    });
  }

  // --- Apps someone let in ----------------------------------------------------------------------

  app.get('/me/connected-apps', async (req): Promise<{ apps: ConnectedAppView[] }> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('oauth_grants as g')
      .innerJoin('oauth_clients as c', 'c.id', 'g.client_id')
      .innerJoin('users as u', 'u.id', 'c.owner_id')
      .select([
        'g.id',
        'g.scopes',
        'g.created_at',
        'g.last_used_at',
        'c.name',
        'c.website',
        'u.display_name as owner',
      ])
      .where('g.user_id', '=', auth.userId)
      .where('g.revoked_at', 'is', null)
      .where('c.revoked_at', 'is', null)
      .orderBy('g.created_at', 'desc')
      .execute();
    return {
      apps: rows.map((r) => ({
        grantId: r.id,
        name: r.name,
        website: r.website,
        owner: r.owner,
        scopes: r.scopes,
        createdAt: r.created_at.toISOString(),
        lastUsedAt: r.last_used_at?.toISOString() ?? null,
      })),
    };
  });

  app.delete('/me/connected-apps/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const grant = await ctx.db
      .selectFrom('oauth_grants')
      .select(['id', 'client_id'])
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!grant) throw notFound('That app');
    await revokeGrant(ctx, grant.id);
    await audit(ctx.db, { actorId: auth.userId, action: 'oauth.removed', target: grant.client_id });
    return { ok: true };
  });
}

/**
 * RFC 8414: where everything is, so an OAuth library configures itself from one address. At the
 * site's root, beside the web app that asks people.
 */
export async function oauthDiscovery(app: FastifyInstance, ctx: AppContext) {
  const base = new URL(ctx.config.PUBLIC_URL).origin;
  const auth = ['none', 'client_secret_basic', 'client_secret_post'];
  app.get('/.well-known/oauth-authorization-server', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/v1/oauth/token`,
      revocation_endpoint: `${base}/v1/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: auth,
      revocation_endpoint_auth_methods_supported: auth,
      scopes_supported: [...PERSONAL_SCOPES],
    };
  });
}
