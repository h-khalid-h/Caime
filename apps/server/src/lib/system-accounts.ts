/**
 * Caime's own accounts at work (R67, R71): Cai, the assistant, and the seven Caime Friends.
 * Someone opens a conversation with one (`openSystemConversation`, which says hello once); each
 * message they write queues `system.reply`, which answers the latest of theirs once, as the
 * account, through `sendMessage` like anyone's message. Each understands what's written to it by
 * the rules first (core `chatIntent`: a greeting, "how can you help me", thanks, and the four
 * questions about one's own open things, which Cai and every friend answer from three queries,
 * no model, no cost; core `chatAbout`: the same about one person, what the two agreed and
 * whether they paid, answered from the records with them, M16 G11) and answers in the language
 * it was written in. Anything else goes to the
 * model only for an adult with AI assist on and an assist left today: Cai as Caime's assistant,
 * a friend in its own character, each reading that conversation and, as its only other context,
 * what's open for them that's its to know (never a private conversation's). Without the model a
 * friend shares its tips in turn. Nothing here notifies: Cai and the friends never need anyone.
 */

import {
  type AboutIntent,
  type ArabicVariety,
  aboutRelationship,
  arabicVariety,
  type CharacterHandle,
  type ChatIntent,
  chatAbout,
  chatIntent,
  firstName,
  formatAmount,
  formatDayHeading,
  formatDue,
  formatWhenAt,
  greetsWithPeace,
  isCharacterHandle,
  joinNames,
  kitHeadline,
  kitStateLabel,
  LARGE_GROUP,
  msg,
  type PaysShare,
  paySides,
  relationshipWords,
  SYSTEM_ACCOUNTS,
  type SystemAccount,
  safeLocale,
  systemAccountOf,
  tr,
  trn,
  writtenIn,
  zonedParts,
} from '@caime/core';
import type { Gender } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { todayForAgent } from './agent';
import { type FriendPersona, languageName } from './ai';
import { runAi } from './ai-run';
import { ensureDirectConversation } from './conversations';
import { AppError } from './errors';
import { asReader, inLanguage, readerOf } from './i18n';
import { registerJob } from './jobs';
import { SYSTEM_REPLY_JOB } from './message-effects';
import { readableBy } from './messages';
import { type NamedPerson, peopleNamed, plainColumn, plainName } from './people-named';
import { assertAiAllowance } from './plans';
import { postAs } from './post-as';
import { visibleTasksSql } from './task-visibility';
import { escapeLike } from './text';
import { transcriptText, wordsFor } from './transcript';
import { cardsAhead, dueCards } from './upcoming';
import { minorOf } from './users';

const SHOWN = 5;
const TRANSCRIPT_MESSAGES = 12;
const WEEK_MS = 7 * 86_400_000;
/** The sticker pack the friends send from: the app's `STICKER_PACK`. */
const PACK = 'caishy-friends';

/** What's open for someone, by part: what each friend may read of it (Cai reads it all). */
type OpenPart = 'waiting' | 'asked' | 'mine' | 'coming';

interface Friend {
  /** Its hello when the conversation opens, and its answer to a greeting (keys, said in the reader's language). */
  hello: string;
  /** What it helps with, for "how can you help me". */
  helps: string;
  /** Its answer to thanks. */
  welcome: string;
  /** What it knows of Caime: told a tip at a time without the model, and the model's facts. */
  tips: string[];
  sticker: string;
  /** Who it is, for the model (English, never shown). */
  persona: Pick<FriendPersona, 'trait' | 'voice' | 'knows'>;
  /** The parts of what's open for someone that are its to know, for the model. */
  reads: OpenPart[];
}

const FRIENDS: Record<CharacterHandle, Friend> = {
  caishy: {
    hello: msg('Hi, I’m Caishy! Ask me anything about Caime, or just say hi.'),
    helps: msg(
      'I welcome people to Caime and keep the Caishy Friends stickers. Ask me how anything here works.',
    ),
    welcome: msg('Aww, any time!'),
    tips: [
      msg(
        'Send a sticker from the button beside an empty message box. The Caishy Friends pack is free.',
      ),
      msg('Press and hold a message, or point at it on a computer, to react, reply or save it.'),
      msg('Your picture at the top opens you and your settings.'),
    ],
    sticker: 'caishy.happy',
    persona: {
      trait: 'the Dreamer, who always finds kindness',
      voice: 'gently, warmly and a little dreamily',
      knows: 'welcoming people to Caime, how it works, and the free Caishy Friends stickers',
    },
    reads: [],
  },
  momo: {
    hello: msg('Yay, you found me! I’m Momo. When nothing needs you, I’m the one cheering.'),
    helps: msg(
      'I cheer you on when you’re all caught up. Ask me what needs you, or what’s coming up.',
    ),
    welcome: msg('Yay! Happy to help!'),
    tips: [
      msg('When Attention says nothing needs you, that’s Caime working. Enjoy it!'),
      msg('Mark something done in Actions, and whoever was waiting hears it.'),
      msg('Quiet hours keep your evenings yours: Settings, then Notifications.'),
    ],
    sticker: 'momo.excited',
    persona: {
      trait: 'the Cheerful, who spreads joy everywhere',
      voice: 'brightly and playfully, quick to celebrate',
      knows: 'being all caught up: Attention, what needs them, and the calm when nothing does',
    },
    reads: ['asked', 'coming'],
  },
  panda: {
    hello: msg('I’m Panda. I stay by your side while you wait for someone.'),
    helps: msg(
      'I keep an eye on what you’re waiting for from others. Ask me what you’re waiting on.',
    ),
    welcome: msg('Always here for you.'),
    tips: [
      msg(
        'Ask someone for something, and it waits under “Waiting for” in Actions until they answer.',
      ),
      msg('When a wait goes quiet for three days, Attention asks whether it’s still open.'),
      msg('How you know someone can offer a follow-up when a question goes unanswered.'),
    ],
    sticker: 'panda.happy',
    persona: {
      trait: 'the Loyal, always by your side',
      voice: 'calmly and steadily, like a reassuring friend',
      knows: 'waiting and follow-ups: what they wait for from others, and how to nudge gently',
    },
    reads: ['waiting'],
  },
  lumi: {
    hello: msg('Hello, I’m Lumi! I love making new things: groups, topics and spaces.'),
    helps: msg(
      'I help you make things together: groups, topics and spaces. Ask me which one fits.',
    ),
    welcome: msg('My pleasure! Go make something lovely.'),
    tips: [
      msg('A space gathers the people, conversations and plans of one project.'),
      msg('A topic keeps one conversation about one thing, without starting over.'),
      msg('The + in Chats starts a conversation, a group or a space.'),
    ],
    sticker: 'lumi.curious',
    persona: {
      trait: 'the Creative, who turns ideas into magic',
      voice: 'imaginatively and encouragingly',
      knows: 'making things together: groups, topics, spaces and first messages',
    },
    reads: [],
  },
  pico: {
    hello: msg('Hi! I’m Pico, and I’m curious about everything.'),
    helps: msg(
      'I know how to find things: messages, files, promises and people. Ask me how to search for something.',
    ),
    welcome: msg('Any time! What else are you curious about?'),
    tips: [
      msg('Search understands sentences, like “what did Alex ask me last week”.'),
      msg('Search for someone’s name to find your conversations, files and promises with them.'),
      msg('Find people by their @handle in People.'),
    ],
    sticker: 'pico.curious',
    persona: {
      trait: 'the Curious, who asks the best questions',
      voice: 'inquisitively and playfully, sometimes answering with a good question',
      knows: 'search, discovery and finding people',
    },
    reads: [],
  },
  niko: {
    hello: msg('I’m Niko. First steps are my favourite thing!'),
    helps: msg(
      'I help with first steps: connecting with people, invites and saying hi first. Ask me where to begin.',
    ),
    welcome: msg('You’ve got this!'),
    tips: [
      msg('Connect with someone from People: their @handle, a link or a QR code.'),
      msg(
        'Tell Caime how you know someone. Only you see it, and it decides what reaches you when.',
      ),
      msg('Say hi first. Most good conversations start that way.'),
    ],
    sticker: 'niko.excited',
    persona: {
      trait: 'the Brave, who faces new adventures',
      voice: 'boldly and encouragingly',
      knows: 'first steps: connecting with people, invites and saying hi first',
    },
    reads: [],
  },
  zuzu: {
    hello: msg('I’m Zuzu. I remember what was decided, so you don’t have to.'),
    helps: msg('I remember what was decided and what you said you’d do. Ask me what you promised.'),
    welcome: msg('Glad I could help.'),
    tips: [
      msg('What was decided and what’s still open in a conversation are in its details.'),
      msg('Save a message to find it again in Saved.'),
      msg('A person’s page remembers what’s open between the two of you.'),
    ],
    sticker: 'zuzu.wink',
    persona: {
      trait: 'the Wise, who sees the good in everything',
      voice: 'thoughtfully, calmly and kindly',
      knows: 'memory: what was decided, what they said they would do, and conversation history',
    },
    reads: ['mine'],
  },
};

/** "And peace be upon you": the answer to a greeting of peace, before the rest. */
const PEACE = msg('And peace be upon you!');

/**
 * A friend's tip for the person's n-th message it didn't understand without the model (1 is the
 * first), its tips in turn; `first` when a round of them starts, which is when it says what AI
 * assist would add.
 */
export function tipFor(handle: CharacterHandle, n: number): { tip: string; first: boolean } {
  const { tips } = FRIENDS[handle];
  const i = (Math.max(1, n) - 1) % tips.length;
  return { tip: tips[i]!, first: i === 0 };
}

/** Who a friend is, for the model: its character, what it knows, and who knows what else. */
export function personaOf(handle: CharacterHandle): FriendPersona {
  const friend = FRIENDS[handle];
  const name = systemAccountByHandle(handle).name;
  return {
    name,
    ...friend.persona,
    facts: friend.tips,
    others: (Object.keys(FRIENDS) as CharacterHandle[])
      .filter((h) => h !== handle)
      .map((h) => `${systemAccountByHandle(h).name} (@${h}) knows ${FRIENDS[h].persona.knows}`),
  };
}

const systemAccountByHandle = (handle: string): SystemAccount =>
  SYSTEM_ACCOUNTS.find((a) => a.handle === handle)!;

/** The conversation with one of Caime's own, made once and greeted once. */
export async function openSystemConversation(
  ctx: AppContext,
  userId: string,
  account: SystemAccount,
): Promise<{ id: string; created: boolean }> {
  const open = () => ensureDirectConversation(ctx.db, userId, account.id, { createdBy: userId });
  // Two devices opening it at once: the second finds the first's.
  const result = await open().catch((err: { code?: string }) => {
    if (err.code === '23505') return open();
    throw err;
  });
  if (result.created)
    await asReader(ctx, userId, () => hello(ctx, userId, account, result.id)).catch((err) =>
      ctx.log.warn({ err, account: account.handle }, 'system hello failed'),
    );
  return result;
}

async function hello(ctx: AppContext, userId: string, account: SystemAccount, id: string) {
  if (isCharacterHandle(account.handle)) {
    const friend = FRIENDS[account.handle];
    await sticker(ctx, account, id, friend);
    await postAs(ctx, account.id, id, tr(friend.hello));
    return;
  }
  const me = await person(ctx, userId);
  const line = tr(
    'Hi {name}, I’m Cai. Ask me what you’re waiting on, what’s asked of you, what you said you’d do or what’s coming up.',
    { name: firstName(me.display_name) },
  );
  await postAs(ctx, account.id, id, [line, more(ctx, me)].filter(Boolean).join(' '));
}

export const person = (ctx: AppContext, userId: string) =>
  ctx.db
    .selectFrom('users')
    .select([
      'id',
      'display_name',
      'birth_date',
      'time_zone',
      'age_minor_until',
      'locale',
      'ai_enabled',
    ])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
export type Person = Awaited<ReturnType<typeof person>>;

const sticker = (ctx: AppContext, account: SystemAccount, conversationId: string, friend: Friend) =>
  postAs(ctx, account.id, conversationId, {
    kind: 'sticker',
    payload: { pack: PACK, sticker: friend.sticker },
  });

/** Whether the model may answer this person: an adult with AI assist on, where there's a model. */
const mayAskModel = (ctx: AppContext, me: Person) =>
  Boolean(ctx.ai && me.ai_enabled && !minorOf(me, ctx.now()));

/** What else Cai or a friend can do for this person: with AI assist on, anything; never for a minor. */
function more(ctx: AppContext, me: Person): string {
  if (!ctx.ai || minorOf(me, ctx.now())) return '';
  return me.ai_enabled
    ? tr('With AI assist on, you can ask me anything else too.')
    : tr('Turn on AI assist in Settings, and you can ask me anything else too.');
}

async function systemReply(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const account = systemAccountOf(String(payload.accountId));
  const conversationId = String(payload.conversationId);
  const personId = String(payload.personId);
  if (!account) return;
  // Only the latest of theirs, and only while nothing has answered it: a newer one has its job.
  const latest = await ctx.db
    .selectFrom('messages')
    .select(['seq', 'sender_id', 'kind', 'body'])
    .where('conversation_id', '=', conversationId)
    .where('deleted_at', 'is', null)
    .where('kind', '<>', 'system')
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!latest || Number(latest.seq) !== Number(payload.seq) || latest.sender_id !== personId)
    return;
  const text = latest.kind === 'text' ? (latest.body ?? '') : '';
  // Answered in the language it was written in ("السلام عليكم" from an English account is
  // answered in Arabic), else the account's; in Arabic, in theirs (R72): the one they chose,
  // else the one they wrote in, else the one where they live.
  const reader = await readerOf(ctx, personId);
  const language = writtenIn(text) ?? reader.language;
  const variety = arabicVariety({ choice: reader.choice, written: text, country: reader.country });
  const voice: Voice = {
    language,
    variety,
    chosen: reader.choice !== 'auto',
    country: reader.country,
    gender: reader.gender,
  };
  await inLanguage(
    language,
    async () => {
      try {
        const me = await person(ctx, personId);
        const said: Said = {
          kind: latest.kind,
          text,
          intent: text ? chatIntent(text) : null,
          about: text ? chatAbout(text) : null,
        };
        if (isCharacterHandle(account.handle))
          await friendSays(ctx, account, account.handle, conversationId, me, said, voice);
        else await caiSays(ctx, account, conversationId, me, said, voice);
      } catch (err) {
        // Blocked meanwhile, or the conversation gone: it just doesn't answer.
        if (!(err instanceof AppError)) throw err;
        ctx.log.debug({ code: err.code, account: account.handle }, 'system reply not sent');
      }
    },
    variety,
  );
}

/** How a reply is spoken: its language, its Arabic, and where the person lives, for the model. */
interface Voice {
  language: string;
  variety: ArabicVariety;
  /** They chose it, rather than it being read from their words or where they live. */
  chosen: boolean;
  /** Where they live (ISO 3166-1): told only to their own Cai and friends' model. */
  country: string | null;
  /** How they said to be addressed (R81), told the model as it's told their language. */
  gender: Gender | null;
}

/** The message being answered: its kind, its words and what the rules read in them. */
interface Said {
  kind: string;
  text: string;
  intent: ChatIntent | null;
  /** A question about one person (G11), with the name or the relationship as typed. */
  about: About | null;
}

type About = { intent: AboutIntent; name: string };

const OWN_QUESTIONS: readonly ChatIntent[] = ['waiting', 'asked', 'mine', 'coming'];
const isOwnQuestion = (intent: ChatIntent | null): intent is OpenPart =>
  intent !== null && OWN_QUESTIONS.includes(intent);

/** "And peace be upon you!" before a greeting's answer, when that's how they greeted. */
const greeted = (said: Said, ...lines: string[]) =>
  [greetsWithPeace(said.text) ? tr(PEACE) : '', ...lines].filter(Boolean).join(' ');

async function friendSays(
  ctx: AppContext,
  account: SystemAccount,
  handle: CharacterHandle,
  conversationId: string,
  me: Person,
  said: Said,
  voice: Voice,
) {
  const friend = FRIENDS[handle];
  const say = (line: string) => postAs(ctx, account.id, conversationId, line);
  // A sticker is answered with its own.
  if (said.kind === 'sticker') return sticker(ctx, account, conversationId, friend);
  if (said.about) return say(await aboutAnswer(ctx, me, said.about));
  if (isOwnQuestion(said.intent)) return say(await ruleAnswer(ctx, me, said.intent));
  switch (said.intent) {
    case 'greeting':
      await sticker(ctx, account, conversationId, friend);
      return say(greeted(said, tr(friend.hello)));
    case 'help':
      return say([tr(friend.helps), more(ctx, me)].filter(Boolean).join(' '));
    case 'thanks':
      await sticker(ctx, account, conversationId, friend);
      return say(tr(friend.welcome));
  }
  if (!mayAskModel(ctx, me)) {
    const written = await ctx.db
      .selectFrom('messages')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('conversation_id', '=', conversationId)
      .where('sender_id', '=', me.id)
      .executeTakeFirstOrThrow();
    const { tip, first } = tipFor(handle, written.n);
    return say([tr(tip), first ? more(ctx, me) : ''].filter(Boolean).join(' '));
  }
  const answer = await modelSays(
    ctx,
    me,
    async () => {
      const [transcript, open] = await Promise.all([
        transcriptOf(ctx, conversationId, me.id, account.name),
        friend.reads.length ? openFor(ctx, me, { forModel: true }) : null,
      ]);
      const ai = ctx.ai!;
      return runAi(ctx, 'friend', me.id, () =>
        ai.friendChat({
          friend: personaOf(handle),
          transcript,
          context: open ? contextLines(open, friend.reads) : '',
          ...spoken(voice),
          today: todayForAgent(ctx.now(), me.time_zone),
        }),
      );
    },
    tr(friend.helps),
  );
  return say(answer);
}

async function caiSays(
  ctx: AppContext,
  account: SystemAccount,
  conversationId: string,
  me: Person,
  said: Said,
  voice: Voice,
) {
  const say = (line: string) => postAs(ctx, account.id, conversationId, line);
  if (said.about) return say(await aboutAnswer(ctx, me, said.about));
  if (isOwnQuestion(said.intent)) return say(await ruleAnswer(ctx, me, said.intent));
  switch (said.intent) {
    case 'greeting':
      return say(
        greeted(
          said,
          tr('Hi {name}!', { name: firstName(me.display_name) }),
          tr(HELP),
          more(ctx, me),
        ),
      );
    case 'help':
      return say([tr(HELP), tr(ABOUT_HELP), more(ctx, me)].filter(Boolean).join(' '));
    case 'thanks':
      return say(tr('Any time!'));
  }
  if (!mayAskModel(ctx, me)) {
    const why =
      ctx.ai && !minorOf(me, ctx.now())
        ? tr('I can answer that with AI assist on: Settings, then AI assist.')
        : tr('That one’s beyond me.');
    return say(`${why} ${tr(HELP)}`);
  }
  const answer = await modelSays(
    ctx,
    me,
    async () => {
      const [transcript, open] = await Promise.all([
        transcriptOf(ctx, conversationId, me.id, 'Cai'),
        openFor(ctx, me, { forModel: true }),
      ]);
      const ai = ctx.ai!;
      return runAi(ctx, 'cai', me.id, () =>
        ai.caiChat({
          transcript,
          context: contextLines(open),
          ...spoken(voice),
          today: todayForAgent(ctx.now(), me.time_zone),
        }),
      );
    },
    tr(HELP),
  );
  return say(answer);
}

/** What the model is told of how to speak: the language, their Arabic, where they live. */
const spoken = (voice: Voice) => ({
  language: languageName(voice.language),
  arabic: { variety: voice.variety, chosen: voice.chosen },
  country: voice.country,
  gender: voice.gender,
});

/**
 * A model's answer within the person's allowance, cut to a message's length; out of assists,
 * busy or declined, the refusal in its own words, then `otherwise`: what the rules still answer.
 */
async function modelSays(
  ctx: AppContext,
  me: Person,
  ask: () => Promise<string>,
  otherwise: string,
): Promise<string> {
  try {
    ctx.limiter.hit(`ai:${me.id}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    await assertAiAllowance(ctx, me.id);
    return (await ask()).slice(0, 4000);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return `${err.message} ${otherwise}`;
  }
}

const HELP = msg(
  'I can always tell you what you’re waiting on, what’s asked of you, what you said you’d do and what’s coming up this week. Just ask, in your own words.',
);
/** What Cai says it knows about one person (G11), after `HELP` when asked how it can help. */
const ABOUT_HELP = msg(
  'Or ask about one of your people, by name or as you know them: what you’re waiting for from them, what they asked of you, what you agreed and whether they paid.',
);

/**
 * What Cai or a friend says it helps with, and a friend's tips, as keys, for its public page
 * (R67): the very lines it says in its chat. Cai's tips are its page's own (`public-pages.ts`).
 */
export function publicFacts(handle: 'cai' | CharacterHandle): { helps: string; tips: string[] } {
  if (handle === 'cai') return { helps: HELP, tips: [] };
  const friend = FRIENDS[handle];
  return { helps: friend.helps, tips: friend.tips };
}

/**
 * The conversation as the model reads it: "Person" and the account's own name ("Cai", "Panda"),
 * oldest first, never the person's name.
 */
async function transcriptOf(ctx: AppContext, conversationId: string, personId: string, as: string) {
  const rows = await ctx.db
    .selectFrom('messages')
    .select(['sender_id', 'kind', 'body', 'payload', 'deleted_at'])
    .where('conversation_id', '=', conversationId)
    // What the person may read (M16 D3): what they deleted for themselves never reaches the model.
    .where(readableBy(personId, ctx.now()))
    .where('kind', '<>', 'system')
    .orderBy('seq', 'desc')
    .limit(TRANSCRIPT_MESSAGES)
    .execute();
  return transcriptText(
    rows.reverse().map((m) => ({
      who: m.sender_id === personId ? 'Person' : as,
      words: wordsFor(m, 600),
    })),
  );
}

export interface Open {
  waiting: string[];
  asked: string[];
  mine: string[];
  coming: string[];
  counts: { waiting: number; asked: number; mine: number };
}

/**
 * What's open for someone, in their words: three queries whatever they have (convention 14).
 * The model's copy leaves out anything from a private conversation (R18).
 */
export async function openFor(
  ctx: AppContext,
  me: Person,
  opts: { forModel?: boolean; until?: Date } = {},
): Promise<Open> {
  const now = ctx.now();
  const until = opts.until ?? new Date(now.getTime() + WEEK_MS);
  const locale = safeLocale(me.locale);
  const zone = me.time_zone;
  const open = ctx.db
    .selectFrom('tasks as t')
    .leftJoin('conversations as c', 'c.id', 't.conversation_id')
    .where('t.status', 'in', ['open', 'accepted'])
    // Their own, and what's asked of them that was shared with them: never a private wait.
    .where(visibleTasksSql(me.id, 't'))
    .$if(Boolean(opts.forModel), (q) =>
      q.where((eb) =>
        eb.or([eb('c.privacy_class', 'is', null), eb('c.privacy_class', '<>', 'private')]),
      ),
    );
  const [rows, counts, cards, owed] = await Promise.all([
    open
      .leftJoin('users as a', 'a.id', 't.assignee_id')
      .leftJoin('users as o', 'o.id', 't.owner_id')
      .select([
        't.owner_id',
        't.assignee_id',
        't.title',
        't.due_at',
        't.due_has_time',
        'a.display_name as assignee',
        'o.display_name as owner',
      ])
      .orderBy(sql`coalesce(t.due_at, t.created_at)`)
      .limit(60)
      .execute(),
    open
      .select([
        sql<number>`count(*) filter (where t.owner_id = ${me.id} and t.assignee_id = ${me.id})::int`.as(
          'mine',
        ),
        sql<number>`count(*) filter (where t.assignee_id = ${me.id} and t.owner_id <> ${me.id})::int`.as(
          'asked',
        ),
        sql<number>`count(*) filter (where t.owner_id = ${me.id} and t.assignee_id is distinct from ${me.id})::int`.as(
          'waiting',
        ),
      ])
      .executeTakeFirstOrThrow(),
    cardsAhead(ctx, me.id, {
      from: now,
      until,
      limit: SHOWN,
      agreedOnly: true,
    }),
    // What's owed by a day in the window (M14), today's included: the cards the calendar shows.
    dueCards(ctx, me.id, { from: dueDayOf(now, zone), until, limit: SHOWN }),
  ]);
  const due = (at: Date | null, hasTime: boolean) =>
    at ? ` · ${formatDue(at.toISOString(), now, zone, locale, hasTime)}` : '';
  const line = (...parts: Array<string | null>) => `• ${parts.filter(Boolean).join(' · ')}`;
  const mine = rows.filter((r) => r.owner_id === me.id && r.assignee_id === me.id);
  const asked = rows.filter((r) => r.assignee_id === me.id && r.owner_id !== me.id);
  const waiting = rows.filter((r) => r.owner_id === me.id && r.assignee_id !== me.id);
  const soon = rows
    .filter(
      (r) =>
        r.assignee_id === me.id &&
        r.due_at &&
        r.due_at.getTime() >= now.getTime() &&
        r.due_at.getTime() < until.getTime(),
    )
    .map((r) => ({ at: r.due_at!, hasTime: r.due_has_time, title: r.title }));
  const coming = [
    ...soon,
    ...cards.map((c) => ({ at: c.at, hasTime: c.hasTime, title: c.title })),
    ...owed.map((c) => ({
      at: c.at,
      hasTime: false,
      title: c.amount
        ? `${c.title}: ${formatAmount(c.amount.value, c.amount.currency, locale)}`
        : c.title,
    })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, SHOWN)
    .map((c) => line(formatWhenAt(c.at.toISOString(), c.hasTime, now, zone, locale), c.title));
  return {
    waiting: waiting
      .slice(0, SHOWN)
      .map((r) => line(r.assignee ?? tr('Someone'), r.title) + due(r.due_at, r.due_has_time)),
    asked: asked
      .slice(0, SHOWN)
      .map((r) => line(r.owner ?? tr('Someone'), r.title) + due(r.due_at, r.due_has_time)),
    mine: mine.slice(0, SHOWN).map((r) => line(r.title) + due(r.due_at, r.due_has_time)),
    coming,
    counts,
  };
}

/** A due day is kept as midnight UTC of its date: today's, in the person's own zone. */
function dueDayOf(now: Date, zone: string): Date {
  const p = zonedParts(now, zone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/**
 * What Cai says to a question the rules understood, from what's open. The answer is a message
 * the server keeps and a model reads later (the conversation's transcript), so nothing an older
 * row ties to a private conversation is in it (R18, M16 G7).
 */
async function ruleAnswer(ctx: AppContext, me: Person, intent: OpenPart): Promise<string> {
  const open = await openFor(ctx, me, { forModel: true });
  const list = (head: string, lines: string[], total: number) => {
    const rest = total - lines.length;
    return [
      head,
      ...lines,
      ...(rest > 0 ? [trn(rest, 'And one more in Actions.', 'And {n} more in Actions.')] : []),
    ].join('\n');
  };
  switch (intent) {
    case 'waiting':
      return open.counts.waiting
        ? list(
            trn(
              open.counts.waiting,
              'You’re waiting on one thing:',
              'You’re waiting on {n} things:',
            ),
            open.waiting,
            open.counts.waiting,
          )
        : tr('You’re not waiting on anyone right now.');
    case 'asked':
      return open.counts.asked
        ? list(
            trn(open.counts.asked, 'One thing is asked of you:', '{n} things are asked of you:'),
            open.asked,
            open.counts.asked,
          )
        : tr('Nobody is waiting on you right now.');
    case 'mine':
      return open.counts.mine
        ? list(
            trn(open.counts.mine, 'You said you’d do one thing:', 'You said you’d do {n} things:'),
            open.mine,
            open.counts.mine,
          )
        : tr('Nothing you said you’d do is open.');
    case 'coming':
      return open.coming.length
        ? [tr('Coming up this week:'), ...open.coming].join('\n')
        : tr('Nothing is coming up this week.');
  }
}

/** How far ahead a question about one person looks for a meeting or an appointment with them. */
const ABOUT_AHEAD_MS = 60 * 86_400_000;

/** A conversation someone is in now with any of the people a question is about. */
interface Shared {
  id: string;
  /** Their chat, or one of its topics, rather than a group. */
  chat: boolean;
  /** A group's or a topic's title, which a line names it by. */
  title: string | null;
  /** Which of the people asked about are in it. */
  with: string[];
}

/**
 * The conversations someone is in now with any of these people, in one query: chats and
 * groups, never a private one (what Cai says is kept, and a model reads it later: R18), an
 * organization's (R15) or a crowd's (past `LARGE_GROUP`, where a meeting or a decision isn't
 * theirs together), nor one they haven't let in (a request still waiting on them).
 */
async function sharedWith(ctx: AppContext, me: string, ids: string[]): Promise<Shared[]> {
  if (!ids.length) return [];
  const rows = await ctx.db
    .selectFrom('participants as a')
    .innerJoin('participants as b', 'b.conversation_id', 'a.conversation_id')
    .innerJoin('conversations as c', 'c.id', 'a.conversation_id')
    .select(['c.id', 'c.kind', 'c.title', sql<string[]>`array_agg(distinct b.user_id)`.as('with')])
    .where('a.user_id', '=', me)
    .where('a.left_at', 'is', null)
    .where((eb) =>
      eb.or([eb('a.request_state', 'is', null), eb('a.request_state', '=', 'accepted')]),
    )
    .where('b.user_id', 'in', ids)
    .where('b.left_at', 'is', null)
    .where('c.kind', 'in', ['direct', 'group'])
    .where('c.privacy_class', '=', 'standard')
    .where(
      sql<boolean>`(c.kind = 'direct' or (select count(*) from participants p
        where p.conversation_id = c.id and p.left_at is null) <= ${LARGE_GROUP})`,
    )
    .groupBy(['c.id', 'c.kind', 'c.title'])
    .orderBy('c.id')
    .limit(200)
    .execute();
  return rows.map((r) => ({ id: r.id, chat: r.kind === 'direct', title: r.title, with: r.with }));
}

/**
 * Whom a question means: the person's own people by that name (`peopleNamed`), else, when the
 * words name a relationship ("my dentist", "مديري"), the people they keep that relationship
 * with, by its role (a doctor is one whichever sphere they were labelled in) or its sphere, or
 * by a label of their own written that way ("Boss"). At most five.
 */
async function peopleMeant(ctx: AppContext, me: string, words: string): Promise<NamedPerson[]> {
  const named = await peopleNamed(ctx, me, words);
  if (named.length) return named;
  const relationship = aboutRelationship(words);
  const label = plainName(relationshipWords(words));
  if (!relationship && !label) return [];
  const rows = await ctx.db
    .selectFrom('relationships as r')
    .innerJoin('users as u', 'u.id', 'r.subject_id')
    .select(['u.id', 'u.display_name'])
    .distinct()
    .where('r.owner_id', '=', me)
    .where('r.status', '=', 'active')
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        ...(relationship?.role ? [eb('r.role', '=', relationship.role)] : []),
        ...(relationship && !relationship.role ? [eb('r.sphere', '=', relationship.sphere)] : []),
        ...(label ? [eb(plainColumn('r.role_label'), 'ilike', escapeLike(label))] : []),
      ]),
    )
    .orderBy('u.display_name')
    .limit(5)
    .execute();
  return rows.map((r) => ({ id: r.id, name: r.display_name }));
}

/**
 * What Cai and the friends say to a question about one person (M16 G11), from the person's own
 * records with them, by the rules, at no cost: what they wait on from them, what's asked of
 * them, what they said they'd do for them, what's coming up, what the two decided and what was
 * paid. Nobody of theirs by that name or relationship is said so; several are answered together,
 * each line naming whose it is. Nothing from a private conversation (R18): the answer is a
 * message the server keeps.
 */
async function aboutAnswer(ctx: AppContext, me: Person, about: About): Promise<string> {
  const people = await peopleMeant(ctx, me.id, about.name);
  if (!people.length)
    return tr('I don’t know who “{name}” is among your people.', { name: about.name });
  const ids = people.map((p) => p.id);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const who = joinNames(people.map((p) => p.name));
  /** Whose a line is, when the question meant several people. */
  const whose = (...of: Array<string | null | undefined>) =>
    people.length > 1
      ? joinNames(of.flatMap((id) => (id && names.has(id) ? [names.get(id)!] : [])))
      : null;
  const now = ctx.now();
  const locale = safeLocale(me.locale);
  const zone = me.time_zone;
  const line = (...parts: Array<string | null | undefined>) =>
    `• ${parts.filter(Boolean).join(' · ')}`;
  const day = (at: Date) => formatDayHeading(at.toISOString(), now, zone, locale);

  if (about.intent === 'waiting' || about.intent === 'asked' || about.intent === 'mine') {
    // What one said they'd do for someone is what they said in their chat with them.
    const chats =
      about.intent === 'mine' ? (await sharedWith(ctx, me.id, ids)).filter((c) => c.chat) : [];
    if (about.intent === 'mine' && !chats.length)
      return tr('Nothing you said you’d do for {who} is open.', { who });
    const chatWith = new Map(chats.map((c) => [c.id, c.with]));
    const rows = await ctx.db
      .selectFrom('tasks as t')
      .leftJoin('conversations as c', 'c.id', 't.conversation_id')
      .where('t.status', 'in', ['open', 'accepted'])
      .where(visibleTasksSql(me.id, 't'))
      .where((eb) =>
        eb.or([eb('c.privacy_class', 'is', null), eb('c.privacy_class', '<>', 'private')]),
      )
      .where((eb) =>
        about.intent === 'waiting'
          ? eb.and([eb('t.owner_id', '=', me.id), eb('t.assignee_id', 'in', ids)])
          : about.intent === 'asked'
            ? eb.and([eb('t.assignee_id', '=', me.id), eb('t.owner_id', 'in', ids)])
            : eb.and([
                eb('t.owner_id', '=', me.id),
                eb('t.assignee_id', '=', me.id),
                eb('t.conversation_id', 'in', [...chatWith.keys()]),
              ]),
      )
      .select([
        't.owner_id',
        't.assignee_id',
        't.conversation_id',
        't.title',
        't.due_at',
        't.due_has_time',
        sql<number>`(count(*) over ())::int`.as('total'),
      ])
      .orderBy(sql`coalesce(t.due_at, t.created_at)`)
      .orderBy('t.id')
      .limit(SHOWN)
      .execute();
    const total = rows[0]?.total ?? 0;
    const lines = rows.map((r) =>
      line(
        about.intent === 'waiting'
          ? whose(r.assignee_id)
          : about.intent === 'asked'
            ? whose(r.owner_id)
            : whose(...(chatWith.get(r.conversation_id ?? '') ?? [])),
        r.title,
        r.due_at ? formatDue(r.due_at.toISOString(), now, zone, locale, r.due_has_time) : null,
      ),
    );
    const rest =
      total > rows.length
        ? [trn(total - rows.length, 'And one more in Actions.', 'And {n} more in Actions.')]
        : [];
    const head =
      about.intent === 'waiting'
        ? total
          ? trn(
              total,
              'You’re waiting on {who} for one thing:',
              'You’re waiting on {who} for {n} things:',
              { who },
            )
          : tr('You’re not waiting on {who} for anything.', { who })
        : about.intent === 'asked'
          ? total
            ? trn(
                total,
                'From {who}, one thing is asked of you:',
                'From {who}, {n} things are asked of you:',
                { who },
              )
            : tr('Nothing is asked of you by {who}.', { who })
          : total
            ? trn(
                total,
                'You said you’d do one thing for {who}:',
                'You said you’d do {n} things for {who}:',
                { who },
              )
            : tr('Nothing you said you’d do for {who} is open.', { who });
    return [head, ...lines, ...rest].join('\n');
  }

  const shared = await sharedWith(ctx, me.id, ids);
  const byId = new Map(shared.map((c) => [c.id, c]));
  const inShared = shared.map((c) => c.id);

  if (about.intent === 'coming') {
    const cards = await cardsAhead(ctx, me.id, {
      from: now,
      until: new Date(now.getTime() + ABOUT_AHEAD_MS),
      limit: SHOWN,
      conversationIds: inShared,
    });
    return cards.length
      ? [
          tr('Coming up with {who}:', { who }),
          ...cards.map((c) =>
            line(
              whose(...(byId.get(c.conversationId)?.with ?? [])),
              formatWhenAt(c.at.toISOString(), c.hasTime, now, zone, locale),
              c.title,
              c.agreed ? null : tr(kitStateLabel(c.kit === 'meeting' ? 'proposed' : 'requested')),
            ),
          ),
        ].join('\n')
      : tr('Nothing is planned with {who} in the next two months.', { who });
  }

  if (about.intent === 'agreed') {
    const rows = inShared.length
      ? await ctx.db
          .selectFrom('decisions')
          .select(['conversation_id', 'title', 'decided_at'])
          .where('conversation_id', 'in', inShared)
          .where('status', '=', 'active')
          .orderBy('decided_at', 'desc')
          .limit(SHOWN)
          .execute()
      : [];
    return rows.length
      ? [
          tr('What you and {who} decided:', { who }),
          ...rows.map((r) => {
            const where = byId.get(r.conversation_id);
            return line(whose(...(where?.with ?? [])), r.title, where?.title, day(r.decided_at));
          }),
        ].join('\n')
      : tr('Nothing you and {who} decided is kept yet.', { who });
  }

  // Paid: the Pay cards between them in which one of those asked about pays the person.
  const cards = inShared.length
    ? await ctx.db
        .selectFrom('messages as m')
        .select(['m.conversation_id', 'm.sender_id', 'm.payload', 'm.created_at'])
        .where('m.conversation_id', 'in', inShared)
        .where('m.kind', '=', 'kit')
        .where(readableBy(me.id, now, 'm'))
        .where(sql`m.payload->>'kit'`, '=', 'payment_request')
        .orderBy('m.created_at', 'desc')
        .limit(40)
        .execute()
    : [];
  const paying = cards
    .flatMap((m) => {
      const card = (m.payload ?? {}) as {
        state?: string;
        fields?: Record<string, unknown>;
        share?: PaysShare | null;
        history?: Array<{ state?: string; by?: string }>;
      };
      if (card.state === 'cancelled') return [];
      const where = byId.get(m.conversation_id);
      // In a chat the other side is the other person; in a group, whoever said they'd paid.
      const other = where?.chat ? (m.sender_id === me.id ? (where.with[0] ?? null) : me.id) : null;
      const { payerId, payeeId } = paySides(card, m.sender_id, other);
      return payeeId === me.id && payerId && ids.includes(payerId)
        ? [{ card, payerId, at: m.created_at }]
        : [];
    })
    .slice(0, SHOWN);
  return paying.length
    ? [
        tr('Payments from {who}:', { who }),
        ...paying.map(({ card, payerId, at }) =>
          line(
            whose(payerId),
            kitHeadline('payment_request', card.fields ?? {}, locale),
            tr(kitStateLabel(card.state ?? 'requested')),
            day(at),
          ),
        ),
      ].join('\n')
    : tr('No card asks {who} to pay you.', { who });
}

/**
 * What's open, for the model: a heading and its lines, nothing else of theirs; only the parts
 * given (a friend reads only what's its to know).
 */
function contextLines(
  open: Open,
  parts: readonly OpenPart[] = OWN_QUESTIONS as OpenPart[],
): string {
  const part = (key: OpenPart, head: string, lines: string[], total: number) =>
    parts.includes(key) && lines.length ? [`${head} (${total}):`, ...lines] : [];
  return [
    ...part('waiting', 'Waiting on others', open.waiting, open.counts.waiting),
    ...part('asked', 'Asked of them', open.asked, open.counts.asked),
    ...part('mine', 'They said they would', open.mine, open.counts.mine),
    ...part('coming', 'Coming up this week', open.coming, open.coming.length),
  ].join('\n');
}

export function registerSystemJobs(): void {
  registerJob(SYSTEM_REPLY_JOB, systemReply);
}
