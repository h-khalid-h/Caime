/**
 * Locales arrive from devices in every shape: "ar-EG", "en_US.UTF-8", "en-US@posix", "". A bad
 * tag must never break a screen, so everything that formats goes through `safeLocale`, which
 * returns a canonical BCP 47 tag the runtime accepts, or "en".
 */
const cache = new Map<string, string>();

export function safeLocale(input: string | null | undefined): string {
  const raw = (input ?? '').trim();
  if (!raw) return 'en';
  const hit = cache.get(raw);
  if (hit) return hit;
  // POSIX forms: en_US.UTF-8@euro → en-US
  const cleaned = (raw.split('@')[0] ?? '').split('.')[0]?.replace(/_/g, '-') ?? '';
  let out = 'en';
  for (const candidate of [cleaned, cleaned.split('-')[0] ?? '']) {
    if (!candidate) continue;
    try {
      const [canonical] = Intl.getCanonicalLocales(candidate);
      if (canonical) {
        // The runtime may know the syntax but not the data; make sure it can format with it.
        new Intl.DateTimeFormat(canonical);
        out = canonical;
        break;
      }
    } catch {
      // Try the next, shorter candidate.
    }
  }
  cache.set(raw, out);
  return out;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const nfCache = new Map<string, Intl.NumberFormat>();

/** A cached DateTimeFormat that never throws: bad locales fall back to "en", bad zones to UTC. */
export function dateFormat(
  locale: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const loc = safeLocale(locale);
  const key = `${loc}|${JSON.stringify(options)}`;
  let f = dtfCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(loc, options);
    } catch {
      f = new Intl.DateTimeFormat(loc, { ...options, timeZone: 'UTC' });
    }
    if (dtfCache.size > 500) dtfCache.clear();
    dtfCache.set(key, f);
  }
  return f;
}

export function numberFormat(
  locale: string | null | undefined,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const loc = safeLocale(locale);
  const key = `${loc}|${JSON.stringify(options)}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(loc, options);
    if (nfCache.size > 200) nfCache.clear();
    nfCache.set(key, f);
  }
  return f;
}
