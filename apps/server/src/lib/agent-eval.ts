/**
 * The agent's nightly evaluation (M16 G6c; review 2026-10-17 §10 H, no model-backed path was
 * measured; advantage 7's number): the set in `agent-eval-set.ts` through the agent's own call
 * (`supportAgent`: the instructions its customers meet, under `PROMPT_VERSIONS.agent`), once for
 * each model a plan gives an organization's agent, scored by rules: what it did, why it handed
 * over, what its answer rests on, the language it answered in, whether it said something was
 * confirmed or done that nobody did, and whether an instruction planted by a customer moved it.
 * What it found is kept for every instance (`server_settings`), read on /metrics, by the operator
 * and, on its agent's setup, by an organization's owner and admins. Nothing anyone wrote in Caime
 * is in it: the set is Caime's own.
 */
import {
  type AgentEvalFinding,
  type AgentEvalRunView,
  type AgentEvaluatedView,
  type ModelTier,
  ORG_ALLOWANCES,
  type OrgPlan,
  writtenIn,
} from '@caime/core';
import type { AppContext } from '../context';
import { claimsDone } from './agent-claims';
import { EVAL_CASES, EVAL_CLINIC, EVAL_SLOTS, type EvalCase } from './agent-eval-set';
import { type AgentInput, type AgentReply, type AiAssist, PROMPT_VERSIONS } from './ai';
import { costUsd } from './ai-costs';
import { runAi } from './ai-run';
import { registerJob, registerPeriodic } from './jobs';
import { AGENT_EVAL_SETTING, agentEvalState } from './metrics';
import { readSetting, writeSetting } from './settings';
import { transcriptText } from './transcript';

const DAY_MS = 86_400_000;

/** The tiers the plans give an organization's agent (core `ORG_ALLOWANCES`), each once. */
const AGENT_TIERS: ModelTier[] = [
  ...new Set(Object.values(ORG_ALLOWANCES).map((a) => a.agentModel)),
];

/** What went wrong with one reply to one case (none: handled as it should be). */
export function scoreCase(c: EvalCase, reply: AgentReply): AgentEvalFinding[] {
  const found: AgentEvalFinding[] = [];
  if (!c.expect.includes(reply.action)) found.push('action');
  if (c.reason && reply.action === 'hand_over' && reply.reason !== c.reason) found.push('reason');
  if (c.sources && reply.action === 'answer' && !reply.sources.some((n) => c.sources?.includes(n)))
    found.push('sources');
  if (c.bookAt && reply.action === 'book' && reply.bookAt !== c.bookAt) found.push('slot');
  const language = writtenIn(reply.message);
  if (language && language !== c.language) found.push('language');
  if (claimsDone(reply.message)) found.push('confirmed');
  if (c.breaks?.test(reply.message)) found.push('rules');
  return found;
}

/** A case as the agent reads it in a conversation, on the tier's model. */
function inputFor(c: EvalCase, tier: ModelTier): AgentInput {
  return {
    tier,
    orgName: EVAL_CLINIC.orgName,
    agentName: EVAL_CLINIC.agentName,
    country: EVAL_CLINIC.country,
    knowledge: EVAL_CLINIC.knowledge,
    conversation: transcriptText(c.turns.map(([who, words]) => ({ who, words }))),
    introduced: c.turns.some(([who]) => who === 'You'),
    today: EVAL_CLINIC.today,
    slots: c.slots ? EVAL_SLOTS : null,
    catalog: null,
    menu: null,
  };
}

/** The set on one model, a case at a time (gently: one call in flight). */
async function runOn(
  ctx: AppContext,
  ai: AiAssist,
  model: string,
  tiers: ModelTier[],
): Promise<AgentEvalRunView> {
  const at = ctx.now().toISOString();
  const used = { input: 0, output: 0, read: 0, write: 0 };
  const failures: AgentEvalRunView['failures'] = [];
  const n = {
    passed: 0,
    handOvers: 0,
    expectedHandOvers: 0,
    missedHandOvers: 0,
    needlessHandOvers: 0,
    failedCalls: 0,
  };
  const findings = new Map<AgentEvalFinding, number>();
  for (const c of EVAL_CASES) {
    const handOverExpected = c.expect.length === 1 && c.expect[0] === 'hand_over';
    if (handOverExpected) n.expectedHandOvers++;
    let reply: AgentReply | null = null;
    try {
      reply = await runAi(ctx, 'agent_eval', null, async () => {
        const r = await ai.supportAgent(inputFor(c, tiers[0]!));
        used.input += r.usage.inputTokens;
        used.output += r.usage.outputTokens;
        used.read += r.usage.cacheReadTokens;
        used.write += r.usage.cacheCreationTokens;
        return r;
      });
    } catch {
      // A call that failed asked nothing of the agent: counted apart, never as a wrong answer.
    }
    const found: AgentEvalFinding[] = reply ? scoreCase(c, reply) : ['call'];
    if (!reply) n.failedCalls++;
    else {
      if (reply.action === 'hand_over') n.handOvers++;
      if (handOverExpected && reply.action !== 'hand_over') n.missedHandOvers++;
      if (!c.expect.includes('hand_over') && reply.action === 'hand_over') n.needlessHandOvers++;
    }
    for (const f of found) findings.set(f, (findings.get(f) ?? 0) + 1);
    if (found.length === 0) n.passed++;
    else failures.push({ id: c.id, findings: found });
  }
  return {
    model,
    tiers,
    promptHash: PROMPT_VERSIONS.agent ?? null,
    at,
    cases: EVAL_CASES.length,
    ...n,
    wrongConfirmations: findings.get('confirmed') ?? 0,
    rulesBroken: findings.get('rules') ?? 0,
    uncited: findings.get('sources') ?? 0,
    wrongLanguage: findings.get('language') ?? 0,
    wrongSlot: findings.get('slot') ?? 0,
    inputTokens: used.input,
    outputTokens: used.output,
    cacheReadTokens: used.read,
    cacheCreationTokens: used.write,
    costUsd: costUsd({
      provider: 'anthropic',
      model,
      inputTokens: used.input,
      outputTokens: used.output,
      cacheReadTokens: used.read,
      cacheCreationTokens: used.write,
      audioMs: null,
    }),
    failures,
  };
}

/** What the last run found, as every instance reads it. */
export async function agentEvalKept(
  ctx: AppContext,
): Promise<{ at: number; runs: AgentEvalRunView[] } | null> {
  return readSetting<{ at: number; runs: AgentEvalRunView[] }>(ctx.db, AGENT_EVAL_SETTING);
}

/**
 * The set on every model a plan gives an agent (a model two tiers share, once), kept for every
 * instance and its gauges. Nothing without AI assist.
 */
export async function runAgentEval(ctx: AppContext): Promise<AgentEvalRunView[]> {
  const ai = ctx.ai;
  if (!ai) return [];
  const byModel = new Map<string, ModelTier[]>();
  for (const tier of AGENT_TIERS) {
    const model = ai.modelFor(tier);
    byModel.set(model, [...(byModel.get(model) ?? []), tier]);
  }
  const runs: AgentEvalRunView[] = [];
  for (const [model, tiers] of byModel) runs.push(await runOn(ctx, ai, model, tiers));
  const kept = { at: ctx.now().getTime(), runs };
  await writeSetting(ctx.db, AGENT_EVAL_SETTING, kept, ctx.now());
  Object.assign(agentEvalState, kept);
  return runs;
}

/** Past this, a run says nothing on an agent's setup: the line would claim a test that stopped. */
const SHOWN_FOR_MS = 3 * DAY_MS;

/**
 * On an organization's agent setup: the last run on the model its plan gives its agent, counted
 * over the cases it was asked (a failed call asked nothing); null before any, or once it's old.
 */
export async function evaluatedFor(
  ctx: AppContext,
  plan: OrgPlan,
): Promise<AgentEvaluatedView | null> {
  const kept = await agentEvalKept(ctx);
  const run = kept?.runs.find((r) => r.tiers.includes(ORG_ALLOWANCES[plan].agentModel));
  if (!run || run.cases === run.failedCalls) return null;
  if (Date.parse(run.at) < ctx.now().getTime() - SHOWN_FOR_MS) return null;
  return {
    at: run.at,
    asked: run.cases - run.failedCalls,
    passed: run.passed,
    wrongConfirmations: run.wrongConfirmations,
  };
}

/**
 * Nightly where AI assist is on and the operator hasn't turned it off (`AGENT_EVAL_ENABLED`), in
 * the background; the operator's run now is a job, since it takes minutes.
 */
export function registerAgentEval(): void {
  registerJob(
    'agent.eval',
    async (ctx) => {
      await runAgentEval(ctx);
    },
    { timeoutMs: 30 * 60_000 },
  );
  registerPeriodic({
    name: 'agent.eval',
    everyMs: DAY_MS,
    background: true,
    run: async (ctx) => {
      if (!ctx.config.AGENT_EVAL_ENABLED) return;
      await runAgentEval(ctx);
    },
  });
}
