/**
 * The Arabic someone speaks (R72). Caime's interface reads in Modern Standard Arabic, the
 * written standard every Arabic reader shares; the voices that talk with someone (Cai and the
 * Caime Friends, by the rules and by the model) speak their Arabic: the one they chose, else the
 * one they write in, else the one where they live, else the standard. Pure, no zod: the app
 * reads it by subpath to say what "Where you live" comes to.
 */

export const ARABIC_VARIETIES = [
  'standard',
  'egyptian',
  'gulf',
  'levantine',
  'iraqi',
  'maghrebi',
  'sudanese',
  'yemeni',
] as const;
export type ArabicVariety = (typeof ARABIC_VARIETIES)[number];

/** What someone chose for how Cai speaks Arabic with them: as they write and live, or one. */
export type ArabicVarietyChoice = 'auto' | ArabicVariety;

/** Where each is spoken (ISO 3166-1): where someone lives says what they speak at home. */
const COUNTRIES: Record<Exclude<ArabicVariety, 'standard'>, readonly string[]> = {
  egyptian: ['EG'],
  gulf: ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'],
  levantine: ['LB', 'SY', 'JO', 'PS'],
  iraqi: ['IQ'],
  maghrebi: ['MA', 'DZ', 'TN', 'LY'],
  sudanese: ['SD'],
  yemeni: ['YE'],
};

const OF_COUNTRY = new Map<string, ArabicVariety>(
  Object.entries(COUNTRIES).flatMap(([variety, codes]) =>
    codes.map((code) => [code, variety as ArabicVariety] as const),
  ),
);

/** The Arabic spoken where someone lives, or null where it isn't one country's own. */
export function varietyOfCountry(country: string | null | undefined): ArabicVariety | null {
  return country ? (OF_COUNTRY.get(country.toUpperCase()) ?? null) : null;
}

/** The variety's name for a model to read (English, never shown). */
export const VARIETY_NAMES: Record<ArabicVariety, string> = {
  standard: 'Modern Standard Arabic',
  egyptian: 'Egyptian Arabic',
  gulf: 'Gulf Arabic',
  levantine: 'Levantine Arabic',
  iraqi: 'Iraqi Arabic',
  maghrebi: 'Maghrebi Arabic (Darija)',
  sudanese: 'Sudanese Arabic',
  yemeni: 'Yemeni Arabic',
};

/**
 * Words only one variety says, as they're folded (any alef as "ا", "ى" as "ي", "ة" as "ه", no
 * marks): a word the varieties share ("عشان", "ليش", "كتير", "تمام") or that's also Standard
 * Arabic, a name or another word once folded ("دول" is "countries", "هواية" a hobby, "توًّا"
 * "just now", "زين" a name, "لا بأس" folds to "لا باس", "هلأ" to the Gulf's "هلا") is in none,
 * so it never decides.
 */
const MARKERS: Record<'egyptian' | 'gulf' | 'levantine' | 'iraqi' | 'maghrebi', readonly string[]> =
  {
    egyptian: [
      'ازاي',
      'ازاى',
      'اذاي',
      'ازيك',
      'ازيكم',
      'ازيكو',
      'دلوقتي',
      'دلوقت',
      'كده',
      'كدا',
      'عايز',
      'عايزه',
      'عايزين',
      'عاوز',
      'عاوزه',
      'بتاع',
      'بتاعي',
      'بتاعك',
      'بتاعت',
      'بتوع',
      'النهارده',
      'اوي',
      'امتي',
      'فين',
      'مفيش',
      'مافيش',
      'ليه',
      'علشان',
      'ده',
      'مستني',
      'هعمل',
      'هبعت',
      'عامل ايه',
      'عامله ايه',
      'اخبارك ايه',
      'ايه ده',
      'في ايه',
    ],
    gulf: [
      'شلونك',
      'شلونكم',
      'وش',
      'وشلونك',
      'شخبارك',
      'شخباركم',
      'ابغي',
      'ابغا',
      'تبغي',
      'يبغي',
      'نبغي',
      'وايد',
      'الحين',
      'مب',
      'عساك',
      'دحين',
      'ايش',
      'هلا والله',
    ],
    levantine: [
      'شو',
      'هلق',
      'هيك',
      'بدي',
      'بدك',
      'بدنا',
      'بدكن',
      'منيح',
      'منيحه',
      'مبارح',
      'هون',
      'لهون',
      'هونيك',
      'لسا',
      'عنجد',
      'مشان',
      'منشان',
      'كرمال',
      'قديش',
      'هيدا',
      'هيدي',
      'ازا',
      'كيفكن',
    ],
    iraqi: ['شكو', 'ماكو', 'اكو', 'هسه', 'لعد', 'شكد', 'باچر', 'گاعد', 'شلونچ'],
    maghrebi: [
      'واش',
      'بزاف',
      'دابا',
      'كيداير',
      'كيدايره',
      'لاباس',
      'مزيان',
      'مزيانه',
      'ديال',
      'ديالي',
      'ديالك',
      'علاش',
      'كيفاش',
      'بغيت',
      'برشا',
      'والو',
    ],
  };

/** Arabic as the markers are written: one alef, "ي" for "ى", "ه" for "ة", no marks or tatweel. */
export function foldArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

const SINGLE = new Map<string, keyof typeof MARKERS>();
const DOUBLE = new Map<string, keyof typeof MARKERS>();
for (const [variety, words] of Object.entries(MARKERS) as Array<
  [keyof typeof MARKERS, readonly string[]]
>)
  for (const w of words) (w.includes(' ') ? DOUBLE : SINGLE).set(foldArabic(w), variety);

/**
 * The variety a message is written in, by the words only it says; null when it says none, or
 * as many of one as of another (Standard Arabic, a greeting everyone says, a mixed message).
 */
export function writtenVariety(text: string): ArabicVariety | null {
  const words = foldArabic(text)
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  if (!words.length) return null;
  const counts = new Map<string, number>();
  const count = (v: string | undefined) => {
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  };
  words.forEach((w, i) => {
    count(SINGLE.get(w));
    if (i > 0) count(DOUBLE.get(`${words[i - 1]} ${w}`));
  });
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first || (second && second[1] === first[1])) return null;
  return first[0] as ArabicVariety;
}

/**
 * The Arabic to speak with someone: what they chose, else what they write in, else where they
 * live, else the standard. `written` is their latest words (more than one message is fine).
 */
export function arabicVariety(input: {
  choice?: ArabicVarietyChoice | null;
  written?: string | null;
  country?: string | null;
}): ArabicVariety {
  if (input.choice && input.choice !== 'auto') return input.choice;
  return (
    (input.written ? writtenVariety(input.written) : null) ??
    varietyOfCountry(input.country) ??
    'standard'
  );
}
