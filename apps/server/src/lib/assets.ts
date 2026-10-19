/**
 * What's been shared, gathered (PRD §26): a conversation's asset index, and since M16 H6 the same
 * index across conversations, for the files between two people (the conversations they have
 * together, as the profile counts them) and a space's (its conversations the viewer is in). One
 * query for a page, one for the counts, whatever the scope: newest first, by kind, only what the
 * viewer may read (`readableBy`: not deleted, not past its time, not deleted for themselves).
 */
import type { AssetsResponse, AssetView } from '@caime/core/api';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { AssetKind } from '../db/schema';
import { type CustomerMask, maskId } from './business';
import { mayLinkFiles } from './file-links';
import { fileView, readableBy } from './messages';
import { pairKey } from './relations';

export const ASSET_KINDS = [
  'photo',
  'video',
  'document',
  'audio',
  'link',
  'location',
  'contact',
] as const satisfies readonly AssetKind[];

/** A page of an index: one kind or several (`kind=photo,video`), and where the last one ended. */
export const AssetsQuery = z.object({
  kind: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum(ASSET_KINDS)).min(1))
    .optional(),
  // Newest first; the next page starts after the last one shown.
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
export type AssetsQueryT = z.infer<typeof AssetsQuery>;

/** Where an index looks: one conversation (masked for a customer), or several, each titled. */
export type AssetScope =
  | { kind: 'conversation'; id: string; mask: CustomerMask | null }
  | { kind: 'across'; ids: string[] };

const EMPTY: AssetsResponse = { counts: {}, assets: [], nextBefore: null };

export async function assetsPage(
  ctx: AppContext,
  viewerId: string,
  scope: AssetScope,
  q: AssetsQueryT,
): Promise<AssetsResponse> {
  const ids = scope.kind === 'conversation' ? [scope.id] : scope.ids;
  if (!ids.length) return EMPTY;
  const now = ctx.now();
  const across = scope.kind === 'across';
  const [rows, counts, mayLink] = await Promise.all([
    ctx.db
      .selectFrom('assets')
      .leftJoin('files as f', 'f.id', 'assets.file_id')
      .leftJoin('messages as m', 'm.id', 'assets.message_id')
      .leftJoin('users as u', 'u.id', 'assets.sender_id')
      .innerJoin('conversations as c', 'c.id', 'assets.conversation_id')
      .select([
        'm.seq as message_seq',
        'assets.id',
        'assets.kind',
        'assets.url',
        'assets.title',
        'assets.host',
        'assets.message_id',
        'assets.sender_id',
        'assets.conversation_id',
        'assets.created_at',
        'f.id as file_id',
        'f.name',
        'f.mime',
        'f.size',
        'f.kind as file_kind',
        'f.width',
        'f.height',
        'f.duration_ms',
        'f.thumb_key',
        'f.owner_id as file_owner',
        'u.display_name as sender_name',
        'c.title as conversation_title',
        'c.is_general',
        'c.privacy_class',
      ])
      .where('assets.conversation_id', 'in', ids)
      .where(readableBy(viewerId, now, 'm'))
      .$if(Boolean(q.kind), (qb) => qb.where('assets.kind', 'in', q.kind!))
      .$if(Boolean(q.before), (qb) => qb.where('assets.id', '<', q.before!))
      .orderBy('assets.id', 'desc')
      .limit(q.limit + 1)
      .execute(),
    ctx.db
      .selectFrom('assets')
      .leftJoin('messages as m', 'm.id', 'assets.message_id')
      .select(['assets.kind', sql<number>`count(*)::int`.as('n')])
      .where('assets.conversation_id', 'in', ids)
      .where(readableBy(viewerId, now, 'm'))
      .groupBy('assets.kind')
      .execute(),
    mayLinkFiles(ctx, viewerId),
  ]);
  const page = rows.slice(0, q.limit);
  const mask = scope.kind === 'conversation' ? scope.mask : null;
  return {
    counts: Object.fromEntries(counts.map((c) => [c.kind, c.n])),
    nextBefore: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    assets: page.map(
      (r): AssetView => ({
        id: r.id,
        kind: r.kind,
        url: r.url,
        title: r.title,
        host: r.host,
        messageId: r.message_id,
        messageSeq: r.message_seq === null ? null : Number(r.message_seq),
        senderId: mask ? maskId(mask, r.sender_id) : r.sender_id,
        createdAt: r.created_at.toISOString(),
        conversationId: r.conversation_id,
        senderName: across ? (r.sender_name ?? null) : null,
        // A topic, or a space's conversation, by its title; the conversation two people have is
        // just theirs.
        where: across && !r.is_general ? (r.conversation_title ?? null) : null,
        // Only whoever sent a file gives out a link to it, never from a private conversation.
        linkable:
          mayLink &&
          r.file_id !== null &&
          r.file_owner === viewerId &&
          r.sender_id === viewerId &&
          r.privacy_class !== 'private',
        file: r.file_id
          ? fileView({
              id: r.file_id,
              name: r.name!,
              mime: r.mime!,
              size: r.size!,
              kind: r.file_kind!,
              width: r.width,
              height: r.height,
              duration_ms: r.duration_ms,
              thumb_key: r.thumb_key,
            })
          : null,
      }),
    ),
  };
}

/**
 * The conversations two people have together that the viewer is in and may look back through:
 * their chat and its topics, never a message request still waiting on the viewer or one they
 * declined (its photos are veiled, M16 B4), nor a private one (its files are sealed).
 */
export async function conversationsBetween(
  ctx: AppContext,
  viewerId: string,
  otherId: string,
): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', viewerId),
    )
    .select('c.id')
    .where('c.direct_key', '=', pairKey(viewerId, otherId).key)
    .where('c.privacy_class', '<>', 'private')
    .where('p.left_at', 'is', null)
    .where((eb) =>
      eb.or([eb('p.request_state', 'is', null), eb('p.request_state', '=', 'accepted')]),
    )
    .execute();
  return rows.map((r) => r.id);
}

/** A space's conversations the viewer is in now (null when they aren't in the space). */
export async function spaceConversationsOf(
  ctx: AppContext,
  viewerId: string,
  spaceId: string,
): Promise<string[] | null> {
  const member = await ctx.db
    .selectFrom('space_members as sm')
    .innerJoin('spaces as s', 's.id', 'sm.space_id')
    .select('sm.space_id')
    .where('sm.space_id', '=', spaceId)
    .where('sm.user_id', '=', viewerId)
    .where('sm.left_at', 'is', null)
    .where('s.archived_at', 'is', null)
    .executeTakeFirst();
  if (!member) return null;
  const rows = await ctx.db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', viewerId),
    )
    .select('c.id')
    .where('c.space_id', '=', spaceId)
    .where('c.privacy_class', '<>', 'private')
    .where('p.left_at', 'is', null)
    .execute();
  return rows.map((r) => r.id);
}
