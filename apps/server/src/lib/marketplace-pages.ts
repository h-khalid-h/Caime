/**
 * The marketplace (R80): Discover's directory as pages on the web, for everyone, signed in or not.
 * `/marketplace` lists what Discover lists (Caime's own and the bridges first, then the listed
 * apps by how many connected them, then the newest: the same `listed(directoryQuery(…))`), a
 * category is `/marketplace/<category>`, and an app is `/marketplace/<slug>` (a built-in's and a
 * bridge's by id), with its screenshots, what it costs, its languages, where help and its privacy
 * policy are, and what it does with a model. Pages, not the app: no script, cached ten minutes,
 * in every interface language. Connect opens the app's sheet in Caime (`/settings/apps?app=`),
 * which keeps the link through sign-in.
 */
import {
  APP_CATEGORIES,
  APP_CATEGORY_LABELS,
  APP_PROVIDES_LABELS,
  type AppCategory,
  type AppProvides,
  type AppPublisher,
  appIconPath,
  BRIDGE_DESCRIPTION,
  BRIDGES,
  BUILTIN_APPS,
  directoryCursor,
  parseDirectoryCursor,
} from '@caime/core';
import { currentTranslator, INTERFACE_LANGUAGES, tr, trn } from '@caime/core/i18n';
import {
  type AiUse,
  APP_PRICING_LABELS,
  type AppPricing,
  appScreenshotPath,
  MARKETPLACE_PATH,
  marketplacePath,
} from '@caime/core/marketplace';
import { type Kysely, sql } from 'kysely';
import type { Database } from '../db/schema';
import {
  CAIME_PUBLISHER,
  type DirectoryRow,
  directoryQuery,
  listed,
  NO_VIEWER,
  publisherOf,
} from './app-directory';
import {
  esc,
  footer,
  langAttrs,
  masthead,
  SITE_NAME,
  type SiteFacts,
  siteHref,
  spec,
} from './site-pages';

/** Apps a page: enough to scan, few enough to stay a light page. */
export const MARKET_PAGE_SIZE = 48;

/** An app as the marketplace shows it: a listed app's row, or one of Caime's own. */
export interface MarketEntry {
  id: string;
  /** Caime's own (`builtin`, `bridge`), whose words are keys read in the page's language. */
  own: 'builtin' | 'bridge' | null;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: AppCategory;
  iconUrl: string | null;
  publisher: AppPublisher;
  connectedCount: number | null;
  provides: AppProvides[];
  pricing: AppPricing | null;
  languages: string[];
  supportUrl: string | null;
  privacyUrl: string | null;
  aiUse: AiUse | null;
  screenshots: string[];
  website: string | null;
  /** A bridge's line on where its token goes (a key). */
  how: string | null;
  reviewedAt: Date | null;
}

export type MarketplacePage =
  | {
      kind: 'marketplace';
      category: AppCategory | null;
      apps: MarketEntry[];
      nextBefore: string | null;
      /** A later page (`?before=`): not the one a search engine keeps. */
      later: boolean;
    }
  | { kind: 'market-app'; app: MarketEntry };

const fromRow = (r: DirectoryRow): MarketEntry => ({
  id: r.id,
  own: null,
  slug: r.slug ?? r.id,
  name: r.name,
  tagline: r.tagline,
  description: r.description,
  category: (r.category as AppCategory | null) ?? 'other',
  iconUrl: appIconPath(r.id, r.icon_file_id),
  publisher: publisherOf(r),
  connectedCount: r.connected_count,
  provides: r.provides as AppProvides[],
  pricing: (r.pricing as AppPricing | null) ?? null,
  languages: r.languages,
  supportUrl: r.support_url,
  privacyUrl: r.privacy_url,
  aiUse: r.ai_use,
  screenshots: r.screenshot_ids.map((f, n) => appScreenshotPath(r.id, n, f)),
  website: r.website,
  how: null,
  reviewedAt: r.reviewed_at,
});

const ownTerms = {
  iconUrl: null,
  publisher: CAIME_PUBLISHER,
  connectedCount: null,
  provides: [] as AppProvides[],
  pricing: 'free' as const,
  languages: [...INTERFACE_LANGUAGES],
  supportUrl: null,
  privacyUrl: null,
  aiUse: null,
  screenshots: [] as string[],
  reviewedAt: null,
};

/** Caime's own apps, in Discover's order: the built-ins, then the bridges (R79). */
export const OWN_APPS: readonly MarketEntry[] = [
  ...BUILTIN_APPS.map(
    (b): MarketEntry => ({
      ...ownTerms,
      id: b.id,
      own: 'builtin',
      slug: b.id,
      name: b.name,
      tagline: b.tagline,
      description: b.description,
      category: b.category,
      website: null,
      how: null,
    }),
  ),
  ...BRIDGES.map(
    (b): MarketEntry => ({
      ...ownTerms,
      id: b.id,
      own: 'bridge',
      slug: b.id,
      name: b.name,
      tagline: b.tagline,
      description: BRIDGE_DESCRIPTION,
      category: 'automation',
      website: b.website,
      how: b.how,
    }),
  ),
];

/**
 * What `/marketplace` and what's under it are (`rest` is what follows `/marketplace/`, or null):
 * the list, a category's list, an app's page, or nothing (a 404).
 */
export async function marketplacePageFor(
  db: Kysely<Database>,
  rest: string | null,
  search: URLSearchParams,
): Promise<MarketplacePage | null> {
  if (rest && !(APP_CATEGORIES as readonly string[]).includes(rest)) {
    const own = OWN_APPS.find((a) => a.slug === rest);
    if (own) return { kind: 'market-app', app: own };
    if (!/^[a-z0-9-]{2,64}$/.test(rest)) return null;
    const row = (await listed(directoryQuery({ db }, NO_VIEWER))
      .where('c.slug', '=', rest)
      .executeTakeFirst()) as DirectoryRow | undefined;
    return row ? { kind: 'market-app', app: fromRow(row) } : null;
  }
  const category = (rest as AppCategory | null) ?? null;
  const before = search.get('before');
  const cursor = before ? parseDirectoryCursor(before) : null;
  if (before && !cursor) return null;
  const rows = (await listed(directoryQuery({ db }, NO_VIEWER))
    .$if(Boolean(category), (qb) => qb.where('c.category', '=', category as string))
    .$if(Boolean(cursor), (qb) =>
      qb.where(
        sql<boolean>`(c.connected_count, c.id) < (${cursor?.connectedCount}, ${cursor?.id}::uuid)`,
      ),
    )
    .orderBy('c.connected_count', 'desc')
    .orderBy('c.id', 'desc')
    .limit(MARKET_PAGE_SIZE + 1)
    .execute()) as DirectoryRow[];
  const page = rows.slice(0, MARKET_PAGE_SIZE);
  const last = page[page.length - 1];
  const own = cursor ? [] : OWN_APPS.filter((a) => !category || a.category === category);
  return {
    kind: 'marketplace',
    category,
    apps: [...own, ...page.map(fromRow)],
    nextBefore:
      rows.length > MARKET_PAGE_SIZE && last
        ? directoryCursor(last.connected_count, last.id)
        : null,
    later: Boolean(cursor),
  };
}

/** The marketplace's addresses for the sitemap: its categories with apps, and every app. */
export async function marketplaceUrls(
  db: Kysely<Database>,
  limit: number,
): Promise<Array<{ path: string; lastmod: Date | null }>> {
  const rows = await listed(directoryQuery({ db }, NO_VIEWER))
    .where('c.slug', 'is not', null)
    .orderBy('c.connected_count', 'desc')
    .orderBy('c.id', 'desc')
    .limit(limit)
    .execute();
  const categories = new Set<string>([
    ...OWN_APPS.map((a) => a.category),
    ...rows.map((r) => r.category ?? 'other'),
  ]);
  return [
    ...APP_CATEGORIES.filter((c) => categories.has(c)).map((c) => ({
      path: marketplacePath(c),
      lastmod: null,
    })),
    ...OWN_APPS.map((a) => ({ path: marketplacePath(a.slug), lastmod: null })),
    ...rows.map((r) => ({ path: marketplacePath(r.slug as string), lastmod: r.reviewed_at })),
  ];
}

// --- Rendering --------------------------------------------------------------------------------

/** An app's words in the page's language: Caime's own are keys, a developer's are theirs. */
function words(a: MarketEntry) {
  if (a.own === 'builtin')
    return {
      name: tr(a.name),
      tagline: a.tagline ? tr(a.tagline) : null,
      description: a.description ? tr(a.description) : null,
    };
  if (a.own === 'bridge')
    return {
      name: a.name,
      tagline: a.tagline ? tr(a.tagline) : null,
      description: a.description ? tr(a.description, { name: a.name }) : null,
    };
  return { name: a.name, tagline: a.tagline, description: a.description };
}

/** Its icon, else its first letter in a tile (no picture of anyone else's). */
function mark(a: MarketEntry, name: string, size: number): string {
  if (a.iconUrl)
    return `<img class="appmark" src="${esc(a.iconUrl)}" alt="" width="${size}" height="${size}" loading="lazy">`;
  return `<span class="appmark" aria-hidden="true">${esc(Array.from(name)[0]?.toUpperCase() ?? '·')}</span>`;
}

/** Who made it, as consent and Discover say it, with Verified where it was proved. */
function byLine(p: AppPublisher, link: boolean): string {
  if (p.kind === 'caime') return esc(tr('Built by {site}', { site: SITE_NAME }));
  const name = esc(p.name);
  const href = p.handle ? (p.kind === 'org' ? `/o/${p.handle}` : `/@${p.handle}`) : null;
  const who = link && href ? `<a href="${esc(href)}">${name}</a>` : name;
  return p.kind === 'org' && p.verified ? `${who} · ${esc(tr('Verified'))}` : who;
}

const people = (count: number) =>
  trn(count, '{n} person connected it', '{n} people connected it', {
    n: count.toLocaleString(currentTranslator().language),
  });

/** A language's name in the page's language (Intl's own words), else its code. */
function languageName(code: string): string {
  try {
    return (
      new Intl.DisplayNames([currentTranslator().language], { type: 'language' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

const listJoin = (items: string[]) => {
  try {
    return new Intl.ListFormat(currentTranslator().language, {
      style: 'long',
      type: 'conjunction',
    }).format(items);
  } catch {
    return items.join(', ');
  }
};

/** A link out, safe: only the addresses a listing may hold (https, mailto). */
const outLink = (url: string) =>
  /^(https:\/\/|mailto:)/i.test(url)
    ? `<a href="${esc(url)}" rel="noopener nofollow">${esc(url.replace(/^(https:\/\/|mailto:)/i, ''))}</a>`
    : esc(url);

const categoryNav = (current: AppCategory | null, facts: SiteFacts) =>
  `<nav class="cats" aria-label="${esc(tr('Categories'))}">
    <a href="${siteHref(MARKETPLACE_PATH, facts)}"${current === null ? ' aria-current="page"' : ''}>${esc(tr('All'))}</a>
    ${APP_CATEGORIES.map(
      (c) =>
        `<a href="${siteHref(marketplacePath(c), facts)}"${current === c ? ' aria-current="page"' : ''}>${esc(tr(APP_CATEGORY_LABELS[c]))}</a>`,
    ).join('\n    ')}
  </nav>`;

function row(a: MarketEntry, facts: SiteFacts): string {
  const w = words(a);
  const facts_ = [
    byLine(a.publisher, false),
    a.connectedCount !== null ? esc(people(a.connectedCount)) : null,
  ].filter(Boolean);
  return `<li><a href="${siteHref(marketplacePath(a.slug), facts)}">${mark(a, w.name, 48)}<span><span class="name">${esc(w.name)}</span>${
    w.tagline ? `<span class="line">${esc(w.tagline)}</span>` : ''
  }<span class="mono">${facts_.join(' · ')}</span></span></a></li>`;
}

export interface RenderedMarketplace {
  title: string;
  description: string;
  body: string;
  ld: object;
  image: string | null;
  index: boolean;
}

export function renderMarketplace(
  page: MarketplacePage,
  facts: SiteFacts,
  publicUrl: string,
  url: string,
): RenderedMarketplace {
  const main = `<main class="pub pub-home pub-site pub-market" ${langAttrs()}>`;
  const breadcrumb = (trail: Array<{ name: string; url: string }>) => ({
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, n) => ({
      '@type': 'ListItem',
      position: n + 1,
      name: t.name,
      item: t.url,
    })),
  });
  const home = { name: tr('Marketplace'), url: `${publicUrl}${MARKETPLACE_PATH}` };
  if (page.kind === 'marketplace') {
    const category = page.category ? tr(APP_CATEGORY_LABELS[page.category]) : null;
    const path = page.category ? marketplacePath(page.category) : MARKETPLACE_PATH;
    const title = category
      ? tr('{category} apps for {site}', { category, site: SITE_NAME })
      : tr('Apps for {site}: the marketplace', { site: SITE_NAME });
    const description = tr(
      'Apps that work with {site}: its own, the automation platforms, and apps developers listed after {site} looked at each one. Each asks you before it does anything, and you can end it any time.',
      { site: SITE_NAME },
    );
    const more = page.nextBefore
      ? `<p class="cta"><a class="quiet" href="${esc(`${path}?before=${encodeURIComponent(page.nextBefore)}${facts.linkLang ? `&lang=${facts.linkLang}` : ''}`)}">${esc(tr('More apps'))}</a></p>`
      : '';
    return {
      title,
      description,
      image: null,
      index: !page.later,
      ld: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        url,
        breadcrumb: breadcrumb(
          category ? [home, { name: category, url: `${publicUrl}${path}` }] : [home],
        ),
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: page.apps.map((a, n) => ({
            '@type': 'ListItem',
            position: n + 1,
            url: `${publicUrl}${marketplacePath(a.slug)}`,
            name: words(a).name,
          })),
        },
      },
      body: `
${main}
  ${masthead(path, facts, MARKETPLACE_PATH)}
  <section class="hero">
    <h1>${esc(category ? tr('{category} apps', { category }) : tr('Apps that work with {site}.', { site: SITE_NAME }))}</h1>
    <p class="lead">${esc(description)}</p>
  </section>
  ${categoryNav(page.category, facts)}
  ${
    page.apps.length
      ? `<ul class="apps">\n    ${page.apps.map((a) => row(a, facts)).join('\n    ')}\n  </ul>`
      : `<p class="small">${esc(tr('Nothing here yet.'))}</p>`
  }
  ${more}
  <section class="sheet" aria-labelledby="market-list">
    <h2 id="market-list" class="mono">${esc(tr('List your app'))}</h2>
    ${spec([
      [
        tr('how'),
        tr(
          'Register it under Settings → Developer, fill in its listing and ask. {site} looks at every one against the bar on {developers}, once, and again whenever what it shows changes.',
          {
            site: SITE_NAME,
            developers: `<a href="${siteHref('/developers', facts)}#bar">${esc(tr('the developers’ page'))}</a>`,
          },
        ),
      ],
      [
        tr('order'),
        esc(
          tr(
            'By how many people connected it, then the newest. Nothing is paid for: no placement, no ratings.',
          ),
        ),
      ],
    ])}
  </section>
  ${footer(facts)}
</main>`,
    };
  }

  const a = page.app;
  const w = words(a);
  const category = tr(APP_CATEGORY_LABELS[a.category]);
  const own = a.own !== null;
  const shots = a.screenshots.length
    ? `<div class="shots">${a.screenshots
        .map(
          (s, n) =>
            `<img src="${esc(s)}" alt="${esc(tr('{name}, screenshot {n}', { name: w.name, n: n + 1 }))}" width="640" height="400" loading="lazy">`,
        )
        .join('')}</div>`
    : '';
  const ai = a.aiUse;
  const rows: Array<[string, string] | null> = [
    [tr('by'), byLine(a.publisher, true)],
    [
      tr('reviewed'),
      esc(
        own
          ? tr('Built by {site}', { site: SITE_NAME })
          : tr('Reviewed by {site}', { site: SITE_NAME }),
      ),
    ],
    [
      tr('category'),
      `<a href="${siteHref(marketplacePath(a.category), facts)}">${esc(category)}</a>`,
    ],
    a.provides.length
      ? [tr('gives Caime'), esc(listJoin(a.provides.map((p) => tr(APP_PROVIDES_LABELS[p]))))]
      : null,
    a.pricing ? [tr('price'), esc(tr(APP_PRICING_LABELS[a.pricing]))] : null,
    a.languages.length ? [tr('languages'), esc(listJoin(a.languages.map(languageName)))] : null,
    a.connectedCount !== null ? [tr('connected'), esc(people(a.connectedCount))] : null,
    a.how ? [tr('where it goes'), esc(tr(a.how))] : null,
    own
      ? [tr('help'), `<a href="/help">${esc(tr('{site}’s help', { site: SITE_NAME }))}</a>`]
      : a.supportUrl
        ? [tr('help'), outLink(a.supportUrl)]
        : null,
    own
      ? [
          tr('privacy'),
          `<a href="/privacy">${esc(tr('{site}’s privacy policy', { site: SITE_NAME }))}</a>`,
        ]
      : a.privacyUrl
        ? [tr('privacy'), outLink(a.privacyUrl)]
        : null,
    own
      ? null
      : ai
        ? [
            tr('AI'),
            esc(
              tr('Puts people’s words through {model}. Keeps {keeps}, for {days}, in {where}.', {
                model: ai.model,
                keeps: ai.keeps,
                days:
                  ai.days === 0
                    ? tr('no longer than the answer')
                    : trn(ai.days, '{n} day', '{n} days'),
                where: ai.where,
              }),
            ),
          ]
        : [tr('AI'), esc(tr('It says it puts nobody’s words through a model.'))],
    a.website ? [tr('website'), outLink(a.website)] : null,
  ];
  const appUrl = `${publicUrl}${marketplacePath(a.slug)}`;
  const publisher =
    a.publisher.kind === 'caime'
      ? { '@type': 'Organization', name: SITE_NAME, url: publicUrl }
      : {
          '@type': a.publisher.kind === 'org' ? 'Organization' : 'Person',
          name: a.publisher.name,
          ...(a.publisher.handle
            ? {
                url: `${publicUrl}${a.publisher.kind === 'org' ? `/o/${a.publisher.handle}` : `/@${a.publisher.handle}`}`,
              }
            : {}),
        };
  const free = a.pricing === 'free' || a.pricing === 'freemium';
  return {
    title: tr('{name} for {site} · Marketplace', { name: w.name, site: SITE_NAME }),
    description: (w.tagline ?? w.description ?? w.name).slice(0, 200),
    image: a.iconUrl ? `${publicUrl}${a.iconUrl}` : null,
    index: true,
    // The app and the way back up to it, as one graph: a breadcrumb isn't the app's own field.
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: w.name,
          url: appUrl,
          applicationCategory: category,
          operatingSystem: 'Web',
          ...(w.description || w.tagline ? { description: w.description ?? w.tagline } : {}),
          ...(a.iconUrl ? { image: `${publicUrl}${a.iconUrl}` } : {}),
          ...(a.screenshots.length
            ? { screenshot: a.screenshots.map((s) => `${publicUrl}${s}`) }
            : {}),
          ...(a.languages.length ? { inLanguage: a.languages } : {}),
          ...(a.pricing ? { isAccessibleForFree: free } : {}),
          ...(a.pricing === 'free'
            ? { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
            : {}),
          publisher,
        },
        breadcrumb([
          home,
          { name: category, url: `${publicUrl}${marketplacePath(a.category)}` },
          { name: w.name, url: appUrl },
        ]),
      ],
    },
    body: `
${main}
  ${masthead(marketplacePath(a.slug), facts, MARKETPLACE_PATH)}
  <section class="hero app-head">
    ${mark(a, w.name, 72)}
    <div>
      <h1>${esc(w.name)}</h1>
      ${w.tagline ? `<p class="lead">${esc(w.tagline)}</p>` : ''}
    </div>
  </section>
  ${w.description ? `<p class="about">${esc(w.description)}</p>` : ''}
  ${shots}
  <section class="sheet" aria-labelledby="app-sheet">
    <h2 id="app-sheet" class="mono">${esc(tr('Specification'))}</h2>
    ${spec(rows)}
  </section>
  <section class="hero">
    <p class="cta"><a href="/settings/apps?app=${encodeURIComponent(a.id)}">${esc(
      own
        ? tr('Turn it on in {site}', { site: SITE_NAME })
        : tr('Connect in {site}', { site: SITE_NAME }),
    )}</a> <a class="quiet" href="${siteHref(marketplacePath(a.category), facts)}">${esc(tr('More {category} apps', { category }))}</a></p>
  </section>
  ${footer(facts)}
</main>`,
  };
}
