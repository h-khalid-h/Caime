/**
 * Text to speech for Cai's voice in a call (R114 (3), M17 I13g): one interface, a provider chosen
 * by `TTS_PROVIDER` with its key and voice, each adapter one call over fetch (never an SDK), as
 * the speech-to-text providers are (`speech.ts`). What goes to the provider is Cai's own words
 * alone, never anyone's voice, name or words; what it kept of the exchange is forgotten by `ref`
 * (ElevenLabs' history item, named by the response's `history-item-id` header when it carries
 * one) through the speech-forget job, as a transcript is.
 */
import type { Config } from '../config';
import { AiError, type AiResult } from './ai';

export const TTS_PROVIDERS = ['elevenlabs'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

/** Each provider's company, for the processors list (R54). */
export const TTS_PROVIDER_NAMES: Record<TtsProvider, string> = {
  elevenlabs: 'ElevenLabs, Inc.',
};

const DEFAULT_MODEL: Record<TtsProvider, string> = { elevenlabs: 'eleven_flash_v2_5' };
const DEFAULT_BASE: Record<TtsProvider, string> = { elevenlabs: 'https://api.elevenlabs.io' };

/** Never more characters than this in one utterance, whatever asked for it. */
export const TTS_MAX_CHARS = 1_000;
/** One deadline for the whole exchange, as webhooks have. */
const TIMEOUT_MS = 30_000;
const PING_MS = 10_000;

export interface Spoken {
  bytes: Buffer;
  mime: string;
  /** The provider's own id for what it kept of the exchange, for `forget`; null where nothing is. */
  ref: string | null;
}

export interface SpeakInput {
  text: string;
  /** The language the words are in, as an ISO 639-1 code ("ar", "fr"), for a voice that takes one. */
  language: string;
}

export interface TextToSpeech {
  provider: TtsProvider;
  model: string;
  /** The words as sound; the usage counts the characters sent as input tokens (M16 H7). */
  speak(input: SpeakInput): Promise<AiResult<Spoken>>;
  /** Delete what the provider kept of an exchange by its id. */
  forget(ref: string): Promise<void>;
  /** The cheapest authenticated read, for provider health (R78). */
  ping(): Promise<void>;
}

/**
 * The adapter this Caime is configured for, or null: then Cai never speaks in a call. The key
 * falls back to the speech-to-text provider's when it's the same company.
 */
export function ttsFor(config: Config): TextToSpeech | null {
  const provider = config.TTS_PROVIDER;
  if (!provider) return null;
  const key =
    config.TTS_API_KEY ?? (config.SPEECH_PROVIDER === provider ? config.SPEECH_API_KEY : undefined);
  const voice = config.TTS_VOICE_ID;
  if (!key || !voice) return null;
  const model = config.TTS_MODEL ?? DEFAULT_MODEL[provider];
  const base = (config.TTS_BASE_URL ?? DEFAULT_BASE[provider]).replace(/\/$/, '');
  return elevenLabsVoice(base, key, voice, model);
}

/** One small read with the key, within the probe's time; anything but 2xx is a failure. */
async function pingWith(url: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(PING_MS) });
  if (!res.ok) throw new Error(`voice provider answered ${res.status}`);
}

/** The usage an utterance records: the characters spoken, as the provider bills them. */
const usageOf = (model: string, text: string) => ({
  model,
  inputTokens: text.length,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

/**
 * ElevenLabs' `POST /v1/text-to-speech/{voice_id}` (its API reference, read 2026-10-25): JSON in,
 * the audio file back; `language_code` enforces the language on the models that take one.
 */
function elevenLabsVoice(base: string, key: string, voice: string, model: string): TextToSpeech {
  const forget = async (ref: string) => {
    const res = await fetch(`${base}/v1/history/${encodeURIComponent(ref)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(PING_MS),
    });
    if (!res.ok && res.status !== 404)
      throw new Error(`voice provider answered ${res.status} to a delete`);
  };
  return {
    provider: 'elevenlabs',
    model,
    ping: () => pingWith(`${base}/v1/voices/${encodeURIComponent(voice)}`, { 'xi-api-key': key }),
    async speak(input) {
      const text = input.text.trim().slice(0, TTS_MAX_CHARS);
      const usage = usageOf(model, text);
      if (!text) throw new AiError('declined', 'nothing to say', usage);
      const body: Record<string, unknown> = { text, model_id: model };
      // The multilingual v2 models refuse a language code (the reference); the rest take one.
      if (!model.includes('multilingual')) body.language_code = input.language;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(
          `${base}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_22050_32`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': key,
              'content-type': 'application/json',
              accept: 'audio/mpeg',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
      } catch (err) {
        throw new AiError('busy', `voice provider unreachable: ${(err as Error).message}`, usage);
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 429 || res.status >= 500)
        throw new AiError('busy', `voice provider answered ${res.status}`, usage);
      if (!res.ok) throw new AiError('unavailable', `voice provider answered ${res.status}`, usage);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.length) throw new AiError('declined', 'no sound back', usage);
      const ref = res.headers.get('history-item-id');
      return {
        value: { bytes, mime: res.headers.get('content-type')?.split(';')[0] || 'audio/mpeg', ref },
        usage,
      };
    },
    forget,
  };
}
