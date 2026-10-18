/**
 * Connect Kits an organization's app makes (PRD §74, §86): each kept under the app's own key,
 * sent in the organization's business conversations by the app or by its team, moved by whoever
 * its moves name, and told to the app's webhook. A card keeps the kit it was sent with (core
 * custom-kits.ts), so nothing here ever reads a kit to read a card.
 */
import {
  type AppKitView,
  type CustomKitCard,
  type CustomKitDef,
  customTitle,
  isCustomCard,
  isUuid,
  KITS,
  prepareCustomFields,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { queueDelivery } from './apps';
import type { CustomerMask } from './business';
import { AppError, badRequest, forbidden } from './errors';
import { minorOf } from './users';

export function appKitView(row: {
  definition: CustomKitDef;
  created_at: Date;
  updated_at: Date;
}): AppKitView {
  return {
    ...row.definition,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The card a kit makes, from what its sender filled in: only the organization's side sends one,
 * only in its own business conversations, from one of its apps that's still connected, and
 * never one about money to anyone under 18 (R29). An app sends only its own kits.
 */
export async function customCardFor(
  ctx: AppContext,
  args: {
    mask: CustomerMask | null;
    senderId: string;
    /** The app whose token sends it, if one does. */
    app: { id: string; orgId: string; scopes: string[] } | null;
    raw: { key?: unknown; app?: unknown; fields?: unknown };
    memberIds: string[];
  },
): Promise<CustomKitCard> {
  const { mask, senderId, app, raw } = args;
  if (!mask) throw badRequest(tr('An organization’s own cards are for conversations with it.'));
  if (senderId === mask.customerId) throw forbidden(tr('Only the organization sends its cards.'));
  if (app && !app.scopes.includes('kits'))
    throw new AppError(403, 'token_scope', tr('This app needs the “kits” permission for that.'));
  const appId = app ? app.id : raw.app;
  if (typeof appId !== 'string' || typeof raw.key !== 'string')
    throw badRequest(tr('Say which app’s card, and which of its cards.'));
  if (app && raw.app !== undefined && raw.app !== app.id)
    throw forbidden(tr('An app sends only its own cards.'));
  if (!isUuid(appId)) throw badRequest(tr('That card isn’t available here.'));
  const row = await ctx.db
    .selectFrom('app_kits as k')
    .innerJoin('org_apps as a', 'a.id', 'k.app_id')
    .select(['k.definition', 'a.id as app_id', 'a.name as app_name'])
    .where('k.app_id', '=', appId)
    .where('k.key', '=', raw.key)
    .where('a.org_id', '=', mask.orgId)
    .where('a.revoked_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw badRequest(tr('That card isn’t available here.'));
  const def = row.definition;
  const checked = prepareCustomFields(def, raw.fields);
  if (!checked.ok) throw badRequest(checked.error);
  if (def.adultsOnly) {
    const people = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone', 'age_minor_until'])
      .where('id', 'in', args.memberIds)
      .execute();
    if (people.some((u) => minorOf(u, ctx.now())))
      throw forbidden(
        tr('{name} cards aren’t available in this conversation.', { name: def.name }),
      );
  }
  return {
    kit: 'custom',
    app: { id: row.app_id, name: row.app_name },
    key: def.key,
    label: def.name,
    icon: def.icon,
    title: customTitle(def, checked.fields),
    fields: checked.fields,
    state: def.states[0]!.id,
    history: [],
    def: { fields: def.fields, states: def.states, moves: def.moves, adultsOnly: def.adultsOnly },
  };
}

/**
 * The app a card is about, if any: the one whose kit it is, or the one whose bot sent one of
 * Caime's own cards. Only while it's connected.
 */
export async function cardApp(
  ctx: AppContext,
  m: Pick<Message, 'sender_id' | 'payload'>,
): Promise<{
  id: string;
  orgId: string;
  botUserId: string | null;
  events: string[];
  hooked: boolean;
} | null> {
  const card = m.payload;
  const q = ctx.db
    .selectFrom('org_apps')
    .select(['id', 'org_id', 'bot_user_id', 'events', 'webhook_url'])
    .where('revoked_at', 'is', null);
  const row = isCustomCard(card)
    ? await q.where('id', '=', card.app.id).executeTakeFirst()
    : m.sender_id
      ? await q.where('bot_user_id', '=', m.sender_id).executeTakeFirst()
      : undefined;
  return row
    ? {
        id: row.id,
        orgId: row.org_id,
        botUserId: row.bot_user_id,
        events: row.events,
        hooked: row.webhook_url !== null,
      }
    : null;
}

/**
 * What a card says of itself to an organization's app, the same in `business.message`,
 * `kit.posted` and `kit.moved` (PRD §74, review 2026-10-09 M12): its kind (an app's own, or one
 * of Caime's), its fields and state, and what was booked or ordered from the catalog (R58, R60).
 * Null for a message that isn't a card.
 */
export function cardData(payload: unknown): Record<string, unknown> | null {
  const card = (payload ?? {}) as {
    kit?: string;
    fields?: unknown;
    state?: string;
    booking?: unknown;
    order?: unknown;
  };
  const own = isCustomCard(payload) ? payload : null;
  if (!own && typeof card.kit !== 'string') return null;
  return {
    kit: own
      ? { key: own.key, name: own.label, custom: true }
      : {
          key: card.kit,
          name: KITS[card.kit as keyof typeof KITS]?.name ?? card.kit,
          custom: false,
        },
    fields: card.fields ?? {},
    state: card.state ?? null,
    booking: card.booking ?? null,
    order: card.order ?? null,
  };
}

/** The organization's apps that listen at an address, with what each asked to hear. */
async function hookedApps(ctx: AppContext, orgId: string) {
  return ctx.db
    .selectFrom('org_apps')
    .select(['id', 'org_id', 'bot_user_id', 'events'])
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .where('webhook_url', 'is not', null)
    .execute();
}

/**
 * Tells the organization's apps what someone did with a card (kit.posted, kit.moved), if they
 * asked to hear. An app's own card is its business alone: only that app hears. One of Caime's
 * cards in a customer conversation (a booking, an order, a payment) is the organization's: every
 * app of it that listens hears, so an app that keeps the books sees the order move (M12). Never
 * what an app did itself.
 */
export async function tellCardApp(
  ctx: AppContext,
  m: Pick<Message, 'id' | 'seq' | 'conversation_id' | 'sender_id' | 'payload' | 'created_at'>,
  mask: CustomerMask,
  actorId: string,
  event: 'kit.posted' | 'kit.moved',
  change: Record<string, unknown> = {},
): Promise<void> {
  const data = cardData(m.payload);
  if (!data) return;
  const ownApp = isCustomCard(m.payload) ? await cardApp(ctx, m) : null;
  const apps = isCustomCard(m.payload)
    ? ownApp?.hooked
      ? [ownApp]
      : []
    : (await hookedApps(ctx, mask.orgId)).map((a) => ({
        id: a.id,
        orgId: a.org_id,
        botUserId: a.bot_user_id,
        events: a.events,
        hooked: true,
      }));
  const told = apps.filter(
    (app) => app.orgId === mask.orgId && actorId !== app.botUserId && app.events.includes(event),
  );
  if (!told.length) return;
  const customer = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name', 'handle', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', mask.customerId)
    .executeTakeFirst();
  const body = {
    conversationId: m.conversation_id,
    message: { id: m.id, seq: Number(m.seq), createdAt: m.created_at.toISOString() },
    ...data,
    ...change,
    by: actorId === mask.customerId ? 'customer' : 'person',
    customer: customer
      ? {
          id: customer.id,
          displayName: customer.display_name,
          handle: customer.handle,
          // Integrations must know, too: nothing an organization sends a minor is marketing (R29).
          under18: minorOf(customer, ctx.now()),
        }
      : null,
  };
  for (const app of told) await queueDelivery(ctx, app.id, mask.orgId, event, body);
}

/**
 * When a card is for (`messages.card_start_at`): a meeting's or an appointment's start, a Pay
 * card's or an invoice's due day (review 2026-10-09 M14; midnight UTC of the day, as the field
 * keeps it). Written with the card, so a window over cards is an index read, and search finds a
 * card by when it's for. Null for any other message (a custom card may carry a field named
 * `start` or `due` of its own; it isn't one of these).
 */
export function cardStartAt(payload: unknown): Date | null {
  const card = payload as {
    kit?: unknown;
    fields?: { start?: { at?: unknown }; due?: unknown };
  } | null;
  if (!card) return null;
  const at =
    card.kit === 'meeting' || card.kit === 'appointment'
      ? card.fields?.start?.at
      : card.kit === 'payment_request' || card.kit === 'invoice'
        ? typeof card.fields?.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.fields.due)
          ? `${card.fields.due}T00:00:00Z`
          : undefined
        : undefined;
  if (typeof at !== 'string') return null;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : date;
}
