/**
 * Mail out (PRODUCT-REVIEW R75, phase 1): what a person writes to someone reached by mail goes
 * out as mail, from their own address (or the organization's, in a customer thread), in the
 * thread the other side's client knows (In-Reply-To and References), with the message's files
 * attached. How far it got is what the provider says, honestly: sent (the provider took it),
 * delivered (the receiving server took it), bounced; never a read by a tracking pixel. Words and
 * files go; a card or a sticker stays on Caime (phase 2 says them in words).
 *
 * A provisional person who has been silent for a year, or is in no conversation any more, is
 * swept: their row goes, their words stay with whoever they wrote to (the sender column clears).
 */
import { uuidv4 } from '@caime/core';
import { bareSubject, replySubject, subjectFromText } from '@caime/core/mail';
import type { AppContext } from '../context';
import type { Conversation, Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { mailAddressOf } from './mail-address';
import {
  type DeliveryEvent,
  MAIL_ATTACHMENT_MAX,
  type MailAttachment,
  MailRefused,
} from './mail-provider';
import { messageViews } from './messages';
import { storageFor } from './storage';

export const MAIL_SEND_JOB = 'mail.send';
/** A provisional person silent this long goes (their words stay). */
const PROVISIONAL_KEEP_MS = 365 * 24 * 3_600_000;
/** How many earlier ids a References header carries at most. */
const REFERENCES_MAX = 20;

export function registerMailJobs(): void {
  registerJob(MAIL_SEND_JOB, send);
  registerPeriodic({
    name: 'mail.sweep',
    everyMs: 24 * 3_600_000,
    run: sweepProvisional,
    background: true,
  });
}

/**
 * A message just sent in a conversation with someone reached by mail: queue the mail to each of
 * them. One query to find them, only for a one-to-one or a customer thread, only for a person's
 * words and files, never for mail that just came in.
 */
export async function queueMailOut(
  ctx: AppContext,
  message: Message,
  conversation: Pick<Conversation, 'kind'>,
  memberIds: string[],
): Promise<void> {
  if (!ctx.mailProvider || message.channel === 'mail' || message.sealed || !message.sender_id)
    return;
  if (conversation.kind !== 'direct' && conversation.kind !== 'business') return;
  if (message.kind !== 'text' && message.kind !== 'media' && message.kind !== 'file') return;
  const others = memberIds.filter((id) => id !== message.sender_id);
  if (!others.length) return;
  const reached = await ctx.db
    .selectFrom('users')
    .select('id')
    .where('id', 'in', others)
    .where('kind', '=', 'provisional')
    .execute();
  for (const p of reached)
    await enqueue(
      ctx,
      MAIL_SEND_JOB,
      { messageId: message.id, toUserId: p.id },
      { dedupeKey: `mail:${message.id}:${p.id}`, maxAttempts: 6 },
    );
}

async function send(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const provider = ctx.mailProvider;
  const domain = ctx.config.MAIL_DOMAIN;
  if (!provider || !domain) return;
  const messageId = String(payload.messageId ?? '');
  const toUserId = String(payload.toUserId ?? '');
  if (!messageId || !toUserId) return;
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (!m || m.deleted_at || !m.sender_id) return;
  const to = await ctx.db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('id', '=', toUserId)
    .where('kind', '=', 'provisional')
    .executeTakeFirst();
  if (!to) return;
  // Sent once: a job run again after a crash past the send finds its row.
  const sent = await ctx.db
    .selectFrom('mail_messages')
    .select('message_id')
    .where('message_id', '=', m.id)
    .where('direction', '=', 'out')
    .where('to_address', '=', to.email)
    .executeTakeFirst();
  if (sent) return;
  const [conversation, sender] = await Promise.all([
    ctx.db
      .selectFrom('conversations')
      .select(['id', 'kind', 'title', 'org_id'])
      .where('id', '=', m.conversation_id)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('users')
      .select(['id', 'handle', 'display_name', 'kind'])
      .where('id', '=', m.sender_id)
      .executeTakeFirstOrThrow(),
  ]);
  // A person's words go out as theirs; in a customer thread, as the organization's.
  if (sender.kind !== 'human') return;
  let from = { address: mailAddressOf(sender.handle, ctx.config) ?? '', name: sender.display_name };
  if (conversation.kind === 'business') {
    if (!conversation.org_id) return;
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['handle', 'name'])
      .where('id', '=', conversation.org_id)
      .executeTakeFirstOrThrow();
    from = { address: mailAddressOf(org.handle, ctx.config) ?? '', name: org.name };
  }
  if (!from.address) return;
  // The thread the other side's client knows: the latest mail either way in this conversation.
  const latest = await ctx.db
    .selectFrom('mail_messages as mm')
    .innerJoin('messages as x', 'x.id', 'mm.message_id')
    .select(['mm.rfc_message_id', 'mm.references_ids', 'mm.subject', 'mm.direction'])
    .where('x.conversation_id', '=', m.conversation_id)
    .where('mm.message_id', '<>', m.id)
    .orderBy('x.seq', 'desc')
    .executeTakeFirst();
  const body = m.body ?? '';
  const subject =
    (conversation.title &&
      (latest ? `Re: ${bareSubject(conversation.title)}` : conversation.title)) ||
    replySubject(latest?.subject) ||
    subjectFromText(body) ||
    `A message from ${from.name}`;
  const attachments = await attachmentsOf(ctx, m.id);
  const rfcMessageId = `<${uuidv4()}@${domain}>`;
  const references = latest
    ? [...latest.references_ids, latest.rfc_message_id].slice(-REFERENCES_MAX)
    : [];
  const row = {
    message_id: m.id,
    direction: 'out' as const,
    rfc_message_id: rfcMessageId,
    in_reply_to: latest?.rfc_message_id ?? null,
    references_ids: references,
    from_address: from.address,
    to_address: to.email,
    subject: subject.slice(0, 500),
    provider: provider.name,
  };
  try {
    const { providerId } = await provider.send({
      from,
      to: to.email,
      subject,
      text: body || attachments.map((a) => a.name).join('\n'),
      messageId: rfcMessageId,
      inReplyTo: row.in_reply_to,
      references,
      attachments,
    });
    await ctx.db
      .insertInto('mail_messages')
      .values({ ...row, provider_id: providerId, delivery: 'sent', delivery_at: ctx.now() })
      .execute();
    ctx.metrics.mail.inc({ direction: 'out', outcome: 'sent' });
  } catch (err) {
    // Refused for what it is (an address nobody takes mail at): said on the message, not retried.
    if (!(err instanceof MailRefused)) throw err;
    await ctx.db
      .insertInto('mail_messages')
      .values({
        ...row,
        provider_id: null,
        delivery: 'bounced',
        delivery_at: ctx.now(),
        delivery_detail: err.message.slice(0, 500),
      })
      .execute();
    ctx.metrics.mail.inc({ direction: 'out', outcome: 'refused' });
  }
  // It went as mail: the message says so, as one that came as mail does (`MessageView.mail`
  // is read for a row whose channel is mail), on the row and in what the sender is told now.
  await ctx.db.updateTable('messages').set({ channel: 'mail' }).where('id', '=', m.id).execute();
  await tellSender(ctx, { ...m, channel: 'mail' });
}

/** The message's files, as attachments, within what a mail carries. */
async function attachmentsOf(ctx: AppContext, messageId: string): Promise<MailAttachment[]> {
  const files = await ctx.db
    .selectFrom('message_files as mf')
    .innerJoin('files as f', 'f.id', 'mf.file_id')
    .select(['f.name', 'f.mime', 'f.size', 'f.storage_key'])
    .where('mf.message_id', '=', messageId)
    .where('f.status', '=', 'ready')
    .orderBy('mf.position')
    .execute();
  const storage = storageFor(ctx.config);
  const out: MailAttachment[] = [];
  let total = 0;
  for (const f of files) {
    const size = Number(f.size);
    if (size > MAIL_ATTACHMENT_MAX || total + size > MAIL_ATTACHMENT_MAX) continue;
    const chunks: Buffer[] = [];
    for await (const chunk of storage.read(f.storage_key))
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    out.push({ name: f.name, mime: f.mime, bytes: Buffer.concat(chunks) });
    total += size;
  }
  return out;
}

/** The sender's devices see how far it got, on the message. */
async function tellSender(ctx: AppContext, m: Message): Promise<void> {
  if (!m.sender_id) return;
  const [view] = await messageViews(ctx.db, [m], m.sender_id);
  if (view)
    await ctx.bus.publish([m.sender_id], {
      type: 'message.updated',
      data: { ...view, clientId: null },
    });
}

/** What the provider says of mail sent: delivered or bounced, onto the message, told to its sender. */
export async function applyMailEvents(ctx: AppContext, events: DeliveryEvent[]): Promise<number> {
  const provider = ctx.mailProvider;
  if (!provider) return 0;
  let applied = 0;
  for (const e of events) {
    const updated = await ctx.db
      .updateTable('mail_messages')
      .set({
        delivery: e.state,
        delivery_at: e.at ? new Date(e.at) : ctx.now(),
        delivery_detail: e.detail,
      })
      .where('provider', '=', provider.name)
      .where('provider_id', '=', e.providerId)
      .where('direction', '=', 'out')
      // Forward only: nothing goes back to sent, and a delivery after a bounce is the bounce's.
      .where((eb) => eb.or([eb('delivery', '=', 'sent'), eb('delivery', 'is', null)]))
      .returning('message_id')
      .executeTakeFirst();
    if (!updated) continue;
    applied++;
    ctx.metrics.mail.inc({ direction: 'out', outcome: e.state });
    const m = await ctx.db
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('id', '=', updated.message_id)
      .executeTakeFirst();
    if (m) await tellSender(ctx, m);
  }
  return applied;
}

/**
 * Provisional people nobody has written to or heard from in a year, or who are in no
 * conversation any more, go; the words they sent stay with whoever they wrote to.
 */
export async function sweepProvisional(ctx: AppContext): Promise<void> {
  const since = new Date(ctx.now().getTime() - PROVISIONAL_KEEP_MS);
  await ctx.db
    .deleteFrom('users')
    .where('kind', '=', 'provisional')
    .where((eb) =>
      eb.or([
        eb.not(
          eb.exists(
            eb
              .selectFrom('participants as p')
              .select('p.user_id')
              .whereRef('p.user_id', '=', 'users.id')
              .where('p.left_at', 'is', null),
          ),
        ),
        eb.and([
          eb('created_at', '<', since),
          eb.not(
            eb.exists(
              eb
                .selectFrom('messages as m')
                .innerJoin('participants as p', 'p.conversation_id', 'm.conversation_id')
                .select('m.id')
                .whereRef('p.user_id', '=', 'users.id')
                .where('m.created_at', '>', since),
            ),
          ),
        ]),
      ]),
    )
    .execute();
}
