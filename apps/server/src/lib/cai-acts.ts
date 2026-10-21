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
  formatWhenAt,
  listed,
  messageWords,
  safeLocale,
  systemAccountOf,
  tr,
  truncate,
} from '@caime/core';
import type { CaiOfferPayload, OfferDoneResponse } from '@caime/core/api';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS } from '../db/schema';
import { assertCanWrite } from './blocks';
import { membership } from './conversation-views';
import { badRequest, notFound } from './errors';
import { messageViews, participantsOf } from './messages';
import { holdsWhole, type NamedPerson, peopleMeant, peopleNamed } from './people-named';
import { postAs } from './post-as';
import { pairKey } from './relations';

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
}

/** A meeting's lengths, as its card offers them; half an hour unless it was said otherwise. */
const MEETING_MINUTES = [15, 30, 45, 60, 90];
/** How long a question of Cai's waits for its answer. */
const AWAIT_MS = 60 * 60_000;

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
): Promise<void> {
  const say = (line: string, payload?: { offer: CaiOfferPayload } | { awaiting: Awaiting }) =>
    postAs(
      ctx,
      accountId,
      conversationId,
      payload ? { kind: 'text', body: line, payload } : line,
      payload ? { serverPayload: true } : {},
    );
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
      return void (await say(
        title
          ? tr(
              'Here’s a meeting about “{title}” for you and {name}: {when}, on Caime. Shall I send it?',
              { title, name: person.name, when: at },
            )
          : tr('Here’s a meeting for you and {name}: {when}, on Caime. Shall I send it?', {
              name: person.name,
              when: at,
            }),
        {
          offer: {
            kind: 'meeting',
            to,
            conversationId: chat,
            meeting: { title: title ?? tr('Meeting'), at: when.at, minutes },
          },
        },
      ));
    }
  }
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
  const { act, to, choices } = awaiting;
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
  const meeting = offer.meeting;
  if (offer.kind === 'meeting' && !meeting) throw notFound(tr('That message'));
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
  const payload = {
    ...(line.payload as object),
    offer: {
      ...offer,
      conversationId: target,
      doneId: message.id,
      doneAt: ctx.now().toISOString(),
    },
  };
  const [updated] = await ctx.db
    .updateTable('messages')
    .set({ payload: JSON.stringify(payload) })
    .where('id', '=', offerId)
    .returning(MESSAGE_COLUMNS)
    .execute();
  if (updated) {
    const [view] = await messageViews(ctx.db, [updated], userId);
    await ctx.bus.publish([userId], { type: 'message.updated', data: view });
  }
  return { conversationId: target, messageId: message.id };
}
