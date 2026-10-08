/**
 * Message intelligence (PRD §18, §23, §29, §30). Reads one message and returns what it contains:
 * questions, requests, commitments, decisions, dates, amounts, links, references and topics,
 * plus a communication mode. `suggestFromAnalysis` turns that into suggestions the user can
 * accept — never facts (PRODUCT-REVIEW R12).
 *
 * Heuristic by design (R17): deterministic, explainable, testable, and the same on every device.
 * English and Arabic as it's written in messages: Egyptian, Gulf and Levantine phrasing and MSA.
 * French and Turkish are read in their own modules (`intelligence-fr.ts`, `intelligence-tr.ts`),
 * for a sentence `latinLanguage` says is theirs; anything unclear is read as English.
 */

import { type Amount, extractAmounts } from './amounts';
import { tr } from './i18n';
import { FR_PAID, FR_PAY, FR_PLAN, FR_TRACK, readFrench } from './intelligence-fr';
import { firstDateIn, removeRanges } from './intelligence-shared';
import { readTurkish, TR_PAID, TR_PAY, TR_PLAN, TR_TRACK } from './intelligence-tr';
import { latinLanguage } from './latin-language';
import { parseWhen, type WhenMatch, type WhenOptions } from './when';

export { type Amount, extractAmounts } from './amounts';

export const MODES = [
  'talk',
  'ask',
  'plan',
  'decide',
  'share',
  'request',
  'confirm',
  'pay',
  'track',
] as const;
export type Mode = (typeof MODES)[number];

export interface LinkEntity {
  url: string;
  index: number;
  host: string;
}

export interface ActionClause {
  /** The clause as a short imperative: "Send proposal". */
  title: string;
  /** The thing itself, for waiting items: "Proposal". Null when there is no clear object. */
  object: string | null;
  /**
   * The object is handed over ("send the proposal"), so waiting on "Proposal" says it all. For
   * other verbs ("confirm the caterer") the object alone loses the meaning: keep the action.
   */
  handover: boolean;
  when: WhenMatch | null;
  /** The sentence it came from, for the rationale. */
  quote: string;
}

export interface Analysis {
  mode: Mode;
  isQuestion: boolean;
  isRequest: boolean;
  isCommitment: boolean;
  isDecision: boolean;
  isConfirmation: boolean;
  dates: WhenMatch[];
  amounts: Amount[];
  links: LinkEntity[];
  emails: string[];
  phones: string[];
  refs: string[];
  topics: string[];
  commitment: ActionClause | null;
  request: ActionClause | null;
  decision: { title: string; quote: string } | null;
}

// ---------------------------------------------------------------------------------------------
// Vocabulary

const EN_COMMIT =
  /\b(i['’]?ll|i will|i['’]?m going to|im going to|i am going to|i['’]?m gonna|im gonna|let me|i shall|we['’]?ll|we will|i promise to|i plan to|i can)\s+(?!not\b|never\b|be\b|have\b|need\b|try\b|know\b|see\b|think\b|guess\b|check if\b)/i;
const EN_NEGATIVE = /\b(won['’]?t|will not|can['’]?t|cannot|couldn['’]?t|wouldn['’]?t)\b/i;
/** Where one clause ends and the next begins: a negation before this boundary doesn't reach past it. */
const EN_CLAUSE_BREAK = /[,;]|\b(?:but|and|so|though|although)\b/gi;
const EN_REQUEST =
  /\b(can you|could you|would you|will you|can u|could u|would u|pls|please|plz|kindly|i need you to|need you to|would you mind|make sure (?:to|you)|don['’]?t forget to|remember to)\b[\s,]*/i;
/** A request's words that ask for nothing: courtesy, rhetoric, or an ask not to. */
const EN_NOT_A_REQUEST =
  /\b(?:please\s+(?:ignore|disregard|find\s+attached|see\s+attached|note)|can\s+you\s+believe|could\s+you\s+imagine|(?:can|could|would|will)\s+(?:you|u)\s+not\b)/i;
const EN_DECISION =
  /\b(we(?:['’]ve| have)? decided(?: to| that| on)?|decided to|decision:|let['’]?s go with|lets go with|we['’]?ll go with|we['’]?re going with|we are going with|i['’]?m going with|we agreed(?: to| on| that)?|agreed to|agreed on|it['’]?s agreed|approved|it['’]?s settled|settled on|final decision(?: is)?:?)\s*/i;
/** A decision taken back or in doubt in the words right before it ("wasn't approved", "not sure we decided"). */
const EN_NOT_DECIDED =
  /\b(?:not|n['’]?t|never|no|isn['’]?t|wasn['’]?t|weren['’]?t|aren['’]?t|hasn['’]?t|haven['’]?t|not\s+sure|unless|until|if|whether|hope|hopefully|maybe|once)\b[^.!?]{0,25}$/i;
const EN_CONFIRM =
  /^(?:ok(?:ay)?|sure|yes|yep|yeah|confirmed?|done|deal|agreed|works for me|that works|sounds good|perfect|great|👍|✅)[\s.!👍✅]*$/iu;
/**
 * A question without its question mark: an auxiliary and then whoever it asks about ("Is the
 * report ready"), or a question word and a verb ("How much is it"). A bare auxiliary ("Will
 * do", "Have a nice weekend") asks nothing.
 */
const EN_QUESTION_START =
  /^(?:(?:is|are|am|was|were|do|does|did|can|could|will|would|should|shall|may|might|have|has)\s+(?:you|u|we|they|he|she|it|i|this|that|there|the|these|those|anyone|everyone|someone|anybody|everybody|somebody|any)\b|(?:who|what|when|where|why|how|which|whose)(?:['’]s|['’]re|['’]d|['’]ll)?\s+(?:is|are|am|was|were|do|does|did|can|could|will|would|should|shall|may|might|have|has|about|much|many|long|far|often|old|else|time|day|come|if|to|the|your|you|we|they|it)\b)/i;
/** Said with a question's first word and no question in it. */
const EN_NOT_A_QUESTION =
  /^(?:have\s+a\s+(?:nice|good|great|lovely|wonderful|safe)\b|have\s+fun|will\s+do|did\s+it\b|what\s+a\b|how\s+(?:lovely|nice|cool|sweet|wonderful|exciting|fun|kind)\b|who\s+knows|can['’]?t\s+wait|was\s+(?:great|nice|good|lovely))/i;
const EN_PLAN =
  /\b(meet|meeting|call|catch up|schedule|dinner|lunch|breakfast|coffee|trip|visit|appointment|shall we|are you free|when are you free|availability|let['’]?s)\b/i;
const EN_PAY =
  /\b(pay|paid|paying|payment|invoice|bill|transfer(?:red)?|refund|owe|deposit|installment|quote|receipt|price)\b/i;
const EN_TRACK =
  /\b(tracking|shipped|shipment|delivered|delivery|out for delivery|in transit|order status|eta|dispatched|courier|parcel)\b/i;

const IMPERATIVE_VERBS = new Set([
  'send',
  'share',
  'forward',
  'call',
  'email',
  'review',
  'check',
  'sign',
  'pay',
  'approve',
  'confirm',
  'book',
  'schedule',
  'prepare',
  'finish',
  'submit',
  'update',
  'fix',
  'bring',
  'buy',
  'order',
  'reply',
  'deliver',
  'upload',
  'print',
  'remind',
  'text',
  'ping',
  'transfer',
  'reschedule',
  'cancel',
]);

// Arabic, as people write it: Egyptian (هبعتلك, ممكن), Gulf (راح أرسل, تقدر, أبغى) and
// Levantine (رح ابعتلك, فيك, بدي) alongside MSA (سأرسل, أرجو). A trigger is a whole word.
const AR_EDGE = '(?=$|[\\s،,.!؟?])';
const AR_COMMIT = new RegExp(
  `(^|[\\s،,.!؟?])(${[
    // Egyptian: ه/ح + verb, with an attached "you"
    'هبعت(?:لك|هولك|ها|ه)?',
    'حبعت(?:لك)?',
    'هكلم(?:ك)?',
    'هتصل(?:\\s+بيك)?',
    'هرد(?:\\s+عليك)?',
    'هشوف',
    'هخلص',
    'هجهز',
    'هقولك',
    'هعمل',
    'هجيب',
    'هحول(?:لك)?',
    'هدفع',
    'هراجع',
    'هرسل(?:لك)?',
    'هبلغك',
    'هأكد(?:لك)?',
    'هاكد(?:لك)?',
    // Gulf: راح + verb; Levantine: رح/حـ + verb. First person only (أ/ا: I, ن: we): "راح
    // يجيب" is someone else's doing and "راح تحبه" is the reader's.
    'راح\\s+(?!ال)[أاإن][؀-ۿ]+',
    'رح\\s+(?!ال)[أاإن][؀-ۿ]+',
    // Levantine and Gulf present-as-promise, only the verbs that promise something
    'بعطيك',
    'ببعت(?:لك)?',
    'بأرسل(?:\\s+لك)?',
    'بارسل(?:ك|لك)?',
    'برسل(?:ك|لك)?',
    'بحول(?:لك)?',
    'بخبرك',
    'بحكيلك',
    'بأكد(?:لك)?',
    'باكد(?:لك)?',
    'بجهز(?:لك)?',
    'بخلص(?:لك)?',
    'برد\\s+عليك',
    'بتصل\\s+فيك',
    // MSA
    'سأرسل(?:\\s+لك)?',
    'سأبعث(?:\\s+لك)?',
    'سأتصل(?:\\s+بك)?',
    'سأراجع',
    'سأخبرك',
    'سأرد(?:\\s+عليك)?',
    'سأحول(?:\\s+لك)?',
    'سأشارك(?:ك)?',
    'سأقوم\\s+ب',
    'سأحجز',
    'سأدفع',
    'سوف\\s+[؀-ۿ]+',
  ].join('|')})${AR_EDGE}`,
  'u',
);
/** A negation right before a promise ("مش هبعت", "ما راح أقدر", "لن") takes it back. */
const AR_NEGATIVE_BEFORE = /(^|[\s،,])(مش|ما|لن|لا|مو|مب|مهوب|ماراح|مارح)\s*$/u;
const AR_REQUEST_VERBS_LIST = [
  // Egyptian
  'ابعتلي',
  'ابعتلى',
  'ابعتيلي',
  'ابعت',
  'كلمني',
  'كلمنى',
  'رد\\s+عليا',
  // Gulf
  'أرسل\\s+لي',
  'ارسل\\s+لي',
  'أرسلي',
  'ارسلي',
  'رسلي',
  'طرشلي',
  'عطني',
  'عطيني',
  'خبرني',
  'اتصل\\s+فيني',
  // Levantine
  'بعتلي',
  'بعتيلي',
  'احكيلي',
  'خبرني',
  'رد\\s+علي',
  'رد\\s+عليّ',
  // MSA
  'أرسل\\s+إلي',
  'أعلمني',
  'اعلمني',
  'أخبرني',
  'اخبرني',
];
const AR_REQUEST = new RegExp(
  `(^|[\\s،,.!؟?])(${[
    // what introduces a request: "ممكن" (could you) only before a second-person verb (ت…), since
    // alone it's "maybe" ("ممكن أتأخر", I may be late)
    'ممكن(?=\\s+ت[؀-ۿ]+)',
    'لو\\s+سمحت(?:ي|وا)?',
    'من\\s+فضلك',
    'ياريت',
    'يا\\s+ريت',
    'ياليت',
    'يا\\s+ليت',
    'محتاجك',
    'عايزك',
    'عاوزك',
    'بليز',
    'أرجو(?:ك)?',
    'ارجو(?:ك)?',
    'رجاء',
    'رجاءً',
    'تقدر(?:ي|وا)?',
    'بتقدر(?:ي|وا)?',
    // "فيك تبعتلي" (can you send me), never "يبارك فيك" (bless you)
    'فيك(?:ي|ن)?(?=\\s+ت[؀-ۿ]+)',
    'إذا\\s+ممكن',
    'اذا\\s+ممكن',
    'لو\\s+ممكن',
    'لو\\s+تكرمت(?:ي)?',
    'الله\\s+يخليك',
    'أبغاك',
    'ابغاك',
    'أبيك',
    'ابيك',
    'بدي\\s+ياك',
    'بدي\\s+منك',
    // "بدك تبعتلي" (you should send me), never "شو بدك" (what do you want)
    '(?<!(?:شو|ايش|إيش|وش|شنو)\\s)بدك(?=\\s+ت[؀-ۿ]+)',
    ...AR_REQUEST_VERBS_LIST,
  ].join('|')})${AR_EDGE}`,
  'u',
);
const AR_REQUEST_VERBS = new RegExp(`^(${AR_REQUEST_VERBS_LIST.join('|')})$`, 'u');
/** "to me", "for you": particles that follow a request's verb and aren't the thing asked for. */
const AR_PARTICLES =
  /^(?:(?:لي|لى|ليا|لك|لكم|لنا|عليا|علي|عليّ|معي|معاي|معك|إلي|الي|ياه|ياها|لو\s+سمحت)\s+)+/u;
const AR_QUESTION_START =
  /^(هل|ايه|إيه|امتى|إمتى|فين|مين|ليه|ازاي|إزاي|كام|متى|أين|اين|كيف|لماذا|ماذا|ما|وين|شو|ايش|إيش|وش|ويش|شنو|شنهو|شلون|ليش|لويش|منو|منهو|كم|قديش|قديه|وقتيش|وقتاش|بكم|بكام)(?=$|[\s،,؟?])/u;
/** "ما" negates here ("ما راح أقدر", "ما عندي"), where elsewhere it asks ("ما رأيك"). */
const AR_NOT_A_QUESTION =
  /^(?:ما\s+(?:راح|رح|ه[؀-ۿ]+|أقدر|اقدر|بقدر|قدرت|عندي|عندك|عندنا|معي|معاي|في|فيه|عرفت|أعرف|اعرف|بعرف|كان|كانت|بدي|أبغى|ابغى|أبي|حبيت|رديت|وصل|وصلت|لقيت|شفت|سمعت|لحقت|خلصت|قلت|سويت|عملت|شاء\s+الله|وافقنا|وافقت)|ليش\s+لا|شو\s+هال|كيف\s+ما|ايش\s+ما|إيش\s+ما)(?=$|[\s،,؟?])/u;
const AR_DECISION = new RegExp(
  `(^|[\\s،,.!؟?])(${[
    'اتفقنا(?:\\s+على|\\s+إن|\\s+ان|\\s+نـ?)?',
    'اتفقتوا?',
    'قررنا',
    'قررت',
    'تم\\s+الاتفاق(?:\\s+على)?',
    'تم\\s+اعتماد',
    'تمت\\s+الموافقة(?:\\s+على)?',
    'اعتمدنا',
    'نعتمد',
    'معتمد',
    'موافق(?:ين|ة)?',
    'وافقنا',
    'نمشي\\s+(?:على|ب|بـ)',
    'هنمشي\\s+(?:على|ب|بـ)',
    'راح\\s+نمشي\\s+(?:على|ب|بـ)',
    'رح\\s+نمشي\\s+(?:على|ب|بـ)',
    'خلينا\\s+نمشي\\s+(?:على|ب|بـ)',
    'خلاص\\s+نمشي\\s+(?:على|ب|بـ)',
    'نروح\\s+على',
    'القرار\\s+(?:هو|[إا]ن[؀-ۿ]*|أن[؀-ۿ]*)',
  ].join('|')})${AR_EDGE}`,
  'u',
);
/** "خلاص", "طيب": what a decision is often prefaced with and never part of. */
const AR_FILLER_START =
  /^(?:(?:خلاص|طيب|تمام|ماشي|أوكي|اوكي|أوك|اوك|يلا|يلّا|يعني|طب|زين|اي|إي|ايوه|أيوه)[\s،,]+)+/u;
const AR_CONFIRM =
  /^(?:(?:تمام|ماشي|أكيد|اكيد|حاضر|موافق|مؤكد|تم|خلاص|طيب|زين|أوكي|اوكي|أوك|اوك|ايوه|أيوه|ايوا|أيوا|اي|إي|أبشر|ابشر|من\s+عيوني|تم\s+التمام|اتفقنا|صح|يا\s+سيدي|ياسيدي)[\s.!،,]*)+$/u;
const AR_PAY =
  /(دفع|ادفع|هدفع|بدفع|سدد|تسديد|فلوس|مصاري|بيزات|تحويل|حولت|حوّلت|حول(?:ت)?لك|فاتورة|فاتوره|قسط|الحساب|الدفعة|دفعة|المبلغ|مبلغ|رصيد|كاش|نقدي|شيك)/u;

const LEADING_WORDS =
  /^(?:(?:you|u|me|us|them|it|him|her|the|a|an|my|your|our|their|this|that|those|these|over|back|out|up|some|all)\s+)+/i;
const TRAILING_WORDS =
  /(?:\s+(?:please|pls|plz|asap|soon|later|today|for you|for me|to you|to me|again|as well|too|then|ok|okay|thanks|thank you))+$/i;
/** "لو سمحت", "ضروري": what follows the thing asked for and isn't part of it. */
const AR_TRAILING_WORDS =
  /(?:\s+(?:لو\s+سمحت(?:ي|وا)?|من\s+فضلك|بليز|الله\s+يخليك|ضروري|بسرعة|بسرعه|عاجل|يا\s+ريت|ياريت|إذا\s+ممكن|اذا\s+ممكن|لو\s+ممكن|لو\s+تكرمت|شكرا|شكراً|وشكرا|مشكور|يعطيك\s+العافية))+[\s.!؟,،]*$/u;
const CUT_AT =
  /\s+(?:to|for|with|by|before|after|on|at|in|from|so|and|because|when|if|once)\s+.*$/i;

const HANDOVER_VERBS =
  /^(?:send|resend|share|forward|email|e-mail|mail|text|upload|bring|deliver|submit|return|give|get|provide|pass|hand|post|attach|transfer)$/i;

const OBJECT_FOR_PHRASE: Array<[RegExp, string]> = [
  [/^get back to (you|me)\b/i, 'Reply'],
  [/^let (you|me) know\b/i, 'Update'],
  [/^call (you|me)\b/i, 'Call'],
  [/^(check|look into it|look into this|see)\b/i, 'Answer'],
  [/^reply\b/i, 'Reply'],
];

// ---------------------------------------------------------------------------------------------
// Helpers

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * A sentence ends at `.`, `!`, `?` or `؟` followed by a space or the end, or at a line's end: a
 * dot inside "$2.5k", "v2.1", "sam@data-c.com" or a URL is part of the word.
 */
function sentences(text: string): Array<{ text: string; index: number }> {
  const out: Array<{ text: string; index: number }> = [];
  const re = /[^\n]+?(?:[.!?؟]+(?=\s|$)|$)/gm;
  let m: RegExpExecArray | null = re.exec(text);
  while (m) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
    } else {
      const t = m[0].trim();
      if (t) out.push({ text: t, index: m.index + m[0].indexOf(t) });
    }
    m = re.exec(text);
  }
  return out;
}

/**
 * Someone else's words inside a message (“I'll send it Monday”, a `> quoted` line) are not the
 * sender's promise, request or decision: they're blanked, their length kept so every index
 * still points into the original, before the sentences are read.
 */
export function maskQuoted(text: string): string {
  let out = text.replace(/"[^"\n]{2,}"|“[^”\n]{2,}”|«[^»\n]{2,}»|„[^“”\n]{2,}[“”]/g, (q) =>
    ' '.repeat(q.length),
  );
  out = out.replace(/^[ \t]*>[^\n]*/gm, (q) => ' '.repeat(q.length));
  return out;
}

function tidy(clause: string): string {
  return clause
    .replace(/[.!?؟,;:]+$/u, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:by|on|at|before|until|till|in)\s*$/i, '')
    .replace(/\s+(?:قبل|بعد|في|فى|يوم|بحلول|لغاية|لحد|حتى|لين|على|عند|من)\s*$/u, '')
    .replace(TRAILING_WORDS, '')
    .replace(AR_TRAILING_WORDS, '')
    .trim();
}

function clauseFrom(
  sentence: string,
  triggerEnd: number,
  sentenceIndex: number,
  dates: WhenMatch[],
) {
  const rest = sentence.slice(triggerEnd);
  const withoutDates = removeRanges(rest, sentenceIndex + triggerEnd, dates);
  return tidy(withoutDates);
}

const FILLER_START = /^(?:(?:ok|okay|so|alright|great|then|and|we|well|yes|yep)[\s,]+)+/i;

/** A decision reads as what was decided: "Go with vendor B", "Approved the final design". */
function decisionTitle(sentence: string, m: RegExpExecArray, english: boolean): string {
  const trigger = m[0].trim().toLowerCase();
  const rest = tidy(sentence.slice(m.index + m[0].length));
  if (!english) return tidy(sentence.replace(AR_FILLER_START, ''));
  if (/go(ing)? with/.test(trigger)) return rest ? tr('Go with {rest}', { rest }) : tr('Go ahead');
  if (/decided|decision/.test(trigger))
    return capitalise(rest || tidy(sentence.replace(FILLER_START, '')));
  if (/agreed/.test(trigger)) {
    const prep = /agreed (to|on|that)/.exec(trigger)?.[1];
    return rest ? tr('Agreed{text} {rest}', { text: prep ? ` ${prep}` : '', rest }) : 'Agreed';
  }
  if (/approved/.test(trigger)) return rest ? tr('Approved {rest}', { rest }) : 'Approved';
  if (/settled on/.test(trigger)) return rest ? tr('Settled on {rest}', { rest }) : 'Settled';
  return capitalise(tidy(sentence.replace(FILLER_START, '')));
}

function toAction(
  clause: string,
  quote: string,
  when: WhenMatch | null,
  arabic: boolean,
  /** The words that promised or asked ("راح أرسل"), when the clause begins with them. */
  trigger = '',
): ActionClause | null {
  if (!clause) return null;
  if (arabic) {
    const words = clause.split(' ');
    // "راح أرسل لك العقد": the thing is "العقد", never "أرسل لك العقد" or "لي العقد".
    const skip = Math.max(1, trigger.trim().split(/\s+/).filter(Boolean).length);
    const rest = words.slice(skip).join(' ').replace(AR_PARTICLES, '').trim();
    return { title: clause, object: rest || null, handover: true, when, quote };
  }
  for (const [re, object] of OBJECT_FOR_PHRASE) {
    if (re.test(clause))
      return {
        title: capitalise(clause.replace(CUT_AT, '')),
        object,
        handover: true,
        when,
        quote,
      };
  }
  const [verb, ...restWords] = clause.split(' ');
  if (!verb) return null;
  const rest = restWords.join(' ').replace(LEADING_WORDS, '').replace(CUT_AT, '').trim();
  const object = rest ? capitalise(rest.replace(LEADING_WORDS, '')) : null;
  const title = rest
    ? `${capitalise(verb.toLowerCase())} ${rest.replace(LEADING_WORDS, '')}`
    : capitalise(verb.toLowerCase());
  return { title, object, handover: HANDOVER_VERBS.test(verb), when, quote };
}

export function extractLinks(text: string): LinkEntity[] {
  const out: LinkEntity[] = [];
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi)) {
    const url = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
    let host = '';
    try {
      host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    } catch {
      continue;
    }
    out.push({ url, index: m.index ?? 0, host });
  }
  return out;
}

export function analyzeMessage(input: string, options: WhenOptions): Analysis {
  const text = input.trim();
  const dates = parseWhen(text, options);
  const amounts = extractAmounts(text);
  const links = extractLinks(text);
  const emails = [...text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)].map((m) => m[0]);
  const phones = [...text.matchAll(/(?:\+|\b00)\d[\d\s().-]{7,}\d/g)]
    .map((m) => m[0].replace(/[^\d+]/g, ''))
    .filter((p) => p.replace(/\D/g, '').length >= 8 && p.replace(/\D/g, '').length <= 15);
  const refs = [
    ...[...text.matchAll(/(?:^|[\s(])#([A-Z]{0,4}-?\d{3,}[A-Z0-9-]*)\b/gi)].map((m) => `#${m[1]}`),
    ...[
      ...text.matchAll(
        /\b(?:order|invoice|inv|po|ticket|case|ref|reference|tracking)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z]{0,4}-?\d{3,}[A-Z0-9-]*|1Z[0-9A-Z]{16})\b/gi,
      ),
    ].map((m) => m[1]!),
  ].filter((v, i, arr) => arr.indexOf(v) === i);
  const topics = [
    ...[
      ...text.matchAll(
        /\b(Project|Order|Trip|Contract|Case|Ticket|Deal|Campaign|Event|Launch|Release)\s+(#?[A-Z0-9][\w-]*(?:\s[A-Z][\w-]+)?)/g,
      ),
    ].map((m) => `${m[1]} ${m[2]}`),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  let commitment: ActionClause | null = null;
  let request: ActionClause | null = null;
  let decision: Analysis['decision'] = null;
  let isQuestion = false;
  let isConfirmation = false;

  const languages = new Set<string>();
  for (const s of sentences(maskQuoted(text))) {
    // The sentence as written, for the quote a suggestion carries (quoted words included).
    const said = text.slice(s.index, s.index + s.text.length).trim();
    const endsWithQuestion = /[?؟]\s*$/u.test(s.text);
    const latin = /[A-Za-z]/.test(s.text) && !/[؀-ۿ]/.test(s.text);
    const lang = latin ? latinLanguage(s.text) : 'ar';
    languages.add(lang);
    if (lang === 'fr' || lang === 'tr') {
      const read = lang === 'fr' ? readFrench : readTurkish;
      const r = read({ text: s.text, index: s.index, said, dates });
      if (r.asks) isQuestion = true;
      if (r.confirms) isConfirmation = true;
      decision ??= r.decision;
      commitment ??= r.commitment;
      request ??= r.request;
      continue;
    }
    const english = latin;
    const startsQuestion = english
      ? EN_QUESTION_START.test(s.text) && !EN_NOT_A_QUESTION.test(s.text)
      : AR_QUESTION_START.test(s.text) && !AR_NOT_A_QUESTION.test(s.text);
    const asks =
      endsWithQuestion || (startsQuestion && s.text.length < 160 && !/[.!]$/.test(s.text));
    if (asks) isQuestion = true;
    if (EN_CONFIRM.test(s.text) || AR_CONFIRM.test(s.text)) isConfirmation = true;

    // A question isn't a decision ("Was the budget approved?"), nor is one taken back in the
    // words before it ("wasn't approved", "ما وافقنا").
    if (!decision && !asks) {
      const d = EN_DECISION.exec(s.text) ?? AR_DECISION.exec(s.text);
      if (d) {
        const before = s.text.slice(0, d.index + (english ? 0 : (d[1]?.length ?? 0)));
        const negated = english ? EN_NOT_DECIDED.test(before) : AR_NEGATIVE_BEFORE.test(before);
        if (!negated) decision = { title: decisionTitle(s.text, d, english), quote: said };
      }
    }

    if (!commitment) {
      const c = EN_COMMIT.exec(s.text);
      const a = c ? null : AR_COMMIT.exec(s.text);
      // "I won't be able to send it, but I'll call you tomorrow": the negation stays in its
      // clause, so only what's said between the last clause break and the promise counts.
      const negatedBefore = (at: number) => {
        let from = 0;
        for (const b of s.text.slice(0, at).matchAll(EN_CLAUSE_BREAK)) from = b.index + b[0].length;
        return EN_NEGATIVE.test(s.text.slice(from, at));
      };
      if (c && !negatedBefore(c.index) && !EN_NEGATIVE.test(s.text.slice(c.index, c.index + 40))) {
        const clause = clauseFrom(s.text, c.index + c[0].length, s.index, dates);
        commitment = toAction(clause, said, firstDateIn(dates, s.index, s.text.length), false);
      } else if (a && !AR_NEGATIVE_BEFORE.test(s.text.slice(0, a.index + a[1]!.length))) {
        const start = a.index + a[1]!.length;
        const clause = tidy(removeRanges(s.text.slice(start), s.index + start, dates));
        commitment = toAction(
          clause,
          s.text,
          firstDateIn(dates, s.index, s.text.length),
          true,
          a[2]!,
        );
      }
    }

    if (!request && !EN_NOT_A_REQUEST.test(s.text)) {
      const r = EN_REQUEST.exec(s.text);
      const ar = r ? null : AR_REQUEST.exec(s.text);
      if (r) {
        const clause = clauseFrom(s.text, r.index + r[0].length, s.index, dates).replace(
          /^(?:to|and)\s+/i,
          '',
        );
        request = toAction(clause, s.text, firstDateIn(dates, s.index, s.text.length), false);
      } else if (ar) {
        // "ابعتلي" (send me) is itself the verb; "ممكن" (could you) only introduces it.
        const trigger = ar[2]!;
        const start =
          ar.index + ar[1]!.length + (AR_REQUEST_VERBS.test(trigger) ? 0 : trigger.length);
        const clause = tidy(removeRanges(s.text.slice(start), s.index + start, dates));
        request = toAction(clause, s.text, firstDateIn(dates, s.index, s.text.length), true);
      } else if (english) {
        const first =
          s.text
            .split(/\s+/)[0]
            ?.toLowerCase()
            .replace(/[^a-z]/g, '') ?? '';
        // A verb and only a number ("Update 55") is a label, not something to do; nor is a
        // reference ("Order #48213 shipped") or something already done ("Order delivered").
        const rest = s.text.split(/\s+/).slice(1).join(' ');
        const named =
          /\p{L}/u.test(rest) &&
          !/^#/.test(rest) &&
          !/^(?:shipped|delivered|confirmed|received|sent|done|placed|cancelled|canceled)\b/i.test(
            rest,
          );
        if (IMPERATIVE_VERBS.has(first) && !endsWithQuestion && named) {
          const clause = clauseFrom(s.text, 0, s.index, dates);
          request = toAction(clause, s.text, firstDateIn(dates, s.index, s.text.length), false);
        }
      }
    }
  }

  const isRequest = request !== null;
  const isCommitment = commitment !== null;
  const isDecision = decision !== null;
  // French and Turkish words count only in a message that has a sentence in the language.
  const fr = languages.has('fr');
  const tk = languages.has('tr');
  const pay =
    EN_PAY.test(text) ||
    AR_PAY.test(text) ||
    (fr && FR_PAY.test(text)) ||
    (tk && TR_PAY.test(text));
  const paid =
    /\b(paid|invoice|payment|refund|transfer)\b/i.test(text) ||
    (fr && FR_PAID.test(text)) ||
    (tk && TR_PAID.test(text));
  const track =
    EN_TRACK.test(text) ||
    refs.some((r) => /^1Z/.test(r)) ||
    (fr && FR_TRACK.test(text)) ||
    (tk && TR_TRACK.test(text));
  const plan = EN_PLAN.test(text) || (fr && FR_PLAN.test(text)) || (tk && TR_PLAN.test(text));
  let mode: Mode = 'talk';
  if (isDecision) mode = 'decide';
  else if (isRequest) mode = 'request';
  else if (isQuestion) mode = 'ask';
  else if (pay && (amounts.length > 0 || paid)) mode = 'pay';
  else if (track) mode = 'track';
  else if (plan && dates.length > 0) mode = 'plan';
  else if (isConfirmation) mode = 'confirm';
  else if (links.length > 0) mode = 'share';

  return {
    mode,
    isQuestion,
    isRequest,
    isCommitment,
    isDecision,
    isConfirmation,
    dates,
    amounts,
    links,
    emails,
    phones,
    refs,
    topics,
    commitment,
    request,
    decision,
  };
}

// ---------------------------------------------------------------------------------------------
// Suggestions

export type SuggestionKind =
  | 'task'
  | 'reminder'
  | 'waiting'
  | 'decision'
  | 'topic'
  | 'relationship'
  | 'duplicate'
  | 'context';

export interface SuggestionDraft {
  kind: SuggestionKind;
  title: string;
  dueAt: string | null;
  /** The date words as written ("tomorrow"), for display. */
  dueText: string | null;
  /** Plain-language reason shown with the suggestion (R12). */
  rationale: string;
  confidence: number;
  /**
   * The words don't say what the thing is ("I'll send it Thursday"). The server first looks for
   * an open suggestion this answers and updates that instead of offering a second one.
   */
  vague?: boolean;
}

/** Objects that point back at something said earlier rather than naming it. */
const POINTING = /^(it|this|that|them|these|those|one|the same|the rest)$/i;

function isVague(c: ActionClause): boolean {
  return !c.object || POINTING.test(c.object.trim());
}

function waitingTitle(c: ActionClause): string {
  return c.handover ? (c.object ?? c.title) : c.title;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function quote(s: string): string {
  const t = s.trim();
  return t.length > 90 ? `“${t.slice(0, 87)}…”` : `“${t}”`;
}

/**
 * Turn one analysed message into suggestions. `senderIsMe` decides the direction: my commitment
 * is a reminder, theirs is something I'm waiting for; their request is a task for me, mine is a
 * waiting item.
 */
export function suggestFromAnalysis(
  a: Analysis,
  ctx: { senderIsMe: boolean; senderName: string },
): SuggestionDraft[] {
  const out: SuggestionDraft[] = [];
  const due = (c: ActionClause | null) => ({
    dueAt: c?.when?.at ?? null,
    dueText: c?.when?.text ?? null,
  });

  if (a.commitment) {
    const vague = isVague(a.commitment);
    if (ctx.senderIsMe) {
      out.push({
        kind: 'reminder',
        title: a.commitment.title,
        ...due(a.commitment),
        rationale: tr('You wrote {quote}', { quote: quote(a.commitment.quote) }),
        confidence: a.commitment.when ? 0.9 : 0.75,
        vague,
      });
    } else {
      out.push({
        kind: 'waiting',
        // "Q3 report" when they named it; "Sarah will send it" when they only pointed at it;
        // "Confirm caterer" when the thing alone would lose what they'll do with it.
        title: vague
          ? tr('{senderName} will {lowerFirst}', {
              senderName: ctx.senderName,
              lowerFirst: lowerFirst(a.commitment.title),
            })
          : waitingTitle(a.commitment),
        ...due(a.commitment),
        rationale: tr('{senderName} wrote {quote}', {
          senderName: ctx.senderName,
          quote: quote(a.commitment.quote),
        }),
        confidence: a.commitment.when ? 0.9 : 0.75,
        vague,
      });
    }
  }

  if (a.request) {
    if (ctx.senderIsMe) {
      out.push({
        kind: 'waiting',
        title: isVague(a.request) ? a.request.title : waitingTitle(a.request),
        ...due(a.request),
        rationale: tr('You asked {quote}', { quote: quote(a.request.quote) }),
        confidence: 0.7,
      });
    } else {
      out.push({
        kind: 'task',
        title: a.request.title,
        ...due(a.request),
        rationale: tr('{senderName} asked {quote}', {
          senderName: ctx.senderName,
          quote: quote(a.request.quote),
        }),
        confidence: a.request.when ? 0.9 : 0.8,
      });
    }
  }

  if (a.decision) {
    out.push({
      kind: 'decision',
      title: a.decision.title,
      dueAt: null,
      dueText: null,
      rationale: tr('Sounds like a decision: {quote}', { quote: quote(a.decision.quote) }),
      confidence: 0.8,
    });
  }

  // Never offer the same thing twice (a request that is also a commitment, for example).
  return out.filter(
    (s, i) =>
      out.findIndex((o) => o.kind === s.kind && o.title.toLowerCase() === s.title.toLowerCase()) ===
      i,
  );
}

/**
 * Topic detection (PRD §58): a named topic that keeps coming up in a general conversation is
 * offered as its own topic conversation. Returns the topic when it appears in at least
 * `threshold` of the recent messages.
 */
export function detectEmergingTopic(
  recent: Array<Pick<Analysis, 'topics'>>,
  threshold = 3,
): string | null {
  const counts = new Map<string, number>();
  for (const a of recent) {
    for (const t of new Set(a.topics.map((x) => x.toLowerCase())))
      counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [topic, count] of counts) {
    if (count >= threshold && count > bestCount) {
      best = topic;
      bestCount = count;
    }
  }
  if (!best) return null;
  for (const a of recent) {
    const original = a.topics.find((t) => t.toLowerCase() === best);
    if (original) return original;
  }
  return best;
}
