/**
 * Mentions (PRD §20): "@Alex Chen" in a message tells Alex, if they're in the conversation, that
 * it's for them. Who a message mentions is read from its text as it's sent, so a draft kept for
 * later, or a name typed out in full, mentions whoever it names; the picker only helps type it.
 * A name two people share names neither of them: the picker writes such a person's handle.
 */

export interface Mentionable {
  userId: string;
  displayName: string;
  handle?: string | null;
}

/** Compared as written, without case. */
const exact = (s: string) => s.normalize('NFC').toLocaleLowerCase();

/**
 * Compared without case, nor the accents a Latin, Greek or Cyrillic letter can go without: "@jose"
 * finds José. A mark that makes another letter (kana's voicing, an Indic vowel sign) stays.
 */
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLocaleLowerCase();

/** A letter or digit straight after "@name" makes it a longer word, and before "@", an address. */
const WORDISH = /[\p{L}\p{N}_]/u;

/** Scripts written without spaces between words: a name there runs straight into what follows. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/** Where "@name" ends, the name ends: what follows isn't more of the same word. */
const endsAt = (text: string, at: number) =>
  !WORDISH.test(text.charAt(at)) || UNSPACED.test(text.charAt(at));

/** The longest a name being typed after "@" runs before it stops being one. */
const QUERY_MAX = 40;

/**
 * The "@…" being typed just before the caret, if any: where its "@" is and what follows it so
 * far. A name can have spaces in it ("@Alex Ch"), never a line break, two spaces or another "@".
 */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const start = before.lastIndexOf('@');
  if (start === -1 || before.length - start - 1 > QUERY_MAX) return null;
  if (start > 0 && WORDISH.test(before.charAt(start - 1))) return null;
  const query = before.slice(start + 1);
  if (/[\n@]/.test(query) || /\s\s/.test(query) || /^\s/.test(query)) return null;
  return { start, query };
}

/**
 * Who in the conversation "@query" could be, best first: a name that starts with it, then one
 * with a word that does, then a handle that does.
 */
export function mentionCandidates<T extends Mentionable>(query: string, people: T[], max = 6): T[] {
  const q = fold(query);
  const rank = (p: T): number => {
    const name = fold(p.displayName);
    if (name.startsWith(q)) return 0;
    if (!/\s/.test(q) && name.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (p.handle && fold(p.handle).startsWith(q)) return 2;
    return -1;
  };
  return people
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.p.displayName.localeCompare(b.p.displayName))
    .slice(0, max)
    .map((x) => x.p);
}

/** What the picker writes after "@": their name, or their handle when someone else has it too. */
export function mentionText(person: Mentionable, people: Mentionable[]): string {
  const name = fold(person.displayName.trim());
  const shared = people.some(
    (p) =>
      p.userId !== person.userId &&
      (fold(p.displayName.trim()) === name || (p.handle ? fold(p.handle) === name : false)),
  );
  return shared && person.handle ? person.handle : person.displayName;
}

type Named = { id: string; exact: string; folded: string };

/** What "@…" was read as: whose name (null when several people have it), and how it was written. */
type Hit = { id: string | null; name: string; form: 'exact' | 'folded' };

/**
 * Who "@…" names, compared one way: the longest name it starts with, when one person has it.
 * Undefined when nobody's does; an id of null when several people's do, which names none of them.
 */
function named(rest: string, names: Named[], form: 'exact' | 'folded'): Hit | undefined {
  const hay = form === 'exact' ? exact(rest) : fold(rest);
  let longest = 0;
  let name = '';
  const ids = new Set<string>();
  for (const n of names) {
    const candidate = n[form];
    if (candidate.length < longest || !hay.startsWith(candidate) || !endsAt(hay, candidate.length))
      continue;
    if (candidate.length > longest) ids.clear();
    longest = candidate.length;
    name = candidate;
    ids.add(n.id);
  }
  if (ids.size === 0) return undefined;
  return { id: ids.size > 1 ? null : ([...ids][0] ?? null), name, form };
}

const namesOf = (people: Mentionable[]): Named[] =>
  people.flatMap((p) =>
    [p.displayName, p.handle ?? '']
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => ({ id: p.userId, exact: exact(n), folded: fold(n) })),
  );

/** As written first ("@Zoë" is Zoë, not Zoe), then without accents ("@jose" is José). */
const hitAt = (rest: string, names: Named[]): Hit | undefined =>
  named(rest, names, 'exact') ?? named(rest, names, 'folded');

/**
 * Who a message's text mentions: where one name starts another ("@Al Smith"), the longer; as
 * written first ("@Zoë" is Zoë, not Zoe), then without accents ("@jose" is José).
 */
export function mentionedIn(text: string, people: Mentionable[]): string[] {
  return [...new Set(mentionSpans(text, people).map((s) => s.userId))];
}

/** How many of the text's own characters a name read in one form takes ("ﬁ" folds to two). */
function writtenLength(rest: string, hit: Hit): number {
  const form = hit.form === 'exact' ? exact : fold;
  const from = Math.max(1, hit.name.length - 2);
  for (let k = from; k <= Math.min(rest.length, hit.name.length + 4); k++)
    if (form(rest.slice(0, k)) === hit.name) return k;
  return Math.min(rest.length, hit.name.length);
}

export interface MentionSpan {
  /** Where its "@" is in the text. */
  start: number;
  /** Just past the name. */
  end: number;
  userId: string;
}

/**
 * Where a message's text names someone (M16 E3): each "@name" that mentions one person, as the
 * span a bubble marks, read as `mentionedIn` reads them.
 */
export function mentionSpans(text: string, people: Mentionable[]): MentionSpan[] {
  const names = namesOf(people);
  const spans: MentionSpan[] = [];
  if (names.length === 0) return spans;
  let at = text.indexOf('@');
  while (at !== -1) {
    const next = at + 1;
    if (at > 0 && WORDISH.test(text.charAt(at - 1))) {
      at = text.indexOf('@', next);
      continue;
    }
    const rest = text.slice(next);
    // A name several people have names none of them.
    const hit = hitAt(rest, names);
    if (!hit?.id) {
      at = text.indexOf('@', next);
      continue;
    }
    const end = next + writtenLength(rest, hit);
    spans.push({ start: at, end, userId: hit.id });
    at = text.indexOf('@', end);
  }
  return spans;
}
