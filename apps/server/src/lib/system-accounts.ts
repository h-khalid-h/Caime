/**
 * Caime's own accounts at work (R67): Cai, the assistant, and the seven Caime Friends. Someone
 * opens a conversation with one (`openSystemConversation`, which says hello once); each message
 * they write queues `system.reply`, which answers the latest of theirs once, as the account,
 * through `sendMessage` like anyone's message. The friends say their scripts, a tip at a time,
 * with their sticker now and then. Cai answers what you wait on, what's asked of you, what you
 * said you'd do and what's coming up by the rules (no model, no cost, in an instant), and anything
 * else with the model only for an adult with AI assist on and an assist left today, reading that
 * conversation and what's open for them (never a private conversation's). Nothing here notifies:
 * Cai and the friends never need anyone.
 */
import {
  type CaiIntent,
  type CharacterHandle,
  caiIntent,
  firstName,
  formatDue,
  formatWhenAt,
  isCharacterHandle,
  msg,
  type SystemAccount,
  safeLocale,
  systemAccountOf,
  tr,
  trn,
} from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { todayForAgent } from './agent';
import { languageName } from './ai';
import { runAi } from './ai-run';
import { ensureDirectConversation } from './conversations';
import { AppError } from './errors';
import { asReader, languageOf } from './i18n';
import { registerJob } from './jobs';
import { SYSTEM_REPLY_JOB } from './message-effects';
import { messagePreview } from './messages';
import { assertAiAllowance } from './plans';
import { postAs } from './post-as';
import { cardsAhead } from './upcoming';
import { minorOf } from './users';

const SHOWN = 5;
const TRANSCRIPT_MESSAGES = 12;
const WEEK_MS = 7 * 86_400_000;
/** The sticker pack the friends send from: the app's `STICKER_PACK`. */
const PACK = 'caishy-friends';

/** Each friend's hello and its tips (keys, said in the reader's language), and its sticker. */
const SCRIPTS: Record<CharacterHandle, { hello: string; tips: string[]; sticker: string }> = {
  caishy: {
    hello: msg('Hi, I’m Caishy! Write me anything and I’ll share a little tip.'),
    tips: [
      msg(
        'Send a sticker from the button beside an empty message box. The Caishy Friends pack is free.',
      ),
      msg('Press and hold a message, or point at it on a computer, to react, reply or save it.'),
      msg('Your picture at the top opens you and your settings.'),
    ],
    sticker: 'caishy.happy',
  },
  momo: {
    hello: msg('Yay, you found me! I’m Momo. When nothing needs you, I’m the one cheering.'),
    tips: [
      msg('When Attention says nothing needs you, that’s Caime working. Enjoy it!'),
      msg('Mark something done in Actions, and whoever was waiting hears it.'),
      msg('Quiet hours keep your evenings yours: Settings, then Notifications.'),
    ],
    sticker: 'momo.excited',
  },
  panda: {
    hello: msg('I’m Panda. I stay by your side while you wait for someone.'),
    tips: [
      msg(
        'Ask someone for something, and it waits under “Waiting for” in Actions until they answer.',
      ),
      msg('When a wait goes quiet for three days, Attention asks whether it’s still open.'),
      msg('How you know someone can offer a follow-up when a question goes unanswered.'),
    ],
    sticker: 'panda.happy',
  },
  lumi: {
    hello: msg('Hello, I’m Lumi! I love making new things: groups, topics and spaces.'),
    tips: [
      msg('A space gathers the people, conversations and plans of one project.'),
      msg('A topic keeps one conversation about one thing, without starting over.'),
      msg('The + in Chats starts a conversation, a group or a space.'),
    ],
    sticker: 'lumi.curious',
  },
  pico: {
    hello: msg('Hi! I’m Pico, and I’m curious about everything.'),
    tips: [
      msg('Search understands sentences, like “what did Alex ask me last week”.'),
      msg('Search for someone’s name to find your conversations, files and promises with them.'),
      msg('Find people by their @handle in People.'),
    ],
    sticker: 'pico.curious',
  },
  niko: {
    hello: msg('I’m Niko. First steps are my favourite thing!'),
    tips: [
      msg('Connect with someone from People: their @handle, a link or a QR code.'),
      msg(
        'Tell Caime how you know someone. Only you see it, and it decides what reaches you when.',
      ),
      msg('Say hi first. Most good conversations start that way.'),
    ],
    sticker: 'niko.excited',
  },
  zuzu: {
    hello: msg('I’m Zuzu. I remember what was decided, so you don’t have to.'),
    tips: [
      msg('What was decided and what’s still open in a conversation are in its details.'),
      msg('Save a message to find it again in Saved.'),
      msg('A person’s page remembers what’s open between the two of you.'),
    ],
    sticker: 'zuzu.wink',
  },
};

/**
 * What a friend says to the reader's n-th message to it (1 is the first): a tip at a time (its
 * sticker came with its hello); then, with its sticker, where to go for more; then its sticker,
 * pointing at Cai again every third time.
 */
export function characterReply(
  handle: CharacterHandle,
  n: number,
): { text: string | null; sticker: string | null } {
  const { tips, sticker } = SCRIPTS[handle];
  if (n <= tips.length) return { text: tips[Math.max(0, n - 1)] ?? null, sticker: null };
  const after = n - tips.length;
  const pointer = msg('That’s all my tips. For anything else, write to @cai.');
  return { text: after % 3 === 1 ? pointer : null, sticker };
}

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
    const script = SCRIPTS[account.handle];
    await postAs(ctx, account.id, id, {
      kind: 'sticker',
      payload: { pack: PACK, sticker: script.sticker },
    });
    await postAs(ctx, account.id, id, tr(script.hello));
    return;
  }
  const me = await person(ctx, userId);
  const line = tr(
    'Hi {name}, I’m Cai. Ask me what you’re waiting on, what’s asked of you, what you said you’d do or what’s coming up.',
    { name: firstName(me.display_name) },
  );
  await postAs(ctx, account.id, id, [line, more(ctx, me)].filter(Boolean).join(' '));
}

const person = (ctx: AppContext, userId: string) =>
  ctx.db
    .selectFrom('users')
    .select(['id', 'display_name', 'birth_date', 'time_zone', 'locale', 'ai_enabled'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
type Person = Awaited<ReturnType<typeof person>>;

/** What else Cai can do for this person: with AI assist on, anything; never for a minor. */
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
  await asReader(ctx, personId, async () => {
    try {
      if (isCharacterHandle(account.handle))
        await friendSays(ctx, account, conversationId, personId);
      else await caiSays(ctx, account, conversationId, personId, latest);
    } catch (err) {
      // Blocked meanwhile, or the conversation gone: it just doesn't answer.
      if (!(err instanceof AppError)) throw err;
      ctx.log.debug({ code: err.code, account: account.handle }, 'system reply not sent');
    }
  });
}

async function friendSays(
  ctx: AppContext,
  account: SystemAccount,
  conversationId: string,
  personId: string,
) {
  const written = await ctx.db
    .selectFrom('messages')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('conversation_id', '=', conversationId)
    .where('sender_id', '=', personId)
    .executeTakeFirstOrThrow();
  const { text, sticker } = characterReply(account.handle as CharacterHandle, written.n);
  if (sticker)
    await postAs(ctx, account.id, conversationId, {
      kind: 'sticker',
      payload: { pack: PACK, sticker },
    });
  if (text) await postAs(ctx, account.id, conversationId, tr(text));
}

async function caiSays(
  ctx: AppContext,
  account: SystemAccount,
  conversationId: string,
  personId: string,
  latest: { kind: string; body: string | null },
) {
  const me = await person(ctx, personId);
  const intent = latest.kind === 'text' ? caiIntent(latest.body ?? '') : null;
  if (intent) {
    await postAs(ctx, account.id, conversationId, await ruleAnswer(ctx, me, intent));
    return;
  }
  const canModel = ctx.ai && me.ai_enabled && !minorOf(me, ctx.now());
  if (!canModel) {
    const why =
      ctx.ai && !minorOf(me, ctx.now())
        ? tr('I can answer that with AI assist on: Settings, then AI assist.')
        : tr('That one’s beyond me.');
    await postAs(ctx, account.id, conversationId, `${why} ${tr(HELP)}`);
    return;
  }
  let answer: string;
  try {
    ctx.limiter.hit(`ai:${personId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    await assertAiAllowance(ctx, personId);
    const [transcript, open] = await Promise.all([
      transcriptOf(ctx, conversationId, personId),
      openFor(ctx, me, { forModel: true }),
    ]);
    const ai = ctx.ai!;
    const language = languageName(await languageOf(ctx, personId));
    answer = await runAi(ctx, 'cai', personId, () =>
      ai.caiChat({
        transcript,
        context: contextLines(open),
        language,
        today: todayForAgent(ctx.now(), me.time_zone),
      }),
    );
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    // Out of assists, busy or declined: said in its words, with what the rules still answer.
    answer = `${err.message} ${tr(HELP)}`;
  }
  await postAs(ctx, account.id, conversationId, answer.slice(0, 4000));
}

const HELP = msg(
  'I can always tell you what you’re waiting on, what’s asked of you, what you said you’d do and what’s coming up this week. Just ask, in your own words.',
);

/** The conversation as the model reads it: "Person" and "Cai", oldest first, never a name. */
async function transcriptOf(ctx: AppContext, conversationId: string, personId: string) {
  const rows = await ctx.db
    .selectFrom('messages')
    .select(['sender_id', 'kind', 'body', 'payload', 'deleted_at'])
    .where('conversation_id', '=', conversationId)
    .where('deleted_at', 'is', null)
    .where('kind', '<>', 'system')
    .orderBy('seq', 'desc')
    .limit(TRANSCRIPT_MESSAGES)
    .execute();
  return rows
    .reverse()
    .map((m, i) => {
      const text = (m.kind === 'text' ? (m.body ?? '') : messagePreview(m)).replace(/\s+/g, ' ');
      return `[${i + 1}] ${m.sender_id === personId ? 'Person' : 'Cai'}: ${text.trim().slice(0, 600)}`;
    })
    .join('\n');
}

interface Open {
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
async function openFor(
  ctx: AppContext,
  me: Person,
  opts: { forModel?: boolean } = {},
): Promise<Open> {
  const now = ctx.now();
  const locale = safeLocale(me.locale);
  const zone = me.time_zone;
  const open = ctx.db
    .selectFrom('tasks as t')
    .leftJoin('conversations as c', 'c.id', 't.conversation_id')
    .where('t.status', 'in', ['open', 'accepted'])
    .where((eb) => eb.or([eb('t.owner_id', '=', me.id), eb('t.assignee_id', '=', me.id)]))
    .$if(Boolean(opts.forModel), (q) =>
      q.where((eb) =>
        eb.or([eb('c.privacy_class', 'is', null), eb('c.privacy_class', '<>', 'private')]),
      ),
    );
  const [rows, counts, cards] = await Promise.all([
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
      until: new Date(now.getTime() + WEEK_MS),
      limit: SHOWN,
      agreedOnly: true,
    }),
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
        r.due_at.getTime() < now.getTime() + WEEK_MS,
    )
    .map((r) => ({ at: r.due_at!, hasTime: r.due_has_time, title: r.title }));
  const coming = [...soon, ...cards.map((c) => ({ at: c.at, hasTime: c.hasTime, title: c.title }))]
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

/** What Cai says to a question the rules understood, from what's open. */
async function ruleAnswer(ctx: AppContext, me: Person, intent: CaiIntent): Promise<string> {
  if (intent === 'help') return [tr(HELP), more(ctx, me)].filter(Boolean).join(' ');
  const open = await openFor(ctx, me);
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

/** What's open, for the model: a heading and its lines, nothing else of theirs. */
function contextLines(open: Open): string {
  const part = (head: string, lines: string[], total: number) =>
    lines.length ? [`${head} (${total}):`, ...lines] : [];
  return [
    ...part('Waiting on others', open.waiting, open.counts.waiting),
    ...part('Asked of them', open.asked, open.counts.asked),
    ...part('They said they would', open.mine, open.counts.mine),
    ...part('Coming up this week', open.coming, open.coming.length),
  ].join('\n');
}

export function registerSystemJobs(): void {
  registerJob(SYSTEM_REPLY_JOB, systemReply);
}
