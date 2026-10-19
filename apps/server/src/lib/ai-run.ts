/**
 * One model call, recorded in `ai_runs` (feature, model, tokens, time, outcome, the version of
 * its instructions; never the text), counted in the metrics, and a failure turned into
 * something the person can act on. The AI routes and natural-language search share it, so every
 * call is counted the same way.
 */
import { uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { AiError, type AiResult, type AiUsage, PROMPT_VERSIONS } from './ai';
import { chargedUsd } from './ai-costs';
import { AppError } from './errors';

/**
 * One model call, recorded in `ai_runs` (feature, model, tokens, time, outcome, which version
 * of its instructions; never the text), and a failure turned into something the person can act
 * on.
 */
export async function runAi<T>(
  ctx: AppContext,
  feature: string,
  /** Whose it is; null for Caime's own (the agent's nightly evaluation, M16 G6c). */
  userId: string | null,
  work: () => Promise<AiResult<T>>,
  /** Who answered: Anthropic for the model features, the speech provider for a transcript. */
  provider = 'anthropic',
): Promise<T> {
  const started = Date.now();
  const record = (outcome: string, usage: AiUsage | null) => {
    ctx.metrics.ai.inc({ feature, outcome });
    ctx.metrics.aiSeconds.observe({ feature }, (Date.now() - started) / 1000);
    if (usage) {
      ctx.metrics.aiTokens.inc({ feature, direction: 'input' }, usage.inputTokens);
      ctx.metrics.aiTokens.inc({ feature, direction: 'output' }, usage.outputTokens);
      if (usage.cacheReadTokens)
        ctx.metrics.aiTokens.inc({ feature, direction: 'cache_read' }, usage.cacheReadTokens);
      if (usage.cacheCreationTokens)
        ctx.metrics.aiTokens.inc(
          { feature, direction: 'cache_creation' },
          usage.cacheCreationTokens,
        );
    }
    const model = usage?.model ?? (provider === 'anthropic' ? (ctx.ai?.model ?? null) : null);
    ctx.defer('ai run', () =>
      ctx.db
        .insertInto('ai_runs')
        .values({
          id: uuidv7(),
          user_id: userId,
          feature,
          provider,
          model,
          input_tokens: usage?.inputTokens ?? null,
          output_tokens: usage?.outputTokens ?? null,
          cache_read_tokens: usage?.cacheReadTokens ?? null,
          cache_creation_tokens: usage?.cacheCreationTokens ?? null,
          audio_ms: usage?.audioMs ?? null,
          latency_ms: Date.now() - started,
          outcome,
          prompt_hash: PROMPT_VERSIONS[feature] ?? null,
          // Priced as it ran, which is what an allowance counts (M16 G9).
          cost_usd: usage
            ? chargedUsd({
                provider,
                model,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: usage.cacheReadTokens ?? null,
                cacheCreationTokens: usage.cacheCreationTokens ?? null,
                audioMs: usage.audioMs ?? null,
              })
            : null,
        })
        .execute(),
    );
  };
  try {
    const result = await work();
    record('ok', result.usage);
    return result.value;
  } catch (err) {
    if (!(err instanceof AiError)) {
      record('error', null);
      throw err;
    }
    record(err.reason, err.usage);
    ctx.log.warn({ feature, reason: err.reason, detail: err.message }, 'ai assist failed');
    if (err.reason === 'declined')
      throw new AppError(422, 'ai_declined', tr('Cai can’t help with this one.'));
    if (err.reason === 'busy')
      throw new AppError(503, 'ai_busy', tr('AI assist is busy. Try again in a moment.'));
    throw new AppError(502, 'ai_failed', tr('AI assist didn’t work this time. Try again.'));
  }
}
