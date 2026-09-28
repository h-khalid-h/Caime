/**
 * Countries (ISO 3166-1): where a person lives and where an organization is based, which set their
 * defaults (the work week, R31; the currency of a card with an amount). The data is tzdata's and
 * CLDR's (geo-data.ts, from scripts/geo.mjs), and names come from the server's own ICU in the
 * asker's language, so the app downloads none of it until someone opens the list.
 */
import { safeLocale } from '@caime/core';
import { COUNTRIES, COUNTRY_CURRENCY, ZONE_COUNTRY, ZONE_LINKS, ZONES } from './geo-data';

export function isCountry(code: unknown): code is string {
  return typeof code === 'string' && Object.hasOwn(COUNTRIES, code);
}

/**
 * Where a device probably is: its time zone first (a phone in Cairo set to English still says
 * Africa/Cairo), then the region of its language (en-GB), else nowhere.
 */
export function suggestCountry(
  timeZone: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  if (timeZone && Object.hasOwn(ZONE_COUNTRY, timeZone)) return ZONE_COUNTRY[timeZone] ?? null;
  try {
    const region = locale ? new Intl.Locale(locale).region : undefined;
    return isCountry(region) ? region : null;
  } catch {
    return null;
  }
}

/** A country's currency (ISO 4217), when it has one of its own (Antarctica doesn't). */
export function currencyOf(country: string | null | undefined): string | null {
  return country ? (COUNTRY_CURRENCY[country] ?? null) : null;
}

export interface CountryName {
  code: string;
  name: string;
}

/** Lists kept, one per language as asked for (zh-TW, pt-PT), the oldest let go past `KEPT`. */
const lists = new Map<string, CountryName[]>();
const KEPT = 64;

/** Every country, named and ordered in `locale`'s language (English names where ICU has none). */
export function countriesIn(locale: string | null | undefined): CountryName[] {
  // As the tag says, region too: zh-TW's names are Traditional Chinese, pt-PT's European.
  const lang = new Intl.Locale(safeLocale(locale ?? 'en')).baseName;
  const cached = lists.get(lang);
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
  } catch {
    names = null;
  }
  const collator = new Intl.Collator(lang);
  const list = Object.entries(COUNTRIES)
    .map(([code, english]) => ({ code, name: names?.of(code) ?? english }))
    .sort((a, b) => collator.compare(a.name, b.name));
  // Any language can be asked for: the oldest list goes first once enough are kept.
  if (lists.size >= KEPT) lists.delete(lists.keys().next().value as string);
  lists.set(lang, list);
  return list;
}

/** The currencies countries use (ISO 4217), for choosing one an amount is in. */
const CURRENCIES = [...new Set(Object.values(COUNTRY_CURRENCY))].sort();
const currencyLists = new Map<string, CountryName[]>();

/**
 * Every currency a country uses, named in `locale`'s language ("Egyptian pound") and ordered by
 * that name; the code alone where ICU has no name for it.
 */
export function currenciesIn(locale: string | null | undefined): CountryName[] {
  const lang = new Intl.Locale(safeLocale(locale ?? 'en')).baseName;
  const cached = currencyLists.get(lang);
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([lang], { type: 'currency', fallback: 'none' });
  } catch {
    names = null;
  }
  const collator = new Intl.Collator(lang);
  const list = CURRENCIES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) =>
    collator.compare(a.name, b.name),
  );
  if (currencyLists.size >= KEPT) currencyLists.delete(currencyLists.keys().next().value as string);
  currencyLists.set(lang, list);
  return list;
}

export interface TimeZoneName {
  /** The IANA name, "Africa/Cairo". */
  zone: string;
  /** Its city, "Cairo". */
  city: string;
  /** The country it's in (ISO 3166-1), and its name in the asker's language. */
  country: string | null;
  countryName: string | null;
  /** Its offset from UTC now, "GMT+3". */
  offset: string;
}

const ZONE_SET = new Set(ZONES);

/**
 * A time zone by the name it has now (a device may report Asia/Calcutta for Asia/Kolkata, or
 * Etc/UTC), or null for anything that isn't one: an offset (+05:00), an abbreviation (EST), a name
 * tzdata doesn't have. Offsets and abbreviations mean different things to ICU and to Postgres, so
 * only a zone's name is kept.
 */
export function currentZone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  if (ZONE_SET.has(zone)) return zone;
  return Object.hasOwn(ZONE_LINKS, zone) ? (ZONE_LINKS[zone] ?? null) : null;
}

/** Each zone's offset formatter; null for one this runtime's ICU doesn't have yet. */
const offsets = new Map<string, Intl.DateTimeFormat | null>();
function offsetNow(zone: string, now: Date): string | null {
  if (!offsets.has(zone)) {
    try {
      offsets.set(
        zone,
        new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }),
      );
    } catch {
      offsets.set(zone, null);
    }
  }
  const f = offsets.get(zone);
  return f ? (f.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT') : null;
}

/**
 * Every time zone to choose from (tzdata's zone.tab, and UTC), with its city, its country named
 * in `locale`'s language and its offset now, ordered by city.
 */
export function timeZonesIn(locale: string | null | undefined, now: Date): TimeZoneName[] {
  const names = new Map(countriesIn(locale).map((c) => [c.code, c.name]));
  const collator = new Intl.Collator(new Intl.Locale(safeLocale(locale ?? 'en')).language);
  const list: TimeZoneName[] = [];
  for (const zone of ZONES) {
    const offset = offsetNow(zone, now);
    if (!offset) continue;
    const country = ZONE_COUNTRY[zone] ?? null;
    list.push({
      zone,
      city: zone === 'UTC' ? 'UTC' : (zone.split('/').at(-1) ?? zone).replace(/_/g, ' '),
      country,
      countryName: country ? (names.get(country) ?? null) : null,
      offset,
    });
  }
  return list.sort((a, b) => collator.compare(a.city, b.city));
}
