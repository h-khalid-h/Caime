/**
 * Speech to text (PRD §46, R52; the decision in docs/SPEECH.md): one interface, a provider behind
 * it chosen by configuration, each a thin call over fetch (no SDK, as S3 and Stripe are done).
 * The first provider is OpenAI's transcription model; ElevenLabs' Scribe is the challenger the
 * owner's bake-off (`scripts/speech-bakeoff.mjs`) runs it against on real Egyptian and Gulf
 * clips. The server sends a provider the audio of one voice note and nothing else about the
 * person; nothing from a private conversation ever reaches here (the job checks `sealed`).
 */
import type { Config } from '../config';
import { AiError, type AiResult } from './ai';

export const SPEECH_PROVIDERS = ['openai', 'elevenlabs'] as const;
export type SpeechProvider = (typeof SPEECH_PROVIDERS)[number];

/** How each provider names itself, for the processors list and the data processing agreement. */
export const SPEECH_PROVIDER_NAMES: Record<SpeechProvider, string> = {
  openai: 'OpenAI, LLC',
  elevenlabs: 'ElevenLabs, Inc.',
};

const DEFAULT_MODEL: Record<SpeechProvider, string> = {
  openai: 'gpt-4o-transcribe',
  elevenlabs: 'scribe_v1',
};

const DEFAULT_BASE: Record<SpeechProvider, string> = {
  openai: 'https://api.openai.com',
  elevenlabs: 'https://api.elevenlabs.io',
};

/** Audio longer than this isn't transcribed: a voice note, not a recording (R52 is its own). */
export const SPEECH_MAX_MS = 10 * 60_000;
/** And never more bytes than a provider takes in one request. */
export const SPEECH_MAX_BYTES = 25 * 1024 * 1024;
/** One deadline for the whole exchange, as webhooks have. */
const TIMEOUT_MS = 60_000;

export interface Transcript {
  text: string;
  /** The language the provider heard, as a BCP 47 tag when it says one ("ar", "en"), else null. */
  language: string | null;
}

export interface SpeechInput {
  bytes: Buffer;
  mime: string;
  name: string;
  /** The languages the note is likely in, for a provider that takes a hint. */
  languageHints: string[];
}

export interface SpeechToText {
  provider: SpeechProvider;
  model: string;
  transcribe(input: SpeechInput): Promise<AiResult<Transcript>>;
}

/** The adapter this Caime is configured for, or null: then nothing is transcribed. */
export function speechFor(config: Config): SpeechToText | null {
  const provider = config.SPEECH_PROVIDER;
  if (!provider || !config.SPEECH_API_KEY) return null;
  const key = config.SPEECH_API_KEY;
  const model = config.SPEECH_MODEL ?? DEFAULT_MODEL[provider];
  const base = (config.SPEECH_BASE_URL ?? DEFAULT_BASE[provider]).replace(/\/$/, '');
  return provider === 'openai'
    ? openaiSpeech(base, key, model)
    : elevenLabsSpeech(base, key, model);
}

/** One call, with the failures the AI runner knows: busy (429, 5xx), unavailable (anything else). */
async function post(
  url: string,
  headers: Record<string, string>,
  form: FormData,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: form, signal: controller.signal });
  } catch (err) {
    throw new AiError('busy', `speech provider unreachable: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429 || res.status >= 500)
    throw new AiError('busy', `speech provider answered ${res.status}`);
  if (!res.ok) throw new AiError('unavailable', `speech provider answered ${res.status}`);
  return res.json();
}

/** A transcript's words as kept: one line, no leading or trailing space, never empty. */
function tidy(text: unknown): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The usage a transcription records: no tokens, the model's name. */
const usageOf = (model: string) => ({ model, inputTokens: 0, outputTokens: 0 });

/** OpenAI's `POST /v1/audio/transcriptions`: multipart, `text` back (and `language` when asked). */
function openaiSpeech(base: string, key: string, model: string): SpeechToText {
  return {
    provider: 'openai',
    model,
    async transcribe(input) {
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(input.bytes)], { type: input.mime }),
        input.name,
      );
      form.append('model', model);
      form.append('response_format', 'json');
      // One hint when there is one; the model finds the language itself otherwise.
      if (input.languageHints.length === 1) form.append('language', input.languageHints[0]!);
      const json = (await post(
        `${base}/v1/audio/transcriptions`,
        { authorization: `Bearer ${key}` },
        form,
      )) as {
        text?: unknown;
        language?: unknown;
      };
      const text = tidy(json.text);
      if (!text) throw new AiError('declined', 'nothing heard', usageOf(model));
      return {
        value: { text, language: typeof json.language === 'string' ? json.language : null },
        usage: usageOf(model),
      };
    },
  };
}

/** ElevenLabs' `POST /v1/speech-to-text`: multipart, `text` and `language_code` back. */
function elevenLabsSpeech(base: string, key: string, model: string): SpeechToText {
  return {
    provider: 'elevenlabs',
    model,
    async transcribe(input) {
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(input.bytes)], { type: input.mime }),
        input.name,
      );
      form.append('model_id', model);
      form.append('tag_audio_events', 'false');
      if (input.languageHints.length === 1) form.append('language_code', input.languageHints[0]!);
      const json = (await post(`${base}/v1/speech-to-text`, { 'xi-api-key': key }, form)) as {
        text?: unknown;
        language_code?: unknown;
      };
      const text = tidy(json.text);
      if (!text) throw new AiError('declined', 'nothing heard', usageOf(model));
      return {
        value: {
          text,
          language:
            typeof json.language_code === 'string'
              ? json.language_code.slice(0, 3).replace(/[_-]$/, '')
              : null,
        },
        usage: usageOf(model),
      };
    },
  };
}
