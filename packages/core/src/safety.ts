/**
 * Safety rules shared by clients and the server (PRD §55, PRODUCT-REVIEW R14, R29).
 */

// ---------------------------------------------------------------------------------------------
// Age (R29). Only the birth year is collected, so every check is conservative: an account is
// treated as under 18 until it is certainly 18, and as old enough only when it certainly is.

export const ADULT_AGE = 18;
export const DEFAULT_MINIMUM_AGE = 13;

export function isMinor(birthYear: number | null | undefined, now: Date = new Date()): boolean {
  if (!birthYear) return false;
  return now.getUTCFullYear() - birthYear <= ADULT_AGE;
}

export function meetsMinimumAge(
  birthYear: number,
  now: Date = new Date(),
  minimumAge: number = DEFAULT_MINIMUM_AGE,
): boolean {
  return now.getUTCFullYear() - birthYear > minimumAge;
}

export function plausibleBirthYear(year: number, now: Date = new Date()): boolean {
  const current = now.getUTCFullYear();
  return Number.isInteger(year) && year >= current - 120 && year <= current;
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
    return { suspicious: true, reasons: ['Not a valid address'] };
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
  if (RISKY_TLDS.has(tld)) reasons.push(`Unusual domain ending (.${tld})`);
  if (host.split('.').length > 5) reasons.push('Unusually many subdomains');
  const registrable = host.split('.').slice(-2).join('.');
  for (const brand of BRANDS) {
    const labels = host.split('.');
    const impersonates = labels.some(
      (l) => l !== brand && deconfuse(l).includes(brand) && !registrable.startsWith(`${brand}.`),
    );
    if (impersonates && !registrable.startsWith(`${brand}.`)) {
      reasons.push(`Looks like ${brand} but isn't`);
      break;
    }
  }
  if (url.protocol === 'http:') reasons.push('Not encrypted (http)');
  const suspicious = reasons.some((r) => !r.startsWith('Not encrypted')) || reasons.length > 1;
  return { suspicious, reasons };
}
