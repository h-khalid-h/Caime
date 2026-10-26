/**
 * Mail out (PRODUCT-REVIEW R75, phase 1): what a person writes to someone reached by mail goes
 * out as mail, from their own address (or the organization's, in a customer thread), in the
 * thread the other side's client knows (In-Reply-To and References), with the message's files
 * attached. How far it got is what the provider says, honestly: sent (the provider took it),
 * delivered (the receiving server took it), bounced; never a read by a tracking pixel. Words and
 * files go, and so do a voice note's recording, a place and the cards a mail can carry, said in
 * words (`mail-cards.ts`, M16 F3), a meeting's and an appointment's with its calendar invitation
 * and, cancelled here, its cancellation; a sticker or a poll is never sent (`notByMail`).
 *
 * A provisional person who has been silent for a year, or is in no conversation any more, is
 * swept: their row goes, their words stay with whoever they wrote to (the sender column clears).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { safeLocale, uuidv4 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { buildReply } from '@caime/core/ics';
import { bareSubject, notByMail, replySubject, subjectFromText } from '@caime/core/mail';
import { cardEndMs } from '@caime/core/meetings';
import type { AppContext } from '../context';
import type { Conversation, Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { asReader } from './i18n';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { mailAddressOf } from './mail-address';
import { cancellationOf, joinLinkFor, mailedAs, updateOf, wholeWhen } from './mail-cards';
import type { CardInvitation } from './mail-invitations';
import {
  type DeliveryEvent,
  MAIL_ATTACHMENT_MAX,
  type MailAttachment,
  MailRefused,
} from './mail-provider';
import { messageViews } from './messages';
import { serverKey } from './server-keys';
import { storageFor } from './storage';

export const MAIL_SEND_JOB = 'mail.send';
const MAIL_CARD_JOB = 'mail.card';
/** A provisional person silent this long goes (their words stay). */
const PROVISIONAL_KEEP_MS = 365 * 24 * 3_600_000;
/** How many earlier ids a References header carries at most. */
const REFERENCES_MAX = 20;

export function registerMailJobs(): void {
  registerJob(MAIL_SEND_JOB, send);
  registerJob(MAIL_CARD_JOB, (ctx, payload) =>
    payload.what === 'answer' ? sendAnswer(ctx, payload) : sendCardMail(ctx, payload),
  );
  registerPeriodic({
    name: 'mail.sweep',
    everyMs: 24 * 3_600_000,
    run: sweepProvisional,
    background: true,
  });
}

/**
 * A message just sent in a conversation with someone reached by mail: queue the mail to each of
 * them. One query to find them, only for a one-to-one or a customer thread, only for what a mail
 * carries (`notByMail`: words, files, a voice note, a place, a card of `MAIL_CARDS`), never for
 * mail that just came in.
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
  if (notByMail(message.kind, message.payload, conversation.kind === 'direct')) return;
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
    .select(['id', 'email', 'display_name'])
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
      .select(['id', 'handle', 'display_name', 'kind', 'preferences'])
      .where('id', '=', m.sender_id)
      .executeTakeFirstOrThrow(),
  ]);
  // A person's words go out as theirs; in a customer thread, as the organization's, and there
  // its AI agent's and its apps' too (R75): they speak for it, and a customer who wrote by mail
  // hears from it only by mail.
  const speaksForOrg =
    conversation.kind === 'business' && (sender.kind === 'agent' || sender.kind === 'bot');
  if (sender.kind !== 'human' && !speaksForOrg) return;
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
  // A card, a place or a voice note in words (M16 F3), a meeting's and an appointment's with its
  // calendar invitation, organized by the address it goes from, so the answer comes back to it.
  const said = await mailedAs(ctx, m, {
    senderId: sender.id,
    from: { name: from.name, email: from.address },
    to: { name: attendeeName(to.display_name), email: to.email },
    join: await joinLinkFor(ctx, m, conversation.kind, to.id),
  });
  if (!said && m.kind !== 'text' && m.kind !== 'media' && m.kind !== 'file') return;
  // The thread the other side's client knows: the latest mail either way in this conversation.
  const latest = await ctx.db
    .selectFrom('mail_messages as mm')
    .innerJoin('messages as x', 'x.id', 'mm.message_id')
    .select(['mm.rfc_message_id', 'mm.references_ids', 'mm.subject', 'mm.direction'])
    .where('x.conversation_id', '=', m.conversation_id)
    .where('mm.message_id', '<>', m.id)
    .orderBy('x.seq', 'desc')
    .executeTakeFirst();
  // The first mail Caime ever sends an address that never wrote to it (R93) says who wrote and
  // how to answer: the person reading it may never have heard of Caime. Any mail before, either
  // way, in any of their conversations, and they know.
  const known =
    latest ??
    (await ctx.db
      .selectFrom('mail_messages')
      .select('message_id')
      .where((eb) => eb.or([eb('to_address', '=', to.email), eb('from_address', '=', to.email)]))
      .executeTakeFirst());
  // An organization's greeting or away message (M16 H2): an automatic reply, said so in the mail.
  const autoReplied = Boolean((m.payload as { autoReply?: unknown } | null)?.autoReply);
  // Whether its sender is told when it's opened (R75): a person's own choice, on unless they
  // turned it off; an organization's agent and apps, as the organization, always; an automatic
  // reply never, since nobody wrote it to know.
  const trackOpens =
    !autoReplied &&
    (speaksForOrg || (sender.preferences as { mailOpens?: boolean }).mailOpens !== false);
  const rfcId = uuidv4();
  const footer = [
    // The first mail Caime ever sends an address that never wrote to it (R93) says who wrote
    // and how to answer: a person writing from Caime, or an organization answering someone who
    // wrote or booked on its page before an account (R97 (1)).
    !known
      ? `${from.name} wrote this on Caime, from ${from.address}. Reply to this mail to answer: your reply reaches them there.`
      : null,
    `Open in Caime: ${await seenLink(ctx, rfcId)}`,
    trackOpens ? `${from.name} is told when this mail is opened.` : null,
  ].filter(Boolean);
  const opening = `\n\n--\n${footer.join('\n')}`;
  const body = said?.text ?? m.body ?? '';
  // An organization's first mail to someone who wrote on its page (R97 (1)) answers what they
  // wrote, as a reply to a mail of theirs would: their words' first line is the subject.
  const opener =
    !latest && conversation.kind === 'business'
      ? ((
          await ctx.db
            .selectFrom('messages')
            .select('body')
            .where('conversation_id', '=', m.conversation_id)
            .where('sender_id', '=', to.id)
            .where('kind', '=', 'text')
            .where('deleted_at', 'is', null)
            .orderBy('seq', 'desc')
            .executeTakeFirst()
        )?.body ?? null)
      : null;
  const subject =
    (conversation.title &&
      (latest ? `Re: ${bareSubject(conversation.title)}` : conversation.title)) ||
    replySubject(latest?.subject) ||
    replySubject(opener ? subjectFromText(opener) : null) ||
    subjectFromText(body) ||
    `A message from ${from.name}`;
  const attachments = [...(await attachmentsOf(ctx, m.id)), ...(said?.attachments ?? [])];
  const rfcMessageId = `<${rfcId}@${domain}>`;
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
    track_opens: trackOpens,
  };
  try {
    const { providerId } = await provider.send({
      from,
      to: to.email,
      subject,
      text: (body || attachments.map((a) => a.name).join('\n')) + opening,
      messageId: rfcMessageId,
      inReplyTo: row.in_reply_to,
      references,
      attachments,
      trackOpens,
      autoReplied,
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

/** Who a calendar invitation is to: their name, unless all Caime has of it is their address. */
function attendeeName(name: string): string {
  return name.includes('@') ? '' : name;
}

/**
 * A meeting or an appointment mailed to someone reached by email, cancelled here (M16 F3): the
 * cancellation goes to them in the same thread, with the update that takes it off their
 * calendar. Never when they cancelled it themselves (their calendar did), and only for a card
 * that went by mail and wasn't bounced; once a card.
 */
export async function queueCancellation(
  ctx: AppContext,
  m: Pick<Message, 'id' | 'payload'>,
  to: string,
  actorId: string,
): Promise<void> {
  const kit = (m.payload as { kit?: unknown } | null)?.kit;
  if (!ctx.mailProvider || to !== 'cancelled' || (kit !== 'meeting' && kit !== 'appointment'))
    return;
  const reached = await mailedTo(ctx, m.id);
  if (!reached || reached === actorId) return;
  await enqueue(
    ctx,
    MAIL_CARD_JOB,
    { messageId: m.id },
    { dedupeKey: `${MAIL_CARD_JOB}:${m.id}:cancelled`, maxAttempts: 6 },
  );
}

/**
 * The same card given another time here (M16 F5): the update goes to them in the thread, its
 * invitation one sequence on, so their calendar moves the event rather than adding one. Once a
 * time; a time given since says its own, and a card cancelled since sends its cancellation.
 */
export async function queueCardUpdate(
  ctx: AppContext,
  m: Pick<Message, 'id' | 'payload'>,
  actorId: string,
): Promise<void> {
  const p = m.payload as { kit?: unknown; sequence?: number; revision?: number } | null;
  if (!ctx.mailProvider || (p?.kit !== 'meeting' && p?.kit !== 'appointment')) return;
  const reached = await mailedTo(ctx, m.id);
  if (!reached || reached === actorId) return;
  // A change that asks no new answer (R123: a new name) goes at the same sequence, a later stamp
  // (RFC 5546 §2.1.5): its revision keeps it from passing for the update before.
  await enqueue(
    ctx,
    MAIL_CARD_JOB,
    { messageId: m.id, what: 'update', sequence: p.sequence ?? 0 },
    {
      dedupeKey: `${MAIL_CARD_JOB}:${m.id}:update:${p.sequence ?? 0}:${p.revision ?? 0}`,
      maxAttempts: 6,
    },
  );
}

/** Whom a card went to by mail (someone reached by email), unless it bounced. */
async function mailedTo(ctx: AppContext, messageId: string): Promise<string | null> {
  const went = await ctx.db
    .selectFrom('mail_messages as mm')
    .innerJoin('users as u', (j) =>
      j.onRef('u.email', '=', 'mm.to_address').on('u.kind', '=', 'provisional'),
    )
    .select('u.id')
    .where('mm.message_id', '=', messageId)
    .where('mm.direction', '=', 'out')
    .where('mm.delivery', 'is distinct from', 'bounced')
    .executeTakeFirst();
  return went?.id ?? null;
}

async function sendCardMail(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const provider = ctx.mailProvider;
  const domain = ctx.config.MAIL_DOMAIN;
  const messageId = String(payload.messageId ?? '');
  if (!provider || !domain || !messageId) return;
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (!m?.sender_id) return;
  const went = await ctx.db
    .selectFrom('mail_messages')
    .select(['from_address', 'to_address', 'rfc_message_id', 'references_ids', 'subject'])
    .where('message_id', '=', m.id)
    .where('direction', '=', 'out')
    .executeTakeFirst();
  if (!went) return;
  // Someone who has claimed the address since reads it in Caime.
  const to = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name'])
    .where('email', '=', went.to_address)
    .where('kind', '=', 'provisional')
    .executeTakeFirst();
  if (!to) return;
  const conversation = await ctx.db
    .selectFrom('conversations as c')
    .leftJoin('organizations as o', 'o.id', 'c.org_id')
    .select(['c.kind', 'o.name as orgName'])
    .where('c.id', '=', m.conversation_id)
    .executeTakeFirstOrThrow();
  const sender = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', m.sender_id)
    .executeTakeFirstOrThrow();
  const name = (conversation.kind === 'business' && conversation.orgName) || sender.display_name;
  // A new time (M16 F5), unless it moved again since (that time sends its own) or was called off.
  const update = payload.what === 'update';
  const people = {
    senderId: m.sender_id,
    from: { name, email: went.from_address },
    to: { name: attendeeName(to.display_name), email: went.to_address },
    join: update ? await joinLinkFor(ctx, m, conversation.kind, to.id) : null,
  };
  const now = (m.payload ?? {}) as { state?: string; sequence?: number };
  if (update && (now.sequence !== payload.sequence || now.state === 'cancelled')) return;
  const said = update ? await updateOf(ctx, m, people) : await cancellationOf(ctx, m, people);
  if (!said) return;
  try {
    await provider.send({
      from: { address: went.from_address, name },
      to: went.to_address,
      subject: replySubject(went.subject) ?? subjectFromText(said.text) ?? name,
      text: said.text,
      messageId: `<${uuidv4()}@${domain}>`,
      inReplyTo: went.rfc_message_id,
      references: [...went.references_ids, went.rfc_message_id].slice(-REFERENCES_MAX),
      attachments: said.attachments,
      trackOpens: false,
    });
    ctx.metrics.mail.inc({ direction: 'out', outcome: 'sent' });
  } catch (err) {
    if (!(err instanceof MailRefused)) throw err;
    ctx.metrics.mail.inc({ direction: 'out', outcome: 'refused' });
  }
}

/**
 * An answer given here to an invitation someone's calendar mailed this person (M16 F4): it goes
 * to its organizer as the person's own calendar app would send it (`METHOD:REPLY`, from the
 * address invited, in the invitation's thread), so it lands in the organizer's calendar. Only
 * for the person's own answers (never its organizer's moves), once a move: a move made since
 * says its own.
 */
export async function queueInvitationAnswer(
  ctx: AppContext,
  m: Pick<Message, 'id' | 'payload' | 'sender_id'>,
  to: string,
  actorId: string,
): Promise<void> {
  const p = m.payload as { invitation?: unknown; history?: unknown[] } | null;
  if (!ctx.mailProvider || !p?.invitation || actorId === m.sender_id) return;
  if (to !== 'accepted' && to !== 'declined' && to !== 'cancelled') return;
  await enqueue(
    ctx,
    MAIL_CARD_JOB,
    { messageId: m.id, what: 'answer', to },
    {
      dedupeKey: `${MAIL_CARD_JOB}:${m.id}:answer:${p.history?.length ?? 0}`,
      maxAttempts: 6,
    },
  );
}

async function sendAnswer(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const provider = ctx.mailProvider;
  const domain = ctx.config.MAIL_DOMAIN;
  const messageId = String(payload.messageId ?? '');
  if (!provider || !domain || !messageId) return;
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  const card = (m?.payload ?? {}) as {
    state?: string;
    title?: string;
    fields?: { start?: { at?: string }; durationMinutes?: unknown };
    invitation?: CardInvitation;
  };
  // Moved again since: that move says its own.
  if (!m || m.deleted_at || !card.invitation || card.state !== payload.to) return;
  const at = card.fields?.start?.at ? new Date(card.fields.start.at) : null;
  if (!at || Number.isNaN(at.getTime())) return;
  // Whoever it invited: the other person in the conversation, as they are now.
  const person = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select(['u.id', 'u.handle', 'u.display_name', 'u.time_zone', 'u.locale'])
    .where('p.conversation_id', '=', m.conversation_id)
    .where('p.user_id', '<>', m.sender_id ?? '')
    .where('u.kind', '=', 'human')
    .executeTakeFirst();
  const from = person ? mailAddressOf(person.handle, ctx.config) : null;
  if (!person || !from) return;
  const went = await ctx.db
    .selectFrom('mail_messages')
    .select(['rfc_message_id', 'references_ids', 'subject'])
    .where('message_id', '=', m.id)
    .where('direction', '=', 'in')
    .executeTakeFirst();
  const { invitation } = card;
  const accepted = card.state === 'accepted';
  const title = card.title || 'Meeting';
  const zone = person.time_zone || 'UTC';
  const ics = buildReply({
    uid: invitation.uid,
    sequence: invitation.sequence,
    now: ctx.now(),
    start: at,
    end: new Date(cardEndMs(at.getTime(), card.fields ?? {})),
    summary: title,
    organizer: invitation.organizer,
    attendee: { name: person.display_name, email: invitation.attendee },
    answer: accepted ? 'ACCEPTED' : 'DECLINED',
  });
  // In the words of whoever answered, as their calendar would say it.
  const said = await asReader(ctx, person.id, async () => {
    const subject = accepted
      ? tr('Accepted: {title}', { title })
      : tr('Declined: {title}', { title });
    return { subject, when: wholeWhen(card.fields?.start, zone, safeLocale(person.locale)) };
  });
  try {
    await provider.send({
      from: { address: from, name: person.display_name },
      to: invitation.organizer.email,
      subject: said.subject,
      text: [said.subject, said.when].filter(Boolean).join('\n'),
      messageId: `<${uuidv4()}@${domain}>`,
      inReplyTo: went?.rfc_message_id ?? null,
      references: went ? [...went.references_ids, went.rfc_message_id].slice(-REFERENCES_MAX) : [],
      attachments: [
        {
          name: 'invite.ics',
          mime: 'text/calendar; method=REPLY; charset=UTF-8',
          bytes: Buffer.from(ics, 'utf8'),
        },
      ],
      trackOpens: false,
    });
    ctx.metrics.mail.inc({ direction: 'out', outcome: 'sent' });
  } catch (err) {
    if (!(err instanceof MailRefused)) throw err;
    ctx.metrics.mail.inc({ direction: 'out', outcome: 'refused' });
  }
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

/** The mail's link back to Caime (R75): opening it says the mail was seen. */
async function seenLink(ctx: AppContext, rfcId: string): Promise<string> {
  const base = ctx.config.PUBLIC_URL;
  return `${base}/v1/mail/seen/${rfcId}.${await seenMac(ctx, rfcId)}`;
}

async function seenMac(ctx: AppContext, rfcId: string): Promise<string> {
  return createHmac('sha256', await serverKey(ctx, 'mail.seen'))
    .update(rfcId)
    .digest('base64url')
    .slice(0, 22);
}

/**
 * A mail's "Open in Caime" link was followed: that mail is seen, and its sender told. False for
 * a link Caime didn't write.
 */
export async function seenByLink(ctx: AppContext, token: string): Promise<boolean> {
  const [rfcId, mac] = token.split('.');
  if (!rfcId || !mac || !/^[0-9a-f-]{36}$/.test(rfcId)) return false;
  const want = await seenMac(ctx, rfcId);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want)))
    return false;
  const seen = await ctx.db
    .updateTable('mail_messages')
    .set({ seen_at: ctx.now() })
    .where('rfc_message_id', '=', `<${rfcId}@${ctx.config.MAIL_DOMAIN}>`)
    .where('direction', '=', 'out')
    .where('seen_at', 'is', null)
    .returning('message_id')
    .execute();
  await tellSenders(
    ctx,
    seen.map((r) => r.message_id),
  );
  return true;
}

/** Each message's sender sees how far it got (seen, opened), on the message. */
export async function tellSenders(ctx: AppContext, messageIds: string[]): Promise<void> {
  if (!messageIds.length) return;
  const rows = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', 'in', messageIds)
    .execute();
  for (const m of rows) await tellSender(ctx, m);
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
    if (e.state === 'opened') {
      // The provider's pixel (R75): the first open, on a mail that carried one.
      const opened = await ctx.db
        .updateTable('mail_messages')
        .set({ opened_at: e.at ? new Date(e.at) : ctx.now() })
        .where('provider', '=', provider.name)
        .where('provider_id', '=', e.providerId)
        .where('direction', '=', 'out')
        .where('track_opens', '=', true)
        .where('opened_at', 'is', null)
        .returning('message_id')
        .executeTakeFirst();
      if (!opened) continue;
      applied++;
      ctx.metrics.mail.inc({ direction: 'out', outcome: 'opened' });
      await tellSenders(ctx, [opened.message_id]);
      continue;
    }
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
  // In no conversation for a day at least: a visitor between a page's code and its confirmation
  // (R97 (1)) is in none yet, and the sweep must not take them from under the code.
  const settled = new Date(ctx.now().getTime() - 24 * 3_600_000);
  await ctx.db
    .deleteFrom('users')
    .where('kind', '=', 'provisional')
    .where((eb) =>
      eb.or([
        eb.and([
          eb('created_at', '<', settled),
          eb.not(
            eb.exists(
              eb
                .selectFrom('participants as p')
                .select('p.user_id')
                .whereRef('p.user_id', '=', 'users.id')
                .where('p.left_at', 'is', null),
            ),
          ),
        ]),
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
