/**
 * Links to someone's own files (M16 H6): whoever sent a file gives out a link that opens it for
 * anyone who has it (`anyone`) or only for someone signed in to Caime (`caime`), for a day, a
 * week or a month, until it's taken back. The token is shown once, when it's made, and kept only
 * as its hash (`/f/<token>`, masked in the log); a link counts how many times its page was opened,
 * never by whom.
 *
 * A link stands for its maker sharing their own file from where they shared it, so it lives only
 * while that holds: the file is theirs, the message it came in is still there for them (not
 * deleted, for everyone or for themselves, nor past its time), they're still in its conversation,
 * their account is open, and an organization whose conversation it is isn't closed or suspended.
 * Anything else reads as a link that isn't open. Only adults give links out, never from a private
 * conversation (its files are sealed), and a file has at most `FILE_LINKS_OPEN` open at once.
 */
import type { FileLinkAudience, FileLinkView } from '@caime/core';
import { FILE_LINKS_OPEN, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { type Kysely, type Selectable, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, FileLinksTable } from '../db/schema';
import { hashToken, newToken } from './crypto';
import { badRequest, forbidden, notFound } from './errors';
import { readableBy } from './messages';
import { minorOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;
type Link = Selectable<FileLinksTable>;

/** A token as the link carries it (`f_` and 43 characters), and nothing else. */
export const FILE_TOKEN = /^f_[A-Za-z0-9_-]{43}$/;

export const fileLinkUrl = (ctx: AppContext, token: string) =>
  `${ctx.config.PUBLIC_URL}/f/${token}`;

export function fileLinkView(l: Link): FileLinkView {
  return {
    id: l.id,
    fileId: l.file_id,
    audience: l.audience,
    opens: l.opens,
    expiresAt: l.expires_at.toISOString(),
    createdAt: l.created_at.toISOString(),
  };
}

/** Whether this person gives out links at all: an adult with an open account of their own. */
export async function mayLinkFiles(ctx: AppContext, userId: string): Promise<boolean> {
  const u = await ctx.db
    .selectFrom('users')
    .select(['kind', 'suspended_at', 'deleted_at', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirst();
  return Boolean(
    u && u.kind === 'human' && !u.suspended_at && !u.deleted_at && !minorOf(u, ctx.now()),
  );
}

/**
 * The message a person shared their own file in that a link may stand for: the newest one still
 * there for them, in a conversation they're still in, never a private one, never an organization's
 * that's closed or suspended. Null when there's none.
 */
async function sharedIn(
  db: Q,
  userId: string,
  fileId: string,
  now: Date,
  messageId?: string,
): Promise<{ messageId: string; conversationId: string } | null> {
  const row = await db
    .selectFrom('message_files as mf')
    .innerJoin('files as f', 'f.id', 'mf.file_id')
    .innerJoin('messages as m', 'm.id', 'mf.message_id')
    .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', userId),
    )
    .leftJoin('business_threads as bt', 'bt.conversation_id', 'm.conversation_id')
    .leftJoin('organizations as o', 'o.id', 'bt.org_id')
    .select(['m.id', 'm.conversation_id'])
    .where('mf.file_id', '=', fileId)
    .$if(Boolean(messageId), (qb) => qb.where('m.id', '=', messageId!))
    .where('f.owner_id', '=', userId)
    .where('f.status', '=', 'ready')
    .where('m.sender_id', '=', userId)
    .where(readableBy(userId, now, 'm'))
    .where('c.privacy_class', '<>', 'private')
    .where('p.left_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('o.id', 'is', null),
        eb.and([eb('o.suspended_at', 'is', null), eb('o.archived_at', 'is', null)]),
      ]),
    )
    .orderBy('m.created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row ? { messageId: row.id, conversationId: row.conversation_id } : null;
}

/** Refused in one sentence for anyone who doesn't give links out (R29: under 18 among them). */
export const linksNotYours = () => forbidden(tr('Only adults give out links to their files.'));

/**
 * A new link to one of this person's files; the token comes back this once. Under the file's row:
 * fewer than `FILE_LINKS_OPEN` of theirs are open to it.
 */
export async function makeFileLink(
  ctx: AppContext,
  userId: string,
  fileId: string,
  o: { audience: FileLinkAudience; days: number },
): Promise<{ link: Link; token: string }> {
  if (!(await mayLinkFiles(ctx, userId))) throw linksNotYours();
  return ctx.db.transaction().execute(async (trx) => {
    await trx.selectFrom('files').select('id').where('id', '=', fileId).forUpdate().execute();
    const source = await sharedIn(trx, userId, fileId, ctx.now());
    if (!source) throw notFound(tr('That file'));
    const open = await trx
      .selectFrom('file_links')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('file_id', '=', fileId)
      .where('created_by', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', ctx.now())
      .executeTakeFirstOrThrow();
    if (open.n >= FILE_LINKS_OPEN)
      throw badRequest(tr('{n} links are open: take one back first.', { n: FILE_LINKS_OPEN }));
    const token = newToken('f');
    const link = await trx
      .insertInto('file_links')
      .values({
        id: uuidv7(),
        file_id: fileId,
        message_id: source.messageId,
        created_by: userId,
        token_hash: hashToken(token),
        audience: o.audience,
        expires_at: new Date(ctx.now().getTime() + o.days * 86_400_000),
        created_at: ctx.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { link, token };
  });
}

/** This person's links to a file still open, newest first. */
export async function fileLinksOf(
  ctx: AppContext,
  userId: string,
  fileId: string,
): Promise<FileLinkView[]> {
  const rows = await ctx.db
    .selectFrom('file_links')
    .selectAll()
    .where('file_id', '=', fileId)
    .where('created_by', '=', userId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .orderBy('created_at', 'desc')
    .limit(FILE_LINKS_OPEN)
    .execute();
  return rows.map(fileLinkView);
}

/** Taken back by its maker: it opens nothing from now on. */
export async function revokeFileLink(
  ctx: AppContext,
  userId: string,
  id: string,
): Promise<boolean> {
  const done = await ctx.db
    .updateTable('file_links')
    .set({ revoked_at: ctx.now() })
    .where('id', '=', id)
    .where('created_by', '=', userId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(done.numUpdatedRows) > 0;
}

/** What a live link opens: its file, and its maker by the name they show. */
export interface OpenFileLink {
  link: Link;
  file: {
    id: string;
    name: string;
    mime: string;
    size: string;
    kind: string;
    storage_key: string;
    thumb_key: string | null;
    preview_key: string | null;
    duration_ms: number | null;
  };
  by: string;
}

/**
 * What a token opens for whoever asks (`viewerId`, null for a visitor): the link and its file
 * while every condition above holds; `sign-in` for a link only signed-in people open, asked by a
 * visitor; null for anything else (no such link, run out, taken back, or no longer standing), so a
 * dead link reads as one. Someone signed in who blocked its maker, or whom its maker blocked, is
 * answered as for a dead link.
 */
export async function liveFileLink(
  ctx: AppContext,
  token: string,
  viewerId: string | null,
): Promise<OpenFileLink | 'sign-in' | null> {
  if (!FILE_TOKEN.test(token)) return null;
  const now = ctx.now();
  const link = await ctx.db
    .selectFrom('file_links')
    .selectAll()
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirst();
  if (!link) return null;
  if (link.audience === 'caime' && !viewerId) return 'sign-in';
  const [source, maker, file, blocked] = await Promise.all([
    sharedIn(ctx.db, link.created_by, link.file_id, now, link.message_id),
    ctx.db
      .selectFrom('users')
      .select(['display_name', 'kind', 'suspended_at', 'deleted_at'])
      .where('id', '=', link.created_by)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('files')
      .select([
        'id',
        'name',
        'mime',
        'size',
        'kind',
        'storage_key',
        'thumb_key',
        'preview_key',
        'duration_ms',
      ])
      .where('id', '=', link.file_id)
      .where('status', '=', 'ready')
      .executeTakeFirst(),
    viewerId && viewerId !== link.created_by
      ? ctx.db
          .selectFrom('blocks')
          .select('blocker_id')
          .where((eb) =>
            eb.or([
              eb.and([eb('blocker_id', '=', viewerId), eb('blocked_id', '=', link.created_by)]),
              eb.and([eb('blocker_id', '=', link.created_by), eb('blocked_id', '=', viewerId)]),
            ]),
          )
          .executeTakeFirst()
      : Promise.resolve(undefined),
  ]);
  if (!source || !file || blocked) return null;
  if (maker?.kind !== 'human' || maker.suspended_at || maker.deleted_at) return null;
  return { link, file: { ...file, size: String(file.size) }, by: maker.display_name };
}

/** Its page was opened once more (counted, never who). */
export async function countOpened(ctx: AppContext, linkId: string): Promise<void> {
  await ctx.db
    .updateTable('file_links')
    .set((eb) => ({ opens: eb('opens', '+', 1) }))
    .where('id', '=', linkId)
    .execute();
}

/** A person's links, for their export (what they gave out, never a token). */
export async function fileLinksForExport(db: Q, userId: string) {
  const rows = await db
    .selectFrom('file_links as l')
    .innerJoin('files as f', 'f.id', 'l.file_id')
    .select([
      'l.id',
      'f.name as file',
      'l.audience',
      'l.opens',
      'l.created_at',
      'l.expires_at',
      'l.revoked_at',
    ])
    .where('l.created_by', '=', userId)
    .orderBy('l.created_at', 'desc')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    file: r.file,
    audience: r.audience,
    opens: r.opens,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    takenBackAt: r.revoked_at?.toISOString() ?? null,
  }));
}
