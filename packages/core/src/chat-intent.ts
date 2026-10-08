/**
 * What a message to one of Caime's own accounts asks (R67, R71), by the rules, in every interface
 * language: the four questions about one's own open things (what you wait on, what's asked of
 * you, what you said you'd do, what's coming up), and the small talk anyone opens with (a
 * greeting, "how can you help me", thanks). Anything else is the model's, for whoever may use it.
 * Also which interface language a message is written in, so an answer by the rules is said in
 * the writer's language, not only the account's. Pure, no zod; the server's alone (the app never
 * loads it).
 */
import type { InterfaceLanguage } from './i18n';
import { latinScores } from './latin-language';

export type ChatIntent = 'waiting' | 'asked' | 'mine' | 'coming' | 'greeting' | 'help' | 'thanks';

/** Letters only, the way people type them: Arabic without its marks or letter variants, any case. */
export function foldForIntent(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[’‘`]/g, "'")
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const re = (alternatives: string[]) => new RegExp(`${B}(?:${alternatives.join('|')})${E}`, 'u');

/**
 * Each a question about one's own open things, as people say it (folded: Arabic without hamza
 * forms, "ي" for "ى"); anything wider ("what to do in Paris today") is the model's, so a list
 * never answers a sentence it wasn't asked.
 */
const QUESTIONS: Array<[ChatIntent, RegExp]> = [
  [
    'asked',
    re([
      "who(?:'?s| is) waiting (?:for|on) me",
      "what(?:'?s| is| was| have i been) asked of me",
      'what do i owe',
      'what do (?:people|others) (?:want|need) from me',
      'من ينتظرني',
      'مين مستنيني',
      'ماذا (?:طلب|يطلبون) مني',
      'ما المطلوب مني',
      'ايه المطلوب مني',
      'مطلوب مني ايه',
      "qui m'attend",
      "qu'est-ce qu'on (?:m'a demandé|attend de moi)",
      'beni kim bekliyor',
      'benden ne (?:isteniyor|istendi|bekleniyor)',
    ]),
  ],
  [
    'waiting',
    re([
      'what am i waiting (?:for|on)',
      'who am i waiting (?:for|on)',
      'who owes me',
      "what(?:'?s| is) (?:still )?pending",
      'ماذا انتظر',
      'ما الذي انتظره',
      'من انتظر',
      'انا مستني (?:ايه|مين)',
      'مستني (?:ايه|مين)',
      "qu'est-ce que j'attends",
      "j'attends quoi",
      'qui me doit',
      'ne bekliyorum',
      'kimi bekliyorum',
    ]),
  ],
  [
    'mine',
    re([
      'my (?:tasks|actions|to-?dos?|to-?do list)',
      'what (?:did|have) i promised?',
      "what did i say i(?:'?d| would)",
      'what do i (?:have|need) to do',
      'ما هي مهامي',
      'مهامي',
      'بماذا وعدت',
      'ماذا علي ان افعل',
      'وعدت بايه',
      'لازم اعمل ايه',
      'mes tâches',
      "qu'ai-je promis",
      "j'ai promis quoi",
      "qu'est-ce que je dois faire",
      'görevlerim',
      'ne söz verdim',
      'ne yapmam gerekiyor',
    ]),
  ],
  [
    'coming',
    re([
      "what(?:'?s| is) (?:coming up|next|on my (?:calendar|schedule))",
      'my (?:calendar|schedule|week|agenda)',
      'what do i have (?:today|tomorrow|this week)',
      'ماذا لدي (?:اليوم|غدا|هذا الاسبوع)',
      'ما القادم',
      'جدولي',
      'عندي ايه (?:النهارده|انهارده|بكره|الاسبوع ده)',
      'ايه اللي جاي',
      "qu'est-ce que j'ai (?:aujourd'hui|demain|cette semaine)",
      'mon agenda',
      "qu'est-ce qui arrive",
      'bugün ne var',
      'yarın ne var',
      'bu hafta ne var',
      'takvimim',
    ]),
  ],
];

/** "How can you help me", "what can you do", "who are you", anywhere in a short message. */
const HELP = re([
  'help(?: me)?',
  'what can you do',
  'what do you do',
  'how (?:can|could|do|will) you help',
  'who are you',
  'what are you',
  'ساعدني',
  'مساعده',
  'تساعدني',
  'تساعدنا',
  '(?:بت|ت)عمل ايه',
  'ماذا تستطيع',
  'ماذا تفعل',
  'ماذا يمكنك',
  'ما الذي يمكنك',
  'من انت',
  'انت مين',
  'مين انت',
  'شو بتعمل',
  'شو بتقدر',
  'وش تقدر',
  'ايش تسوي',
  'aide(?:[ -]moi)?',
  "(?:tu peux|vous pouvez|peux-tu|pouvez-vous) m'aider",
  "comment (?:tu peux|vous pouvez|peux-tu|pouvez-vous) m'aider",
  "qu'est-ce que (?:tu sais|tu peux|vous savez|vous pouvez) faire",
  'tu (?:sais )?fais quoi',
  'tu sers à quoi',
  'qui es-tu',
  "t'es qui",
  'yardım(?: et)?',
  'yardim',
  'ne(?:ler)? yapabilirsin',
  'ne işe yararsın',
  'sen kimsin',
  'bana nasıl yardım',
]);

const THANKS = re([
  'thanks?(?: you)?(?: so much| a lot)?',
  'thx',
  'ty',
  'cheers',
  'appreciate it',
  'شكرا',
  'متشكر',
  'تسلم',
  'مرسي',
  'يعطيك العافيه',
  'جزاك الله خير',
  'merci(?: beaucoup)?',
  'teşekkür(?:ler| ederim)',
  'sağ ?ol(?:un)?',
  'eyvallah',
  'tşk',
]);

/** "Peace be upon you", as it's greeted in Arabic, French and Turkish: answered in kind. */
const PEACE = re([
  'السلام عليكم',
  'سلام عليكم',
  '(?:as-?)?salam(?:u|o)? ?(?:alaikum|alaykum|aleykum|alikoum|alaikoum)',
  '(?:es-?)?selam(?:ün|un)? aleyk(?:ü|u)m',
]);

const GREETING = re([
  'hi',
  'hello',
  'hey',
  'hiya',
  'yo',
  'howdy',
  'good (?:morning|afternoon|evening)',
  "what'?s up",
  'السلام عليكم',
  'سلام',
  'مرحبا',
  'اهلا',
  'اهلين',
  'هاي',
  'هلا',
  'صباح الخير',
  'مساء الخير',
  'ازيك',
  'عامل ايه',
  'كيفك',
  'كيف حالك',
  'شلونك',
  'bonjour',
  'bonsoir',
  'salut',
  'coucou',
  'slt',
  'salam',
  'merhaba',
  'selam',
  'günaydın',
  'iyi akşamlar',
  'naber',
  'nasılsın',
  'mrb',
  'slm',
]);

/** Words that only address someone ("يا Panda", "ya Momo"): they don't make a message longer. */
const ADDRESS = /(?<![\p{L}\p{N}])(?:يا|ya)(?![\p{L}\p{N}])/gu;

/**
 * Whether the message is mostly the phrase: what's left once it (and any other small talk) is
 * taken out is at most `rest` words, a name or "there". "Hello Caishy" is a greeting, "hi, can
 * you plan dinner for four" is a question.
 */
function mostly(t: string, rule: RegExp, rest: number): boolean {
  if (!rule.test(t)) return false;
  let left = t;
  for (const r of [rule, HELP, THANKS, PEACE, GREETING])
    left = left.replace(new RegExp(r.source, 'gu'), ' ');
  const words = left.replace(ADDRESS, ' ').match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length <= rest;
}

/** The rule-answered thing a message asks, if it's one; null sends it to the model. */
export function chatIntent(text: string): ChatIntent | null {
  const t = foldForIntent(text);
  if (!t) return null;
  for (const [intent, rule] of QUESTIONS) if (rule.test(t)) return intent;
  if (mostly(t, HELP, 3)) return 'help';
  if (mostly(t, THANKS, 2)) return 'thanks';
  if (mostly(t, PEACE, 2) || mostly(t, GREETING, 2)) return 'greeting';
  return null;
}

/** Whether a message greets with peace ("السلام عليكم", "selamün aleyküm"), to answer in kind. */
export function greetsWithPeace(text: string): boolean {
  return PEACE.test(foldForIntent(text));
}

/**
 * The interface language a message is written in, or null when it doesn't say ("ok", "👍", a
 * name): Arabic by its letters, French, Turkish or English by the words each can't do without
 * (`latinScores`), only when one scores above the others.
 */
export function writtenIn(text: string): InterfaceLanguage | null {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-zÀ-ÿĞğŞşİıÇçÖöÜü]/g) ?? []).length;
  if (arabic > latin) return 'ar';
  if (!latin) return null;
  const s = latinScores(text);
  if (s.en > s.fr && s.en > s.tr) return 'en';
  if (s.fr > s.en && s.fr > s.tr) return 'fr';
  if (s.tr > s.en && s.tr > s.fr) return 'tr';
  return null;
}
