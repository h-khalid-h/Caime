/**
 * Search as a communication knowledge layer (PRD §25): people, relationships, organizations,
 * messages, meaning-shaped questions, assets, actions and contexts, from one box.
 */

import type { SearchAnswerResponse, SearchResponse } from '@caime/core';
import {
  AI_LABEL,
  fromUnderstanding,
  isPlainText,
  looksLikeSentence,
  type ParsedQuery,
  parseSearchQuery,
  SearchAnswerBody,
  SearchOutcomeBody,
  SearchQuery,
  writtenIn,
} from '@caime/core';
import type { OkResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { languageName } from '../lib/ai';
import { aiGate } from '../lib/ai-gate';
import { runAi } from '../lib/ai-run';
import { answerFrom, searchPassages, when } from '../lib/answers';
import { AppError } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { languageOf } from '../lib/i18n';
import { orgsClosedToApps } from '../lib/member-apps';
import { assertAiAllowance } from '../lib/plans';
import { runSearch } from '../lib/search-run';
import { TtlCache } from '../lib/ttl-cache';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** How long a model's reading of one person's query is kept: retyping it costs nothing more. */
const UNDERSTOOD_MS = 10 * 60_000;
const UNDERSTOOD_MAX = 5_000;
const understood = new TtlCache<string, ParsedQuery>(UNDERSTOOD_MAX, UNDERSTOOD_MS);

/**
 * Natural-language search (R17, PRD §25): when the rules understood nothing of a query that
 * reads like a sentence, and the person has AI assist on (an adult, within their plan's
 * allowance, a server with a provider), a model reads it into the same structure the rules
 * fill, which then runs as any query does. Anything that stops that (AI off, out of allowance,
 * the model busy or declining) falls back to the text match, silently: search always answers.
 * The model sees the words typed and nothing else; a reading is kept ten minutes per person.
 */
async function understandWithAi(
  ctx: AppContext,
  userId: string,
  parsed: ParsedQuery,
): Promise<ParsedQuery | null> {
  const ai = ctx.ai;
  if (!ai || !isPlainText(parsed) || !looksLikeSentence(parsed.raw)) return null;
  const key = `${userId}:${parsed.raw.trim().toLocaleLowerCase()}`;
  const hit = understood.get(key);
  if (hit) return hit;
  const me = await ctx.db
    .selectFrom('users')
    .select(['ai_enabled', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!me?.ai_enabled || minorOf(me, ctx.now())) return null;
  try {
    await assertAiAllowance(ctx, userId);
    const reading = await runAi(ctx, 'search', userId, () =>
      ai.understandSearch({ query: parsed.raw }),
    );
    const result = fromUnderstanding(parsed.raw, reading);
    understood.set(key, result);
    return result;
  } catch (err) {
    // Out of allowance, or the model couldn't: the rules' reading stands.
    if (err instanceof AppError) return null;
    throw err;
  }
}

/**
 * "Ask Cai" in Search (R66, R17): a question answered from what search finds in the asker's own
 * messages, through the one answer engine (`lib/answers.ts`, M17 I4): the same reading as a search
 * (the rules, the model's only when they understood nothing), `runSearch`'s own rows as the
 * passages, the cited rows back as `sources`. No rows, no model; kept nowhere.
 */
async function answerFromSearch(
  ctx: AppContext,
  me: string,
  question: string,
): Promise<SearchAnswerResponse> {
  const { ai, me: person } = await aiGate(ctx, me);
  const rules = parseSearchQuery(question, { now: ctx.now() });
  const parsed = (await understandWithAi(ctx, me, rules)) ?? rules;
  const zone = person.time_zone || 'UTC';
  const passages = await searchPassages(ctx, me, parsed, zone);
  if (passages.length === 0) return { answer: null, label: null, sources: {} };
  const language = languageName(writtenIn(question) ?? (await languageOf(ctx, me)));
  const { answer, cited } = await answerFrom(ctx, me, 'search-answer', {
    ai,
    question,
    passages,
    scope: 'search',
    period: parsed.period?.label ?? null,
    language,
    today: when(ctx.now().toISOString(), zone, false),
  });
  return {
    answer,
    label: tr(AI_LABEL),
    sources: {
      messages: cited.flatMap((s) => (s.kind === 'message' ? [s.item] : [])),
      decisions: cited.flatMap((s) => (s.kind === 'decision' ? [s.item] : [])),
      tasks: cited.flatMap((s) => (s.kind === 'task' ? [s.item] : [])),
    },
  };
}

export async function searchRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * How long finding something took (PRD §83, information retrieval), from the app's search: a
   * time and whether anything was opened. Kept without anyone's id, and nothing searched for.
   */
  app.post('/search/outcome', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const body = parse(SearchOutcomeBody, req.body);
    ctx.limiter.hit(`search-outcome:${auth.userId}`, ctx.config.isTest ? 1000 : 120, 3_600_000);
    await recordEvent(ctx.db, 'search.outcome', null, body);
    return { ok: true };
  });

  app.get('/search', async (req): Promise<SearchResponse> => {
    const auth = requireAuth(req);
    const { q, limit, understand } = parse(SearchQuery, req.query);
    ctx.limiter.hit(`search:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    const rules = parseSearchQuery(q, { now: ctx.now() });
    const read = understand === '1' ? await understandWithAi(ctx, auth.userId, rules) : null;
    const closed = await orgsClosedToApps(ctx, auth);
    const response = await runSearch(ctx, auth.userId, read ?? rules, limit, closed);
    return read ? { ...response, understoodBy: 'ai', label: tr(AI_LABEL) } : response;
  });

  app.post('/search/answer', async (req): Promise<SearchAnswerResponse> => {
    const auth = requireAuth(req);
    const { q } = parse(SearchAnswerBody, req.body);
    return answerFromSearch(ctx, auth.userId, q);
  });
}
