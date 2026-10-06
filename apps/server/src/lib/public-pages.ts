/**
 * What a visitor who isn't signed in, a search engine or an answer engine reads (R44): the shell
 * the web app boots from carries, per page, a title, a description, Open Graph and Twitter cards,
 * a canonical address, JSON-LD and a plain HTML body the app replaces the moment it renders. The
 * landing page says what Caime is; `/@handle` and `/o/handle` show what a person or an
 * organization already shows to everyone (ADR-10: the privacy evaluator decides, with nobody as
 * the viewer; a person's page exists only while they can be found by handle, and never under
 * 18); every other path is the app's and asks not to be indexed.
 */

import { type Character, characterSvg, type Expression } from '@caime/brand/characters';
import { HEART_PATH, WORDMARK } from '@caime/brand/generated/wordmark';
import type { BookingItem, CatalogCollection, OrgRef, PaymentKind } from '@caime/core';
import {
  bySlug,
  canSee,
  formatAmount,
  handleError,
  itemPhotoPath,
  methodsFor,
  normalizeHandle,
  PAYMENT_KIND_LABELS,
  SPHERE_DEFS,
  type Sphere,
  type SystemKind,
  systemAccountOf,
} from '@caime/core';
import { MARKETING_PAGES, type MarketingPage } from '@caime/core/api';
import {
  currentTranslator,
  dirOf,
  INTERFACE_LANGUAGES,
  type InterfaceLanguage,
  sentence,
  tr,
} from '@caime/core/i18n';
import { tagged } from '@caime/core/tagged';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import { catalogOf, paymentsOf } from './booking';
import { orgRef } from './business';
import { orgsOf } from './orgs';
import { FACE, px, THEME_VARS, type } from './page-style';
import {
  esc,
  explorerStyle,
  LANDING_DESCRIPTION,
  label,
  langAttrs,
  PROMISE,
  renderLanding,
  renderSite,
  SITE_NAME,
  type SiteFacts,
} from './site-pages';
import { avatarUrl, minorOf, privacyOf } from './users';

type Q = Kysely<Database>;

/** Open Graph's locale for each interface language. */
const OG_LOCALE: Record<InterfaceLanguage, string> = {
  en: 'en_US',
  ar: 'ar_AR',
  fr: 'fr_FR',
  tr: 'tr_TR',
};

export const NOBODY = {
  isSelf: false,
  isConnected: false,
  blocked: false,
  ownerSpheresForViewer: [] as never[],
};

export interface PublicPerson {
  kind: 'person';
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  headline: string | null;
  organizations: OrgRef[];
  /** What anyone may book (R58): the public items of their catalog, while they take bookings. */
  items: PublicItem[];
  /** Their public collections (R61) that hold something public. */
  collections: PublicCollection[];
  /** The kinds of ways anyone may pay them (R62): never the details. */
  pays: PaymentKind[];
  /** Cai or a Caime Friend (R67): Caime's own, said so, with what it's for as its bio. */
  system: SystemKind | null;
}
export interface PublicOrg {
  kind: 'org';
  org: OrgRef;
  about: string | null;
  website: string | null;
  country: string | null;
  foundedYear: number | null;
  updatedAt: Date;
  items: PublicItem[];
  collections: PublicCollection[];
  pays: PaymentKind[];
}
/** A catalog item as a visitor reads it: nothing of who does it. */
export type PublicItem = Pick<
  BookingItem,
  | 'id'
  | 'name'
  | 'price'
  | 'unit'
  | 'minutes'
  | 'slug'
  | 'description'
  | 'collectionId'
  | 'photoFileId'
>;
export type PublicCollection = Pick<CatalogCollection, 'id' | 'slug' | 'name' | 'description'>;

/**
 * What anyone may book or order (R58, R60): the public items in no collection or a public one
 * (R61), the booked ones while the host keeps hours, the ordered ones while it takes orders;
 * and the public collections that hold any of them.
 */
function publicCatalog(row: {
  booking: unknown;
  booking_items: unknown;
  ordering?: unknown;
  collections?: unknown;
}): { items: PublicItem[]; collections: PublicCollection[] } {
  const catalog = catalogOf(row);
  const open = new Set(catalog.collections.filter((c) => c.audience === 'public').map((c) => c.id));
  const items = catalog.items
    .filter(
      (i) =>
        i.audience === 'public' &&
        (i.collectionId === null || open.has(i.collectionId)) &&
        (i.unit === 'each' ? Boolean(row.ordering) : Boolean(row.booking)),
    )
    .map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      unit: i.unit,
      minutes: i.minutes,
      slug: i.slug,
      description: i.description,
      collectionId: i.collectionId,
      photoFileId: i.photoFileId ?? null,
    }));
  const held = new Set(items.map((i) => i.collectionId));
  const collections = catalog.collections
    .filter((c) => open.has(c.id) && held.has(c.id))
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description }));
  return { items, collections };
}

/** The kinds of ways anyone may pay a host (R62), each once: "Bank transfer, Cash". */
function publicPays(row: { payments?: unknown }): PaymentKind[] {
  const kinds = methodsFor(paymentsOf(row), { isConnected: false, spheres: [] }).map((m) => m.kind);
  return [...new Set(kinds)];
}

/** One of a host's public items or collections (R61), on a page of its own. */
export interface PublicItemPage {
  kind: 'item';
  host: PublicPerson | PublicOrg;
  item: PublicItem;
}
export interface PublicCollectionPage {
  kind: 'collection';
  host: PublicPerson | PublicOrg;
  collection: PublicCollection;
  items: PublicItem[];
}
/** An invite link's page (R1): who invites, the context they chose to show, their line. */
export interface PublicInvite {
  kind: 'invite';
  token: string;
  displayName: string;
  avatarUrl: string | null;
  context: string | null;
  note: string | null;
}
export type PublicPage =
  | { kind: 'landing' }
  /** A page of the site about Caime (site-pages.ts): everyone's, signed in or not. */
  | { kind: 'site'; page: MarketingPage }
  | PublicPerson
  | PublicOrg
  | PublicItemPage
  | PublicCollectionPage
  | PublicInvite
  | { kind: 'missing' }
  | { kind: 'app' }
  /**
   * The app's way in for a visitor (welcome, sign-in, sign-up): the screen's words and shape,
   * painted before its scripts run, and replaced by the screen itself the moment the app mounts.
   */
  | { kind: 'entry'; screen: EntryScreen };

export type EntryScreen = 'welcome' | 'sign-in' | 'sign-up';
export const ENTRY_SCREENS: readonly EntryScreen[] = ['welcome', 'sign-in', 'sign-up'];

/** An open organization's public face, by handle. */
export async function publicOrg(db: Q, handle: string): Promise<PublicOrg | null> {
  const o = await db
    .selectFrom('organizations')
    .selectAll()
    .where('handle', '=', handle)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!o) return null;
  return {
    kind: 'org',
    org: orgRef(o),
    about: o.about,
    website: o.website,
    country: o.country,
    foundedYear: o.founded_year,
    updatedAt: o.updated_at,
    ...publicCatalog(o),
    pays: publicPays(o),
  };
}

/**
 * A person's public face, by handle: only while they can be found by handle and are 18 or over,
 * and only the fields whose audience is everyone.
 */
export async function publicPerson(db: Q, handle: string, now: Date): Promise<PublicPerson | null> {
  const u = await db
    .selectFrom('users')
    .selectAll()
    .where('handle', '=', handle)
    .where('deleted_at', 'is', null)
    .where('suspended_at', 'is', null)
    .where('kind', 'in', ['human', 'assistant', 'character'])
    .executeTakeFirst();
  if (!u || minorOf(u, now)) return null;
  const own = systemAccountOf(u.id);
  const privacy = privacyOf(u, now);
  if (!privacy.discoverByHandle) return null;
  const see = (field: Parameters<typeof canSee>[1]) => canSee(privacy, field, NOBODY);
  // The headline and the organizations are two reads that need only the person: together.
  const [identity, organizations] = see('identityDetails')
    ? await Promise.all([
        db
          .selectFrom('identities')
          .select(['headline'])
          .where('user_id', '=', u.id)
          .where('is_default', '=', true)
          .executeTakeFirst(),
        orgsOf(db, u.id),
      ])
    : [null, []];
  return {
    kind: 'person',
    id: u.id,
    handle: u.handle,
    displayName: u.display_name,
    avatarUrl: see('profilePhoto') ? avatarUrl(u) : null,
    bio: own ? tr(own.about) : see('bio') ? u.bio : null,
    headline: identity?.headline ?? null,
    organizations,
    ...publicCatalog(u),
    pays: publicPays(u),
    system: own?.kind ?? null,
  };
}

/**
 * An invite's page, while it's live and its maker is here: the maker's name (they handed the
 * link out), their face only if everyone may see it, and what they chose to show.
 */
export async function publicInvite(db: Q, token: string, now: Date): Promise<PublicInvite | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const i = await db
    .selectFrom('invites')
    .selectAll()
    .where('token', '=', token)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirst();
  if (!i) return null;
  const u = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', i.user_id)
    .where('deleted_at', 'is', null)
    .where('suspended_at', 'is', null)
    .where('kind', '=', 'human')
    .executeTakeFirst();
  if (!u) return null;
  const sphere = i.context_sphere ? SPHERE_DEFS[i.context_sphere as Sphere]?.label : null;
  return {
    kind: 'invite',
    token,
    displayName: u.display_name,
    avatarUrl: canSee(privacyOf(u, now), 'profilePhoto', NOBODY) ? avatarUrl(u) : null,
    context: sphere ? [sphere, i.context_org_name].filter(Boolean).join(' · ') : null,
    note: i.note,
  };
}

/** The page a path is, for whoever isn't signed in. */
export async function publicPageFor(db: Q, path: string, now: Date): Promise<PublicPage> {
  if (path === '/') return { kind: 'landing' };
  const site = /^\/([a-z]+)$/.exec(path)?.[1];
  if (site && (MARKETING_PAGES as readonly string[]).includes(site))
    return { kind: 'site', page: site as MarketingPage };
  const invite = /^\/i\/([^/?#]+)$/.exec(path);
  if (invite) return (await publicInvite(db, invite[1] ?? '', now)) ?? { kind: 'missing' };
  const at = /^\/@([^/?#]+)(?:\/([^/?#]+))?$/.exec(path);
  const org = /^\/o\/([^/?#]+)(?:\/([^/?#]+))?$/.exec(path);
  const raw = safeDecode((at ?? org)?.[1] ?? '');
  // An item's or a collection's address under the host's (R61).
  const slug = (at ?? org)?.[2] ? safeDecode((at ?? org)?.[2] ?? '') : null;
  if (!raw) {
    const entry = /^\/([a-z-]+)$/.exec(path)?.[1];
    if (entry && (ENTRY_SCREENS as readonly string[]).includes(entry))
      return { kind: 'entry', screen: entry as EntryScreen };
    return { kind: 'app' };
  }
  const handle = normalizeHandle(raw);
  if (handleError(handle)) return { kind: 'missing' };
  // One namespace: @handle may be an organization's; /o/ is only ever an organization's. For
  // @handle both are looked up at once (one of them misses, cheaply), so a person's page, the
  // common one, doesn't wait a round trip on the organization's miss first.
  if (org) {
    const o = await publicOrg(db, handle);
    if (!o) return slug ? { kind: 'app' } : { kind: 'missing' };
    return slug ? (shelfPage(o, slug) ?? { kind: 'app' }) : o;
  }
  const [o, person] = await Promise.all([publicOrg(db, handle), publicPerson(db, handle, now)]);
  const host = o ?? person;
  if (!host) return { kind: 'missing' };
  return slug ? (shelfPage(host, slug) ?? { kind: 'missing' }) : host;
}

/** `%D9%82…` as the letters it is; junk as nothing. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

/**
 * What an address under a host is (R61): a public item or a public collection, or nothing. Under
 * an organization, anything else is the app's own screen (`/o/<handle>/setup`), never a 404.
 */
function shelfPage(
  host: PublicPerson | PublicOrg,
  slug: string,
): PublicItemPage | PublicCollectionPage | null {
  const found = bySlug(host.items, host.collections, slug);
  if (!found) return null;
  if (found.kind === 'item') return { kind: 'item', host, item: found.item };
  return {
    kind: 'collection',
    host,
    collection: found.collection,
    items: host.items.filter((i) => i.collectionId === found.collection.id),
  };
}

function entryTitle(screen: EntryScreen): string {
  return screen === 'welcome'
    ? tr('Welcome to Caime')
    : screen === 'sign-in'
      ? tr('Welcome back')
      : tr('Create your account');
}

/** A field as the app draws one, waiting for the app: its label, an empty box and its hint. */
const field = (label: string, type = 'text', hint?: string) =>
  `<label class="field"><span>${esc(label)}</span><input type="${type}" disabled aria-disabled="true">${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;

/**
 * The entry screens as the app paints them, in HTML the browser paints first (R44): the same
 * words (`tr`, in the request's language), the same shape, so the swap is invisible. The
 * buttons that are links work before the app does; a form waits for it.
 */
/** A sentence with its links marked (core `tagged`), written as HTML: each tag a link to its path. */
function linked(sentence: string, hrefs: Record<string, string>): string {
  return tagged(sentence)
    .map((p) =>
      typeof p === 'string'
        ? esc(p)
        : hrefs[p.tag]
          ? `<a href="${hrefs[p.tag]}">${esc(p.text)}</a>`
          : esc(p.text),
    )
    .join('');
}

/** The wordmark as the app's `Wordmark` draws it: brand's paths, in the scheme's colour. */
function wordmark(height: number): string {
  const width = Math.round((WORDMARK.width / WORDMARK.height) * height);
  return `<svg class="mark" role="img" aria-label="${esc(tr('Caime'))}" width="${width}" height="${height}" viewBox="${WORDMARK.viewBox}"><path class="mark-letters" d="${WORDMARK.letters}"/><path class="mark-heart" d="${HEART_PATH}" transform="${WORDMARK.heartTransform}"/></svg>`;
}

/** A Caime Friend as the app's `Character` draws one (brand's own drawing), for the eye alone. */
const friend = (name: Character, size: number, expression: Expression) =>
  `<span class="friend" aria-hidden="true">${characterSvg(name, { size, expression, accents: true, detail: size >= 48 })}</span>`;

/** The app's `BrandPanel`: the desktop's other half beside every entry screen. */
function brandPanel(): string {
  return `<aside class="brand-panel">
    <div class="friends">${friend('momo', 104, 'excited')}${friend('caishy', 176, 'happy')}${friend('niko', 104, 'wink')}</div>
    <div class="brand-words">${wordmark(46)}
      <p class="mono">${esc(tr('messaging that understands your relationships'))}</p>
      <p class="title">${esc(tr('Family, friends and work, each in its place.'))}</p>
      <p class="lead">${esc(tr('The right conversations find you, and the rest wait politely. How you label someone is only ever yours.'))}</p>
    </div>
  </aside>`;
}

/** `AuthLayout`'s top row: the way back and, on a phone, the wordmark. */
const bar = () =>
  `<div class="bar"><a class="back" href="/welcome" aria-label="${esc(tr('Back'))}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg></a><span class="bar-mark">${wordmark(24)}</span></div>`;

/** `AuthLayout`'s heading: the kicker, the title and what it's for. */
const head = (kicker: string, title: string, lead: string) =>
  `<div class="head"><p class="mono">${esc(sentence(kicker))}</p><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p></div>`;

/**
 * Each entry screen as the app draws it, before the app runs (CLAUDE.md, the entry screens): the
 * same words in the same places on a phone and beside the brand panel on a desktop, so nothing
 * moves when the app takes over.
 */
function entryBody(screen: EntryScreen): string {
  const dir = currentTranslator().dir;
  const spec = `<dl class="spec">
    <div>${label(tr('Connection'))}<dd>${esc(tr('Say who someone is to you, once. Everything fits from then on.'))}</dd></div>
    <div>${label(tr('Attention'))}<dd>${esc(tr('“3 need you”, never “47 unread”. It says why.'))}</dd></div>
    <div>${label(tr('Privacy'))}<dd>${esc(tr('Each side of your life sees what you chose. Only you see your labels.'))}</dd></div>
  </dl>`;
  if (screen === 'welcome') {
    const actions = `<div class="actions">
      <p class="cta"><a href="/sign-up">${esc(tr('Create your account'))}</a><a href="/sign-in" class="quiet">${esc(tr('I already have an account'))}</a></p>
      <p class="note">${esc(tr('Free for people. Private by design: how you label someone is only ever yours.'))}</p>
    </div>`;
    return `
<main class="pub-entry welcome" dir="${dir}" aria-busy="true">
  ${brandPanel()}
  <section class="pane phone">
    <div class="hero">${friend('caishy', 176, 'happy')}${wordmark(44)}
      <div class="words"><h1 class="title">${esc(tr('Messaging that understands your relationships.'))}</h1>
        <p class="lead">${esc(tr('Family, friends and work, each in its place. The right conversations find you.'))}</p>
        ${spec}
      </div>
    </div>
    ${actions}
  </section>
  <section class="pane desk">
    <div class="head"><p class="mono">${esc(sentence(tr('welcome')))}</p><h1>${esc(tr('Welcome to Caime'))}</h1>
      <p class="lead">${esc(tr('One place for everyone you talk to, and it knows the difference between your mum, your manager and your plumber.'))}</p>
      ${spec}
    </div>
    ${actions}
  </section>
</main>`;
  }
  const form =
    screen === 'sign-in'
      ? `${head(tr('sign in'), tr('Welcome back'), tr('Sign in with your email or @handle.'))}
    <form class="form" aria-disabled="true">
      <div class="fields">${field(tr('Email or handle'))}${field(tr('Password'), 'password')}</div>
      <button type="button" disabled>${esc(tr('Sign in'))}</button>
    </form>
    <div class="links">
      <p class="small"><a href="/forgot">${esc(tr('Forgot your password?'))}</a></p>
      <p class="small">${esc(tr('New here?'))} <a href="/sign-up">${esc(tr('Create an account'))}</a></p>
    </div>`
      : `${head(tr('new account'), tr('Create your account'), tr('It takes a minute. You can change all of it later.'))}
    <form class="form" aria-disabled="true">
      <div class="fields">
        ${field(tr('Your name'), 'text', tr('How people see you. Use any name you like.'))}
        ${field(tr('Handle'), 'text', tr('People can find you by it. Letters, numbers, dots or underscores.'))}
        ${field(tr('Email'), 'email', tr('For signing in. Hidden from others unless you choose otherwise.'))}
        ${field(tr('Password'), 'password', tr('At least 10 characters. A short sentence works well.'))}
        ${field(tr('Date of birth'), 'text', tr('Only to keep younger people safer, from the day you turn 18. Never shown to anyone.'))}
        ${field(tr('Where you live'), 'text', tr('Sets your defaults, like your work week and the currency of amounts. Never shown to anyone.'))}
      </div>
      <button type="button" disabled>${esc(tr('Create account'))}</button>
    </form>
    <p class="terms">${linked(tr('By creating an account, you agree to the <terms>terms</terms>. The <privacy>privacy policy</privacy> says what Caime keeps, and why.'), { terms: '/terms', privacy: '/privacy' })}</p>
    <p class="small">${esc(tr('Already have an account?'))} <a href="/sign-in">${esc(tr('Sign in'))}</a></p>`;
  return `
<main class="pub-entry" dir="${dir}" aria-busy="true">
  ${brandPanel()}
  <section class="pane"><div class="scroll"><div class="col">${bar()}
    ${form}
  </div></div></section>
</main>`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export { PROMISE, SITE_NAME };

interface Rendered {
  status: number;
  head: string;
  body: string;
  /** The language the page was written in, for the shell's `<html>` (the site's pages, R54). */
  lang?: InterfaceLanguage;
}

/** The head tags and the plain body for a page, and the status it deserves. */
export function renderPublic(
  page: PublicPage,
  publicUrl: string,
  path: string,
  facts: SiteFacts | null = null,
): Rendered {
  const url = `${publicUrl}${path === '/' ? '/' : path}`;
  const meta = (o: {
    title: string;
    description: string;
    image: string | null;
    index: boolean;
    ld?: object;
    canonical?: boolean;
    /** A page of the site: readable in each language, the English its canonical (R54). */
    alternates?: boolean;
  }) =>
    [
      `<title>${esc(o.title)}</title>`,
      `<meta name="description" content="${esc(o.description)}">`,
      o.index
        ? '<meta name="robots" content="index,follow">'
        : '<meta name="robots" content="noindex">',
      o.canonical === false ? '' : `<link rel="canonical" href="${esc(url)}">`,
      ...(o.alternates
        ? [
            `<link rel="alternate" hreflang="x-default" href="${esc(url)}">`,
            ...INTERFACE_LANGUAGES.map(
              (l) =>
                `<link rel="alternate" hreflang="${l}" href="${esc(l === 'en' ? url : `${url}?lang=${l}`)}">`,
            ),
            `<meta property="og:locale" content="${OG_LOCALE[currentTranslator().language]}">`,
          ]
        : []),
      // Which page this is, for the app: it stays out of a visitor's way on a person's or an
      // organization's page only (R44).
      `<meta name="caime-page" content="${page.kind}">`,
      `<meta property="og:site_name" content="${SITE_NAME}">`,
      `<meta property="og:type" content="${page.kind === 'person' ? 'profile' : 'website'}">`,
      `<meta property="og:title" content="${esc(o.title)}">`,
      `<meta property="og:description" content="${esc(o.description)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      // A page with no picture of its own shows Caime's card (R70: 1200 x 630, made with the
      // icons); a face or a logo is square, an item's photo wide.
      `<meta property="og:image" content="${esc(o.image ?? `${publicUrl}/og-card.png`)}">`,
      o.image
        ? ''
        : `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="${SITE_NAME}">`,
      `<meta name="twitter:card" content="${o.image && page.kind !== 'item' ? 'summary' : 'summary_large_image'}">`,
      `<meta name="twitter:title" content="${esc(o.title)}">`,
      `<meta name="twitter:description" content="${esc(o.description)}">`,
      o.ld
        ? `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, '\\u003c')}</script>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  switch (page.kind) {
    case 'landing': {
      const home = renderLanding(facts);
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: home.title,
          description: home.description,
          image: null,
          index: true,
          alternates: true,
          ld: {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: SITE_NAME,
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web, iOS, Android',
            description: home.description,
            url: publicUrl,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          },
        }),
        body: home.body,
      };
    }
    case 'site': {
      const site = renderSite(
        page.page,
        facts ?? {
          legalName: SITE_NAME,
          contactEmail: `hello@${new URL(publicUrl).hostname}`,
          prices: null,
        },
      );
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: site.title,
          description: site.description,
          image: null,
          index: true,
          alternates: true,
        }),
        body: site.body,
      };
    }
    case 'person': {
      const line = [page.headline, page.organizations[0]?.name].filter(Boolean).join(' · ');
      const description = clip(
        page.bio ?? line ?? tr('{name} is on {site}.', { name: page.displayName, site: SITE_NAME }),
        200,
      );
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: `${page.displayName} (@${page.handle}) · ${SITE_NAME}`,
          description,
          image: page.avatarUrl ? `${publicUrl}${page.avatarUrl}` : null,
          index: true,
          ld: {
            '@context': 'https://schema.org',
            // Cai is software; a Caime Friend is a character: neither is a person (R67).
            '@type':
              page.system === 'assistant'
                ? 'SoftwareApplication'
                : page.system === 'character'
                  ? 'Thing'
                  : 'Person',
            name: page.displayName,
            identifier: `@${page.handle}`,
            url,
            ...(page.avatarUrl ? { image: `${publicUrl}${page.avatarUrl}` } : {}),
            ...(page.bio ? { description: page.bio } : {}),
            ...(page.headline ? { jobTitle: page.headline } : {}),
            ...(page.organizations.length
              ? {
                  memberOf: page.organizations.map((o) => ({
                    '@type': 'Organization',
                    name: o.name,
                    url: `${publicUrl}/o/${o.handle}`,
                  })),
                }
              : {}),
          },
        }),
        body: `
<main class="pub pub-sheet" ${langAttrs()}>
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono">${esc(page.system === 'assistant' ? tr('Caime’s assistant') : page.system === 'character' ? tr('Caime Friend') : tr('a person on {site}', { site: SITE_NAME }))}</span></header>
  ${page.avatarUrl ? `<img class="face" src="${esc(page.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(page.displayName)}</h1>
  ${page.bio ? `<p class="lead">${esc(page.bio)}</p>` : ''}
  <dl class="spec">
    <div>${label(tr('handle'))}<dd>@${esc(page.handle)}</dd></div>
    ${page.headline ? `<div>${label(tr('headline'))}<dd>${esc(page.headline)}</dd></div>` : ''}
    ${page.organizations.length ? `<div>${label(tr('with'))}<dd>${page.organizations.map((o) => `<a href="/o/${esc(o.handle)}">${esc(o.name)}</a>`).join(', ')}</dd></div>` : ''}
    ${itemRows(page)}
    ${payRow(page)}
  </dl>
  <p class="cta">${bookLink(page.items, `/@${page.handle}`, page.displayName)}${payLink(page, `/@${page.handle}`, page.items.length > 0)}<a href="${wayIn('sign-up', path)}"${page.items.length || page.pays.length ? ' class="quiet"' : ''}>${esc(tr('Message {name} on {site}', { name: page.displayName, site: SITE_NAME }))}</a> <a href="${wayIn('sign-in', path)}" class="quiet">${esc(tr('Sign in'))}</a></p>
</main>`,
      };
    }
    case 'org': {
      const o = page.org;
      const facts = [
        o.verified && o.verifiedDomain
          ? tr('Verified · {domain}', { domain: o.verifiedDomain })
          : null,
        page.foundedYear ? tr('Since {year}', { year: page.foundedYear }) : null,
      ].filter(Boolean);
      const description = clip(
        page.about ??
          `${tr('{name} is on {site}.', { name: o.name, site: SITE_NAME })} ${facts.join(' · ')}`.trim(),
        200,
      );
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: `${o.name} (@${o.handle}) · ${SITE_NAME}`,
          description,
          image: o.avatarUrl ? `${publicUrl}${o.avatarUrl}` : null,
          index: true,
          ld: {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: o.name,
            identifier: `@${o.handle}`,
            url,
            ...(page.website ? { sameAs: [page.website] } : {}),
            ...(o.avatarUrl ? { logo: `${publicUrl}${o.avatarUrl}` } : {}),
            ...(page.about ? { description: page.about } : {}),
            ...(page.foundedYear ? { foundingDate: String(page.foundedYear) } : {}),
          },
        }),
        body: `
<main class="pub pub-sheet" ${langAttrs()}>
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono">${esc(tr('an organization on {site}', { site: SITE_NAME }))}</span></header>
  ${o.avatarUrl ? `<img class="mark" src="${esc(o.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(o.name)}</h1>
  ${page.about ? `<p class="lead">${esc(page.about)}</p>` : ''}
  <dl class="spec">
    <div>${label(tr('handle'))}<dd>@${esc(o.handle)}</dd></div>
    <div>${label(tr('verified'))}<dd>${
      o.verified && o.verifiedDomain
        ? esc(tr('{domain}, proved with a DNS record', { domain: o.verifiedDomain }))
        : esc(tr('Not yet'))
    }</dd></div>
    ${page.foundedYear ? `<div>${label(tr('since'))}<dd>${page.foundedYear}</dd></div>` : ''}
    ${page.website ? `<div>${label(tr('website'))}<dd><a href="${esc(page.website)}" rel="noopener">${esc(page.website.replace(/^https?:\/\//, ''))}</a></dd></div>` : ''}
    ${itemRows(page)}
    ${payRow(page)}
  </dl>
  <p class="cta">${bookLink(page.items, `/o/${o.handle}`, o.name)}${payLink(page, `/o/${o.handle}`, page.items.length > 0)}<a href="${wayIn('sign-up', doorPath(o.handle))}"${page.items.length || page.pays.length ? ' class="quiet"' : ''}>${esc(tr('Message {name} on {site}', { name: o.name, site: SITE_NAME }))}</a> <a href="${wayIn('sign-in', doorPath(o.handle))}" class="quiet">${esc(tr('Sign in'))}</a></p>
</main>`,
      };
    }
    case 'item': {
      const { host, item } = page;
      const name = hostName(host);
      const shelf = host.collections.find((c) => c.id === item.collectionId) ?? null;
      const description = clip(
        item.description ?? `${item.name} · ${itemLine(item)} · ${name}`,
        200,
      );
      const photo = photoOf(host, item);
      const image = photo ?? (host.kind === 'org' ? host.org.avatarUrl : host.avatarUrl);
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: `${item.name} · ${name} · ${SITE_NAME}`,
          description,
          image: image ? `${publicUrl}${image}` : null,
          index: true,
          ld: {
            ...itemLd(host, item, url, publicUrl),
            breadcrumb: breadcrumbLd([
              { name, url: `${publicUrl}${hostPath(host)}` },
              ...(shelf
                ? [{ name: shelf.name, url: `${publicUrl}${shelfPath(host, shelf.slug)}` }]
                : []),
              { name: item.name, url },
            ]),
          },
        }),
        body: `
<main class="pub pub-sheet" ${langAttrs()}>
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono"><a href="${esc(hostPath(host))}">${esc(name)}</a>${shelf ? ` · <a href="${esc(shelfPath(host, shelf.slug))}">${esc(shelf.name)}</a>` : ''}</span></header>
  ${photo ? `<img class="photo" src="${esc(photo)}" alt="${esc(item.name)}" width="320" height="320">` : ''}
  <h1>${esc(item.name)}</h1>
  ${item.description ? `<p class="lead">${esc(item.description)}</p>` : ''}
  <dl class="spec">
    <div>${label(tr('from'))}<dd><a href="${esc(hostPath(host))}">${esc(name)}</a></dd></div>
    <div>${label(item.unit === 'each' ? tr('price') : tr('booking'))}<dd>${esc(itemLine(item))}</dd></div>
  </dl>
  <p class="cta">${bookLink([item], path, name, true)}<a href="${wayIn('sign-in', item.unit === 'each' ? orderPath(path) : bookPath(path))}" class="quiet">${esc(tr('Sign in'))}</a></p>
</main>`,
      };
    }
    case 'collection': {
      const { host, collection, items } = page;
      const name = hostName(host);
      const image = host.kind === 'org' ? host.org.avatarUrl : host.avatarUrl;
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: `${collection.name} · ${name} · ${SITE_NAME}`,
          description: clip(collection.description ?? items.map((i) => i.name).join(', '), 200),
          image: image ? `${publicUrl}${image}` : null,
          index: true,
          ld: {
            '@context': 'https://schema.org',
            '@type': 'OfferCatalog',
            name: collection.name,
            url,
            ...(collection.description ? { description: collection.description } : {}),
            // Each offer with what it offers, as schema.org's catalog of offers reads.
            itemListElement: items.map((i) => {
              const {
                '@context': _,
                offers,
                ...offered
              } = itemLd(host, i, `${publicUrl}${shelfPath(host, i.slug)}`, publicUrl);
              return { ...offers, itemOffered: offered };
            }),
            breadcrumb: breadcrumbLd([
              { name, url: `${publicUrl}${hostPath(host)}` },
              { name: collection.name, url },
            ]),
          },
        }),
        body: `
<main class="pub pub-sheet" ${langAttrs()}>
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono"><a href="${esc(hostPath(host))}">${esc(name)}</a></span></header>
  <h1>${esc(collection.name)}</h1>
  ${collection.description ? `<p class="lead">${esc(collection.description)}</p>` : ''}
  <dl class="spec">
    <div>${label(tr('from'))}<dd><a href="${esc(hostPath(host))}">${esc(name)}</a></dd></div>
    ${itemRows({ ...host, collections: [] }, items)}
  </dl>
  <p class="cta">${bookLink(items, hostPath(host), name)}</p>
</main>`,
      };
    }
    case 'entry':
      return {
        status: 200,
        head: meta({
          title: `${entryTitle(page.screen)} · ${SITE_NAME}`,
          description: LANDING_DESCRIPTION,
          image: null,
          index: false,
          canonical: false,
        }),
        body: entryBody(page.screen),
      };
    case 'invite':
      return {
        status: 200,
        lang: currentTranslator().language,
        head: meta({
          title: `${tr('{name} invited you', { name: page.displayName })} · ${SITE_NAME}`,
          description: tr(
            'Join {name} on {site}{context}: sign up in half a minute and you’re connected.',
            {
              name: page.displayName,
              site: SITE_NAME,
              context: page.context ? ` (${page.context})` : '',
            },
          ),
          image: page.avatarUrl ? `${publicUrl}${page.avatarUrl}` : null,
          index: false,
          canonical: false,
        }),
        body: `
<main class="pub pub-sheet" ${langAttrs()}>
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono">${esc(tr('an invitation'))}</span></header>
  ${page.avatarUrl ? `<img class="face" src="${esc(page.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(tr('{name} invited you', { name: page.displayName }))}</h1>
  ${page.note ? `<p class="lead">“${esc(page.note)}”</p>` : ''}
  <dl class="spec">
    <div>${label(tr('from'))}<dd>${esc(page.displayName)}</dd></div>
    ${page.context ? `<div>${label(tr('about'))}<dd>${esc(page.context)}</dd></div>` : ''}
    <div>${label(tr('to join'))}<dd>${esc(tr('Sign up in half a minute and you’re connected with {name}, no app to install.', { name: page.displayName }))}</dd></div>
    <div>${label(SITE_NAME)}<dd>${esc(tr(PROMISE))}</dd></div>
  </dl>
  <p class="cta"><a href="${wayIn('sign-up', path)}">${esc(tr('Join {name} on {site}', { name: page.displayName, site: SITE_NAME }))}</a> <a href="${wayIn('sign-in', path)}" class="quiet">${esc(tr('Sign in'))}</a></p>
</main>`,
      };
    case 'missing':
      return {
        status: 404,
        lang: currentTranslator().language,
        head: meta({
          title: `${tr('Not here')} · ${SITE_NAME}`,
          description: tr('Nobody by that handle.'),
          image: null,
          index: false,
          canonical: false,
        }),
        body: `
<main class="pub pub-sheet" ${langAttrs()}>
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono">${esc(tr('not here'))}</span></header>
  <h1>${esc(tr('Nobody by that handle'))}</h1>
  <p class="lead">${esc(tr('It may have changed, or been let go of.'))}</p>
  <p class="cta"><a href="/">${esc(tr('Open {site}', { site: SITE_NAME }))}</a></p>
</main>`,
      };
    default:
      return {
        status: 200,
        head: meta({
          title: SITE_NAME,
          description: PROMISE,
          image: null,
          index: false,
          canonical: false,
        }),
        body: '',
      };
  }
}

/** The plain pages' look, in the brand's ink and pink; gone the moment the app renders. */
export /**
 * A visitor's way in from someone's page: sign-up or sign-in, carrying the page as `?link=` so
 * the app brings them back to it, and counts the invite for whoever it was (state/pendingLink.ts).
 */
const wayIn = (to: 'sign-up' | 'sign-in', path: string) =>
  `/${to}?link=${encodeURIComponent(path)}`;

/**
 * An organization's door (R53): its page asking to be written to, so whoever signs in or up
 * from it lands in the conversation, as an invite's guest does, with nothing more to tap.
 */
export const doorPath = (handle: string) => `/o/${handle}?write`;
/** A link that books (R58): the page's path with `?book`, which the app opens on the card's form. */
export const bookPath = (pagePath: string) => `${pagePath}?book`;
/** A link that orders (R60): the page's path with `?order`, which opens the Order card's form. */
export const orderPath = (pagePath: string) => `${pagePath}?order`;
/** A link that pays (R62): the page's path with `?pay`, which opens the Pay card's form. */
export const payPath = (pagePath: string) => `${pagePath}?pay`;

/** "Bank transfer, Cash": how anyone may pay a host, as a spec row; never an account. */
function payRow(host: PublicPerson | PublicOrg): string {
  if (!host.pays.length) return '';
  return `<div>${label(tr('pays by'))}<dd>${esc(
    host.pays.map((k) => tr(PAYMENT_KIND_LABELS[k])).join(', '),
  )}</dd></div>`;
}

/** Pay, after Book and Order, where anyone may pay the host. */
function payLink(host: PublicPerson | PublicOrg, pagePath: string, quiet: boolean): string {
  if (!host.pays.length) return '';
  return `<a href="${wayIn('sign-up', payPath(pagePath))}"${quiet ? ' class="quiet"' : ''}>${esc(tr('Pay {name}', { name: hostName(host) }))}</a> `;
}

/** "45 min · EGP 200": what an item is, in a line (R58). */
function itemLine(i: PublicItem): string {
  return [
    i.unit === 'minutes' && i.minutes
      ? tr('{m} min', { m: i.minutes })
      : i.unit === 'days'
        ? tr('per day')
        : null,
    i.price
      ? formatAmount(i.price.value, i.price.currency, currentTranslator().language)
      : tr('Free'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The host's own path: `/o/<handle>` or `/@<handle>`. */
export const hostPath = (host: PublicPerson | PublicOrg) =>
  host.kind === 'org' ? `/o/${host.org.handle}` : `/@${host.handle}`;
/** An item's photo on its host (R63), as the app and every page address it. */
const photoOf = (host: PublicPerson | PublicOrg, item: PublicItem) =>
  itemPhotoPath(
    {
      kind: host.kind === 'org' ? 'org' : 'person',
      id: host.kind === 'org' ? host.org.id : host.id,
    },
    item,
  );
const hostName = (host: PublicPerson | PublicOrg) =>
  host.kind === 'org' ? host.org.name : host.displayName;
/** An item's or a collection's page (R61), under the host's. */
export const shelfPath = (host: PublicPerson | PublicOrg, slug: string) =>
  `${hostPath(host)}/${encodeURIComponent(slug)}`;

/**
 * The public items as spec rows (R58), each a link to its own page (R61), and the collections
 * they're on, each with its page.
 */
function itemRows(host: PublicPerson | PublicOrg, items: PublicItem[] = host.items): string {
  if (items.length === 0) return '';
  const shelves = host.collections.length
    ? `<div>${label(tr('collections'))}<dd>${host.collections
        .map((c) => `<a href="${esc(shelfPath(host, c.slug))}">${esc(c.name)}</a>`)
        .join(' · ')}</dd></div>`
    : '';
  return `${shelves}<div>${label(tr('offers'))}<dd>${items
    .map(
      (i) =>
        `<a href="${esc(shelfPath(host, i.slug))}">${esc(i.name)}</a> <span class="small">${esc(itemLine(i))}</span>`,
    )
    .join('<br>')}</dd></div>`;
}

/** What an item is to an answer engine (R61): a product sold or a service booked, its offer. */
function itemLd(host: PublicPerson | PublicOrg, item: PublicItem, url: string, publicUrl: string) {
  const seller =
    host.kind === 'org'
      ? { '@type': 'Organization', name: host.org.name, url: `${publicUrl}${hostPath(host)}` }
      : { '@type': 'Person', name: host.displayName, url: `${publicUrl}${hostPath(host)}` };
  return {
    '@context': 'https://schema.org',
    '@type': item.unit === 'each' ? 'Product' : 'Service',
    name: item.name,
    url,
    ...(photoOf(host, item) ? { image: `${publicUrl}${photoOf(host, item)}` } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.unit === 'each' ? { brand: seller } : { provider: seller }),
    offers: {
      '@type': 'Offer',
      url,
      price: String(item.price?.value ?? 0),
      priceCurrency: item.price?.currency ?? 'USD',
      availability: 'https://schema.org/InStock',
      seller,
    },
  };
}

/** The way back up, for a crawler: the host, then the collection, then the page. */
function breadcrumbLd(trail: Array<{ name: string; url: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, n) => ({
      '@type': 'ListItem',
      position: n + 1,
      name: t.name,
      item: t.url,
    })),
  };
}

/**
 * The calls to action, first, for what's public: Book when anything is booked in time, Order
 * when anything is ordered by the piece (R60).
 */
function bookLink(items: PublicItem[], pagePath: string, name: string, own = false): string {
  // One item on its own page (R61): its own verb, without a name to repeat.
  if (own && items.length === 1) {
    const verb = items[0]?.unit === 'each' ? tr('Order') : tr('Book');
    const to = items[0]?.unit === 'each' ? orderPath(pagePath) : bookPath(pagePath);
    return `<a href="${wayIn('sign-up', to)}">${esc(verb)}</a> `;
  }
  const out: string[] = [];
  if (items.some((i) => i.unit !== 'each'))
    out.push(
      `<a href="${wayIn('sign-up', bookPath(pagePath))}">${esc(tr('Book {name}', { name }))}</a> `,
    );
  if (items.some((i) => i.unit === 'each'))
    out.push(
      `<a href="${wayIn('sign-up', orderPath(pagePath))}"${out.length ? ' class="quiet"' : ''}>${esc(tr('Order from {name}', { name }))}</a> `,
    );
  return out.join('');
}

const PUBLIC_STYLE = `
<style id="pub-style">
#root:empty{display:none}
#root:not(:empty)~#static{display:none}html[data-visitor] #root{display:none!important}html[data-visitor] #static{display:block!important}html[data-visitor] body{overflow:auto!important}
body:has(#root:empty){overflow:auto}
${THEME_VARS}
body{margin:0}
#static{font-family:${FACE.body};color:var(--text);background:var(--canvas);min-height:100%}
.pub{max-width:640px;margin:0 auto;padding:48px 20px 64px;line-height:1.5}
.pub h1{font-size:2rem;line-height:1.15;margin:0 0 8px;color:var(--ink)}
.pub .lead{font-size:1.15rem;color:var(--text-secondary);margin:0 0 20px}
.pub ul{padding-inline-start:20px}.pub li{margin:8px 0}
.pub .cta a{display:inline-block;background:var(--primary);color:var(--on-primary);text-decoration:none;border-radius:${px.radius('pill')};padding:12px 22px;font-weight:600;margin:12px 8px 0 0}
.pub .cta a.quiet{background:var(--surface-muted);color:var(--text)}
.pub .small{color:var(--text-secondary);font-size:.9rem}.pub a{color:var(--link)}
.pub img.face{border-radius:50%}.pub img.mark{border-radius:28px}.pub img.photo{border-radius:20px;max-width:100%;height:auto;object-fit:cover}
.pub-sheet{font-family:${FACE.body};color:var(--text)}.pub-sheet h1{font-size:2rem;font-weight:800;margin:14px 0 6px;color:var(--ink)}.pub-sheet .masthead{margin-bottom:8px}.pub-sheet .wordmark{text-decoration:none}.pub-sheet .spec{margin:14px 0 6px}
.pub-home{max-width:840px;font-family:${FACE.body};color:var(--text)}
.pub .mono{${type('mono')};color:var(--text-tertiary)}.pub-home h2.mono{${type('overline')}}
.pub-entry{display:flex;min-height:100vh;font-family:${FACE.body};color:var(--text);background:var(--canvas)}
.pub-entry p,.pub-entry h1,.pub-entry dl{margin:0}
.pub-entry .mono{${type('mono')};color:var(--text-tertiary)}
.pub-entry .lead{${type('body')};color:var(--text-secondary)}
.pub-entry .mark-letters{fill:var(--wordmark)}.pub-entry .mark-heart{fill:var(--accent)}.pub-entry .friend{display:inline-flex}
.pub-entry .pane{flex:1;display:flex;flex-direction:column;min-width:0}
.pub-entry .scroll{flex:1;display:flex;flex-direction:column;padding:8px 20px 20px}.pub-entry .col{width:100%;max-width:420px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.pub-entry .bar{display:flex;align-items:center;min-height:48px;margin-inline-start:-8px}
.pub-entry .back{display:grid;place-items:center;width:${px.touch};height:${px.touch};color:var(--text-secondary)}
.pub-entry .bar-mark{flex:1;display:flex;justify-content:center;margin-inline-end:44px}
.pub-entry .head{display:flex;flex-direction:column;gap:6px}
.pub-entry h1{${type('display')};color:var(--text)}
.pub-entry .spec{border-top:1px solid var(--border)}.pub-entry .spec>div{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--border)}.pub-entry .spec dt{width:96px;flex:none;padding-top:2px}.pub-entry .spec dd{flex:1;margin:0;${type('caption')};color:var(--text-secondary)}
.pub-entry .form{display:flex;flex-direction:column;gap:20px}.pub-entry .fields{display:flex;flex-direction:column;gap:14px}.pub-entry .field .hint{${type('caption')};color:var(--text-tertiary)}.pub-entry .links{display:flex;flex-direction:column;align-items:center;gap:4px}
.pub-entry .field{display:flex;flex-direction:column;gap:6px;${type('captionStrong')};color:var(--text-secondary)}
.pub-entry .field input{box-sizing:border-box;height:${px.height('field')};border:1px solid var(--border);border-radius:${px.radius('md')};background:var(--surface);padding:0 14px;${type('message')};color:var(--text)}
.pub-entry button,.pub-entry .cta a{display:block;width:100%;box-sizing:border-box;height:${px.height('lg')};text-align:center;border:0;border-radius:${px.radius('pill')};background:var(--primary);color:var(--on-primary);${type('label')};line-height:${px.height('lg')};margin:0;padding:0 20px;text-decoration:none}
.pub-entry .cta{display:flex;flex-direction:column;gap:12px}
.pub-entry .cta a.quiet{background:var(--surface-muted);color:var(--text)}
.pub-entry .note{${type('caption')};color:var(--text-tertiary);text-align:center;margin-top:4px}
.pub-entry .small{${type('body')};color:var(--text-secondary);text-align:center;padding:8px}.pub-entry .small a{${type('bodyStrong')};color:var(--link);text-decoration:none}
.pub-entry .terms{${type('caption')};color:var(--text-secondary);text-align:center}.pub-entry .terms a{${type('captionStrong')};color:var(--link);text-decoration:none}
.pub-entry .brand-panel{display:none}
.pub-entry.welcome .phone{padding:0 24px 16px;box-sizing:border-box}
.pub-entry.welcome .hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.pub-entry.welcome .words{display:flex;flex-direction:column;gap:8px;max-width:360px;width:100%;text-align:center}
.pub-entry.welcome .words .spec{margin-top:10px;text-align:start}
.pub-entry.welcome .title{${type('title')};color:var(--text)}
.pub-entry.welcome .actions{display:flex;flex-direction:column;gap:12px;width:100%;max-width:420px;margin:0 auto}
.pub-entry.welcome .desk{display:none}
@media (min-width:${px.desktop}){
.pub-entry{background:var(--surface)}
.pub-entry .brand-panel{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px;gap:28px;background:var(--accent-soft)}
.pub-entry .friends{display:flex;align-items:flex-end;gap:4px}
.pub-entry .brand-words{display:flex;flex-direction:column;align-items:center;gap:12px;max-width:440px;text-align:center}
.pub-entry .brand-words .title{${type('title')};color:var(--text)}
.pub-entry .pane{background:var(--surface)}.pub-entry .scroll{justify-content:center}
.pub-entry .bar-mark{display:none}
.pub-entry.welcome .phone{display:none}
.pub-entry.welcome .desk{display:flex;flex-direction:column;justify-content:center;padding:48px;gap:28px}
.pub-entry.welcome .desk>.head{width:100%;max-width:420px;margin:0 auto;gap:8px}.pub-entry.welcome .desk .spec{margin-top:10px}
}
@media (min-width:${px.desktop}) and (prefers-color-scheme:dark){.pub-entry .brand-panel{background:var(--surface-raised)}}
.pub-home h1,.pub-home h3,.pub-home .wordmark,.pub-sheet .wordmark{font-family:${FACE.heading}}
.pub-home .masthead,.pub-sheet .masthead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid var(--border)}
.pub-home .wordmark,.pub-sheet .wordmark{font-weight:800;font-size:1.35rem;color:var(--ink);text-decoration:none}
.pub-home .hero{padding:36px 0 28px}
.pub-home h1{font-size:2.4rem;line-height:1.1;font-weight:800;letter-spacing:-.01em;margin:0 0 14px;max-width:16ch}
.pub-home .lead{font-size:1.05rem;max-width:58ch}
.pub-home h2.mono{margin:0 0 10px;padding-top:26px;border-top:1px solid var(--border)}
.pub-home .spec,.pub-sheet .spec{margin:0;display:grid;grid-template-columns:1fr;gap:0}
.pub-home .spec>div,.pub-sheet .spec>div{display:grid;grid-template-columns:150px 1fr;gap:16px;padding:10px 0;border-bottom:1px solid var(--border)}
.pub-home .spec dt,.pub-sheet .spec dt{margin:0;padding-top:3px}.pub-home .spec dd,.pub-sheet .spec dd{margin:0;font-size:.95rem;line-height:1.5}
.pub-home .layers{margin-top:8px}
.pub-home .layers input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pub-home .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px}
.pub-home .tabs label{display:inline-flex;align-items:baseline;gap:6px;padding:8px 12px;border:1px solid var(--border);border-radius:999px;cursor:pointer;font-size:.92rem;font-weight:600;color:var(--text-secondary);background:var(--surface)}
.pub-home .tabs label .mono{color:var(--text-tertiary)}
.pub-home .panel{display:none;border:1px solid var(--border);border-radius:12px;padding:18px;background:var(--surface)}
.pub-home .panel h3{font-size:1.25rem;line-height:1.25;margin:6px 0 8px;font-weight:800;color:var(--ink)}
.pub-home .panel>p{margin:0 0 6px}.pub-home .panel>p.mono{margin:0}
.pub-home .sample{margin-top:14px;padding:14px;border-radius:10px;background:var(--surface-muted);display:grid;gap:8px;font-size:.92rem}
.pub-home .sample .row{display:flex;gap:10px;align-items:flex-start}
.pub-home .sample .dot{width:28px;height:28px;border-radius:50%;background:var(--accent);flex:none}.pub-home .sample .dot-2{background:var(--mine)}.pub-home .sample .dot-3{background:var(--ink)}
.pub-home .sample .tag{font-family:${FACE.body};font-size:.74rem;font-weight:600;letter-spacing:0;padding:3px 8px;border-radius:999px;background:var(--accent-soft);color:var(--text);flex:none}
.pub-home .sample .tag-2{background:var(--surface);border:1px solid var(--border)}.pub-home .sample .tag-3{background:var(--surface);border:1px dashed var(--border)}
.pub-home .sample .bubble{max-width:80%;padding:8px 12px;border-radius:16px;background:var(--surface)}.pub-home .sample .bubble.me{background:var(--mine);color:var(--on-mine);margin-inline-start:auto;border-end-end-radius:6px}.pub-home .sample .bubble.them{border-end-start-radius:6px}
${explorerStyle()}
@media (min-width:720px){.pub-home .layers{display:grid;grid-template-columns:200px 1fr;column-gap:20px;align-items:start}.pub-home .layers h2{grid-column:1/-1}.pub-home .tabs{flex-direction:column;align-items:stretch;margin:6px 0 0}.pub-home .tabs label{border-radius:10px}}
.pub-home .foot{margin-top:28px;padding-top:14px;border-top:1px solid var(--border)}
@media (max-width:560px){.pub-home h1{font-size:1.9rem}.pub-home .spec>div,.pub-sheet .spec>div{grid-template-columns:1fr;gap:2px}.pub-home .spec dt,.pub-sheet .spec dt{padding-top:0}}
@media (prefers-reduced-motion:no-preference){.pub-home .tabs label{transition:border-color .15s ease-out,background .15s ease-out}}
.pub-home .masthead{align-items:baseline}.pub-home .sitenav{display:flex;gap:4px 14px;flex-wrap:wrap;margin-inline-start:auto}.pub-home .sitenav a{color:var(--text-tertiary);text-decoration:none;padding:2px 0}.pub-home .sitenav a[aria-current]{color:var(--ink);border-bottom:1px solid var(--ink)}.pub-home .sitenav a:hover{color:var(--ink)}
.pub-site .layers{margin-top:26px}.pub-site .hero+.layers{margin-top:0}.pub-home .sheet+.hero,.pub-home .layers+.hero{padding-top:20px}
.pub-home code{font-family:${FACE.mono};font-size:.85em;background:var(--surface-muted);padding:1px 5px;border-radius:5px}
.pub-home .plans{display:grid;grid-template-columns:1fr;gap:14px}.pub-home .plan{border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--surface)}.pub-home .plan h3{margin:0;font-size:1.2rem;font-weight:800;color:var(--ink);font-family:${FACE.heading}}.pub-home .plan .price{margin:2px 0 8px;color:var(--text-secondary)}.pub-home .plan .price strong{color:var(--ink);font-size:1.15rem}.pub-home .plan .spec>div{grid-template-columns:110px 1fr;gap:10px;padding:8px 0}.pub-home .plan .spec>div:last-child{border-bottom:0}.pub-home .plan .small{margin:8px 0 0}
@media (min-width:720px){.pub-home .plans{grid-template-columns:1fr 1fr}.pub-home .plans-3{grid-template-columns:1fr 1fr 1fr}.pub-home .plan .spec>div{grid-template-columns:1fr;gap:2px}}
@media (max-width:560px){.pub-home .sitenav{margin-inline-start:0;width:100%}}
.pub-home[dir=rtl] h1{letter-spacing:0}
</style>`;

/** The shell with a page's head and body in it. Tolerant of a template without the markers. */
export function injectPublic(template: string, page: Rendered): string {
  let html = template.replace(/<title>[^<]*<\/title>\s*/i, '');
  // A page written in a language says so on the document itself, since the app never runs here.
  if (page.lang)
    html = html.replace(/<html\b[^>]*>/i, `<html lang="${page.lang}" dir="${dirOf(page.lang)}">`);
  html = html.includes('</head>')
    ? html.replace('</head>', `${page.head}\n${PUBLIC_STYLE}\n</head>`)
    : `${page.head}\n${PUBLIC_STYLE}\n${html}`;
  if (!page.body) return html;
  const marker = /<div id="root"><\/div>/;
  if (marker.test(html))
    return html.replace(marker, `<div id="root"></div>\n<div id="static">${page.body}\n</div>`);
  return html.includes('</body>')
    ? html.replace('</body>', `<div id="static">${page.body}\n</div>\n</body>`)
    : `${html}\n<div id="static">${page.body}\n</div>`;
}

/**
 * On an entry screen the app's scripts are asked for only once the static screen has painted
 * (R44): deferred scripts are still requested the moment the parser sees them, and on a slow
 * network 360 KB of script shares the line with the words a visitor is waiting for. The three
 * `<script src defer>` tags become one inline bootstrap that appends them, in order, after the
 * first frame. The bootstrap is fixed text, so the content security policy allows it by hash.
 */
export function bootstrapScripts(html: string): { html: string; inline: string } {
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>\s*/g)];
  if (!tags.length) return { html, inline: '' };
  const srcs = tags.map((m) => m[1] as string);
  const inline = `<script>${BOOTSTRAP.replace('SRCS', JSON.stringify(srcs))}</script>`;
  let out = html;
  for (const m of tags) out = out.replace(m[0], '');
  out = out.includes('</body>')
    ? out.replace('</body>', `${inline}\n</body>`)
    : `${out}\n${inline}`;
  return { html: out, inline };
}

/** The bootstrap's text, with SRCS for the list; `async=false` keeps their order as `defer` did. */
export const BOOTSTRAP =
  "addEventListener('DOMContentLoaded',function(){requestAnimationFrame(function(){requestAnimationFrame(function(){for(var s of SRCS){var e=document.createElement('script');e.src=s;e.async=false;document.body.appendChild(e)}})})})";

/** Caime's own robots.txt: the app's screens aren't pages; the public ones are. */
export function robotsTxt(publicUrl: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /v1/',
    'Disallow: /c/',
    'Disallow: /s/',
    'Disallow: /settings/',
    'Disallow: /connect',
    'Disallow: /sign-in',
    'Disallow: /sign-up',
    'Disallow: /recover',
    'Disallow: /onboarding',
    `Sitemap: ${publicUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * The pages worth indexing: the landing page, Caime's own pages, and open organizations that
 * proved who they are (an unverified page still renders, but Caime doesn't send a crawler to
 * a name nobody has proven).
 */
export async function sitemapXml(db: Q, publicUrl: string, pagesHere: string[]): Promise<string> {
  const orgs = await db
    .selectFrom('organizations')
    .select(['handle', 'updated_at', 'booking', 'booking_items', 'ordering', 'collections'])
    .where('archived_at', 'is', null)
    .where('verified_at', 'is not', null)
    .orderBy('created_at')
    .limit(50_000)
    .execute();
  const entry = (loc: string, lastmod?: Date) =>
    `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry(`${publicUrl}/`),
    ...MARKETING_PAGES.map((p) => entry(`${publicUrl}/${p}`)),
    ...pagesHere.map((p) => entry(`${publicUrl}/${p}`)),
    // Each organization's page, then its public collections and items (R61); a sitemap holds
    // 50,000 addresses at most.
    ...orgs
      .flatMap((o) => {
        const shelf = publicCatalog(o);
        const at = (slug: string) => `${publicUrl}/o/${o.handle}/${encodeURIComponent(slug)}`;
        return [
          entry(`${publicUrl}/o/${o.handle}`, o.updated_at),
          ...shelf.collections.map((c) => entry(at(c.slug), o.updated_at)),
          ...shelf.items.map((i) => entry(at(i.slug), o.updated_at)),
        ];
      })
      .slice(0, 50_000 - MARKETING_PAGES.length - pagesHere.length - 1),
    '</urlset>',
    '',
  ].join('\n');
}

/** What the browser may use on Caime's pages, and nothing on anyone else's frame. */
export const PERMISSIONS_POLICY =
  'camera=(self), microphone=(self), geolocation=(self), display-capture=(self), payment=(), usb=(), interest-cohort=()';
