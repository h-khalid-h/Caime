/**
 * Billing (PRD §84, R25): what can be bought and what's paid for, Checkout for Pro (a person)
 * or Business (an organization, by its owner or an admin), Stripe's portal to manage it, and the
 * webhook Stripe tells how each subscription stands. The work is in lib/billing.ts.
 */
import {
  BillingPortalBody,
  type BillingView,
  CheckoutBody,
  canManageOrg,
  PLAN_NAMES,
} from '@caime/core';
import type { UrlResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import {
  billingView,
  handleStripeEvent,
  openPortal,
  type Payer,
  refusedByStripe,
  startCheckout,
} from '../lib/billing';
import { AppError, forbidden, notFound } from '../lib/errors';
import { orgSeat } from '../lib/orgs';
import { stripe, stripeSigned } from '../lib/stripe';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Paying takes being 18 or over (a card, a contract): said instead of offering it. */
const ADULTS_ONLY = () => tr('Plans are bought by someone 18 or over.');

export async function billingRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Who pays, as the person asking may act for: themselves, or an organization they run. */
  async function payerFor(userId: string, orgId?: string) {
    const me = await ctx.db
      .selectFrom('users')
      .select(['display_name', 'email', 'birth_date', 'time_zone'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    const minor = minorOf(me, ctx.now());
    if (!orgId)
      return {
        payer: { userId } as Payer,
        who: { name: me.display_name, email: me.email },
        back: '/settings/plan',
        minor,
      };
    const seat = await orgSeat(ctx.db, userId, orgId);
    if (!seat) throw notFound(tr('That organization'));
    if (!canManageOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner and admins can change what it pays.'));
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['name', 'handle'])
      .where('id', '=', orgId)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound(tr('That organization'));
    // Its receipts and notices go to its owner, whoever of its admins pays: never to someone
    // who has since left the team.
    const owner = await ctx.db
      .selectFrom('org_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select('u.email')
      .where('m.org_id', '=', orgId)
      .where('m.role', '=', 'owner')
      .where('m.left_at', 'is', null)
      .executeTakeFirst();
    return {
      payer: { orgId } as Payer,
      who: { name: org.name, email: owner?.email ?? me.email },
      back: `/o/${org.handle}`,
      minor,
    };
  }
  // Each Checkout or portal visit asks Stripe for several things: thirty an hour is plenty.
  const paced = (userId: string) => ctx.limiter.hit(`billing:${userId}`, 30, 3_600_000);

  app.get('/billing', async (req): Promise<BillingView> => {
    const auth = requireAuth(req);
    const { payer, minor } = await payerFor(auth.userId);
    return billingView(ctx, payer, { unavailable: minor ? ADULTS_ONLY() : null });
  });

  app.get('/orgs/:id/billing', async (req): Promise<BillingView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { payer, minor } = await payerFor(auth.userId, id);
    return billingView(ctx, payer, { unavailable: minor ? ADULTS_ONLY() : null });
  });

  /** Buy Pro, or Business for an organization: the page on Stripe to pay on. */
  app.post('/billing/checkout', async (req): Promise<UrlResponse> => {
    const auth = requireAuth(req);
    const body = parse(CheckoutBody, req.body);
    paced(auth.userId);
    const { payer, who, back, minor } = await payerFor(auth.userId, body.orgId);
    if (minor) throw forbidden(ADULTS_ONLY());
    try {
      return { url: await startCheckout(ctx, payer, who, body.interval, back) };
    } catch (e) {
      // Stripe's refusal, said as it is: the one buying is the one to sort it out or tell the
      // operator, never "something went wrong on our side".
      throw refusedByStripe(
        req.log,
        e,
        `${PLAN_NAMES['orgId' in payer ? 'business' : 'pro']} can’t be bought right now`,
      );
    }
  });

  /** Manage what's paid (card, invoices, cancelling) in Stripe's portal. */
  app.post('/billing/portal', async (req): Promise<UrlResponse> => {
    const auth = requireAuth(req);
    const body = parse(BillingPortalBody, req.body ?? {});
    paced(auth.userId);
    const { payer, who, back } = await payerFor(auth.userId, body.orgId);
    try {
      return { url: await openPortal(ctx, payer, who, back) };
    } catch (e) {
      throw refusedByStripe(req.log, e, 'Billing can’t be opened right now');
    }
  });

  // Stripe's webhook takes the body exactly as sent: its signature is over those bytes. It's the
  // only route that does.
  await app.register(async (hooks) => {
    hooks.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 1_000_000 },
      (_req, body, done) => done(null, body),
    );
    hooks.post('/billing/webhook', async (req) => {
      const secret = ctx.config.STRIPE_WEBHOOK_SECRET;
      if (!secret || !stripe(ctx)) throw notFound(tr('That'));
      const body = req.body as Buffer;
      const signature = req.headers['stripe-signature'];
      const now = Math.floor(ctx.now().getTime() / 1000);
      if (!Buffer.isBuffer(body) || !stripeSigned(secret, String(signature ?? ''), body, now))
        throw new AppError(400, 'bad_signature', tr('That isn’t from Stripe.'));
      let event: Parameters<typeof handleStripeEvent>[1];
      try {
        event = JSON.parse(body.toString('utf8'));
      } catch {
        throw new AppError(400, 'bad_request', tr('That isn’t an event.'));
      }
      await handleStripeEvent(ctx, event);
      return { received: true };
    });
  });
}
