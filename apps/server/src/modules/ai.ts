/**
 * AI assist routes (PRD §45). Four things, each only when the server has a provider, the
 * person is an adult and turned AI assist on, and the conversation isn't private (R17, R18):
 *
 * - rewrite a draft (clearer, shorter, more formal, friendlier), in the relationship's tone;
 * - translate a message into the reader's language;
 * - catch the reader up on a conversation;
 * - find its follow-ups, filed as ordinary suggestions that wait for a tap (R12).
 *
 * What a model wrote is returned, never applied. Nothing here is logged but the failure reason.
 */

import type {
  AiActionsView,
  AiCatchUpView,
  AiRewriteView,
  AiStatusView,
  AiTone,
  AiTranslationView,
} from '@caime/core';
import {
  AI_LABEL,
  AiRewriteBody,
  AiTranslateBody,
  firstFutureWhen,
  firstName,
  messagePreview,
  resolvePolicy,
  systemText,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Conversation, Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { type AiResult, languageName, type Transcript } from '../lib/ai';
import { runAi } from '../lib/ai-run';
import { maskFor, maskId, maskPayload } from '../lib/business';
import { AppError, notFound } from '../lib/errors';
import { assertAiAllowance } from '../lib/plans';
import { activeRelationships, loadPolicies, policyTargetFor } from '../lib/relations';
import { createSuggestion } from '../lib/suggest';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership } from './conversations';
import { suggestionView } from './suggestions';

/** How much of a conversation a model reads: the newest messages, within both limits. */
const TRANSCRIPT_MESSAGES = 200;
const TRANSCRIPT_CHARS = 60_000;
const MESSAGE_CHARS = 1_500;

interface Line {
  n: number;
  messageId: string;
  senderId: string | null;
  speaker: string;
  text: string;
  at: Date;
}

const quoted = (s: string, max = 100) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return `“${one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one}”`;
};

/** "Wed 23 Sep 14:05" and "Wednesday 23 September 2026", the same on every ICU version. */
function clock(timeZone: string) {
  const parts = (options: Intl.DateTimeFormatOptions) => {
    const f = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
    return (d: Date) =>
      Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value])) as Record<
        string,
        string
      >;
  };
  const short = parts({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const long = parts({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return {
    time: (d: Date) => {
      const p = short(d);
      return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`;
    },
    day: (d: Date) => {
      const p = long(d);
      return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
    },
  };
}

/** The base language of a locale: "ar-EG" → "ar". */
function baseLanguage(locale: string): string {
  try {
    return new Intl.Locale(locale).language;
  } catch {
    return locale.split('-')[0] || 'en';
  }
}

export async function aiRoutes(app: FastifyInstance, ctx: AppContext) {
  const person = (userId: string) =>
    ctx.db
      .selectFrom('users')
      .select(['ai_enabled', 'birth_date', 'locale', 'time_zone', 'workweek'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

  /** Who may use AI assist, checked on every call. */
  async function gate(userId: string) {
    const ai = ctx.ai;
    if (!ai)
      throw new AppError(503, 'ai_unavailable', tr('AI assist isn’t set up on this server.'));
    const me = await person(userId);
    if (minorOf(me, ctx.now()))
      throw new AppError(403, 'ai_adults_only', tr('AI assist is for adults for now.'));
    if (!me.ai_enabled)
      throw new AppError(403, 'ai_off', tr('Turn on AI assist in Settings to use it.'));
    ctx.limiter.hit(`ai:${userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    await assertAiAllowance(ctx, userId);
    return { ai, me };
  }

  /** A conversation the person is in, and that a server model may read (R18). */
  async function readable(userId: string, conversationId: string) {
    const found = await membership(ctx, userId, conversationId);
    if (found.conversation.privacy_class === 'private')
      throw new AppError(
        403,
        'ai_private',
        tr('This conversation is private, so AI assist can’t read it.'),
      );
    return found;
  }

  /** One model call, recorded, and a failure turned into something the person can act on. */
  const run = <T>(feature: string, userId: string, work: () => Promise<AiResult<T>>) =>
    runAi(ctx, feature, userId, work);

  /** The viewer's tone for this conversation, from their relationship policy (PRD §39). */
  async function toneFor(userId: string, conversation: Conversation): Promise<AiTone> {
    if (conversation.kind !== 'direct') return 'neutral';
    const other = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversation.id)
      .where('user_id', '<>', userId)
      .executeTakeFirst();
    if (!other) return 'neutral';
    const [policies, rels] = await Promise.all([
      loadPolicies(ctx.db, userId),
      activeRelationships(ctx.db, userId, [other.user_id]),
    ]);
    return resolvePolicy(policies, policyTargetFor(rels[0], conversation.connection_id)).aiTone;
  }

  /** What the viewer sees of the conversation, newest last, with names rather than ids. */
  async function transcriptOf(
    viewerId: string,
    conversationId: string,
    lastReadSeq: number,
    timeZone: string,
  ): Promise<{ transcript: Transcript; lines: Line[]; newCount: number }> {
    const rows = (await ctx.db
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('conversation_id', '=', conversationId)
      .where('deleted_at', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('hidden_messages')
              .select('message_id')
              .whereRef('hidden_messages.message_id', '=', 'messages.id')
              .where('hidden_messages.user_id', '=', viewerId),
          ),
        ),
      )
      .orderBy('seq', 'desc')
      .limit(TRANSCRIPT_MESSAGES)
      .execute()) as Message[];
    // A customer's transcript names the organization, never who on its team wrote (R15).
    const mask = await maskFor(ctx.db, conversationId, viewerId);
    const senderIds = [...new Set(rows.map((m) => m.sender_id).filter((x): x is string => !!x))];
    const names = new Map(
      senderIds.length
        ? (
            await ctx.db
              .selectFrom('users')
              .select(['id', 'display_name'])
              .where('id', 'in', senderIds)
              .execute()
          ).map((u) => [u.id, u.display_name])
        : [],
    );
    const { time } = clock(timeZone);
    // Newest first until the budget is spent, then numbered oldest first.
    const kept: Array<{ m: Message; text: string; speaker: string }> = [];
    let budget = TRANSCRIPT_CHARS;
    for (const m of rows) {
      const text =
        m.kind === 'system'
          ? systemText(mask ? maskPayload(m.payload, mask) : m.payload, viewerId)
          : m.kind === 'text'
            ? (m.body ?? '').slice(0, MESSAGE_CHARS)
            : messagePreview({ kind: m.kind, body: m.body, payload: m.payload, deleted: false });
      if (!text.trim()) continue;
      const speaker =
        m.kind === 'system'
          ? 'Caime'
          : m.sender_id === viewerId
            ? 'You'
            : mask
              ? mask.orgName
              : (names.get(m.sender_id ?? '') ?? 'Someone');
      budget -= text.length + speaker.length + 32;
      if (budget < 0 && kept.length > 0) break;
      kept.push({ m, text, speaker });
    }
    kept.reverse();
    const lineOf = new Map(kept.map((k, i) => [k.m.id, i + 1]));
    const lines: Line[] = kept.map((k, i) => ({
      n: i + 1,
      messageId: k.m.id,
      senderId: mask ? maskId(mask, k.m.sender_id) : k.m.sender_id,
      speaker: k.speaker,
      text: k.text,
      at: k.m.created_at,
    }));
    const isNew = (k: (typeof kept)[number]) =>
      Number(k.m.seq) > lastReadSeq && k.m.sender_id !== viewerId && k.m.kind !== 'system';
    const firstNew = kept.findIndex(isNew);
    const text = kept
      .map((k, i) => {
        const reply = k.m.reply_to_id ? lineOf.get(k.m.reply_to_id) : undefined;
        const body = k.text.replace(/\r?\n/g, ' ⏎ ');
        return `[${i + 1}] ${time(k.m.created_at)} · ${k.speaker}: ${
          reply ? `(replying to [${reply}]) ` : ''
        }${body}`;
      })
      .join('\n');
    return {
      transcript: { text, newFrom: firstNew >= 0 ? firstNew + 1 : null },
      lines,
      newCount: kept.filter(isNew).length,
    };
  }

  const today = (timeZone: string) => clock(timeZone).day(ctx.now());

  app.get('/ai', async (req): Promise<AiStatusView> => {
    const auth = requireAuth(req);
    const me = await person(auth.userId);
    return {
      available: Boolean(ctx.ai),
      enabled: me.ai_enabled,
      eligible: !minorOf(me, ctx.now()),
    };
  });

  app.post('/ai/rewrite', async (req): Promise<AiRewriteView> => {
    const auth = requireAuth(req);
    const body = parse(AiRewriteBody, req.body);
    const { ai } = await gate(auth.userId);
    const { conversation } = await readable(auth.userId, body.conversationId);
    const tone = await toneFor(auth.userId, conversation);
    const suggestion = await run('rewrite', auth.userId, () =>
      ai.rewrite({ text: body.text, style: body.style, tone }),
    );
    return { suggestion, label: AI_LABEL };
  });

  app.post('/ai/translate', async (req): Promise<AiTranslationView> => {
    const auth = requireAuth(req);
    const body = parse(AiTranslateBody, req.body);
    const { ai, me } = await gate(auth.userId);
    // One answer for "no such message" and "not yours to read", so ids can't be probed.
    const message = await ctx.db
      .selectFrom('messages')
      .innerJoin('participants as p', (j) =>
        j
          .onRef('p.conversation_id', '=', 'messages.conversation_id')
          .on('p.user_id', '=', auth.userId)
          .on('p.left_at', 'is', null),
      )
      .select(['messages.conversation_id', 'messages.body', 'messages.deleted_at'])
      .where('messages.id', '=', body.messageId)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('hidden_messages')
              .select('message_id')
              .whereRef('hidden_messages.message_id', '=', 'messages.id')
              .where('hidden_messages.user_id', '=', auth.userId),
          ),
        ),
      )
      .executeTakeFirst();
    if (!message || message.deleted_at || !message.body?.trim()) throw notFound(tr('That message'));
    await readable(auth.userId, message.conversation_id);
    const to = body.to ?? baseLanguage(me.locale);
    const language = languageName(to);
    const translation = await run('translate', auth.userId, () =>
      ai.translate({ text: message.body!.slice(0, 4000), to: language }),
    );
    return { translation, to, language, label: AI_LABEL };
  });

  app.post('/conversations/:id/catch-up', async (req): Promise<AiCatchUpView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { ai, me } = await gate(auth.userId);
    const { me: seat } = await readable(auth.userId, id);
    const { transcript, lines, newCount } = await transcriptOf(
      auth.userId,
      id,
      Number(seat.last_read_seq),
      me.time_zone,
    );
    if (lines.length === 0) return { summary: null, label: null, newCount: 0 };
    const summary = await run('catch-up', auth.userId, () =>
      ai.catchUp({
        transcript,
        language: languageName(baseLanguage(me.locale)),
        today: today(me.time_zone),
      }),
    );
    return { summary, label: AI_LABEL, newCount };
  });

  app.post('/conversations/:id/ai/actions', async (req): Promise<AiActionsView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { ai, me } = await gate(auth.userId);
    const { conversation, me: seat } = await readable(auth.userId, id);
    // A customer's follow-ups never point at who on an organization's team wrote (R15), and what
    // they wait for from it is the conversation's own state; the team's are ordinary ones.
    const mask = conversation.kind === 'business' ? await maskFor(ctx.db, id, auth.userId) : null;
    const { transcript, lines } = await transcriptOf(
      auth.userId,
      id,
      Number(seat.last_read_seq),
      me.time_zone,
    );
    if (lines.length === 0) return { found: [], label: AI_LABEL };
    const items = await run('actions', auth.userId, () =>
      ai.findActions({ transcript, today: today(me.time_zone) }),
    );
    const others = await ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['u.id', 'u.display_name'])
      .where('p.conversation_id', '=', id)
      .where('p.user_id', '<>', auth.userId)
      .execute();
    /** The person a "waiting" item names, among the others here. */
    const personNamed = (who: string | null): string | null => {
      if (!who) return null;
      const w = who.toLocaleLowerCase();
      const exact = others.filter((o) => o.display_name.toLocaleLowerCase() === w);
      if (exact.length === 1) return exact[0]!.id;
      const first = others.filter((o) => firstName(o.display_name).toLocaleLowerCase() === w);
      return first.length === 1 ? first[0]!.id : null;
    };
    // What's already suggested (by the heuristics or an earlier run) or tracked, for every line
    // at once: three queries for the set, never two per item.
    const lineIds = [...new Set(lines.map((l) => l.messageId))];
    const [suggestedRows, decidedRows, taskedRows] = await Promise.all([
      ctx.db
        .selectFrom('suggestions')
        .select(['message_id', 'kind'])
        .where('user_id', '=', auth.userId)
        .where('message_id', 'in', lineIds)
        .execute(),
      ctx.db
        .selectFrom('decisions')
        .select('message_id')
        .where('message_id', 'in', lineIds)
        .where('status', '=', 'active')
        .execute(),
      ctx.db
        .selectFrom('tasks')
        .select('message_id')
        .where('message_id', 'in', lineIds)
        .where('owner_id', '=', auth.userId)
        .execute(),
    ]);
    const suggested = new Set(suggestedRows.map((r) => `${r.message_id}:${r.kind}`));
    const decided = new Set(decidedRows.map((r) => r.message_id));
    const tasked = new Set(taskedRows.map((r) => r.message_id));
    const created: string[] = [];
    for (const item of items) {
      const line = lines[item.line - 1];
      if (!line) continue;
      let subject: string | null = null;
      if (item.kind === 'waiting') {
        if (mask) continue;
        subject =
          personNamed(item.who) ??
          (line.senderId && line.senderId !== auth.userId ? line.senderId : null) ??
          (conversation.kind === 'direct' && others.length === 1 ? others[0]!.id : null);
        if (!subject) continue;
      }
      // Already suggested (by the heuristics or an earlier run) or already tracked: skip it.
      const family = item.kind === 'task' ? ['task', 'reminder'] : [item.kind];
      const tracked = item.kind === 'decision' ? decided : tasked;
      if (
        family.some((k) => suggested.has(`${line.messageId}:${k}`)) ||
        tracked.has(line.messageId)
      )
        continue;
      suggested.add(`${line.messageId}:${item.kind}`);
      const when =
        item.kind !== 'decision' && item.due
          ? firstFutureWhen(item.due, {
              now: line.at,
              timeZone: me.time_zone,
              locale: me.locale,
              workweek: me.workweek,
            })
          : undefined;
      // An organization is named in full; a person by their first name.
      const speaker =
        line.speaker === 'You' ? tr('You') : mask ? line.speaker : firstName(line.speaker);
      const suggestionId = await createSuggestion(ctx, {
        userId: auth.userId,
        kind: item.kind,
        title: item.title,
        rationale: tr('{speaker} wrote {quote}', { speaker, quote: quoted(line.text) }),
        confidence: 0.8,
        payload: {
          source: 'ai',
          dueHasTime: Boolean(when?.time),
          ...(item.kind === 'decision' && line.senderId && (!mask || line.senderId === auth.userId)
            ? { decidedBy: line.senderId }
            : {}),
        },
        subjectUserId: subject,
        conversationId: id,
        messageId: line.messageId,
        dueAt: when?.at ?? null,
        dueText: when ? item.due : null,
        fingerprint: `ai:${line.messageId}:${item.kind}`,
      });
      if (suggestionId) created.push(suggestionId);
    }
    const found = created.length
      ? await ctx.db
          .selectFrom('suggestions')
          .selectAll()
          .where('id', 'in', created)
          .orderBy('created_at')
          .execute()
      : [];
    return { found: found.map(suggestionView), label: AI_LABEL };
  });
}
