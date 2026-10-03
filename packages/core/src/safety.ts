import { tr } from './i18n';
import { zonedParts } from './time';
/**
 * Safety rules shared by clients and the server (PRD §55, PRODUCT-REVIEW R14, R29).
 */

// ---------------------------------------------------------------------------------------------
// Age (R29), from the date of birth: exact, and on the day where the person is. A birthday on
// 29 February comes on 1 March in other years, so nobody is taken for older than they are.

export const ADULT_AGE = 18;
export const DEFAULT_MINIMUM_AGE = 13;

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date as it's kept ('YYYY-MM-DD'), when it's a real day of the calendar. */
export function parseDay(value: string | null | undefined): CalendarDay | null {
  const m = value ? DAY.exec(value) : null;
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  return { year, month, day };
}

/** The day it is where someone is: in UTC when their time zone isn't one. */
/** The day it is where they are (an unknown zone reads as UTC, as `zonedParts` does). */
export function todayIn(now: Date, timeZone?: string | null): CalendarDay {
  if (timeZone) {
    const { year, month, day } = zonedParts(now, timeZone);
    return { year, month, day };
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

const leap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const order = (d: CalendarDay) => d.year * 10_000 + d.month * 100 + d.day;

/** How old someone is on `now`, where they are. A date that isn't one counts as a newborn. */
export function ageOn(birthDate: string, now: Date = new Date(), timeZone?: string | null): number {
  const born = parseDay(birthDate);
  if (!born) return 0;
  const today = todayIn(now, timeZone);
  const [month, day] =
    born.month === 2 && born.day === 29 && !leap(today.year) ? [3, 1] : [born.month, born.day];
  const had = today.month > month || (today.month === month && today.day >= day);
  return today.year - born.year - (had ? 0 : 1);
}

/** Under 18, where they are: an account without a date of birth (an app, an agent) isn't. */
export function isMinor(
  birthDate: string | null | undefined,
  now: Date = new Date(),
  timeZone?: string | null,
): boolean {
  if (!birthDate) return false;
  return ageOn(birthDate, now, timeZone) < ADULT_AGE;
}

/** Old enough to sign up: from the birthday, where they are, that makes them the age. */
export function meetsMinimumAge(
  birthDate: string,
  now: Date = new Date(),
  minimumAge: number = DEFAULT_MINIMUM_AGE,
  timeZone?: string | null,
): boolean {
  return ageOn(birthDate, now, timeZone) >= minimumAge;
}

/** A date of birth to take: a real day, not after today where they are, at most 120 years ago. */
export function plausibleBirthDate(
  value: string,
  now: Date = new Date(),
  timeZone?: string | null,
): boolean {
  const born = parseDay(value);
  if (!born) return false;
  const today = todayIn(now, timeZone);
  return order(born) <= order(today) && ageOn(value, now, timeZone) <= 120;
}

/** R29: adults never find under-18 accounts through people search. */
export function searchable(viewerIsMinor: boolean, targetIsMinor: boolean): boolean {
  return !targetIsMinor || viewerIsMinor;
}

// ---------------------------------------------------------------------------------------------
// Links (PRD §55: suspicious-link detection)

const SHORTENERS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'shorturl.at',
  'rb.gy',
  'tiny.cc',
  's.id',
  'v.gd',
  'lnkd.in',
]);

const RISKY_TLDS = new Set([
  'zip',
  'mov',
  'top',
  'xyz',
  'click',
  'country',
  'gq',
  'tk',
  'ml',
  'cf',
  'ga',
  'work',
  'support',
]);

const BRANDS = [
  'paypal',
  'google',
  'apple',
  'microsoft',
  'amazon',
  'facebook',
  'instagram',
  'whatsapp',
  'netflix',
  'bank',
  'caime',
  'caishy',
  'dhl',
  'fedex',
  'ups',
];

export interface LinkAssessment {
  suspicious: boolean;
  reasons: string[];
}

function deconfuse(s: string): string {
  return s
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/rn/g, 'm');
}

export function assessLink(raw: string): LinkAssessment {
  const reasons: string[] = [];
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { suspicious: true, reasons: [tr('Not a valid address')] };
  }
  const host = url.hostname.toLowerCase();
  if (
    url.username ||
    url.password ||
    /@/.test(raw.replace(/^https?:\/\//i, '').split('/')[0] ?? '')
  ) {
    reasons.push('Hides the real address behind an @');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('['))
    reasons.push('Uses a raw IP address');
  if (host.split('.').some((label) => label.startsWith('xn--')))
    reasons.push('Uses look-alike characters');
  if (SHORTENERS.has(host)) reasons.push('Shortened link hides where it goes');
  const tld = host.split('.').pop() ?? '';
  if (RISKY_TLDS.has(tld)) reasons.push(tr('Unusual domain ending (.{tld})', { tld }));
  if (host.split('.').length > 5) reasons.push('Unusually many subdomains');
  const registrable = host.split('.').slice(-2).join('.');
  for (const brand of BRANDS) {
    const labels = host.split('.');
    const impersonates = labels.some(
      (l) => l !== brand && deconfuse(l).includes(brand) && !registrable.startsWith(`${brand}.`),
    );
    if (impersonates && !registrable.startsWith(`${brand}.`)) {
      reasons.push(tr("Looks like {brand} but isn't", { brand }));
      break;
    }
  }
  if (url.protocol === 'http:') reasons.push('Not encrypted (http)');
  const suspicious = reasons.some((r) => !r.startsWith('Not encrypted')) || reasons.length > 1;
  return { suspicious, reasons };
}
