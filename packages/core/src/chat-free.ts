/**
 * Whether a message to Cai asks when its writer is free (M17 I7): "when am I free Thursday", "am I
 * free tomorrow at 3?", "what does my Friday look like", in every interface language, by the
 * rules. Only one's own time: "when is Sara free" or "are you free" (asking Cai) are not this, and
 * a statement ("I'm free tomorrow") isn't a question. The day and the hour are the server's to
 * read (`firstFutureWhen`), so this says only whether it's asked; `chat-free-golden.test.ts`
 * holds it to its lines. Pure; the server's alone.
 */
import { foldForIntent } from './chat-intent';

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const any = (alternatives: string[]) => new RegExp(`${B}(?:${alternatives.join('|')})${E}`, 'u');

/** Free, as each language says it of oneself (folded: "ة" is "ه"). */
const AR_FREE = '(?:فاضي|فاضيه|فاضيين|متاح|متاحه|فارغ|فارغه|فاضيا)';
const AR_WHEN = '(?:امتي|امتا|متي|ايمتي|ايمت|وقتاش|فوقاش|امتين)';
const FR_FREE = '(?:libre|dispo|disponible)';
const TR_FREE = '(?:boşum|müsaitim|uygunum|boş muyum|müsait miyim|uygun muyum)';

/** Asked of oneself whatever ends the sentence: these name the question in their own words. */
const ASKS = any([
  // English
  "when(?: am| will)? i(?:'m| am| be)? (?:free|available)",
  'when do i have (?:time|free time|a free slot|an opening|a gap)',
  'am i (?:free|available|busy)',
  'do i have (?:any )?(?:free time|time free|a free slot|an opening|a gap|time)(?: (?:today|tomorrow|on|this|next|at|in|for|between))',
  "what(?:'s| is| does)? my (?:day|week|morning|afternoon|evening|tomorrow|today|schedule|calendar|availability|monday|tuesday|wednesday|thursday|friday|saturday|sunday) look(?:s|ing)? like",
  "what(?:'s| is) my availability",
  'my free (?:time|slots?)',
  'is my (?:day|morning|afternoon|evening|calendar|schedule) (?:free|open|clear)',
  'when can i (?:meet|fit|squeeze)',
  // Arabic: "when am I free", and "do I have free time"
  String.raw`${AR_WHEN}(?: انا| انت)? ${AR_FREE}`,
  String.raw`${AR_WHEN} (?:عندي|يكون عندي|بيكون عندي|حيكون عندي) وقت`,
  'عندي (?:اي )?وقت (?:فاضي|فراغ)',
  '(?:ايش|وش|شو|ايه|اش|شنو|ماذا|ما) (?:عندي|يوجد عندي) من (?:وقت|مواعيد)',
  'وقتي الفاضي',
  'اوقات فراغي',
  // French
  String.raw`quand (?:est-ce que )?(?:je suis|suis-je|je serai|serai-je|je serais) ${FR_FREE}`,
  String.raw`suis-je ${FR_FREE}`,
  String.raw`quand (?:est-ce que )?j'ai du temps`,
  'quelles sont mes (?:disponibilités|dispos)',
  'mes (?:disponibilités|dispos)',
  'ai-je du temps(?: libre)?',
  'quand (?:puis-je|est-ce que je peux) (?:caser|placer|prendre) (?:un|une)',
  // Turkish
  String.raw`ne zaman ${TR_FREE}`,
  String.raw`ne zaman (?:boş|müsait|uygun) olurum`,
  // Turkish asks with its particle, so no question mark is needed: "cuma boş muyum".
  '(?:boş muyum|müsait miyim|uygun muyum)',
  'boş (?:vaktim|zamanım) (?:var mı|ne zaman)',
  'müsaitlik durumum',
  'takvimim nasıl',
]);

/** A yes-or-no about oneself that only the question mark (or "هل") makes a question. */
const YES_NO = any([
  'do i have (?:any )?(?:free )?time',
  String.raw`(?:هل )?(?:انا )?${AR_FREE}`,
  String.raw`(?:هل )?عندي وقت`,
  String.raw`(?:est-ce que )?je suis ${FR_FREE}`,
  String.raw`(?:est-ce que )?j'ai du temps`,
  String.raw`(?:est-ce que )?je suis pris`,
  TR_FREE,
  'boş vaktim var mı',
]);

/** The people this can't be about: Cai asked about itself, or someone else by name. */
const NOT_MINE = any([
  'are you',
  'is (?:he|she|they|it)',
  'when (?:is|are) (?!my)',
  'انت فاضي',
  'انتي فاضيه',
  'هو فاضي',
  'هي فاضيه',
  'tu es libre',
  'es-tu libre',
  'vous êtes libre',
  'sen boş musun',
]);

/** Whether the message asks when its writer is free, or whether they are. */
export function chatFree(text: string): boolean {
  const t = foldForIntent(text);
  if (!t || t.length > 120 || NOT_MINE.test(t)) return false;
  if (ASKS.test(t)) return true;
  return YES_NO.test(t) && (/[?؟]\s*$/.test(t) || /(?:^|\s)هل\s/.test(t));
}
