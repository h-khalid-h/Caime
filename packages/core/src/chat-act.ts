/**
 * Something someone asks Cai or a friend to do for them in Caime (M16 G14, R110): write to one of
 * their people ("tell Sami I'll be late"), call someone ("call Sami"), set up a meeting with
 * someone ("set up a meeting with Sami tomorrow at 3") or find something in their conversations
 * ("find the contract Ana sent"). Read by the rules in every interface language
 * (`chat-act-golden.test.ts` holds each to its lines), a whole message from its first word once
 * what only makes it polite is off (`askedWords`), so "I called Sami" or "did Sami call?" is
 * never one. Who it's for is as typed, for the server to find among their people; nothing is done
 * by reading it: Cai prepares it, and the person does it with a tap. Pure, no zod; the server's
 * alone (the app never loads it).
 */
import { askedWords, asWritten, E, rx } from './chat-words';

export type ActKind = 'message' | 'call' | 'meeting' | 'find';

/** What someone asked to be done, as they said it. */
export interface ActAsk {
  kind: ActKind;
  /** Whom it's for, as typed ("Sami", "Sami Ali", "my dentist"); null for something to find. */
  who: string | null;
  /** A message's words as they'll go, a meeting's time as said, or what to find. */
  words: string | null;
  /** A meeting's subject, when it was said ("about the budget"). */
  title: string | null;
  /** A call with video. */
  video: boolean;
  /** The language the ask was read in, for the message's own words. */
  lang: 'en' | 'ar' | 'fr' | 'tr';
}

/**
 * A name as typed: a word, up to two more as the rest of the message allows (the server tries the
 * longer names first), with "my" or "the" before a relationship ("my dentist", "mon patron").
 */
const NAME = String.raw`(?<who>(?:(?:my|the|our|mon|ma|mes|notre|nos|benim|bizim) )?[\p{L}][\p{L}'.-]*(?: [\p{L}][\p{L}'.-]*){0,2}?)`;

/** A time said for a meeting, from its first word ("tomorrow at 3", "بكرة الساعة 3"). */
const EN_WHEN = String.raw`(?:on |at |for |this |next |tomorrow|today|tonight|in )`;
const AR_WHEN = String.raw`(?:بكر[ةه]|بكرا|غدا|غدًا|اليوم|النهارده|الليل[ةه]|يوم |الساعه|الساعة|على |في |الاسبوع|الأسبوع|بعد )`;
const FR_WHEN = String.raw`(?:demain|aujourd'hui|ce |cet |cette |lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|à |a |le |la semaine|dans )`;

/** What joins Arabic's "tell Sami" to the words: "إن", "إني", "انو" (never "إن شاء الله"). */
const AR_THAT = String.raw`(?:\s+(?:[اأإ]ن(?! شاء)|[اأإ]ني|[اأإ]نه|انو|انه|ب[اأإ]ن|ب[اأإ]ني))?`;

type Rule = { re: RegExp; kind: ActKind; lang: ActAsk['lang']; video?: boolean };

const RULES: Rule[] = [
  // ---- English
  { re: rx`^(?:video ?call|facetime) ${NAME}$`, kind: 'call', lang: 'en', video: true },
  { re: rx`^(?:call|ring|phone) ${NAME}(?: (?:now|back))?$`, kind: 'call', lang: 'en' },
  { re: rx`^give ${NAME} a (?:call|ring)$`, kind: 'call', lang: 'en' },
  {
    re: rx`^(?:tell|text|message|msg|write to|send a message to|send a text to) ${NAME}(?:(?: that|:|,| saying)? (?<words>.+))?$`,
    kind: 'message',
    lang: 'en',
  },
  { re: rx`^let ${NAME} know(?: that|:|,)? (?<words>.+)$`, kind: 'message', lang: 'en' },
  { re: rx`^ask ${NAME} (?<words>to .+)$`, kind: 'message', lang: 'en' },
  {
    re: rx`^(?:set up|setup|schedule|book|arrange|plan|organi[sz]e|put in|make|propose) (?:a |an )?(?:meeting|call|video call|catch-?up|meet-?up|chat|sync|coffee) with ${NAME}(?: (?:about|regarding|to discuss|re) (?<title>.+?))?(?: (?<words>${EN_WHEN}.*))?$`,
    kind: 'meeting',
    lang: 'en',
  },
  { re: rx`^meet (?:with )?${NAME} (?<words>${EN_WHEN}.*)$`, kind: 'meeting', lang: 'en' },
  {
    re: rx`^(?:find|search for|search|look for|look up|dig up|pull up|where's|where is|where are) (?!(?:me|us|out|someone|somewhere)${E})(?<words>.+)$`,
    kind: 'find',
    lang: 'en',
  },

  // ---- Arabic
  {
    re: rx`^(?:اعمل |عمل )?(?:مكالمه|مكالمة) (?:فيديو|فديو) (?:مع |ل|لـ ?)${NAME}$`,
    kind: 'call',
    lang: 'ar',
    video: true,
  },
  { re: rx`^(?:ت?[اأإ]?تصل|ت?كلم|ت?رن|رن) (?:ب|على |ع |ل)?${NAME}$`, kind: 'call', lang: 'ar' },
  {
    // Said to someone through "ل" ("قول لسامي", "ابعت لريم"): the name after it.
    re: rx`^(?:ت?قول|قل|قولي|ت?بعت|ابعت|[اأإ]بعث|[اأإ]رسل|ت?رسل|ت?كتب|[اأإ]كتب)(?: ?لي)? (?:ل|لـ ?|حق |الى |إلى )${NAME}${AR_THAT}(?:\s*[:،,]?\s+(?<words>.+))?$`,
    kind: 'message',
    lang: 'ar',
  },
  {
    // Told them directly ("بلغ ليلى", "خبر سامي").
    re: rx`^(?:ت?بلغ|بلغ|ت?خبر|خبر|بلغي|خبري)(?: ?لي)? ${NAME}${AR_THAT}\s*[:،,]?\s+(?<words>.+)$`,
    kind: 'message',
    lang: 'ar',
  },
  {
    re: rx`^(?:ت?حدد|حدد|ت?رتب|رتب|ت?عمل|[اأإ]عمل|ت?حجز|[اأإ]حجز|ت?نظم|نظم|ظبط|ت?ظبط)(?: ?لي)? (?:اجتماع|[اإأ]جتماع|ميتنج|ميتينج|موعد|مقابل[ةه]|لقاء|مكالم[ةه]) مع ${NAME}(?: (?:عن|بخصوص|حول) (?<title>.+?))?(?: (?<words>${AR_WHEN}.*))?$`,
    kind: 'meeting',
    lang: 'ar',
  },
  {
    re: rx`^(?:ت?دور|دور|[اأإ]بحث|ت?بحث|ابحثي|دوري|فتش|ت?فتش)(?:لي)? (?:على |عن |ع )?(?<words>.+)$`,
    kind: 'find',
    lang: 'ar',
  },
  { re: rx`^(?:فين|وين|[اأإ]ين) (?<words>.+)$`, kind: 'find', lang: 'ar' },

  // ---- French
  {
    re: rx`^(?:lance |fais )?(?:un )?appel vidéo (?:avec |à )${NAME}$`,
    kind: 'call',
    lang: 'fr',
    video: true,
  },
  {
    re: rx`^(?:appelle|appelez|téléphone à|telephone a|téléphone|lance un appel avec|appeler) ${NAME}$`,
    kind: 'call',
    lang: 'fr',
  },
  {
    re: rx`^(?:dis|dites|écris|ecris|écrivez|envoie un message|envoyez un message|préviens|previens|demande|demandez) (?:à |a |au )?${NAME}(?:(?: que| qu'|:|,)? ?(?<words>.+))?$`,
    kind: 'message',
    lang: 'fr',
  },
  {
    re: rx`^(?:planifie|organise|fixe|programme|cale|prévois|prevois) (?:une |un )?(?:réunion|reunion|rendez-vous|rdv|appel|point|visio) avec ${NAME}(?: (?:sur|pour parler de|au sujet de) (?<title>.+?))?(?: (?<words>${FR_WHEN}.*))?$`,
    kind: 'meeting',
    lang: 'fr',
  },
  {
    re: rx`^(?:trouve|retrouve|cherche|recherche|où est|ou est|où sont) (?!(?:moi)${E})(?<words>.+)$`,
    kind: 'find',
    lang: 'fr',
  },

  // ---- Turkish (the verb last)
  {
    re: rx`^${NAME}'(?:yi|yı|yu|yü|i|ı|u|ü) görüntülü ara(?:r mısın|yabilir misin|yın)?$`,
    kind: 'call',
    lang: 'tr',
    video: true,
  },
  {
    re: rx`^${NAME}'(?:yi|yı|yu|yü|i|ı|u|ü) ara(?:r mısın|yabilir misin|yın)?$`,
    kind: 'call',
    lang: 'tr',
  },
  {
    re: rx`^${NAME}'(?:ye|ya|e|a) (?:yaz|mesaj at|mesaj gönder|söyle|ilet)(?:ır mısın|abilir misin|ın)?(?:\s*[:,]?\s*(?<words>.+))?$`,
    kind: 'message',
    lang: 'tr',
  },
  {
    re: rx`^${NAME} ile (?<words>.*?)\s*(?:toplantı|görüşme|buluşma|randevu)(?:yı|yu)? (?:ayarla|planla|kur|oluştur|ayarlar mısın|planlar mısın)$`,
    kind: 'meeting',
    lang: 'tr',
  },
  { re: rx`^(?<words>.+?) bul(?:ur musun|abilir misin|un)?$`, kind: 'find', lang: 'tr' },
];

/** Words that are never anyone's name: pronouns, "me", a time, "everyone". */
const NOT_A_NAME = rx`^(?:me|myself|you|him|her|them|us|it|this|that|everyone|everybody|anyone|someone|back|later|now|today|tomorrow|tonight|again|ني|نفسي|الكل|حد|احد|أحد|moi|toi|lui|elle|eux|quelqu'un|beni|seni|onu|herkes|birini)$`;

/** What joins a message's words to whom they're for, when it's left at their start. */
const JOINER = {
  en: rx`^(?:that|saying)\s+`,
  ar: rx`^(?:[اأإ]ن(?! شاء)|[اأإ]ني|[اأإ]نه|انو|انه|ب[اأإ]ن|ب[اأإ]ني)\s+`,
  fr: rx`^(?:que\s+|qu['’])`,
  tr: null,
} as const;

/**
 * A message's words as they'll go, from the ask's: the joiner off ("that", "إني", "que"), and an
 * ask to do something made one ("tell Sami to call me" is "Could you call me?", "dis à Sami de
 * m'appeler" is "Tu peux m'appeler ?"). Arabic and Turkish keep the person's words as they are:
 * turning "يكلمني" into the second person would mean knowing who reads it.
 */
export function messageWords(words: string, lang: ActAsk['lang']): string {
  const joiner = JOINER[lang];
  const t = (joiner ? words.replace(joiner, '') : words).replace(/^[\s:،,;.-]+/u, '').trim();
  if (lang === 'en') {
    const to = /^to\s+(.+)$/iu.exec(t);
    if (to) return `Could you ${to[1]}?`;
  }
  if (lang === 'fr') {
    const de = /^(?:de\s+|d['’])(.+)$/iu.exec(t);
    if (de) return `Tu peux ${de[1]} ?`;
  }
  return t;
}

/** What someone asked Cai or a friend to do for them, or null when the message asks nothing like it. */
export function chatAct(text: string): ActAsk | null {
  const t = askedWords(text, 1000);
  if (!t) return null;
  for (const rule of RULES) {
    const m = rule.re.exec(t);
    if (!m) continue;
    const who = m.groups?.who?.trim() ?? null;
    if (who?.split(' ').some((w) => NOT_A_NAME.test(w))) continue;
    const said = m.groups?.words?.replace(/^[\s:،,;.-]+/u, '').trim() || null;
    // A message goes in the person's own writing: their quotes and marks as they typed them.
    const written = rule.kind === 'message' && said ? asWritten(text, said) : said;
    if (rule.kind === 'find' && !said) continue;
    const title = m.groups?.title?.trim() || null;
    return {
      kind: rule.kind,
      who: rule.kind === 'find' ? null : who,
      words: rule.kind === 'message' && written ? messageWords(written, rule.lang) : said,
      title,
      video: Boolean(rule.video),
      lang: rule.lang,
    };
  }
  return null;
}
