import { ImportChatBody, type ImportChatView, ImportGroupChatBody, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { canEditConversation } from '@caime/core/permissions';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { assertCanWrite } from '../lib/blocks';
import { ensureDirectConversation } from '../lib/conversations';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { insertSystemMessage, participantsOf } from '../lib/messages';
import { between } from '../lib/relations';
import { createTopicConversation } from '../lib/topics';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Rows in one INSERT: a whole export in a few statements, none too large for a parameter list. */
const CHUNK = 500;
/** An export of 20,000 long messages is well under this; anything bigger isn't a chat. */
const BODY_LIMIT = 24 * 1024 * 1024;

/** One line of an export as it lands: who it's from here, and the name it had there if nobody. */
interface Landing {
  at: Date;
  senderId: string;
  text: string;
  /** The name it was written under, kept where it was taken as nobody here (a group's). */
  author?: string;
}

/**
 * Writes an export's lines into the topic made for it, in the order they were written, each
 * saying it was imported, then a line saying who brought it; both or all have read it. They
 * follow whatever the topic holds already (a word someone wrote in the moment since it was
 * made), under its row's lock, which is the one a message's sequence number takes.
 */
async function land(
  ctx: AppContext,
  by: string,
  conversationId: string,
  source: 'whatsapp',
  lines: Landing[],
  group: boolean,
): Promise<number> {
  const ordered = [...lines].sort((x, y) => x.at.getTime() - y.at.getTime());
  const last = ordered[ordered.length - 1]?.at ?? ctx.now();
  await ctx.db.transaction().execute(async (trx) => {
    const held = await trx
      .selectFrom('conversations')
      .select('last_seq')
      .where('id', '=', conversationId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const from = Number(held.last_seq);
    for (let i = 0; i < ordered.length; i += CHUNK) {
      await trx
        .insertInto('messages')
        .values(
          ordered.slice(i, i + CHUNK).map((m, j) => ({
            id: uuidv7(),
            conversation_id: conversationId,
            seq: from + i + j + 1,
            sender_id: m.senderId,
            client_id: null,
            kind: 'text' as const,
            body: m.text,
            payload: JSON.stringify({
              imported: { source, by, ...(m.author ? { author: m.author } : {}) },
            }),
            created_at: m.at,
          })),
        )
        .execute();
    }
    await trx
      .updateTable('conversations')
      .set({ last_seq: from + ordered.length, last_message_at: last, updated_at: ctx.now() })
      .where('id', '=', conversationId)
      .execute();
    // They wrote it, so they've read it: nothing here is new to anyone.
    await trx
      .updateTable('participants')
      .set({ last_read_seq: from + ordered.length, last_delivered_seq: from + ordered.length })
      .where('conversation_id', '=', conversationId)
      .execute();
    // Counted for the product's metrics: how many, never who wrote what.
    await recordEvent(trx, 'chat.imported', by, { group, count: ordered.length });
  });
  await insertSystemMessage(ctx, conversationId, by, 'imported', {
    source,
    count: ordered.length,
  });
  ctx.metrics.messages.inc({ kind: 'imported' }, ordered.length);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
    { type: 'conversation.updated', data: { conversationId } },
  );
  return ordered.length;
}

/**
 * A chat brought over from WhatsApp (R45). It lands as a topic of the one-to-one with someone
 * you're connected with, its messages dated as they were written and each saying it was
 * imported (`payload.imported`), and a line at the end saying who brought it and when. Nothing
 * is written into the general conversation: the history is beside it, not mixed into what was
 * said here. It goes past `sendMessage` on purpose: the messages are the past, so nothing is
 * notified, suggested, moved or read from them; both people have read them (they wrote them).
 * A group's (M16 C3g) lands the same way as a topic of a group its owner or an admin brings it
 * to: each name in the export is one of the group's people where they said so, or stays a name
 * on the line of whoever brought it (`payload.imported.author`), which the app draws as that
 * name's, never as theirs.
 */
export async function importRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post(
    '/conversations/import',
    { bodyLimit: BODY_LIMIT },
    async (req, reply): Promise<ImportChatView> => {
      const auth = requireAuth(req);
      const body = parse(ImportChatBody, req.body);
      if (body.userId === auth.userId) throw badRequest(tr('That’s you.'));
      const b = await between(ctx.db, auth.userId, body.userId);
      if (b.blockedByMe || b.blockedMe) throw forbidden(tr('You can’t message this person.'));
      if (!b.connected) throw forbidden(tr('Connect first to bring a chat over.'));
      ctx.limiter.hit(`import:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
      const general = await ensureDirectConversation(ctx.db, auth.userId, body.userId, {
        connectionId: b.connectionId,
        createdBy: auth.userId,
      });
      await assertCanWrite(ctx, general.id, auth.userId);
      const conversationId = await createTopicConversation(
        ctx,
        auth.userId,
        general.id,
        body.title ?? 'WhatsApp',
      );
      const imported = await land(
        ctx,
        auth.userId,
        conversationId,
        body.source,
        body.messages.map((m) => ({
          at: new Date(m.at),
          senderId: m.mine ? auth.userId : body.userId,
          text: m.text,
        })),
        false,
      );
      reply.status(201);
      const view: ImportChatView = { conversationId, imported };
      return view;
    },
  );

  app.post(
    '/conversations/:id/import',
    { bodyLimit: BODY_LIMIT },
    async (req, reply): Promise<ImportChatView> => {
      const auth = requireAuth(req);
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      const body = parse(ImportGroupChatBody, req.body);
      const group = await ctx.db
        .selectFrom('conversations as c')
        .innerJoin('participants as p', 'p.conversation_id', 'c.id')
        .select(['c.kind', 'c.parent_id', 'c.space_id', 'c.privacy_class', 'p.role'])
        .where('c.id', '=', id)
        .where('p.user_id', '=', auth.userId)
        .where('p.left_at', 'is', null)
        .executeTakeFirst();
      if (!group) throw notFound(tr('That conversation'));
      // A group of its own: never a topic, a space's conversation, or a private one, whose words
      // are sealed for its people's devices and never written by the server.
      if (
        group.kind !== 'group' ||
        group.parent_id ||
        group.space_id ||
        group.privacy_class === 'private'
      )
        throw badRequest(tr('A WhatsApp group comes over into a group of its own.'));
      if (!canEditConversation(group.kind, group.role))
        throw forbidden(tr('Only its owner and admins bring a chat over.'));
      if (body.messages.some((m) => m.author >= body.authors.length))
        throw badRequest(tr('Every message names one of the names.'));
      ctx.limiter.hit(`import:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
      await assertCanWrite(ctx, id, auth.userId);
      // Whoever a name is taken as is someone in the group now, and a person.
      const named = [...new Set(body.authors.flatMap((a) => (a.userId ? [a.userId] : [])))];
      if (named.length > 0) {
        const inIt = await ctx.db
          .selectFrom('participants as p')
          .innerJoin('users as u', 'u.id', 'p.user_id')
          .select('p.user_id')
          .where('p.conversation_id', '=', id)
          .where('p.left_at', 'is', null)
          .where('u.kind', '=', 'human')
          .where('p.user_id', 'in', named)
          .execute();
        if (inIt.length !== named.length)
          throw badRequest(tr('Everyone a name is taken as is someone in this group.'));
      }
      const conversationId = await createTopicConversation(
        ctx,
        auth.userId,
        id,
        body.title ?? 'WhatsApp',
        'standard',
        { forImport: true },
      );
      const imported = await land(
        ctx,
        auth.userId,
        conversationId,
        body.source,
        body.messages.map((m) => {
          const who = body.authors[m.author];
          return {
            at: new Date(m.at),
            senderId: who?.userId ?? auth.userId,
            text: m.text,
            ...(who?.userId ? {} : { author: who?.name }),
          };
        }),
        true,
      );
      reply.status(201);
      const view: ImportChatView = { conversationId, imported };
      return view;
    },
  );
}
