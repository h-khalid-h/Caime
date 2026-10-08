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
const AR_CURRENCY_WORDS =
  '(?:ريال|درهم|دينار|جنيه|جنية|دولار|ليرة)(?:\\s+[؀-ۿ]+)?|يورو|شيكل|شيقل|ر\\.س|د\\.إ|د\\.ا|ر\\.ق|د\\.ك|د\\.أ|د\\.ب|ر\\.ع|ج\\.م';
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
  return CURRENCY_ALIASES[raw.toLowerCase()] ?? raw.toUpperCase();
}

// ---------------------------------------------------------------------------------------------

export function extractAmounts(input: string): Amount[] {
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
      currency: currencyCode(m[1]),
    });
  }
  const after = new RegExp(
    `${num}\\s?([kKmM])?\\s?(USD|EUR|GBP|EGP|AED|SAR|dollars?|bucks|euros?|pounds?|LE|€|£)(?![A-Za-z])`,
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
      currency: /pounds?/i.test(cur) ? 'GBP' : currencyCode(cur),
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
      currency: arabicCurrency(m[4]!),
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
    out.push({
      text: input.slice(index, index + m[0].length).trim(),
      index,
      value: parseNumber(m[1]!, m[2]) * times,
      currency,
    });
  }
  return out.sort((a, b) => a.index - b.index);
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
