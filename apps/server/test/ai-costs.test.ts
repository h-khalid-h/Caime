/**
 * What a person costs (M16 H7, docs/RESOURCES.md "What a person costs"). The price list and what a
 * call costs on it; what each AI feature sends at the bounds the code sets, read from the real
 * requests by a stand-in for the Messages API, and what each plan's allowances come to in a month
 * at those bounds, the free plans held under a ceiling; and the operator's numbers, priced from
 * `ai_runs` by who answers for each call. `COST_TABLE=<file>` writes the tables RESOURCES.md carries.
 */
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AGENT_KNOWLEDGE_MAX,
  ASK_MAX,
  FRAME_EDGE,
  ORG_ALLOWANCES,
  PERSON_ALLOWANCES,
  uuidv4,
  uuidv7,
} from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { type AiAssist, createAiAssist, type FriendPersona } from '../src/lib/ai';
import {
  type CallUse,
  costUsd,
  inDollars,
  inEuros,
  LONG_PROMPT,
  modelPrices,
  PRICES,
  SPEECH_PRICES,
} from '../src/lib/ai-costs';
import { DEFAULT_MODEL, SPEECH_PROVIDERS, speechFor } from '../src/lib/speech';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const TOP = 'claude-opus-5-5';
const MIDDLE = 'claude-sonnet-5-5';
const LIGHT = 'claude-haiku-5-5';
const ADMIN = 'operator-token-for-the-cost-model-0123456789';

/** A stand-in for the Messages API: keeps each request and answers an empty JSON object. */
const requests: any[] = [];
let stub: Server;
let url: string;

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(raw ? JSON.parse(raw) : null);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        model: TOP,
        content: [{ type: 'text', text: '{}' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((done) => stub.close(done));
});

const use = (u: Partial<CallUse>): CallUse => ({
  provider: 'anthropic',
  model: TOP,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  audioMs: null,
  ...u,
});

describe('the price list (M16 H7)', () => {
  it('knows a model by its id and its dated ids, and nothing else', () => {
    expect(modelPrices(TOP)?.prices).toEqual({
      input: 4,
      cacheWrite: 5,
      cacheRead: 0.2,
      output: 20,
    });
    expect(modelPrices(`${TOP}-20261001`)?.id).toBe(TOP);
    // Opus 5 is a model of its own, never Opus 5.5 read by a prefix.
    expect(modelPrices('claude-opus-5')?.prices.input).toBe(5);
    expect(modelPrices('claude-opus-5-20260601')?.id).toBe('claude-opus-5');
    expect(modelPrices('claude-opus-5-5-preview')).toBeNull();
    expect(modelPrices('claude-test-main')).toBeNull();
    expect(modelPrices(null)).toBeNull();
  });

  it('prices a call: tokens in and out, the cache, a long prompt, a recording', () => {
    // 10,000 tokens in and 1,000 out on Opus 5.5: four cents and two.
    expect(costUsd(use({ inputTokens: 10_000, outputTokens: 1_000 }))).toBeCloseTo(0.06, 10);
    // A million read from the cache, a million written to it.
    expect(costUsd(use({ cacheReadTokens: 1e6 }))).toBeCloseTo(0.2, 10);
    expect(costUsd(use({ cacheCreationTokens: 1e6 }))).toBeCloseTo(5, 10);
    // Haiku 5.5 up to 100,000 tokens of prompt, and the dearer rate for all of one past it.
    expect(costUsd(use({ model: LIGHT, inputTokens: LONG_PROMPT }))).toBeCloseTo(0.01, 10);
    expect(
      costUsd(use({ model: LIGHT, inputTokens: LONG_PROMPT + 1, outputTokens: 1e6 })),
    ).toBeCloseTo(((LONG_PROMPT + 1) * 0.5) / 1e6 + 2.5, 10);
    // Half a minute of a voice note, at OpenAI's estimate.
    expect(
      costUsd(use({ provider: 'openai', model: 'gpt-4o-transcribe', audioMs: 30_000 })),
    ).toBeCloseTo(0.003, 10);
    expect(inEuros(PRICES.usdPerEur)).toBe(1);
  });

  it('counts nothing for a call that got no answer, and never guesses at what it can’t price', () => {
    expect(costUsd(use({}))).toBe(0);
    expect(costUsd(use({ provider: 'openai', model: null }))).toBe(0);
    expect(costUsd(use({ model: 'claude-test-main', inputTokens: 10 }))).toBeNull();
    // A provider's model its page doesn't list, and a recording whose length wasn't kept.
    expect(
      costUsd(use({ provider: 'elevenlabs', model: 'scribe_v1', audioMs: 60_000 })),
    ).toBeNull();
    expect(costUsd(use({ provider: 'openai', model: 'gpt-4o-transcribe' }))).toBeNull();
  });

  it('prices the model each speech provider is asked for unless another is named', () => {
    for (const provider of SPEECH_PROVIDERS) {
      const adapter = speechFor({ SPEECH_PROVIDER: provider, SPEECH_API_KEY: 'k' } as Config);
      expect(adapter?.model).toBe(DEFAULT_MODEL[provider]);
      expect(
        costUsd(use({ provider, model: adapter?.model ?? null, audioMs: 60_000 })),
        provider,
      ).toBeGreaterThan(0);
    }
  });
});

/** The system prompt as text, a string or blocks (the agent's), and the messages' words. */
/**
 * An image is charged by its pixels, about one token per 750 (the platform's vision guide, read
 * 2026-10-25): a frame of a shared screen at its largest, FRAME_EDGE wide at 16:9, counted at a
 * token a character as the text is.
 */
const FRAME_TOKENS = Math.ceil((FRAME_EDGE * ((FRAME_EDGE * 9) / 16)) / 750);
const blockChars = (b: { type?: string; text?: string }): number =>
  b.type === 'image' ? FRAME_TOKENS : (b.text ?? '').length;
const sentChars = (body: any): number =>
  (Array.isArray(body.system)
    ? body.system.map((b: { text?: string }) => b.text ?? '').join('')
    : String(body.system ?? '')
  ).length +
  (body.messages as Array<{ content: unknown }>)
    .map((m) =>
      typeof m.content === 'string'
        ? m.content.length
        : Array.isArray(m.content)
          ? m.content.reduce((n: number, b) => n + blockChars(b), 0)
          : JSON.stringify(m.content).length,
    )
    .reduce((a, b) => a + b, 0);

const x = (n: number) => 'x'.repeat(n);
const today = 'Monday, 19 October 2026';
const transcript = (chars: number) => ({ text: x(chars), newFrom: null });
const arabic = { variety: 'standard' as const, chosen: false };
const friend: FriendPersona = {
  name: 'Lulu',
  trait: 'the Dreamer, who always finds kindness',
  voice: 'gently, warmly and a little dreamily',
  knows: 'how people are known to each other',
  facts: ['A connection is the two of you.', 'Labels are yours alone.'],
  others: ['Ruby: plans and meetings'],
};

/**
 * Each feature with what it sends at the bounds the code sets (named beside each), on the model
 * of the tier given where its plan decides it (finding follow-ups, an organization's agent).
 */
const AT_BOUNDS: ReadonlyArray<{
  feature: string;
  tiered?: true;
  call: (ai: AiAssist, tier: 'top' | 'light') => Promise<unknown>;
}> = [
  // core AiRewriteBody: a draft of 4,000 characters at most.
  {
    feature: 'rewrite',
    call: (ai) => ai.rewrite({ text: x(4000), style: 'clearer', tone: 'neutral' }),
  },
  // modules/ai.ts: a message's first 4,000 characters.
  { feature: 'translate', call: (ai) => ai.translate({ text: x(4000), to: 'Arabic' }) },
  // modules/ai.ts: TRANSCRIPT_CHARS, 60,000 characters of the newest 200 messages.
  {
    feature: 'catch-up',
    call: (ai) => ai.catchUp({ transcript: transcript(60_000), language: 'English', today }),
  },
  {
    feature: 'ask',
    call: (ai) =>
      ai.ask({ transcript: transcript(60_000), question: x(ASK_MAX), language: 'English', today }),
  },
  // lib/call-notes-ai.ts: NOTES_CHARS of a call's lines, a question at ASK_MAX (M17 I13f).
  {
    feature: 'notes-ask',
    call: (ai) =>
      ai.askNotes({
        transcript: transcript(24_000),
        question: x(ASK_MAX),
        language: 'English',
        today,
      }),
  },
  // lib/cai-interact.ts: the same lines, a question said aloud at a line's length (M17 I13g).
  {
    feature: 'interact',
    call: (ai) =>
      ai.interact({ transcript: transcript(24_000), question: x(800), language: 'English', today }),
  },
  // lib/cai-interact.ts: the same, asked about the screen, with a picture of it at its largest
  // (M17 I13h).
  {
    feature: 'interact-screen',
    call: (ai) =>
      ai.interact({
        transcript: transcript(24_000),
        question: x(800),
        language: 'English',
        today,
        image: { data: x(FRAME_TOKENS), mediaType: 'image/jpeg' },
      }),
  },
  // lib/call-frames.ts: one frame of a shared screen at its largest, read for the write-up (M17
  // I13h); the write-up reads at most FRAMES_IN_NOTES of them.
  {
    feature: 'frame',
    call: (ai) =>
      ai.readFrame({
        image: { data: x(FRAME_TOKENS), mediaType: 'image/jpeg' },
        language: 'English',
      }),
  },
  {
    feature: 'actions',
    tiered: true,
    call: (ai, tier) => ai.findActions({ transcript: transcript(60_000), today, tier }),
  },
  // lib/call-notes-summary.ts: SUMMARY_CHARS of a call's heard lines, written up once (M16 F7e).
  {
    feature: 'notes-summary',
    tiered: true,
    call: (ai, tier) =>
      ai.callNotes({ transcript: transcript(60_000), language: 'English', today, tier }),
  },
  // lib/briefs.ts: 40 messages of 400 characters, read by catch-up's call.
  {
    feature: 'brief',
    call: (ai) => ai.catchUp({ transcript: transcript(40 * 400), language: 'English', today }),
  },
  // lib/system-accounts.ts: 12 messages of 600 characters; what's open, 4 parts of 5 lines.
  {
    feature: 'cai',
    call: (ai) =>
      ai.caiChat({
        transcript: x(12 * 600),
        context: x(20 * 120),
        language: 'English',
        arabic,
        country: 'EG',
        gender: null,
        today,
      }),
  },
  {
    feature: 'friend',
    call: (ai) =>
      ai.friendChat({
        friend,
        transcript: x(12 * 600),
        context: x(20 * 120),
        language: 'English',
        arabic,
        country: 'EG',
        gender: null,
        today,
      }),
  },
  // core ASK_MAX: a question that reads like a sentence, from Search's answer.
  { feature: 'search', call: (ai) => ai.understandSearch({ query: x(ASK_MAX) }) },
  // modules/search.ts: 12 of each of three kinds found, 400 characters a passage.
  {
    feature: 'search-answer',
    call: (ai) =>
      ai.answerFromFound({ found: x(36 * 400), question: x(ASK_MAX), language: 'English', today }),
  },
  // lib/agent.ts: the last 20 messages of 1,500 characters; core AGENT_KNOWLEDGE_MAX; 8 slots;
  // a catalog and a menu of core BOOKING_ITEMS_MAX (50) items, a line each.
  {
    feature: 'agent',
    tiered: true,
    call: (ai, tier) =>
      ai.supportAgent({
        tier,
        orgName: 'Nile Dental',
        agentName: 'Nour',
        country: 'EG',
        knowledge: x(AGENT_KNOWLEDGE_MAX),
        conversation: x(20 * 1500),
        introduced: false,
        today,
        slots: x(8 * 60),
        catalog: x(50 * 130),
        menu: { lines: x(50 * 130), ways: ['pickup', 'delivery'] },
      }),
  },
];

/** At most a token a character, which no language's words reach: the ceiling's reading. */
const TOKENS_PER_CHAR_CEILING = 1;
/**
 * A token is about 3.5 English characters on the models before Claude 4.7, whose newer tokenizer
 * makes about 30% more (Anthropic's glossary, read 2026-10-19): about 2.7 characters a token.
 */
const CHARS_PER_TOKEN = 3.5 / 1.3;
/** Ten minutes, a voice note's longest (lib/speech.ts SPEECH_MAX_MS), at the dearer listed price. */
const VOICE_NOTE_USD =
  10 * Math.max(...Object.values(SPEECH_PRICES).flatMap((m) => Object.values(m)));

type Sent = { chars: number; maxOut: number; model: string };

/** One call through the assist, and what the stand-in saw of it. */
async function sent(call: () => Promise<unknown>): Promise<Sent> {
  // The stand-in's empty answer isn't one the structured features accept: the request is what's
  // measured here.
  await call().catch(() => null);
  const body = requests.at(-1);
  return { chars: sentChars(body), maxOut: body.max_tokens, model: body.model };
}

describe('what a person costs (M16 H7)', () => {
  let measured: Map<string, Sent>;
  let typical: Map<string, Sent>;

  beforeAll(async () => {
    const ai = createAiAssist({
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: url,
      ANTHROPIC_MODEL: TOP,
      ANTHROPIC_MODEL_LIGHT: LIGHT,
    } as Config);
    if (!ai) throw new Error('no assist');
    measured = new Map();
    for (const f of AT_BOUNDS)
      for (const tier of f.tiered ? (['light', 'top'] as const) : (['light'] as const))
        measured.set(
          f.tiered ? `${f.feature}:${tier}` : f.feature,
          await sent(() => f.call(ai, tier)),
        );
    // The assumed month's calls, at the sizes it assumes (`typicalMonth`).
    typical = new Map();
    typical.set(
      'rewrite',
      await sent(() => ai.rewrite({ text: x(300), style: 'clearer', tone: 'neutral' })),
    );
    typical.set(
      'catch-up',
      await sent(() =>
        ai.catchUp({ transcript: transcript(40 * 100), language: 'English', today }),
      ),
    );
    typical.set(
      'cai',
      await sent(() =>
        ai.caiChat({
          transcript: x(500),
          context: x(500),
          language: 'English',
          arabic,
          country: 'EG',
          gender: null,
          today,
        }),
      ),
    );
    for (const tier of ['light', 'top'] as const) {
      typical.set(
        `actions:${tier}`,
        await sent(() => ai.findActions({ transcript: transcript(40 * 100), today, tier })),
      );
      typical.set(
        `agent:${tier}`,
        await sent(() =>
          ai.supportAgent({
            tier,
            orgName: 'Nile Dental',
            agentName: 'Nour',
            country: 'EG',
            knowledge: x(4000),
            conversation: x(900),
            introduced: true,
            today,
            slots: null,
            catalog: null,
            menu: null,
          }),
        ),
      );
    }
  });

  /** One call at its bounds on a model, in US dollars. */
  const atBound = (key: string, model: string) => {
    const m = measured.get(key)!;
    return costUsd(
      use({ model, inputTokens: m.chars * TOKENS_PER_CHAR_CEILING, outputTokens: m.maxOut }),
    )!;
  };

  it('runs everything on the light model but what a plan pays for', () => {
    for (const f of AT_BOUNDS)
      if (!f.tiered) expect(measured.get(f.feature)?.model, f.feature).toBe(LIGHT);
    expect(measured.get('actions:light')?.model).toBe(LIGHT);
    expect(measured.get('actions:top')?.model).toBe(TOP);
    expect(measured.get('agent:light')?.model).toBe(LIGHT);
    expect(measured.get('agent:top')?.model).toBe(TOP);
    // The free plans are the light model's; the top one is a payer's.
    expect(PERSON_ALLOWANCES.personal.aiModel).toBe('light');
    expect(ORG_ALLOWANCES.free.agentModel).toBe('light');
    for (const p of ['pro', 'business', 'enterprise'] as const)
      expect(PERSON_ALLOWANCES[p].aiModel).toBe('top');
    for (const p of ['business', 'enterprise'] as const)
      expect(ORG_ALLOWANCES[p].agentModel).toBe('top');
  });

  it('holds what a free plan can cost at the edge of its allowances', () => {
    const month = 30;
    // A person: their dearest assist every time (finding follow-ups on the light model, or a
    // voice note of ten minutes), as many as the day allows.
    const personDearest = Math.max(
      ...AT_BOUNDS.filter((f) => !f.tiered).map((f) => atBound(f.feature, LIGHT)),
      atBound('actions:light', LIGHT),
      VOICE_NOTE_USD,
    );
    // The day is what its calls cost (M16 G9): spent once the sum reaches the allowance, so the
    // last call of a day can pass it by one dearest call at most.
    const personal = month * (PERSON_ALLOWANCES.personal.aiEurPerDay + inEuros(personDearest));
    // An organization: its agent at its bounds, as many answers as the day allows, by count or
    // by cost, whichever stops it first.
    const freeOrg = inEuros(
      month *
        Math.min(
          ORG_ALLOWANCES.free.agentRepliesPerDay * atBound('agent:light', LIGHT),
          inDollars(ORG_ALLOWANCES.free.agentEurPerDay) + atBound('agent:light', LIGHT),
        ),
    );
    // Held: a change that moves either (an allowance, a free plan's model, a bound) moves this,
    // on purpose (CLAUDE.md convention 14).
    expect(personal).toBeLessThan(20);
    expect(freeOrg).toBeLessThan(15);
    // Before M16 H7 a free organization's agent answered on the top model.
    const freeOrgOnTop = inEuros(
      ORG_ALLOWANCES.free.agentRepliesPerDay * month * atBound('agent:top', TOP),
    );
    expect(freeOrgOnTop / freeOrg).toBeGreaterThan(30);
    // A day's backstop on an agent is above a day of its answers at the assumed size, so a
    // clinic's ordinary day never meets it: only answers far longer than usual do (M16 G9).
    const assumed = typicalMonth(typical);
    for (const p of ['free', 'business', 'enterprise'] as const) {
      const a = ORG_ALLOWANCES[p];
      const perAnswer = assumed.organization(a.agentModel) / (30 * 30);
      expect(inDollars(a.agentEurPerDay), p).toBeGreaterThan(a.agentRepliesPerDay * perAnswer);
    }
    if (process.env.COST_TABLE)
      writeFileSync(process.env.COST_TABLE, tables(measured, typical, atBound));
  });
});

/** The tables docs/RESOURCES.md carries, written by `COST_TABLE=<file>`. */
function tables(
  measured: Map<string, Sent>,
  typical: Map<string, Sent>,
  atBound: (key: string, model: string) => number,
) {
  const eur = (usd: number) => {
    const e = inEuros(usd);
    const digits = e < 0.01 ? 4 : 2;
    return `€${e.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  };
  const n = (v: number) => v.toLocaleString('en-GB');
  const lines: string[] = [
    `Prices: ${PRICES.source}, read ${PRICES.read}; ${PRICES.usdPerEur} US dollars to the euro (ECB, ${PRICES.rateOn}).`,
    '',
    '| Feature | Sends at most (characters) | Answers at most (tokens) | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const f of AT_BOUNDS) {
    const key = f.tiered ? `${f.feature}:top` : f.feature;
    const m = measured.get(key)!;
    lines.push(
      `| ${f.feature} | ${n(m.chars)} | ${n(m.maxOut)} | ${eur(atBound(key, LIGHT))} | ${eur(atBound(key, MIDDLE))} | ${eur(atBound(key, TOP))} |`,
    );
  }
  lines.push(
    `| transcribe | ten minutes of audio | — | ${eur(VOICE_NOTE_USD)} (OpenAI's estimate) | | |`,
  );
  const month = 30;
  const assumed = typicalMonth(typical);
  lines.push(
    '',
    '| Plan | Model for the heavy work | Allowance | Dearest call | A month at every allowance | An assumed month |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const p of ['personal', 'pro', 'business', 'enterprise'] as const) {
    const a = PERSON_ALLOWANCES[p];
    const heavy = a.aiModel === 'top' ? TOP : LIGHT;
    const dearest = Math.max(
      ...AT_BOUNDS.filter((f) => !f.tiered).map((f) => atBound(f.feature, LIGHT)),
      atBound(`actions:${a.aiModel}`, heavy),
      VOICE_NOTE_USD,
    );
    lines.push(
      `| ${p} | ${a.aiModel} | €${a.aiEurPerDay.toFixed(2)} a day | ${eur(dearest)} | ${eur(month * (inDollars(a.aiEurPerDay) + dearest))} | ${eur(assumed.person(a.aiModel))} |`,
    );
  }
  for (const p of ['free', 'business', 'enterprise'] as const) {
    const a = ORG_ALLOWANCES[p];
    const model = a.agentModel === 'top' ? TOP : LIGHT;
    const one = atBound(`agent:${a.agentModel}`, model);
    lines.push(
      `| organization ${p} | ${a.agentModel} | ${n(a.agentRepliesPerDay)} answers or €${a.agentEurPerDay.toFixed(2)} a day | ${eur(one)} | ${eur(month * Math.min(a.agentRepliesPerDay * one, inDollars(a.agentEurPerDay) + one))} | ${eur(assumed.organization(a.agentModel))} |`,
    );
  }
  // Where the Business price (€29 a month, the pricing page's from Stripe) stops covering its
  // agent: answers a day at the assumed size, on each model.
  const perAnswer = (model: string) =>
    costUsd(
      use({
        model,
        inputTokens: Math.round(typical.get('agent:top')!.chars / CHARS_PER_TOKEN),
        outputTokens: 150,
      }),
    )!;
  const covered = (model: string) => Math.floor((29 * PRICES.usdPerEur) / perAnswer(model) / month);
  lines.push(
    '',
    `On Sonnet 5.5 a Business agent's month at its allowance is ${eur(month * Math.min(ORG_ALLOWANCES.business.agentRepliesPerDay * atBound('agent:top', MIDDLE), inDollars(ORG_ALLOWANCES.business.agentEurPerDay) + atBound('agent:top', MIDDLE)))}; a free organization's on the top model, as before M16 H7, ${eur(ORG_ALLOWANCES.free.agentRepliesPerDay * month * atBound('agent:top', TOP))}. Business's €29 covers its agent up to ${n(covered(TOP))} answers a day of the assumed size on Opus 5.5, ${n(covered(MIDDLE))} on Sonnet 5.5 and ${n(covered(LIGHT))} on Haiku 5.5.`,
  );
  return `${lines.join('\n')}\n`;
}

/**
 * An assumed month, until the operator's figure says otherwise: someone who uses AI assist does,
 * each of 30 days, one rewrite of a 300-character draft, one catch-up on 40 messages of 100
 * characters, two questions to Cai over 1,000 characters of what's open and said, half a minute of
 * a voice note, and one search for follow-ups in 40 messages, on their plan's model; an
 * organization's agent answers 30 customers' messages a day from 4,000 characters of what it knows
 * and 900 of the conversation, nothing read from the cache. What each sends was measured above;
 * it's read at about 2.7 characters a token, and answers are a rewrite's 120 tokens, a catch-up's
 * 300, Cai's 150, follow-ups' 400 and the agent's 150.
 */
function typicalMonth(typical: Map<string, Sent>) {
  const call = (key: string, model: string, out: number) =>
    costUsd(
      use({
        model,
        inputTokens: Math.round(typical.get(key)!.chars / CHARS_PER_TOKEN),
        outputTokens: out,
      }),
    )!;
  const modelOf = (tier: 'top' | 'light') => (tier === 'top' ? TOP : LIGHT);
  return {
    person: (tier: 'top' | 'light') =>
      30 *
      (call('rewrite', LIGHT, 120) +
        call('catch-up', LIGHT, 300) +
        2 * call('cai', LIGHT, 150) +
        0.5 * (VOICE_NOTE_USD / 10) +
        call(`actions:${tier}`, modelOf(tier), 400)),
    organization: (tier: 'top' | 'light') => 30 * 30 * call(`agent:${tier}`, modelOf(tier), 150),
  };
}

describe('what AI cost, in the operator’s numbers (M16 H7)', () => {
  let t: TestApp;
  let lina: Client;
  let omar: Client;
  let noor: Client;

  beforeAll(async () => {
    t = await createTestApp({
      ADMIN_TOKEN: ADMIN,
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: url,
    });
    lina = await signup(t, { displayName: 'Lina Personal' });
    omar = await signup(t, { displayName: 'Omar Pro' });
    noor = await signup(t, { displayName: 'Noor Owner' });
  });
  afterAll(async () => {
    await t.close();
  });

  it('prices the window’s calls by who answers for them, and says what it couldn’t price', async () => {
    await t.ctx.db
      .updateTable('users')
      .set({ plan: 'pro' })
      .where('id', '=', omar.user.id)
      .execute();
    const { org } = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: `nile.costs.${Math.random().toString(36).slice(2, 7)}`,
      kind: 'clinic',
    });
    expect(
      (
        await noor.req('PUT', `/v1/orgs/${org.id}/agent`, {
          name: 'Nour',
          knowledge: 'We open at nine and close at five, Sunday to Thursday.',
        })
      ).statusCode,
    ).toBe(200);
    const agent = await t.ctx.db
      .selectFrom('org_agents')
      .select('bot_user_id')
      .where('org_id', '=', org.id)
      .executeTakeFirstOrThrow();
    // Someone active in the window.
    const asked = await lina.post('/v1/connections/requests', { toUserId: omar.user.id });
    const { conversationId } = await omar.post(
      `/v1/connections/requests/${asked.requestId}/accept`,
      {},
    );
    await lina.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      body: 'Hello',
    });

    await t.ctx.flush();
    await t.ctx.db.deleteFrom('ai_runs').execute();
    const at = new Date(t.ctx.now().getTime() - 3_600_000);
    const run = (userId: string, feature: string, u: Partial<CallUse>) => ({
      id: uuidv7(),
      user_id: userId,
      feature,
      provider: u.provider ?? 'anthropic',
      model: u.model ?? null,
      input_tokens: u.inputTokens ?? null,
      output_tokens: u.outputTokens ?? null,
      cache_read_tokens: u.cacheReadTokens ?? null,
      cache_creation_tokens: u.cacheCreationTokens ?? null,
      audio_ms: u.audioMs ?? null,
      outcome: 'ok',
      created_at: at,
    });
    await t.ctx.db
      .insertInto('ai_runs')
      .values([
        // Lina, on Personal: a catch-up, one past Haiku's long-prompt line, a voice note, one on a
        // model the list doesn't name.
        run(lina.user.id, 'catch-up', { model: LIGHT, inputTokens: 90_000, outputTokens: 20_000 }),
        run(lina.user.id, 'catch-up', { model: LIGHT, inputTokens: 200_000 }),
        run(lina.user.id, 'transcribe', {
          provider: 'openai',
          model: 'gpt-4o-transcribe',
          audioMs: 60_000,
        }),
        run(lina.user.id, 'rewrite', { model: 'claude-test-main', inputTokens: 10 }),
        // A transcript from before lengths were kept.
        run(lina.user.id, 'transcribe', { provider: 'openai', model: 'gpt-4o-transcribe' }),
        // Omar, on Pro: follow-ups on the top model.
        run(omar.user.id, 'actions', { model: TOP, inputTokens: 10_000, outputTokens: 1_000 }),
        // Nile Dental's agent, on Free: what it knows read from the cache.
        run(agent.bot_user_id, 'agent', {
          model: LIGHT,
          inputTokens: 20_000,
          cacheReadTokens: 8_000,
          cacheCreationTokens: 2_000,
          outputTokens: 400,
        }),
      ])
      .execute();

    const m = (
      await t.app.inject({
        method: 'GET',
        url: '/v1/admin/metrics?days=28',
        headers: { authorization: `Bearer ${ADMIN}` },
      })
    ).json().metrics;
    const usd = {
      lina: 0.009 + 0.01 + 0.1 + 0.006,
      omar: 0.04 + 0.02,
      agent: (20_000 * 0.1 + 8_000 * 0.01 + 2_000 * 0.125 + 400 * 0.5) / 1e6,
    };
    const total = usd.lina + usd.omar + usd.agent;
    const month = 30 / 28;
    expect(m.ai.cost).toEqual({
      eur: inEuros(total),
      perActivePersonMonth: inEuros((total / m.engagement.activePeople) * month),
      byPlan: [
        {
          plan: 'free',
          whose: 'organization',
          eur: inEuros(usd.agent),
          count: 1,
          perMonth: inEuros(usd.agent * month),
        },
        {
          plan: 'personal',
          whose: 'person',
          eur: inEuros(usd.lina),
          count: 1,
          perMonth: inEuros(usd.lina * month),
        },
        {
          plan: 'pro',
          whose: 'person',
          eur: inEuros(usd.omar),
          count: 1,
          perMonth: inEuros(usd.omar * month),
        },
      ],
      byFeature: {
        'catch-up': inEuros(0.009 + 0.01 + 0.1),
        transcribe: inEuros(0.006),
        rewrite: 0,
        actions: inEuros(usd.omar),
        agent: inEuros(usd.agent),
      },
      unpriced: 2,
      priced: PRICES.read,
    });
    expect(m.notMeasured.join(' ')).toContain('AI cost');
  });
});
