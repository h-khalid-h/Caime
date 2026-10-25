/**
 * Cai called by name in a call (R114 (3), M17 I13g): a line of the notes that opens with Cai's
 * name as speech-to-text writes it ("Cai," "hey Kai", "يا كاي", "Caï,") and then asks or requests
 * something, or that ends with the name ("…, Cai?"). Rules first, in every interface language and
 * Arabic variety, measured by `cai-call-golden.test.ts`; never a model, since an answer aloud to a
 * line that wasn't for Cai interrupts everyone.
 *
 * A person in the call named Kai (or Cai, Kay) is called by that name, not Cai: `names` are the
 * first names of everyone in the call, and one of them matching turns the reading off, the same
 * words whatever the reason.
 */
import { chatAct } from './chat-act';
import { chatSave } from './chat-save';
import { foldForFind } from './fold';
import { analyzeMessage } from './intelligence';

/** How speech-to-text writes "Cai": the forms the golden set found, folded. */
export const CAI_NAMES = ['cai', 'kai', 'kay', 'kye', 'cay', 'كاي'] as const;

const MARKS = '[\\u064b-\\u0652\\u0670]*';
const LATIN_NAME = '(?:c|k)(?:a[iíïy]|ye)';
const ARABIC_NAME = `ك${MARKS}ا${MARKS}[يى]${MARKS}`;
const NAME = `(?:${LATIN_NAME}|${ARABIC_NAME})`;
/** A word said before the name ("hey Cai", "ok Cai", "يا كاي", "hé Caï", "ee Cai"). */
const VOCATIVE =
  '(?:(?:hey|hi|ok|okay|yo|oh|hé|eh|ohé|dis|salut|ya|yaa|يا|ياا|ee|hadi|peki|tamam)[,،]?\\s+)?';
/** The name, then punctuation or a bare space; what follows is read more strictly after a space. */
const AT_START = new RegExp(`^${VOCATIVE}${NAME}(?:([,،:;!?؟.])\\s*|\\s+)(.+)$`, 'isu');
const AT_END = new RegExp(`^(.+?)[,،]?\\s+(?:(?:يا|ya)\\s+)?${NAME}\\s*[?؟!.]*$`, 'isu');

const WORD_END = "(?=$|[\\s'’?؟,،-])";
/** Question words that open a question in any language, dialects included, unmistakable. */
const WH_START = new RegExp(
  `^(?:${[
    'what|when|where|who|whom|whose|how|why|which',
    'هل|ماذا|متي|متى|امتي|ايمتى|اين|وين|فين|مين|منو|كيف|كيفاش|ازاي|شلون|ليش|ليه|لماذا|علاش|شو|ايش|وش|ويش|شنو|شنهو|واش|كم|كام|قديش|شحال|بكم|بكام|ايه|شكون|فوقاش|وقتاش|وقتيش',
    "quand|où|ou|qui|quoi|comment|pourquoi|quel|quelle|quels|quelles|est-ce|combien|qu'est-ce|qu’est-ce|c'est|c’est|c'était|c’était|y a-t-il|a-t-on",
    'ne|neden|niye|nasıl|nasil|nerede|nereye|kim|kimin|hangi|kaç|kac',
  ].join('|')})${WORD_END}`,
  'iu',
);
/** Arabic "ما" asks only before what a question names (as the intelligence reads it). */
const AR_MA_ASKS = /^ما\s+(?:هو|هي|هم|هذا|هذه|ذا|ذلك|تلك|اللي|الذي|التي|رأيك|رايك|اسم|ال[؀-ۿ]+)/u;
/** An English auxiliary opens a question only before a determiner or a pronoun, else a statement. */
const EN_AUX_START =
  /^(?:is|are|was|were|do|does|did|can|could|will|would|should|have|has|had)\s+(?:the|a|an|it|this|that|there|anyone|anybody|someone|everyone|everybody|any|all|we|you|he|she|they|i|my|our|your|his|her|their|us|me|him|them)\b/iu;
/** The same, looser, after punctuation (a comma after the name says the words are Cai's). */
const EN_AUX_LOOSE =
  /^(?:is|are|was|were|do|does|did|can|could|will|would|should|have|has|had)\b/iu;
/** A request's first word in any language; Turkish's come last (`REQUEST_END`). */
const REQUEST_START = new RegExp(
  `^(?:${[
    'remind|tell|send|repeat|summarise|summarize|sum up|save|note|draft|write|find|show|read|check|book|schedule|add|set|call|open|list|give|get|put|make|take|look|search|pull',
    'ذكرني|ذكّرني|فكرني|فكّرني|قول|قولي|قوللي|قولّي|لخص|لخّص|لخصلي|عيد|أعد|كرر|كرّر|احفظ|سجل|سجّل|ابعت|ارسل|أرسل|صيفط|اكتب|دور|شوف|احجز|ضيف|أضف|زيد|هات|اعطيني|عطني|اعرض|اقرا|اقرأ|افتح|ابحث',
    'rappelle|dis|répète|repete|résume|resume|enregistre|note|envoie|écris|ecris|trouve|montre|lis|vérifie|verifie|réserve|reserve|ajoute|mets|appelle|ouvre|liste|donne|cherche|fais|prends',
  ].join('|')})${WORD_END}`,
  'iu',
);
/** A Turkish imperative, or a question particle with its person, at the end. */
const REQUEST_END =
  /(?:hatırlat|hatirlat|söyle|soyle|özetle|ozetle|kaydet|gönder|gonder|yaz|bul|göster|goster|oku|ekle|ara|aç|ac|listele|ver|al|tekrarla|kontrol et|et|yap|bak|çıkar|cikar)\s*[.!]?$/iu;
/** A question's tail: a mark, Turkish's particle with its person, a tag, or an Arabic question word said last ("الميتنج امتى"). */
const QUESTION_END =
  /(?:\?|؟|\bm[iıuü](?:s[iı]n(?:iz)?|y[iıuü]m|y[iıuü]z|d[iıuü]r|lar|ler)?|\bصح|\bولا لا|\bولا|\bnon|\bright|\bor not|(?<![\p{L}])(?:امتى|امتي|ايمتى|متى|فين|وين|ليه|ليش|ازاي|كام|كم|مين|منو|ايه|شو|وش|كيف|شلون|قديش|شحال|فوقاش|علاش|بكام|بكم))\s*[?؟!.]*$/iu;

export interface CaiCall {
  /** What's asked of Cai, as said, without its name. */
  question: string;
  /** Where the name sat. */
  where: 'start' | 'end';
}

/** Whether the words ask or request something, in any interface language. */
function asks(question: string, afterPunctuation: boolean): boolean {
  if (QUESTION_END.test(question) || WH_START.test(question) || AR_MA_ASKS.test(question))
    return true;
  if (REQUEST_START.test(question) || REQUEST_END.test(question)) return true;
  if ((afterPunctuation ? EN_AUX_LOOSE : EN_AUX_START).test(question)) return true;
  const read = analyzeMessage(question, { now: new Date(0), timeZone: 'UTC' });
  if (read.isQuestion || read.isRequest) return true;
  return Boolean(chatSave(question) || chatAct(question));
}

/** Whether someone in the call carries one of Cai's names: then it's them who is called. */
function someoneNamedCai(names: readonly string[]): boolean {
  return names.some((n) => {
    const first = foldForFind(n.trim()).split(/\s+/)[0] ?? '';
    return (CAI_NAMES as readonly string[]).includes(first);
  });
}

/**
 * What a line says to Cai, or null: the name first (after a "hey" or a "يا") and then a question
 * or a request, or the name last after a comma; nothing where someone in the call is called that.
 */
/**
 * The screen, named in any interface language and Arabic variety. A boundary is a letter's absence
 * (`\p{L}`), never `\b`, which knows ASCII letters alone: "l'écran", "عالشاشة".
 */
const SCREEN_WORD =
  /(?<![\p{L}])(?:screens?|écrans?|ecrans?|ekran\p{L}*|(?:ال|ع|عال|فال|بال|لل)?شاش(?:ة|ات|ت[يهكن]?)?\p{M}*)(?![\p{L}])/iu;
/** What's shown or looked at, said as such. */
const SHOWN =
  /(?<![\p{L}])(?:(?:what(?:'s| is| are)?|whatever)\s+(?:we\s+|you\s+|i\s+|they\s+)?(?:are\s+|'re\s+)?(?:looking at|seeing|shown|showing|displayed|on display|being shared|presenting)|what (?:do|can) you see|can you see (?:the|this|that|my|it|what)|being (?:shared|shown|presented)|on (?:the\s+)?(?:display|projector)|المعروض|المعروضة|اللي معروض|اللي معروضة|الظاهر|الظاهرة|اللي ظاهر|اللي باين|اللي قدامك|اللي قدامنا|شايف|شايفة|شايفين|تشوف|تشوفي|تشوفو|كتشوف|معروض|معروضة|ce qu(?:'|’)on voit|ce que (?:tu|vous|je) vo(?:is|yez|yons)|tu vois|vous voyez|affiché|affichée|partagé|partagée|ne g(?:ö|o)r(?:ü|u)yorsun(?:uz)?|g(?:ö|o)rd(?:ü|u)(?:ğ|g)(?:ü|u)n(?:üz|uz)?|g(?:ö|o)sterilen|payla(?:ş|s)(?:ı|i)lan)(?![\p{L}])/iu;
/** This slide, chart, table, page or picture: named as the one in view, never a table for dinner. */
const THIS_THING =
  /(?<![\p{L}])(?:(?:this|that|the current|the last|the next|the first|the second|the previous)\s+(?:slides?|charts?|graphs?|tables?|pages?|figures?|diagrams?|images?|pictures?|photos?|spreadsheets?|sheets?|dashboards?|decks?|documents?|docs?|maps?|numbers?|totals?|rows?|columns?|cells?|lines?|tabs?|windows?|forms?|invoices?)(?![\p{L}])|(?:read|describe|explain|summari[sz]e|go over|zoom in on|look at)\s+(?:the|this|that|my)\s+(?:slides?|charts?|graphs?|tables?|pages?|figures?|diagrams?|images?|pictures?|photos?|spreadsheets?|sheets?|dashboards?|decks?|documents?|docs?|maps?|numbers?|totals?|rows?|columns?|cells?|lines?|tabs?|windows?|forms?|invoices?)(?![\p{L}])|(?:ه[اذ]ا|هذه|هذي|ده|دي|دا|هاد|هاي|هادي|هيدا|هيدي|هالـ?|ها)\s*(?:ال)?(?:شريحة|سلايد|جدول|رسم|رسمة|صفحة|صورة|جراف|رقم|أرقام|ارقام|مخطط|ملف|شيت|عرض|خريطة)(?![\p{L}])|(?:ال)?(?:شريحة|سلايد|جدول|رسم|رسمة|صفحة|صورة|جراف|رقم|أرقام|ارقام|مخطط|ملف|شيت|عرض|خريطة)\p{M}*\s+(?:دي|ده|دا|هاي|هاد|هذه|هذا|هذي|هادي)(?![\p{L}])|(?:cette|ce|cet)\s+(?:diapo|diapositive|slide|graphique|graph|tableau|page|figure|schéma|schema|image|photo|carte|document|doc|chiffre|feuille|fenêtre|fenetre)(?![\p{L}])|(?:lis|lire|décris|decris|explique|résume|resume)\s+(?:la|le|cette|ce|cet)\s+(?:diapo|diapositive|slide|graphique|graph|tableau|page|figure|schéma|schema|image|photo|carte|document|doc|chiffre|feuille|fenêtre|fenetre)(?![\p{L}])|(?:bu|şu|su)\s+(?:slayt|grafik|tablo|sayfa|şekil|sekil|görsel|gorsel|resim|fotoğraf|fotograf|harita|belge|rakam|sütun|sutun|satır|satir)\p{L}*(?![\p{L}]))/iu;
/**
 * Whether a question to Cai asks about what's on a shared screen (M17 I13h, R114 (1)): the screen
 * itself, what's shown or looked at, or this slide, chart, table, page or picture, in every
 * interface language and Arabic variety. Rules alone (measured by `cai-call-golden.test.ts`), so
 * Cai asks the recording device for a picture only when it's about to be asked about one.
 */
export function asksAboutScreen(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return SCREEN_WORD.test(q) || SHOWN.test(q) || THIS_THING.test(q);
}

export function calledCai(text: string, names: readonly string[] = []): CaiCall | null {
  const line = text.trim();
  if (!line || someoneNamedCai(names)) return null;
  const start = AT_START.exec(line);
  if (start) {
    const question = (start[2] ?? '').trim();
    if (question && asks(question, Boolean(start[1]))) return { question, where: 'start' };
  }
  const end = AT_END.exec(line);
  if (end) {
    const question = (end[1] ?? '').trim().replace(/[,،]$/u, '').trim();
    if (question && asks(question, true)) return { question, where: 'end' };
  }
  return null;
}

/**
 * Whether a line heard while Cai spoke is Cai's own voice back through a microphone (M17 I13g):
 * most of its words are the utterance's. Folded, by words of two letters or more.
 */
export function echoes(heard: string, spoken: string, floor = 0.6): boolean {
  const words = (t: string) =>
    foldForFind(t)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1);
  const said = new Set(words(spoken));
  const got = words(heard);
  if (!got.length || !said.size) return false;
  const shared = got.filter((w) => said.has(w)).length;
  return shared / got.length >= floor;
}
