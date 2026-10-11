// Writes what Caime knows of countries, from two sources, so nothing about a country is typed
// twice (PRODUCT-REVIEW R76):
// - the IANA time zone database installed with tzdata (/usr/share/zoneinfo): every country and
//   territory (iso3166.tab), the country of each time zone (zone.tab), old names included (the
//   links in tzdata.zi), since browsers still report some (Asia/Calcutta): apps/server/src/lib/geo-data.ts;
// - CLDR's supplemental data: each country's currency (currencyData), the first day of its week
//   and its weekend (weekData), whether its clock counts to 12 (timeData), and each currency's
//   minor units (fractions): packages/core/src/countries-data.ts and currency-data.ts, deviations
//   from the world's defaults only, so the app carries little.
// Calling codes (ITU-T E.164, which CLDR no longer carries) are the table at the end of this
// script, written to packages/core/src/calling-codes.ts.
// Run it again when any source changes:
//   npm pack cldr-core && tar -xzf cldr-core-*.tgz package/package.json package/supplemental
//   node scripts/geo.mjs package/supplemental/currencyData.json [zoneinfo dir]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const cldr = process.argv[2];
if (!cldr) throw new Error('Pass the path of CLDR supplemental/currencyData.json');
const supplemental = dirname(cldr);
const dir = process.argv[3] ?? '/usr/share/zoneinfo';
const lines = (file) =>
  readFileSync(join(dir, file), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'));
const version = /^# version (\S+)/m.exec(readFileSync(join(dir, 'tzdata.zi'), 'utf8'))?.[1];
if (!version) throw new Error('No tzdata version found');

const countries = {};
for (const l of lines('iso3166.tab')) {
  const [code, name] = l.split('\t');
  if (/^[A-Z]{2}$/.test(code) && name) countries[code] = name.trim();
}
// Kosovo, which iso3166.tab leaves out (XK is a code ISO keeps for local use) but CLDR, ICU and
// phones list: someone who lives there chooses it, not a neighbour.
countries.XK ??= 'Kosovo';
const zones = {};
// Each country's zones in zone.tab's order (the first is its main one: Africa/Cairo, America/New_York).
const countryZones = {};
for (const l of lines('zone.tab')) {
  const [code, , zone] = l.split('\t');
  if (!countries[code]) throw new Error(`zone.tab names ${code}, which iso3166.tab doesn't`);
  zones[zone] = code;
  countryZones[code] ??= [];
  countryZones[code].push(zone);
}
// The zones people choose from: zone.tab's, and UTC.
const canonical = [...Object.keys(zones), 'UTC'].sort();
// An old name takes the country of the zone it links to, which is only right in a tzdata built
// with backzone (Debian's, Ubuntu's): IANA's default build merges zones across borders, so there
// Pacific/Truk links to Pacific/Port_Moresby (Papua New Guinea), not Pacific/Chuuk (Micronesia).
// Such a build makes these, each a zone of its own country, links; refuse it rather than write
// the wrong countries.
const zoneLines = new Set(
  readFileSync(join(dir, 'tzdata.zi'), 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('Z '))
    .map((l) => l.split(' ')[1]),
);
for (const zone of ['Africa/Accra', 'Europe/Amsterdam', 'Pacific/Chuuk', 'Pacific/Pohnpei'])
  if (!zoneLines.has(zone))
    throw new Error(`tzdata.zi has no zone ${zone} of its own: build it with backzone`);
let aliases = 0;
// UTC by any of its names, and GMT, the same time: devices report Etc/UTC, GMT and the rest.
const utc = new Set(['Etc/UTC', 'Etc/GMT']);
const links = { 'Etc/GMT': 'UTC', 'Etc/UTC': 'UTC' };
for (const l of readFileSync(join(dir, 'tzdata.zi'), 'utf8').split('\n')) {
  const m = /^L (\S+) (\S+)$/.exec(l);
  if (!m) continue;
  const [, target, alias] = m;
  if (zones[target] && !zones[alias]) {
    zones[alias] = zones[target];
    aliases++;
  }
  // An older name a device may still report (Asia/Calcutta), for the one it is now.
  if ((zones[target] || utc.has(target)) && !canonical.includes(alias))
    links[alias] = utc.has(target) ? 'UTC' : target;
}
// A country's currency: the first it lists that's legal tender and hasn't ended (CLDR lists the
// current one first). None for a territory without one (Antarctica).
const regions = JSON.parse(readFileSync(cldr, 'utf8')).supplemental.currencyData.region;
const cldrVersion = JSON.parse(readFileSync(join(cldr, '../../package.json'), 'utf8')).version;
const currencies = {};
for (const code of Object.keys(countries)) {
  const current = (regions[code] ?? [])
    .map((o) => Object.entries(o)[0])
    .find(([cur, v]) => !v._to && v._tender !== 'false' && /^[A-Z]{3}$/.test(cur) && cur !== 'XXX');
  if (current) currencies[code] = current[0];
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

// CLDR's weeks and clocks (weekData, timeData): days as JavaScript counts them, 0 = Sunday.
const DAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const week = JSON.parse(readFileSync(join(supplemental, 'weekData.json'), 'utf8')).supplemental
  .weekData;
const time = JSON.parse(readFileSync(join(supplemental, 'timeData.json'), 'utf8')).supplemental
  .timeData;
const span = (start, end) => {
  const out = [];
  for (let d = start; ; d = (d + 1) % 7) {
    out.push(d);
    if (d === end) return out;
  }
};
const world = {
  firstDay: DAY[week.firstDay['001']],
  weekend: span(DAY[week.weekendStart['001']], DAY[week.weekendEnd['001']]),
  hour12: (time['001']?._preferred ?? 'H').startsWith('h'),
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const countryData = {};
for (const code of Object.keys(countries)) {
  const d = {};
  if (currencies[code]) d.c = currencies[code];
  const firstDay = DAY[week.firstDay[code] ?? week.firstDay['001']];
  if (firstDay !== world.firstDay) d.f = firstDay;
  const weekend = span(
    DAY[week.weekendStart[code] ?? week.weekendStart['001']],
    DAY[week.weekendEnd[code] ?? week.weekendEnd['001']],
  );
  if (!same(weekend, world.weekend)) d.w = weekend;
  if ((time[code]?._preferred ?? 'H').startsWith('h') !== world.hour12) d.h = 1;
  if (Object.keys(d).length) countryData[code] = d;
}
// A currency's minor units, where not two (the dinars' three, the yen's none).
const fractions = JSON.parse(readFileSync(cldr, 'utf8')).supplemental.currencyData.fractions;
const decimals = {};
for (const [cur, f] of Object.entries(fractions)) {
  if (!/^[A-Z]{3}$/.test(cur) || cur === 'DEFAULT') continue;
  const digits = Number(f._digits);
  if (Number.isFinite(digits) && digits !== 2) decimals[cur] = digits;
}

const generated = (what) => `// Generated by scripts/geo.mjs from ${what}: do not edit.`;
const server = `${generated(`tzdata ${version} and CLDR ${cldrVersion}`)}
// ${Object.keys(countries).length} countries and territories (ISO 3166-1 alpha-2: iso3166.tab, and XK), and the
// country of ${Object.keys(zones).length} time zones (zone.tab, and ${aliases} older names of them).

/** Every country and territory, by its ISO 3166-1 code, with its English name. */
export const COUNTRIES: Readonly<Record<string, string>> = ${JSON.stringify(sorted(countries), null, 2)};

/** The country a time zone is in (a zone used across borders names the first, as zone.tab does). */
export const ZONE_COUNTRY: Readonly<Record<string, string>> = ${JSON.stringify(sorted(zones), null, 2)};

/** Each country's time zones in zone.tab's order: the first is its main one (Africa/Cairo). */
export const COUNTRY_ZONES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(sorted(countryZones), null, 2)};

/** The ${canonical.length} time zones to choose from: zone.tab's, and UTC. */
export const ZONES: readonly string[] = ${JSON.stringify(canonical, null, 2)};

/** Older names of them that devices may still report, and the name each has now. */
export const ZONE_LINKS: Readonly<Record<string, string>> = ${JSON.stringify(sorted(links), null, 2)};
`;
writeFileSync(new URL('../apps/server/src/lib/geo-data.ts', import.meta.url), server);

const rows = Object.entries(sorted(countryData))
  .map(([code, d]) => {
    const parts = [];
    if (d.c) parts.push(`c: '${d.c}'`);
    if (d.f !== undefined) parts.push(`f: ${d.f}`);
    if (d.w) parts.push(`w: [${d.w.join(', ')}]`);
    if (d.h) parts.push('h: 1');
    return `  ${code}: { ${parts.join(', ')} },`;
  })
  .join('\n');
const core = `${generated(`CLDR ${cldrVersion}`)}
// What a country sets (PRODUCT-REVIEW R76), as CLDR has it, for ${Object.keys(countryData).length} countries and territories:
// read through \`countries.ts\`, never here. Only what differs from the world's defaults is written.

/** The world's defaults (CLDR region 001): the week starts on Monday, Saturday and Sunday are the weekend, the clock counts to 24. */
export const WORLD = {
  firstDay: ${world.firstDay},
  weekend: [${world.weekend.join(', ')}] as readonly number[],
  hour12: ${world.hour12},
} as const;

/** One country's deviations: \`c\` its currency (ISO 4217), \`f\` the first day of its week, \`w\` its weekend days, \`h\` a 12-hour clock. */
export interface CountryData {
  c?: string;
  f?: number;
  w?: readonly number[];
  h?: 1;
}

export const COUNTRY_DATA: Readonly<Record<string, CountryData>> = {
${rows}
};
`;
writeFileSync(new URL('../packages/core/src/countries-data.ts', import.meta.url), core);

const currency = `${generated(`CLDR ${cldrVersion}`)}
// A currency's minor units where they aren't two (ISO 4217 through CLDR): the dinars keep three,
// the yen none. Read through \`minorUnits\` in \`format.ts\`.
export const CURRENCY_DECIMALS: Readonly<Record<string, number>> = ${JSON.stringify(sorted(decimals), null, 2)};
`;
writeFileSync(new URL('../packages/core/src/currency-data.ts', import.meta.url), currency);

// Country calling codes (ITU-T E.164): the digits after "+", an area code included where a
// country shares +1 (the North American Numbering Plan). Territories without one are left out.
const CALLING = {
  AD: '376',
  AE: '971',
  AF: '93',
  AG: '1268',
  AI: '1264',
  AL: '355',
  AM: '374',
  AO: '244',
  AQ: '672',
  AR: '54',
  AS: '1684',
  AT: '43',
  AU: '61',
  AW: '297',
  AX: '358',
  AZ: '994',
  BA: '387',
  BB: '1246',
  BD: '880',
  BE: '32',
  BF: '226',
  BG: '359',
  BH: '973',
  BI: '257',
  BJ: '229',
  BL: '590',
  BM: '1441',
  BN: '673',
  BO: '591',
  BQ: '599',
  BR: '55',
  BS: '1242',
  BT: '975',
  BW: '267',
  BY: '375',
  BZ: '501',
  CA: '1',
  CC: '61',
  CD: '243',
  CF: '236',
  CG: '242',
  CH: '41',
  CI: '225',
  CK: '682',
  CL: '56',
  CM: '237',
  CN: '86',
  CO: '57',
  CR: '506',
  CU: '53',
  CV: '238',
  CW: '599',
  CX: '61',
  CY: '357',
  CZ: '420',
  DE: '49',
  DJ: '253',
  DK: '45',
  DM: '1767',
  DO: '1809',
  DZ: '213',
  EC: '593',
  EE: '372',
  EG: '20',
  EH: '212',
  ER: '291',
  ES: '34',
  ET: '251',
  FI: '358',
  FJ: '679',
  FK: '500',
  FM: '691',
  FO: '298',
  FR: '33',
  GA: '241',
  GB: '44',
  GD: '1473',
  GE: '995',
  GF: '594',
  GG: '44',
  GH: '233',
  GI: '350',
  GL: '299',
  GM: '220',
  GN: '224',
  GP: '590',
  GQ: '240',
  GR: '30',
  GS: '500',
  GT: '502',
  GU: '1671',
  GW: '245',
  GY: '592',
  HK: '852',
  HN: '504',
  HR: '385',
  HT: '509',
  HU: '36',
  ID: '62',
  IE: '353',
  IL: '972',
  IM: '44',
  IN: '91',
  IO: '246',
  IQ: '964',
  IR: '98',
  IS: '354',
  IT: '39',
  JE: '44',
  JM: '1876',
  JO: '962',
  JP: '81',
  KE: '254',
  KG: '996',
  KH: '855',
  KI: '686',
  KM: '269',
  KN: '1869',
  KP: '850',
  KR: '82',
  KW: '965',
  KY: '1345',
  KZ: '7',
  LA: '856',
  LB: '961',
  LC: '1758',
  LI: '423',
  LK: '94',
  LR: '231',
  LS: '266',
  LT: '370',
  LU: '352',
  LV: '371',
  LY: '218',
  MA: '212',
  MC: '377',
  MD: '373',
  ME: '382',
  MF: '590',
  MG: '261',
  MH: '692',
  MK: '389',
  ML: '223',
  MM: '95',
  MN: '976',
  MO: '853',
  MP: '1670',
  MQ: '596',
  MR: '222',
  MS: '1664',
  MT: '356',
  MU: '230',
  MV: '960',
  MW: '265',
  MX: '52',
  MY: '60',
  MZ: '258',
  NA: '264',
  NC: '687',
  NE: '227',
  NF: '672',
  NG: '234',
  NI: '505',
  NL: '31',
  NO: '47',
  NP: '977',
  NR: '674',
  NU: '683',
  NZ: '64',
  OM: '968',
  PA: '507',
  PE: '51',
  PF: '689',
  PG: '675',
  PH: '63',
  PK: '92',
  PL: '48',
  PM: '508',
  PN: '64',
  PR: '1787',
  PS: '970',
  PT: '351',
  PW: '680',
  PY: '595',
  QA: '974',
  RE: '262',
  RO: '40',
  RS: '381',
  RU: '7',
  RW: '250',
  SA: '966',
  SB: '677',
  SC: '248',
  SD: '249',
  SE: '46',
  SG: '65',
  SH: '290',
  SI: '386',
  SJ: '47',
  SK: '421',
  SL: '232',
  SM: '378',
  SN: '221',
  SO: '252',
  SR: '597',
  SS: '211',
  ST: '239',
  SV: '503',
  SX: '1721',
  SY: '963',
  SZ: '268',
  TC: '1649',
  TD: '235',
  TG: '228',
  TH: '66',
  TJ: '992',
  TK: '690',
  TL: '670',
  TM: '993',
  TN: '216',
  TO: '676',
  TR: '90',
  TT: '1868',
  TV: '688',
  TW: '886',
  TZ: '255',
  UA: '380',
  UG: '256',
  US: '1',
  UY: '598',
  UZ: '998',
  VA: '39',
  VC: '1784',
  VE: '58',
  VG: '1284',
  VI: '1340',
  VN: '84',
  VU: '678',
  WF: '681',
  WS: '685',
  XK: '383',
  YE: '967',
  YT: '262',
  ZA: '27',
  ZM: '260',
  ZW: '263',
};
for (const code of Object.keys(CALLING))
  if (!countries[code]) throw new Error(`A calling code for ${code}, which isn't a country`);
const calling = `${generated('the table in scripts/geo.mjs (ITU-T E.164)')}
// A country's calling code: the digits after "+", with the area code where a country shares +1.
// Loaded where a phone number is read or written, never in the startup chunk.
export const CALLING_CODES: Readonly<Record<string, string>> = ${JSON.stringify(sorted(CALLING), null, 2)};
`;
writeFileSync(new URL('../packages/core/src/calling-codes.ts', import.meta.url), calling);
console.log(
  `tzdata ${version}, CLDR ${cldrVersion}: ${Object.keys(countries).length} countries, ${Object.keys(zones).length} zones (${aliases} older names), ${Object.keys(currencies).length} currencies, ${Object.keys(countryData).length} with deviations, ${Object.keys(decimals).length} currencies off two decimals, ${Object.keys(CALLING).length} calling codes`,
);
