/**
 * What Cai or a friend is asked to do for someone in Caime (M16 G14, R110): write to one of their
 * people, call someone, propose a meeting, find something. Cai never sends or rings anything
 * itself: the line that offers it carries what it would do (`payload.offer`, core
 * `CaiOfferPayload`), shown as it will go and to whom, and `carryOutOffer` does it as the person,
 * once, when they tap, through the paths the app uses (a message and a meeting card through
 * `postAs`, so `sendMessage`'s rules hold: a block, a request, a closed organization); a call and
 * a search start on their device. Whom it's for is one of their people, found as Cai finds anyone
 * it's asked about (`peopleMeant`). When two share the name, or the words or the time are
 * missing, Cai asks, and the line that asks carries what it waits for (`payload.awaiting`), so
 * the next words finish it (`answerAwaited`), by the rules, within the hour.
 */
import {
  type ActAsk,
  firstFutureWhen,
  formatClock,
  formatWhenAt,
  listed,
  messageWords,
  parseWhen,
  safeLocale,
  systemAccountOf,
  tr,
  truncate,
  zonedParts,
  zonedTimeToUtc,
} from '@caime/core';
import type { CaiOfferPayload, OfferDoneResponse } from '@caime/core/api';
import { foldForFind } from '@caime/core/fold';
import { cardEndMs } from '@caime/core/meetings';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { assertCanWrite } from './blocks';
import { customerMask } from './business';
import { membership } from './conversation-views';
import { AppError, badRequest, notFound } from './errors';
import { clashFor } from './free-time';
import { retimeCard, retimeRefusal } from './kit-moves';
import { messageViews, participantsOf } from './messages';
import { holdsWhole, type NamedPerson, peopleMeant, peopleNamed } from './people-named';
import { postAs } from './post-as';
import { pairKey } from './relations';
import { type CardAhead, cardsAhead } from './upcoming';

/** An act as it was asked, by the rules or as Cai's model read it. */
export type Act = ActAsk & {
  /** A meeting's length, when the model was told one. */
  minutes?: number | null;
};

/** Who's asking: the person in their chat with Cai or a friend. */
interface Asker {
  id: string;
  time_zone: string;
  locale: string;
}

/** What a line that asks is waiting for, so the person's next words can finish the act. */
interface Awaiting {
  act: Act;
  /** Whom it's for, once that's known. */
  to?: NamedPerson;
  /** The people of that name, to choose between. */
  choices?: NamedPerson[];
  /** A move's meetings to choose between, by their card's id, as listed (M17 I7). */
  cards?: string[];
  /** A move's meeting, once that's known, waiting for the time it moves to. */
  card?: string;
}

/** A meeting's lengths, as its card offers them; half an hour unless it was said otherwise. */
const MEETING_MINUTES = [15, 30, 45, 60, 90];
/** How long a question of Cai's waits for its answer. */
const AWAIT_MS = 60 * 60_000;
/** How far ahead a move looks for the meeting it names (M17 I7). */
const MOVE_AHEAD_MS = 14 * 86_400_000;
/** At most this many meetings are listed to choose between. */
const MOVE_CHOICES = 5;

/**
 * Whom an act names among the person's people: the name as the rules took it with a word or two
 * more where those were a surname ("tell Sami Ali I'm late"), only for a name held whole; then
 * the name as typed, or the relationship it says ("my dentist"); then, in Arabic, without a
 * joined "ل" ("لسامي"). One found is them; more, the names to ask between; none, nobody.
 */
async function whoIs(
  ctx: AppContext,
  meId: string,
  act: Act,
): Promise<{ person: NamedPerson; words: string | null } | { several: NamedPerson[] } | null> {
  const typed = act.who?.trim() ?? '';
  if (!typed) return null;
  let several: NamedPerson[] = [];
  const more = act.kind === 'message' && act.words ? act.words.split(' ') : [];
  for (let n = Math.min(2, more.length - 1); n >= 1; n--) {
    const found = await peopleNamed(ctx, meId, `${typed} ${more.slice(0, n).join(' ')}`, {
      whole: true,
    });
    if (found.length === 1) return { person: found[0]!, words: more.slice(n).join(' ') };
    if (found.length > 1 && !several.length) several = found;
  }
  const names = [typed, ...(act.lang === 'ar' && /^ل.{2,}/u.test(typed) ? [typed.slice(1)] : [])];
  for (const name of names) {
    const found = await peopleMeant(ctx, meId, name);
    if (found.length === 1) return { person: found[0]!, words: act.words };
    if (found.length > 1 && !several.length) several = found;
  }
  return several.length ? { several } : null;
}

/** Their one-to-one chat with someone, if there is one. */
async function chatWith(ctx: AppContext, meId: string, otherId: string): Promise<string | null> {
  const row = await ctx.db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', 'p.conversation_id', 'c.id')
    .select('c.id')
    .where('c.direct_key', '=', pairKey(meId, otherId).key)
    .where('c.is_general', '=', true)
    .where('p.user_id', '=', meId)
    .where('p.left_at', 'is', null)
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * Cai's line for what it was asked to do: what it would do, on its line as an offer, or the one
 * thing it needs to know first, asked; or, when it knows nobody by that name, that it doesn't.
 * `person` is whom it's for when that's settled already (the answer to "Which one?").
 */
export async function offerAct(
  ctx: AppContext,
  accountId: string,
  conversationId: string,
  me: Asker,
  act: Act,
  person?: NamedPerson,
  /** A move's meeting, once chosen (M17 I7). */
  chosen?: string,
): Promise<void> {
  const say = (line: string, payload?: { offer: CaiOfferPayload } | { awaiting: Awaiting }) =>
    postAs(
      ctx,
      accountId,
      conversationId,
      payload ? { kind: 'text', body: line, payload } : line,
      payload ? { serverPayload: true } : {},
    );
  if (act.kind === 'move') return offerMove(ctx, me, act, say, person, chosen);
  if (act.kind === 'find') {
    const query = truncate((act.words ?? '').trim(), 200);
    return void (await say(tr('Let’s look for “{query}” in your conversations.', { query }), {
      offer: { kind: 'find', query },
    }));
  }
  let words = act.words;
  if (!person) {
    const named = await whoIs(ctx, me.id, act);
    if (!named)
      return void (await say(
        tr('I don’t know who “{name}” is among your people.', { name: act.who ?? '' }),
      ));
    if ('several' in named)
      return void (await say(
        tr('Which one do you mean: {names}?', { names: listed(named.several.map((p) => p.name)) }),
        { awaiting: { act, choices: named.several } },
      ));
    person = named.person;
    // A surname taken off the words leaves them to read again ("Ali that I'm late").
    if (named.words !== act.words)
      words = named.words ? messageWords(named.words, act.lang) || null : null;
  }
  const to = { id: person.id, name: person.name };
  const chat = await chatWith(ctx, me.id, person.id);
  switch (act.kind) {
    case 'call':
      if (!chat)
        return void (await say(
          tr(
            'You and {name} have no chat yet. Once you’ve written to {name}, you can call from it.',
            {
              name: person.name,
            },
          ),
        ));
      return void (await say(
        act.video
          ? tr('Ready when you are: a video call with {name}.', { name: person.name })
          : tr('Ready when you are: a call with {name}.', { name: person.name }),
        { offer: { kind: 'call', to, conversationId: chat, video: act.video } },
      ));
    case 'message': {
      const text = truncate((words ?? '').trim(), 4000);
      if (!text)
        return void (await say(tr('What should I tell {name}?', { name: person.name }), {
          awaiting: { act, to },
        }));
      // The words under the line, as R68's follow-up shows them: what goes is what's read.
      return void (await say(
        `${tr('Here’s a message for {name}. Shall I send it?', { name: person.name })}\n\n${text}`,
        { offer: { kind: 'message', to, conversationId: chat, text } },
      ));
    }
    case 'meeting': {
      const locale = safeLocale(me.locale);
      const when = words
        ? firstFutureWhen(words, { now: ctx.now(), timeZone: me.time_zone, locale })
        : undefined;
      if (!when?.time)
        return void (await say(
          tr('When should the meeting with {name} be? A day and a time, like “tomorrow at 3”.', {
            name: person.name,
          }),
          { awaiting: { act: { ...act, words }, to } },
        ));
      const asked = act.minutes ?? 30;
      const minutes = MEETING_MINUTES.reduce((best, m) =>
        Math.abs(m - asked) < Math.abs(best - asked) ? m : best,
      );
      const title = act.title?.trim() ? truncate(act.title.trim(), 120) : null;
      const at = formatWhenAt(when.at, true, ctx.now(), me.time_zone, locale);
      // Their own time first (M17 I7): what already holds it is said, with the next free time.
      const clash = await clashFor(ctx, me, new Date(when.at), minutes);
      const heldBy = clash
        ? listed(clash.with.map((h) => h.title ?? tr('Busy in your calendar')))
        : '';
      const warning = !clash
        ? ''
        : clash.next
          ? tr('You have {what} then; {time} is free that day.', {
              what: heldBy,
              time: formatClock(clash.next.toISOString(), me.time_zone, locale),
            })
          : tr('You have {what} then, and nothing else is free that day.', { what: heldBy });
      const offered = title
        ? tr(
            'Here’s a meeting about “{title}” for you and {name}: {when}, on Caime. Shall I send it?',
            { title, name: person.name, when: at },
          )
        : tr('Here’s a meeting for you and {name}: {when}, on Caime. Shall I send it?', {
            name: person.name,
            when: at,
          });
      return void (await say(warning ? `${offered}\n\n${warning}` : offered, {
        offer: {
          kind: 'meeting',
          to,
          conversationId: chat,
          meeting: {
            title: title ?? tr('Meeting'),
            at: when.at,
            minutes,
            ...(clash?.next ? { instead: clash.next.toISOString() } : {}),
          },
        },
      }));
    }
  }
}

/** The locale the date reader takes an ask's times in: French's own, so "15h" reads alone. */
const readLocale = (act: Act, me: Asker) => (act.lang === 'fr' ? 'fr' : safeLocale(me.locale));

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Their meetings and appointments ahead that a move names (M17 I7), within two weeks: those
 * with whom it's with, then those at the time it names ("3pm" any day, "tomorrow 10am" that
 * one, "Thursday" that day) or called what it names; with neither, all of them.
 */
async function movable(
  ctx: AppContext,
  me: Asker,
  act: Act,
  withId: string | null,
  from: string | null,
): Promise<CardAhead[]> {
  const now = ctx.now();
  let cards = (
    await cardsAhead(ctx, me.id, {
      from: now,
      until: new Date(now.getTime() + MOVE_AHEAD_MS),
      limit: 100,
    })
  ).filter((c) => c.hasTime && !c.projected);
  if (withId && cards.length) {
    const rows = await ctx.db
      .selectFrom('participants')
      .select('conversation_id')
      .where('conversation_id', 'in', [...new Set(cards.map((c) => c.conversationId))])
      .where('user_id', '=', withId)
      .where('left_at', 'is', null)
      .execute();
    const theirs = new Set(rows.map((r) => r.conversation_id));
    cards = cards.filter((c) => theirs.has(c.conversationId));
  }
  const named = from?.trim();
  if (!named) return cards;
  const when = parseWhen(named, {
    now,
    timeZone: me.time_zone,
    locale: readLocale(act, me),
  })[0];
  if (!when) {
    const said = foldForFind(named);
    return cards.filter((c) => foldForFind(c.title).includes(said));
  }
  const minutes = when.time
    ? Number(when.time.slice(0, 2)) * 60 + Number(when.time.slice(3))
    : null;
  return cards.filter((c) => {
    const p = zonedParts(c.at, me.time_zone);
    if (!when.timeOnly && `${p.year}-${pad(p.month)}-${pad(p.day)}` !== when.date) return false;
    if (minutes === null) return true;
    // "3" may be three in the afternoon as much as in the morning.
    const at = p.hour * 60 + p.minute;
    return at === minutes || at === (minutes + 720) % 1440;
  });
}

/**
 * Where a meeting moves to, from the words said for it and its own time (M17 I7): a day and an
 * hour as said; an hour alone, on its own day ("move my 3pm to 5"); a day alone, at its own hour
 * ("to tomorrow"); null when the words name no time.
 */
function movedTo(words: string, cardAt: Date, act: Act, me: Asker, now: Date): Date | null {
  const said = /^\d{1,2}(?::\d{2})?$/u.test(words.trim()) ? `at ${words.trim()}` : words;
  const when = firstFutureWhen(said, { now, timeZone: me.time_zone, locale: readLocale(act, me) });
  if (!when) return null;
  if (when.time && !when.timeOnly) return new Date(when.at);
  const own = zonedParts(cardAt, me.time_zone);
  if (when.time) {
    const [hour = 0, minute = 0] = when.time.split(':').map(Number);
    return zonedTimeToUtc(
      { year: own.year, month: own.month, day: own.day, hour, minute },
      me.time_zone,
    );
  }
  const [year = own.year, month = own.month, day = own.day] = when.date.split('-').map(Number);
  return zonedTimeToUtc({ year, month, day, hour: own.hour, minute: own.minute }, me.time_zone);
}

/** Whom a card's other side is to the person: the organization to its customer, the one other person, else nobody named. */
async function otherSide(
  ctx: AppContext,
  meId: string,
  conversationId: string,
): Promise<string | null> {
  const mask = await customerMask(ctx.db, conversationId);
  if (mask && mask.customerId === meId) return mask.orgName || null;
  const others = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select('u.display_name')
    .where('p.conversation_id', '=', conversationId)
    .where('p.user_id', '<>', meId)
    .where('p.left_at', 'is', null)
    .where('u.kind', 'in', ['human', 'provisional'])
    .limit(2)
    .execute();
  return others.length === 1 ? (others[0]!.display_name ?? null) : null;
}

/**
 * Cai's line for "move my 3pm to tomorrow" (M17 I7): the meeting or appointment it names among
 * theirs ahead, asked between when several are, and the time it moves to, asked when none was
 * said; then another time suggested as F5 suggests one (back to asking the other side), offered
 * on the line and done on their tap, with what already holds that time said and the next free
 * time beside it. `person` is whom it's with once that's settled, `chosen` the card once chosen.
 */
async function offerMove(
  ctx: AppContext,
  me: Asker,
  act: Act,
  say: (
    line: string,
    payload?: { offer: CaiOfferPayload } | { awaiting: Awaiting },
  ) => Promise<unknown>,
  person?: NamedPerson,
  chosen?: string,
): Promise<void> {
  const now = ctx.now();
  const locale = safeLocale(me.locale);
  const at = (d: Date) => formatWhenAt(d.toISOString(), true, now, me.time_zone, locale);
  let withId = person?.id ?? null;
  if (!withId && act.who && !chosen) {
    const named = await whoIs(ctx, me.id, act);
    if (!named)
      return void (await say(
        tr('I don’t know who “{name}” is among your people.', { name: act.who }),
      ));
    if ('several' in named)
      return void (await say(
        tr('Which one do you mean: {names}?', { names: listed(named.several.map((p) => p.name)) }),
        { awaiting: { act, choices: named.several } },
      ));
    withId = named.person.id;
  }
  let cards = await movable(ctx, me, act, withId, chosen ? null : act.from);
  if (chosen) cards = cards.filter((c) => c.messageId === chosen);
  // "my dentist appointment": no meeting called that, so whom it's with ("my dentist").
  if (
    !cards.length &&
    !chosen &&
    !withId &&
    act.from &&
    !parseWhen(act.from, { now, timeZone: me.time_zone }).length
  ) {
    const found = await peopleMeant(ctx, me.id, act.from);
    if (found.length === 1) cards = await movable(ctx, me, act, found[0]!.id, null);
  }
  if (!cards.length)
    return void (await say(
      tr('I can’t find that among your meetings and appointments in the next two weeks.'),
    ));
  if (cards.length > 1) {
    const shown = cards.slice(0, MOVE_CHOICES);
    return void (await say(
      [
        tr('Which one do you mean?'),
        ...shown.map((c, i) => `${i + 1}. ${at(c.at)} · ${c.title}`),
      ].join('\n'),
      { awaiting: { act, cards: shown.map((c) => c.messageId) } },
    ));
  }
  const card = cards[0]!;
  const to = act.words?.trim() ? movedTo(act.words, card.at, act, me, now) : null;
  if (!to)
    return void (await say(
      tr('When should “{title}” move to? A day or a time, like “tomorrow at 3”.', {
        title: card.title,
      }),
      { awaiting: { act, card: card.messageId } },
    ));
  if (to.getTime() <= now.getTime())
    return void (await say(tr('That time has passed. Choose a later one.')));
  if (to.getTime() === card.at.getTime())
    return void (await say(tr('“{title}” is at that time already.', { title: card.title })));
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', card.messageId)
    .executeTakeFirst();
  const refused = m ? retimeRefusal(m, me.id) : tr('That message');
  if (refused) return void (await say(refused));
  const minutes = Math.round((cardEndMs(card.at.getTime(), card) - card.at.getTime()) / 60_000);
  // Their own time first: what already holds the new one is said, with the next free time.
  const clash = await clashFor(ctx, me, to, minutes, card.messageId);
  const heldBy = clash ? listed(clash.with.map((h) => h.title ?? tr('Busy in your calendar'))) : '';
  const warning = !clash
    ? ''
    : clash.next
      ? tr('You have {what} then; {time} is free that day.', {
          what: heldBy,
          time: formatClock(clash.next.toISOString(), me.time_zone, locale),
        })
      : tr('You have {what} then, and nothing else is free that day.', { what: heldBy });
  const name = await otherSide(ctx, me.id, card.conversationId);
  const offered = name
    ? tr(
        'Shall I suggest {when} for “{title}”, in place of {from}? {name} will be asked to agree.',
        {
          when: at(to),
          title: card.title,
          from: at(card.at),
          name,
        },
      )
    : tr(
        'Shall I suggest {when} for “{title}”, in place of {from}? Everyone in it will be asked to agree.',
        {
          when: at(to),
          title: card.title,
          from: at(card.at),
        },
      );
  return void (await say(warning ? `${offered}\n\n${warning}` : offered, {
    offer: {
      kind: 'move',
      conversationId: card.conversationId,
      move: {
        messageId: card.messageId,
        title: card.title,
        from: card.at.toISOString(),
        at: to.toISOString(),
        ...(name ? { name } : {}),
        ...(clash?.next ? { instead: clash.next.toISOString() } : {}),
      },
    },
  }));
}

/**
 * The person's next words after Cai asked what an act still needed (which of two people, what
 * to tell them, when to meet), within the hour: true when they finished it, false when they're
 * about something else, for the rest of the rules to read.
 */
export async function answerAwaited(
  ctx: AppContext,
  accountId: string,
  conversationId: string,
  me: Asker,
  said: { seq: number; text: string },
): Promise<boolean> {
  const text = said.text.trim();
  if (!text) return false;
  const line = await ctx.db
    .selectFrom('messages')
    .select(['sender_id', 'payload', 'created_at'])
    .where('conversation_id', '=', conversationId)
    .where('seq', '<', String(said.seq))
    .where('deleted_at', 'is', null)
    .where('kind', '<>', 'system')
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst();
  const awaiting =
    line?.sender_id === accountId
      ? (line.payload as { awaiting?: Awaiting } | null)?.awaiting
      : undefined;
  if (!awaiting || ctx.now().getTime() - new Date(line!.created_at).getTime() > AWAIT_MS)
    return false;
  const { act, to, choices, cards, card } = awaiting;
  if (cards?.length) {
    // Which meeting: by its place in the list, or by its name.
    const n = /^\d$/u.test(text) ? Number(text) : 0;
    const picked = n >= 1 && n <= cards.length ? cards[n - 1] : undefined;
    if (!picked) return false;
    await offerAct(ctx, accountId, conversationId, me, act, undefined, picked);
    return true;
  }
  if (card) {
    const opts = { now: ctx.now(), timeZone: me.time_zone, locale: readLocale(act, me) };
    const said = /^\d{1,2}(?::\d{2})?$/u.test(text) ? `at ${text}` : text;
    if (!firstFutureWhen(said, opts)) return false;
    await offerAct(ctx, accountId, conversationId, me, { ...act, words: text }, undefined, card);
    return true;
  }
  if (choices?.length) {
    // "Sami Haddad", "Haddad", or which one by its place in the list.
    const n = /^\d$/u.test(text) ? Number(text) : 0;
    const picked =
      n >= 1 && n <= choices.length
        ? [choices[n - 1]!]
        : choices.filter((c) => holdsWhole(c.name, text));
    if (picked.length !== 1) return false;
    await offerAct(ctx, accountId, conversationId, me, act, picked[0]);
    return true;
  }
  if (!to) return false;
  if (act.kind === 'message') {
    await offerAct(
      ctx,
      accountId,
      conversationId,
      me,
      { ...act, words: messageWords(text, act.lang) },
      to,
    );
    return true;
  }
  if (act.kind === 'meeting') {
    // A time in what they said now, read with the day said before ("on Thursday", then "at 3").
    const opts = { now: ctx.now(), timeZone: me.time_zone, locale: safeLocale(me.locale) };
    if (!firstFutureWhen(text, opts)) return false;
    const words = [act.words, text].filter(Boolean).join(' ');
    await offerAct(ctx, accountId, conversationId, me, { ...act, words }, to);
    return true;
  }
  return false;
}

/**
 * The person's tap on an offer: the message or the meeting card goes as theirs, into their chat
 * with whom it's for (the one named on the offer, or the one the app just opened with them),
 * once however often it's tapped; a call and a search start on the device.
 */
export async function carryOutOffer(
  ctx: AppContext,
  userId: string,
  offerId: string,
  opened: string | null,
  /** The free time Cai offered in its place (M17 I7), when that's what they tapped. */
  instead = false,
): Promise<OfferDoneResponse> {
  const line = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', offerId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const offer = (line?.payload as { offer?: CaiOfferPayload } | null)?.offer;
  if (!line || !offer || !systemAccountOf(line.sender_id)) throw notFound(tr('That message'));
  // Only the person it was offered to: it's in their own chat with Cai or a friend.
  await membership(ctx, userId, line.conversation_id);
  if (offer.doneId && offer.conversationId)
    return { conversationId: offer.conversationId, messageId: offer.doneId };
  if (offer.kind === 'move') return moveOnTap(ctx, userId, line, offer, instead);
  if ((offer.kind !== 'message' && offer.kind !== 'meeting') || !offer.to)
    throw badRequest(tr('That one starts on your device.'));
  const target = offer.conversationId ?? opened;
  if (!target) throw badRequest(tr('Open your chat with {name} first.', { name: offer.to.name }));
  // Their one-to-one with whom it's for, and nobody else's.
  const { conversation } = await membership(ctx, userId, target);
  const people = await participantsOf(ctx.db, target);
  if (
    conversation.kind !== 'direct' ||
    people.length !== 2 ||
    !people.some((p) => p.user_id === offer.to!.id)
  )
    throw badRequest(tr('That isn’t your chat with {name}.', { name: offer.to.name }));
  await assertCanWrite(ctx, target, userId);
  const asked = offer.meeting;
  if (offer.kind === 'meeting' && !asked) throw notFound(tr('That message'));
  if (instead && !asked?.instead) throw badRequest(tr('That one starts on your device.'));
  const meeting = asked && instead ? { ...asked, at: asked.instead! } : asked;
  const { message } = await postAs(
    ctx,
    userId,
    target,
    offer.kind === 'message' || !meeting
      ? (offer.text ?? '')
      : {
          kind: 'kit',
          payload: {
            kit: 'meeting',
            fields: {
              title: meeting.title,
              start: { at: meeting.at, hasTime: true },
              durationMinutes: meeting.minutes,
              place: 'Caime',
            },
          },
        },
    { clientId: `cai-offer:${offerId}`, echo: true },
  );
  await markDone(ctx, userId, line, {
    ...offer,
    ...(meeting && offer.meeting ? { meeting: { ...offer.meeting, at: meeting.at } } : {}),
    conversationId: target,
    doneId: message.id,
    doneAt: ctx.now().toISOString(),
  });
  return { conversationId: target, messageId: message.id };
}

/**
 * The person's tap on a move Cai offered (M17 I7): another time suggested for their card as the
 * card's own "Suggest another time" does (`retimeCard`, under its lock, the other side asked
 * again), at the time offered or the free time beside it, once however often it's tapped.
 */
async function moveOnTap(
  ctx: AppContext,
  userId: string,
  line: Message,
  offer: CaiOfferPayload,
  instead: boolean,
): Promise<OfferDoneResponse> {
  const asked = offer.move;
  if (!asked) throw notFound(tr('That message'));
  if (instead && !asked.instead) throw badRequest(tr('That one starts on your device.'));
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', asked.messageId)
    .executeTakeFirst();
  if (!m) throw notFound(tr('That message'));
  await membership(ctx, userId, m.conversation_id);
  await assertCanWrite(ctx, m.conversation_id, userId);
  const refused = retimeRefusal(m, userId);
  if (refused) throw badRequest(refused);
  const start = new Date(instead ? asked.instead! : asked.at);
  if (start.getTime() <= ctx.now().getTime())
    throw badRequest(tr('That time has passed. Choose a later one.'));
  const moved = await retimeCard(ctx, m, {
    start,
    actorId: userId,
    business: await customerMask(ctx.db, m.conversation_id),
  });
  if (moved === 'conflict')
    throw new AppError(409, 'conflict', tr('Someone just changed this card.'));
  await markDone(ctx, userId, line, {
    ...offer,
    move: { ...asked, at: start.toISOString() },
    conversationId: m.conversation_id,
    doneId: m.id,
    doneAt: ctx.now().toISOString(),
  });
  return { conversationId: m.conversation_id, messageId: m.id };
}

/** The offer's line says it was done, on every device of theirs, so a second tap does nothing. */
async function markDone(
  ctx: AppContext,
  userId: string,
  line: Message,
  offer: CaiOfferPayload,
): Promise<void> {
  const payload = { ...(line.payload as object), offer };
  const [updated] = await ctx.db
    .updateTable('messages')
    .set({ payload: JSON.stringify(payload) })
    .where('id', '=', line.id)
    .returning(MESSAGE_COLUMNS)
    .execute();
  if (updated) {
    const [view] = await messageViews(ctx.db, [updated], userId);
    await ctx.bus.publish([userId], { type: 'message.updated', data: view });
  }
}
