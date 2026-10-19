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
      '(?:is )?any(?:one|body) waiting (?:for|on) me',
      "what(?:'?s| is| was| have i been| has been) asked of me",
      'what (?:have|has) i been asked(?: to do)?',
      'what (?:was|am) i asked(?: to do)?',
      'what do i owe',
      'what do (?:people|others) (?:want|need) from me',
      'من ينتظرني',
      'مين مستنيني',
      'ماذا (?:طلب|يطلبون) مني',
      'ما المطلوب مني',
      '(?:ايه|وش|شو|ايش|شنو) المطلوب مني',
      'مطلوب مني ايه',
      '(?:شو|ايش|وش|ايه|شنو) (?:طالبين|بدهم|يبون|يبغون|عايزين|عاوزين) مني',
      "qui m'attend",
      "qu'est-ce qu'on (?:m'a demandé|attend de moi)",
      "on m'a demandé quoi",
      'on attend quoi de moi',
      'beni kim bekliyor',
      'benden ne (?:isteniyor|istendi|bekleniyor)',
      'benden neler (?:isteniyor|istendi|bekleniyor)',
    ]),
  ],
  [
    'waiting',
    re([
      'what am i (?:still )?waiting (?:for|on)',
      "(?:what|anything) (?:i'?m|i am) (?:still )?waiting (?:for|on)",
      'who am i (?:still )?waiting (?:for|on)',
      'who owes me',
      "who (?:hasn'?t|has not|didn'?t|did not) (?:got|gotten|get|come|written|replied|answered|responded)(?: back)?(?: to me)?",
      "what(?:'?s| is) (?:still )?pending",
      'ماذا انتظر',
      'ما الذي انتظره',
      'من انتظر',
      'انا مستني (?:ايه|مين)',
      'مستني (?:ايه|مين)',
      '(?:ايش|ايه|شو|وش|شنو) (?:اللي )?(?:انتظره|انا منتظره|منتظره|مستنيه|ناطره|ناطر)',
      'شو عم انطر',
      "qu'est-ce que j'attends",
      "j'attends quoi",
      'qui me doit',
      "qui ne m'a pas (?:répondu|rappelé|recontacté|écrit)",
      'ne(?:yi|leri)? bekliyorum',
      'kimi bekliyorum',
      'bana kim (?:dönmedi|dönüş yapmadı|cevap vermedi|yazmadı)',
    ]),
  ],
  [
    'mine',
    re([
      'what (?:did|have) i promised?',
      "what did i say i(?:'?d| would)",
      'what do i (?:have|need) to do',
      'ما هي مهامي',
      'بماذا وعدت',
      'ماذا علي ان افعل',
      'وعدت بايه',
      '(?:ايه|ايش|شو|وش) (?:اللي )?وعدت(?: (?:بيه|به|فيه))?',
      'لازم اعمل ايه',
      "qu'ai-je promis",
      "j'ai promis quoi",
      "qu'est-ce que j'ai promis",
      "qu'est-ce que je dois faire",
      'ne söz verdim',
      'ne yapmam gerekiyor',
    ]),
  ],
  [
    'coming',
    re([
      "what(?:'?s| is) (?:coming up|next|on my (?:calendar|schedule))",
      "what(?:'?s| is) on (?:for )?(?:today|tomorrow|this week)",
      'what do i have (?:on )?(?:today|tomorrow|this week)',
      'do i have anything (?:on )?(?:today|tomorrow|this week)',
      'ماذا لدي (?:اليوم|غدا|هذا الاسبوع)',
      'ما القادم',
      'عندي ايه (?:النهارده|انهارده|بكره|الاسبوع ده)',
      '(?:وش|شو|ايش|ايه|شنو) عندي (?:اليوم|بكره|بكرا|باكر|باچر|غدا|غدوه|هالاسبوع|الاسبوع ده|هذا الاسبوع|النهارده)',
      'ايه اللي جاي',
      "qu'est-ce que j'ai (?:aujourd'hui|demain|cette semaine)",
      "qu'est-ce qui arrive",
      "quoi de prévu(?: (?:aujourd'hui|demain|cette semaine))?",
      "qu'est-ce qui est prévu",
      "c'est quoi mon programme",
      'bugün ne var',
      'yarın ne var',
      'bu hafta ne var',
      '(?:bugün|yarın|bu hafta) neyim var',
    ]),
  ],
];

/**
 * The same four said as what one has ("my tasks", "مهامي", "takvimim"): only when that's all the
 * message says, with a "show me" or "what are" around it ("summarise my week" is the model's).
 */
const OWN_LISTS: Array<[ChatIntent, RegExp]> = [
  [
    'mine',
    re([
      'my (?:tasks|actions|to-?dos?|to-?do list|open promises|promises|commitments)',
      'مهامي',
      '(?:المهام|مهام) (?:تبعي|تبعتي|حقتي|ديالي|بتاعتي)',
      'mes tâches',
      'ma liste de tâches',
      'mes engagements',
      'görevlerim',
      'görev listem',
      'yapılacaklarım',
      'yapılacaklar listem',
    ]),
  ],
  [
    'coming',
    re([
      'my (?:calendar|schedule|week|agenda)',
      'جدولي',
      'mon agenda',
      "mon programme(?: (?:d'aujourd'hui|de demain|de la semaine))?",
      'takvimim',
      'programım',
    ]),
  ],
];
/** What may stand around one of those and still only ask for it. */
const AROUND_A_LIST = new Set([
  'show',
  'me',
  'list',
  'what',
  'whats',
  "what's",
  'are',
  'is',
  'all',
  'the',
  'please',
  'pls',
  'open',
  'current',
  'now',
  'today',
  'tomorrow',
  'this',
  'week',
  'ما',
  'هي',
  'هو',
  'وش',
  'شو',
  'ايش',
  'ايه',
  'اعرض',
  'وريني',
  'ورني',
  'كل',
  'اليوم',
  'بكره',
  'montre',
  'moi',
  'affiche',
  'quoi',
  "c'est",
  'ce',
  'est',
  'sont',
  'quelles',
  'quels',
  'aujourd',
  "aujourd'hui",
  'hui',
  'demain',
  'göster',
  'bana',
  'listele',
  'neler',
  'ne',
  'nedir',
  'bugün',
  'yarın',
  'bugünkü',
]);

/**
 * A question about one person ("from Ana", "من أحمد", "de Sarah", "Ayşe'den") is the model's,
 * which reads the lines with their names: a rule's list would answer for everyone.
 */
const ABOUT_SOMEONE = re([
  '(?:from|by|with|for|about) (?!people|anyone|anybody|others|everyone|everybody|me\\b|you\\b)\\p{L}+',
  '(?:من|مع|عن) (?!الناس|حد|حدا|احد|الكل|الجميع|غيري|فضلك|بعد|زمان)\\p{L}+',
  "(?:(?:de|avec|du côté de) |d')(?!personne|quelqu'un|les autres|autres|tout le monde|gens|moi(?![\\p{L}\\p{N}]))\\p{L}+",
  "\\p{L}+'(?:den|dan|ten|tan)",
]);

/** "How can you help me", "what can you do", "who are you", anywhere in a short message. */
const HELP = re([
  'help(?: me)?',
  'what can you do',
  'what do you do',
  'how (?:can|could|do|will) you help',
  'what can you help(?: me)? with',
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
  '(?:bana )?nasıl yardımcı ol(?:ursun|abilirsin)',
  'yardımcı olur musun',
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
  for (const [intent, rule] of QUESTIONS) {
    const m = rule.exec(t);
    if (!m) continue;
    // Turkish names the person first: "Ayşe'den ne bekliyorum".
    const about =
      ABOUT_SOMEONE.test(t.slice(m.index + m[0].length)) ||
      /\p{L}+'(?:den|dan|ten|tan)\s+$/u.test(t.slice(0, m.index));
    return about ? null : intent;
  }
  for (const [intent, rule] of OWN_LISTS) {
    const m = rule.exec(t);
    if (!m) continue;
    const left = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).match(/[\p{L}\p{N}']+/gu);
    if ((left ?? []).every((w) => AROUND_A_LIST.has(w))) return intent;
  }
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
