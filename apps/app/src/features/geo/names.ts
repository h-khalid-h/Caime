/** Languages by name, for a tag the list has or one a device reports (pure, so tests share it). */
import { LANGUAGES } from '@caime/core/languages';

/**
 * A language's own name from the names of its varieties on the list: what they all say
 * ("German" of "Austrian German" and "German (Germany)", "Portuguese" of "Brazilian Portuguese"
 * and "European Portuguese"), else the shortest without its region ("Deutsch", "中文").
 */
function languageName(names: string[]): string | undefined {
  const bare = (name: string) => name.replace(/\s*[(（].*$/, '');
  const [first, ...rest] = names.map((n) => n.split(/\s+/));
  const shared = first?.filter((w) => rest.every((r) => r.includes(w))) ?? [];
  if (shared.length && rest.length) return shared.join(' ');
  return names.map(bare).sort((x, y) => x.length - y.length)[0];
}

/**
 * A language's name in itself and in English: the list's, or for a tag it doesn't have (a
 * device's "de", "en-EG"), the runtime's, else its language's from the list with its region's
 * code ("English (EG)").
 */
export function namesOf(tag: string): { native: string; english: string } {
  const listed = LANGUAGES.find((l) => l.tag === tag);
  if (listed) return { native: listed.native, english: listed.english };
  const named = (locales: string[]) => {
    try {
      return typeof Intl.DisplayNames === 'function'
        ? (new Intl.DisplayNames(locales, { type: 'language' }).of(tag) ?? null)
        : null;
    } catch {
      return null;
    }
  };
  const [language, ...rest] = tag.split('-');
  const region = rest.find((p) => /^[A-Z]{2}$|^\d{3}$/.test(p));
  const kin = LANGUAGES.filter((l) => l.tag.split('-')[0] === language);
  const guess = (names: string[]) => {
    const name = languageName(names);
    return name && region ? `${name} (${region})` : name;
  };
  return {
    native: named([tag]) ?? guess(kin.map((l) => l.native)) ?? tag,
    english: named(['en']) ?? guess(kin.map((l) => l.english)) ?? tag,
  };
}
