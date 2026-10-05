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
 * The public site's pages are rendered in the language `siteLanguage` picks (`lib/site-pages.ts`);
 * their strings live in `locales/ar-server.ts`, the server's own catalog, merged with the app's.
 *
 * Mail stays English: it travels as 7-bit text (`lib/email.ts`).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
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
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { arServer } from '../locales/ar-server';
import { frServer } from '../locales/fr-server';

// The app's catalog, and beside it the public site's (server-only copy the app never downloads).
const translators: Record<InterfaceLanguage, Translator> = {
  en: english,
  ar: makeTranslator('ar', { ...ar, ...arServer }),
  fr: makeTranslator('fr', { ...fr, ...frServer }),
};

const scope = new AsyncLocalStorage<Translator>();

/** The header's language, or English: a tag ("ar-EG") reads as its language, nonsense as English. */
export function languageOfRequest(req: FastifyRequest): InterfaceLanguage {
  const header = req.headers['x-caime-language'];
  return languageFor(typeof header === 'string' ? header : null);
}

/** Run `work` with every `tr` in it answering in `language`. */
export function inLanguage<T>(language: InterfaceLanguage, work: () => T): T {
  return scope.run(translators[language], work);
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
const known = new Map<string, { language: InterfaceLanguage; until: number }>();

interface LanguagePreferences {
  language?: LanguageChoice;
  interfaceLanguage?: InterfaceLanguage;
}

/** The language a person reads Caime in, from their account alone (no device to ask). */
export function languageOfAccount(user: {
  locale: string | null;
  preferences: Record<string, unknown> | null;
}): InterfaceLanguage {
  const prefs = (user.preferences ?? {}) as LanguagePreferences;
  return resolveLanguage(prefs.language, prefs.interfaceLanguage ?? user.locale);
}

export async function languageOf(ctx: AppContext, userId: string): Promise<InterfaceLanguage> {
  const now = Date.now();
  const hit = known.get(userId);
  if (hit && hit.until > now) return hit.language;
  const user = await ctx.db
    .selectFrom('users')
    .select(['locale', 'preferences'])
    .where('id', '=', userId)
    .executeTakeFirst();
  const language = user ? languageOfAccount(user) : 'en';
  if (known.size >= CACHE_MAX) known.delete(known.keys().next().value as string);
  known.set(userId, { language, until: now + CACHE_MS });
  return language;
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
      .select(['id', 'locale', 'preferences'])
      .where('id', 'in', missing)
      .execute();
    for (const user of rows) {
      const language = languageOfAccount(user);
      if (known.size >= CACHE_MAX) known.delete(known.keys().next().value as string);
      known.set(user.id, { language, until: now + CACHE_MS });
      out.set(user.id, language);
    }
  }
  return out;
}

/** Their account changed what it says: the next thing written to them looks again. */
export function forgetLanguageOf(userId: string): void {
  known.delete(userId);
}

/** Run `work` in `userId`'s language: everything `tr` writes inside is for them. */
export async function asReader<T>(
  ctx: AppContext,
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  return inLanguage(await languageOf(ctx, userId), work);
}
