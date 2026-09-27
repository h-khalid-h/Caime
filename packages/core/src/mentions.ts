/**
 * Mentions (PRD §20): "@Alex Chen" in a message tells Alex, if they're in the conversation, that
 * it's for them. Who a message mentions is read from its text as it's sent, so a draft kept for
 * later, or a name typed out in full, mentions whoever it names; the picker only helps type it.
 */

export interface Mentionable {
  userId: string;
  displayName: string;
  handle?: string | null;
}

/** Compared without case or accents: "@jose" finds José. */
const fold = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/** A letter or digit straight after "@name" makes it a longer word, and before "@", an address. */
const WORDISH = /[\p{L}\p{N}_]/u;

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

/** Who a message's text mentions: where one name starts another ("@Al Smith"), the longer. */
export function mentionedIn(text: string, people: Mentionable[]): string[] {
  const hay = fold(text);
  const names = people
    .flatMap((p) =>
      [p.displayName, p.handle ?? '']
        .map((n) => fold(n.trim()))
        .filter(Boolean)
        .map((name) => ({ id: p.userId, name })),
    )
    .sort((a, b) => b.name.length - a.name.length);
  const found = new Set<string>();
  for (let at = hay.indexOf('@'); at !== -1; at = hay.indexOf('@', at + 1)) {
    if (at > 0 && WORDISH.test(hay.charAt(at - 1))) continue;
    const rest = hay.slice(at + 1);
    const hit = names.find(
      (n) => rest.startsWith(n.name) && !WORDISH.test(rest.charAt(n.name.length)),
    );
    if (hit) found.add(hit.id);
  }
  return [...found];
}
