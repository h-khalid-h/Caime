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
  canPostTo,
  type FileView,
  initialKitState,
  KIT_MODES,
  kitHeadline,
  kitsFor,
  LocationPayload,
  type MessageView,
  type Mode,
  methodsFor,
  OrderAskBody,
  orderSummary,
  type PaymentSettings,
  type PayTo,
  type PlacedOrder,
  payDirection,
  prepareKitFields,
  type SealedMessage,
  type SendMessageBodyT,
  messagePreview as sharedPreview,
  shareOut,
  systemAccountOf,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { Kysely, SqlBool, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { AssetKind, Database, Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { assertCanWrite } from './blocks';
import {
  type Booker,
  type BookingHost,
  bookingFor,
  orderFor,
  orgHost,
  paymentsOf,
  personHost,
} from './booking';
import { customerMask, maskFor, maskMessage, recordBusinessMessage } from './business';
import { checkoutAccountOf } from './checkout-account';
import { assertSealedForEveryone } from './e2ee';
import { AppError, badRequest, forbidden, notFound } from './errors';
import { recordEvent } from './events';
import { customCardFor } from './kits';
import { isBlockedEitherWay, shareAConnection, viewerRelation } from './relations';
import { minorOf, privacyOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;

export type { FileView, MessageView };

/** Where a file is downloaded from, by whoever may read it. */
export const fileUrl = (id: string) => `/v1/files/${id}`;

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
  };
}

/**
 * Not from a message the viewer deleted for themselves: what came in it stays out of their sight
 * wherever it's gathered. `column` holds the message's id, or null for something in no message.
 */
export function notHiddenFor(userId: string, column: string) {
  return sql<SqlBool>`not exists (select 1 from hidden_messages h where h.message_id = ${sql.ref(column)} and h.user_id = ${userId})`;
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
  const [reactions, files, replies, votes, senders, albums] = await Promise.all([
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
  ]);
  // Bots and agents say so wherever their messages go (R16).
  const automatedSenders = new Set(senders.filter((u) => u.kind !== 'human').map((u) => u.id));
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
      forwarded: m.forwarded_from_id !== null,
      sentVia: m.sent_via,
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
      .selectAll()
      .where('id', '=', targetId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
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
  /** The app whose token sends it: it sends only its own kinds of card (PRD §74). */
  app?: { id: string; orgId: string; scopes: string[] } | null;
}

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
  sender: { time_zone: string; locale: string; workweek: number[] },
  now: Date,
): { analysis: Analysis | null; entities: Record<string, unknown> } {
  const analysis = text
    ? analyzeMessage(text, {
        now,
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
      .select('archived_at')
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
            tr('You can send more once they accept your message request.'),
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
      'birth_date',
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
  let kitMode: Mode | null = null;
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
    };
    const card = prepareKitFields(raw.kit, raw.fields);
    if (!card.ok) throw badRequest(card.error);
    // A business conversation is one-to-one: a customer and the organization (R15).
    if (conversation.kind !== 'direct' && conversation.kind !== 'business' && !card.def.groups)
      throw badRequest(
        tr('{name} cards are for one-to-one conversations.', { name: card.def.name }),
      );
    // With an organization, only the cards a customer relationship offers (orders, tickets…).
    if (
      conversation.kind === 'business' &&
      !kitsFor({ spheres: [], isGroup: false, viewerIsMinor: false, isBusiness: true }).some(
        (k) => k.id === card.kit,
      )
    )
      throw badRequest(
        tr('{name} cards aren’t for conversations with an organization.', { name: card.def.name }),
      );
    if (card.def.adultsOnly) {
      const people = await ctx.db
        .selectFrom('users')
        .select(['birth_date', 'time_zone'])
        .where(
          'id',
          'in',
          members.map((p) => p.user_id),
        )
        .execute();
      if (people.some((u) => minorOf(u, ctx.now())))
        throw forbidden(
          tr('{name} cards aren’t available in this conversation.', { name: card.def.name }),
        );
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
      card.kit === 'appointment' && raw.booking ? BookingAskBody.parse(raw.booking) : null;
    const orderAsk =
      card.kit === 'order_status' && raw.order ? OrderAskBody.parse(raw.order) : null;
    if (ask || orderAsk) {
      const wanted = ask ? [ask.itemId] : (orderAsk?.lines ?? []).map((l) => l.itemId);
      const found = await catalogHostFor(ctx, conversation, members, sender, wanted);
      if (!found)
        throw new AppError(403, 'not_bookable', tr('That isn’t something you can book here.'));
      catalogHost = found.host;
      if (ask) {
        const start = (card.fields.start as { at: string }).at;
        booking = (await bookingFor(
          ctx,
          found.host,
          found.booker,
          ask,
          new Date(start),
        )) as unknown as Record<string, unknown>;
      }
      if (orderAsk) {
        order = orderFor(found.host, found.booker, orderAsk);
        // The card reads as any order does: its number, what was ordered, the total.
        card.fields.summary = orderSummary(order).slice(0, 200);
        if (order.total) card.fields.amount = order.total;
        else delete card.fields.amount;
        if (typeof card.fields.reference !== 'string' || !card.fields.reference)
          card.fields.reference = orderNumber();
      }
    }
    // Whom a priced booking or order is paid to (R62): its host, so the payer's card offers Pay.
    const priced = (booking && (booking as { price?: unknown }).price) || order?.total;
    const payee = priced && catalogHost ? { kind: catalogHost.kind, id: catalogHost.id } : null;
    // Pay (R62): the payee's ways the payer may see, fixed now; nothing is paid through Caime.
    const payTo =
      card.kit === 'payment_request'
        ? await payToFor(ctx, conversation, members, senderId, card.fields)
        : null;
    // An order written down by hand says which it is.
    if (card.kit === 'order_status' && !order && !card.fields.reference)
      throw badRequest(tr('{label} is needed.', { label: tr('Order number') }));
    payload = {
      kit: card.kit,
      label: card.def.name,
      title: kitHeadline(card.kit, card.fields, sender.locale),
      fields: card.fields,
      state: initialKitState(card.kit, card.fields),
      history: [],
      ...(booking ? { booking } : {}),
      ...(order ? { order } : {}),
      ...(payee ? { payee } : {}),
      ...(payTo ? { payTo } : {}),
    };
    kitMode = KIT_MODES[card.kit];
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
            where m.conversation_id = ${conversationId}
              and m.sender_id is distinct from ${senderId}
              and m.seq > p.dismissed_seq
              and m.seq > coalesce((select max(x.seq) from messages x
                where x.conversation_id = m.conversation_id and x.sender_id = ${senderId}), 0)
              and (m.is_question or m.is_request) and m.deleted_at is null
              and (${conversation.kind} in ('direct', 'business')
                or ${senderId}::uuid = any(m.mentions)
                or m.reply_to_id in (select y.id from messages y
                  where y.conversation_id = m.conversation_id and y.sender_id = ${senderId}))
          ) as answered
        `.execute(ctx.db)
      ).rows[0]?.answered,
    );

  const mode =
    body.mode ??
    kitMode ??
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
        .returning(['last_seq', 'retention_days'])
        .executeTakeFirstOrThrow();
      const seq = bumped.last_seq;
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
          mode,
          mode_source: body.mode ? 'user' : 'auto',
          entities: JSON.stringify(entities),
          mentions,
          reply_to_id: body.replyToId ?? null,
          forwarded_from_id: opts.forwardedFromId ?? null,
          sent_via: opts.sentVia ?? null,
          sealed: body.sealed ? JSON.stringify(body.sealed) : null,
          urgent: body.urgent ?? false,
          is_question: analysis?.isQuestion ?? body.kind === 'poll',
          is_request: analysis?.isRequest ?? false,
          expires_at: expiresAt(ctx.now(), kept),
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
  // A business thread moves with each message: whose turn it is, and who has it (PRD §38).
  if (conversation.kind === 'business')
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
        expires_at: expiresAt(ctx.now(), kept),
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
