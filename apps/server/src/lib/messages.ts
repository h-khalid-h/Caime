import type { AlbumView } from '@caime/core';
/**
 * Sending and reading messages (PRD §21, §80; ADR-8, ADR-9). A message never appears sent and
 * then disappears: it is ordered by `seq` inside the insert transaction, and a retried send with
 * the same `clientId` returns the original.
 */
import {
  type Analysis,
  analyzeMessage,
  assessLink,
  BookingAskBody,
  type BookingAskInput,
  ContactPayload,
  canPostTo,
  type FileView,
  FormAskBody,
  formatSoon,
  type IntakeForm,
  initialKitState,
  isCardKit,
  KIT_MODES,
  kitHeadline,
  kitsFor,
  LocationPayload,
  type MessageMailView,
  type MessageView,
  type Mode,
  methodsFor,
  OrderAskBody,
  orderSummary,
  type PaymentSettings,
  type PaysShare,
  type PayTo,
  type PlacedOrder,
  PollPayload,
  payDirection,
  prepareKitFields,
  type SealedMessage,
  type SendMessageBodyT,
  ShareAskBody,
  StickerPayload,
  safeLocale,
  messagePreview as sharedPreview,
  shareOut,
  systemAccountOf,
  uuidv7,
  VoicePayload,
  viewable,
} from '@caime/core';
import { currencyOfCountry } from '@caime/core/countries';
import { tr } from '@caime/core/i18n';
import { AGREED_STATES, cardAsks } from '@caime/core/kit-states';
import {
  MAIL_FOLLOW_UP_AFTER_MS,
  MAIL_FOLLOW_UPS,
  notByMail,
  notByMailText,
} from '@caime/core/mail';
import { heldOnCaime } from '@caime/core/meetings';
import { isRepeat, repeatsIn } from '@caime/core/repeat';
import { dayIn, type MeetingSeries } from '@caime/core/series';
import type { Kysely, SqlBool, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { AssetKind, Database, MailMessage, Message } from '../db/schema';
import { MESSAGE_COLUMNS, USER_COLUMNS } from '../db/schema';
import { assertCanWrite } from './blocks';
import {
  type Booker,
  type BookingHost,
  bookingFor,
  orderFor,
  orgHost,
  paymentsOf,
  personHost,
  whereBooked,
} from './booking';
import { customerMask, maskFor, maskMessage, recordBusinessMessage } from './business';
import { queueCalendarPush } from './calendar-push';
import { checkoutAccountOf } from './checkout-account';
import { assertSealedForEveryone } from './e2ee';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { recordEvent } from './events';
import { cardStartAt, customCardFor } from './kits';
import { previewIdsOf, previewView, readyPreviews } from './link-preview-views';
import { assertNotesAllowed } from './notes-allowed';
import { formForCard } from './org-forms';
import { isBlockedEitherWay, shareAConnection, viewerRelation } from './relations';
import { type ShareToPay, shareToPay } from './splits';
import { hostWithStock, takeStock, tellStockChanged } from './stock';
import { minorOf, privacyOf } from './users';
import { parse } from './validate';

type Q = Kysely<Database> | Transaction<Database>;

export type { FileView, MessageView };

/** Where a file is downloaded from, by whoever may read it. */
export const fileUrl = (id: string) => `/v1/files/${id}`;

/** A mail message as the app shows it (R75): the other side's address, the subject, how far one sent got. */
export type MailViewRow = Pick<
  MailMessage,
  | 'message_id'
  | 'direction'
  | 'subject'
  | 'from_address'
  | 'to_address'
  | 'delivery'
  | 'delivery_at'
  | 'signature'
  | 'seen_at'
  | 'opened_at'
  | 'unverified'
> & { has_html: boolean };

export function mailViewOf(row: MailViewRow | undefined): MessageMailView | null {
  if (!row) return null;
  return {
    direction: row.direction,
    subject: row.subject,
    address: row.direction === 'in' ? row.from_address : row.to_address,
    delivery: row.delivery,
    deliveryAt: row.delivery_at?.toISOString() ?? null,
    hasHtml: row.has_html,
    signature: row.signature,
    seenAt: row.seen_at?.toISOString() ?? null,
    openedAt: row.opened_at?.toISOString() ?? null,
    unverified: row.unverified,
  };
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
    url: fileUrl(f.id),
    thumbUrl: f.thumb_key ? `${fileUrl(f.id)}/thumb` : null,
    previewUrl: f.thumb_key ? `${fileUrl(f.id)}/preview` : null,
    viewUrl: viewable(f.mime, f.name, Number(f.size)) ? `${fileUrl(f.id)}/view` : null,
  };
}

/**
 * Not from a message the viewer deleted for themselves: what came in it stays out of their sight
 * wherever it's gathered. `column` holds the message's id, or null for something in no message.
 */
export function notHiddenFor(userId: string, column: string) {
  return sql<SqlBool>`not exists (select 1 from hidden_messages h where h.message_id = ${sql.ref(column)} and h.user_id = ${userId})`;
}

/**
 * A message a person may read (M16 D3): there for everyone (not deleted), not one they deleted
 * for themselves, and not past its time (a disappearing message the hourly sweep hasn't reached
 * yet). The one condition every reader that gathers a person's words puts in its `where` (search,
 * Cai and the friends, a brief, the memory, a profile, the calendar); `alias` is the messages
 * table as the query names it.
 */
export function readableBy(userId: string, now: Date, alias = 'messages') {
  const col = (c: string) => sql.ref(`${alias}.${c}`);
  return sql<SqlBool>`(${col('deleted_at')} is null and (${col('expires_at')} is null or ${col('expires_at')} > ${now}) and ${notHiddenFor(userId, `${alias}.id`)})`;
}

export function messagePreview(
  m: Pick<Message, 'kind' | 'body' | 'payload' | 'deleted_at'>,
): string {
  return sharedPreview({
    kind: m.kind,
    body: m.body,
    payload: m.payload,
    deleted: m.deleted_at !== null,
  });
}

const ALBUM_PREVIEW = 6;

function albumOf(
  rows: Array<Parameters<typeof fileView>[0] & { message_id: string }>,
  messageId: string,
): AlbumView {
  const mine = rows.filter((r) => r.message_id === messageId);
  return { count: mine.length, photos: mine.slice(0, ALBUM_PREVIEW).map(fileView) };
}

/** The group's message a private reply answers (M16 E3b), as the server wrote it on send. */
function privateReplyOf(
  m: Pick<Message, 'kind' | 'payload'>,
): { conversationId: string; messageId: string } | null {
  if (m.kind !== 'text') return null;
  const ref = (m.payload as { privateReply?: { conversationId?: unknown; messageId?: unknown } })
    ?.privateReply;
  return ref && typeof ref.conversationId === 'string' && typeof ref.messageId === 'string'
    ? { conversationId: ref.conversationId, messageId: ref.messageId }
    : null;
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
  const senderIds = [...new Set(rows.map((m) => m.sender_id).filter((x): x is string => !!x))];
  const albumIds = rows
    .filter((m) => m.kind === 'kit' && (m.payload as { kit?: unknown })?.kit === 'shared_album')
    .map((m) => m.id);
  // The groups' messages answered privately here (M16 E3b), as the viewer may read them now.
  const privateIds = [
    ...new Set(
      rows.flatMap((m) => {
        const ref = privateReplyOf(m);
        return ref && m.deleted_at === null ? [ref.messageId] : [];
      }),
    ),
  ];
  // The first link's page (M16 E4c), by its address, where a message in the batch has one.
  const linkIds = previewIdsOf(rows);
  const [reactions, files, replies, votes, senders, albums, mails, answered, links] =
    await Promise.all([
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
        ? db.selectFrom('messages').select(MESSAGE_COLUMNS).where('id', 'in', replyIds).execute()
        : Promise.resolve([] as Message[]),
      db.selectFrom('poll_votes').selectAll().where('message_id', 'in', ids).execute(),
      senderIds.length
        ? db.selectFrom('users').select(['id', 'kind']).where('id', 'in', senderIds).execute()
        : Promise.resolve([] as Array<{ id: string; kind: string }>),
      // Each album's photos, newest first: the card shows how many and the latest few.
      albumIds.length
        ? db
            .selectFrom('album_photos as a')
            .innerJoin('files', 'files.id', 'a.file_id')
            .select([
              'a.message_id',
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
            .where('a.message_id', 'in', albumIds)
            .orderBy('a.created_at', 'desc')
            .orderBy('a.file_id', 'desc')
            .execute()
        : Promise.resolve([]),
      // What a mail message was on the wire (R75), only where one is in the batch.
      rows.some((m) => m.channel === 'mail')
        ? db
            .selectFrom('mail_messages')
            .select([
              'message_id',
              'direction',
              'subject',
              'from_address',
              'to_address',
              'delivery',
              'delivery_at',
              'signature',
              'seen_at',
              'opened_at',
              'unverified',
            ])
            // Whether there's HTML to show as sent, never the HTML itself with every view.
            .select(sql<boolean>`html is not null`.as('has_html'))
            .where('message_id', 'in', ids)
            .execute()
        : Promise.resolve([] as MailViewRow[]),
      // Only what they may read there now: in it, there for everyone, not hidden for them.
      privateIds.length
        ? db
            .selectFrom('messages as m')
            .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
            .innerJoin('participants as p', (j) =>
              j
                .onRef('p.conversation_id', '=', 'm.conversation_id')
                .on('p.user_id', '=', viewerId)
                .on('p.left_at', 'is', null),
            )
            .select([
              'm.id',
              'm.seq',
              'm.sender_id',
              'm.kind',
              'm.body',
              'm.payload',
              'm.deleted_at',
              'm.sealed',
              'm.expires_at',
              'c.title',
            ])
            .where('m.id', 'in', privateIds)
            .where(notHiddenFor(viewerId, 'm.id'))
            .execute()
        : Promise.resolve([]),
      readyPreviews(
        db,
        [...linkIds.values()].map((l) => l.id),
      ),
    ]);
  const previews = new Map(links.map((row) => [row.id, row]));
  const linkOf = (messageId: string) => {
    const link = linkIds.get(messageId);
    const row = link ? previews.get(link.id) : undefined;
    return link && row ? previewView(row, link.url) : null;
  };
  // Bots and agents say so wherever their messages go (R16).
  const automatedSenders = new Set(
    senders.filter((u) => u.kind !== 'human' && u.kind !== 'provisional').map((u) => u.id),
  );
  // Cai is an AI as an organization's agent is (R67); a Caime Friend says a script.
  // An organization's agent, Cai and the Caime Friends answer with a model (R71): said on each.
  const agentSenders = new Set(
    senders
      .filter((u) => u.kind === 'agent' || u.kind === 'assistant' || u.kind === 'character')
      .map((u) => u.id),
  );
  const views = rows.map((m): MessageView => {
    const deleted = m.deleted_at !== null;
    const byEmoji = new Map<string, string[]>();
    for (const r of reactions.filter((x) => x.message_id === m.id)) {
      byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.user_id]);
    }
    const reply = m.reply_to_id ? replies.find((r) => r.id === m.reply_to_id) : undefined;
    const privateRef = deleted ? null : privateReplyOf(m);
    const source = privateRef ? answered.find((r) => r.id === privateRef.messageId) : undefined;
    // Gone for everyone, or past its time: its group still says where, never what.
    const readable =
      source &&
      source.deleted_at === null &&
      source.sealed === null &&
      (source.expires_at === null || source.expires_at > new Date());
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
      automated: m.kind !== 'system' && m.sender_id !== null && automatedSenders.has(m.sender_id),
      aiAgent: m.kind !== 'system' && m.sender_id !== null && agentSenders.has(m.sender_id),
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
            // A private one's words are only on the devices it was sealed for.
            preview: reply.sealed ? '' : messagePreview(reply),
            kind: reply.kind,
          }
        : null,
      privateReply: privateRef
        ? {
            conversationId: privateRef.conversationId,
            messageId: privateRef.messageId,
            title: source?.title ?? null,
            seq: readable ? Number(source.seq) : null,
            senderId: readable ? source.sender_id : null,
            preview: readable ? messagePreview(source) : null,
          }
        : null,
      link: linkOf(m.id),
      forwarded: m.forwarded_from_id !== null,
      sentVia: m.sent_via,
      channel: m.channel,
      mail: mailViewOf(mails.find((x) => x.message_id === m.id)),
      sealed: deleted ? null : ((m.sealed as SealedMessage | null) ?? null),
      pinnedAt: deleted ? null : (m.pinned_at?.toISOString() ?? null),
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
      album: albumIds.includes(m.id) && !deleted ? albumOf(albums, m.id) : null,
      editedAt: m.edited_at?.toISOString() ?? null,
      deletedAt: m.deleted_at?.toISOString() ?? null,
      createdAt: m.created_at.toISOString(),
    };
  });
  // A business conversation's customer sees the organization where the team would be (R15).
  const masks = new Map<string, Awaited<ReturnType<typeof maskFor>>>();
  for (const id of new Set(rows.map((r) => r.conversation_id)))
    masks.set(id, await maskFor(db, id, viewerId));
  return views.map((v) => {
    const mask = masks.get(v.conversationId);
    return mask ? maskMessage(v, mask) : v;
  });
}

/** A short order number a person can read out: six letters and digits, no look-alikes. */
export function orderNumber(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Whose catalog a card is booked or ordered from (R58, R60), and the sender's standing with
 * them: the organization in a business conversation; in a direct one, the other person when
 * every item asked is theirs, else the sender's own.
 */
async function catalogHostFor(
  ctx: AppContext,
  conversation: { id: string; kind: string },
  members: Array<{ user_id: string }>,
  sender: {
    id: string;
    birth_date: string | null;
    time_zone: string;
    age_minor_until: Date | null;
    booking: unknown;
    booking_items: unknown;
    ordering: unknown;
    collections: unknown;
  },
  itemIds: string[],
): Promise<{ host: BookingHost; booker: Booker } | null> {
  const adult = !minorOf(sender, ctx.now());
  if (conversation.kind === 'business') {
    const mask = await customerMask(ctx.db, conversation.id);
    const org = mask
      ? await ctx.db
          .selectFrom('organizations')
          .select(['id', 'booking', 'booking_items', 'ordering', 'collections'])
          .where('id', '=', mask.orgId)
          .executeTakeFirst()
      : null;
    if (!org || !mask) return null;
    return {
      host: orgHost(org),
      booker: { isSelf: sender.id !== mask.customerId, isConnected: true, spheres: [], adult },
    };
  }
  if (conversation.kind !== 'direct') return null;
  const otherId = members.find((p) => p.user_id !== sender.id)?.user_id;
  const other = otherId
    ? await ctx.db
        .selectFrom('users')
        .select(['id', 'booking', 'booking_items', 'ordering', 'collections'])
        .where('id', '=', otherId)
        .executeTakeFirst()
    : null;
  const theirs = other ? personHost(other) : null;
  if (theirs && other && itemIds.every((id) => theirs.items.some((i) => i.id === id))) {
    const relation = await viewerRelation(ctx.db, other.id, sender.id);
    return {
      host: theirs,
      booker: { isConnected: relation.isConnected, spheres: relation.ownerSpheresForViewer, adult },
    };
  }
  return {
    host: personHost(sender),
    booker: { isSelf: true, isConnected: true, spheres: [], adult },
  };
}

/**
 * Whom a Pay card pays, and how (R62): the payee is the sender when they ask to be paid, else
 * the other side (in a business conversation the organization is the team's side); their ways
 * to be paid that the payer may see, as they are now. A group only asks: whoever pays there is
 * anyone, so it shows only the ways for everyone.
 */
async function payToFor(
  ctx: AppContext,
  conversation: { id: string; kind: string },
  members: Array<{ user_id: string }>,
  senderId: string,
  fields: Record<string, unknown>,
  share: PaysShare | null = null,
): Promise<PayTo | null> {
  const asks = payDirection(fields) === 'ask';
  const person = (id: string) =>
    ctx.db
      .selectFrom('users')
      .select(['id', 'display_name', 'payments'])
      .where('id', '=', id)
      .executeTakeFirst();
  const shown = (name: string, settings: PaymentSettings | null, methods: PayTo['methods']) =>
    methods.length || settings?.note ? { name, methods, note: settings?.note ?? null } : null;
  // An organization paid through its own checkout (R65) is payable by card, ways or none.
  const withCheckout = async (
    orgId: string,
    payTo: PayTo | null,
    name: string,
  ): Promise<PayTo | null> => {
    if (!(await checkoutAccountOf(ctx, orgId))) return payTo;
    return { ...(payTo ?? { name, methods: [], note: null }), orgId, checkout: true };
  };
  if (conversation.kind === 'business') {
    const mask = await customerMask(ctx.db, conversation.id);
    if (!mask) return null;
    const teamSends = senderId !== mask.customerId;
    if (asks === teamSends) {
      // The organization is paid: its ways for its customers.
      const org = await ctx.db
        .selectFrom('organizations')
        .select(['name', 'payments'])
        .where('id', '=', mask.orgId)
        .executeTakeFirst();
      if (!org) return null;
      const settings = paymentsOf(org);
      return withCheckout(
        mask.orgId,
        shown(org.name, settings, methodsFor(settings, { isConnected: true, spheres: [] })),
        org.name,
      );
    }
    // The customer's organization is paid (R64): its ways for those it knows.
    if (mask.customerOrgId) {
      const theirs = await ctx.db
        .selectFrom('organizations')
        .select(['name', 'payments'])
        .where('id', '=', mask.customerOrgId)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (!theirs) return null;
      const settings = paymentsOf(theirs);
      return withCheckout(
        mask.customerOrgId,
        shown(theirs.name, settings, methodsFor(settings, { isConnected: true, spheres: [] })),
        theirs.name,
      );
    }
    // The customer is paid (a refund): only their ways for everyone.
    const c = await person(mask.customerId);
    if (!c) return null;
    const settings = paymentsOf(c);
    return shown(
      c.display_name,
      settings,
      methodsFor(settings, { isConnected: false, spheres: [] }),
    );
  }
  // A share of a split (R62) pays whoever paid it. Everyone in a group sees the card, so there
  // it shows only their ways for everyone; between the two of them, what the payer may see.
  if (share) {
    const payee = await person(share.payeeId);
    if (!payee) return null;
    const relation =
      conversation.kind === 'direct'
        ? await viewerRelation(ctx.db, share.payeeId, senderId)
        : { isConnected: false, ownerSpheresForViewer: [] };
    const settings = paymentsOf(payee);
    return shown(
      payee.display_name,
      settings,
      methodsFor(settings, {
        isConnected: relation.isConnected,
        spheres: relation.ownerSpheresForViewer,
      }),
    );
  }
  if (conversation.kind !== 'direct') {
    if (!asks)
      throw badRequest(tr('In a group, ask to be paid; say you’re paying where it’s two of you.'));
    const me = await person(senderId);
    if (!me) return null;
    const settings = paymentsOf(me);
    return shown(
      me.display_name,
      settings,
      methodsFor(settings, { isConnected: false, spheres: [] }),
    );
  }
  const otherId = members.find((p) => p.user_id !== senderId)?.user_id;
  if (!otherId) return null;
  const [payeeId, payerId] = asks ? [senderId, otherId] : [otherId, senderId];
  const payee = await person(payeeId);
  if (!payee) return null;
  const relation = await viewerRelation(ctx.db, payeeId, payerId);
  const settings = paymentsOf(payee);
  return shown(
    payee.display_name,
    settings,
    methodsFor(settings, {
      isConnected: relation.isConnected,
      spheres: relation.ownerSpheresForViewer,
    }),
  );
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
    throw forbidden(tr('You can’t message this person.'));
  const [target, sender] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', '=', targetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone', 'age_minor_until'])
      .where('id', '=', senderId)
      .executeTakeFirstOrThrow(),
  ]);
  if (!target) throw notFound(tr('That person'));
  const now = ctx.now();
  const privacy = privacyOf(target, now);
  const refuse = () =>
    new AppError(
      403,
      'not_accepting_requests',
      tr('{name} only takes messages from people they know. Send a connection request instead.', {
        name: target.display_name,
      }),
    );
  if (privacy.messageRequests === 'nobody') throw refuse();
  // Under-18 accounts only hear from adults they share a connection with (R29).
  const needsSharedConnection =
    privacy.messageRequests === 'shared_connections' ||
    (minorOf(target, now) && !minorOf(sender, now));
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

export interface SendOptions {
  forwardedFromId?: string | null;
  /** A token or an app sent it for its sender (PRD §74): its name, shown with the message. */
  sentVia?: string | null;
  /** The server's own cards (task requests) are sent as built, not as a client's kit card. */
  trusted?: boolean;
  /**
   * The payload is the server's own (Cai's follow-up offer, a forwarded message's copy), so a
   * text message may carry one; a client's text carries none (review 2026-10-09 L9).
   */
  serverPayload?: boolean;
  /**
   * An organization's AI agent books or orders for its customer (M17 I1c): the card is theirs to
   * have asked for (`proposedBy`), so the team confirms it as it confirms a page's booking. Only
   * an appointment or an order in a customer conversation, for its customer, from the server.
   */
  askedFor?: string;
  /** The app whose token sends it: it sends only its own kinds of card (PRD §74). */
  app?: { id: string; orgId: string; scopes: string[] } | null;
  /** It came as mail (R75): more of it may come while a request waits, and it says so. */
  channel?: 'mail' | null;
  /**
   * A time of a meeting that repeats (R58): the series it continues, and whether it's posted
   * already agreed (the series going on, `meeting-series.ts`) or asked again (a space's copy).
   */
  occurrence?: { series: MeetingSeries; agreed: boolean } | null;
  /**
   * `false` where nothing follows the message (a series' next time, a space's copy of a card,
   * a request card whose route tells its assignee itself): nobody is told, nothing is
   * suggested, and the `message.effects` sweep leaves it be. Otherwise the caller runs
   * `afterMessage` once the response is away, and the sweep stands in for a crash (A3).
   */
  effects?: false;
}

/**
 * How long the fast path has to finish a message's effects before the `message.effects` sweep
 * takes them over (review 2026-10-17 §4, A3): past the longest honest fan-out, so a slow group
 * is never told twice, and short enough that a crash is made good within minutes.
 */
export const EFFECTS_GRACE_MS = 5 * 60_000;

/**
 * Every refusal sending this would meet, and nothing sent: for sending one thing to several
 * conversations (forwarding), where it goes to all of them or to none.
 */
export async function assertCanSend(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  body: SendMessageBodyT,
  opts: SendOptions = {},
): Promise<void> {
  await sendMessage(ctx, senderId, conversationId, body, { ...opts, checkOnly: true });
}

/**
 * When a message disappears: its conversation's setting as it's sent, so a change applies only to
 * what's sent after it (PRD §60), and never to what came before.
 */
function expiresAt(now: Date, retentionDays: number | null): Date | null {
  return retentionDays ? new Date(now.getTime() + retentionDays * 86_400_000) : null;
}

/**
 * The retention a new message in `conversationId` is sent with: the conversation's own, and its
 * organization's if that's shorter (R54). One indexed read; nothing for a conversation that
 * isn't an organization's.
 */
export async function retentionFor(
  trx: Kysely<Database> | Transaction<Database>,
  conversationId: string,
  conversationDays: number | null,
): Promise<number | null> {
  const org = await trx
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select('o.retention_days')
    .where('t.conversation_id', '=', conversationId)
    .executeTakeFirst();
  const orgDays = org?.retention_days ?? null;
  if (orgDays === null) return conversationDays;
  return conversationDays === null ? orgDays : Math.min(conversationDays, orgDays);
}

/**
 * What the rules read in a message's words (PRD §23), as the sender's zone and week place
 * them: run when a message is sent and again when it's edited, so an edit's new dates and
 * asks count as its words now say (docs/REVIEW-2026-10-05.md, intelligence M).
 */
export function analyseText(
  text: string,
  sender: { time_zone: string; locale: string; workweek: number[]; country: string | null },
  now: Date,
): { analysis: Analysis | null; entities: Record<string, unknown> } {
  const analysis = text
    ? analyzeMessage(text, {
        now,
        timeZone: sender.time_zone,
        locale: sender.locale,
        workweek: sender.workweek,
        // What "$" or "ريال" means to the writer (R76): their own currency when it's one of those.
        currency: currencyOfCountry(sender.country),
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
  return { analysis, entities };
}

export async function sendMessage(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  body: SendMessageBodyT,
  opts: SendOptions & { checkOnly: true },
): Promise<null>;
export async function sendMessage(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  body: SendMessageBodyT,
  opts?: SendOptions,
): Promise<SendResult>;
export async function sendMessage(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  body: SendMessageBodyT,
  opts: SendOptions & { checkOnly?: boolean } = {},
): Promise<SendResult | null> {
  const existing = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('sender_id', '=', senderId)
    .where('client_id', '=', body.clientId)
    .executeTakeFirst();
  if (existing) {
    if (existing.conversation_id !== conversationId)
      throw badRequest(tr('That clientId was already used.'));
    return opts.checkOnly ? null : { message: existing, created: false, analysis: null };
  }

  const conversation = await ctx.db
    .selectFrom('conversations')
    .selectAll()
    .where('id', '=', conversationId)
    .executeTakeFirst();
  if (!conversation) throw notFound(tr('That conversation'));
  const members = await participantsOf(ctx.db, conversationId);
  const me = members.find((p) => p.user_id === senderId);
  if (!me) throw notFound(tr('That conversation'));
  if (!canPostTo(conversation.kind, me.role)) throw forbidden(tr('Only admins can post here.'));
  // A notice (R75) is read, never answered: only its own mail arrives in it.
  if (conversation.notice && opts.channel !== 'mail')
    throw new AppError(
      409,
      'notice_only',
      tr('This is a notice by mail, from an address nobody answers. Nothing is sent from here.'),
    );
  // End to end encrypted (R18): only text sealed on one of the sender's own devices, for every
  // device of everyone in it. Nothing the server could read, so nothing it would work from.
  if (conversation.privacy_class === 'private') {
    if (opts.sentVia || opts.trusted)
      throw forbidden(tr('Only a person, on their own device, writes in a private conversation.'));
    if (
      !body.sealed ||
      body.kind !== 'text' ||
      body.body ||
      body.payload !== undefined ||
      body.fileIds?.length ||
      body.mentions?.length
    )
      throw badRequest(tr('Messages in a private conversation are text, sealed on your device.'));
    if (body.sealed.cid !== body.clientId || body.sealed.edit !== 0)
      throw badRequest(tr('That message isn’t sealed properly.'));
    await assertSealedForEveryone(ctx, conversationId, senderId, body.sealed);
  } else if (body.sealed) throw badRequest(tr('Only private conversations take sealed messages.'));
  if (conversation.kind === 'business' && conversation.org_id) {
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['archived_at', 'suspended_at'])
      .where('id', '=', conversation.org_id)
      .executeTakeFirst();
    // A closed organization's conversation is read-only, for its customer and anyone else (R42).
    if (!org || org.archived_at)
      throw new AppError(
        409,
        'org_closed',
        tr(
          'This organization closed, so nothing more is written here. Find it again to start a new conversation.',
        ),
      );
    // A suspended one's too, both ways, until Caime lifts it (M16 B3): kept, never written to.
    if (org.suspended_at)
      throw new AppError(
        409,
        'org_suspended',
        tr('This organization is suspended, so nothing is written here for now.'),
      );
    // Its customer blocked it: closed both ways until they unblock (PRD §55).
    await assertCanWrite(ctx, conversationId, senderId);
  }

  let acceptRequest = false;
  const unanswered = (message: string) => new AppError(403, 'awaiting_acceptance', message);
  if (conversation.kind === 'business') {
    // The team wrote first (R14): one message until the customer answers or accepts it, and a
    // declined one reads to the team as still unanswered.
    const customer = members.find((p) => p.role === 'member');
    if (customer?.user_id === senderId) {
      if (me.request_state === 'pending' || me.request_state === 'declined') acceptRequest = true;
    } else if (customer?.request_state === 'declined') {
      throw unanswered(tr('You can write again once they answer.'));
    } else if (customer?.request_state === 'pending') {
      const sent = await ctx.db
        .selectFrom('messages')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('conversation_id', '=', conversationId)
        .where('sender_id', '<>', customer.user_id)
        .where('kind', '<>', 'system')
        .executeTakeFirstOrThrow();
      if (sent.n >= 1) throw unanswered(tr('You can write again once they answer.'));
    }
  }
  // Someone reached by email (R93) reads only what a mail carries (M16 F3): a sticker, a poll, a
  // card nobody can answer by mail, a live location, a time that repeats or a meeting held on
  // Caime outside a one-to-one (in one, its mail carries their link to the call: M16 F6c) would
  // never reach them, so none is sent. One query, and only for those.
  const unmailable =
    opts.channel === 'mail' || opts.trusted
      ? null
      : notByMail(body.kind, body.payload, conversation.kind === 'direct');
  if (unmailable && (conversation.kind === 'direct' || conversation.kind === 'business')) {
    const otherSide = members.find(
      (p) => p.user_id !== senderId && (conversation.kind === 'direct' || p.role === 'member'),
    );
    const reached = otherSide
      ? await ctx.db
          .selectFrom('users')
          .select('kind')
          .where('id', '=', otherSide.user_id)
          .executeTakeFirst()
      : null;
    if (reached?.kind === 'provisional') throw badRequest(notByMailText(unmailable));
  }
  if (conversation.kind === 'direct') {
    const other = members.find((p) => p.user_id !== senderId);
    if (other) {
      if (await isBlockedEitherWay(ctx.db, senderId, other.user_id))
        throw forbidden(tr('You can’t message this person.'));
      // Cai and the Caime Friends read words and stickers (R67): no cards, files or voice.
      const caimes = systemAccountOf(other.user_id);
      if (caimes && body.kind !== 'text' && body.kind !== 'sticker')
        throw badRequest(tr('{name} reads words and stickers.', { name: caimes.name }));
      // Replying accepts their request, even one declined before.
      if (me.request_state === 'pending' || me.request_state === 'declined') acceptRequest = true;
      // Declined, it reads to the sender as still unanswered, as a connection request does.
      if (other.request_state === 'declined')
        throw unanswered(tr('You can send more once they accept your message request.'));
      // Mail keeps coming whether or not it's answered (R75): held here, never refused.
      if (other.request_state === 'pending' && opts.channel !== 'mail') {
        const sent = await ctx.db
          .selectFrom('messages')
          .select([
            sql<number>`count(*)::int`.as('n'),
            sql<Date | null>`max(created_at)`.as('last'),
          ])
          .where('conversation_id', '=', conversationId)
          .where('sender_id', '=', senderId)
          .executeTakeFirstOrThrow();
        // Someone reached by email (R93, M16 F2) is followed up as anyone writing by mail would:
        // once a day has passed since the last, twice at most, then nothing more until they
        // answer. Anyone on Caime is asked once.
        const byMail =
          sent.n >= 1 &&
          (
            await ctx.db
              .selectFrom('users')
              .select('kind')
              .where('id', '=', other.user_id)
              .executeTakeFirst()
          )?.kind === 'provisional';
        if (sent.n >= 1 + (byMail ? MAIL_FOLLOW_UPS : 0))
          throw new AppError(
            403,
            'awaiting_acceptance',
            byMail
              ? tr('You can write again once they answer.')
              : tr('You can send more once they accept your message request.'),
          );
        const ready = sent.last ? new Date(sent.last).getTime() + MAIL_FOLLOW_UP_AFTER_MS : 0;
        if (byMail && ready > ctx.now().getTime()) {
          const mine = await ctx.db
            .selectFrom('users')
            .select(['locale', 'time_zone'])
            .where('id', '=', senderId)
            .executeTakeFirstOrThrow();
          throw new AppError(
            403,
            'awaiting_acceptance',
            tr('You can follow up {when}: once a day, twice at most, until they answer.', {
              when: formatSoon(
                new Date(ready).toISOString(),
                ctx.now(),
                mine.time_zone,
                safeLocale(mine.locale),
              ),
            }),
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
      throw badRequest(tr('You can only reply to a message in this conversation.'));
  }
  const memberIds = new Set(members.map((p) => p.user_id));
  const mentions = [...new Set(body.mentions ?? [])].filter(
    (id) => memberIds.has(id) && id !== senderId,
  );
  // Reply privately (M16 E3b): a group's message answered in the chat of two people who are both
  // in that group now, and may both read it there; what it says is read again whenever the reply
  // is shown, so none of the group's words are copied here.
  let privateReply: { conversationId: string; messageId: string } | null = null;
  if (body.privateReplyTo) {
    if (body.kind !== 'text' || conversation.kind !== 'direct')
      throw badRequest(tr('A private reply is written in a chat between two people.'));
    const source = await ctx.db
      .selectFrom('messages as m')
      .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
      .select(['m.id', 'm.conversation_id'])
      .where('m.id', '=', body.privateReplyTo.messageId)
      .where('m.conversation_id', '=', body.privateReplyTo.conversationId)
      .where('c.kind', 'in', ['group', 'community', 'broadcast'])
      .where('c.privacy_class', '=', 'standard')
      .where('m.sealed', 'is', null)
      .where(readableBy(senderId, ctx.now(), 'm'))
      .executeTakeFirst();
    const both = source
      ? await ctx.db
          .selectFrom('participants')
          .select('user_id')
          .where('conversation_id', '=', source.conversation_id)
          .where('user_id', 'in', [...memberIds])
          .where('left_at', 'is', null)
          .execute()
      : [];
    if (!source || both.length < memberIds.size)
      throw badRequest(tr('That message can’t be answered privately here.'));
    privateReply = { conversationId: source.conversation_id, messageId: source.id };
  }

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
      throw badRequest(tr('One of the attachments isn’t available.'));
  }

  const sender = await ctx.db
    .selectFrom('users')
    .select([
      'id',
      'time_zone',
      'locale',
      'workweek',
      'country',
      'birth_date',
      'age_minor_until',
      'booking',
      'booking_items',
      'ordering',
      'collections',
    ])
    .where('id', '=', senderId)
    .executeTakeFirstOrThrow();
  // Under-18 accounts don't share where they are (R29).
  if (body.kind === 'location' && minorOf(sender, ctx.now()))
    throw forbidden(tr('Sharing a location is for people over 18.'));
  const text = body.body?.trim() ?? '';
  const { analysis, entities } = analyseText(text, sender, ctx.now());
  // Kit cards (PRD §41): the sender picks the kit and fills its fields; the server decides what
  // the card says and where it starts, and only POST /messages/:id/kit moves it on.
  let payload = body.payload ?? {};
  // A text message says its words; what Caime keeps on one (a transcript, an import, Cai's
  // offer) is the server's to write, never a client's (L9).
  if (
    body.kind === 'text' &&
    !opts.serverPayload &&
    (typeof payload !== 'object' || payload === null || Object.keys(payload).length > 0)
  )
    throw badRequest(tr('A text message carries no payload.'));
  // Any other kind keeps what it reads of what a client sent, nothing more (L9, M16 E4): no
  // client writes the marks Caime puts on a message (a transcript, an import, a private reply), and
  // what a voice note carries is bounded. A card's is built below from its fields.
  if (!opts.serverPayload && !opts.trusted) {
    if (body.kind === 'voice') payload = parse(VoicePayload, body.payload ?? {});
    else if (body.kind === 'media')
      // A message of videos alone says so, from the files themselves (M16 E4b).
      payload = files.length > 0 && files.every((f) => f.kind === 'video') ? { video: true } : {};
    else if (body.kind === 'file') payload = {};
    else if (body.kind === 'sticker') payload = parse(StickerPayload, body.payload);
    else if (body.kind === 'contact') payload = parse(ContactPayload, body.payload);
    else if (body.kind === 'poll') payload = parse(PollPayload, body.payload);
    else if (body.kind === 'location') payload = parse(LocationPayload, body.payload);
  }
  if (privateReply) payload = { privateReply };
  // Its link's card taken off before sending (M16 E4c): the sender's choice, kept on the text.
  if (body.kind === 'text' && body.linkPreview === false && analysis?.links.length)
    payload = { ...(payload as Record<string, unknown>), noPreview: true };
  let kitMode: Mode | null = null;
  // Its id, now: a repeating meeting's first time names its series by it (R58).
  const id = uuidv7();
  let series: MeetingSeries | null = null;
  // A booking from the catalog, checked again under the host's lock as the card is written.
  // A later time of a repeating appointment (R58) books past its own times ahead.
  const seriesBooking = opts.occurrence ? { series: opts.occurrence.series.id } : {};
  let slotAsk: { host: BookingHost; booker: Booker; ask: BookingAskInput; start: Date } | null =
    null;
  // An order from the catalog takes its counted items' stock as the card is written (R60).
  let orderTake: { host: BookingHost; order: PlacedOrder } | null = null;
  // A Pay card paying a share of a split here (R62), checked again under the split's lock.
  let paying: ShareToPay | null = null;
  if (
    body.kind === 'kit' &&
    !opts.trusted &&
    (body.payload as { kit?: unknown })?.kit === 'custom'
  ) {
    // One of the organization's own kinds of card, made by one of its apps (PRD §74, §86).
    payload = await customCardFor(ctx, {
      mask: await customerMask(ctx.db, conversationId),
      senderId,
      app: opts.app ?? null,
      raw: body.payload as { key?: unknown; app?: unknown; fields?: unknown },
      memberIds: members.map((p) => p.user_id),
    });
    kitMode = 'track';
  } else if (body.kind === 'kit' && !opts.trusted) {
    const raw = (body.payload ?? {}) as {
      kit?: unknown;
      fields?: unknown;
      booking?: unknown;
      order?: unknown;
      share?: unknown;
      form?: unknown;
    };
    const card = prepareKitFields(raw.kit, raw.fields);
    if (!card.ok) throw badRequest(card.error);
    // In a business conversation, which side sends it: the customer, or the organization's.
    const mask =
      conversation.kind === 'business' ? await customerMask(ctx.db, conversationId) : null;
    const fromTeam = Boolean(mask && mask.customerId !== senderId);
    // A business conversation is one-to-one: a customer and the organization (R15).
    if (conversation.kind !== 'direct' && conversation.kind !== 'business' && !card.def.groups)
      throw badRequest(
        tr('{name} cards are for one-to-one conversations.', { name: card.def.name }),
      );
    // With an organization, only the cards a customer relationship offers (orders, tickets…).
    if (
      conversation.kind === 'business' &&
      !kitsFor({
        spheres: [],
        isGroup: false,
        viewerIsMinor: false,
        isBusiness: true,
        isTeam: fromTeam,
      }).some((k) => k.id === card.kit)
    )
      throw badRequest(
        tr('{name} cards aren’t for conversations with an organization.', { name: card.def.name }),
      );
    // Everyone here is an adult, or a card about money doesn't go (R29, R38).
    const assertAllAdults = async (refusal: string) => {
      const people = await ctx.db
        .selectFrom('users')
        .select(['birth_date', 'time_zone', 'age_minor_until'])
        .where(
          'id',
          'in',
          members.map((p) => p.user_id),
        )
        .execute();
      if (people.some((u) => minorOf(u, ctx.now()))) throw forbidden(refusal);
    };
    if (card.def.adultsOnly)
      await assertAllAdults(
        tr('{name} cards aren’t available in this conversation.', { name: card.def.name }),
      );
    // A meeting that repeats (R58), in a chat or a group: the first time starts its series, read
    // on the proposer's clock; a later time carries the series it continues.
    if (card.kit === 'meeting' && isRepeat(card.fields.repeat)) {
      if (!repeatsIn(conversation.kind))
        throw badRequest(tr('A meeting repeats only in a chat or a group.'));
      const start = card.fields.start as { at: string };
      const zone = sender.time_zone || 'UTC';
      if (
        typeof card.fields.repeatUntil === 'string' &&
        !opts.occurrence &&
        card.fields.repeatUntil < dayIn(new Date(start.at), zone)
      )
        throw badRequest(tr('A meeting can’t stop repeating before it starts.'));
      series = opts.occurrence?.series ?? {
        id,
        n: 0,
        firstAt: start.at,
        zone,
        // Every workday (R76): the days its proposer works, kept with it.
        ...(card.fields.repeat === 'workday' && sender.workweek?.length
          ? { days: [...sender.workweek].sort((a, b) => a - b) }
          : {}),
      };
    } else if (
      (card.kit === 'meeting' || card.kit === 'appointment') &&
      card.fields.repeatUntil !== undefined &&
      !isRepeat(card.fields.repeat)
    )
      throw badRequest(tr('Until is for a meeting that repeats.'));
    // Cai takes notes in its call (M16 F7c): chosen ahead on a meeting held here, by someone who
    // could ask for them in the call, where Cai may take notes at all (R85, R52). Everyone is
    // still asked as they join.
    if (card.kit === 'meeting' && card.fields.notes !== undefined) {
      if (!heldOnCaime({ kit: 'meeting', place: card.fields.place }, conversation.kind))
        throw badRequest(tr('Cai takes notes only in a meeting held on Caime.'));
      await assertNotesAllowed(ctx, {
        conversationId,
        askerId: senderId,
        people: members.map((p) => p.user_id),
        where: 'conversation',
      });
    }
    // An intake form (M16 H5): the organization's side sends one of its forms to its customer,
    // copied whole as it reads now, for the customer to answer on the card. Someone reached by
    // mail has nowhere to fill one in.
    let intake: IntakeForm | null = null;
    if (card.kit === 'form') {
      if (!mask || !fromTeam)
        throw badRequest(tr('Forms are sent by an organization to its customers.'));
      const { formId } = parse(FormAskBody, raw.form ?? {});
      const customer = await ctx.db
        .selectFrom('users')
        .select('kind')
        .where('id', '=', mask.customerId)
        .executeTakeFirst();
      if (customer?.kind !== 'human')
        throw badRequest(tr('Someone reached by mail can’t fill in a form yet.'));
      intake = await formForCard(ctx.db, mask.orgId, formId);
      card.fields.title = intake.name;
    }
    if (card.kit === 'split') {
      // Who owes the payer: everyone else here (people, not bots), an equal share each, worked
      // out once and kept on the card (R38: a record, never a transfer).
      const people = await ctx.db
        .selectFrom('users')
        .select('id')
        .where(
          'id',
          'in',
          members.map((p) => p.user_id),
        )
        .where('kind', '=', 'human')
        .where('deleted_at', 'is', null)
        .execute();
      const shares = shareOut(
        card.fields.amount as { value: number; currency: string | null },
        senderId,
        people.map((u) => u.id),
      );
      if (!shares.length) throw badRequest(tr('There’s nobody here to split it with.'));
      card.fields.shares = shares;
    }
    // From a catalog (R58, R60): an appointment books one of the host's items, an order takes
    // some of them; each is checked and fixed as the card keeps it. The host is the
    // organization, or the other person if the items are theirs, else the sender (filling their
    // own diary, or writing down an order taken for someone).
    let booking: Record<string, unknown> | null = null;
    let order: PlacedOrder | null = null;
    let catalogHost: BookingHost | null = null;
    const ask =
      card.kit === 'appointment' && raw.booking ? parse(BookingAskBody, raw.booking) : null;
    const orderAsk =
      card.kit === 'order_status' && raw.order ? parse(OrderAskBody, raw.order) : null;
    if (ask || orderAsk) {
      const wanted = ask ? [ask.itemId] : (orderAsk?.lines ?? []).map((l) => l.itemId);
      const found = await catalogHostFor(ctx, conversation, members, sender, wanted);
      if (!found)
        throw new AppError(403, 'not_bookable', tr('That isn’t something you can book here.'));
      catalogHost = found.host;
      if (ask) {
        const start = new Date((card.fields.start as { at: string }).at);
        booking = (await bookingFor(
          ctx,
          found.host,
          found.booker,
          ask,
          start,
          seriesBooking,
        )) as unknown as Record<string, unknown>;
        slotAsk = { host: found.host, booker: found.booker, ask, start };
        // A priced booking is a card about money whoever books it (the team for a customer too).
        if (booking.price) await assertAllAdults(tr('Paid bookings are for people over 18.'));
        // Booked at a branch (R92): the card says where, unless the booker wrote it already.
        if (typeof booking.where === 'string' && !card.fields.place)
          card.fields.place = booking.where;
      }
      if (orderAsk) {
        // Checked against the counts now (a quick refusal), and taken under their locks below.
        order = orderFor(await hostWithStock(ctx.db, found.host), found.booker, orderAsk);
        // Where it's had (M16 F6), when everything in it says the same: sent here, or a place.
        const wheres = new Set(
          await Promise.all(
            [...new Set(order.lines.map((l) => l.itemId))].map(async (itemId) => {
              const item = found.host.items.find((i) => i.id === itemId);
              return item ? ((await whereBooked(ctx, found.host, item)).where ?? '') : '';
            }),
          ),
        );
        const [where] = [...wheres];
        if (wheres.size === 1 && where) order = { ...order, where };
        orderTake = { host: found.host, order };
        // The card reads as any order does: its number, what was ordered, the total.
        card.fields.summary = orderSummary(order).slice(0, 200);
        if (order.total) card.fields.amount = order.total;
        else delete card.fields.amount;
        if (typeof card.fields.reference !== 'string' || !card.fields.reference)
          card.fields.reference = orderNumber();
      }
    }
    // An appointment that repeats (R58), in a chat or with an organization: each time is booked
    // as it's posted. Its clock is the host's when it's from a catalog (a clinic's 10:00 stays
    // its 10:00, its week for every workday), else its proposer's.
    if (card.kit === 'appointment' && isRepeat(card.fields.repeat)) {
      if (!repeatsIn(conversation.kind, 'appointment'))
        throw badRequest(tr('An appointment repeats only in a chat or with an organization.'));
      const start = card.fields.start as { at: string };
      const zone = (catalogHost?.hours?.timeZone || sender.time_zone) ?? 'UTC';
      // Every workday is the host's days open, or the proposer's week (R76).
      const week = catalogHost?.hours
        ? [...new Set(catalogHost.hours.days.map((d) => d.weekday))]
        : sender.workweek;
      if (
        typeof card.fields.repeatUntil === 'string' &&
        !opts.occurrence &&
        card.fields.repeatUntil < dayIn(new Date(start.at), zone)
      )
        throw badRequest(tr('An appointment can’t stop repeating before it starts.'));
      series = opts.occurrence?.series ?? {
        id,
        n: 0,
        firstAt: start.at,
        zone,
        ...(card.fields.repeat === 'workday' && week?.length
          ? { days: [...week].sort((a, b) => a - b) }
          : {}),
      };
    }
    // Whom a priced booking or order is paid to (R62): its host, so the payer's card offers Pay.
    const priced = (booking && (booking as { price?: unknown }).price) || order?.total;
    const payee = priced && catalogHost ? { kind: catalogHost.kind, id: catalogHost.id } : null;
    // A share of a split paid with Pay (R62): the sender pays what they owe to whoever paid it,
    // that amount and no other, as an answer to the split; the split's lock is taken below.
    if (card.kit === 'payment_request' && raw.share) {
      const { splitId } = parse(ShareAskBody, raw.share);
      paying = await shareToPay(ctx.db, conversationId, splitId, senderId);
      card.fields.direction = 'send';
      card.fields.amount = paying.amount;
      if (typeof card.fields.note !== 'string' && paying.title)
        card.fields.note = paying.title.slice(0, 200);
    }
    // Pay (R62): the payee's ways the payer may see, fixed now; nothing is paid through Caime.
    const payTo =
      card.kit === 'payment_request'
        ? await payToFor(ctx, conversation, members, senderId, card.fields, paying)
        : null;
    // An order written down by hand says which it is.
    if (card.kit === 'order_status' && !order && !card.fields.reference)
      throw badRequest(tr('{label} is needed.', { label: tr('Order number') }));
    payload = {
      kit: card.kit,
      label: card.def.name,
      title: kitHeadline(card.kit, card.fields, sender.locale),
      fields: card.fields,
      state:
        series && opts.occurrence?.agreed
          ? card.kit === 'appointment'
            ? AGREED_STATES.appointment
            : AGREED_STATES.meeting
          : initialKitState(card.kit, card.fields),
      history: [],
      ...(series ? { series } : {}),
      ...(booking ? { booking } : {}),
      ...(order ? { order } : {}),
      ...(payee ? { payee } : {}),
      ...(payTo ? { payTo } : {}),
      ...(paying ? { share: { splitId: paying.splitId, payeeId: paying.payeeId } } : {}),
      ...(intake ? { form: intake } : {}),
      ...(opts.askedFor &&
      conversation.kind === 'business' &&
      (card.kit === 'appointment' || card.kit === 'order_status') &&
      members.some((p) => p.role === 'member' && p.user_id === opts.askedFor)
        ? { proposedBy: opts.askedFor }
        : {}),
    };
    kitMode = KIT_MODES[card.kit];
  } else if (body.kind === 'kit' && opts.trusted) {
    // The server's own card is the kind of message its kit is, as a client's is.
    const kit = (payload as { kit?: unknown } | null)?.kit;
    if (isCardKit(kit)) kitMode = KIT_MODES[kit];
  }
  // Live, a location follows its sharer until the time they chose; the server keeps the clock.
  if (body.kind === 'location') {
    const place = LocationPayload.parse(body.payload);
    if (place.live) {
      if (conversation.kind === 'business')
        throw badRequest(tr('Live location is for people you know, not organizations.'));
      const at = ctx.now();
      payload = {
        ...place,
        live: {
          startedAt: at.toISOString(),
          until: new Date(at.getTime() + place.live.minutes * 60_000).toISOString(),
          updatedAt: at.toISOString(),
          stoppedAt: null,
        },
      };
    }
  }

  // Everything that could refuse it has had its say.
  if (opts.checkOnly) return null;

  // Needs you was right (PRD §83): this answers something in it that asked the sender, since they
  // last wrote and since they said it didn't need them. Read now, as it stands before sending;
  // counted, never who or where.
  const answersNeed =
    me.role !== 'agent' &&
    me.request_state !== 'pending' &&
    Boolean(
      (
        await sql<{ answered: boolean }>`
          select exists (
            select 1 from messages m
            join participants p on p.conversation_id = m.conversation_id and p.user_id = ${senderId}
            left join messages y on y.id = m.reply_to_id
            where m.conversation_id = ${conversationId}
              and m.sender_id is distinct from ${senderId}
              and m.seq > p.dismissed_seq
              -- Since they last wrote (M16 D1): kept on their row, never looked for.
              and m.seq > p.last_sent_seq
              and (m.is_question or m.is_request) and m.deleted_at is null
              and (${conversation.kind} in ('direct', 'business')
                or ${senderId}::uuid = any(m.mentions)
                or y.sender_id = ${senderId})
          ) as answered
        `.execute(ctx.db)
      ).rows[0]?.answered,
    );

  const mode =
    body.mode ??
    kitMode ??
    analysis?.mode ??
    (body.kind === 'poll' ? 'ask' : body.kind === 'location' || files.length ? 'share' : 'talk');

  let message: Message;
  let tookStock = false;
  try {
    message = await ctx.db.transaction().execute(async (trx) => {
      const bumped = await trx
        .updateTable('conversations')
        .set({ last_seq: sql`last_seq + 1`, last_message_at: ctx.now(), updated_at: ctx.now() })
        .where('id', '=', conversationId)
        .returning(['last_seq', 'retention_days'])
        .executeTakeFirstOrThrow();
      const seq = bumped.last_seq;
      // The slot once more, under the host's lock (M20): two bookings of the last place at once
      // leave one booked and one refused, whatever each saw before; the lock ends with the
      // transaction, so the second sees the first's card.
      if (slotAsk) {
        await sql`select pg_advisory_xact_lock(hashtext(${`slots:${slotAsk.host.kind}:${slotAsk.host.id}`}))`.execute(
          trx,
        );
        // The calendars were read again a moment ago, before the transaction: not under its lock.
        (payload as Record<string, unknown>).booking = await bookingFor(
          ctx,
          slotAsk.host,
          slotAsk.booker,
          slotAsk.ask,
          slotAsk.start,
          { ...seriesBooking, fresh: false },
        );
      }
      // The share once more, under the split's lock: two Pay cards for one share at once leave one.
      if (paying) await shareToPay(trx, conversationId, paying.splitId, senderId, true);
      // A business conversation is kept as its organization says too (R54): the shorter wins.
      const kept =
        conversation.kind === 'business'
          ? await retentionFor(trx, conversationId, bumped.retention_days)
          : bumped.retention_days;
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
          payload: JSON.stringify(payload),
          card_start_at: cardStartAt(payload),
          // The outbox (A3): due for the sweep unless the fast path clears it first.
          effects_at:
            opts.effects === false ? null : new Date(ctx.now().getTime() + EFFECTS_GRACE_MS),
          mode,
          mode_source: body.mode ? 'user' : 'auto',
          entities: JSON.stringify(entities),
          mentions,
          // A share's Pay card answers its split, whatever else it was sent as a reply to.
          reply_to_id: paying?.splitId ?? body.replyToId ?? null,
          forwarded_from_id: opts.forwardedFromId ?? null,
          sent_via: opts.sentVia ?? null,
          channel: opts.channel ?? null,
          sealed: body.sealed ? JSON.stringify(body.sealed) : null,
          urgent: body.urgent ?? false,
          is_question: analysis?.isQuestion ?? body.kind === 'poll',
          // A card that asks (a proposal, a request, an invoice) is a request as a sentence is (M14).
          is_request: (analysis?.isRequest ?? false) || cardAsks(payload),
          expires_at: expiresAt(ctx.now(), kept),
          created_at: ctx.now(),
        })
        .returning(MESSAGE_COLUMNS)
        .executeTakeFirstOrThrow();
      // Its stock, under the counts' locks (R60): two orders for the last one leave one refused.
      if (orderTake)
        tookStock = await takeStock(trx, orderTake.host, id, orderTake.order, ctx.now());
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
          last_sent_seq: seq,
          draft: null,
          draft_updated_at: null,
          ...(acceptRequest ? { request_state: 'accepted' as const, archived_at: null } : {}),
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
      if (answersNeed) await recordEvent(trx, 'attention.answered', null, {});
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
        .select(MESSAGE_COLUMNS)
        .where('sender_id', '=', senderId)
        .where('client_id', '=', body.clientId)
        .executeTakeFirst();
      if (winner) return { message: winner, created: false, analysis: null };
    }
    throw err;
  }
  ctx.metrics.messages.inc({ kind: body.kind });
  if (tookStock && orderTake) await tellStockChanged(ctx, [orderTake.host.id]);
  // A meeting or an appointment goes into its people's own calendars (R96), asked or agreed.
  const kit = (payload as { kit?: unknown }).kit;
  if (message.card_start_at && (kit === 'meeting' || kit === 'appointment'))
    await queueCalendarPush(
      ctx,
      (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
    );
  // A business thread moves with each message: whose turn it is, and who has it (PRD §38).
  // A repeating appointment's next time is the series going on, not anyone writing (R58): it
  // reopens no thread, wakes no agent and tells no app.
  if (conversation.kind === 'business' && !opts.occurrence?.agreed)
    await recordBusinessMessage(ctx, conversationId, senderId, message);
  return { message, created: true, analysis };
}

/** System events in the timeline ("Sarah added Ahmed"), ordered like any message. */
export async function insertSystemMessage(
  ctx: AppContext,
  conversationId: string,
  actorId: string,
  event: string,
  data: Record<string, unknown>,
  /** It asks the others something (M16 F5: another time), as a card that asks does (M14). */
  opts: { asks?: boolean } = {},
): Promise<Message> {
  // Names are recorded with the event, so the line reads the same later (core systemText).
  const userIds = Array.isArray(data.userIds) ? (data.userIds as string[]) : [];
  const userId = typeof data.userId === 'string' ? data.userId : null;
  const people = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name'])
    .where('id', 'in', [...new Set([actorId, ...userIds, ...(userId ? [userId] : [])])])
    .execute();
  const nameOf = (id: string) => people.find((u) => u.id === id)?.display_name;
  const payload = {
    event,
    ...data,
    byId: actorId,
    by: nameOf(actorId) ?? data.by ?? null,
    ...(userIds.length ? { names: userIds.map(nameOf).filter(Boolean) } : {}),
    ...(userId ? { name: nameOf(userId) ?? null } : {}),
  };
  return ctx.db.transaction().execute(async (trx) => {
    const bumped = await trx
      .updateTable('conversations')
      .set({ last_seq: sql`last_seq + 1`, updated_at: ctx.now() })
      .where('id', '=', conversationId)
      .returning(['last_seq', 'retention_days'])
      .executeTakeFirstOrThrow();
    const kept = await retentionFor(trx, conversationId, bumped.retention_days);
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
        payload: JSON.stringify(payload),
        is_request: opts.asks ?? false,
        expires_at: expiresAt(ctx.now(), kept),
        created_at: ctx.now(),
      })
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
    await trx
      .updateTable('participants')
      .set({ last_read_seq: bumped.last_seq, last_sent_seq: bumped.last_seq })
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', actorId)
      .execute();
    return row;
  });
}
