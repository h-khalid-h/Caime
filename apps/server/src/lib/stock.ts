/**
 * Stock that runs out (R60): how many of an item sold by the piece its host has left, kept in
 * `item_stock` apart from the catalog, so an order takes from one row under its own lock rather
 * than rewriting the catalog, and a save that leaves a count out keeps it (an order may have
 * taken one since the form was opened). An item with no row isn't counted.
 *
 * An order takes what it asks inside its message's transaction, refused with the count when
 * fewer are left, and keeps what it took in `order_stock` while it's open. The row goes when the
 * order is on its way (the stock is spent), or when it's given back, once, because the order was
 * cancelled, taken down or erased first: deleting the row is what says it was given, so two of
 * those at once give it once.
 *
 * Who reads a count: its host (the team, the person); anyone else only once fewer are left than
 * one order may take (0 is sold out), since that's when it limits what they order.
 */
import {
  type BookingItem,
  type BookingItemInput,
  isOrdered,
  type PlacedOrder,
  tr,
  trn,
} from '@caime/core';
import { type Kysely, type RawBuilder, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import type { BookingHost } from './booking';
import { humanTeam } from './booking-team';
import { AppError } from './errors';

type Q = Kysely<Database> | Transaction<Database>;
type Host = Pick<BookingHost, 'kind' | 'id'>;

/** An order for more than is left: how many there are, or none. */
export function soldOut(name: string, left: number): AppError {
  return new AppError(
    409,
    'sold_out',
    left > 0
      ? trn(left, '{name}: only one left.', '{name}: only {n} left.', { name })
      : tr('{name} is sold out.', { name }),
  );
}

/** A host's counts, by item, in one query. */
export async function stockOf(db: Q, hostId: string): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom('item_stock')
    .select(['item_id', 'remaining'])
    .where('host_id', '=', hostId)
    .execute();
  return new Map(rows.map((r) => [r.item_id, r.remaining]));
}

/** The items with their stock as this reader may read it: the host every count, anyone else
 * only a count that limits an order. */
export function withStock<T extends BookingItem>(
  items: T[],
  stock: Map<string, number>,
  isHost: boolean,
): T[] {
  return items.map((item) => {
    const { stock: _kept, ...rest } = item;
    const left = isOrdered(item) ? stock.get(item.id) : undefined;
    if (left === undefined || (!isHost && left >= item.maxQuantity)) return rest as T;
    return { ...rest, stock: left } as T;
  });
}

/** A host's counts when any of these items is sold by the piece (one query, none otherwise). */
export async function stockFor(
  db: Q,
  hostId: string,
  items: ReadonlyArray<Pick<BookingItem, 'unit'>>,
): Promise<Map<string, number>> {
  return items.some(isOrdered) ? stockOf(db, hostId) : new Map();
}

/** The items as this reader sees them, with the host's counts read once. */
export async function itemsWithStock<T extends BookingItem>(
  db: Q,
  hostId: string,
  items: T[],
  isHost: boolean,
): Promise<T[]> {
  if (!items.some(isOrdered)) return items;
  return withStock(items, await stockOf(db, hostId), isHost);
}

/** The host with every count, as an order is checked against before it's written. */
export async function hostWithStock(db: Q, host: BookingHost): Promise<BookingHost> {
  return { ...host, items: await itemsWithStock(db, host.id, host.items, true) };
}

/**
 * A save's counts: a number sets one, null stops counting, left out keeps it; an item gone from
 * the catalog, or no longer sold by the piece, isn't counted any more. In the save's
 * transaction, in item order.
 */
export async function saveStock(
  trx: Transaction<Database>,
  host: Host,
  items: Array<Pick<BookingItemInput, 'id' | 'unit' | 'stock'>>,
  now: Date,
): Promise<void> {
  const counted = items.filter((i) => isOrdered(i) && i.stock !== null).map((i) => i.id);
  await trx
    .deleteFrom('item_stock')
    .where('host_id', '=', host.id)
    .$if(counted.length > 0, (q) => q.where('item_id', 'not in', counted))
    .execute();
  const set = items
    .filter((i) => isOrdered(i) && typeof i.stock === 'number')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!set.length) return;
  await trx
    .insertInto('item_stock')
    .values(
      set.map((i) => ({
        org_id: host.kind === 'org' ? host.id : null,
        user_id: host.kind === 'person' ? host.id : null,
        item_id: i.id,
        remaining: i.stock as number,
        updated_at: now,
      })),
    )
    .onConflict((oc) =>
      oc.columns(['host_id', 'item_id']).doUpdateSet({
        remaining: (eb) => eb.ref('excluded.remaining'),
        updated_at: now,
      }),
    )
    .execute();
}

/**
 * An order takes what it asks of each counted item, under the counts' row locks taken in item
 * order (two orders never wait on each other the other way round). Fewer left than asked refuses
 * it, and the message's whole transaction with it. What it took is kept for giving back. True
 * when it took anything.
 */
export async function takeStock(
  trx: Transaction<Database>,
  host: Host,
  messageId: string,
  order: Pick<PlacedOrder, 'lines'>,
  now: Date,
): Promise<boolean> {
  const ids = [...new Set(order.lines.map((l) => l.itemId))].sort();
  if (!ids.length) return false;
  const rows = await trx
    .selectFrom('item_stock')
    .select(['item_id', 'remaining'])
    .where('host_id', '=', host.id)
    .where('item_id', 'in', ids)
    .orderBy('item_id')
    .forUpdate()
    .execute();
  if (!rows.length) return false;
  const left = new Map(rows.map((r) => [r.item_id, r.remaining]));
  const taken: Array<{ itemId: string; quantity: number }> = [];
  for (const line of order.lines) {
    const n = left.get(line.itemId);
    if (n === undefined) continue;
    if (line.quantity > n) throw soldOut(line.name, n);
    taken.push({ itemId: line.itemId, quantity: line.quantity });
  }
  if (!taken.length) return false;
  const values = sql.join(taken.map((t) => sql`(${t.itemId}, ${t.quantity}::int)`));
  await sql`update item_stock s set remaining = s.remaining - t.quantity, updated_at = ${now}
    from (values ${values}) as t (item_id, quantity)
    where s.host_id = ${host.id} and s.item_id = t.item_id`.execute(trx);
  await trx
    .insertInto('order_stock')
    .values(
      taken.map((t) => ({
        message_id: messageId,
        host_id: host.id,
        item_id: t.itemId,
        quantity: t.quantity,
      })),
    )
    .execute();
  return true;
}

/**
 * Giving back what the orders among `ids` (a query of message ids) took and still hold: the
 * statements for a `with`, `stock_taken` (the hosts given to) first, so an erasure gives back in
 * the same statement that erases (lib/org-data.ts). The counts are locked in host and item
 * order before any is added to, as an order takes them, so a give-back and an order never wait
 * on each other the other way round.
 */
export function stockBackCtes(ids: RawBuilder<unknown>, now: Date): RawBuilder<unknown> {
  return sql`stock_taken as (
      delete from order_stock where message_id in (${ids})
      returning host_id, item_id, quantity
    ),
    stock_locked as (
      select s.host_id, s.item_id from item_stock s
      where (s.host_id, s.item_id) in (select host_id, item_id from stock_taken)
      order by s.host_id, s.item_id
      for update of s
    ),
    stock_back as (
      update item_stock s set remaining = s.remaining + b.quantity, updated_at = ${now}
      from (
        select host_id, item_id, sum(quantity)::int as quantity from stock_taken group by 1, 2
      ) b
      where s.host_id = b.host_id and s.item_id = b.item_id
        and (s.host_id, s.item_id) in (select host_id, item_id from stock_locked)
    )`;
}

/** What these orders took, given back; the hosts given to. */
export async function giveBackStock(trx: Q, messageIds: string[], now: Date): Promise<string[]> {
  if (!messageIds.length) return [];
  const ids = sql.join(messageIds.map((id) => sql`${id}::uuid`));
  const { rows } = await sql<{ host_id: string }>`
    with ${stockBackCtes(sql`select unnest(array[${ids}])`, now)}
    select distinct host_id from stock_taken`.execute(trx);
  return rows.map((r) => r.host_id);
}

/**
 * An Order card moved, in the move's transaction: cancelled, it gives back what it took; on its
 * way (ready to collect, shipped), what it took is spent. The hosts whose counts changed.
 */
export async function orderMoved(
  trx: Transaction<Database>,
  messageId: string,
  to: string,
  now: Date,
): Promise<string[]> {
  if (to === 'cancelled') return giveBackStock(trx, [messageId], now);
  if (to === 'ready' || to === 'shipped' || to === 'delivered')
    await trx.deleteFrom('order_stock').where('message_id', '=', messageId).execute();
  return [];
}

/**
 * A host's counts changed (an order took or gave back): its devices read the offer again, as a
 * save tells them (M15): the team's, for an organization, else the person's.
 */
export async function tellStockChanged(ctx: AppContext, hostIds: string[]): Promise<void> {
  const unique = [...new Set(hostIds)];
  if (!unique.length) return;
  const orgs = new Set(
    (await ctx.db.selectFrom('organizations').select('id').where('id', 'in', unique).execute()).map(
      (o) => o.id,
    ),
  );
  for (const id of unique) {
    if (orgs.has(id)) {
      const team = await humanTeam(ctx.db, id);
      await ctx.bus.publish(
        team.map((u) => u.id),
        { type: 'booking.changed', data: { orgId: id } },
      );
    } else await ctx.bus.publish([id], { type: 'booking.changed', data: { orgId: null } });
  }
}
