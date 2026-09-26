/**
 * Personal access tokens (PRD §74): someone's own, for their own scripts. Made here with a name,
 * the permissions it needs and how long it lasts, shown once, and revoked at any time. Only a
 * signed-in person reaches these routes: no token can make or list tokens.
 */
import { CreatePersonalTokenBody, isMinor, type PersonalTokenView, uuidv7 } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { newPersonalToken, personalTokenView } from '../lib/access';
import { audit } from '../lib/audit';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const DAY_MS = 86_400_000;
/** Enough for anyone's scripts; more is a sign something is minting them. */
const MAX_TOKENS = 20;

export async function tokenRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/me/tokens', async (req): Promise<{ tokens: PersonalTokenView[] }> => {
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

  app.post('/me/tokens', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreatePersonalTokenBody, req.body);
    const me = await ctx.db
      .selectFrom('users')
      .select('birth_year')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (isMinor(me.birth_year, ctx.now())) throw forbidden('Access tokens are for people over 18.');
    ctx.limiter.hit(`token-create:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const live = await ctx.db
      .selectFrom('personal_tokens')
      .select('id')
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .execute();
    if (live.length >= MAX_TOKENS)
      throw badRequest(`You have ${MAX_TOKENS} tokens. Revoke one you don’t use first.`);
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
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, { actorId: auth.userId, action: 'token.created', target: row.id });
    reply.status(201);
    // The token itself, this once: only its hash is kept.
    return { token, view: personalTokenView(row) };
  });

  app.delete('/me/tokens/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const done = await ctx.db
      .updateTable('personal_tokens')
      .set({ revoked_at: ctx.now() })
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!done) throw notFound('That token');
    await audit(ctx.db, { actorId: auth.userId, action: 'token.revoked', target: id });
    return { ok: true };
  });
}
