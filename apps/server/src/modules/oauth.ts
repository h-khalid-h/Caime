/**
 * OAuth for third-party apps (PRD §74). A developer registers an app with the addresses people
 * return to; someone the app sends to Caime sees who made it and what it asks to do, and lets
 * it in or not; the app trades the code it gets back, with its PKCE verifier, for tokens that act
 * as that person, within what they allowed. They see and end it under Apps · Connected (R74).
 *
 * The token and revocation endpoints answer as RFC 6749 and RFC 7009 say, so any OAuth library
 * works with them: `{ "error": "invalid_grant" }` rather than Caime's own error shape.
 */
import {
  appIconPath,
  CreateOAuthAppBody,
  canManageOrg,
  isPersonalScope,
  ListOAuthAppBody,
  OAUTH_REFRESH_PREFIX,
  type OAuthAppView,
  OAuthAuthorizeRequest,
  type OAuthConsentView,
  PERSONAL_SCOPE_LABELS,
  PERSONAL_SCOPES,
  type PersonalScope,
  uuidv7,
} from '@caime/core';
import type {
  ConnectedAppsResponse,
  ConnectedAppView,
  OAuthAppCreatedResponse,
  OAuthAppResponse,
  OAuthAppsResponse,
  OAuthErrorResponse,
  OAuthRedirectResponse,
  OAuthServerMetadata,
  OAuthTokenResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type Selectable, sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { OAuthClientsTable } from '../db/schema';
import {
  builtinApps,
  builtinConnectedView,
  countConnected,
  listingState,
  listingView,
} from '../lib/app-directory';
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
import { orgSeat } from '../lib/orgs';
import { minorOf } from '../lib/users';
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
    listing: listingView(c),
  };
}

/** The origin Connect may send people to: one the app already returns to, or its website. */
function ownOrigins(c: Pick<Selectable<OAuthClientsTable>, 'redirect_uris' | 'website'>) {
  const origins = new Set<string>();
  for (const u of [...c.redirect_uris, c.website]) {
    if (!u) continue;
    try {
      origins.add(new URL(u).origin);
    } catch {}
  }
  return origins;
}

/** An OAuth error, in the shape the specifications give (never Caime's own). */
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

  app.get('/me/oauth-apps', async (req): Promise<OAuthAppsResponse> => {
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

  app.post('/me/oauth-apps', async (req, reply): Promise<OAuthAppCreatedResponse> => {
    const auth = requireAuth(req);
    const body = parse(CreateOAuthAppBody, req.body);
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden(tr('Apps are made by people over 18.'));
    ctx.limiter.hit(`oauth-app:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const live = await ctx.db
      .selectFrom('oauth_clients')
      .select('id')
      .where('owner_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .execute();
    if (live.length >= MAX_APPS)
      throw badRequest(tr('You have {MAX_APPS} apps. Remove one first.', { MAX_APPS }));
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

  /**
   * What an app says of itself in Discover (R74), and whether it asks to be there. Listing it
   * needs a tagline, a category and where Connect sends people (an https address at an origin
   * the app already returns to, or its website's, so a listing never sends anyone elsewhere);
   * the icon is an image its owner uploaded; the organization is one they manage. Any change
   * to what's shown puts a listed app back in the operator's queue.
   */
  app.patch('/me/oauth-apps/:id', async (req): Promise<OAuthAppResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ListOAuthAppBody, req.body);
    const row = await ctx.db.transaction().execute(async (trx) => {
      const c = await trx
        .selectFrom('oauth_clients')
        .selectAll()
        .where('id', '=', id)
        .where('owner_id', '=', auth.userId)
        .where('revoked_at', 'is', null)
        .forUpdate()
        .executeTakeFirst();
      if (!c) throw notFound(tr('That app'));
      const next = {
        tagline: body.tagline === undefined ? c.tagline : body.tagline || null,
        description: body.description === undefined ? c.description : body.description || null,
        category: body.category === undefined ? c.category : body.category,
        login_url: body.loginUrl === undefined ? c.login_url : body.loginUrl,
        icon_file_id: body.iconFileId === undefined ? c.icon_file_id : body.iconFileId,
        org_id: body.orgId === undefined ? c.org_id : body.orgId,
      };
      if (next.icon_file_id && next.icon_file_id !== c.icon_file_id) {
        const mine = await trx
          .selectFrom('files')
          .select('id')
          .where('id', '=', next.icon_file_id)
          .where('owner_id', '=', auth.userId)
          .where('kind', '=', 'image')
          .where('status', '=', 'ready')
          .where('thumb_key', 'is not', null)
          .executeTakeFirst();
        if (!mine) throw badRequest(tr('Choose an image you uploaded.'));
      }
      if (next.org_id && next.org_id !== c.org_id) {
        const seat = await orgSeat(trx, auth.userId, next.org_id);
        if (!canManageOrg(seat?.role))
          throw forbidden(tr('Only an organization’s owner or admins publish apps under it.'));
      }
      if (next.login_url && !ownOrigins(c).has(new URL(next.login_url).origin))
        throw badRequest(
          tr(
            'Connect must send people to the app’s own address: one it returns to, or its website.',
          ),
        );
      const listed = body.listed ?? listingState(c) !== 'none';
      if (listed && !(next.tagline && next.category && next.login_url))
        throw badRequest(tr('A listing needs a tagline, a category and where Connect goes.'));
      const shownChanged = (Object.keys(next) as Array<keyof typeof next>).some(
        (k) => next[k] !== c[k],
      );
      const marks = !listed
        ? { listed_at: null, reviewed_at: null, declined_reason: null }
        : !c.listed_at || shownChanged
          ? // Asked anew, dated: the operator looks at what's shown now, and lets through only
            // the version they looked at.
            { listed_at: ctx.now(), reviewed_at: null, declined_reason: null }
          : {};
      const updated = await trx
        .updateTable('oauth_clients')
        .set({
          ...next,
          ...marks,
          ...(shownChanged ? { listing_rev: sql`listing_rev + 1` } : {}),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      const action =
        !listed && c.listed_at
          ? 'oauth.listing_withdrawn'
          : 'listed_at' in marks
            ? 'oauth.listing_asked'
            : 'oauth.app_updated';
      await audit(trx, { actorId: auth.userId, action, target: id });
      return updated;
    });
    return { app: appView(row) };
  });

  app.delete('/me/oauth-apps/:id', async (req): Promise<OkResponse> => {
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
    if (!done) throw notFound(tr('That app'));
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
    if (!client) throw badRequest(tr('That app isn’t registered with Caime.'));
    // Exactly one it registered, or nowhere at all: never an address it didn't name.
    if (!client.redirect_uris.includes(r.redirect_uri))
      throw badRequest(tr('That app didn’t register this return address.'));
    const scopes = [...new Set(r.scope.split(/\s+/).filter(Boolean))];
    if (!scopes.length) throw badRequest(tr('The app didn’t say what it wants to do.'));
    const unknown = scopes.find((s) => !isPersonalScope(s));
    if (unknown)
      throw badRequest(tr('“{unknown}” isn’t something an app can ask for.', { unknown }));
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
      // In the request's language: the consent screen shows it as it came.
      scopes: scopes.map((s) => ({ scope: s, label: tr(PERSONAL_SCOPE_LABELS[s]) })),
      redirectUri: r.redirect_uri,
      allowedBefore: Boolean(before && scopes.every((s) => before.scopes.includes(s))),
    };
  });

  app.post('/oauth/authorize', async (req): Promise<OAuthRedirectResponse | FastifyReply> => {
    const auth = requireAuth(req);
    const { decision, ...rest } = (req.body ?? {}) as Record<string, unknown>;
    const { r, client, scopes } = await checkRequest(rest);
    const back = new URL(r.redirect_uri);
    if (r.state) back.searchParams.set('state', r.state);
    // RFC 9207: the answer names who gave it, so a client with several servers can't be mixed up.
    back.searchParams.set('iss', new URL(ctx.config.PUBLIC_URL).origin);
    if (decision !== 'allow') {
      back.searchParams.set('error', 'access_denied');
      return { redirect: back.toString() };
    }
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden(tr('Apps act for people over 18.'));
    ctx.limiter.hit(`oauth-allow:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    // One grant per app and person, and allowing again only adds to it: an app asking for one
    // more thing (or another install of it asking for less) never loses what it was allowed.
    // The person takes it all back by removing the app. One statement, so two at once agree.
    // A first grant counts one more connected for Discover (R74), in the grant's own transaction.
    const grantId = await ctx.db.transaction().execute(async (trx) => {
      const { id, inserted } = await trx
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
        .returning(['id', sql<boolean>`(xmax = 0)`.as('inserted')])
        .executeTakeFirstOrThrow();
      if (inserted) await countConnected(trx, client.id, 1);
      return id;
    });
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
  // way RFC 6749 does. A form anywhere else would let any site post to Caime: a login, say.
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
    app.post(
      '/oauth/token',
      async (req, reply): Promise<OAuthTokenResponse | OAuthErrorResponse> => {
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
          if (!claimed)
            return oauthError(reply, 400, 'invalid_grant', 'That code was already used.');
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
      },
    );

    /**
     * RFC 7009: the app gives a token back. Only its own: another app's token, or one that isn't
     * a token at all, answers "ok" all the same, so nothing is learned from asking.
     */
    app.post(
      '/oauth/revoke',
      async (req, reply): Promise<Record<string, never> | OAuthErrorResponse> => {
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
      },
    );
  }

  // --- Apps someone let in ----------------------------------------------------------------------

  app.get('/me/connected-apps', async (req): Promise<ConnectedAppsResponse> => {
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
        'c.id as client_id',
        'c.name',
        'c.website',
        'c.icon_file_id',
        'u.display_name as owner',
      ])
      .where('g.user_id', '=', auth.userId)
      .where('g.revoked_at', 'is', null)
      .where('c.revoked_at', 'is', null)
      .orderBy('g.created_at', 'desc')
      .execute();
    // Caime's own that are on (the calendar address) are rows of the same kind (R74).
    const own = (await builtinApps(ctx, auth.userId))
      .map(builtinConnectedView)
      .filter((a): a is ConnectedAppView => a !== null);
    const apps: ConnectedAppView[] = [
      ...own,
      ...rows.map((r) => ({
        kind: 'oauth' as const,
        appId: r.client_id,
        grantId: r.id,
        name: r.name,
        website: r.website,
        owner: r.owner,
        iconUrl: appIconPath(r.client_id, r.icon_file_id),
        scopes: r.scopes,
        createdAt: r.created_at.toISOString(),
        lastUsedAt: r.last_used_at?.toISOString() ?? null,
      })),
    ];
    return { apps };
  });

  app.delete('/me/connected-apps/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const grant = await ctx.db
      .selectFrom('oauth_grants')
      .select(['id', 'client_id'])
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!grant) throw notFound(tr('That app'));
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
  app.get(
    '/.well-known/oauth-authorization-server',
    async (_req, reply): Promise<OAuthServerMetadata> => {
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
        authorization_response_iss_parameter_supported: true,
        scopes_supported: [...PERSONAL_SCOPES],
      };
    },
  );
}
