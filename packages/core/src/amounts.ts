/**
 * Amounts in what people write (PRD §44): "$1,200", "EGP 500", "٥٠٠ جنيه", "3 mille euros",
 * "250 TL", with the currency when the words say which; a word that names several currencies
 * ("dinar", "lira" outside Turkish words) says none. Its own module so a form that reads an
 * amount loads this and not the whole message intelligence (`intelligence.ts` re-exports it).
 * Pure, no zod.
 */
import { asciiDigits } from './digits';
import { latinScores } from './latin-language';

const AR_LETTER = '؀-ۿ';

export interface Amount {
  text: string;
  index: number;
  value: number;
  currency: string | null;
}

function parseNumber(raw: string, suffix?: string): number {
  let s = raw.replace(/\s/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    s = decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const after = s.length - Math.max(lastComma, lastDot) - 1;
    const groups = s.split(sep).length - 1;
    s = after === 3 || groups > 1 ? s.split(sep).join('') : s.replace(sep, '.');
  }
  let n = Number(s);
  if (suffix === 'k' || suffix === 'K') n *= 1000;
  if (suffix === 'm' || suffix === 'M') n *= 1_000_000;
  return n;
}

const CURRENCY_ALIASES: Record<string, string> = {
  $: 'USD',
  us$: 'USD',
  usd: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  bucks: 'USD',
  '€': 'EUR',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  '£': 'GBP',
  gbp: 'GBP',
  'e£': 'EGP',
  egp: 'EGP',
  le: 'EGP',
  'ج.م': 'EGP',
  ج: 'EGP',
  جنيه: 'EGP',
  جنية: 'EGP',
  aed: 'AED',
  درهم: 'AED',
  sar: 'SAR',
  ريال: 'SAR',
  qar: 'QAR',
  kwd: 'KWD',
  jod: 'JOD',
  chf: 'CHF',
  cad: 'CAD',
  aud: 'AUD',
  inr: 'INR',
  '₹': 'INR',
  jpy: 'JPY',
  '¥': 'JPY',
  cny: 'CNY',
  دولار: 'USD',
  يورو: 'EUR',
  'ر.س': 'SAR',
  'د.إ': 'AED',
  'د.ا': 'AED',
  'ر.ق': 'QAR',
  'د.ك': 'KWD',
  'د.أ': 'JOD',
  'د.ب': 'BHD',
  'ر.ع': 'OMR',
  bhd: 'BHD',
  omr: 'OMR',
  mad: 'MAD',
  ils: 'ILS',
  شيكل: 'ILS',
  شيقل: 'ILS',
};
/** A currency word with the country after it: "ريال قطري" is QAR, "دينار" alone says nothing. */
const AR_CURRENCY_OF: Array<[RegExp, string | null]> = [
  [/^ريال\s+(?:قطري|قطرى)$/u, 'QAR'],
  [/^ريال\s+(?:عماني|عمانى|عُماني)$/u, 'OMR'],
  [/^ريال\s+(?:يمني|يمنى)$/u, 'YER'],
  [/^ريال(?:\s+سعودي|\s+سعودى)?$/u, 'SAR'],
  [/^درهم\s+(?:مغربي|مغربى)$/u, 'MAD'],
  [/^درهم(?:\s+إماراتي|\s+اماراتي|\s+إماراتى)?$/u, 'AED'],
  [/^دينار\s+(?:كويتي|كويتى)$/u, 'KWD'],
  [/^دينار\s+(?:أردني|اردني|أردنى)$/u, 'JOD'],
  [/^دينار\s+(?:بحريني|بحرينى)$/u, 'BHD'],
  [/^دينار\s+(?:عراقي|عراقى)$/u, 'IQD'],
  [/^دينار\s+(?:تونسي|تونسى)$/u, 'TND'],
  [/^دينار\s+(?:جزائري|جزائرى)$/u, 'DZD'],
  [/^دينار\s+(?:ليبي|ليبى)$/u, 'LYD'],
  [/^دينار$/u, null],
  [/^جنيه\s+(?:استرليني|إسترليني|استرلينى)$/u, 'GBP'],
  [/^جنيه\s+(?:سوداني|سودانى)$/u, 'SDG'],
  [/^(?:جنيه|جنية)(?:\s+مصري|\s+مصرى)?$/u, 'EGP'],
  [/^دولار(?:\s+أمريكي|\s+امريكي|\s+أميركي)?$/u, 'USD'],
  [/^ليرة\s+(?:لبنانية|لبنانيه)$/u, 'LBP'],
  [/^ليرة\s+(?:سورية|سوريه)$/u, 'SYP'],
  [/^ليرة\s+(?:تركية|تركيه)$/u, 'TRY'],
  [/^ليرة$/u, null],
];
/** The country that says which ("ريال قطري"), never the next word ("ريال للفندق"). */
const AR_COUNTRY_WORDS =
  '(?:قطري|قطرى|عماني|عمانى|عُماني|يمني|يمنى|سعودي|سعودى|مغربي|مغربى|إماراتي|اماراتي|إماراتى|كويتي|كويتى|أردني|اردني|أردنى|بحريني|بحرينى|عراقي|عراقى|تونسي|تونسى|جزائري|جزائرى|ليبي|ليبى|استرليني|إسترليني|استرلينى|سوداني|سودانى|مصري|مصرى|أمريكي|امريكي|أميركي|لبنانية|لبنانيه|سورية|سوريه|تركية|تركيه)';
const AR_CURRENCY_WORDS = `(?:ريال|درهم|دينار|جنيه|جنية|دولار|ليرة)(?:\\s+${AR_COUNTRY_WORDS})?|يورو|شيكل|شيقل|ر\\.س|د\\.إ|د\\.ا|ر\\.ق|د\\.ك|د\\.أ|د\\.ب|ر\\.ع|ج\\.م|ج`;
/** "ألف", "٥ آلاف", "مليون": the multiplier between a number and its currency. */
const AR_MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(?:ألف|الف|آلاف|الاف|تلاف)$/u, 1000],
  [/^(?:مليون|ملايين)$/u, 1_000_000],
];

function arabicCurrency(words: string): string | null {
  const w = words.replace(/\s+/g, ' ').trim();
  for (const [re, code] of AR_CURRENCY_OF) if (re.test(w)) return code;
  return currencyCode(w);
}

function currencyCode(raw: string | undefined): string | null {
  if (!raw) return null;
  return (
    CURRENCY_ALIASES[raw.toLowerCase()] ?? (/^[A-Za-z]{3}$/.test(raw) ? raw.toUpperCase() : null)
  );
}

/**
 * What the writer may mean by a word that names several currencies (R76): "$" is a dollar, but
 * whose; "ريال" is Saudi unless they live in Qatar; "دينار" alone says nothing unless their own
 * is a dinar. The writer's currency settles it when it's in the family; else the family's usual
 * one, or none, as before.
 */
const FAMILIES: Readonly<Record<string, readonly string[]>> = {
  dollar: [
    'USD',
    'CAD',
    'AUD',
    'NZD',
    'SGD',
    'HKD',
    'TWD',
    'MXN',
    'JMD',
    'BBD',
    'BSD',
    'BZD',
    'BMD',
    'BND',
    'KYD',
    'XCD',
    'FJD',
    'GYD',
    'LRD',
    'NAD',
    'SBD',
    'SRD',
    'TTD',
    'ZWL',
  ],
  pound: ['GBP', 'EGP', 'LBP', 'SDG', 'SYP', 'SSP', 'GIP', 'FKP', 'SHP'],
  riyal: ['SAR', 'QAR', 'OMR', 'YER', 'IRR'],
  dirham: ['AED', 'MAD'],
  dinar: ['KWD', 'JOD', 'BHD', 'IQD', 'DZD', 'TND', 'LYD', 'RSD', 'MKD'],
  lira: ['LBP', 'SYP', 'TRY'],
  franc: ['CHF', 'XOF', 'XAF', 'XPF', 'DJF', 'GNF', 'KMF', 'BIF', 'RWF', 'CDF'],
};
/** The family a bare word or sign belongs to; none for an explicit code or a qualified word. */
const FAMILY_OF: Array<[RegExp, keyof typeof FAMILIES]> = [
  [/^(?:\$|dollars?|bucks|dolar|دولار)$/iu, 'dollar'],
  [/^(?:£|pounds?|livres?|جنيه|جنية)$/iu, 'pound'],
  [/^ريال$/u, 'riyal'],
  [/^(?:درهم|dirhams?|dh|dhs?)$/iu, 'dirham'],
  [/^(?:دينار|dinars?)$/iu, 'dinar'],
  [/^(?:ليرة|liras?|lirası|liralık)$/iu, 'lira'],
  [/^francs?$/iu, 'franc'],
];

export interface AmountOptions {
  /** The writer's own currency (ISO 4217): what a sign or a word several currencies share means to them. */
  currency?: string | null;
}

function settle(
  currency: string | null,
  raw: string,
  opts: AmountOptions | undefined,
): string | null {
  const own = opts?.currency;
  if (!own) return currency;
  const word = raw.replace(/\s+/g, ' ').trim();
  const family = FAMILY_OF.find(([re]) => re.test(word))?.[1];
  if (!family) return currency;
  return FAMILIES[family]?.includes(own) ? own : currency;
}

// ---------------------------------------------------------------------------------------------

export function extractAmounts(input: string, opts?: AmountOptions): Amount[] {
  const out: Amount[] = [];
  // Arabic-Indic digits read as digits; the matched text is still the writer's own.
  const text = asciiDigits(input);
  const num = '(\\d{1,3}(?:[,.\\s]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const before = new RegExp(
    `(US\\$|E£|\\$|€|£|¥|₹|\\b(?:USD|EUR|GBP|EGP|AED|SAR|QAR|KWD|JOD|CHF|CAD|AUD|INR|JPY|CNY)\\b)\\s?${num}\\s?([kKmM])?(?![\\w])`,
    'g',
  );
  for (const m of text.matchAll(before)) {
    out.push({
      text: input.slice(m.index ?? 0, (m.index ?? 0) + m[0].length).trim(),
      index: m.index ?? 0,
      value: parseNumber(m[2]!, m[3]),
      currency: settle(currencyCode(m[1]), m[1]!, opts),
    });
  }
  const after = new RegExp(
    `${num}\\s?([kKmM])?\\s?(USD|EUR|GBP|EGP|AED|SAR|QAR|KWD|JOD|BHD|OMR|MAD|TND|DZD|CHF|CAD|AUD|INR|JPY|CNY|dollars?|bucks|euros?|pounds?|LE|€|£|\\$)(?![A-Za-z])`,
    'g',
  );
  for (const m of text.matchAll(after)) {
    const index = m.index ?? 0;
    if (out.some((a) => index >= a.index && index < a.index + a.text.length)) continue;
    const cur = m[3]!;
    out.push({
      text: input.slice(index, index + m[0].length).trim(),
      index,
      value: parseNumber(m[1]!, m[2]),
      currency: settle(/pounds?/i.test(cur) ? 'GBP' : currencyCode(cur), cur, opts),
    });
  }
  // "٥ آلاف ريال", "250 ر.س", "2 مليون دينار كويتي": a number, maybe a multiplier, then the
  // currency as Arabic says it, the country word after it deciding which.
  const arabic = new RegExp(
    `${num}\\s?(?:([kKmM])|((?:ألف|الف|آلاف|الاف|تلاف|مليون|ملايين)\\s+))?(${AR_CURRENCY_WORDS})(?=$|[^${AR_LETTER}])`,
    'gu',
  );
  for (const m of text.matchAll(arabic)) {
    const index = m.index ?? 0;
    if (out.some((a) => index >= a.index && index < a.index + a.text.length)) continue;
    const times = m[3] ? (AR_MULTIPLIERS.find(([re]) => re.test(m[3]!.trim()))?.[1] ?? 1) : 1;
    const matched = input.slice(index, index + m[0].length);
    out.push({
      text: matched.trim(),
      index,
      value: parseNumber(m[1]!, m[2]) * times,
      currency: settle(arabicCurrency(m[4]!), m[4]!, opts),
    });
  }
  // French and Turkish: "3 mille euros", "1,5 million d'euros", "250 TL", "₺250", "5 bin
  // lira", "500 Türk lirası", "200 dirhams marocains". A word that names several currencies
  // ("dinars", "livres", "balles") says none; "lira" alone is Turkey's only in Turkish words.
  const before2 = new RegExp(`(₺|\\bTL\\b|\\bTRY\\b)\\s?${num}(?![\\p{L}\\d])`, 'gu');
  for (const m of text.matchAll(before2)) {
    const index = m.index ?? 0;
    if (out.some((a) => index >= a.index && index < a.index + a.text.length)) continue;
    out.push({
      text: input.slice(index, index + m[0].length).trim(),
      index,
      value: parseNumber(m[2]!),
      currency: 'TRY',
    });
  }
  const latin = new RegExp(
    `${num}\\s?(?:([kK])|(mille|millions?|milliards?|bin|milyon|milyar)\\s+(?:d['’])?)?(?:([Tt][üu]rk|[Ll]übnan|[Ss]uriye|[Tt]urkish|[Ll]ebanese|[Ss]yrian)\\s+)?(₺|[Tt][Ll]|TRY|[Ll]iras?ı|[Ll]iralık|[Ll]iras?|euros?|€|balles|dolar|avro|sterlin|dirhams?|DH|[Dd]hs?|dinars?|DT|livres?|francs?|FCFA)(?:\\s+(sterling|libanaises?|égyptiennes?|marocains?|tunisiens?|algériens?|koweïtiens?|suisses?))?(?![\\p{L}])`,
    'gu',
  );
  let turkish: boolean | undefined;
  for (const m of text.matchAll(latin)) {
    const index = m.index ?? 0;
    if (out.some((a) => index >= a.index && index < a.index + a.text.length)) continue;
    const times = m[3] ? (LATIN_MULTIPLIERS.find(([re]) => re.test(m[3]!))?.[1] ?? 1) : 1;
    let currency = latinCurrency(m[5]!, m[4], m[6]);
    if (currency === 'lira') {
      turkish ??= (() => {
        const s = latinScores(input);
        return s.tr > s.en && s.tr > s.fr;
      })();
      currency = turkish ? 'TRY' : null;
    }
    // A bare word ("dinars", "livres", "dirhams"): the writer's own, when it's one of those.
    if (!m[4] && !m[6]) currency = settle(currency, m[5]!, opts);
    out.push({
      text: input.slice(index, index + m[0].length).trim(),
      index,
      value: parseNumber(m[1]!, m[2]) * times,
      currency,
    });
  }
  wordAmounts(input, out, opts);
  bareAmounts(text, input, out);
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------------------------
// Amounts in words: "two hundred dollars", "deux mille euros", "bin lira", "مية جنيه", "ألفين ريال".

const UNITS: Record<string, number> = {
  // English
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  // French
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  quatrevingt: 80,
  // Turkish
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  yirmi: 20,
  otuz: 30,
  kırk: 40,
  elli: 50,
  altmış: 60,
  yetmiş: 70,
  seksen: 80,
  doksan: 90,
  // Arabic, as written in each place
  واحد: 1,
  واحدة: 1,
  اتنين: 2,
  اثنين: 2,
  إثنين: 2,
  ثنين: 2,
  تلاتة: 3,
  ثلاثة: 3,
  تلات: 3,
  ثلاث: 3,
  اربعة: 4,
  أربعة: 4,
  اربع: 4,
  أربع: 4,
  خمسة: 5,
  خمس: 5,
  ستة: 6,
  ست: 6,
  سبعة: 7,
  سبع: 7,
  تمانية: 8,
  ثمانية: 8,
  تمن: 8,
  ثمان: 8,
  تسعة: 9,
  تسع: 9,
  عشرة: 10,
  عشر: 10,
  عشرين: 20,
  عشرون: 20,
  تلاتين: 30,
  ثلاثين: 30,
  اربعين: 40,
  أربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  تمانين: 80,
  ثمانين: 80,
  تسعين: 90,
  // Arabic hundreds and thousands said as one word
  ميتين: 200,
  مئتين: 200,
  مائتين: 200,
  تلتمية: 300,
  تلاتمية: 300,
  ثلاثمائة: 300,
  ثلاثمية: 300,
  ربعمية: 400,
  اربعمية: 400,
  أربعمائة: 400,
  خمسمية: 500,
  خمسمائة: 500,
  ستمية: 600,
  ستمائة: 600,
  سبعمية: 700,
  سبعمائة: 700,
  تمنمية: 800,
  تمانمية: 800,
  ثمانمائة: 800,
  تسعمية: 900,
  تسعمائة: 900,
};
/** Multiply what came before (or one): "five hundred", "deux mille", "iki bin", "خمسة آلاف". */
const HUNDREDS = new Set(['hundred', 'cent', 'cents', 'yüz', 'مية', 'مئة', 'ميه', 'مائة']);
const THOUSANDS: Record<string, number> = {
  thousand: 1000,
  mille: 1000,
  bin: 1000,
  ألف: 1000,
  الف: 1000,
  آلاف: 1000,
  الاف: 1000,
  تلاف: 1000,
  million: 1_000_000,
  millions: 1_000_000,
  milyon: 1_000_000,
  مليون: 1_000_000,
  ملايين: 1_000_000,
};
/** Said whole: "ألفين" is two thousand, "مليونين" two million. */
const WHOLE: Record<string, number> = { ألفين: 2000, الفين: 2000, مليونين: 2_000_000 };
const JOINS = new Set(['and', 'et', 'و']);

/** The value of number words in order, or null when one isn't a number word. */
function wordsValue(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let any = false;
  for (const raw of words) {
    // "وخمسمية": Arabic joins "and" to the next number.
    const w = raw.length > 2 && raw.startsWith('و') && !(raw in UNITS) ? raw.slice(1) : raw;
    if (JOINS.has(w)) continue;
    if (w in WHOLE) {
      total += WHOLE[w]!;
      any = true;
    } else if (w in UNITS) {
      current += UNITS[w]!;
      any = true;
    } else if (HUNDREDS.has(w)) {
      current = (current || 1) * 100;
      any = true;
    } else if (w in THOUSANDS) {
      total += (current || 1) * THOUSANDS[w]!;
      current = 0;
      any = true;
    } else return null;
  }
  // "a" alone is no amount ("a dollar" is one, but "a" before nothing counted is noise).
  return any && total + current > 0 ? total + current : null;
}

/** A currency word as each language writes it after an amount in words. */
const WORD_CURRENCY = new RegExp(
  `(dollars?|bucks|euros?|pounds?|dirhams?|dinars?|francs?|livres?|liras?ı|lira|TL|dolar|avro|sterlin|${AR_CURRENCY_WORDS})(?![\\p{L}])`,
  'giu',
);

/** A word as the tables hold it: lower case, Turkish's dotted capital folded first. */
const folded = (w: string) => w.replace(/İ/g, 'i').toLowerCase();

function wordAmounts(input: string, out: Amount[], opts: AmountOptions | undefined) {
  for (const m of input.matchAll(WORD_CURRENCY)) {
    const at = m.index ?? 0;
    if (out.some((a) => at >= a.index && at < a.index + a.text.length)) continue;
    // The words before the currency, as long as each is a number word; French's
    // "quatre-vingt(s)" is eighty, one word that a hyphen would split.
    const head = input.slice(0, at);
    const tokens = [...head.matchAll(/quatre-vingts?|[^\s-]+/giu)];
    const words = tokens.map((t) => folded(t[0]).replace(/^quatre-vingts?$/u, 'quatrevingt'));
    let take = 0;
    let value: number | null = null;
    for (let n = 1; n <= Math.min(8, words.length); n += 1) {
      const v = wordsValue(words.slice(words.length - n));
      if (v === null) break;
      take = n;
      value = v;
    }
    if (!value || !take) continue;
    if (/^an?$/.test(words[words.length - take]!) && take === 1) continue;
    const start = tokens[tokens.length - take]!.index ?? 0;
    const word = input.slice(at, at + m[0].length);
    out.push({
      text: input.slice(start, at + m[0].length).trim(),
      index: start,
      value,
      currency: wordCurrency(word, input, opts),
    });
  }
}

function wordCurrency(word: string, input: string, opts: AmountOptions | undefined): string | null {
  if (/[؀-ۿ]/u.test(word)) return settle(arabicCurrency(word), word, opts);
  const w = word.toLowerCase();
  if (/^(?:dollars?|bucks)$/.test(w)) return settle('USD', word, opts);
  if (/^pounds?$/.test(w)) return settle('GBP', word, opts);
  if (/^(?:liras?ı|lira|tl)$/.test(w)) {
    const s = latinScores(input);
    return /^tl$/.test(w) || (s.tr > s.en && s.tr > s.fr) ? 'TRY' : settle(null, 'lira', opts);
  }
  return settle(latinCurrency(word), word, opts);
}

// ---------------------------------------------------------------------------------------------
// A bare number in a sentence about money: "Rent is 1500 a month", "Send me 2k", "ادفعلي ٢٥٠".
// No currency is said, so none is given; the writer's own is theirs to choose where it's used.

const NOT_MONEY_AFTER =
  '(?!\\s*(?:%|٪|percent|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|people|guys|persons?|items?|boxes|files?|pages?|times|photos?|pics?|kg|km|am|pm|of\\b|minutes?|heures?|jours?|semaines?|mois|ans?|personnes?|fichiers?|fois|dakika|saat|gün|hafta|ay\\b|yıl|kişi|dosya|fotoğraf|tane|adet|دقيقة|دقايق|دقائق|ساعة|ساعه|ساعات|يوم|أيام|ايام|أسبوع|اسبوع|شهر|سنة|سنين|كيلو|متر|شخص|نفر|حبة|قطعة|ملف|ملفات|صور|صورة))';
const BARE_MONEY: RegExp[] = [
  new RegExp(
    `\\b(?:pay|paid|paying|owe|owes|owed|lend|lent|cost|costs|costing|rent|charge|charged|salary|budget|deposit|fee|refund(?:ed)?|send\\s+me|transfer(?:red)?)\\b(?:\\s+(?:is|was|of|me|you|him|her|them|us|about|around|only|just|the|a))*\\s+(\\d[\\d,.]*)\\s?([kK])?(?![\\w%])${NOT_MONEY_AFTER}`,
    'gi',
  ),
  new RegExp(
    `(?<![\\p{L}])(?:payer|payé|payée|paye|paie|dois|doit|devez|loyer|prix|coûte|coute|coûtent|coûté|facture|virement|acompte|envoie-moi|rembourse|rembourser|salaire|budget)(?:\\s+(?:est|de|du|me|moi|te|lui|à|environ|seulement|que|juste))*\\s+(\\d[\\d\\s,.]*\\d|\\d)\\s?(k)?(?![\\p{L}\\d%])${NOT_MONEY_AFTER}`,
    'giu',
  ),
  new RegExp(
    `(?<![\\p{L}])(?:kira(?:sı)?|fiyat(?:ı)?|tutar(?:ı)?|borç|borcun|borcum|kapora|ücret(?:i)?|maaş(?:ı)?|bütçe)(?:\\s+(?:da|de|ise|sadece|yaklaşık))*\\s+(\\d[\\d.,]*)(?![\\p{L}\\d%])${NOT_MONEY_AFTER}`,
    'giu',
  ),
  new RegExp(
    `(?<![\\p{L}])(?:ادفعلي|ادفعله|ادفعلها|ادفع|دفعت|هدفع|بدفع|حوللي|حولتلك|حولت|سلفني|سلفلي|اقرضني|إيجار|ايجار|الإيجار|الايجار|السعر|سعره|سعرها|بكام|التمن|الثمن|تمنه|ثمنه|المبلغ|مبلغ|الراتب|المرتب|مرتب|العربون|عربون|الأجرة|الاجرة|اجرة)(?:\\s+(?:هو|كان|حوالي|بس|تقريبا|تقريبًا|لي|ليا|لك))*\\s+(\\d[\\d,.]*)(?![\\p{L}\\d%٪])${NOT_MONEY_AFTER}`,
    'gu',
  ),
];

function bareAmounts(text: string, input: string, out: Amount[]) {
  for (const re of BARE_MONEY) {
    for (const m of text.matchAll(re)) {
      const index = (m.index ?? 0) + m[0].lastIndexOf(m[1]!);
      if (out.some((a) => index >= a.index && index < a.index + a.text.length)) continue;
      const value = parseNumber(m[1]!, m[2]);
      if (!Number.isFinite(value) || value <= 0) continue;
      out.push({
        text: input.slice(index, index + m[1]!.length + (m[2]?.length ?? 0)).trim(),
        index,
        value,
        currency: null,
      });
    }
  }
}

const LATIN_MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(?:mille|bin)$/, 1000],
  [/^(?:millions?|milyon)$/, 1_000_000],
  [/^(?:milliards?|milyar)$/, 1_000_000_000],
];

/** A French or Turkish currency word, with the country before or after it deciding which. */
function latinCurrency(word: string, country?: string, after?: string): string | null {
  const w = word.toLowerCase();
  const c = (country ?? '').toLowerCase();
  const a = (after ?? '').toLowerCase();
  if (/^(?:₺|tl|try)$/.test(w)) return 'TRY';
  if (/^lira/.test(w)) {
    if (/^(?:türk|turk|turkish)$/.test(c)) return 'TRY';
    if (/^(?:lübnan|lebanese)$/.test(c)) return 'LBP';
    if (/^(?:suriye|syrian)$/.test(c)) return 'SYP';
    return 'lira';
  }
  if (/^(?:euros?|€|avro)$/.test(w)) return 'EUR';
  if (w === 'dolar') return 'USD';
  if (w === 'sterlin') return 'GBP';
  if (/^dirham/.test(w)) return /^marocain/.test(a) ? 'MAD' : null;
  if (/^dhs?$/.test(w)) return 'MAD';
  if (/^dinar/.test(w))
    return /^tunisien/.test(a)
      ? 'TND'
      : /^algérien/.test(a)
        ? 'DZD'
        : /^koweïtien/.test(a)
          ? 'KWD'
          : null;
  if (w === 'dt') return 'TND';
  if (/^livre/.test(w))
    return a === 'sterling'
      ? 'GBP'
      : /^libanaise/.test(a)
        ? 'LBP'
        : /^égyptienne/.test(a)
          ? 'EGP'
          : null;
  if (/^franc/.test(w)) return /^suisse/.test(a) ? 'CHF' : null;
  return null;
}
