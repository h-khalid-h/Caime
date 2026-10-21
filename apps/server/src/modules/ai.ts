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
  AiAnswerView,
  AiCatchUpView,
  AiRewriteView,
  AiStatusView,
  AiTone,
  AiTranslationView,
} from '@caime/core';
import {
  AI_LABEL,
  AiAskBody,
  AiRewriteBody,
  AiTranslateBody,
  firstFutureWhen,
  firstName,
  PERSON_ALLOWANCES,
  previewText,
  resolvePolicy,
  systemText,
  truncate,
  writtenIn,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Conversation, Message } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { type AiResult, languageName, type Transcript } from '../lib/ai';
import { aiGate } from '../lib/ai-gate';
import { runAi } from '../lib/ai-run';
import { maskFor, maskId, maskPayload } from '../lib/business';
import { membership } from '../lib/conversation-views';
import { AppError, notFound } from '../lib/errors';
import { languageOf } from '../lib/i18n';
import { readableBy } from '../lib/messages';
import { activeRelationships, loadPolicies, policyTargetFor } from '../lib/relations';
import { createSuggestion, suggestionView } from '../lib/suggest';
import { transcriptClock, transcriptText, wordsFor } from '../lib/transcript';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

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

const quoted = (s: string, max = 100) => `“${previewText(s, max)}”`;

export async function aiRoutes(app: FastifyInstance, ctx: AppContext) {
  const person = (userId: string) =>
    ctx.db
      .selectFrom('users')
      .select(['ai_enabled', 'birth_date', 'locale', 'time_zone', 'age_minor_until', 'workweek'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

  /** Who may use AI assist, checked on every call (lib/ai-gate.ts). */
  const gate = (userId: string) => aiGate(ctx, userId);

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
      .where(readableBy(viewerId, ctx.now()))
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
    const { time } = transcriptClock(timeZone);
    // Newest first until the budget is spent, then numbered oldest first.
    const kept: Array<{ m: Message; text: string; speaker: string }> = [];
    let budget = TRANSCRIPT_CHARS;
    for (const m of rows) {
      const text =
        m.kind === 'system'
          ? systemText(mask ? maskPayload(m.payload, mask) : m.payload, viewerId)
          : wordsFor(m, MESSAGE_CHARS);
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
    const text = transcriptText(
      kept.map((k) => ({
        at: time(k.m.created_at),
        who: k.speaker,
        replyTo: k.m.reply_to_id ? lineOf.get(k.m.reply_to_id) : undefined,
        words: k.text,
      })),
    );
    return {
      transcript: { text, newFrom: firstNew >= 0 ? firstNew + 1 : null },
      lines,
      newCount: kept.filter(isNew).length,
    };
  }

  /**
   * Everything others wrote since the reader last read (M17 I3), counted as the transcript counts
   * what's new: a catch-up that read only the latest of it says so, never passing for the whole.
   */
  async function unreadSince(viewerId: string, conversationId: string, lastReadSeq: number) {
    const row = await ctx.db
      .selectFrom('messages')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('conversation_id', '=', conversationId)
      .where('seq', '>', String(lastReadSeq))
      .where('sender_id', 'is distinct from', viewerId)
      .where('kind', '<>', 'system')
      .where(readableBy(viewerId, ctx.now()))
      .executeTakeFirstOrThrow();
    return row.n;
  }

  const today = (timeZone: string) => transcriptClock(timeZone).day(ctx.now());

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
    const { ai } = await gate(auth.userId);
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
      .where(readableBy(auth.userId, ctx.now()))
      .executeTakeFirst();
    if (!message || message.deleted_at || !message.body?.trim()) throw notFound(tr('That message'));
    await readable(auth.userId, message.conversation_id);
    // Into the language they read Caime in, unless they asked for another (I1b).
    const to = body.to ?? (await languageOf(ctx, auth.userId));
    const language = languageName(to);
    const translation = await run('translate', auth.userId, () =>
      ai.translate({ text: truncate(message.body!, 4000), to: language }),
    );
    return { translation, to, language, label: AI_LABEL };
  });

  app.post('/conversations/:id/catch-up', async (req): Promise<AiCatchUpView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { ai, me } = await gate(auth.userId);
    const { me: seat } = await readable(auth.userId, id);
    const [{ transcript, lines, newCount }, unread] = await Promise.all([
      transcriptOf(auth.userId, id, Number(seat.last_read_seq), me.time_zone),
      unreadSince(auth.userId, id, Number(seat.last_read_seq)),
    ]);
    if (lines.length === 0) return { summary: null, label: null, newCount: 0, unread };
    const language = languageName(await languageOf(ctx, auth.userId));
    const summary = await run('catch-up', auth.userId, () =>
      ai.catchUp({
        transcript,
        language,
        today: today(me.time_zone),
      }),
    );
    return { summary, label: AI_LABEL, newCount, unread };
  });

  /**
   * A question about the conversation, answered from what the asker reads of it (R67): the same
   * transcript as a catch-up (never a private conversation, a hidden or deleted message, or who
   * on an organization's team wrote), in the language the question is asked in, kept nowhere.
   */
  app.post('/conversations/:id/ask', async (req): Promise<AiAnswerView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { question } = parse(AiAskBody, req.body);
    const { ai, me } = await gate(auth.userId);
    const { me: seat } = await readable(auth.userId, id);
    const { transcript, lines } = await transcriptOf(
      auth.userId,
      id,
      Number(seat.last_read_seq),
      me.time_zone,
    );
    if (lines.length === 0) return { answer: null, label: null };
    const language = languageName(writtenIn(question) ?? (await languageOf(ctx, auth.userId)));
    const answer = await run('ask', auth.userId, () =>
      ai.ask({
        transcript: { text: transcript.text, newFrom: null },
        question,
        language,
        today: today(me.time_zone),
      }),
    );
    return { answer, label: AI_LABEL };
  });

  app.post('/conversations/:id/ai/actions', async (req): Promise<AiActionsView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { ai, me, plan } = await gate(auth.userId);
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
      ai.findActions({
        transcript,
        today: today(me.time_zone),
        // The most capable model on a paid plan, the light one otherwise (M16 H7).
        tier: PERSON_ALLOWANCES[plan].aiModel,
      }),
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
        asked: true,
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
