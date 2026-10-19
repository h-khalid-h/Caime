/**
 * What a model call costs (M16 H7, docs/RESOURCES.md "What a person costs"): each provider's list
 * price as its own page stated it on the day beside it, in US dollars, and the European Central
 * Bank's euro reference rate of that week to say it in euros. A price that changes is a line here
 * with the day it was read; nothing else prices a call. A model or a provider that isn't listed is
 * never guessed at: its calls are counted as unpriced.
 */

import { SPEECH_MAX_MS } from './speech';

/** US dollars a million tokens: input, a write to the five-minute cache, a read from it, output. */
export interface TokenPrices {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

interface ModelPrices {
  /** The model's id as the API answers it; a dated id (`…-20261001`) is its family's. */
  id: string;
  prices: TokenPrices;
  /** A dearer rate for a prompt longer than `over` tokens (input, cache reads and writes). */
  long?: { over: number; prices: TokenPrices };
}

/** Anthropic's list prices (its pricing page, read on `PRICES.read`). */
export const PRICES = {
  read: '2026-10-19',
  source: 'https://platform.claude.com/docs/en/about-claude/pricing',
  /** US dollars to the euro: the ECB's euro foreign exchange reference rate on `rateOn`. */
  usdPerEur: 1.1253,
  rateOn: '2026-10-16',
} as const;

const per = (input: number, cacheWrite: number, cacheRead: number, output: number) => ({
  input,
  cacheWrite,
  cacheRead,
  output,
});

const MODELS: readonly ModelPrices[] = [
  { id: 'claude-fable-5-1', prices: per(10, 12.5, 0.25, 50) },
  { id: 'claude-fable-5', prices: per(10, 12.5, 1, 50) },
  { id: 'claude-opus-5-5', prices: per(4, 5, 0.2, 20) },
  { id: 'claude-opus-5', prices: per(5, 6.25, 0.5, 25) },
  { id: 'claude-opus-4-8', prices: per(5, 6.25, 0.5, 25) },
  { id: 'claude-opus-4-7', prices: per(5, 6.25, 0.5, 25) },
  { id: 'claude-opus-4-6', prices: per(5, 6.25, 0.5, 25) },
  { id: 'claude-opus-4-5', prices: per(5, 6.25, 0.5, 25) },
  { id: 'claude-sonnet-5-5', prices: per(2, 2.5, 0.1, 10) },
  { id: 'claude-sonnet-5', prices: per(2, 2.5, 0.2, 10) },
  { id: 'claude-sonnet-4-6', prices: per(3, 3.75, 0.3, 15) },
  { id: 'claude-sonnet-4-5', prices: per(3, 3.75, 0.3, 15) },
  {
    id: 'claude-haiku-5-5',
    prices: per(0.1, 0.125, 0.01, 0.5),
    long: { over: 100_000, prices: per(0.5, 0.625, 0.05, 2.5) },
  },
  { id: 'claude-haiku-4-5', prices: per(1, 1.25, 0.1, 5) },
];

/** The longest prompt any listed model prices at its first rate (Haiku 5.5's). */
export const LONG_PROMPT = 100_000;

/** A model's prices by the id the API answered with, or null when it isn't on the list. */
export function modelPrices(model: string | null): ModelPrices | null {
  if (!model) return null;
  return (
    MODELS.find(
      (m) =>
        model === m.id ||
        (model.startsWith(`${m.id}-`) && /^\d{8}$/.test(model.slice(m.id.length + 1))),
    ) ?? null
  );
}

/**
 * Speech to text, US dollars an audio minute, as each provider's page estimated it on the day
 * beside it (OpenAI's per-minute estimate of its token prices; ElevenLabs' hourly rate). Scribe v1,
 * which ElevenLabs deprecated for v2, isn't on its page any more: unpriced.
 */
export const SPEECH_PRICES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  openai: { 'gpt-4o-transcribe': 0.006, 'gpt-4o-mini-transcribe': 0.003, 'whisper-1': 0.006 },
  elevenlabs: { scribe_v2: 0.22 / 60 },
};
export const SPEECH_PRICES_READ = '2026-10-19';

/** What a call used, as `ai_runs` keeps it. */
export interface CallUse {
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  /** A recording's length, for a provider that bills by the minute. */
  audioMs: number | null;
  /** Whether the prompt was past `LONG_PROMPT` tokens; worked out from the tokens when absent. */
  long?: boolean;
}

/**
 * What a call (or a sum of calls on one model) cost in US dollars: nothing for one that never got
 * an answer (no tokens, no model), null for one on a model or provider the list doesn't name, or a
 * recording whose length wasn't kept.
 */
export function costUsd(use: CallUse): number | null {
  if (use.provider !== 'anthropic') {
    if (use.model === null) return 0;
    const perMinute = SPEECH_PRICES[use.provider]?.[use.model];
    if (perMinute === undefined || use.audioMs === null) return null;
    return (use.audioMs / 60_000) * perMinute;
  }
  const input = use.inputTokens ?? 0;
  const read = use.cacheReadTokens ?? 0;
  const write = use.cacheCreationTokens ?? 0;
  const output = use.outputTokens ?? 0;
  if (input + read + write + output === 0) return 0;
  const found = modelPrices(use.model);
  if (!found) return null;
  const long = use.long ?? input + read + write > LONG_PROMPT;
  const p = long && found.long ? found.long.prices : found.prices;
  return (input * p.input + write * p.cacheWrite + read * p.cacheRead + output * p.output) / 1e6;
}

/**
 * What a call counts for against an allowance (M16 G9, R107): what it cost, or, for one the list
 * can't price (a model or a provider it doesn't name, a recording whose length wasn't kept), the
 * dearest listed rate for what it used: never nothing, so an unlisted model is no way past one.
 */
export function chargedUsd(use: CallUse): number {
  const priced = costUsd(use);
  if (priced !== null) return priced;
  if (use.provider !== 'anthropic') {
    const perMinute = Math.max(...Object.values(SPEECH_PRICES).flatMap((p) => Object.values(p)));
    return ((use.audioMs ?? SPEECH_MAX_MS) / 60_000) * perMinute;
  }
  const dearest = MODELS.reduce((a, m) => (m.prices.output > a.prices.output ? m : a));
  return costUsd({ ...use, model: dearest.id }) ?? 0;
}

/** Euros of an allowance in US dollars at the list's rate, to compare with what calls cost. */
export const inDollars = (eur: number) => eur * PRICES.usdPerEur;

/** US dollars in euros at the list's rate, to a hundredth of a cent. */
export const inEuros = (usd: number) => Math.round((usd / PRICES.usdPerEur) * 10_000) / 10_000;
