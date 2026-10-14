/**
 * A paid Pay card's receipt (R62, R65): what was paid, to whom and by whom, when, and how, for
 * the card's two sides alone. To a customer the team is its organization (R15: never a team
 * member's name), and a customer writing for their organization is that organization (R64).
 * Built from the card as it stands; nothing is kept for it.
 */
import {
  type PaysShare,
  type PayTo,
  paySides,
  type ReceiptParty,
  type ReceiptView,
  receiptNumber,
  senderPays,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS } from '../db/schema';
import { customerMask } from './business';
import { membership } from './conversation-views';
import { notFound } from './errors';

type PayCard = {
  kit?: string;
  state?: string;
  fields?: Record<string, unknown>;
  payTo?: PayTo | null;
  share?: PaysShare | null;
  history?: Array<{ state?: string; by?: string; at?: string | Date; via?: string }>;
};

export async function receiptFor(
  ctx: AppContext,
  messageId: string,
  viewerId: string,
): Promise<ReceiptView> {
  const gone = () => notFound(tr('That receipt'));
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (!m || m.deleted_at || m.kind !== 'kit') throw gone();
  const { conversation } = await membership(ctx, viewerId, m.conversation_id);
  const card = (m.payload ?? {}) as PayCard;
  if (card.kit !== 'payment_request' || card.state !== 'paid') throw gone();

  const people = async (ids: Array<string | null>) => {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const rows = wanted.length
      ? await ctx.db
          .selectFrom('users')
          .select(['id', 'display_name', 'handle', 'kind'])
          .where('id', 'in', wanted)
          .execute()
      : [];
    return (id: string | null): ReceiptParty | null => {
      const u = rows.find((r) => r.id === id);
      // A provisional person's handle is an address of Caime's own, never one to show.
      return u
        ? { name: u.display_name, handle: u.kind === 'human' ? u.handle : null, domain: null }
        : null;
    };
  };
  const org = async (id: string): Promise<ReceiptParty | null> => {
    const o = await ctx.db
      .selectFrom('organizations')
      .select(['name', 'handle', 'domain', 'verified_at'])
      .where('id', '=', id)
      .executeTakeFirst();
    return o ? { name: o.name, handle: o.handle, domain: o.verified_at ? o.domain : null } : null;
  };

  let payee: ReceiptParty | null;
  let payer: ReceiptParty | null;
  const mask =
    conversation.kind === 'business' ? await customerMask(ctx.db, m.conversation_id) : null;
  if (mask) {
    // Two sides: the organization (its team, as one), and the customer or the organization
    // they write for. Whoever sent the card is on one; whoever paid is the one it says.
    const team = await org(mask.orgId);
    const customer = mask.customerOrgId
      ? await org(mask.customerOrgId)
      : (await people([mask.customerId]))(mask.customerId);
    const teamSent = m.sender_id !== mask.customerId;
    const senderSide = teamSent ? team : customer;
    const otherSide = teamSent ? customer : team;
    [payer, payee] = senderPays(card.fields) ? [senderSide, otherSide] : [otherSide, senderSide];
  } else {
    // A one-to-one's other person; in a group, whoever the card names or said they'd paid.
    const other =
      conversation.kind === 'direct'
        ? ((
            await ctx.db
              .selectFrom('participants')
              .select('user_id')
              .where('conversation_id', '=', m.conversation_id)
              .where('user_id', '<>', m.sender_id ?? '')
              .executeTakeFirst()
          )?.user_id ?? null)
        : null;
    const sides = paySides(card, m.sender_id, other);
    // Only its two sides read it; anyone else in a group was never part of it.
    if (viewerId !== sides.payerId && viewerId !== sides.payeeId) throw gone();
    const named = await people([sides.payerId, sides.payeeId]);
    payee = named(sides.payeeId);
    payer = named(sides.payerId);
  }
  if (!payee) throw gone();
  // The name it was paid to as the card was sent, as both sides saw it then.
  if (card.payTo?.name) payee = { ...payee, name: card.payTo.name };
  const paid = [...(card.history ?? [])].reverse().find((h) => h.state === 'paid');
  const amount = (card.fields?.amount ?? {}) as { value?: number; currency?: string | null };
  return {
    number: receiptNumber(m.id),
    messageId: m.id,
    conversationId: m.conversation_id,
    paidAt: new Date(paid?.at ?? m.created_at).toISOString(),
    amount: { value: Number(amount.value ?? 0), currency: amount.currency ?? null },
    note: typeof card.fields?.note === 'string' && card.fields.note ? card.fields.note : null,
    payee,
    payer,
    how: paid?.via === 'checkout' ? 'card' : 'confirmed',
  };
}
