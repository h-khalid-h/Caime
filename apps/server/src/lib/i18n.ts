/**
 * Whose language the server writes in (R54, ADR-17). One process answers everyone, so the
 * translator core's `tr` uses comes from the work at hand, through a translator provider backed
 * by AsyncLocalStorage:
 *
 * - A request is answered in the language its app is showing (`X-Caime-Language`, what the
 *   device resolved `auto` to): inbox reasons, relationship labels, kit previews, errors. No
 *   header, or a token's request, reads as English.
 * - A notification is written in its reader's language (`asReader`): what they chose
 *   (`preferences.language`), else what their app last showed (`preferences.interfaceLanguage`),
 *   else their account's locale. Looked up once per person per five minutes, so a fan-out
 *   costs one small query per reader at most, and forgotten the moment they change it here.
 *
 * - What Cai and the Caime Friends say (R72) is said in the reader's Arabic: the variety they
 *   chose, else the one where they live (`readerOf`), else the standard; a reply to what someone
 *   wrote takes the one they wrote in (`lib/system-accounts.ts`). A voice is an overlay of their
 *   lines alone (`locales/ar-egyptian.ts` and friends) over the standard catalog, so everything
 *   else (the interface, a refusal) stays in Standard Arabic whoever reads it.
 *
 * The public site's pages are rendered in the language `siteLanguage` picks (`lib/site-pages.ts`);
 * their strings live in `locales/ar-server.ts`, the server's own catalog, merged with the app's.
 *
 * Mail stays English: it travels as 7-bit text (`lib/email.ts`).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type ArabicVariety,
  type ArabicVarietyChoice,
  arabicVariety,
} from '@caime/core/arabic-variety';
import {
  type Catalog,
  english,
  type InterfaceLanguage,
  type LanguageChoice,
  languageFor,
  makeTranslator,
  resolveLanguage,
  setTranslatorProvider,
  type Translator,
} from '@caime/core/i18n';
import { ar } from '@caime/core/locales/ar';
import { fr } from '@caime/core/locales/fr';
import { turkish } from '@caime/core/locales/tr';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { egyptianVoice } from '../locales/ar-egyptian';
import { gulfVoice } from '../locales/ar-gulf';
import { levantineVoice } from '../locales/ar-levantine';
import { arServer } from '../locales/ar-server';
import { frServer } from '../locales/fr-server';
import { turkishServer } from '../locales/tr-server';

// The app's catalog, and beside it the public site's (server-only copy the app never downloads).
const arabic = { ...ar, ...arServer };
const translators: Record<InterfaceLanguage, Translator> = {
  en: english,
  ar: makeTranslator('ar', arabic),
  fr: makeTranslator('fr', { ...fr, ...frServer }),
  tr: makeTranslator('tr', { ...turkish, ...turkishServer }),
};

/**
 * Cai's and the Caime Friends' lines in the varieties they're written in (R72); any other
 * variety reads them in the standard (the model still speaks it: `lib/ai.ts`).
 */
export const VOICES: Partial<Record<ArabicVariety, Catalog>> = {
  egyptian: egyptianVoice,
  gulf: gulfVoice,
  levantine: levantineVoice,
};
const voices = new Map(
  Object.entries(VOICES).map(([variety, lines]) => [
    variety,
    makeTranslator('ar', { ...arabic, ...lines }),
  ]),
);

const scope = new AsyncLocalStorage<Translator>();

/** The header's language, or English: a tag ("ar-EG") reads as its language, nonsense as English. */
export function languageOfRequest(req: FastifyRequest): InterfaceLanguage {
  const header = req.headers['x-caime-language'];
  return languageFor(typeof header === 'string' ? header : null);
}

/**
 * Run `work` with every `tr` in it answering in `language`; in Arabic, what Cai and the friends
 * say inside it in `variety`.
 */
export function inLanguage<T>(
  language: InterfaceLanguage,
  work: () => T,
  variety?: ArabicVariety | null,
): T {
  const voice = language === 'ar' && variety ? voices.get(variety) : undefined;
  return scope.run(voice ?? translators[language], work);
}

/**
 * Core's `tr` answers from the work's context from here on. Every request runs in its header's
 * language; whatever runs outside one (a job, a hook after the response) is English until it
 * says whose it is with `asReader`.
 */
export function registerLanguage(app: FastifyInstance): void {
  setTranslatorProvider(() => scope.getStore());
  app.addHook('onRequest', (req, _reply, done) => {
    scope.run(translators[languageOfRequest(req)], done);
  });
}

const CACHE_MS = 5 * 60_000;
const CACHE_MAX = 20_000;
const known = new Map<string, Reader & { until: number }>();

interface LanguagePreferences {
  language?: LanguageChoice;
  interfaceLanguage?: InterfaceLanguage;
  arabicVariety?: ArabicVarietyChoice;
}

/** How to write to someone: their language and, in Arabic, how Cai speaks it with them (R72). */
export interface Reader {
  language: InterfaceLanguage;
  /** What they chose for Cai's Arabic, `auto` when nothing. */
  choice: ArabicVarietyChoice;
  /** Where they live (ISO 3166-1), never shown: it sets their defaults. */
  country: string | null;
  /** Their Arabic before anything they write says otherwise: chosen, else where they live. */
  variety: ArabicVariety;
}

type Account = {
  locale: string | null;
  country: string | null;
  preferences: Record<string, unknown> | null;
};

function readerOfAccount(user: Account): Reader {
  const prefs = (user.preferences ?? {}) as LanguagePreferences;
  const choice = prefs.arabicVariety ?? 'auto';
  return {
    language: languageOfAccount(user),
    choice,
    country: user.country,
    variety: arabicVariety({ choice, country: user.country }),
  };
}

/** The language a person reads Caime in, from their account alone (no device to ask). */
export function languageOfAccount(user: {
  locale: string | null;
  preferences: Record<string, unknown> | null;
}): InterfaceLanguage {
  const prefs = (user.preferences ?? {}) as LanguagePreferences;
  return resolveLanguage(prefs.language, prefs.interfaceLanguage ?? user.locale);
}

const NOBODY: Reader = { language: 'en', choice: 'auto', country: null, variety: 'standard' };

function keep(userId: string, reader: Reader, now: number): void {
  if (known.size >= CACHE_MAX) known.delete(known.keys().next().value as string);
  known.set(userId, { ...reader, until: now + CACHE_MS });
}

/** How to write to someone, from their account: one small query, then five minutes cached. */
export async function readerOf(ctx: AppContext, userId: string): Promise<Reader> {
  const now = Date.now();
  const hit = known.get(userId);
  if (hit && hit.until > now) return hit;
  const user = await ctx.db
    .selectFrom('users')
    .select(['locale', 'country', 'preferences'])
    .where('id', '=', userId)
    .executeTakeFirst();
  const reader = user ? readerOfAccount(user) : NOBODY;
  keep(userId, reader, now);
  return reader;
}

export async function languageOf(ctx: AppContext, userId: string): Promise<InterfaceLanguage> {
  return (await readerOf(ctx, userId)).language;
}

/** The languages of many people at once (a fan-out): one query for whoever isn't cached. */
export async function languagesOf(
  ctx: AppContext,
  userIds: string[],
): Promise<Map<string, InterfaceLanguage>> {
  const now = Date.now();
  const out = new Map<string, InterfaceLanguage>();
  const missing: string[] = [];
  for (const id of new Set(userIds)) {
    const hit = known.get(id);
    if (hit && hit.until > now) out.set(id, hit.language);
    else missing.push(id);
  }
  if (missing.length) {
    const rows = await ctx.db
      .selectFrom('users')
      .select(['id', 'locale', 'country', 'preferences'])
      .where('id', 'in', missing)
      .execute();
    for (const user of rows) {
      const reader = readerOfAccount(user);
      keep(user.id, reader, now);
      out.set(user.id, reader.language);
    }
  }
  return out;
}

/** Their account changed what it says: the next thing written to them looks again. */
export function forgetLanguageOf(userId: string): void {
  known.delete(userId);
}

/**
 * Run `work` in `userId`'s language (and, for what Cai and the friends say, their Arabic):
 * everything `tr` writes inside is for them.
 */
export async function asReader<T>(
  ctx: AppContext,
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const reader = await readerOf(ctx, userId);
  return inLanguage(reader.language, work, reader.variety);
}
