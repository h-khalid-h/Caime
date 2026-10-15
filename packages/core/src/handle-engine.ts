/**
 * The handle engine (docs/HANDLES.md, policy version 1): one deterministic generator with a
 * policy per kind of entity (a person, an organization), shared by the server and the forms.
 * It proposes handles; it never claims one. Identity is the entity's id, never its handle; a
 * handle is a readable name in the one public namespace (`cai.me/@handle`).
 *
 * Pure: no zod, no I/O, so the sign-up and organization forms take it by subpath.
 */
import { HANDLE_PATTERN, normalizeHandle } from './rules';

/** The rules' version: a change to tokens, templates or order is a new version. */
export const HANDLE_POLICY_VERSION = 1;
/** How many candidates a form is offered at most. */
export const CANDIDATES_MAX = 8;

/**
 * Words that say what someone is to someone, or praise, never who they are (owner's rule
 * 2026-10-15): a handle made of nothing else ("customers", "best.team", "the_family") would let
 * one account stand for everyone's customer, team or family. Kept for Caime; a real name
 * beside one ("macrocare.medical", "nour.family") is fine.
 */
export const GENERIC_WORDS: readonly string[] = [
  // Relationships and roles (the taxonomy's words, singular and plural).
  'customer',
  'customers',
  'client',
  'clients',
  'vendor',
  'vendors',
  'supplier',
  'suppliers',
  'employee',
  'employees',
  'staff',
  'team',
  'teams',
  'colleague',
  'colleagues',
  'manager',
  'managers',
  'boss',
  'family',
  'families',
  'friend',
  'friends',
  'partner',
  'partners',
  'member',
  'members',
  'user',
  'users',
  'people',
  'person',
  'everyone',
  'anyone',
  'someone',
  'nobody',
  'community',
  'group',
  'groups',
  'neighbour',
  'neighbours',
  'neighbor',
  'neighbors',
  'patient',
  'patients',
  'student',
  'students',
  'teacher',
  'teachers',
  'parent',
  'parents',
  'mom',
  'mum',
  'dad',
  'mother',
  'father',
  'brother',
  'sister',
  'son',
  'daughter',
  'wife',
  'husband',
  'baby',
  'kids',
  'children',
  // Organizations by kind alone.
  'company',
  'business',
  'shop',
  'store',
  'clinic',
  'hospital',
  'doctor',
  'doctors',
  'school',
  'restaurant',
  'cafe',
  'hotel',
  'bank',
  'agency',
  'office',
  'studio',
  'service',
  'services',
  'org',
  'organization',
  'organisation',
  'official',
  'support',
  'help',
  'info',
  'contact',
  'sales',
  'billing',
  'news',
  'media',
  'admin',
  'owner',
  'security',
  'verified',
  // Praise and filler.
  'best',
  'top',
  'the',
  'my',
  'our',
  'your',
  'real',
  'true',
  'number',
  'one',
  'first',
  'great',
  'good',
  'nice',
  'cool',
  'super',
  'pro',
  'vip',
  'king',
  'queen',
  'boss',
  'official',
  'new',
  'all',
  'world',
  'global',
  'online',
  'app',
  'hello',
  'hi',
  'test',
  'demo',
  'example',
  'sample',
];
const GENERIC = new Set(GENERIC_WORDS);

/** Whether every word of `handle` is generic (or a number): a handle nobody may make. */
export function isGenericHandle(handle: string): boolean {
  // Digits run on to a word are a number of their own ("top1" is "top" and "1").
  const words = normalizeHandle(handle)
    .split(/[._\d]+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => GENERIC.has(w));
}

/**
 * A handle as it's compared for lookalikes (macrocare, macro.care, rnacrocare, macr0care): no
 * separators, digits that pass for letters read as them, "rn" as "m", "vv" as "w". Two handles
 * with one skeleton are one name to a reader; the second is refused. The server's
 * `handle_skeleton` columns are the same function in SQL (migration 0088), held equal by a test.
 */
export function handleSkeleton(handle: string): string {
  return normalizeHandle(handle)
    .replace(/[._-]/g, '')
    .replace(/0/g, 'o')
    .replace(/[1i]/g, 'l')
    .replace(/5/g, 's')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w');
}

/**
 * A name as handle words: Latin letters with their accents taken off ("José" → "jose", "Øre" →
 * "ore", "Straße" → "strasse"), split on anything else. A name in another script gives no words:
 * it is never guessed at (a transliteration would misspell someone's name); the form asks for
 * the Latin spelling the person uses instead.
 */
export function handleWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/[đĐ]/g, 'd')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Whether a name has letters to make a handle from (its Latin spelling, or none to be asked). */
export function hasHandleLetters(name: string): boolean {
  return handleWords(name).some((w) => /[a-z]/.test(w));
}

/** Name particles a family name may begin with: kept with it ("van der berg", "el masry"). */
const PARTICLES = new Set([
  'al',
  'el',
  'abu',
  'abou',
  'bin',
  'ben',
  'ibn',
  'van',
  'von',
  'der',
  'den',
  'de',
  'del',
  'della',
  'da',
  'di',
  'du',
  'la',
  'le',
  'dos',
  'das',
  'st',
  'mac',
  'mc',
]);

/** Legal forms an organization's name ends with, left out of its handle. */
const LEGAL_FORMS = new Set([
  'llc',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'gmbh',
  'ag',
  'sa',
  'sae',
  'sas',
  'sarl',
  'srl',
  'spa',
  'bv',
  'nv',
  'oy',
  'ab',
  'as',
  'pte',
  'pty',
  'lp',
  'llp',
  'fzco',
  'fze',
  'fzllc',
  'wll',
  'est',
  'group',
  'holding',
  'holdings',
  'and',
]);

/** A candidate within the grammar (3–30, starts and ends with a letter or digit), else null. */
function shape(parts: string[], sep: '.' | '_' | ''): string | null {
  const h = parts.filter(Boolean).join(sep);
  return h.length <= 30 && HANDLE_PATTERN.test(h) && !/[._]{2}/.test(h) ? h : null;
}

/** In order, each once, the ones within the grammar and not generic. */
function ordered(list: Array<string | null>): string[] {
  const out: string[] = [];
  for (const h of list)
    if (h && !out.includes(h) && !isGenericHandle(h) && out.length < CANDIDATES_MAX) out.push(h);
  return out;
}

export interface PersonNames {
  /** The name they go by, as they wrote it ("Hussein Khalid"). */
  displayName: string;
  /** Their name in Latin letters, when the name they go by is in another script. */
  latinName?: string | null;
}

/**
 * A person's handles, best first (policy 1): given and family name ("hussein.khalid"), run
 * together, the initial and the family name, the given and the whole compound family name, the
 * given name alone. A name of one word is that word (no family name is invented). Never a
 * birth date, a year or a gender.
 */
export function personCandidates(names: PersonNames): string[] {
  const words = handleWords(names.latinName?.trim() || names.displayName).filter(
    (w) => !/^\d+$/.test(w),
  );
  if (words.length === 0) return [];
  const given = words[0] ?? '';
  if (words.length === 1) return ordered([shape([given], '')]);
  // The family name is the last word, with any particles before it ("el.masry").
  let at = words.length - 1;
  while (at > 1 && PARTICLES.has(words[at - 1] ?? '')) at--;
  const family = words.slice(at);
  const last = words[words.length - 1] ?? '';
  const middle = words.slice(1, at);
  return ordered([
    shape([given, family.join('')], '.'),
    shape([given, last], '.'),
    shape([given, ...family], '.'),
    shape([given, family.join('')], ''),
    shape([given[0] ?? '', family.join('')], '.'),
    shape([given, family.join('')], '_'),
    shape([given, ...middle.map((m) => m[0] ?? ''), family.join('')], '.'),
    shape([given, ...middle, ...family], '.'),
    shape([given], ''),
  ]);
}

export interface OrgNames {
  /** The name it's known by ("Macrocare"). */
  name: string;
  /** Its registered name, when it differs ("Macrocare Medical Tourism LLC"). */
  legalName?: string | null;
}

/**
 * An organization's handles, best first (policy 1): its brand run together ("macrocare"), then
 * the brand with its registered name's words ("macrocare.medical", "macrocaremedicaltourism"),
 * then its initials. Legal forms (LLC, S.A.E., GmbH) are left out, and so are years and
 * registration numbers; a brand's own short number stays ("forever21").
 */
export function orgCandidates(names: OrgNames): string[] {
  // A brand's own short number stays ("Forever 21", "7 Eleven"); a year or a registration
  // number never does, and the registered name's numbers are all left out.
  const strip = (s: string, number: RegExp) =>
    handleWords(s.replace(/\./g, '')).filter((w) => !LEGAL_FORMS.has(w) && !number.test(w));
  const brand = strip(names.name, /^\d{4,}$/);
  const legal = strip(names.legalName ?? '', /^\d+$/);
  if (brand.length === 0 && legal.length === 0) return [];
  const base = brand.length ? brand : legal;
  // What the registered name adds to the brand ("medical", "tourism").
  const more = legal.filter((w) => !base.includes(w));
  const initials = (ws: string[]) => (ws.length > 1 ? ws.map((w) => w[0]).join('') : null);
  return ordered([
    shape(base, ''),
    shape(base, '.'),
    more[0] ? shape([...base, more[0]], '.') : null,
    more.length ? shape([...base, ...more], '') : null,
    more.length ? shape([...base, ...more], '.') : null,
    shape(base, '_'),
    initials(base) ? shape([initials(base) ?? ''], '') : null,
    legal.length > 1 ? shape([initials(legal) ?? ''], '') : null,
  ]);
}
