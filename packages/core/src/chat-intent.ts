/**
 * What a message to one of Caime's own accounts asks (R67, R71), by the rules, in every interface
 * language: the four questions about one's own open things (what you wait on, what's asked of
 * you, what you said you'd do, what's coming up), the same about one person with what you agreed
 * and whether they paid (`chatAbout`, G11), and the small talk anyone opens with (a greeting,
 * "how can you help me", thanks). Anything else is the model's, for whoever may use it.
 * Also which interface language a message is written in, so an answer by the rules is said in
 * the writer's language, not only the account's. Pure, no zod; the server's alone (the app never
 * loads it).
 */
import type { InterfaceLanguage } from './i18n';
import { latinScores } from './latin-language';
import { relationshipFromWord, type Sphere } from './taxonomy';

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

/** What a question about one person asks (G11): the four, what you agreed, whether they paid. */
export type AboutIntent = 'waiting' | 'asked' | 'mine' | 'coming' | 'agreed' | 'paid';

/** A rule's source, tolerant of how Arabic is typed: any alef, "ى" or "ي", "ة" or "ه". */
const tolerantAr = (source: string) =>
  source.replace(/ا/g, '[اأإآ]').replace(/ي/g, '[يى]').replace(/ه/g, '[هة]');
/**
 * A day said beside a name ("Ana yesterday", "Murat dün", "منى امبارح"), never part of it: the
 * answer lists every open thing with its date, so the day changes nothing it says.
 */
const TIME =
  "(?:yesterday|today|tonight|tomorrow|lately|recently|earlier|this\\s+week|last\\s+week|hier|aujourd'hui|demain|cette\\s+semaine|la\\s+semaine\\s+derni[èe]re|dün|bugün|yarın|bu\\s+hafta|geçen\\s+hafta|امبارح|مبارح|النهارده|النهاردة|اليوم|بكره|بكرة|غدا|امس|البارحه|البارحة|هالاسبوع|الاسبوع\\s+ده)";
/** A name as typed: a word or two ("Ana", "Ana Lopez", "أحمد", "Ayşe"), never a day beside it. */
const NAME = `([\\p{L}][\\p{L}'’.-]*(?:\\s+(?!(?:next|now|please|yet|back|again|me|you|${tolerantAr(TIME).slice(3, -1)}|الفلوس|المبلغ|الحساب|الفاتوره|الفاتورة|حقي|مني)(?![\\p{L}]))[\\p{L}][\\p{L}'’.-]*)?)`;
/** Words a name never is: a question about everyone, or about oneself, or a day. */
const NOT_A_NAME =
  /^(?:me|you|him|her|them|us|i|we|they|he|she|it|someone|somebody|people|anyone|anybody|everyone|everybody|others|the|my|moi|toi|lui|elle|eux|on|je|tu|il|nous|vous|ils|elles|quelqu'un|ça|ce|personne|les|o|biz|siz|onlar|birisi|الناس|حد|حدا|الكل|الجميع|بيه|به|فيه|عليه|ليه|انا|أنا|انت|إنت|هو|هي|نفسي|ben|sen|herkes|kimse|yesterday|today|tonight|tomorrow|lately|recently|earlier|hier|aujourd'hui|demain|dün|bugün|yarın|امبارح|إمبارح|مبارح|النهارده|النهاردة|اليوم|بكره|بكرة|غدا|امس|أمس|البارحه|البارحة)$/iu;
/** Where a name goes in a rule: "@" before it is a handle's, a day after it says nothing. */
const NAMED = `@?${NAME}(?:\\s+${tolerantAr(TIME)})?`;
const asked = (sources: string[]) =>
  sources.map(
    (s) =>
      new RegExp(
        `^(?:${tolerantAr(s).replaceAll('NAME', NAMED)})(?:\\s+(?:now|please|maintenant|الحين|دلوقتي|şimdi|${tolerantAr(TIME)}))?\\s*[?؟.!]*$`,
        'iu',
      ),
  );

/**
 * The questions about one person the rules answer from the person's own records, in every
 * interface language: "what am I waiting for from Ana", "what did Ana ask me", "what did I
 * promise Ana", "when am I seeing Ana", "what did Ana and I agree", "did Ana pay".
 */
const ABOUT: Array<[AboutIntent, RegExp[]]> = [
  [
    'waiting',
    asked([
      "(?:what|anything)\\s+(?:am\\s+i|i'?m|i\\s+am)\\s+(?:still\\s+)?waiting\\s+(?:for|on)\\s+from\\s+NAME",
      'what\\s+(?:does|do)\\s+NAME\\s+owe\\s+me',
      "what(?:'s|\\s+is)\\s+NAME\\s+(?:supposed|meant)\\s+to\\s+(?:send|do|give)\\s+me",
      'what\\s+(?:am\\s+i|i\\s+am)\\s+(?:still\\s+)?waiting\\s+(?:for|on)\\s+NAME\\s+(?:for|to\\s+(?:send|do))',
      '(?:انا\\s+)?(?:مستني|منتظر|ناطر)\\s+(?:ايه|ايش|شو|وش)\\s+من\\s+NAME',
      '(?:ايه|ايش|شو|وش)\\s+(?:اللي\\s+)?(?:انا\\s+)?(?:مستنيه|منتظره|ناطره|انتظره)\\s+من\\s+NAME',
      'ماذا\\s+انتظر\\s+من\\s+NAME',
      '(?:ايه|ايش|شو|وش)\\s+(?:انا\\s+)?(?:مستني|منتظر|ناطر)\\s+من\\s+NAME',
      "(?:qu'est-ce\\s+que|que)\\s+j'attends\\s+(?:encore\\s+)?de\\s+NAME",
      "j'attends\\s+quoi\\s+de\\s+NAME",
      "qu'est-ce\\s+que\\s+NAME\\s+me\\s+doit",
      "NAME'(?:den|dan|ten|tan)\\s+ne(?:yi|leri)?\\s+bekliyorum",
      'NAME\\s+bana\\s+ne\\s+borçlu',
    ]),
  ],
  [
    'asked',
    asked([
      'what\\s+(?:did|has)\\s+NAME\\s+ask(?:ed)?\\s+(?:me|of\\s+me)(?:\\s+(?:to\\s+do|for))?',
      'what\\s+does\\s+NAME\\s+(?:want|need)(?:\\s+from\\s+me)?',
      'is\\s+NAME\\s+waiting\\s+(?:for|on)\\s+me(?:\\s+for\\s+anything)?',
      '(?:ايه|ايش|شو|وش|ماذا)\\s+(?:اللي\\s+)?(?:طلب|طلبت|طلبه|طلبته|عايز|عايزه|بده|بدها|يبي|تبي|يبغى)\\s+NAME\\s+مني',
      'NAME\\s+(?:طلب|طلبت|عايز|عايزه|بده|بدها|يبي|تبي)\\s+مني\\s+(?:ايه|ايش|شو|وش)',
      '(?:ماذا|ايه|ايش|شو|وش)\\s+(?:اللي\\s+)?(?:طلب|طلبت|طلبه|طلبته|عايز|عايزه|بده|بدها)\\s+مني\\s+NAME',
      "(?:qu'est-ce\\s+que|que)\\s+NAME\\s+m'a\\s+demandé",
      "NAME\\s+m'a\\s+demandé\\s+quoi",
      "qu'est-ce\\s+que\\s+NAME\\s+attend\\s+de\\s+moi",
      'NAME\\s+benden\\s+ne\\s+(?:istedi|istiyor|bekliyor)',
    ]),
  ],
  [
    'mine',
    asked([
      "what\\s+did\\s+i\\s+(?:promise(?:\\s+to)?|say\\s+i'?d\\s+do\\s+for)\\s+NAME",
      'what\\s+do\\s+i\\s+owe\\s+NAME',
      '(?:ايه|ايش|شو|وش|بماذا)\\s+(?:اللي\\s+)?وعدت\\s+(?:به\\s+|بيه\\s+)?NAME',
      'وعدت\\s+NAME\\s+ب(?:ايه|ايش|شو|ماذا)',
      "(?:qu'est-ce\\s+que|que)\\s+j'ai\\s+promis\\s+(?:à|a)\\s+NAME",
      "j'ai\\s+promis\\s+quoi\\s+(?:à|a)\\s+NAME",
      "qu'est-ce\\s+que\\s+je\\s+dois\\s+(?:à|a)\\s+NAME",
      "NAME'(?:a|e|ya|ye)\\s+ne\\s+(?:söz\\s+verdim|borçluyum)",
    ]),
  ],
  [
    'coming',
    asked([
      'when\\s+(?:am\\s+i|do\\s+i|will\\s+i)\\s+(?:seeing|see|meeting|meet)\\s+NAME(?:\\s+next)?',
      "when(?:'s|\\s+is)\\s+my\\s+(?:next\\s+)?(?:meeting|call|appointment)\\s+with\\s+NAME",
      "what(?:'s|\\s+is)\\s+(?:coming\\s+up|planned|next)\\s+with\\s+NAME",
      '(?:امتى|متى|ايمتى|وقتاش|فوقاش)\\s+(?:هشوف|حشوف|بشوف|اشوف|راح\\s+اشوف|رح\\s+شوف|هقابل|بقابل|اقابل)\\s+NAME',
      '(?:امتى|متى|ايمتى)\\s+(?:اجتماعي|موعدي|ميعادي|معادي)\\s+(?:الجاي\\s+)?مع\\s+NAME',
      'quand\\s+(?:est-ce\\s+que\\s+)?(?:je\\s+vois|je\\s+verrai|je\\s+rencontre|vois-je)\\s+NAME',
      "c'est\\s+quand\\s+(?:mon\\s+)?(?:prochain\\s+)?(?:rendez-vous|rdv|réunion|appel)\\s+avec\\s+NAME",
      '(?:je\\s+vois|je\\s+verrai|je\\s+rencontre)\\s+NAME\\s+quand',
      "NAME(?:\\s+ile|'(?:le|la|yle|yla))\\s+ne\\s+zaman\\s+(?:görüşüyorum|buluşuyorum|görüşeceğim|buluşacağım)",
    ]),
  ],
  [
    'agreed',
    asked([
      'what\\s+did\\s+NAME\\s+and\\s+i\\s+(?:agree|decide)(?:\\s+on)?',
      'what\\s+did\\s+(?:i|we)\\s+(?:agree|decide)(?:\\s+on)?\\s+with\\s+NAME',
      'what\\s+have\\s+(?:i|we)\\s+(?:agreed|decided)\\s+with\\s+NAME',
      '(?:اتفقنا|قررنا|اتفقت)\\s+(?:على\\s+)?(?:ايه|ايش|شو|وش)\\s+(?:انا\\s+و\\s*|مع\\s+)NAME',
      '(?:ايه|ايش|شو|وش)\\s+اللي\\s+(?:اتفقنا|قررنا|اتفقت)\\s+عليه\\s+(?:انا\\s+و\\s*|مع\\s+)NAME',
      '(?:ايه|ايش|شو|وش|ماذا)\\s+(?:اتفقنا|قررنا|اتفقت)\\s+(?:عليه\\s+)?(?:انا\\s+و\\s*|مع\\s+)NAME',
      "(?:qu'est-ce\\s+qu'on\\s+a|qu'avons-nous|qu'est-ce\\s+que\\s+j'ai)\\s+(?:décidé|convenu)\\s+avec\\s+NAME",
      "on\\s+s'est\\s+mis\\s+d'accord\\s+sur\\s+quoi\\s+avec\\s+NAME",
      "NAME(?:\\s+ile|'(?:le|la|yle|yla))\\s+ne(?:ye)?\\s+(?:karar\\s+verdik|anlaştık)",
    ]),
  ],
  [
    'paid',
    asked([
      '(?:did|has)\\s+NAME\\s+(?:pay|paid)(?:\\s+(?:me|yet|back))*',
      'هل\\s+(?:دفع|دفعت|حول|حولت|سدد|سددت)\\s+NAME(?:\\s+(?:الفلوس|المبلغ|الحساب|الفاتوره|حقي|اللي\\s+عليه))?',
      '(?:هو\\s+|هي\\s+)?NAME\\s+(?:دفع|دفعت|حول|حولت|سدد|سددت)(?:\\s+(?:ولا\\s+لا|ولا\\s+لأ|ولا))?',
      "(?:est-ce\\s+que\\s+)?NAME\\s+(?:a\\s+payé|m'a\\s+payé|a\\s+réglé|m'a\\s+réglé)",
      'NAME\\s+a-t-(?:il|elle)\\s+payé',
      'NAME\\s+(?:ödedi|ödemeyi\\s+yaptı|ödeme\\s+yaptı)\\s+m[ıi]',
      'NAME\\s+(?:parayı|ödemeyi|borcunu)\\s+(?:gönderdi|yatırdı|ödedi|yolladı)\\s+m[ıi]',
    ]),
  ],
];

/**
 * A question about one person the rules answer (G11), with the name as typed; null for anything
 * else. Written plainly, never folded: the name is looked up as it was typed.
 */
export function chatAbout(text: string): { intent: AboutIntent; name: string } | null {
  const t = text.replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
  if (!t || t.length > 120) return null;
  for (const [intent, rules] of ABOUT) {
    for (const rule of rules) {
      const m = rule.exec(t);
      const name = m?.[1]?.trim();
      if (name && !NOT_A_NAME.test(name)) return { intent, name };
    }
  }
  return null;
}

/** "my", "the" and their kin before what someone is called ("my dentist", "le médecin"). */
const BEFORE_A_RELATIONSHIP =
  /^(?:my|the|our|mon|ma|mes|le|la|les|notre|nos|benim|bizim)\s+|^l['’]/iu;

/**
 * The relationship a question names someone by in place of a name (G11): "my dentist", "the
 * client", "mon patron", "مديري" (my manager), "annem" (my mother), as a sphere and, where the
 * words say one, a role, in the reader's language or English; null for a name or a thing.
 * Read only once no one of theirs is called that, so a name always wins.
 */
export function aboutRelationship(words: string): { sphere: Sphere; role?: string } | null {
  const rest = relationshipWords(words);
  return rest ? (relationshipFromWord(rest) ?? null) : null;
}

/** What someone is called without the "my" or "the" before it: "dentist", "patron", "مديري". */
export function relationshipWords(words: string): string {
  return words.trim().replace(BEFORE_A_RELATIONSHIP, '');
}
