/**
 * Whom a message in a group speaks to (M17 I10): the people named as it's said to them ("Sara, can
 * you…", "…, Sara?", "يا سارة", "Omar, je t'envoie…") and everyone ("Everyone, please…", "يا
 * جماعة", "vous tous", "Arkadaşlar, …"), in every interface language. A name the words only speak
 * of ("send it to Sara", "Sara said") speaks to nobody, and a first name two people in it share
 * names neither: a task filed for the wrong person costs more than one missed. Mentions and
 * replies are the server's to add; this reads the words alone, against the people in the group.
 */
import { foldForFind } from './fold';

export interface Addressable {
  id: string;
  /** The names they're known by here: their own, the writer's nickname for them, their handle. */
  names: Array<string | null | undefined>;
}

export interface Addressed {
  ids: string[];
  everyone: boolean;
}

/** Words that open a sentence before the name it's said to ("Hey Sara,", "Merci Omar,"). */
const GREETINGS = new Set(
  [
    'hey',
    'hi',
    'hello',
    'ok',
    'okay',
    'so',
    'oh',
    'yo',
    'dear',
    'thanks',
    'please',
    'ya',
    'salut',
    'coucou',
    'bonjour',
    'merci',
    'alors',
    'bon',
    'tamam',
    'selam',
    'merhaba',
    'evet',
    'lütfen',
    'tesekkurler',
    'مرحبا',
    'اهلا',
    'شكرا',
    'طيب',
    'تمام',
    'لو سمحت',
  ].map(foldForFind),
);

/** Everyone, as it's said to them: a whole sentence's head or tail. */
const EVERYONE_SAID_TO = new Set(
  [
    'everyone',
    'everybody',
    'all',
    'all of you',
    'you all',
    "y'all",
    'yall',
    'guys',
    'you guys',
    'team',
    'folks',
    'people',
    'gang',
    'جماعة',
    'جماعه',
    'الجماعة',
    'شباب',
    'الشباب',
    'كلكم',
    'الكل',
    'ناس',
    'بنات',
    'tout le monde',
    'vous tous',
    'les gars',
    "l'équipe",
    'la team',
    'herkes',
    'arkadaşlar',
    'millet',
    'ekip',
    'hepiniz',
    'çocuklar',
  ].map(foldForFind),
);

/** Everyone, wherever the words ask it of them. */
const EVERYONE_ASKED =
  /(?:^|[^\p{L}])(?:(?:can|could|would|will)\s+(?:everyone|everybody|all of you|each of you|you all)|(?:everyone|everybody|each of you|all of you)\s+(?:please|should|needs?\s+to|must|has\s+to|have\s+to)|please,?\s+(?:everyone|everybody)|@(?:everyone|all|here)|كلكم|كل\s+واحد\s+(?:فيكم|منكم)|vous\s+tous|chacun\s+(?:de\s+vous|d['’]entre\s+vous)|hepiniz|her\s+biriniz)(?![\p{L}])/iu;

/** What stands at a sentence's head before a comma, or at its tail after one: up to three words. */
const HEAD = /^\s*([^\s,،:!?؟.]+(?:\s+[^\s,،:!?؟.]+){0,3}?)\s*[,،:!]/u;
const TAIL = /[,،]\s*([^\s,،:!?؟.]+(?:\s+[^\s,،:!?؟.]+){0,2})\s*[.!?؟]*\s*$/u;
/** Arabic's "يا", which calls whoever follows it, anywhere in the sentence. */
const YA = /(?:^|[\s,،])يا\s*([^\s,،:!?؟.]+(?:\s+[^\s,،:!?؟.]+)?)/gu;

/** The words before a comma, less a greeting or a "please" that opens them. */
function calledAt(head: string): string[] {
  const words = head.split(/\s+/).filter(Boolean);
  const out = [words.join(' ')];
  let i = 0;
  while (i < words.length - 1 && GREETINGS.has(foldForFind(words[i]!))) {
    i++;
    out.push(words.slice(i).join(' '));
  }
  // "Thank you Sara,", "Lütfen Ayşe,": two words of greeting.
  if (words.length > 2 && GREETINGS.has(foldForFind(words.slice(0, 2).join(' '))))
    out.push(words.slice(2).join(' '));
  return out;
}

/** Each name a person goes by, and their first name: the keys a word said to them may be. */
function keysOf(person: Addressable): string[] {
  const keys = new Set<string>();
  for (const raw of person.names) {
    const name = raw?.trim().replace(/^@/, '');
    if (!name) continue;
    const folded = foldForFind(name).replace(/\s+/g, ' ');
    keys.add(folded);
    const first = folded.split(' ')[0];
    if (first && first.length > 1) keys.add(first);
  }
  return [...keys];
}

export function addressedIn(text: string, people: Addressable[]): Addressed {
  const ids = new Set<string>();
  let everyone = EVERYONE_ASKED.test(text);
  // A key two people share names neither.
  const byKey = new Map<string, Set<string>>();
  for (const p of people)
    for (const key of keysOf(p)) {
      const set = byKey.get(key) ?? new Set<string>();
      set.add(p.id);
      byKey.set(key, set);
    }
  const take = (said: string) => {
    const key = foldForFind(said).replace(/\s+/g, ' ').trim();
    if (!key) return false;
    if (EVERYONE_SAID_TO.has(key)) {
      everyone = true;
      return true;
    }
    const who = byKey.get(key);
    if (who?.size !== 1) return false;
    ids.add([...who][0]!);
    return true;
  };
  for (const sentence of text.replace(/([.!?؟])\s+/g, '$1\n').split(/\n+/)) {
    const head = HEAD.exec(sentence);
    if (head) calledAt(head[1]!).some(take);
    const tail = TAIL.exec(sentence);
    if (tail) calledAt(tail[1]!).some(take);
    for (const m of sentence.matchAll(YA)) {
      const words = m[1]!.split(/\s+/);
      if (!take(words.join(' ')) && words.length > 1) take(words[0]!);
    }
  }
  return { ids: [...ids], everyone };
}
