/**
 * Personal access tokens (PRD §74): someone's own, for their own scripts. Made here with a name,
 * the permissions it needs and how long it lasts, shown once, and revoked at any time. A bridge's
 * token (R79) is one of these made for an automation platform in one tap: named after it, one
 * live per platform, until it's stopped. Only a signed-in person reaches these routes: no token
 * can make or list tokens.
 */
import { BridgeBody, bridgeOf, CreatePersonalTokenBody, uuidv7 } from '@caime/core';
import type {
  OkResponse,
  PersonalTokenCreatedResponse,
  PersonalTokensResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { newPersonalToken, personalTokenView, revokePersonalToken } from '../lib/access';
import { builtinCountsChanged } from '../lib/app-directory';
import { audit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const DAY_MS = 86_400_000;
/** Enough for anyone's scripts; more is a sign something is minting them. */
const MAX_TOKENS = 20;

export async function tokenRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Tokens act for adults (R29), and nobody mints them by the hundred. */
  async function assertMayMake(userId: string) {
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden(tr('Access tokens are for people over 18.'));
    ctx.limiter.hit(`token-create:${userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
  }

  /** The live tokens that stay: a bridge's own is replaced, so it isn't counted against it. */
  async function assertRoom(userId: string, replacing: string | null) {
    const live = await ctx.db
      .selectFrom('personal_tokens')
      .select('id')
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .$if(replacing !== null, (qb) =>
        qb.where((eb) => eb.or([eb('bridge', 'is', null), eb('bridge', '<>', replacing)])),
      )
      .execute();
    if (live.length >= MAX_TOKENS)
      throw badRequest(
        tr('You have {MAX_TOKENS} tokens. Revoke one you don’t use first.', { MAX_TOKENS }),
      );
  }

  app.get('/me/tokens', async (req): Promise<PersonalTokensResponse> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('personal_tokens')
      .selectAll()
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    return { tokens: rows.map(personalTokenView) };
  });

  app.post('/me/tokens', async (req, reply): Promise<PersonalTokenCreatedResponse> => {
    const auth = requireAuth(req);
    const body = parse(CreatePersonalTokenBody, req.body);
    await assertMayMake(auth.userId);
    await assertRoom(auth.userId, null);
    const { token, prefix, hash } = newPersonalToken();
    const row = await ctx.db
      .insertInto('personal_tokens')
      .values({
        id: uuidv7(),
        user_id: auth.userId,
        name: body.name,
        scopes: [...new Set(body.scopes)],
        prefix,
        token_hash: hash,
        expires_at: body.days ? new Date(ctx.now().getTime() + body.days * DAY_MS) : null,
        created_at: ctx.now(),
        bridge: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, { actorId: auth.userId, action: 'token.created', target: row.id });
    reply.status(201);
    // The token itself, this once: only its hash is kept.
    return { token, view: personalTokenView(row) };
  });

  app.delete('/me/tokens/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await revokePersonalToken(ctx, auth.userId, id))) throw notFound(tr('That token'));
    await audit(ctx.db, { actorId: auth.userId, action: 'token.revoked', target: id });
    return { ok: true };
  });

  const bridgeParam = z.object({ id: z.string().min(1).max(20) });

  /**
   * A bridge connected (R79): a token for the platform, named after it, with what the person
   * ticked, no expiry. One lives per platform: a new one ends the old in the same transaction,
   * so "get a new token" is this same tap, and the row never shows two.
   */
  app.post('/me/bridges/:id', async (req, reply): Promise<PersonalTokenCreatedResponse> => {
    const auth = requireAuth(req);
    const bridge = bridgeOf(parse(bridgeParam, req.params).id);
    if (!bridge) throw notFound(tr('That app'));
    const body = parse(BridgeBody, req.body);
    await assertMayMake(auth.userId);
    await assertRoom(auth.userId, bridge.id);
    const { token, prefix, hash } = newPersonalToken();
    const now = ctx.now();
    const row = await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('personal_tokens')
        .set({ revoked_at: now })
        .where('user_id', '=', auth.userId)
        .where('bridge', '=', bridge.id)
        .where('revoked_at', 'is', null)
        .execute();
      return trx
        .insertInto('personal_tokens')
        .values({
          id: uuidv7(),
          user_id: auth.userId,
          name: bridge.name,
          scopes: [...new Set(body.scopes)],
          prefix,
          token_hash: hash,
          expires_at: null,
          created_at: now,
          bridge: bridge.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'token.created',
      target: row.id,
      metadata: { bridge: bridge.id },
    });
    builtinCountsChanged(ctx);
    await ctx.bus.publish([auth.userId], { type: 'apps.changed', data: { app: bridge.id } });
    reply.status(201);
    return { token, view: personalTokenView(row) };
  });

  /** A bridge stopped: its token ends at once, and so does every recipe holding it. */
  app.delete('/me/bridges/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const bridge = bridgeOf(parse(bridgeParam, req.params).id);
    if (!bridge) throw notFound(tr('That app'));
    const ended = await ctx.db
      .updateTable('personal_tokens')
      .set({ revoked_at: ctx.now() })
      .where('user_id', '=', auth.userId)
      .where('bridge', '=', bridge.id)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!ended) throw notFound(tr('That app'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'token.revoked',
      target: ended.id,
      metadata: { bridge: bridge.id },
    });
    builtinCountsChanged(ctx);
    await ctx.bus.publish([auth.userId], { type: 'apps.changed', data: { app: bridge.id } });
    return { ok: true };
  });
}
