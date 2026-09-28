/**
 * Whether text is one emoji, as a status shows one: a pictograph (with its skin tone or its
 * presentation mark), several joined into one (👩🏽‍💻), a flag of two letters or of a tag
 * sequence (🏴󠁧󠁢󠁳󠁣󠁴󠁿), or a keycap (1️⃣). Never words, and never half an emoji cut short.
 */
let pattern: RegExp | null = null;

export function isEmoji(text: string): boolean {
  // Made when first asked: not every engine the apps run on has every property escape.
  pattern ??= new RegExp(
    '^(?:' +
      [
        '(?:\\p{Extended_Pictographic}(?:\\u{FE0F}|\\p{Emoji_Modifier})?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?)(?:\\u{200D}\\p{Extended_Pictographic}(?:\\u{FE0F}|\\p{Emoji_Modifier})?)*',
        '\\p{Regional_Indicator}{2}',
        '[0-9#*]\\u{FE0F}?\\u{20E3}',
      ].join('|') +
      ')$',
    'u',
  );
  return pattern.test(text);
}
