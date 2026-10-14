/**
 * Connected Google and Microsoft accounts (R90, `lib/connected-accounts.ts`): the ones this
 * person has, the consent link for another, the provider's return (which hands the app a sealed
 * claim and finishes nothing), redeeming that claim signed in, reading a calendar again, and
 * disconnecting. Adults only, as an app's grant is.
 */
import { AccountClaimBody, AccountStartBody } from '@caime/core';
import { isAccountProvider } from '@caime/core/accounts';
import type {
  AccountStartResponse,
  ConnectedAccountResponse,
  ConnectedAccountsResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import {
  accountConsentUrl,
  accountOf,
  accountsOf,
  accountsOffered,
  accountView,
  disconnectAccount,
  finishAccountConsent,
  redeemAccountClaim,
} from '../lib/connected-accounts';
import { forbidden, notFound } from '../lib/errors';
import { queueAccountSync } from '../lib/external-busy';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const BackQuery = z.object({
  code: z.string().max(4096).optional(),
  state: z.string().max(4096).optional(),
  error: z.string().max(200).optional(),
});

export async function connectedAccountRoutes(app: FastifyInstance, ctx: AppContext) {
  const adult = async (userId: string) => {
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden(tr('Accounts are connected by people over 18.'));
  };
  const provider = (raw: unknown) => {
    if (!isAccountProvider(raw) || !accountsOffered(ctx).includes(raw))
      throw notFound(tr('That account'));
    return raw;
  };

  app.get('/me/accounts', async (req): Promise<ConnectedAccountsResponse> => {
    const auth = requireAuth(req);
    return { accounts: await accountsOf(ctx, auth.userId), offered: accountsOffered(ctx) };
  });

  app.post('/me/accounts/:provider/start', async (req): Promise<AccountStartResponse> => {
    const auth = requireAuth(req);
    const p = provider((req.params as { provider: string }).provider);
    const body = parse(AccountStartBody, req.body);
    await adult(auth.userId);
    ctx.limiter.hit(`accounts-start:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    return { url: await accountConsentUrl(ctx, auth.userId, p, body) };
  });

  app.post('/me/accounts/:provider/claim', async (req): Promise<ConnectedAccountResponse> => {
    const auth = requireAuth(req);
    const p = provider((req.params as { provider: string }).provider);
    const body = parse(AccountClaimBody, req.body);
    await adult(auth.userId);
    const account = await redeemAccountClaim(ctx, auth.userId, p, body.claim);
    if (account.uses.includes('calendar')) await queueAccountSync(ctx, account.id);
    return { account };
  });

  /**
   * The provider's return, in whatever browser the consent was given in: the state alone says
   * where it goes, and the claim rides in the fragment, which no server reads; nothing here is
   * kept or logged but the method and the path.
   */
  app.get('/accounts/:provider/back', async (req, reply) => {
    const p = provider((req.params as { provider: string }).provider);
    ctx.limiter.hit(`accounts-back:${req.ip}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const query = parse(BackQuery, req.query);
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    return reply.redirect(await finishAccountConsent(ctx, p, query), 303);
  });

  app.post('/me/accounts/:id/sync', async (req): Promise<ConnectedAccountResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const row = await accountOf(ctx, auth.userId, id);
    ctx.limiter.hit(`accounts-sync:${id}`, ctx.config.isTest ? 1000 : 12, 3_600_000);
    if (row.uses.includes('calendar')) await queueAccountSync(ctx, id);
    return { account: accountView(row) };
  });

  app.delete('/me/accounts/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await disconnectAccount(ctx, await accountOf(ctx, auth.userId, id));
    return { ok: true };
  });
}
