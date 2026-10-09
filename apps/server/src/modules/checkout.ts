/**
 * An organization's own checkout (R65): its owner connects the organization's Stripe account,
 * its managers see whether it's connected, a Pay card's payer pays by card on Stripe's page,
 * and the card is settled from what Stripe says. The work is in lib/checkout.ts.
 */
import { canManageOrg, ownsOrg, senderPays } from '@caime/core';
import type {
  CheckoutSettledResponse,
  OkResponse,
  OrgCheckoutResponse,
  UrlResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS } from '../db/schema';
import { audit } from '../lib/audit';
import { refusedByStripe } from '../lib/billing';
import { assertCanWrite } from '../lib/blocks';
import { customerMask } from '../lib/business';
import {
  checkoutView,
  connectUrl,
  disconnect,
  finishConnect,
  openCheckout,
  refreshAccount,
  settleCheckout,
} from '../lib/checkout';
import { checkoutAvailable } from '../lib/checkout-account';
import { membership } from '../lib/conversation-views';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { messageViews } from '../lib/messages';
import { orgById, orgSeat } from '../lib/orgs';
import { stripeSigned } from '../lib/stripe';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const idParam = z.object({ id: z.string().uuid() });

export async function checkoutRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Its seat on the team, as the checkout asks of it: managers see, only the owner connects. */
  async function seatFor(userId: string, orgId: string, owner: boolean) {
    await orgById(ctx.db, orgId);
    const seat = await orgSeat(ctx.db, userId, orgId);
    if (!seat || !canManageOrg(seat.role)) throw notFound(tr('That organization'));
    if (owner && !ownsOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner connects where its money goes.'));
    return seat;
  }

  app.get('/orgs/:id/checkout', async (req): Promise<OrgCheckoutResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await seatFor(auth.userId, id, false);
    return { checkout: await checkoutView(ctx, id) };
  });

  /** Stripe's consent page for the organization's own account. */
  app.post('/orgs/:id/checkout/connect', async (req): Promise<UrlResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await seatFor(auth.userId, id, true);
    if (!checkoutAvailable(ctx)) throw notFound(tr('Paying by card here'));
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden(tr('Payments are set by someone 18 or over.'));
    ctx.limiter.hit(`checkout-connect:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const org = await orgById(ctx.db, id);
    return { url: await connectUrl(ctx, org, auth.userId) };
  });

  /** Asks Stripe again whether it takes payments (its owner finished Stripe's setup). */
  app.post('/orgs/:id/checkout/refresh', async (req): Promise<OrgCheckoutResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await seatFor(auth.userId, id, false);
    try {
      await refreshAccount(ctx, id);
    } catch (e) {
      throw refusedByStripe(req.log, e, tr('Stripe can’t be asked right now'));
    }
    return { checkout: await checkoutView(ctx, id) };
  });

  app.delete('/orgs/:id/checkout', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await seatFor(auth.userId, id, true);
    if (await disconnect(ctx, id))
      await audit(ctx.db, { actorId: auth.userId, action: 'org.checkout_removed', target: id });
    return { ok: true };
  });

  /**
   * Back from Stripe's consent page (a browser's redirect, so no session is asked for: the state
   * says who, once). Lands on the organization's setup, saying how it went.
   */
  app.get('/checkout/stripe/return', async (req, reply) => {
    const q = parse(
      z.object({
        state: z.string().min(10).max(100),
        code: z.string().max(300).optional(),
        error: z.string().max(100).optional(),
      }),
      req.query,
    );
    let done: { handle: string | null; connected: boolean; orgId: string | null } = {
      handle: null,
      connected: false,
      orgId: null,
    };
    try {
      done = await finishConnect(
        ctx,
        { state: q.state, code: q.error ? null : (q.code ?? null) },
        req.auth?.userId ?? null,
        async (userId, orgId) => ownsOrg((await orgSeat(ctx.db, userId, orgId))?.role ?? null),
      );
    } catch (e) {
      req.log.error({ err: (e as Error).message }, 'stripe connect');
    }
    if (done.connected && done.orgId) {
      const by = await ctx.db
        .selectFrom('org_checkout')
        .select('connected_by')
        .where('org_id', '=', done.orgId)
        .executeTakeFirst();
      await audit(ctx.db, {
        actorId: by?.connected_by ?? null,
        action: 'org.checkout_connected',
        target: done.orgId,
      });
    }
    const web = ctx.config.PUBLIC_URL.replace(/\/+$/, '');
    return reply.redirect(
      done.handle
        ? `${web}/o/${done.handle}/setup?checkout=${done.connected ? 'connected' : 'failed'}`
        : `${web}/`,
      303,
    );
  });

  /**
   * Whether this person may pay the card by card now: they're on its paying side (the other side
   * of an ask, the sender of a send), while it waits on payment: asked, not received yet, or a
   * send nobody has answered.
   */
  async function payerMay(
    userId: string,
    m: { conversation_id: string; sender_id: string | null; payload: unknown },
  ) {
    const card = (m.payload ?? {}) as { fields?: Record<string, unknown>; history?: unknown[] };
    const business = await customerMask(ctx.db, m.conversation_id);
    const onTeam = (id: string | null) => Boolean(business && id !== business.customerId);
    const senderSide = m.sender_id === userId || (onTeam(m.sender_id) && onTeam(userId));
    const pays = senderPays(card.fields) ? senderSide : !senderSide;
    return (state: string) =>
      pays &&
      (state === 'requested' ||
        state === 'not_received' ||
        (state === 'sent' && senderPays(card.fields) && !card.history?.length));
  }

  app.post('/messages/:id/checkout', async (req): Promise<UrlResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const m = await ctx.db
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    if (auth.app || auth.grant) throw forbidden(tr('Only a person pays by card.'));
    ctx.limiter.hit(`checkout:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    try {
      return { url: await openCheckout(ctx, id, auth.userId, await payerMay(auth.userId, m)) };
    } catch (e) {
      throw refusedByStripe(req.log, e, tr('Paying by card can’t start right now'));
    }
  });

  /** The payer came back from Stripe's page: what Stripe says now, applied. */
  app.post('/messages/:id/checkout/check', async (req): Promise<CheckoutSettledResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const m = await ctx.db
      .selectFrom('messages')
      .select(['conversation_id'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, m.conversation_id);
    ctx.limiter.hit(`checkout-check:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    let status: CheckoutSettledResponse['status'];
    try {
      status = await settleCheckout(ctx, id);
    } catch (e) {
      throw refusedByStripe(req.log, e, tr('Stripe can’t be asked right now'));
    }
    const row = await ctx.db
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const [view] = await messageViews(ctx.db, [row], auth.userId);
    if (!view) throw notFound(tr('That message'));
    return { status, message: view };
  });

  // Stripe's Connect webhook: signed over the body as sent, so it parses its own body.
  await app.register(async (hooks) => {
    hooks.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 1_000_000 },
      (_req, body, done) => done(null, body),
    );
    hooks.post('/checkout/stripe/webhook', async (req) => {
      const secret = ctx.config.STRIPE_CONNECT_WEBHOOK_SECRET;
      if (!secret || !checkoutAvailable(ctx)) throw notFound(tr('That'));
      const body = req.body as Buffer;
      const now = Math.floor(ctx.now().getTime() / 1000);
      if (
        !Buffer.isBuffer(body) ||
        !stripeSigned(secret, String(req.headers['stripe-signature'] ?? ''), body, now)
      )
        throw new AppError(400, 'bad_signature', tr('That isn’t from Stripe.'));
      let event: {
        type?: string;
        account?: string;
        data?: { object?: { metadata?: Record<string, string> } };
      };
      try {
        event = JSON.parse(body.toString('utf8'));
      } catch {
        throw badRequest(tr('That isn’t an event.'));
      }
      // The event only names the card; what it says is asked of Stripe again.
      const messageId = event.data?.object?.metadata?.caime_message;
      if (
        event.type?.startsWith('checkout.session.') &&
        messageId &&
        z.string().uuid().safeParse(messageId).success
      ) {
        try {
          await settleCheckout(ctx, messageId);
        } catch (e) {
          if (!(e instanceof AppError)) throw e;
        }
      }
      if (event.type === 'account.updated' && event.account) {
        const orgs = await ctx.db
          .selectFrom('org_checkout')
          .select('org_id')
          .where('account_id', '=', event.account)
          .execute();
        for (const o of orgs) await refreshAccount(ctx, o.org_id);
      }
      return { received: true };
    });
  });
}
