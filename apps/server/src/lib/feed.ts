/**
 * A person's feed (M16 G5, review 2026-10-17 §8 M and §11 step 6): what reached them, for the
 * bridges (Zapier's Retrieve Poll, Make, n8n, Pipedream) and their own scripts, so a recipe can
 * start on a new message, which the inbox, a list of conversations with no "since", never let
 * one do. Read two ways: without a cursor, the newest first, which a poller dedupes by `id`;
 * after one, in order from it, with `next` to carry on from.
 *
 * Nothing is passed over. Each message keeps the transaction that wrote it (`messages.tx`,
 * migration 0138), and the feed hands on only what lies below the oldest transaction still
 * running in this database as it reads: a message whose transaction began before another's
 * but commits after it is held back until it has, never skipped, and a page that isn't full
 * moves the cursor to that horizon, past whatever was read and left out. The cursor is sealed
 * (what's in it is the server's, bound to its person), and one from beyond the database's own
 * count of transactions (a backup restored into a new cluster: `caime_feed_forget`) is refused,
 * to be asked again without one.
 *
 * It reads as the person's inbox does: their own conversations (never an organization's they
 * answer for, whose apps hear those), one that came as a request only once they took it, and
 * never a private conversation, a line Caime wrote, a chat brought over, a mailing list's notice,
 * what they may no longer read, or, unless asked, what they sent themselves (a recipe that writes
 * back would hear itself). A business conversation's team reads as the organization (R15), and
 * an organization that keeps its conversations from its members' own apps keeps them from this
 * too (G3).
 */
import { type ConversationKind, type FeedEventView, type FeedResponse, tr } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { columnsOf, MESSAGE_COLUMNS } from '../db/schema';
import { masksFor } from './business';
import { conversationTitle, conversationTopic } from './conversation-titles';
import { badRequest } from './errors';
import { cardData } from './kits';
import { openIn } from './member-apps';
import { messagePreview, messageViews, readableBy } from './messages';
import { serverKey } from './server-keys';
import { seal, unseal } from './vault';

/** Where a reader is: the transaction and the message last handed on, or a horizon and none. */
export interface Cursor {
  t: string;
  i: string;
}
const NONE = '00000000-0000-0000-0000-000000000000';
/** A message's id, or `NONE` (a uuid of no version, which core's `isUuid` turns away). */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LABEL = 'caime feed cursor v1';
/** Without a cursor, what's new is in a conversation that moved within these days. */
const NEWEST_DAYS = 30;

export interface FeedOptions {
  /** The `next` a read gave, or null for the newest first. */
  after: string | null;
  limit: number;
  conversationId: string | null;
  /** What the person sent too. */
  mine: boolean;
  /** Organizations that keep their conversations from this request (G3): left out. */
  closed: readonly string[];
}

const cursorKey = (ctx: AppContext) => serverKey(ctx, 'feed.cursor');

/** A cursor for its person alone, its contents the server's. */
export async function sealFeedCursor(
  ctx: AppContext,
  userId: string,
  cursor: Cursor,
): Promise<string> {
  return seal(
    await cursorKey(ctx),
    Buffer.from(JSON.stringify(cursor)),
    `${LABEL} ${userId}`,
  ).toString('base64url');
}

async function openCursor(ctx: AppContext, userId: string, token: string): Promise<Cursor | null> {
  const plain = unseal(await cursorKey(ctx), Buffer.from(token, 'base64url'), `${LABEL} ${userId}`);
  if (!plain) return null;
  try {
    const c = JSON.parse(plain.toString()) as Partial<Cursor>;
    return typeof c.t === 'string' &&
      /^\d{1,20}$/.test(c.t) &&
      typeof c.i === 'string' &&
      ID.test(c.i)
      ? { t: c.t, i: c.i }
      : null;
  } catch {
    return null;
  }
}

const later = (a: Cursor, b: Cursor): Cursor => {
  const ta = BigInt(a.t);
  const tb = BigInt(b.t);
  return ta > tb || (ta === tb && a.i > b.i) ? a : b;
};

export async function personFeed(
  ctx: AppContext,
  userId: string,
  o: FeedOptions,
): Promise<FeedResponse> {
  const now = ctx.now();
  // The oldest transaction still running in this database (a snapshot's `xmin` would wait on
  // one in any database on the server, a stray session included): every one below it has
  // committed or never will. The snapshot is taken first and the sessions read after it, so a
  // transaction that ends in between has ended before the messages are read; `xmax` bounds the
  // rest, and anything at or past it is read next time.
  const { rows } = await sql<{ xmin: string; xmax: string }>`
    with s as (select pg_current_snapshot() as snap)
    select coalesce(
      (select min(x) from s, pg_snapshot_xip(s.snap) x where x::xid in (
        select backend_xid from pg_stat_activity
        where datname = current_database() and backend_xid is not null)),
      (select pg_snapshot_xmax(snap) from s)
    )::text as xmin, (select pg_snapshot_xmax(snap) from s)::text as xmax
  `.execute(ctx.db);
  const horizon = rows[0]!;
  let from: Cursor | null = null;
  if (o.after !== null) {
    from = await openCursor(ctx, userId, o.after);
    if (!from)
      throw badRequest(tr('That cursor isn’t one this feed gave you: ask once without it.'));
    if (BigInt(from.t) > BigInt(horizon.xmax))
      throw badRequest(tr('The feed began again since that cursor: ask once without it.'));
  }
  const newest = from === null;
  const order = newest ? 'desc' : 'asc';
  const found = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
    // Each conversation's own messages past the cursor, a page at most: the read is bounded by
    // the page, never by how much any one conversation holds.
    .innerJoinLateral(
      (eb) =>
        eb
          .selectFrom('messages as x')
          .select([...columnsOf('x', MESSAGE_COLUMNS), 'x.tx'])
          .whereRef('x.conversation_id', '=', 'p.conversation_id')
          .where('x.tx', 'is not', null)
          .where(sql<boolean>`x.tx < ${horizon.xmin}::xid8`)
          .$if(from !== null, (qb) =>
            qb.where(sql<boolean>`(x.tx, x.id) > (${from!.t}::xid8, ${from!.i}::uuid)`),
          )
          .where(readableBy(userId, now, 'x'))
          .where('x.sealed', 'is', null)
          .where('x.kind', '<>', 'system')
          .where(sql<boolean>`x.payload->'imported' is null`)
          .$if(!o.mine, (qb) => qb.where(sql<boolean>`x.sender_id is distinct from ${userId}`))
          .orderBy('x.tx', order)
          .orderBy('x.id', order)
          .limit(o.limit)
          .as('m'),
      (join) => join.onTrue(),
    )
    .leftJoin('users as u', 'u.id', 'm.sender_id')
    .select(columnsOf('m', MESSAGE_COLUMNS))
    .select([
      'm.tx',
      'c.kind as conversation_kind',
      'c.title',
      'c.is_general',
      'c.parent_id',
      sql<string | null>`(select g.title from conversations g where g.id = c.parent_id)`.as(
        'group_title',
      ),
      sql<string | null>`(select s.name from spaces s where s.id = c.space_id)`.as('space_name'),
      sql<
        string | null
      >`case when c.kind = 'direct' then (select o.display_name from participants x join users o on o.id = x.user_id where x.conversation_id = c.id and x.user_id <> ${userId} limit 1) end`.as(
        'other_name',
      ),
      sql<
        string | null
      >`(select a.name from business_threads t join organizations a on a.id = t.customer_org_id where t.conversation_id = c.id)`.as(
        'as_org',
      ),
      'u.display_name as sender_name',
      'u.handle as sender_handle',
      'u.kind as sender_kind',
    ])
    .where('p.user_id', '=', userId)
    .where('p.left_at', 'is', null)
    // An organization's conversations are its Business inbox's, whose apps hear them (PRD §38).
    .where('p.role', '<>', 'agent')
    // A request is theirs to take or leave in Caime before any recipe hears it.
    .where((eb) =>
      eb.or([eb('p.request_state', 'is', null), eb('p.request_state', '=', 'accepted')]),
    )
    .where('c.privacy_class', '=', 'standard')
    .where('c.notice', '=', false)
    .$if(o.conversationId !== null, (qb) => qb.where('c.id', '=', o.conversationId!))
    .$if(newest && o.conversationId === null, (qb) =>
      qb.where('c.last_message_at', '>', new Date(now.getTime() - NEWEST_DAYS * 86_400_000)),
    )
    .$if(o.closed.length > 0, (qb) => qb.where(openIn(userId, o.closed, sql.ref('c.id'))))
    .orderBy('m.tx', order)
    .orderBy('m.id', order)
    .limit(o.limit)
    .execute();
  ctx.metrics.feed.inc({ mode: newest ? 'newest' : 'after' });

  const views = await messageViews(ctx.db, found, userId);
  const masks = await masksFor(
    ctx,
    userId,
    found.filter((r) => r.conversation_kind === 'business').map((r) => r.conversation_id),
  );
  const orgIds = [...new Set([...masks.values()].map((m) => m.orgId))];
  const handles = new Map(
    orgIds.length
      ? (
          await ctx.db
            .selectFrom('organizations')
            .select(['id', 'handle'])
            .where('id', 'in', orgIds)
            .execute()
        ).map((r) => [r.id, r.handle] as const)
      : [],
  );
  const events = found.map((r, i): FeedEventView => {
    const view = views[i]!;
    const mask = masks.get(r.conversation_id) ?? null;
    const c = {
      kind: r.conversation_kind,
      title: r.title,
      is_general: r.is_general,
      parent_id: r.parent_id,
      group_title: r.group_title,
    };
    return {
      id: r.id,
      event: 'message.created',
      createdAt: r.created_at.toISOString(),
      data: {
        conversation: {
          id: r.conversation_id,
          kind: r.conversation_kind as ConversationKind,
          title: conversationTitle(c, {
            org: mask ? { name: mask.orgName } : null,
            asOrg: mask ? r.as_org : null,
            space: r.space_name !== null ? { name: r.space_name } : null,
            other: r.other_name !== null ? { displayName: r.other_name } : null,
          }),
          topic: conversationTopic(c),
        },
        // The organization to its customer, whoever on its team wrote (R15).
        from:
          r.sender_id === null
            ? null
            : mask && r.sender_id !== userId
              ? { id: mask.orgId, name: mask.orgName, handle: handles.get(mask.orgId) ?? null }
              : {
                  id: r.sender_id,
                  name: r.sender_name ?? '',
                  handle: r.sender_kind === 'provisional' ? null : r.sender_handle,
                },
        text: view.body?.trim() ? view.body : messagePreview(r),
        card: r.kind === 'kit' ? cardData(view.payload) : null,
        message: view,
      },
    };
  });
  const last = found.at(-1);
  const edge: Cursor = { t: horizon.xmin, i: NONE };
  // A full page carries on from its last; anything less has read everything below the horizon.
  const next =
    from === null
      ? edge
      : found.length === o.limit && last?.tx
        ? { t: last.tx, i: last.id }
        : later(from, edge);
  return { events, next: await sealFeedCursor(ctx, userId, next) };
}
