/**
 * A split's shares paid with the Pay card (R62, R38). Whoever owes a share of a split sends a
 * Pay card that pays it: they pay, the split's payer is paid, the share's amount, as a reply to
 * the split. One such card is open for a share at a time (checked again under the split's row
 * lock as the card is written), and when its payee says it arrived the share is settled, under
 * the same lock every change to a split takes. Nothing moves through Caime: the card records the
 * payment both of them agreed happened, as a share marked by hand does.
 */
import {
  applySplitOp,
  type KitAmount,
  type PaysShare,
  splitShares,
  splitState,
  tr,
} from '@caime/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import { type Database, MESSAGE_COLUMNS, type Message } from '../db/schema';
import { badRequest, conflict } from './errors';

type Q = Kysely<Database> | Transaction<Database>;

type SplitCard = { kit?: string; title?: string; fields?: Record<string, unknown> };

/** A share's Pay card still waiting on its payee: sent, or not received yet. */
const OPEN_PAY_STATES = ['requested', 'sent', 'not_received'];

export interface ShareToPay extends PaysShare {
  amount: KitAmount;
  title: string | null;
}

/**
 * What this person owes on a split in this conversation, to pay with a Pay card: refused when
 * it isn't a split here, they owe nothing on it, it's settled, or a Pay card for it is open.
 * Inside the card's transaction, `lock` holds the split's row until the card is written.
 */
export async function shareToPay(
  db: Q,
  conversationId: string,
  splitId: string,
  payerId: string,
  lock = false,
): Promise<ShareToPay> {
  const query = db
    .selectFrom('messages')
    .select(['conversation_id', 'sender_id', 'kind', 'deleted_at', 'payload'])
    .where('id', '=', splitId);
  const m = await (lock ? query.forUpdate() : query).executeTakeFirst();
  const card = (m?.payload ?? {}) as SplitCard;
  if (
    !m ||
    m.conversation_id !== conversationId ||
    m.deleted_at ||
    m.kind !== 'kit' ||
    card.kit !== 'split' ||
    !m.sender_id
  )
    throw badRequest(tr('That isn’t a split.'));
  const share = splitShares(card.fields ?? {}).find((s) => s.userId === payerId);
  if (!share) throw badRequest(tr('You don’t owe a share of this split.'));
  if (share.settledAt) throw conflict('conflict', tr('Your share of this split is settled.'));
  const open = await db
    .selectFrom('messages')
    .select('id')
    .where('reply_to_id', '=', splitId)
    .where('sender_id', '=', payerId)
    .where('kind', '=', 'kit')
    .where('deleted_at', 'is', null)
    .where(sql<string>`payload->'share'->>'splitId'`, '=', splitId)
    .where(sql<string>`payload->>'state'`, 'in', OPEN_PAY_STATES)
    .executeTakeFirst();
  if (open) throw conflict('conflict', tr('A Pay card for your share is waiting already.'));
  const total = card.fields?.amount as KitAmount | undefined;
  return {
    splitId,
    payeeId: m.sender_id,
    amount: { value: share.amount, currency: total?.currency ?? null },
    title: card.title ?? null,
  };
}

/**
 * After a share's Pay card moved: received settles the share, by whoever said it arrived, at
 * once and only once. The split as it stands after, to show everyone; null when nothing changed.
 * Run inside the move's transaction, with the Pay card's row already locked.
 */
export async function shareMoved(
  trx: Transaction<Database>,
  payCard: Pick<Message, 'sender_id' | 'payload'>,
  to: string,
  actorId: string,
  at: Date,
): Promise<Message | null> {
  const share = (payCard.payload as { share?: PaysShare } | null)?.share;
  if (to !== 'paid' || !share || !payCard.sender_id) return null;
  const m = await trx
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', share.splitId)
    .forUpdate()
    .executeTakeFirst();
  const card = (m?.payload ?? {}) as SplitCard;
  if (!m || m.deleted_at || card.kit !== 'split') return null;
  const before = splitShares(card.fields ?? {});
  const applied = applySplitOp(
    before,
    { op: 'settle', userId: payCard.sender_id },
    { userId: actorId, isCreator: actorId === m.sender_id, at: at.toISOString() },
  );
  if (!applied.ok || applied.shares === before) return null;
  return trx
    .updateTable('messages')
    .set({
      payload: JSON.stringify({
        ...card,
        fields: { ...card.fields, shares: applied.shares },
        state: splitState(applied.shares),
      }),
    })
    .where('id', '=', m.id)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirstOrThrow();
}
