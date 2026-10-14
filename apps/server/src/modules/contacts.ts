/**
 * Contacts from a Google or Microsoft account (R89, `lib/contact-accounts.ts`): which accounts
 * this Caime can read, the consent link for one, and the provider's return, which hands the
 * access on to the device that asked, sealed for it. The contacts themselves never reach the
 * server; only their addresses do, through `POST /people/match`, as a file's do.
 */
import { ContactAccountStartBody, isContactAccount } from '@caime/core';
import type { ContactAccountStartResponse, ContactAccountsResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { consentUrl, contactAccountsOn, finishConsent } from '../lib/contact-accounts';
import { notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const BackQuery = z.object({
  code: z.string().max(4096).optional(),
  state: z.string().max(2048).optional(),
  error: z.string().max(200).optional(),
});

export async function contactRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/contacts/accounts', async (req): Promise<ContactAccountsResponse> => {
    requireAuth(req);
    return { accounts: contactAccountsOn(ctx.config) };
  });

  app.post(
    '/contacts/accounts/:account/start',
    async (req): Promise<ContactAccountStartResponse> => {
      const auth = requireAuth(req);
      const { account } = req.params as { account: string };
      const body = parse(ContactAccountStartBody, req.body);
      ctx.limiter.hit(`contacts-start:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
      const url = isContactAccount(account) ? await consentUrl(ctx, account, body) : null;
      if (!url) throw notFound(tr('That account'));
      return { url };
    },
  );

  /**
   * The provider's return, in the browser the consent was given in (a phone's sign-in sheet has
   * no Caime session): the state alone says where it goes, and nothing here is kept or logged
   * but the method and the path (`requestForLog`).
   */
  app.get('/contacts/accounts/:account/back', async (req, reply) => {
    const { account } = req.params as { account: string };
    if (!isContactAccount(account)) throw notFound(tr('That account'));
    ctx.limiter.hit(`contacts-back:${req.ip}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const query = parse(BackQuery, req.query);
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    return reply.redirect(await finishConsent(ctx, account, query), 303);
  });
}
