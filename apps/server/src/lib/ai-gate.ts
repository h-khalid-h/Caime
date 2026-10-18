/**
 * Who may use AI assist (PRD §45, R17), checked on every call by every route that asks a model
 * for a person: a server with a provider, an adult who turned it on, within the hour's rate and
 * their plan's allowance. One answer for each refusal, in the request's language.
 */
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import type { AiAssist } from './ai';
import { AppError } from './errors';
import { assertAiAllowance } from './plans';
import { minorOf } from './users';

export async function aiGate(ctx: AppContext, userId: string) {
  const ai: AiAssist | null = ctx.ai;
  if (!ai) throw new AppError(503, 'ai_unavailable', tr('AI assist isn’t set up on this server.'));
  const me = await ctx.db
    .selectFrom('users')
    .select(['ai_enabled', 'birth_date', 'locale', 'time_zone', 'age_minor_until', 'workweek'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (minorOf(me, ctx.now()))
    throw new AppError(403, 'ai_adults_only', tr('AI assist is for adults for now.'));
  if (!me.ai_enabled)
    throw new AppError(403, 'ai_off', tr('Turn on AI assist in Settings to use it.'));
  ctx.limiter.hit(`ai:${userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
  await assertAiAllowance(ctx, userId);
  return { ai, me };
}
