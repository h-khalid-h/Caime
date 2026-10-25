/**
 * Something someone asks Cai or a friend to do for them in Caime (M16 G14, R110): write to one of
 * their people ("tell Sami I'll be late"), call someone ("call Sami"), set up a meeting with
 * someone ("set up a meeting with Sami tomorrow at 3") or find something in their conversations
 * ("find the contract Ana sent") or move one of their meetings ("move my 3pm to tomorrow", M17
 * I7, as another time suggested). Read by the rules in every interface language
 * (`chat-act-golden.test.ts` holds each to its lines), a whole message from its first word once
 * what only makes it polite is off (`askedWords`), so "I called Sami" or "did Sami call?" is
 * never one. Who it's for is as typed, for the server to find among their people; nothing is done
 * by reading it: Cai prepares it, and the person does it with a tap. Pure, no zod; the server's
 * alone (the app never loads it).
 */
import { askedWords, asWritten, B, E, rx } from './chat-words';

export type ActKind = 'message' | 'call' | 'meeting' | 'find' | 'move';

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
  /**
   * A meeting or an appointment to move (M17 I7), as they named it, whom it's with taken off:
   * its time ("3pm", "tomorrow 10am", "الساعة 3"), its name ("budget review"), or null when only
   * whom it's with was said; `words` is the time it moves to, as said, or null when none was.
   */
  from: string | null;
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

type Rule = {
  re: RegExp;
  kind: ActKind;
  lang: ActAsk['lang'];
  video?: boolean;
  /** A move that names no time to move to only with a verb that means moving on its own. */
  needsTo?: boolean;
};

/** What a meeting or an appointment is called, in each language (a move names one, or its time). */
const EN_THING = String.raw`(?:meeting|call|appointment|appt|booking|session|catch-?up|sync|one-on-one|1:1|lunch|dinner|breakfast|interview|review|demo|visit|class|lesson|consultation|check-?up|stand-?up)`;
const AR_THING = String.raw`(?:ال)?(?:اجتماع|[اإ]جتماع|ميتنج|ميتينج|موعد|معاد|ميعاد|مقابل[ةه]|لقاء|مكالم[ةه]|حجز|زيار[ةه]|كشف|جلس[ةه]|درس)(?:ي|نا|ك|ه)?`;
const FR_THING = String.raw`(?:rendez-vous|rdv|réunion|reunion|appel|point|visio|rencontre|entretien|déjeuner|dejeuner|dîner|diner|consultation|cours|séance|seance|call)`;
const TR_THING = String.raw`(?:toplantı|görüşme|buluşma|randevu|arama|ders|seans|muayene)\p{L}*`;

/** Where the time a meeting moves to starts, as each language says it. */
const EN_TO = String.raw`(?:tomorrow|today|tonight|next |this |on |at |in |noon|midday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun|morning|afternoon|evening|later|the (?:morning|afternoon|evening|\d)|\d)`;
const AR_TO = String.raw`(?:بكر|بكرا|باكر|غد|اليوم|النهارده|يوم|بعد|ال?ساع|ال?[اأ]سبوع|ال?[اأ]حد|ال?[اإ]ثنين|ال?ثلاثاء|ال?تلات|ال?[اأ]ربع|ال?خميس|ال?جمع|ال?سبت|[0-9٠-٩])`;
const FR_TO = String.raw`(?:demain|aujourd'hui|après-demain|apres-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine|semaine|midi|ce |cet |cette |la |le |dans |\d)`;
const TR_TO = String.raw`(?:yarın|bugün|pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar|haftaya|gelecek|öbür|saat|öğle|akşam|sabah|\d)`;

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
    // "move my 3pm to tomorrow", "reschedule my meeting with Sami to Thursday at 4".
    re: rx`^(?:move|reschedule|push|shift|bump|postpone|delay|put off) (?:back |forward )?(?<what>(?:my|our|the|this|that|tomorrow's|today's|\p{L}+day's|\d)\S*(?: \S+){0,6}?)(?: (?:back|forward|out|up))?(?: (?:to|till|until|for) (?<words>${EN_TO}.*))?$`,
    kind: 'move',
    lang: 'en',
  },
  {
    re: rx`^(?:change|bring|rebook) (?<what>(?:my|our|the|this|that|tomorrow's|today's|\p{L}+day's|\d)\S*(?: \S+){0,6}?)(?: (?:back|forward|up))? (?:to|till|until|for) (?<words>${EN_TO}.*)$`,
    kind: 'move',
    lang: 'en',
    needsTo: true,
  },
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
  {
    // "أجل اجتماعي مع سامي لبكرة", "انقل موعد الساعة 3 ليوم الخميس" (a joined "ل" set apart first).
    re: rx`^(?:[اأ]جل|ت[اأ]جل|ت?نقل|انقل|ت?حرك|حرك|[اأ]خر)(?: ?لي)? (?<what>.+?)(?: (?:ل|لـ|[اإ]لى|على) (?<words>${AR_TO}.*))?$`,
    kind: 'move',
    lang: 'ar',
  },
  {
    re: rx`^(?:ت?غير|غير|ت?بدل|بدل|قدم)(?: ?لي)? (?<what>.+?) (?:ل|لـ|[اإ]لى|على) (?<words>${AR_TO}.*)$`,
    kind: 'move',
    lang: 'ar',
    needsTo: true,
  },

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
  {
    // "déplace mon rdv de 15h à demain", "reporte ma réunion avec Sami à jeudi 16h".
    re: rx`^(?:déplace|deplace|déplacez|déplacer|deplacer|décale|decale|décalez|décaler|decaler|reporte|reportez|reporter|repousse|repoussez|repousser|avance|avancez|avancer|bouge|bouger|reprogramme|reprogrammer) (?<what>(?:mon|ma|mes|le|la|l'|notre|nos) ?.+?)(?: (?:à|a|au|pour|vers|jusqu'à) (?<words>${FR_TO}.*))?$`,
    kind: 'move',
    lang: 'fr',
  },
  {
    re: rx`^(?:change|changez|changer) (?<what>(?:mon|ma|mes|le|la|l'|notre|nos) ?.+?) (?:à|a|au|pour|vers) (?<words>${FR_TO}.*)$`,
    kind: 'move',
    lang: 'fr',
    needsTo: true,
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
  {
    // "15:00 toplantımı yarına al", "Sami ile toplantımı perşembeye ertele": the verb last, and
    // where it moves to after what moves (`turkishMove` splits them).
    re: rx`^(?<body>.+?) (?:ertele|taşı|kaydır)(?:r mısın|r misin|yabilir misin|abilir misin|ebilir misin|ır mısın|yın|in)?$`,
    kind: 'move',
    lang: 'tr',
  },
  {
    re: rx`^(?<body>.+?) (?:al|değiştir|çek)(?:ır mısın|ir misin|abilir misin|ebilir misin|ın|in)?$`,
    kind: 'move',
    lang: 'tr',
    needsTo: true,
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

/** "لبكرة", "للخميس": the joined "ل" before where a meeting moves to, set apart. */
function arabicTo(text: string): string {
  return text
    .replace(
      /(\s)لل(?=(?:ساع|[اأ]سبوع|[اأ]حد|[اإ]ثنين|ثلاثاء|تلات|[اأ]ربع|خميس|جمع|سبت))/gu,
      '$1ل ال',
    )
    .replace(
      /(\s)ل(?=(?:بكر|باكر|غد|يوم|بعد|ال(?:ساع|[اأ]سبوع|[اأ]حد|[اإ]ثنين|ثلاثاء|تلات|[اأ]ربع|خميس|جمع|سبت)))/gu,
      '$1ل ',
    );
}

/** Turkish says where to with a case ending ("yarına", "perşembeye", "saat 5'e"): the day as said. */
const TR_DAYS = [
  'yarın',
  'bugün',
  'pazartesi',
  'salı',
  'çarşamba',
  'perşembe',
  'cumartesi',
  'cuma',
  'pazar',
  'sabah',
  'akşam',
  'öğlen',
  'öğle',
];
function turkishTo(words: string): string {
  const parts = words.split(' ');
  const last = parts.pop() ?? '';
  const bare = last.includes("'")
    ? last.slice(0, last.indexOf("'"))
    : last === 'haftaya'
      ? last
      : (TR_DAYS.find((d) => last.startsWith(d) && last.length - d.length <= 2) ?? last);
  return [...parts, bare].join(' ');
}

/**
 * A Turkish move's words before its verb, split: what moves runs to the last word that names a
 * meeting ("saat 3'teki randevumu"), where it moves to is what follows ("cumaya"); without such a
 * word, a time first ("15:00'ı yarına") is what moves.
 */
function turkishMove(body: string): { what: string; words: string | null } | null {
  const words = body.split(' ');
  const thing = new RegExp(`^${TR_THING}`, 'iu');
  let last = -1;
  words.forEach((w, i) => {
    if (thing.test(w)) last = i;
  });
  const to = new RegExp(`^${TR_TO}`, 'iu');
  if (last < 0) {
    const at = words.findIndex((w, i) => i > 0 && to.test(w));
    return at < 0
      ? { what: body, words: null }
      : { what: words.slice(0, at).join(' '), words: words.slice(at).join(' ') };
  }
  const rest = words.slice(last + 1);
  if (rest.length && (!to.test(rest[0]!) || rest.length > 4)) return null;
  return { what: words.slice(0, last + 1).join(' '), words: rest.length ? rest.join(' ') : null };
}

const WITH_WHOM: Record<ActAsk['lang'], RegExp> = {
  en: rx`^(?<rest>.*?) with (?<who>.+)$`,
  ar: rx`^(?<rest>.*?) ?مع (?<who>.+)$`,
  fr: rx`^(?<rest>.*?) avec (?<who>.+)$`,
  tr: rx`^(?<who>.+?) ile (?<rest>.+)$`,
};
const NAMED_THING: Record<ActAsk['lang'], RegExp> = {
  // English names what it moves last ("the budget review", never "the meeting notes").
  en: rx`${B}${EN_THING}$`,
  ar: rx`${B}${AR_THING}${E}`,
  fr: rx`${B}${FR_THING}${E}`,
  tr: rx`${B}${TR_THING}`,
};
/** The words that only say it's a meeting, off what names it ("my 3pm meeting" is "3pm"). */
const ONLY_A_MEETING: Record<ActAsk['lang'], RegExp> = {
  en: rx`${B}(?:meeting|call|appointment|appt|booking|session)${E}`,
  ar: new RegExp(`${B}${AR_THING}${E}`, 'gu'),
  fr: rx`${B}${FR_THING}${E}`,
  tr: rx`${B}${TR_THING}`,
};
const DETERMINER: Partial<Record<ActAsk['lang'], RegExp>> = {
  en: rx`^(?:my|our|the|this|that) `,
  fr: rx`^(?:mon|ma|mes|le|la|l'|notre|nos) ?`,
};

/**
 * What a move names: whom it's with ("with Sami", "مع سامي", "Sami ile") and what's left of it,
 * its time or its name, the words that only say "meeting" off; null when it names neither a
 * meeting, a time nor anyone ("move the car to the garage").
 */
function moved(
  what: string,
  lang: ActAsk['lang'],
): { who: string | null; from: string | null } | null {
  const w = WITH_WHOM[lang].exec(what);
  const who = w?.groups?.who?.trim() || null;
  const rest = (w ? (w.groups?.rest ?? '') : what).trim();
  if (!who && !/\d/u.test(rest) && !NAMED_THING[lang].test(rest)) return null;
  let from = rest.replace(DETERMINER[lang] ?? /^$/u, '').replace(/'s(?=\s|$)/gu, '');
  from = from.replace(new RegExp(ONLY_A_MEETING[lang].source, 'giu'), ' ');
  if (lang === 'fr') from = from.trim().replace(/^(?:de|du|des|d')\s*/iu, '');
  if (lang === 'tr') from = from.replace(/'?(?:teki|deki|daki|taki)(?=\s|$)/gu, '');
  from = from.replace(/\s+/g, ' ').trim();
  return { who, from: from || null };
}

/** What someone asked Cai or a friend to do for them, or null when the message asks nothing like it. */
export function chatAct(text: string): ActAsk | null {
  const asked = askedWords(text, 1000);
  if (!asked) return null;
  for (const rule of RULES) {
    const t = rule.kind === 'move' && rule.lang === 'ar' ? arabicTo(asked) : asked;
    const m = rule.re.exec(t);
    if (!m) continue;
    if (rule.kind === 'move') {
      const split = m.groups?.body
        ? turkishMove(m.groups.body.trim())
        : { what: m.groups?.what?.trim() ?? '', words: m.groups?.words?.trim() || null };
      if (!split) continue;
      const named = moved(split.what, rule.lang);
      const to = split.words;
      if (!named || (rule.needsTo && !to)) continue;
      if (named.who?.split(' ').some((w) => NOT_A_NAME.test(w))) continue;
      return {
        kind: 'move',
        who: named.who,
        words: to && rule.lang === 'tr' ? turkishTo(to) : to,
        title: null,
        video: false,
        lang: rule.lang,
        from: named.from,
      };
    }
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
      from: null,
    };
  }
  return null;
}
