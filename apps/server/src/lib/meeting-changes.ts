/**
 * A meeting that changes, and everyone's own answer to it (R123). Its organizer (who asked for it
 * as it stands: core `askedBy`; the team, for one the team sent; the group's owner or admins once
 * the organizer has left) changes it from the card (`changeMeeting`): a change to when or where
 * asks everyone again (its round and calendar sequence one on, back to asking, the line that asks,
 * the update by mail and to guests), a change to what tells them and keeps every answer. A time
 * of a series changes alone, or with every time after, which counts the series again from it
 * (`series.base`), so nothing ahead is rewritten. In a group short of a crowd each person answers
 * for themselves (`answerMeeting`), kept on the card for the round it answers; the card is on
 * once anyone says yes, as before, and its organizer alone hears each answer. Readers that hold
 * time leave a meeting out for whoever said they won't go (`cardsAhead`, the brief, "Starting
 * now"). The conversation's top line is `nextCardIn`.
 */

import { askedBy, kitHeadline, type MessageView, prepareKitFields } from '@caime/core';
import type { NextCardView } from '@caime/core/api';
import { onClock } from '@caime/core/card-clock';
import { formatWhenAt } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { safeLocale } from '@caime/core/locale';
import { notByMail, notByMailText } from '@caime/core/mail';
import {
  answersKept,
  CHANGE_SCOPES,
  type ChangeBlock,
  type ChangeScope,
  changeBlock,
  type MeetingAnswerEntry,
  meetingChange,
  roundOf,
  SERIES_ONLY,
  stateByAnswers,
} from '@caime/core/meeting-changes';
import { cardEndMs, heldOnCaime, JOIN_LATE_MS } from '@caime/core/meetings';
import { canEditConversation } from '@caime/core/permissions';
import { isRepeat, repeatsIn } from '@caime/core/repeat';
import { dayIn, type MeetingSeries, seriesOf } from '@caime/core/series';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import type { CustomerMask } from './business';
import { queueCalendarPush } from './calendar-push';
import { afterCardMove } from './card-moves';
import { recordMove } from './date-moves';
import { badRequest } from './errors';
import { askAgain } from './kit-moves';
import { cardStartAt } from './kits';
import { queueCardUpdate } from './mail-out';
import { askGuestsForTime } from './meeting-guests';
import { queueNextTime } from './meeting-series';
import { messageViews, participantsOf } from './messages';
import { assertNotesAllowed } from './notes-allowed';
import { notify } from './notify';
import { cardsAhead } from './upcoming';

type MeetingPayload = {
  kit?: unknown;
  label?: string;
  title?: string;
  state?: string;
  fields?: Record<string, unknown>;
  history?: Array<{ state: string; by: string; at: string }>;
  proposedBy?: string;
  sequence?: number;
  round?: number;
  /** Every change, for whoever has it by mail (a later stamp, RFC 5546 §2.1.5). */
  revision?: number;
  answers?: Record<string, MeetingAnswerEntry>;
  series?: unknown;
  /** A time of a series changed alone: what the series itself says, for the times after it. */
  seriesFields?: Record<string, unknown>;
  invitation?: unknown;
  movedTo?: unknown;
  repeatStopped?: unknown;
};

/** Who a meeting's people are here: its humans still in it, and whether each answers alone. */
export async function meetingPeople(
  ctx: Pick<AppContext, 'db'>,
  conversationId: string,
): Promise<{ kind: string; people: Array<{ id: string; role: string }>; kept: boolean }> {
  const [conversation, people] = await Promise.all([
    ctx.db
      .selectFrom('conversations')
      .select('kind')
      .where('id', '=', conversationId)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.user_id as id', 'p.role'])
      .where('p.conversation_id', '=', conversationId)
      .where('p.left_at', 'is', null)
      .where('u.kind', '=', 'human')
      .execute(),
  ]);
  return {
    kind: conversation.kind,
    people,
    kept: answersKept(conversation.kind, people.length),
  };
}

/** Whether a conversation's meetings keep everyone's own answer, counted rather than listed. */
async function keepsAnswers(ctx: Pick<AppContext, 'db'>, conversationId: string): Promise<boolean> {
  const [conversation, people] = await Promise.all([
    ctx.db
      .selectFrom('conversations')
      .select('kind')
      .where('id', '=', conversationId)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('p.conversation_id', '=', conversationId)
      .where('p.left_at', 'is', null)
      .where('u.kind', '=', 'human')
      .executeTakeFirstOrThrow(),
  ]);
  return answersKept(conversation.kind, Number(people.n));
}

/** Its organizer: who asked for it as it stands (its sender, or who gave it its time since). */
export function organizerOf(m: Pick<Message, 'payload' | 'sender_id'>): string | null {
  return askedBy((m.payload ?? {}) as { proposedBy?: string }, m.sender_id);
}

/**
 * Whether this person may change the meeting: its organizer; for a card the team sent, anyone on
 * the team; in a group whose organizer has left, its owner or admins.
 */
export function mayChangeMeeting(
  m: Pick<Message, 'payload' | 'sender_id'>,
  actorId: string,
  here: { kind: string; people: Array<{ id: string; role: string }> },
  business: CustomerMask | null,
): boolean {
  const organizer = organizerOf(m);
  if (organizer === actorId) return true;
  if (business)
    return Boolean(
      organizer && organizer !== business.customerId && actorId !== business.customerId,
    );
  if (here.kind !== 'group') return false;
  if (here.people.some((p) => p.id === organizer)) return false;
  const role = here.people.find((p) => p.id === actorId)?.role;
  return canEditConversation(here.kind, role ?? null);
}

function blockSaid(block: ChangeBlock): string {
  switch (block) {
    case 'kind':
      return tr('Only a meeting changes this way.');
    case 'invitation':
      return tr('It’s their calendar’s meeting: only they can move it.');
    case 'moved':
      return tr('It has its own space now: change it there.');
    case 'over':
      return tr('That one is over.');
    default:
      return tr('A meeting called off or declined doesn’t change. Propose another.');
  }
}

function endOf(fields: Record<string, unknown> | undefined): number | null {
  const at = Date.parse(String((fields?.start as { at?: unknown } | undefined)?.at ?? ''));
  return Number.isFinite(at) ? cardEndMs(at, { durationMinutes: fields?.durationMinutes }) : null;
}

/**
 * The meeting changed by its organizer (R123): `raw` is its fields as they should be now, checked
 * as a new card's are. 'conflict' when someone moved it first. Check `mayChangeMeeting` before.
 */
export async function changeMeeting(
  ctx: AppContext,
  m: Message,
  input: {
    actorId: string;
    raw: Record<string, unknown>;
    scope?: ChangeScope;
    business: CustomerMask | null;
    here: { kind: string; people: Array<{ id: string; role: string }> };
  },
): Promise<MessageView | 'conflict'> {
  const p = (m.payload ?? {}) as MeetingPayload;
  const now = ctx.now();
  if (m.kind !== 'kit' || m.deleted_at) throw badRequest(blockSaid('kind'));
  const block = changeBlock(p, endOf(p.fields), now);
  if (block) throw badRequest(blockSaid(block));
  const checked = prepareKitFields('meeting', input.raw);
  if (!checked.ok) throw badRequest(checked.error);
  const before = p.fields ?? {};
  const fields = checked.fields;
  // A time keeps its clock (R119): the zone it was set on, else the series', else the actor's.
  const actor = await ctx.db
    .selectFrom('users')
    .select(['time_zone', 'locale', 'workweek'])
    .where('id', '=', input.actorId)
    .executeTakeFirstOrThrow();
  const series = seriesOf(p);
  const zone =
    ((before.start as { zone?: unknown } | undefined)?.zone as string | undefined) ??
    series?.zone ??
    (actor.time_zone || 'UTC');
  if (fields.start) fields.start = onClock(fields.start as { at: string }, zone);
  const change = meetingChange(before, fields);
  if (!change.fields.length) {
    const [view] = await messageViews(ctx.db, [m], input.actorId);
    return view!;
  }
  // A new time is ahead of now.
  if (change.fields.includes('start')) {
    const at = Date.parse(String((fields.start as { at?: unknown }).at));
    if (!(at > now.getTime())) throw badRequest(tr('That time has passed. Choose a later one.'));
  }
  // How it repeats, as a new card's is checked (R58): in a chat or a group, never past its start.
  const repeating = isRepeat(fields.repeat);
  if (repeating && !repeatsIn(input.here.kind))
    throw badRequest(tr('A meeting repeats only in a chat or a group.'));
  if (fields.repeatUntil !== undefined && !repeating)
    throw badRequest(tr('Until is for a meeting that repeats.'));
  if (
    repeating &&
    typeof fields.repeatUntil === 'string' &&
    fields.repeatUntil < dayIn(new Date(String((fields.start as { at: string }).at)), zone)
  )
    throw badRequest(tr('A meeting can’t stop repeating before it starts.'));
  // Someone reached by email reads only what a mail carries (M16 F3), as for a new card.
  if (input.here.kind === 'direct') {
    const unmailable = notByMail('kit', { kit: 'meeting', fields }, true);
    if (unmailable) {
      const other = input.here.people.find((x) => x.id !== m.sender_id);
      const reached = other
        ? await ctx.db
            .selectFrom('users')
            .select('kind')
            .where('id', '=', other.id)
            .executeTakeFirst()
        : null;
      if (reached?.kind === 'provisional') throw badRequest(notByMailText(unmailable));
    }
  }
  // Cai takes notes only in a meeting held on Caime, where it may (M16 F7c), checked again when
  // it's turned on or the meeting moves.
  if (
    fields.notes !== undefined &&
    (change.fields.includes('notes') || change.fields.includes('place'))
  ) {
    if (!heldOnCaime({ kit: 'meeting', place: fields.place }, input.here.kind))
      throw badRequest(tr('Cai takes notes only in a meeting held on Caime.'));
    await assertNotesAllowed(ctx, {
      conversationId: m.conversation_id,
      askerId: input.actorId,
      people: input.here.people.map((x) => x.id),
      where: 'conversation',
    });
  }
  // A time of a series: for this time alone, or for it and every time after.
  const isSeries = Boolean(series && isRepeat(before.repeat));
  const scope: ChangeScope | null = isSeries ? (input.scope ?? null) : null;
  if ((isSeries && !scope) || (scope && !CHANGE_SCOPES.includes(scope)))
    throw badRequest(tr('Say whether it’s for this time or every time after.'));
  if (scope === 'this' && change.fields.some((f) => SERIES_ONLY.includes(f)))
    throw badRequest(
      tr('How it repeats changes for every time ahead: choose this time and every time after.'),
    );
  const asks = change.asks;
  const startChanged = change.fields.includes('start');
  const repeatChanged = change.fields.includes('repeat') || change.fields.includes('repeatUntil');

  const row = await ctx.db.transaction().execute(async (trx) => {
    const now2 = await trx
      .selectFrom('messages')
      .select(['deleted_at', 'payload'])
      .where('id', '=', m.id)
      .forUpdate()
      .executeTakeFirst();
    const card = (now2?.payload ?? {}) as MeetingPayload;
    if (
      !now2 ||
      now2.deleted_at ||
      card.state !== p.state ||
      (card.sequence ?? 0) !== (p.sequence ?? 0)
    )
      return null;
    const next: MeetingPayload = {
      fields,
      title: kitHeadline('meeting', fields, safeLocale(actor.locale)),
      revision: (card.revision ?? 0) + 1,
    };
    // When or where asks again (RFC 5545 §3.8.7.4; where, R123): everyone answers the new one.
    if (asks) {
      next.state = 'proposed';
      next.proposedBy = input.actorId;
      next.sequence = (card.sequence ?? 0) + 1;
      next.round = roundOf(card) + 1;
      next.history = [
        ...(card.history ?? []),
        { state: 'proposed', by: input.actorId, at: now.toISOString() },
      ].slice(-50);
    }
    if (scope === 'this') {
      // The series keeps saying what it said, for the times after this one.
      next.seriesFields = card.seriesFields ?? before;
    } else if (isSeries && scope === 'after') {
      next.seriesFields = undefined;
      if (!repeating) {
        // No longer repeating: the series ends with this time ("Stop repeating", R58).
        next.repeatStopped = { by: input.actorId, at: now.toISOString() };
      } else if (startChanged || repeatChanged) {
        // Counted again from this time, so every time ahead follows and keeps its count.
        const s = series as MeetingSeries;
        next.series = {
          ...s,
          base: s.n,
          firstAt: String((fields.start as { at: string }).at),
          ...(fields.repeat === 'workday'
            ? {
                days: (s.days?.length ? s.days : [...(actor.workweek ?? [1, 2, 3, 4, 5])]).sort(
                  (a, b) => a - b,
                ),
              }
            : {}),
        };
      }
    } else if (repeating && !isSeries) {
      // A meeting held once that now repeats: its series begins with it, counted from it.
      next.series = series
        ? { ...series, base: series.n, firstAt: String((fields.start as { at: string }).at) }
        : {
            id: m.id,
            n: 0,
            firstAt: String((fields.start as { at: string }).at),
            zone,
            ...(fields.repeat === 'workday' && actor.workweek?.length
              ? { days: [...actor.workweek].sort((a, b) => a - b) }
              : {}),
          };
    }
    const changed = await trx
      .updateTable('messages')
      .set({
        payload: sql`(payload - 'seriesFields') || ${JSON.stringify(next)}::jsonb`,
        card_start_at: cardStartAt({ kit: 'meeting', fields }),
        edited_at: now,
      })
      .where('id', '=', m.id)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
    // Its history (R119 level 2): the plan moved, by its organizer.
    if (startChanged) {
      const had = (before.start as { at?: unknown } | undefined)?.at;
      await recordMove(
        trx,
        {
          of: { messageId: m.id },
          field: 'start',
          value: { at: new Date(String((fields.start as { at: string }).at)) },
          previous: { at: typeof had === 'string' ? new Date(had) : null },
          reason: 'replan',
          source: 'person',
          byId: input.actorId,
        },
        now,
      );
    }
    return changed;
  });
  if (!row) return 'conflict';
  const from = p.state ?? 'proposed';
  const to = (row.payload as MeetingPayload).state ?? from;
  const view = await afterCardMove(ctx, row, {
    from,
    to,
    actorId: input.actorId,
    business: input.business,
    label:
      startChanged || change.fields.includes('durationMinutes') || repeatChanged
        ? msg('New time')
        : change.fields.includes('place')
          ? msg('New place')
          : msg('Changed'),
    asks,
  });
  // Asked again where the others look, and wherever it went by mail, and of its guests.
  if (asks)
    await askAgain(
      ctx,
      row,
      input.actorId,
      change.fields.includes('place') && !startChanged ? 'meeting_place_changed' : 'meeting_moved',
    );
  await queueCardUpdate(ctx, row, input.actorId);
  if (asks) await askGuestsForTime(ctx, row);
  await queueNextTime(ctx, row.id);
  return view;
}

/**
 * One person's own answer to a group's meeting (R123): going or not, under the card's lock, the
 * card on at the first yes and declined once everyone else said no. Its organizer alone is told.
 */
export async function answerMeeting(
  ctx: AppContext,
  m: Message,
  input: { actorId: string; going: boolean; suggest: Date | null },
): Promise<MessageView | 'conflict'> {
  const p = (m.payload ?? {}) as MeetingPayload;
  const now = ctx.now();
  if (m.kind !== 'kit' || m.deleted_at || p.kit !== 'meeting')
    throw badRequest(tr('Only a meeting is answered this way.'));
  const here = await meetingPeople(ctx, m.conversation_id);
  if (!here.kept) throw badRequest(tr('Here, accept or decline it on the card.'));
  const organizer = organizerOf(m);
  if (organizer === input.actorId) throw badRequest(tr('It’s yours: change it or call it off.'));
  if (p.state !== 'proposed' && p.state !== 'accepted' && p.state !== 'declined')
    throw badRequest(blockSaid('state'));
  if (p.invitation || p.movedTo) throw badRequest(blockSaid(p.invitation ? 'invitation' : 'moved'));
  const end = endOf(p.fields);
  if (end !== null && end <= now.getTime()) throw badRequest(blockSaid('over'));
  if (input.suggest && (input.going || input.suggest.getTime() <= now.getTime()))
    throw badRequest(tr('Suggest a time ahead, with Not going.'));
  const others = here.people.map((x) => x.id).filter((id) => id !== organizer);
  const row = await ctx.db.transaction().execute(async (trx) => {
    const now2 = await trx
      .selectFrom('messages')
      .select(['deleted_at', 'payload'])
      .where('id', '=', m.id)
      .forUpdate()
      .executeTakeFirst();
    const card = (now2?.payload ?? {}) as MeetingPayload;
    if (!now2 || now2.deleted_at || roundOf(card) !== roundOf(p)) return null;
    const entry: MeetingAnswerEntry = {
      a: input.going ? 'y' : 'n',
      r: roundOf(card),
      at: now.toISOString(),
      ...(input.suggest ? { s: input.suggest.toISOString() } : {}),
    };
    const answers = { ...(card.answers ?? {}), [input.actorId]: entry };
    const state = stateByAnswers({ answers, round: card.round }, others);
    const moved = state !== card.state;
    const next: MeetingPayload = {
      answers,
      ...(moved
        ? {
            state,
            history: [
              ...(card.history ?? []),
              { state, by: input.actorId, at: now.toISOString() },
            ].slice(-50),
          }
        : {}),
    };
    return trx
      .updateTable('messages')
      .set({ payload: sql`payload || ${JSON.stringify(next)}::jsonb` })
      .where('id', '=', m.id)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
  });
  if (!row) return 'conflict';
  const after = (row.payload ?? {}) as MeetingPayload;
  const tell = organizer ? [organizer] : [];
  if (after.state !== p.state) {
    // On, off or asked again: what follows any move, told to its organizer alone.
    const view = await afterCardMove(ctx, row, {
      from: p.state ?? 'proposed',
      to: after.state ?? 'proposed',
      actorId: input.actorId,
      business: null,
      label: input.going ? msg('Going') : msg('Not going'),
      tell,
    });
    await queueNextTime(ctx, row.id);
    return view;
  }
  const members = (await participantsOf(ctx.db, m.conversation_id)).map((x) => x.user_id);
  const [view] = await messageViews(ctx.db, [row], input.actorId);
  await ctx.bus.publish(members, { type: 'message.updated', data: { ...view!, clientId: null } });
  // Their own calendars follow what they said (R96).
  await queueCalendarPush(ctx, [input.actorId]);
  if (organizer)
    await tellOrganizer(ctx, row, organizer, input.actorId, input.going, input.suggest);
  return view!;
}

/** An answer, to whoever organized it: who, going or not, and a time they suggest. */
async function tellOrganizer(
  ctx: AppContext,
  m: Message,
  organizer: string,
  actorId: string,
  going: boolean,
  suggest: Date | null,
) {
  const [who, them] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', actorId)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('users')
      .select(['time_zone', 'locale'])
      .where('id', '=', organizer)
      .executeTakeFirstOrThrow(),
  ]);
  const p = (m.payload ?? {}) as MeetingPayload;
  await notify(ctx, {
    userId: organizer,
    kind: 'kit',
    level: suggest ? 'attention' : 'activity',
    title: () =>
      suggest
        ? tr('{name} suggests {when}', {
            name: who.display_name,
            when: formatWhenAt(
              suggest.toISOString(),
              true,
              ctx.now(),
              them.time_zone || 'UTC',
              safeLocale(them.locale),
            ),
          })
        : `${who.display_name}: ${going ? tr('Going') : tr('Not going')}`,
    body: () => `${tr('Meeting')} · ${p.title ?? ''}`,
    groupKey: `kit:${m.id}:answers`,
    data: { conversationId: m.conversation_id, messageId: m.id },
  });
}

/**
 * The meeting or appointment next in a conversation for this reader (R123): the soonest not yet
 * over (Join stays open half an hour past its end), looked ahead past a series' latest time. One
 * read of `card_start_at` a conversation opened, never one a message.
 */
export async function nextCardIn(
  ctx: AppContext,
  userId: string,
  conversationId: string,
): Promise<NextCardView | null> {
  const now = ctx.now();
  const ahead = await cardsAhead(ctx, userId, {
    from: new Date(now.getTime() - 86_400_000),
    until: new Date(now.getTime() + 120 * 86_400_000),
    limit: 8,
    conversationIds: [conversationId],
    series: { now },
    keepDeclined: true,
  });
  for (const c of ahead) {
    const end = cardEndMs(c.at.getTime(), {
      durationMinutes: c.durationMinutes,
      booking: c.booking,
    });
    if (end + JOIN_LATE_MS <= now.getTime()) continue;
    // Who's going is said where each person answers for themselves: its organizer and every yes.
    const counted =
      c.kit === 'meeting' && !c.projected && (await keepsAnswers(ctx, conversationId));
    return {
      messageId: c.messageId,
      conversationId: c.conversationId,
      seq: c.seq,
      kit: c.kit,
      title: c.title,
      at: c.at.toISOString(),
      hasTime: c.hasTime,
      durationMinutes: c.durationMinutes,
      place: c.place,
      agreed: c.agreed,
      endAt: new Date(end).toISOString(),
      heldHere: c.heldHere,
      projected: c.projected,
      going: counted ? c.going + 1 : null,
      answer: c.projected ? null : c.answer,
    };
  }
  return null;
}
