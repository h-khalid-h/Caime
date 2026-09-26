/**
 * Sending and reading messages (PRD §21, §80; ADR-8, ADR-9). A message never appears sent and
 * then disappears: it is ordered by `seq` inside the insert transaction, and a retried send with
 * the same `clientId` returns the original.
 */
import {
  type Analysis,
  analyzeMessage,
  assessLink,
  isMinor,
  previewText,
  type SendMessageBodyT,
  uuidv7,
} from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { AssetKind, Database, Message } from '../db/schema';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { recordEvent } from './events';
import { isBlockedEitherWay, shareAConnection } from './relations';
import { privacyOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;

export interface FileView {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
  thumbUrl: string | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  seq: number;
  clientId: string | null;
  senderId: string | null;
  kind: Message['kind'];
  body: string | null;
  payload: Record<string, unknown>;
  mode: string;
  entities: Record<string, unknown>;
  mentions: string[];
  replyTo: {
    id: string;
    seq: number;
    senderId: string | null;
    preview: string;
    kind: string;
  } | null;
  forwarded: boolean;
  urgent: boolean;
  isQuestion: boolean;
  isRequest: boolean;
  reactions: Array<{ emoji: string; count: number; mine: boolean; userIds: string[] }>;
  files: FileView[];
  poll: { counts: Record<string, number>; mine: string[]; voters: number } | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export function fileView(f: {
  id: string;
  name: string;
  mime: string;
  size: string | number;
  kind: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  thumb_key: string | null;
}): FileView {
  return {
    id: f.id,
    name: f.name,
    mime: f.mime,
    size: Number(f.size),
    kind: f.kind,
    width: f.width,
    height: f.height,
    durationMs: f.duration_ms,
    url: `/v1/files/${f.id}`,
    thumbUrl: f.thumb_key ? `/v1/files/${f.id}/thumb` : null,
  };
}

export function messagePreview(
  m: Pick<Message, 'kind' | 'body' | 'payload' | 'deleted_at'>,
): string {
  if (m.deleted_at) return 'Message deleted';
  switch (m.kind) {
    case 'text':
      return previewText(m.body ?? '');
    case 'media':
      return m.body ? `📷 ${previewText(m.body, 80)}` : '📷 Photo';
    case 'file':
      return m.body ? `📎 ${previewText(m.body, 80)}` : '📎 File';
    case 'voice':
      return '🎙 Voice message';
    case 'location':
      return '📍 Location';
    case 'contact':
      return '👤 Contact';
    case 'poll':
      return `📊 ${previewText(String((m.payload as { question?: string }).question ?? 'Poll'), 80)}`;
    case 'sticker':
      return 'Sticker';
    case 'kit':
      return previewText(
        String((m.payload as { title?: string; kit?: string }).title ?? 'Card'),
        80,
      );
    default:
      return previewText(m.body ?? '');
  }
}

/** Load full views for a set of message rows, as seen by `viewerId`. */
export async function messageViews(
  db: Q,
  rows: Message[],
  viewerId: string,
): Promise<MessageView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((m) => m.id);
  const replyIds = rows.map((m) => m.reply_to_id).filter((x): x is string => Boolean(x));
  const [reactions, files, replies, votes] = await Promise.all([
    db
      .selectFrom('reactions')
      .selectAll()
      .where('message_id', 'in', ids)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('message_files')
      .innerJoin('files', 'files.id', 'message_files.file_id')
      .select([
        'message_files.message_id',
        'message_files.position',
        'files.id',
        'files.name',
        'files.mime',
        'files.size',
        'files.kind',
        'files.width',
        'files.height',
        'files.duration_ms',
        'files.thumb_key',
      ])
      .where('message_files.message_id', 'in', ids)
      .orderBy('message_files.position')
      .execute(),
    replyIds.length
      ? db.selectFrom('messages').selectAll().where('id', 'in', replyIds).execute()
      : Promise.resolve([] as Message[]),
    db.selectFrom('poll_votes').selectAll().where('message_id', 'in', ids).execute(),
  ]);
  return rows.map((m) => {
    const deleted = m.deleted_at !== null;
    const byEmoji = new Map<string, string[]>();
    for (const r of reactions.filter((x) => x.message_id === m.id)) {
      byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.user_id]);
    }
    const reply = m.reply_to_id ? replies.find((r) => r.id === m.reply_to_id) : undefined;
    let poll: MessageView['poll'] = null;
    if (m.kind === 'poll' && !deleted) {
      const mine = votes.filter((v) => v.message_id === m.id);
      const counts: Record<string, number> = {};
      for (const v of mine) counts[v.option_id] = (counts[v.option_id] ?? 0) + 1;
      poll = {
        counts,
        mine: mine.filter((v) => v.user_id === viewerId).map((v) => v.option_id),
        voters: new Set(mine.map((v) => v.user_id)).size,
      };
    }
    return {
      id: m.id,
      conversationId: m.conversation_id,
      seq: Number(m.seq),
      clientId: m.sender_id === viewerId ? m.client_id : null,
      senderId: m.sender_id,
      kind: m.kind,
      body: deleted ? null : m.body,
      payload: deleted ? {} : (m.payload ?? {}),
      mode: m.mode,
      entities: deleted ? {} : (m.entities ?? {}),
      mentions: m.mentions ?? [],
      replyTo: reply
        ? {
            id: reply.id,
            seq: Number(reply.seq),
            senderId: reply.sender_id,
            preview: messagePreview(reply),
            kind: reply.kind,
          }
        : null,
      forwarded: m.forwarded_from_id !== null,
      urgent: m.urgent,
      isQuestion: m.is_question,
      isRequest: m.is_request,
      reactions: [...byEmoji.entries()].map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        mine: userIds.includes(viewerId),
        userIds,
      })),
      files: deleted ? [] : files.filter((f) => f.message_id === m.id).map(fileView),
      poll,
      editedAt: m.edited_at?.toISOString() ?? null,
      deletedAt: m.deleted_at?.toISOString() ?? null,
      createdAt: m.created_at.toISOString(),
    };
  });
}

export async function participantsOf(
  db: Q,
  conversationId: string,
): Promise<Array<{ user_id: string; request_state: string | null; role: string }>> {
  return db
    .selectFrom('participants')
    .select(['user_id', 'request_state', 'role'])
    .where('conversation_id', '=', conversationId)
    .where('left_at', 'is', null)
    .execute();
}

/** May `senderId` start a direct conversation (a message request, R14) with `targetId`? */
export async function assertCanMessage(
  ctx: AppContext,
  senderId: string,
  targetId: string,
): Promise<void> {
  if (await isBlockedEitherWay(ctx.db, senderId, targetId))
    throw forbidden('You can’t message this person.');
  const [target, sender] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', targetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('users')
      .select(['birth_year'])
      .where('id', '=', senderId)
      .executeTakeFirstOrThrow(),
  ]);
  if (!target) throw notFound('That person');
  const now = ctx.now();
  const privacy = privacyOf(target, now);
  const refuse = () =>
    new AppError(
      403,
      'not_accepting_requests',
      `${target.display_name} only takes messages from people they know. Send a connection request instead.`,
    );
  if (privacy.messageRequests === 'nobody') throw refuse();
  // Under-18 accounts only hear from adults they share a connection with (R29).
  const needsSharedConnection =
    privacy.messageRequests === 'shared_connections' ||
    (isMinor(target.birth_year, now) && !isMinor(sender.birth_year, now));
  if (needsSharedConnection && !(await shareAConnection(ctx.db, senderId, targetId)))
    throw refuse();
}

export interface SendResult {
  message: Message;
  created: boolean;
  analysis: Analysis | null;
}

const LINK_ASSET = (url: string, host: string) => ({
  kind: 'link' as AssetKind,
  url,
  host,
  title: null,
});

export async function sendMessage(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  body: SendMessageBodyT,
  opts: { forwardedFromId?: string | null } = {},
): Promise<SendResult> {
  const existing = await ctx.db
    .selectFrom('messages')
    .selectAll()
    .where('sender_id', '=', senderId)
    .where('client_id', '=', body.clientId)
    .executeTakeFirst();
  if (existing) {
    if (existing.conversation_id !== conversationId)
      throw badRequest('That clientId was already used.');
    return { message: existing, created: false, analysis: null };
  }

  const conversation = await ctx.db
    .selectFrom('conversations')
    .selectAll()
    .where('id', '=', conversationId)
    .executeTakeFirst();
  if (!conversation) throw notFound('That conversation');
  const members = await participantsOf(ctx.db, conversationId);
  const me = members.find((p) => p.user_id === senderId);
  if (!me) throw notFound('That conversation');
  if (conversation.kind === 'broadcast' && !['owner', 'admin'].includes(me.role)) {
    throw forbidden('Only admins can post here.');
  }

  let acceptRequest = false;
  if (conversation.kind === 'direct') {
    const other = members.find((p) => p.user_id !== senderId);
    if (other) {
      if (await isBlockedEitherWay(ctx.db, senderId, other.user_id))
        throw forbidden('You can’t message this person.');
      if (me.request_state === 'pending') acceptRequest = true; // replying accepts their request
      if (other.request_state === 'pending') {
        const sent = await ctx.db
          .selectFrom('messages')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('conversation_id', '=', conversationId)
          .where('sender_id', '=', senderId)
          .executeTakeFirstOrThrow();
        if (sent.n >= 1) {
          throw new AppError(
            403,
            'awaiting_acceptance',
            'You can send more once they accept your message request.',
          );
        }
      }
    }
  }

  if (body.replyToId) {
    const reply = await ctx.db
      .selectFrom('messages')
      .select(['conversation_id'])
      .where('id', '=', body.replyToId)
      .executeTakeFirst();
    if (reply?.conversation_id !== conversationId)
      throw badRequest('You can only reply to a message in this conversation.');
  }
  const memberIds = new Set(members.map((p) => p.user_id));
  const mentions = [...new Set(body.mentions ?? [])].filter(
    (id) => memberIds.has(id) && id !== senderId,
  );

  let files: Array<{ id: string; kind: string; name: string }> = [];
  if (body.fileIds?.length) {
    files = await ctx.db
      .selectFrom('files')
      .select(['id', 'kind', 'name'])
      .where('id', 'in', body.fileIds)
      .where('status', '=', 'ready')
      .where((eb) =>
        eb.or([
          eb('owner_id', '=', senderId),
          // Forwarding: a file already in a conversation the sender can see.
          eb.exists(
            eb
              .selectFrom('message_files')
              .innerJoin('messages', 'messages.id', 'message_files.message_id')
              .innerJoin('participants', 'participants.conversation_id', 'messages.conversation_id')
              .select('message_files.file_id')
              .whereRef('message_files.file_id', '=', 'files.id')
              .where('participants.user_id', '=', senderId),
          ),
        ]),
      )
      .execute();
    if (files.length !== new Set(body.fileIds).size)
      throw badRequest('One of the attachments isn’t available.');
  }

  const sender = await ctx.db
    .selectFrom('users')
    .select(['time_zone', 'locale', 'workweek'])
    .where('id', '=', senderId)
    .executeTakeFirstOrThrow();
  const text = body.body?.trim() ?? '';
  const analysis = text
    ? analyzeMessage(text, {
        now: ctx.now(),
        timeZone: sender.time_zone,
        locale: sender.locale,
        workweek: sender.workweek,
      })
    : null;
  const entities = analysis
    ? {
        dates: analysis.dates.map((d) => ({
          text: d.text,
          date: d.date,
          time: d.time,
          at: d.at,
          past: d.past,
        })),
        amounts: analysis.amounts,
        links: analysis.links.map((l) => ({ url: l.url, host: l.host, ...assessLink(l.url) })),
        refs: analysis.refs,
        topics: analysis.topics,
        emails: analysis.emails,
        phones: analysis.phones,
      }
    : {};
  const mode =
    body.mode ??
    analysis?.mode ??
    (body.kind === 'poll' ? 'ask' : body.kind === 'location' || files.length ? 'share' : 'talk');

  const id = uuidv7();
  let message: Message;
  try {
    message = await ctx.db.transaction().execute(async (trx) => {
      const bumped = await trx
        .updateTable('conversations')
        .set({ last_seq: sql`last_seq + 1`, last_message_at: ctx.now(), updated_at: ctx.now() })
        .where('id', '=', conversationId)
        .returning('last_seq')
        .executeTakeFirstOrThrow();
      const seq = bumped.last_seq;
      const row = await trx
        .insertInto('messages')
        .values({
          id,
          conversation_id: conversationId,
          seq,
          sender_id: senderId,
          client_id: body.clientId,
          kind: body.kind,
          body: text || null,
          payload: JSON.stringify(body.payload ?? {}),
          mode,
          mode_source: body.mode ? 'user' : 'auto',
          entities: JSON.stringify(entities),
          mentions,
          reply_to_id: body.replyToId ?? null,
          forwarded_from_id: opts.forwardedFromId ?? null,
          urgent: body.urgent ?? false,
          is_question: analysis?.isQuestion ?? body.kind === 'poll',
          is_request: analysis?.isRequest ?? false,
          created_at: ctx.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (files.length) {
        await trx
          .insertInto('message_files')
          .values(files.map((f, i) => ({ message_id: id, file_id: f.id, position: i })))
          .execute();
      }
      const assets: Array<{
        kind: AssetKind;
        file_id?: string | null;
        url?: string | null;
        host?: string | null;
        title?: string | null;
      }> = [];
      for (const f of files) {
        const kind: AssetKind =
          f.kind === 'image'
            ? 'photo'
            : f.kind === 'video'
              ? 'video'
              : f.kind === 'audio'
                ? 'audio'
                : 'document';
        assets.push({ kind, file_id: f.id, title: f.name });
      }
      for (const l of analysis?.links ?? []) assets.push(LINK_ASSET(l.url, l.host));
      if (body.kind === 'location')
        assets.push({
          kind: 'location',
          title: (body.payload as { label?: string })?.label ?? null,
        });
      if (body.kind === 'contact')
        assets.push({ kind: 'contact', title: (body.payload as { name?: string })?.name ?? null });
      if (assets.length) {
        await trx
          .insertInto('assets')
          .values(
            assets.map((a) => ({
              id: uuidv7(),
              conversation_id: conversationId,
              message_id: id,
              sender_id: senderId,
              kind: a.kind,
              file_id: a.file_id ?? null,
              url: a.url ?? null,
              host: a.host ?? null,
              title: a.title ?? null,
              created_at: ctx.now(),
            })),
          )
          .execute();
      }
      await trx
        .updateTable('participants')
        .set({
          last_read_seq: seq,
          last_delivered_seq: seq,
          draft: null,
          draft_updated_at: null,
          ...(acceptRequest ? { request_state: 'accepted' as const } : {}),
        })
        .where('conversation_id', '=', conversationId)
        .where('user_id', '=', senderId)
        .execute();
      if (conversation.connection_id) {
        await trx
          .updateTable('connection_sides')
          .set({ last_interaction_at: ctx.now() })
          .where('connection_id', '=', conversation.connection_id)
          .execute();
      }
      await recordEvent(trx, 'message.sent', senderId, {
        messageId: id,
        conversationId,
        seq: String(seq),
      });
      return row;
    });
  } catch (err) {
    // A concurrent retry with the same clientId won the race: return its message.
    if ((err as { code?: string }).code === '23505') {
      const winner = await ctx.db
        .selectFrom('messages')
        .selectAll()
        .where('sender_id', '=', senderId)
        .where('client_id', '=', body.clientId)
        .executeTakeFirst();
      if (winner) return { message: winner, created: false, analysis: null };
    }
    throw err;
  }
  return { message, created: true, analysis };
}

/** System events in the timeline ("Sarah added Ahmed"), ordered like any message. */
export async function insertSystemMessage(
  ctx: AppContext,
  conversationId: string,
  actorId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<Message> {
  return ctx.db.transaction().execute(async (trx) => {
    const bumped = await trx
      .updateTable('conversations')
      .set({ last_seq: sql`last_seq + 1`, updated_at: ctx.now() })
      .where('id', '=', conversationId)
      .returning('last_seq')
      .executeTakeFirstOrThrow();
    const row = await trx
      .insertInto('messages')
      .values({
        id: uuidv7(),
        conversation_id: conversationId,
        seq: bumped.last_seq,
        sender_id: actorId,
        client_id: null,
        kind: 'system',
        body: null,
        payload: JSON.stringify({ event, ...data }),
        created_at: ctx.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await trx
      .updateTable('participants')
      .set({ last_read_seq: bumped.last_seq })
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', actorId)
      .execute();
    return row;
  });
}
