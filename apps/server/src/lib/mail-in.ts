/**
 * Mail in (PRODUCT-REVIEW R75, phase 1): a mail to a handle's address becomes a message in the
 * conversation between its sender and that person, or in the sender's customer thread with that
 * organization, and from then on it's a message like any other (read for what it promises and
 * asks, searched, kept and erased with the rest). The rules:
 *
 * - Who the sender is comes from the authenticated From alone (DMARC: SPF or DKIM aligned with
 *   the From domain, as Caime checks the raw message itself: `mail-auth.ts`), never a header the
 *   payload carries, a Reply-To, a Sender or a display name. Mail that fails is dropped and
 *   counted; the provider's spam verdict drops the rest.
 *   (Phase 2's notices will show unverified mail as such; nothing attributes it to a person.)
 * - A sender with an account is that person. Anyone else is a provisional person: a users row
 *   of kind 'provisional' holding the address and the name the mail gave, which the person they
 *   wrote to sees and nobody can find (every lookup of people takes kind 'human'), and which
 *   becomes an account only by signing up with that address.
 * - A stranger's first mail is a message request, as a stranger's message is; mail keeps
 *   coming while it waits (held in the one conversation, nothing more notified), and declining
 *   mutes the address rather than refusing mail.
 * - A thread is a topic: once the request is past, a mail whose References name one already
 *   here lands in that conversation, else its subject names the topic (made on the first).
 * - Attachments go through the files pipeline as the sender's own files; words past a message's
 *   length ride along whole as a text file.
 * - Under 18, an address takes mail only from people the person is connected with (R29);
 *   anything else is dropped without a bounce, since a bounce says the address exists.
 */
import { createHash } from 'node:crypto';
import { isReservedHandle, SendMessageBody, SYSTEM_ACCOUNTS } from '@caime/core';
import { bareSubject } from '@caime/core/mail';
import { CAI_MAIL } from '@caime/core/meetings';
import { CAI_ID } from '@caime/core/system-ids';
import type { AppContext } from '../context';
import { ORG_COLUMNS, USER_COLUMNS, type UserRow } from '../db/schema';
import { startCustomerConversation } from './business-threads';
import { caiMail } from './cai-mail';
import { ensureDirectConversation } from './conversations';
import { storeBytes } from './files';
import { alignedDomains, domainOf, handleOf, mailOn, senderName } from './mail-address';
import { authenticateMail } from './mail-auth';
import type { InboundMail, MailAuth } from './mail-provider';
import { afterMessage } from './message-effects';
import { messageViews, participantsOf, sendMessage } from './messages';
import { assertStorage } from './plans';
import { personForAddress } from './provisional';
import { between, pairKey } from './relations';
import { storageFor } from './storage';
import { openSystemConversation } from './system-accounts';
import { createTopicConversation } from './topics';
import { minorOf } from './users';

export type InboundOutcome =
  | 'delivered'
  | 'duplicate'
  | 'unverified'
  | 'spam'
  | 'unknown'
  | 'refused'
  | 'empty';

/** A message's words at most (core's SendMessageBody): the rest of a long mail rides as a file. */
const MESSAGE_MAX = 10_000;
/** Attachments a message carries at most (core's SendMessageBody). */
const FILES_MAX = 10;

/**
 * Whether the receiving server vouched for the From domain: DMARC passed, or DKIM or SPF passed
 * for a domain aligned with it (relaxed alignment, as DMARC reads it).
 */
export function senderVerified(fromAddress: string, auth: MailAuth): boolean {
  const from = domainOf(fromAddress);
  if (!from) return false;
  if (auth.dmarc?.result === 'pass') return true;
  if (auth.dkim.some((d) => d.result === 'pass' && alignedDomains(d.domain, from))) return true;
  return auth.spf?.result === 'pass' && alignedDomains(auth.spf.domain, from);
}

/** Each address at our domain the mail reached, and what became of it there. */
export async function receiveMail(
  ctx: AppContext,
  mail: InboundMail,
): Promise<Array<{ to: string; outcome: InboundOutcome }>> {
  const domain = ctx.config.MAIL_DOMAIN;
  if (!domain || !mailOn(ctx.config) || !ctx.mailProvider) return [];
  const ours = [...new Set(mail.to.filter((a) => handleOf(a, domain)))];
  const count = (outcome: InboundOutcome) => ctx.metrics.mail.inc({ direction: 'in', outcome });
  // What became of it, for the operator's log: outcomes and checks, never an address or a word.
  let checks: Record<string, unknown> = { raw: Boolean(mail.raw) };
  const said = (outcomes: InboundOutcome[]) => {
    ctx.log.info({ outcomes, ...checks }, 'mail in');
  };
  if (!ours.length) {
    count('unknown');
    said(['unknown']);
    return [];
  }
  const all = (outcome: InboundOutcome) => {
    count(outcome);
    said([outcome]);
    return ours.map((to) => ({ to, outcome }));
  };
  if (mail.spam) return all('spam');
  // Who sent it, as Caime checked the raw message itself (mail-auth.ts), never the payload's say.
  const auth = await authenticateMail(ctx, mail.raw, ctx.mailProvider.receivingHosts);
  checks = {
    ...checks,
    dkim: auth.dkim.map((d) => d.result),
    spf: auth.spf?.result ?? null,
    dmarc: auth.dmarc?.result ?? null,
  };
  if (!senderVerified(mail.from.address, auth)) return all('unverified');
  if (!mail.text.trim() && !mail.attachments.length) return all('empty');
  const out: Array<{ to: string; outcome: InboundOutcome }> = [];
  // Two addresses that land in one place (support@ and hello@, or a staff address and the staff
  // handle's own) take the mail once.
  const reached = new Set<string>();
  for (const to of ours) {
    const lands = landingOf(ctx, handleOf(to, domain));
    const outcome =
      lands && reached.has(lands) ? 'duplicate' : await deliverTo(ctx, mail, to, domain);
    if (lands) reached.add(lands);
    count(outcome);
    out.push({ to, outcome });
  }
  said(out.map((o) => o.outcome));
  return out;
}

type Target =
  | { kind: 'person'; user: UserRow }
  | { kind: 'org'; org: { id: string; name: string; verified_at: Date | null } };

/**
 * The addresses mail providers and people expect a mail domain to answer (RFC 2142's, and the
 * contact the pages name), delivered to `MAIL_STAFF_HANDLE`. Each is a reserved handle, so no
 * person or organization can hold one.
 */
export const STAFF_ADDRESSES: ReadonlySet<string> = new Set([
  'postmaster',
  'abuse',
  'hello',
  'support',
  'help',
  'contact',
  'info',
  'privacy',
  'security',
  'legal',
  'billing',
]);

/** Whose an address's handle is: its own, or for a staff address the staff handle (or nobody). */
function landingOf(ctx: AppContext, handle: string | null): string | null {
  if (!handle) return null;
  return STAFF_ADDRESSES.has(handle) ? (ctx.config.MAIL_STAFF_HANDLE ?? null) : handle;
}

async function recipientOf(
  ctx: AppContext,
  handle: string,
  /** The operator's own choice (the staff handle), which may be one of Caime's reserved names. */
  operators = false,
): Promise<Target | null> {
  // Caime's own names (cai, the friends, staff words) take no mail.
  if (!operators && isReservedHandle(handle)) return null;
  const user = await ctx.db
    .selectFrom('users')
    .select(USER_COLUMNS)
    .where('handle', '=', handle)
    .where('kind', '=', 'human')
    .where('deleted_at', 'is', null)
    .where('suspended_at', 'is', null)
    .executeTakeFirst();
  if (user) return { kind: 'person', user };
  const org = await ctx.db
    .selectFrom('organizations')
    .select(ORG_COLUMNS)
    .where('handle', '=', handle)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  return org ? { kind: 'org', org } : null;
}

/** The person a mail is from: their account, or a provisional person made or found by the address. */
async function senderOf(ctx: AppContext, mail: InboundMail): Promise<UserRow | null> {
  const row = await personForAddress(
    ctx,
    mail.from.address,
    senderName(mail.from.name, mail.from.address),
  );
  if (!row || row.deleted_at || row.suspended_at) return null;
  return row.kind === 'provisional' || row.kind === 'human' ? row : null;
}

async function deliverTo(
  ctx: AppContext,
  mail: InboundMail,
  toAddress: string,
  domain: string,
): Promise<InboundOutcome> {
  // The provider delivering the same mail again (its retry) is the one message.
  const seen = await ctx.db
    .selectFrom('mail_messages')
    .select('message_id')
    .where('rfc_message_id', '=', mail.rfcMessageId)
    .where('to_address', '=', toAddress)
    .executeTakeFirst();
  if (seen) return 'duplicate';
  const handle = handleOf(toAddress, domain);
  if (!handle) return 'unknown';
  // Cai's own address (R86): a guest's answer to a meeting's invitation, and nothing else.
  if (handle === CAI_MAIL) return caiMail(ctx, mail);
  // The staff addresses reach whoever the operator named; without one, nobody.
  const lands = landingOf(ctx, handle);
  if (!lands) return 'unknown';
  const target = await recipientOf(ctx, lands, lands !== handle);
  if (!target) return 'unknown';
  const sender = await senderOf(ctx, mail);
  if (!sender) return 'refused';
  if (target.kind === 'person' && sender.id === target.user.id) {
    // Mail from one of one's own addresses to one's own Caime address (R91): forwarded in to keep
    // or to act on, it lands in one's conversation with Cai, as one's own message, unanswered.
    const cai = SYSTEM_ACCOUNTS.find((a) => a.id === CAI_ID);
    if (!cai) return 'refused';
    const own = await openSystemConversation(ctx, sender.id, cai);
    await deliver(ctx, sender, own.id, mail, toAddress);
    return 'delivered';
  }
  let conversationId: string;
  if (target.kind === 'person') {
    const person = target.user;
    const rel = await between(ctx.db, person.id, sender.id);
    if (rel.blockedByMe || rel.blockedMe) return 'refused';
    if (minorOf(person, ctx.now()) && !rel.connected) return 'refused';
    const notice =
      mail.notice && !rel.connected ? await noticeFor(ctx, sender.id, person.id) : null;
    if (notice) conversationId = notice;
    else {
      const general = await ensureDirectConversation(ctx.db, sender.id, person.id, {
        createdBy: sender.id,
        connectionId: rel.connectionId,
        requestFrom: rel.connected ? null : sender.id,
      });
      conversationId = await threadFor(ctx, general.id, sender.id, person.id, mail);
    }
  } else {
    conversationId = (await startCustomerConversation(ctx, sender, target.org, null))
      .conversationId;
  }
  await deliver(ctx, sender, conversationId, mail, toAddress);
  return 'delivered';
}

/**
 * Where a notice lands (R75): one conversation per sender, never a request, muted for the
 * person, without topics, and never answered (`sendMessage` refuses). Only a conversation that
 * starts as a notice is one: a sender someone already writes with stays that conversation, so a
 * person's own list mail never silences them. Null when it isn't a notice's to take.
 */
async function noticeFor(
  ctx: AppContext,
  senderId: string,
  personId: string,
): Promise<string | null> {
  const { key } = pairKey(senderId, personId);
  const existing = await ctx.db
    .selectFrom('conversations')
    .select(['id', 'notice'])
    .where('direct_key', '=', key)
    .where('is_general', '=', true)
    .executeTakeFirst();
  if (existing) return existing.notice ? existing.id : null;
  const made = await ensureDirectConversation(ctx.db, senderId, personId, {
    createdBy: senderId,
    connectionId: null,
    requestFrom: null,
  });
  await ctx.db
    .updateTable('conversations')
    .set({ notice: true })
    .where('id', '=', made.id)
    .execute();
  await ctx.db
    .updateTable('participants')
    .set({ muted_until: new Date('9999-12-31T00:00:00Z') })
    .where('conversation_id', '=', made.id)
    .where('user_id', '=', personId)
    .execute();
  return made.id;
}

/**
 * Where a mail lands between two people: while the person's request from this sender waits,
 * the one conversation (nothing branches off a request); then the conversation a referenced
 * mail is in, else the topic its subject names, made on the first mail with that subject.
 */
async function threadFor(
  ctx: AppContext,
  generalId: string,
  senderId: string,
  personId: string,
  mail: InboundMail,
): Promise<string> {
  const theirs = await ctx.db
    .selectFrom('participants')
    .select('request_state')
    .where('conversation_id', '=', generalId)
    .where('user_id', '=', personId)
    .executeTakeFirst();
  if (theirs?.request_state === 'pending' || theirs?.request_state === 'declined') return generalId;
  const { key } = pairKey(senderId, personId);
  const ids = [...mail.references, ...(mail.inReplyTo ? [mail.inReplyTo] : [])];
  if (ids.length) {
    const hit = await ctx.db
      .selectFrom('mail_messages as mm')
      .innerJoin('messages as m', 'm.id', 'mm.message_id')
      .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
      .select('c.id')
      .where('mm.rfc_message_id', 'in', ids)
      .where('c.direct_key', '=', key)
      .orderBy('m.seq', 'desc')
      .executeTakeFirst();
    if (hit) return hit.id;
  }
  const subject = bareSubject(mail.subject);
  if (!subject) return generalId;
  const topic = await ctx.db
    .selectFrom('conversations')
    .select('id')
    .where('direct_key', '=', key)
    .where('is_general', '=', false)
    .where('parent_id', '=', generalId)
    .where('title', '=', subject)
    .executeTakeFirst();
  if (topic) return topic.id;
  return createTopicConversation(ctx, senderId, generalId, subject);
}

/** The mail as a message: its attachments as the sender's files, its words, told live, then its effects. */
async function deliver(
  ctx: AppContext,
  sender: UserRow,
  conversationId: string,
  mail: InboundMail,
  toAddress: string,
): Promise<void> {
  const provider = ctx.mailProvider;
  if (!provider) return;
  const storage = storageFor(ctx.config);
  const fileIds: string[] = [];
  let images = 0;
  const keep = async (file: { bytes: Buffer; mime: string; name: string }) => {
    try {
      await assertStorage(ctx, sender.id, file.bytes.length);
      const row = await storeBytes(ctx, storage, { ownerId: sender.id, ...file });
      if (row.kind === 'image') images++;
      fileIds.push(row.id);
    } catch (err) {
      ctx.log.warn({ err, name: file.name }, 'mail attachment not kept');
    }
  };
  let text = mail.text.trim();
  if (text.length > MESSAGE_MAX) {
    // The whole mail as a file, the start of it as the message.
    await keep({
      bytes: Buffer.from(text, 'utf8'),
      mime: 'text/plain',
      name: `${bareSubject(mail.subject) ?? 'message'}.txt`,
    });
    text = `${text.slice(0, MESSAGE_MAX - 1).trimEnd()}…`;
  }
  for (const a of mail.attachments.slice(0, FILES_MAX - fileIds.length)) await keep(a);
  if (!text && !fileIds.length) return;
  const kind = fileIds.length ? (images === fileIds.length ? 'media' : 'file') : 'text';
  const result = await sendMessage(
    ctx,
    sender.id,
    conversationId,
    SendMessageBody.parse({
      // The mail's own id at this address: the provider's retry, even while the first attempt
      // still runs, is the one message (ADR-8).
      clientId: `mail:${createHash('sha256').update(`${mail.rfcMessageId}\n${toAddress}`).digest('base64url')}`,
      kind,
      ...(text ? { body: text } : {}),
      ...(fileIds.length ? { fileIds } : {}),
    }),
    { channel: 'mail' },
  );
  if (!result.created) return;
  await ctx.db
    .insertInto('mail_messages')
    .values({
      message_id: result.message.id,
      direction: 'in',
      rfc_message_id: mail.rfcMessageId,
      in_reply_to: mail.inReplyTo,
      references_ids: mail.references.slice(-50),
      from_address: mail.from.address,
      to_address: toAddress,
      subject: mail.subject?.slice(0, 500) ?? null,
      provider: provider.name,
      provider_id: null,
    })
    .onConflict((oc) => oc.columns(['rfc_message_id', 'to_address']).doNothing())
    .execute();
  // Everyone else in it hears it now, as a sent message is heard; its effects run after.
  const [view] = await messageViews(ctx.db, [result.message], sender.id);
  const others = (await participantsOf(ctx.db, conversationId))
    .map((p) => p.user_id)
    .filter((u) => u !== sender.id);
  if (view && others.length)
    await ctx.bus.publish(others, { type: 'message.created', data: { ...view, clientId: null } });
  const { message, analysis } = result;
  ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
}
