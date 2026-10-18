/**
 * Whether text is one emoji, as a status shows one: a pictograph (with its skin tone or its
 * presentation mark), several joined into one (👩🏽‍💻), a flag of two letters or of a tag
 * sequence (🏴󠁧󠁢󠁳󠁣󠁴󠁿), or a keycap (1️⃣). Never words, and never half an emoji cut short.
 */
const ONE =
  '(?:' +
  [
    '(?:\\p{Extended_Pictographic}(?:\\u{FE0F}|\\p{Emoji_Modifier})?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?)(?:\\u{200D}\\p{Extended_Pictographic}(?:\\u{FE0F}|\\p{Emoji_Modifier})?)*',
    '\\p{Regional_Indicator}{2}',
    '[0-9#*]\\u{FE0F}?\\u{20E3}',
  ].join('|') +
  ')';

// Made when first asked: not every engine the apps run on has every property escape.
let pattern: RegExp | null = null;
let few: RegExp | null = null;
let each: RegExp | null = null;

export function isEmoji(text: string): boolean {
  pattern ??= new RegExp(`^${ONE}$`, 'u');
  return pattern.test(text);
}

/** The most emoji a message is drawn big for: past three, it reads as a line again. */
export const BIG_EMOJI_MAX = 3;

/**
 * How many emoji a message is, when it's nothing else (M16 E3): one to three, which a bubble
 * draws big, as every messenger does; 0 for anything with a word or a digit in it, or more.
 */
export function emojiOnly(text: string): number {
  const t = text.trim();
  if (!t || t.length > 64) return 0;
  few ??= new RegExp(`^(?:${ONE}\\s*){1,${BIG_EMOJI_MAX}}$`, 'u');
  if (!few.test(t)) return 0;
  each ??= new RegExp(ONE, 'gu');
  return t.match(each)?.length ?? 0;
}
