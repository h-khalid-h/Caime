/**
 * Guests in a meeting (R84). Inviting someone by address to an accepted meeting held on Caime
 * gives the meeting a space of its own the first time: a group conversation named by it, with
 * the people of the conversation it was agreed in and a copy of its card, accepted as the
 * original was; the original card says it moved (`movedTo`) and leaves the calendar, Join and
 * "starting now" to the copy. A guest sees the space from their invitation on and nothing else
 * (the guard on every request, `guest-routes.ts`). Each guest is invited by mail with a calendar
 * invitation and their own link, kept hashed; the link is their way in (the join page, next).
 * Never from a private conversation, a business one, or by someone under 18; up to eight in all.
 */

import { uuidv4, uuidv7 } from '@caime/core';
import { GROUP_CALL_MAX } from '@caime/core/calls';
import { firstName } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { buildInvitation } from '@caime/core/ics';
import { CAI_MAIL, meetingVenue } from '@caime/core/meetings';
import { seriesOf } from '@caime/core/series';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import { type Database, MESSAGE_COLUMNS, type Message } from '../db/schema';
import { queueCalendarPush } from './calendar-push';
import { membership } from './conversation-views';
import { lockConversation } from './conversations';
import { hashToken, newToken } from './crypto';
import { fromAddress } from './email';
import { AppError, badRequest, forbidden, mailUnavailable, notFound } from './errors';
import { meetingUid, onOccurrencePosted, queueNextTime } from './meeting-series';
import { queueMeetingStart } from './meeting-start';
import { assertCanMessage, messageViews, participantsOf, sendMessage } from './messages';
import { personForAddress } from './provisional';
import { between, isBlockedEitherWay } from './relations';
import { minorOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;

/** Everyone in a meeting's space, its people and its guests: as many as a group call takes. */
export const SPACE_MAX = GROUP_CALL_MAX;

interface MeetingPayload {
  kit?: string;
  state?: string;
  title?: string;
  movedTo?: { conversationId: string; messageId: string };
  fields?: {
    title?: unknown;
    start?: { at?: string; hasTime?: boolean };
    durationMinutes?: unknown;
    place?: unknown;
    repeat?: unknown;
  };
}

const ADDRESS = /^[^\s@:;,"<>]+@[^\s@:;,"<>]+\.[^\s@:;,"<>]+$/;

/**
 * Who a meeting's invitation comes from (R86): Cai, at its own address on Caime's mail domain,
 * for whoever invited ("Ana via Cai"), so the guest's calendar sends its answer back to Cai;
 * without a mail domain, Caime's usual sender, and answers go unread.
 */
function invitationSender(
  config: AppContext['config'],
  host: string,
): { address: string; header: string | undefined } {
  if (!config.MAIL_DOMAIN) return { address: fromAddress(config.EMAIL_FROM), header: undefined };
  const address = `${CAI_MAIL}@${config.MAIL_DOMAIN}`;
  const name = `${host} via Cai`.replace(/[^\p{L}\p{N}\p{M} .,'’-]/gu, ' ').trim();
  return { address, header: `"${name}" <${address}>` };
}

/**
 * How Cai opens mail it sends for someone (R87): who it is, that it's an AI, and whom it writes
 * for, greeting the guest by their first name. Mail stays English and plain (R48).
 */
export function caiIntroduction(guestName: string | null, principal: string): string {
  const name = guestName ? firstName(guestName) : '';
  return `${name ? `Hi ${name}` : 'Hello'}, I'm Cai, the AI assistant for ${principal}.`;
}

/** A meeting that can take guests: accepted, held on Caime, with a time, not yet over. */
function meetingOk(ctx: AppContext, m: Message): MeetingPayload {
  const p = (m.payload ?? {}) as MeetingPayload;
  if (m.kind !== 'kit' || m.deleted_at || p.kit !== 'meeting')
    throw badRequest(tr('Only a meeting takes guests.'));
  if (p.state !== 'accepted') throw badRequest(tr('A meeting takes guests once it’s agreed.'));
  if (meetingVenue(p.fields?.place) !== 'caime' || p.fields?.start?.hasTime === false)
    throw badRequest(tr('Only a meeting held on Caime, at a time, takes guests.'));
  const at = p.fields?.start?.at ? Date.parse(p.fields.start.at) : Number.NaN;
  if (!Number.isFinite(at) || at < ctx.now().getTime() - 60 * 60_000)
    throw badRequest(tr('That meeting is over.'));
  return p;
}

/**
 * Whether the one inviting may ask this person into a meeting (R84): a guest (provisional) unless
 * either blocks the other; someone on Caime as a message request from them could reach them (their
 * own setting, R14), or a connection; never anyone under 18 (R29), gone, suspended, or not a
 * person.
 */
async function mayBeAsked(
  ctx: AppContext,
  actorId: string,
  person: {
    id: string;
    kind: string;
    deleted_at: Date | null;
    suspended_at: Date | null;
    birth_date: string | null;
    time_zone: string;
  },
): Promise<boolean> {
  if (person.deleted_at || person.suspended_at) return false;
  if (person.kind === 'provisional') return !(await isBlockedEitherWay(ctx.db, actorId, person.id));
  if (person.kind !== 'human' || minorOf(person, ctx.now())) return false;
  const rel = await between(ctx.db, actorId, person.id);
  if (rel.blockedByMe || rel.blockedMe) return false;
  if (rel.connected) return true;
  return assertCanMessage(ctx, actorId, person.id).then(
    () => true,
    (err) => {
      if (err instanceof AppError) return false;
      throw err;
    },
  );
}

/** A meeting's space as it's kept: claimed with its group, its card's copy once sent. */
const spaceRowOf = (db: Q, cardId: string) =>
  db
    .selectFrom('meeting_spaces')
    .select(['message_id', 'conversation_id', 'space_message_id', 'copy_client_id', 'created_by'])
    .where((eb) => eb.or([eb('message_id', '=', cardId), eb('space_message_id', '=', cardId)]))
    .executeTakeFirst();

/** Whether anyone among these people is under 18. */
async function anyMinor(db: Q, userIds: string[], now: Date): Promise<boolean> {
  if (!userIds.length) return false;
  const people = await db
    .selectFrom('users')
    .select(['birth_date', 'time_zone'])
    .where('id', 'in', userIds)
    .execute();
  return people.some((u) => minorOf(u, now));
}

/** Whether a conversation holds a meeting's guest: a provisional person (R84). */
async function holdsGuests(db: Q, conversationId: string): Promise<boolean> {
  const row = await db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select('p.user_id')
    .where('p.conversation_id', '=', conversationId)
    .where('p.left_at', 'is', null)
    .where('u.kind', '=', 'provisional')
    .executeTakeFirst();
  return Boolean(row);
}

/**
 * Under 18 (R29): a guest is a stranger to everyone in their meeting, so nobody under 18 is ever
 * in a conversation with one. Adding people to a conversation that holds a guest (the members
 * route, under the conversation's lock) refuses anyone under 18 among them.
 */
export async function assertNoMinorWithGuests(
  db: Q,
  conversationId: string,
  joining: string[],
  now: Date,
): Promise<void> {
  if ((await holdsGuests(db, conversationId)) && (await anyMinor(db, joining, now)))
    throw forbidden(tr('They can’t join a conversation with guests.'));
}

/** Refused the same way whatever the reason, as a money card is in such a conversation. */
const noGuestsHere = () => forbidden(tr('Guests aren’t available in this conversation.'));

/**
 * The meeting's space, made the first time. Its group and its people are claimed under the
 * card's row lock, so two invitations at once make one space; the card's copy is then sent with
 * the claim's own client id by whoever claimed it, so an invitation that arrives while the space
 * is being made (or after a failure part way) finishes it with the very same copy, never a
 * second one. Nothing waits on a lock while it needs another connection.
 */
async function spaceFor(
  ctx: AppContext,
  actorId: string,
  card: Message,
  p: MeetingPayload,
): Promise<{ conversationId: string; messageId: string }> {
  // A time of a repeating meeting posted in its space (R58) is that space's: guests join it there.
  const inSpace = await ctx.db
    .selectFrom('meeting_spaces')
    .select('message_id')
    .where('conversation_id', '=', card.conversation_id)
    .executeTakeFirst();
  if (inSpace) return { conversationId: card.conversation_id, messageId: card.id };
  const claim = await ctx.db.transaction().execute(async (trx) => {
    await trx.selectFrom('messages').select('id').where('id', '=', card.id).forUpdate().execute();
    const held = await spaceRowOf(trx, card.id);
    if (held) return held;
    const title = (
      p.title ||
      (typeof p.fields?.title === 'string' && p.fields.title) ||
      tr('Meeting')
    )
      .toString()
      .slice(0, 80);
    const people = (await participantsOf(trx, card.conversation_id)).map((x) => x.user_id);
    const humans = await trx
      .selectFrom('users')
      .select('id')
      .where('id', 'in', people)
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .execute();
    const members = humans.map((h) => h.id).filter((id) => id !== actorId);
    if (members.length + 1 >= SPACE_MAX)
      throw badRequest(tr('A meeting holds eight people at most.'));
    if (await anyMinor(trx, [actorId, ...members], ctx.now())) throw noGuestsHere();
    const spaceId = uuidv7();
    await trx
      .insertInto('conversations')
      .values({
        id: spaceId,
        kind: 'group',
        title,
        purpose: null,
        privacy_class: 'standard',
        created_by: actorId,
      })
      .execute();
    await trx
      .insertInto('participants')
      .values([
        { conversation_id: spaceId, user_id: actorId, role: 'owner', joined_at: ctx.now() },
        ...members.map((u) => ({
          conversation_id: spaceId,
          user_id: u,
          role: 'member' as const,
          joined_at: ctx.now(),
        })),
      ])
      .execute();
    const made = {
      message_id: card.id,
      conversation_id: spaceId,
      space_message_id: null,
      copy_client_id: uuidv4(),
      created_by: actorId,
    };
    await trx.insertInto('meeting_spaces').values(made).execute();
    return { ...made, told: [actorId, ...members] };
  });
  // Everyone in it has it among their conversations, once it's there to be read.
  if ('told' in claim)
    await ctx.bus.publish(claim.told, {
      type: 'conversation.created',
      data: { conversationId: claim.conversation_id },
    });
  if (claim.space_message_id)
    return { conversationId: claim.conversation_id, messageId: claim.space_message_id };
  const spaceId = claim.conversation_id;
  const originalId = claim.message_id;
  // The card's copy, made as any meeting card is (its title, its fields as they are), by whoever
  // made the space. Each step below gives the same result done twice. The space knows its copy
  // before the copy is accepted, and a meeting takes guests only once it's accepted, so nobody
  // can invite from the copy before the space says it's this one.
  // A meeting that repeats (R58) goes on in its space from this time: the copy is the same time
  // of the same series. Once this time is over its next is posted where it was, so the copy
  // doesn't repeat.
  const series = seriesOf(p);
  const goesOn = Boolean(series) && (endOf(p) ?? 0) > ctx.now().getTime();
  const { repeat: _, ...once } = p.fields ?? {};
  const { message: copy } = await sendMessage(
    ctx,
    claim.created_by ?? actorId,
    spaceId,
    {
      clientId: claim.copy_client_id,
      kind: 'kit',
      payload: { kit: 'meeting', fields: goesOn ? (p.fields ?? {}) : once },
    },
    // The copy tells nobody (the space's people see the card); the effects sweep leaves it be.
    series && goesOn
      ? { occurrence: { series, agreed: false }, effects: false }
      : { effects: false },
  );
  await ctx.db
    .updateTable('meeting_spaces')
    .set({ space_message_id: copy.id })
    .where('message_id', '=', originalId)
    .execute();
  const accepted = await ctx.db
    .updateTable('messages')
    .set({
      payload: sql`payload || ${JSON.stringify({ state: 'accepted', spaceOf: originalId })}::jsonb`,
      is_request: false,
    })
    .where('id', '=', copy.id)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirstOrThrow();
  const moved = await ctx.db
    .updateTable('messages')
    .set({
      payload: sql`payload || ${JSON.stringify({
        movedTo: { conversationId: spaceId, messageId: copy.id },
      })}::jsonb`,
    })
    .where('id', '=', originalId)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirstOrThrow();
  await queueMeetingStart(ctx, copy.id);
  await queueNextTime(ctx, copy.id);
  // Each side sees its card as it now is: the copy accepted in the space, and the original
  // saying where it went; and their own calendars follow it there (R96).
  const told: string[] = [];
  for (const [m, conversationId] of [
    [accepted, spaceId],
    [moved, moved.conversation_id],
  ] as const) {
    const everyone = (await participantsOf(ctx.db, conversationId)).map((x) => x.user_id);
    told.push(...everyone);
    for (const userId of everyone) {
      const [view] = await messageViews(ctx.db, [m], userId);
      if (view)
        await ctx.bus.publish([userId], {
          type: 'message.updated',
          data: { ...view, clientId: null },
        });
    }
  }
  await queueCalendarPush(ctx, told);
  return { conversationId: spaceId, messageId: copy.id };
}

/** When a meeting ends: its start and its length, else an hour; null without a start. */
function endOf(p: MeetingPayload): number | null {
  const at = p.fields?.start?.at ? Date.parse(p.fields.start.at) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const minutes = Number(p.fields?.durationMinutes);
  return at + (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60_000;
}

/**
 * A guest's own link to one time of a meeting, kept hashed (a new one each time they're asked
 * again, the last one ended), and the time's calendar invitation by mail.
 */
async function sendInvitation(
  ctx: AppContext,
  input: {
    inviter: { id: string | null; name: string };
    space: { conversationId: string; messageId: string };
    guest: { id: string; name: string; email: string };
    p: MeetingPayload;
  },
): Promise<void> {
  const mail = ctx.mail;
  if (!mail) return;
  const { inviter, space, guest, p } = input;
  const token = newToken('cmg');
  await ctx.db
    .insertInto('meeting_guests')
    .values({
      id: uuidv7(),
      space_message_id: space.messageId,
      user_id: guest.id,
      invited_by: inviter.id,
      token_hash: hashToken(token),
    })
    .onConflict((oc) =>
      oc.columns(['space_message_id', 'user_id']).doUpdateSet({
        token_hash: hashToken(token),
        invited_by: inviter.id,
        revoked_at: null,
      }),
    )
    .execute();

  const start = new Date(String(p.fields?.start?.at));
  const end = new Date(endOf(p) ?? start.getTime() + 60 * 60_000);
  const title = String(p.title || p.fields?.title || 'Meeting').slice(0, 120);
  const link = `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/j/${token}`;
  const sender = invitationSender(ctx.config, inviter.name);
  const ics = buildInvitation({
    method: 'REQUEST',
    // A time of a series is one event, the same as the feed's (R58).
    uid: meetingUid(space.messageId, seriesOf(p)),
    sequence: 0,
    now: ctx.now(),
    start,
    end,
    summary: title,
    description: `${inviter.name} invited you. Join: ${link}`,
    location: 'Caime',
    url: link,
    organizer: { name: inviter.name, email: sender.address },
    attendee: { name: guest.name, email: guest.email },
  });
  ctx.defer('email.invitation', () =>
    mail.send({
      to: guest.email,
      kind: 'invitation',
      ...(sender.header ? { from: sender.header, replyTo: sender.header } : {}),
      subject: `Invitation: ${title}`,
      text: [
        // From Cai's own address, Cai says who it is and whom it writes for first (R87).
        ...(sender.header ? [caiIntroduction(guest.name, inviter.name), ''] : []),
        `${inviter.name} invited you to "${title}" on Caime, ${start.toISOString().replace('T', ' ').slice(0, 16)} UTC.`,
        '',
        `Join from this link (it's yours, keep it to yourself): ${link}`,
        '',
        'No account needed. If you were not expecting this, you can ignore it.',
      ].join('\n'),
      icalEvent: { method: 'REQUEST', content: ics },
    }),
  );
}

/**
 * Invites someone by address to a meeting (R84): its space, made the first time; the person, a
 * provisional one when the address has no account (one with an account is asked, as any message
 * request is, never added outright); their own link; and a calendar invitation by mail.
 */
export async function inviteGuest(
  ctx: AppContext,
  actorId: string,
  messageId: string,
  input: { email: string; name?: string | null },
): Promise<{ conversationId: string; messageId: string }> {
  if (!ctx.mail) throw mailUnavailable();
  const email = input.email.trim().toLowerCase();
  if (!ADDRESS.test(email) || email.length > 254)
    throw badRequest(tr('That isn’t an email address.'));
  const card = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (!card) throw notFound(tr('That message'));
  const { conversation } = await membership(ctx, actorId, card.conversation_id);
  if (conversation.privacy_class !== 'standard' || !['direct', 'group'].includes(conversation.kind))
    throw forbidden(tr('Guests join meetings agreed in a chat or a group.'));
  const actor = await ctx.db
    .selectFrom('users')
    .select(['display_name', 'email', 'birth_date', 'time_zone'])
    .where('id', '=', actorId)
    .executeTakeFirstOrThrow();
  // Under 18 (R29): never someone a stranger to them, by their hand.
  if (minorOf(actor, ctx.now())) throw forbidden(tr('Guests are invited by people 18 or over.'));
  if (actor.email?.toLowerCase() === email) throw badRequest(tr('That’s your own address.'));
  ctx.limiter.hit(`guests:${actorId}`, ctx.config.isTest ? 1000 : 30, 60 * 60_000);
  const p = meetingOk(ctx, card);

  const name = (input.name?.trim() || email.split('@')[0] || email).slice(0, 80);
  // Under 18 (R29): a guest is a stranger to everyone in the meeting, so a meeting with someone
  // under 18 in it, or in its space, takes none, said without saying who.
  const held = await spaceRowOf(ctx.db, card.id);
  const around = await participantsOf(ctx.db, held?.conversation_id ?? card.conversation_id);
  if (
    await anyMinor(
      ctx.db,
      around.map((x) => x.user_id),
      ctx.now(),
    )
  )
    throw noGuestsHere();
  const person = await personForAddress(ctx, email, name);
  // An address that may not be asked (gone, suspended, blocked either way, or someone on Caime a
  // message request couldn't reach): nothing is sent, and nothing says so (an invitation never
  // tells whether an address is on Caime).
  const reachable = person && (await mayBeAsked(ctx, actorId, person));
  const space = await spaceFor(ctx, actorId, card, p);
  if (!reachable || !person) return space;

  await ctx.db.transaction().execute(async (trx) => {
    // Under the lock the members route takes, so nobody joins meanwhile past the limit or under 18.
    await lockConversation(trx, space.conversationId);
    const inSpace = await participantsOf(trx, space.conversationId);
    if (inSpace.some((x) => x.user_id === person.id)) return;
    if (inSpace.length >= SPACE_MAX) throw badRequest(tr('A meeting holds eight people at most.'));
    if (
      await anyMinor(
        trx,
        inSpace.map((x) => x.user_id),
        ctx.now(),
      )
    )
      throw noGuestsHere();
    await trx
      .insertInto('participants')
      .values({
        conversation_id: space.conversationId,
        user_id: person.id,
        role: 'member',
        joined_at: ctx.now(),
        // Someone on Caime is asked, as any request is (PRD §55); a guest just comes.
        request_state: person.kind === 'human' ? 'pending' : null,
      })
      .execute();
  });
  await sendInvitation(ctx, {
    inviter: { id: actorId, name: actor.display_name },
    space,
    guest: { id: person.id, name: person.display_name, email },
    p,
  });
  return space;
}

/**
 * A meeting that repeats in its space (R58): each new time asks the guests of the time before
 * again, each with a new link of their own and the new time's invitation, from whoever asked
 * them (else whoever posted it). Those who left the space, are gone or suspended aren't asked.
 * Without mail, nobody is: their links went with the time before.
 */
async function askGuestsAgain(ctx: AppContext, posted: Message, from: Message): Promise<void> {
  if (!ctx.mail) return;
  const guests = await ctx.db
    .selectFrom('meeting_guests as g')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .innerJoin('participants as p', (j) =>
      j
        .onRef('p.user_id', '=', 'g.user_id')
        .on('p.conversation_id', '=', posted.conversation_id)
        .on('p.left_at', 'is', null),
    )
    .leftJoin('users as inviter', 'inviter.id', 'g.invited_by')
    .select([
      'g.user_id',
      'g.invited_by',
      'u.display_name',
      'u.email',
      'inviter.display_name as inviter_name',
    ])
    .where('g.space_message_id', '=', from.id)
    .where('g.revoked_at', 'is', null)
    .where('u.deleted_at', 'is', null)
    .where('u.suspended_at', 'is', null)
    .execute();
  if (!guests.length) return;
  const poster = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', posted.sender_id ?? '')
    .executeTakeFirst();
  const p = (posted.payload ?? {}) as MeetingPayload;
  for (const g of guests) {
    if (!g.email) continue;
    await sendInvitation(ctx, {
      inviter: g.inviter_name
        ? { id: g.invited_by, name: g.inviter_name }
        : { id: posted.sender_id, name: poster?.display_name ?? 'Caime' },
      space: { conversationId: posted.conversation_id, messageId: posted.id },
      guest: { id: g.user_id, name: g.display_name, email: g.email },
      p,
    });
  }
}

export function registerGuestsAgain(): void {
  onOccurrencePosted(askGuestsAgain);
}
