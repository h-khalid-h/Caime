import { ImportChatBody, type ImportChatView, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { assertCanWrite } from '../lib/blocks';
import { ensureDirectConversation } from '../lib/conversations';
import { badRequest, forbidden } from '../lib/errors';
import { insertSystemMessage, participantsOf } from '../lib/messages';
import { between } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { createTopicConversation } from './conversations';

/** Rows in one INSERT: a whole export in a few statements, none too large for a parameter list. */
const CHUNK = 500;
/** An export of 20,000 long messages is well under this; anything bigger isn't a chat. */
const BODY_LIMIT = 24 * 1024 * 1024;

/**
 * A chat brought over from WhatsApp (R45). It lands as a topic of the one-to-one with someone
 * you're connected with, its messages dated as they were written and each saying it was
 * imported (`payload.imported`), and a line at the end saying who brought it and when. Nothing
 * is written into the general conversation: the history is beside it, not mixed into what was
 * said here. It goes past `sendMessage` on purpose: the messages are the past, so nothing is
 * notified, suggested, moved or read from them; both people have read them (they wrote them).
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
      // In the order they were written, whatever order the file had them in.
      const lines = body.messages
        .map((m) => ({ ...m, at: new Date(m.at) }))
        .sort((x, y) => x.at.getTime() - y.at.getTime());
      const last = lines[lines.length - 1]?.at ?? ctx.now();
      const imported = { source: body.source, by: auth.userId };
      await ctx.db.transaction().execute(async (trx) => {
        for (let i = 0; i < lines.length; i += CHUNK) {
          await trx
            .insertInto('messages')
            .values(
              lines.slice(i, i + CHUNK).map((m, j) => ({
                id: uuidv7(),
                conversation_id: conversationId,
                seq: i + j + 1,
                sender_id: m.mine ? auth.userId : body.userId,
                client_id: null,
                kind: 'text' as const,
                body: m.text,
                payload: JSON.stringify({ imported }),
                created_at: m.at,
              })),
            )
            .execute();
        }
        await trx
          .updateTable('conversations')
          .set({ last_seq: lines.length, last_message_at: last, updated_at: ctx.now() })
          .where('id', '=', conversationId)
          .execute();
        // Both wrote it, so both have read it: nothing here is new to anyone.
        await trx
          .updateTable('participants')
          .set({ last_read_seq: lines.length, last_delivered_seq: lines.length })
          .where('conversation_id', '=', conversationId)
          .execute();
      });
      await insertSystemMessage(ctx, conversationId, auth.userId, 'imported', {
        source: body.source,
        count: lines.length,
      });
      ctx.metrics.messages.inc({ kind: 'imported' }, lines.length);
      await ctx.bus.publish(
        (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
        { type: 'conversation.updated', data: { conversationId } },
      );
      reply.status(201);
      const view: ImportChatView = { conversationId, imported: lines.length };
      return view;
    },
  );
}
