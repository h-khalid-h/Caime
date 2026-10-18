/**
 * Connected Google and Microsoft accounts (R90, `lib/connected-accounts.ts`): the ones this
 * person has, the consent link for another, the provider's return (which hands the app a sealed
 * claim and finishes nothing), redeeming that claim signed in, reading a calendar again, and
 * disconnecting. Adults only, as an app's grant is.
 */
import { randomBytes } from 'node:crypto';
import {
  AccountClaimBody,
  AccountFilesQuery,
  AccountImportBody,
  AccountStartBody,
} from '@caime/core';
import { isAccountProvider } from '@caime/core/accounts';
import {
  type AccountFilesResponse,
  type AccountStartResponse,
  APP_SCHEME,
  type ConnectedAccountResponse,
  type ConnectedAccountsResponse,
  type FileResponse,
  type OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { queueAccountPush } from '../lib/calendar-push';
import {
  filesAccess,
  googlePickerOn,
  googlePickerPage,
  importAccountFile,
  listAccountFiles,
  usesOffered,
} from '../lib/cloud-files';
import {
  accountConsentUrl,
  accountOf,
  accountsOf,
  accountsOffered,
  accountView,
  disconnectAccount,
  finishAccountConsent,
  openPickerTicket,
  pickerTicket,
  redeemAccountClaim,
} from '../lib/connected-accounts';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { queueAccountSync } from '../lib/external-busy';
import { fileView } from '../lib/messages';
import { storageFor } from '../lib/storage';
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
      .select(['birth_date', 'time_zone', 'age_minor_until'])
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
    return {
      accounts: await accountsOf(ctx, auth.userId),
      offered: accountsOffered(ctx),
      usesOffered: usesOffered(ctx.config),
    };
  });

  app.post('/me/accounts/:provider/start', async (req): Promise<AccountStartResponse> => {
    const auth = requireAuth(req);
    const p = provider((req.params as { provider: string }).provider);
    const body = parse(AccountStartBody, req.body);
    if (body.uses.some((u) => !usesOffered(ctx.config)[p].includes(u)))
      throw badRequest(tr('That isn’t offered for this account here.'));
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
    // Plans written now (R96), or, turned off at the provider, what was written taken out.
    await queueAccountPush(ctx, account.id);
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

  // --- Files (R90): a OneDrive's folders browsed in Caime, Google's picked in its own picker,
  // and the one picked copied in as the person's upload.
  const storage = storageFor(ctx.config);
  const idParam = (req: { params: unknown }) =>
    parse(z.object({ id: z.string().uuid() }), req.params).id;

  app.get('/me/accounts/:id/files', async (req): Promise<AccountFilesResponse> => {
    const auth = requireAuth(req);
    const row = await accountOf(ctx, auth.userId, idParam(req));
    ctx.limiter.hit(`accounts-files:${auth.userId}`, ctx.config.isTest ? 1000 : 600, 3_600_000);
    return listAccountFiles(ctx, row, parse(AccountFilesQuery, req.query));
  });

  app.post('/me/accounts/:id/files/import', async (req, reply): Promise<FileResponse> => {
    const auth = requireAuth(req);
    const row = await accountOf(ctx, auth.userId, idParam(req));
    const { fileId } = parse(AccountImportBody, req.body);
    ctx.limiter.hit(`accounts-import:${auth.userId}`, ctx.config.isTest ? 1000 : 120, 3_600_000);
    const file = await importAccountFile(ctx, storage, row, fileId);
    reply.status(201);
    return { file: fileView(file) };
  });

  /** A one-time address for Google's picker (its own page), for the web's window or a phone's sheet. */
  app.post('/me/accounts/:id/picker', async (req): Promise<AccountStartResponse> => {
    const auth = requireAuth(req);
    const row = await accountOf(ctx, auth.userId, idParam(req));
    const { back } = parse(z.object({ back: z.enum(['web', 'app']) }).strict(), req.body);
    if (row.provider !== 'google' || !googlePickerOn(ctx.config)) throw notFound(tr('That picker'));
    if (!row.uses.includes('files')) throw forbidden(tr('Turn on Files for this account first.'));
    const ticket = await pickerTicket(ctx, auth.userId, row.id, back);
    const base = ctx.config.PUBLIC_URL;
    return { url: `${base}/v1/accounts/google/picker?${new URLSearchParams({ t: ticket })}` };
  });

  /**
   * Google's picker page: the ticket says who and which account (no session needed), and the
   * page's own policy lets Google's script run there and nowhere else.
   */
  app.get('/accounts/google/picker', async (req, reply) => {
    ctx.limiter.hit(`accounts-picker:${req.ip}`, ctx.config.isTest ? 1000 : 120, 3_600_000);
    const { t } = parse(z.object({ t: z.string().max(4000) }), req.query);
    const ticket = await openPickerTicket(ctx, t);
    if (!ticket || !googlePickerOn(ctx.config)) throw notFound(tr('That picker'));
    const row = await accountOf(ctx, ticket.userId, ticket.accountId);
    const access = await filesAccess(ctx, row);
    const nonce = randomBytes(16).toString('base64');
    const page = googlePickerPage(ctx.config, {
      access,
      back: ticket.back,
      nonce,
      appScheme: APP_SCHEME,
      title: tr('Pick a file'),
    });
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', page.csp)
      .send(page.html);
  });

  app.delete('/me/accounts/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await disconnectAccount(ctx, await accountOf(ctx, auth.userId, id));
    return { ok: true };
  });
}
