/**
 * An organization's own checkout (R65). Its owner connects the organization's own Stripe account
 * (Connect, a Standard account, through Stripe's own consent page); a Pay card whose payee is
 * that organization then offers "Pay by card", which opens a Checkout Session made on the
 * organization's account (the `Stripe-Account` header): the money goes to the organization, Caime
 * takes no fee and never sees a card. The card is marked paid only from what Stripe says when
 * asked (`settleCheckout`), whether the payer came back or Stripe's webhook told us first; an
 * event's own copy is never trusted.
 */
import { randomBytes } from 'node:crypto';
import { type CardCheckout, type CheckoutStatus, chargeUnits, payDirection } from '@caime/core';
import type { OrgCheckoutView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS } from '../db/schema';
import { checkoutAccountOf, checkoutAvailable } from './checkout-account';
import { badRequest, conflict, forbidden, notFound } from './errors';
import { messageViews, participantsOf } from './messages';
import { STRIPE_VERSION, StripeError, stripe, stripeForm } from './stripe';

/** How long a connection's consent page may take before its state is no good. */
const STATE_MS = 15 * 60_000;
/** A Checkout Session of Stripe's lasts a day; one this old is made again rather than reused. */
const SESSION_REUSE_MS = 20 * 3_600_000;

/** What its managers see of it: whether it's connected and taking payments, never a key. */
export async function checkoutView(ctx: AppContext, orgId: string): Promise<OrgCheckoutView> {
  const row = await ctx.db
    .selectFrom('org_checkout')
    .select(['account_id', 'charges_enabled', 'livemode', 'connected_at'])
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return {
    available: checkoutAvailable(ctx),
    connected: row
      ? {
          provider: 'stripe',
          // The account's last four, enough to recognise it in Stripe's dashboard.
          account: `…${row.account_id.slice(-4)}`,
          chargesEnabled: row.charges_enabled,
          live: row.livemode,
          connectedAt: row.connected_at.toISOString(),
        }
      : null,
  };
}

/** Stripe's Connect endpoints (connect.stripe.com), with the platform's key. */
async function connectCall<T>(ctx: AppContext, path: string, params: Record<string, unknown>) {
  const base = ctx.config.STRIPE_CONNECT_BASE.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${ctx.config.STRIPE_SECRET_KEY}`,
      'stripe-version': STRIPE_VERSION,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: stripeForm(params),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
  };
  if (!res.ok)
    throw new StripeError(
      res.status,
      json.error ?? null,
      json.error_description ?? `Stripe answered ${res.status}.`,
    );
  return json as T;
}

/** Where its owner goes to connect the organization's account: Stripe's own consent page. */
export async function connectUrl(
  ctx: AppContext,
  org: { id: string; name: string },
  userId: string,
): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await ctx.db.deleteFrom('checkout_states').where('expires_at', '<', ctx.now()).execute();
  await ctx.db
    .insertInto('checkout_states')
    .values({
      token,
      org_id: org.id,
      user_id: userId,
      expires_at: new Date(ctx.now().getTime() + STATE_MS),
    })
    .execute();
  const base = ctx.config.STRIPE_CONNECT_BASE.replace(/\/$/, '');
  return `${base}/oauth/authorize?${stripeForm({
    response_type: 'code',
    client_id: ctx.config.STRIPE_CONNECT_CLIENT_ID,
    scope: 'read_write',
    state: token,
    redirect_uri: `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/v1/checkout/stripe/return`,
    stripe_user: { business_name: org.name },
  })}`;
}

/**
 * Back from Stripe's consent page: the state names the organization and who started it (once,
 * within its time, still its owner), and the code becomes its connected account. Answers the
 * organization's handle, for the setup screen to land on, or null when it can't be told.
 */
export async function finishConnect(
  ctx: AppContext,
  input: { state: string; code: string | null },
  viewerId: string | null,
  isOwner: (userId: string, orgId: string) => Promise<boolean>,
): Promise<{ handle: string | null; connected: boolean; orgId: string | null }> {
  const state = await ctx.db
    .deleteFrom('checkout_states')
    .where('token', '=', input.state)
    .returningAll()
    .executeTakeFirst();
  if (!state) return { handle: null, connected: false, orgId: null };
  const org = await ctx.db
    .selectFrom('organizations')
    .select(['handle'])
    .where('id', '=', state.org_id)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!org) return { handle: null, connected: false, orgId: state.org_id };
  // The browser that started it is the one that finishes it: nobody links an account to an
  // organization through someone else's consent.
  if (
    !input.code ||
    state.expires_at.getTime() < ctx.now().getTime() ||
    state.user_id !== viewerId ||
    !(await isOwner(state.user_id, state.org_id))
  )
    return { handle: org.handle, connected: false, orgId: state.org_id };
  const token = await connectCall<{ stripe_user_id?: string; livemode?: boolean }>(
    ctx,
    '/oauth/token',
    { grant_type: 'authorization_code', code: input.code },
  );
  if (!token.stripe_user_id) return { handle: org.handle, connected: false, orgId: state.org_id };
  const account = await stripe(ctx)!.get<{ charges_enabled?: boolean }>(
    `/v1/accounts/${token.stripe_user_id}`,
  );
  await ctx.db
    .insertInto('org_checkout')
    .values({
      org_id: state.org_id,
      account_id: token.stripe_user_id,
      livemode: Boolean(token.livemode),
      charges_enabled: Boolean(account.charges_enabled),
      connected_by: state.user_id,
      connected_at: ctx.now(),
      updated_at: ctx.now(),
    })
    .onConflict((oc) =>
      oc.column('org_id').doUpdateSet({
        account_id: token.stripe_user_id,
        livemode: Boolean(token.livemode),
        charges_enabled: Boolean(account.charges_enabled),
        connected_by: state.user_id,
        connected_at: ctx.now(),
        updated_at: ctx.now(),
      }),
    )
    .execute();
  return { handle: org.handle, connected: true, orgId: state.org_id };
}

/** Asks Stripe again whether the account takes payments (after its owner finished there). */
export async function refreshAccount(ctx: AppContext, orgId: string): Promise<void> {
  const row = await ctx.db
    .selectFrom('org_checkout')
    .select('account_id')
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  const s = stripe(ctx);
  if (!row || !s) return;
  const account = await s.get<{ charges_enabled?: boolean }>(`/v1/accounts/${row.account_id}`);
  await ctx.db
    .updateTable('org_checkout')
    .set({ charges_enabled: Boolean(account.charges_enabled), updated_at: ctx.now() })
    .where('org_id', '=', orgId)
    .execute();
}

/** Disconnects it: Stripe forgets Caime's access, and Caime the account. */
export async function disconnect(ctx: AppContext, orgId: string): Promise<boolean> {
  const row = await ctx.db
    .deleteFrom('org_checkout')
    .where('org_id', '=', orgId)
    .returning('account_id')
    .executeTakeFirst();
  if (!row) return false;
  // Best effort: an account already disconnected on Stripe's side answers an error.
  await connectCall(ctx, '/oauth/deauthorize', {
    client_id: ctx.config.STRIPE_CONNECT_CLIENT_ID,
    stripe_user_id: row.account_id,
  }).catch((e) => ctx.log.warn({ err: (e as Error).message }, 'stripe deauthorize'));
  return true;
}

type Trx = Parameters<Parameters<ReturnType<AppContext['db']['transaction']>['execute']>[0]>[0];
type StripeClient = NonNullable<ReturnType<typeof stripe>>;
type Updated = NonNullable<Awaited<ReturnType<typeof applySaid>>>;

interface PayCard {
  kit?: string;
  state?: string;
  fields?: { amount?: { value?: number; currency?: string }; note?: string };
  payTo?: { name?: string; orgId?: string; checkout?: boolean };
  checkout?: CardCheckout;
}

async function payCard(db: AppContext['db'], messageId: string) {
  const m = await db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (!m || m.deleted_at || m.kind !== 'kit') throw notFound(tr('That message'));
  const card = (m.payload ?? {}) as PayCard;
  if (card.kit !== 'payment_request') throw badRequest(tr('That isn’t a Pay card.'));
  return { m, card };
}

/**
 * Whether a Pay card still waits on its payer's card after a move: an ask that's requested or
 * not received yet. Anything else (paid, sent another way, declined, cancelled, a send card
 * answered) is over for paying by card, and its session with it.
 */
export function stillPayableAfter(fields: Record<string, unknown> | undefined, to: string) {
  return payDirection(fields ?? {}) === 'ask' && (to === 'requested' || to === 'not_received');
}

type SessionSaid = { status: CheckoutStatus | 'none'; url: string | null };

/** What Stripe says of a card's session: paid, open, expired, or not this card's at all. */
async function askSession(
  s: StripeClient,
  sessionId: string,
  messageId: string,
): Promise<SessionSaid> {
  const session = await s.get<{
    status?: string;
    payment_status?: string;
    url?: string | null;
    metadata?: Record<string, string>;
  }>(`/v1/checkout/sessions/${sessionId}`);
  // Only a session made for this card counts.
  if (session.metadata?.caime_message !== messageId) return { status: 'none', url: null };
  const status: CheckoutStatus =
    session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
      ? 'paid'
      : session.status === 'expired'
        ? 'expired'
        : 'open';
  return { status, url: session.url ?? null };
}

type Locked = PayCard & {
  history?: Array<{ state: string; by: string; at: string | Date; via?: string }>;
};

/** The card's row, locked for the rest of the transaction, with its payload as it is now. */
async function lockCard(trx: Trx, messageId: string) {
  const row = await trx
    .selectFrom('messages')
    .select(['payload', 'deleted_at'])
    .where('id', '=', messageId)
    .forUpdate()
    .executeTakeFirst();
  if (!row || row.deleted_at) throw notFound(tr('That message'));
  return (row.payload ?? {}) as Locked;
}

/**
 * Writes what Stripe said of the session into the locked card: paid moves it to paid (by its
 * payer, once); expired says so. Nothing, when the card's session is another or already says it.
 */
async function applySaid(
  trx: Trx,
  messageId: string,
  p: Locked,
  mark: CardCheckout,
  status: CheckoutStatus,
  now: Date,
) {
  if (p.checkout?.sessionId !== mark.sessionId || p.checkout.status === status) return null;
  const paid = status === 'paid' && p.state !== 'paid';
  const patch = {
    checkout: { ...p.checkout, status },
    ...(paid
      ? {
          state: 'paid',
          history: [
            ...(p.history ?? []),
            { state: 'paid', by: mark.payerId, at: now, via: 'checkout' },
          ].slice(-50),
        }
      : {}),
  };
  return trx
    .updateTable('messages')
    .set({ payload: sql`payload || ${JSON.stringify(patch)}::jsonb` })
    .where('id', '=', messageId)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirstOrThrow();
}

/** Everyone in the conversation sees the card as it stands now. */
async function tellUpdated(ctx: AppContext, updated: Updated, viewerId: string) {
  const members = (await participantsOf(ctx.db, updated.conversation_id)).map((p) => p.user_id);
  const [view] = await messageViews(ctx.db, [updated], viewerId);
  if (view)
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
}

/**
 * A Checkout Session for this Pay card on its organization's own account, for the payer to pay
 * by card. One session is ever payable: the payer's own open one is reused while it lasts;
 * another's, or an old one, is ended at Stripe before a new one starts; and a session that was
 * paid but not yet settled is settled, never replaced. All of it under the card's row lock, so
 * two openings at once make one session.
 */
export async function openCheckout(
  ctx: AppContext,
  messageId: string,
  payerId: string,
  mayPay: (state: string) => boolean,
): Promise<string> {
  const { m, card } = await payCard(ctx.db, messageId);
  if (!card.payTo?.checkout || !card.payTo.orgId)
    throw badRequest(tr('This card isn’t paid by card.'));
  if (!mayPay(card.state ?? ''))
    throw forbidden(tr('Only whoever pays it pays by card, while it isn’t paid.'));
  const account = await checkoutAccountOf(ctx, card.payTo.orgId);
  if (!account)
    throw badRequest(
      tr('{name} doesn’t take cards here any more.', { name: card.payTo.name ?? '' }),
    );
  const amount = card.fields?.amount;
  const units =
    amount?.value && amount.currency ? chargeUnits(amount.value, amount.currency) : null;
  if (!units || !amount?.currency) throw badRequest(tr('This card has no amount to pay by card.'));
  const currency = amount.currency.toLowerCase();
  const s = stripe(ctx, account.accountId)!;
  const web = ctx.config.PUBLIC_URL.replace(/\/+$/, '');
  const back = `${web}/c/${m.conversation_id}`;
  const name =
    card.fields?.note?.slice(0, 200) || tr('Payment to {name}', { name: card.payTo.name ?? '' });
  const outcome = await ctx.db
    .transaction()
    .execute(
      async (
        trx,
      ): Promise<{ kind: 'url'; url: string } | { kind: 'paid'; updated: Updated | null }> => {
        const p = await lockCard(trx, messageId);
        if (p.state === 'paid' || p.checkout?.status === 'paid')
          return { kind: 'paid', updated: null };
        const open = p.checkout;
        if (open?.status === 'open') {
          // What Stripe says of it first: a payment made but not settled yet is settled here.
          let said = await askSession(s, open.sessionId, messageId);
          if (said.status === 'open') {
            if (
              open.payerId === payerId &&
              ctx.now().getTime() - Date.parse(open.at) < SESSION_REUSE_MS &&
              said.url
            )
              return { kind: 'url', url: said.url };
            // Someone else's, or old: it ends before a new one starts, so one is ever payable.
            // A session paid in the meantime can't be ended, and then that payment is what counts.
            const ended = await s
              .post(`/v1/checkout/sessions/${open.sessionId}/expire`)
              .then(() => true)
              .catch(() => false);
            if (!ended) said = await askSession(s, open.sessionId, messageId);
          }
          if (said.status === 'paid')
            return {
              kind: 'paid',
              updated: await applySaid(trx, messageId, p, open, 'paid', ctx.now()),
            };
        }
        const session = await s.post<{ id: string; url: string }>(
          '/v1/checkout/sessions',
          {
            mode: 'payment',
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency,
                  unit_amount: units,
                  product_data: { name },
                },
              },
            ],
            client_reference_id: messageId,
            metadata: { caime_message: messageId, caime_payer: payerId },
            payment_intent_data: { metadata: { caime_message: messageId } },
            success_url: `${back}?checkout=${messageId}`,
            cancel_url: back,
          },
          `caime-checkout:${messageId}:${payerId}:${ctx.now().getTime()}`,
        );
        const mark: CardCheckout = {
          sessionId: session.id,
          status: 'open',
          payerId,
          at: ctx.now().toISOString(),
        };
        await trx
          .updateTable('messages')
          .set({ payload: sql`payload || ${JSON.stringify({ checkout: mark })}::jsonb` })
          .where('id', '=', messageId)
          .execute();
        return { kind: 'url', url: session.url };
      },
    );
  if (outcome.kind === 'url') return outcome.url;
  if (outcome.updated) await tellUpdated(ctx, outcome.updated, payerId);
  throw conflict('conflict', tr('This card has been paid already.'));
}

/**
 * What Stripe says of this card's checkout, applied: paid moves the card to paid (by its payer),
 * expired says so. Asked when the payer comes back and when Stripe's webhook names the card;
 * whichever is first settles it, under the card's row lock, once.
 */
export async function settleCheckout(
  ctx: AppContext,
  messageId: string,
): Promise<'paid' | 'open' | 'expired' | 'none'> {
  const { card } = await payCard(ctx.db, messageId);
  const mark = card.checkout;
  if (!mark || !card.payTo?.orgId) return 'none';
  if (mark.status === 'paid') return 'paid';
  const row = await ctx.db
    .selectFrom('org_checkout')
    .select('account_id')
    .where('org_id', '=', card.payTo.orgId)
    .executeTakeFirst();
  const s = row ? stripe(ctx, row.account_id) : null;
  if (!s) return 'none';
  const said = await askSession(s, mark.sessionId, messageId);
  if (said.status === 'none' || said.status === 'open') return said.status;
  const status = said.status;
  const updated = await ctx.db
    .transaction()
    .execute(async (trx) =>
      applySaid(trx, messageId, await lockCard(trx, messageId), mark, status, ctx.now()),
    );
  if (updated) await tellUpdated(ctx, updated, mark.payerId);
  return status;
}

/**
 * The card is over for paying by card (received, cancelled, declined, paid another way): its
 * open session, if any, ends at Stripe and says so on the card, so nobody pays a card that's
 * settled. Best effort: a session already gone answers an error.
 */
export async function expireCheckout(ctx: AppContext, messageId: string): Promise<void> {
  const { card } = await payCard(ctx.db, messageId);
  const mark = card.checkout;
  if (mark?.status !== 'open' || !card.payTo?.orgId) return;
  const row = await ctx.db
    .selectFrom('org_checkout')
    .select('account_id')
    .where('org_id', '=', card.payTo.orgId)
    .executeTakeFirst();
  const s = row ? stripe(ctx, row.account_id) : null;
  if (!s) return;
  const ended = await s
    .post(`/v1/checkout/sessions/${mark.sessionId}/expire`)
    .then(() => true)
    .catch(() => false);
  // Ended, or paid meanwhile: either way the card says what Stripe says.
  const said = ended
    ? { status: 'expired' as const }
    : await askSession(s, mark.sessionId, messageId);
  if (said.status === 'none' || said.status === 'open') return;
  const status = said.status;
  const updated = await ctx.db
    .transaction()
    .execute(async (trx) =>
      applySaid(trx, messageId, await lockCard(trx, messageId), mark, status, ctx.now()),
    );
  if (updated) await tellUpdated(ctx, updated, mark.payerId);
}
