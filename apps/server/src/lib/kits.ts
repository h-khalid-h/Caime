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
} from '@caishy/core';
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
  if (!mask) throw badRequest('An organization’s own cards are for conversations with it.');
  if (senderId === mask.customerId) throw forbidden('Only the organization sends its cards.');
  if (app && !app.scopes.includes('kits'))
    throw new AppError(403, 'token_scope', 'This app needs the “kits” permission for that.');
  const appId = app ? app.id : raw.app;
  if (typeof appId !== 'string' || typeof raw.key !== 'string')
    throw badRequest('Say which app’s card, and which of its cards.');
  if (app && raw.app !== undefined && raw.app !== app.id)
    throw forbidden('An app sends only its own cards.');
  if (!isUuid(appId)) throw badRequest('That card isn’t available here.');
  const row = await ctx.db
    .selectFrom('app_kits as k')
    .innerJoin('org_apps as a', 'a.id', 'k.app_id')
    .select(['k.definition', 'a.id as app_id', 'a.name as app_name'])
    .where('k.app_id', '=', appId)
    .where('k.key', '=', raw.key)
    .where('a.org_id', '=', mask.orgId)
    .where('a.revoked_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw badRequest('That card isn’t available here.');
  const def = row.definition;
  const checked = prepareCustomFields(def, raw.fields);
  if (!checked.ok) throw badRequest(checked.error);
  if (def.adultsOnly) {
    const people = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', 'in', args.memberIds)
      .execute();
    if (people.some((u) => minorOf(u, ctx.now())))
      throw forbidden(`${def.name} cards aren’t available in this conversation.`);
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
 * Caishy's own cards. Only while it's connected.
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
 * Tells a card's app what someone did with it (kit.posted, kit.moved), if it asked to hear:
 * never what the app did itself, and never another app of the organization.
 */
export async function tellCardApp(
  ctx: AppContext,
  m: Pick<Message, 'id' | 'seq' | 'conversation_id' | 'sender_id' | 'payload' | 'created_at'>,
  mask: CustomerMask,
  actorId: string,
  event: 'kit.posted' | 'kit.moved',
  change: Record<string, unknown> = {},
): Promise<void> {
  const app = await cardApp(ctx, m);
  if (!app || app.orgId !== mask.orgId || actorId === app.botUserId) return;
  if (!app.hooked || !app.events.includes(event)) return;
  const card = (m.payload ?? {}) as { kit?: string; fields?: unknown; state?: string };
  const own = isCustomCard(m.payload) ? m.payload : null;
  const customer = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name', 'handle', 'birth_date', 'time_zone'])
    .where('id', '=', mask.customerId)
    .executeTakeFirst();
  await queueDelivery(ctx, app.id, mask.orgId, event, {
    conversationId: m.conversation_id,
    message: { id: m.id, seq: Number(m.seq), createdAt: m.created_at.toISOString() },
    kit: own
      ? { key: own.key, name: own.label, custom: true }
      : {
          key: card.kit,
          name: KITS[card.kit as keyof typeof KITS]?.name ?? card.kit,
          custom: false,
        },
    fields: card.fields ?? {},
    state: card.state ?? null,
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
  });
}
