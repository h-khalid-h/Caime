/**
 * Something someone asks Cai or a friend to keep for them (M16 G13): "remind me to call Sam
 * tomorrow", "add a task: book the venue", "save it as a task". An explicit ask, read by the
 * rules in every interface language (`chat-save-golden.test.ts` holds each to its lines): the
 * words to keep as written, or null when they point back at what was said before ("save it",
 * "احفظها كمهمة"), which the server looks back for. A question that only sounds like one ("remind
 * me what we agreed") isn't one, nor is a sentence that tells of keeping something ("I added it to
 * my tasks"): an ask is a whole message, from its first word, once what only makes it polite is
 * taken off. Pure, no zod; the server's alone (the app never loads it).
 */

import { askedWords, B, E, rx } from './chat-words';

/** What was asked to be kept: a reminder or an action, and its words (null: "it", said before). */
export interface SaveAsk {
  remind: boolean;
  words: string | null;
  /** The language the ask was read in, for its words' case and joiners. */
  lang: 'en' | 'ar' | 'fr' | 'tr';
}

/** "It", "this", "that", in each language: the words point back at what was said before. */
const POINTER = rx`^(?:${[
  'it',
  'this',
  'that',
  'these',
  'those',
  'this one',
  'that one',
  'ها',
  'ه',
  'هذا',
  'هذه',
  'هذي',
  'هاد',
  'هادا',
  'هادي',
  'ده',
  'دي',
  'دا',
  'هيدا',
  'هيدي',
  'بها',
  'به',
  'بهذا',
  'بده',
  'بدي',
  'بيها',
  'بيه',
  'بهاد',
  'ça',
  'ca',
  'cela',
  'le',
  'la',
  'les',
  'bunu',
  'şunu',
  'onu',
  'bunları',
].join('|')})$`;

/** Words that make "remind me" a question about what's past or kept already. */
const ASKS_BACK = rx`^(?:${[
  'what',
  "what's",
  'whats',
  'who',
  'whom',
  'whose',
  'when',
  'where',
  'which',
  'why',
  'how',
  'whether',
  'if',
  'your',
  'you',
  "you're",
  'yours',
  'ايه',
  'إيه',
  'ايش',
  'إيش',
  'شو',
  'وش',
  'شنو',
  'ماذا',
  'ما',
  'متى',
  'امتى',
  'إمتى',
  'ايمتى',
  'إيمتى',
  'مين',
  'فين',
  'وين',
  'أين',
  'اين',
  'كيف',
  'ازاي',
  'إزاي',
  'هل',
  'ليش',
  'ليه',
  'لماذا',
  'كم',
  'قديش',
  'ce que',
  "ce qu'",
  'qui',
  'quand',
  'où',
  'comment',
  'pourquoi',
  'si',
  'quel',
  'quelle',
  'quels',
  'quelles',
  'combien',
].join('|')})${E}`;

/** The same in Turkish, where a question word sits anywhere before the verb. */
const TR_ASKS_BACK = rx`${B}(?:ne|neyi|neler|neleri|nelerin|kim|kimi|kimin|kime|nerede|nereye|hangi|nasıl|neden|niye|niçin|kaç)${E}`;

const EN_PTR = '(?: (?:it|this|that|these|those|this one|that one))';
const EN_THING =
  '(?:a |an |my |the )?(?:new )?(?:task|action|action item|to-?do|todo|reminder|follow-?up)s?(?: list)?';
const EN_LIST =
  '(?:my |the )?(?:tasks|actions|action items|to-?dos|todos|to-?do list|todo list|list|reminders|action list)';

const AR_PTR = '(?:\\s+(?:ها|ه|هذا|هذه|هذي|ده|دي|دا|هاد|هادي|هيدا|هيدي))';
const AR_THING =
  '(?:ال)?(?:مهم[ةه]|مهام[يى]?|[اأإ]جراء(?:ات[يى]?)?|تذكير|تذكيرات[يى]?|منبه|قائمت[يى]|قائم[ةه]|ليست[يى]?|[اأإ]جندت[يى])';
const AR_INTO = '(?:ك|في|فى|ف|ل|لل|[اأإ]لى|على|ع|ضمن)?';
const AR_KEEP =
  '(?:ت?[اأإ]?حفظ|ت?سجل|ت?ضيف|[اأإ]ضيف|[اأإ]ضف|ت?زود|ت?حط|ت?خل[يى]|ت?[اأإ]?عمل|[اأإ]جعل|ت?حول|ت?خزن|ت?دون|ت?كتب|[اأإ]كتب)';
const AR_OBJ = '(?:ها|ه|هم|يها|يه|يهم|ي|لي|ليا)?';

const FR_KEEP =
  "enregistre|enregistrer|garde|garder|ajoute|ajouter|mets|mettre|note|noter|sauvegarde|sauvegarder|crée|cree|créer|creer|fais|faire|transforme|transformer|range|ranger|l'ajouter|l'enregistrer|le mettre|la mettre|le garder|la garder|le noter";
const FR_THING =
  "(?:une |un |mes |ma |la |les |l')?(?:nouvelle |nouveau )?(?:tâche|tache|action|rappel|to-?do|liste|chose à faire)s?(?: à faire)?";

type Rule = {
  re: RegExp;
  remind: boolean | 'thing';
  words: 'rest' | 'before' | 'none';
  lang: SaveAsk['lang'];
};

/** Each a whole ask from its start (its lead and close taken off), tried in order. */
const RULES: Rule[] = [
  // ---- English
  {
    re: rx`^remind me(?: again)?(?:${E}[\s,:]*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'en',
  },
  {
    re: rx`^(?:don'?t|do not) let me forget(?:${E}[\s,:]*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'en',
  },
  {
    re: rx`^(?:save|keep|add|put|make|turn|log|record|jot|note|set)${EN_PTR}?(?: down| up)? (?:as |to |in |on |into |onto |for )?${EN_THING}(?: for me)?[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'en',
  },
  {
    re: rx`^(?:save|keep|add|put|log|record|jot|move|note)${EN_PTR}?(?: down)? (?:to|in|on|into|onto|under) ${EN_LIST}[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'en',
  },
  {
    re: rx`^(?:save|keep|note|jot|write)${EN_PTR}(?: down)?(?: for (?:me|later))?[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'en',
  },
  {
    re: rx`^(?:save|add|put|make|create|log|keep|set|new|start)(?: me)? ${EN_THING}(?: for me)?(?:\s*[:\-–—]\s*|\s+(?:to |that |about |saying |called )?)(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'en',
  },
  {
    re: rx`^(?:add|put|save|log|jot down|write down|note down) (?<before>.+?) (?:to|in|on|into|onto) ${EN_LIST}(?: for me)?(?<after>[\s,].*)?$`,
    remind: 'thing',
    words: 'before',
    lang: 'en',
  },
  {
    re: rx`^(?:note|jot|write)(?: (?:this|that|it))? down\s*[:\-–—]\s*(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'en',
  },
  {
    re: rx`^(?:new )?(?:task|action|to-?do|todo|reminder|action item)\s*[:\-–—]\s*(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'en',
  },

  // ---- Arabic (no marks; any hamza)
  {
    re: rx`^(?:ت?[ذد]كرني|ت?[ذد]كريني|ت?[ذد]كرنى|ت?فكرني|ت?فكريني|ت?فكرنى|ت?نبهني|ت?نبهيني)(?:${E}\s*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'ar',
  },
  {
    re: rx`^(?:لا تخليني|متخلينيش|ما تخليني|لا تخلني|ماتخلينيش|ماتخليني)\s*[اأإ]?نس[ىي](?:ش)?(?:${E}\s*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'ar',
  },
  {
    re: rx`^${AR_KEEP}${AR_OBJ}${AR_PTR}?\s*${AR_INTO}\s*${AR_THING}(?:\s+(?:عندي|عند[يى]|لي|ليا|جديد[ةه]))?[.!؟?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'ar',
  },
  {
    re: rx`^(?:ت?[اأإ]?حفظ|ت?سجل|ت?خزن|ت?دون)(?:ها|ه|هم|يها|يه)${AR_PTR}?(?:\s+(?:عندك|عندي|لي|ليا))?[.!؟?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'ar',
  },
  {
    re: rx`^(?:ت?[اأإ]?ضيف|[اأإ]ضف|ت?سجل|ت?[اأإ]?عمل|[اأإ]نش[اأئ]|ت?حط|ت?خل[يى]|ت?زود)(?:\s+لي|\s+ليا)?\s+(?:مهم[ةه]|[اأإ]جراء|تذكير|منبه)(?:\s+جديد[ةه]?)?(?:\s*[:\-–—،,]\s*|\s+)(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'ar',
  },
  {
    re: rx`^(?:ت?[اأإ]?ضيف|[اأإ]ضف|ت?حط|ت?سجل|ت?زود|ت?نزل)\s+(?<before>.+?)\s+(?:ل|لل|في|فى|ع|على|[اأإ]لى)\s*(?:ال)?(?:مهام[يى]?|[اأإ]جراءات[يى]?|تذكيرات[يى]?|قائمت[يى]|قائم[ةه]|ليستت[يى]|[اأإ]جندت[يى])[.!؟?]*$`,
    remind: 'thing',
    words: 'before',
    lang: 'ar',
  },
  {
    re: rx`^(?:مهم[ةه]|[اأإ]جراء|تذكير)(?:\s+جديد[ةه]?)?\s*[:\-–—]\s*(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'ar',
  },

  // ---- French
  {
    re: rx`^(?:rappelle|rappelez|rappelles)[- ]moi(?:${E}[\s,:]*(?<rest>.*))?$|^me (?:le |la |l')?rappeler(?:${E}[\s,:]*(?<rest2>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'fr',
  },
  {
    re: rx`^(?:fais|faites)[- ]moi penser(?:${E}[\s,:]*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'fr',
  },
  {
    re: rx`^n'oublie pas de me (?:le |la |l')?rappeler(?:${E}[\s,:]*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'fr',
  },
  {
    re: rx`^(?:${FR_KEEP})(?:[- ](?:le|la|les|ça|ca|cela|moi|en))?(?: ça| ca| cela)?(?: en| comme| dans| à| a| aux| parmi)? ?${FR_THING}[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'fr',
  },
  {
    re: rx`^(?:enregistre|garde|note|sauvegarde)[- ](?:le|la|les|ça|ca|cela)(?: pour plus tard)?[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'fr',
  },
  {
    re: rx`^(?:ajoute|ajoutez|crée|cree|créez|mets|note|enregistre|nouvelle|nouveau)(?:[- ]moi)? (?:une |un )?(?:nouvelle |nouveau )?(?:tâche|tache|action|rappel|to-?do)(?:\s*[:\-–—]\s*|\s+(?:pour |de |d'|que |qu')?)(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'fr',
  },
  {
    re: rx`^(?:ajoute|ajoutez|mets|mettez|note|enregistre) (?<before>.+?) (?:à|a|aux|dans) (?:mes |ma |la |les )?(?:tâches|taches|actions|rappels|liste|to-?dos|choses à faire)[.!?]*$`,
    remind: 'thing',
    words: 'before',
    lang: 'fr',
  },
  {
    re: rx`^(?:nouvelle )?(?:tâche|tache|action|rappel)\s*[:\-–—]\s*(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'fr',
  },

  // ---- Turkish (the verb last, or first as it's spoken)
  {
    re: rx`^(?:bana )?hatırlat(?:ır mısın|abilir misin|ır mısınız|ın)?(?:${E}[\s,:]*(?<rest>.*))?$`,
    remind: true,
    words: 'rest',
    lang: 'tr',
  },
  {
    re: rx`^(?<before>.+?)\s+hatırlat(?:ır mısın|abilir misin|ır mısınız|ın)?[.!?]*$`,
    remind: true,
    words: 'before',
    lang: 'tr',
  },
  {
    re: rx`^(?:(?:bunu|şunu|onu|bunları)\s+)?(?:bir\s+)?(?:görev|eylem|yapılacak(?: iş)?|hatırlatıcı|hatırlatma|iş)(?:\s+olarak)?\s+(?:kaydet|ekle|yap|oluştur|gir)(?:ır mısın|abilir misin)?[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'tr',
  },
  {
    re: rx`^(?:(?:bunu|şunu|onu|bunları)\s+)?(?:görevlerime|eylemlerime|eylemlere|görevlere|yapılacaklara|yapılacaklarıma|yapılacaklar listeme|listeme|hatırlatıcılarıma|işlerime)\s+(?:ekle|kaydet|yaz|koy)(?:ır mısın|abilir misin)?[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'tr',
  },
  {
    re: rx`^(?:bunu|şunu|onu|bunları)\s+(?:kaydet|not al|bir kenara yaz)(?:ır mısın|abilir misin)?[.!?]*$`,
    remind: 'thing',
    words: 'none',
    lang: 'tr',
  },
  {
    re: rx`^(?<before>.+?)\s+(?:görevlerime|eylemlerime|eylemlere|görevlere|yapılacaklara|yapılacaklarıma|yapılacaklar listeme|listeme|işlerime)\s+(?:ekle|kaydet|yaz|koy)(?:ır mısın|abilir misin)?[.!?]*$`,
    remind: 'thing',
    words: 'before',
    lang: 'tr',
  },
  {
    re: rx`^(?:yeni\s+)?(?:görev|eylem|hatırlatıcı|yapılacak)(?:\s+ekle)?\s*[:\-–—]\s*(?<rest>.+)$`,
    remind: 'thing',
    words: 'rest',
    lang: 'tr',
  },
];

/** Kept as a reminder by what it's kept as ("a reminder", "تذكير", "rappel"). */
const REMINDER_WORD = rx`${B}(?:reminder|تذكير|منبه|rappel|hatırlatıcı|hatırlatma)`;

/** What someone asked Cai or a friend to keep, or null when the message asks nothing like it. */
export function chatSave(text: string): SaveAsk | null {
  const t = askedWords(text, 600);
  if (!t) return null;
  for (const rule of RULES) {
    const m = rule.re.exec(t);
    if (!m) continue;
    const raw =
      rule.words === 'none'
        ? ''
        : ((rule.words === 'rest' ? (m.groups?.rest ?? m.groups?.rest2) : m.groups?.before) ?? '');
    const rest = raw.replace(/^[\s,،:;.\-–—]+|[\s,،:;.!?؟]+$/gu, '').trim();
    if (rest && ASKS_BACK.test(rest)) return null;
    if (rest && rule.remind === true && /hatırlat/iu.test(t) && TR_ASKS_BACK.test(rest))
      return null;
    const remind = rule.remind === 'thing' ? REMINDER_WORD.test(m[0]) : rule.remind;
    return { remind, words: rest || null, lang: rule.lang };
  }
  return null;
}

/** The joiners a kept thing's words open with once the ask is gone: "to", "إن", "de", "bana". */
const OPENERS = rx`^(?:(?:to|about|of|that|re|for|me to|me|ب(?=ال)|ب(?=\s)|ان|أن|إن|اني|أني|إني|انني|أنني|باني|بأني|بإني|بان|بأن|عشان|علشان|ل(?=ال)|de|d'|que|qu'|à|a|pour|bana)(?:${E}|(?<=')|(?<=ب)|(?<=ل))[\s,:]*)+`;
/** And close with, once a time is cut from their end: "at", "on", "by", "and". */
const CLOSERS = rx`(?:[\s,،]+(?:at|on|by|to|for|and|في|على|الساعة|le|à|à partir de|saat|de))+$`;

/**
 * A kept thing's title from its words: the time it's for cut out (`dateText`, as the date reader
 * found it in them), the joiners around it gone, a Turkish verbal noun made a verb ("aramayı" →
 * "ara"), the first letter as a sentence's. Empty when nothing was left but the time ("remind
 * me tomorrow"), or the words only point back ("it", "bunu"): the caller looks back for it.
 */
export function keptTitle(words: string, dateText: string | null, lang: SaveAsk['lang']): string {
  let t = words;
  if (dateText) {
    const at = t.indexOf(dateText);
    if (at >= 0) t = `${t.slice(0, at)} ${t.slice(at + dateText.length)}`;
  }
  t = t.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++)
    t = t
      .replace(OPENERS, '')
      .replace(CLOSERS, '')
      .replace(/^[\s,،:;.\-–—]+|[\s,،:;.!?؟\-–—]+$/gu, '')
      .trim();
  if (lang === 'tr')
    t = t
      .replace(/(?<![\p{L}\p{N}])bana(?![\p{L}\p{N}])/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/(\p{L}+?)(?:mayı|meyi|mak|mek)$/u, '$1');
  if (!t || POINTER.test(t)) return '';
  return t.charAt(0).toLocaleUpperCase(lang) + t.slice(1);
}
