/**
 * What a visitor who isn't signed in, a search engine or an answer engine reads (R44): the shell
 * the web app boots from carries, per page, a title, a description, Open Graph and Twitter cards,
 * a canonical address, JSON-LD and a plain HTML body the app replaces the moment it renders. The
 * landing page says what Caime is; `/@handle` and `/o/handle` show what a person or an
 * organization already shows to everyone (ADR-10: the privacy evaluator decides, with nobody as
 * the viewer; a person's page exists only while they can be found by handle, and never under
 * 18); every other path is the app's and asks not to be indexed.
 */
import type { OrgRef } from '@caime/core';
import { canSee, handleError, normalizeHandle } from '@caime/core';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import { orgAvatarUrl, orgRef } from './business';
import { orgsOf } from './orgs';
import { avatarUrl, minorOf, privacyOf } from './users';

type Q = Kysely<Database>;

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
}
export interface PublicOrg {
  kind: 'org';
  org: OrgRef;
  about: string | null;
  website: string | null;
  country: string | null;
  foundedYear: number | null;
  updatedAt: Date;
}
export type PublicPage =
  | { kind: 'landing' }
  | PublicPerson
  | PublicOrg
  | { kind: 'missing' }
  | { kind: 'app' };

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
    .where('kind', '=', 'human')
    .executeTakeFirst();
  if (!u || minorOf(u, now)) return null;
  const privacy = privacyOf(u, now);
  if (!privacy.discoverByHandle) return null;
  const see = (field: Parameters<typeof canSee>[1]) => canSee(privacy, field, NOBODY);
  const identity = see('identityDetails')
    ? await db
        .selectFrom('identities')
        .select(['headline'])
        .where('user_id', '=', u.id)
        .where('is_default', '=', true)
        .executeTakeFirst()
    : null;
  return {
    kind: 'person',
    id: u.id,
    handle: u.handle,
    displayName: u.display_name,
    avatarUrl: see('profilePhoto') ? avatarUrl(u) : null,
    bio: see('bio') ? u.bio : null,
    headline: identity?.headline ?? null,
    organizations: see('identityDetails') ? await orgsOf(db, u.id) : [],
  };
}

/** The page a path is, for whoever isn't signed in. */
export async function publicPageFor(db: Q, path: string, now: Date): Promise<PublicPage> {
  if (path === '/') return { kind: 'landing' };
  const at = /^\/@([^/?#]+)$/.exec(path);
  const org = /^\/o\/([^/?#]+)$/.exec(path);
  const raw = decodeURIComponent((at ?? org)?.[1] ?? '');
  if (!raw) return { kind: 'app' };
  const handle = normalizeHandle(raw);
  if (handleError(handle)) return { kind: 'missing' };
  // One namespace: @handle may be an organization's; /o/ is only ever an organization's.
  const o = await publicOrg(db, handle);
  if (o) return o;
  if (org) return { kind: 'missing' };
  return (await publicPerson(db, handle, now)) ?? { kind: 'missing' };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export const SITE_NAME = 'Caime';
export const PROMISE = 'Messaging that understands your relationships.';
const LANDING_DESCRIPTION =
  'Caime is messaging that knows who each person is to you: your family, your work, your customers, each in its place, with what needs you first. Free for people; organizations verify who they are.';

interface Rendered {
  status: number;
  head: string;
  body: string;
}

/** The head tags and the plain body for a page, and the status it deserves. */
export function renderPublic(page: PublicPage, publicUrl: string, path: string): Rendered {
  const url = `${publicUrl}${path === '/' ? '/' : path}`;
  const meta = (o: {
    title: string;
    description: string;
    image: string | null;
    index: boolean;
    ld?: object;
    canonical?: boolean;
  }) =>
    [
      `<title>${esc(o.title)}</title>`,
      `<meta name="description" content="${esc(o.description)}">`,
      o.index
        ? '<meta name="robots" content="index,follow">'
        : '<meta name="robots" content="noindex">',
      o.canonical === false ? '' : `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:site_name" content="${SITE_NAME}">`,
      `<meta property="og:type" content="${page.kind === 'person' ? 'profile' : 'website'}">`,
      `<meta property="og:title" content="${esc(o.title)}">`,
      `<meta property="og:description" content="${esc(o.description)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${esc(o.image ?? `${publicUrl}/apple-touch-icon.png`)}">`,
      `<meta name="twitter:card" content="${o.image && page.kind !== 'landing' ? 'summary' : 'summary_large_image'}">`,
      `<meta name="twitter:title" content="${esc(o.title)}">`,
      `<meta name="twitter:description" content="${esc(o.description)}">`,
      o.ld
        ? `<script type="application/ld+json">${JSON.stringify(o.ld).replace(/</g, '\\u003c')}</script>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  switch (page.kind) {
    case 'landing':
      return {
        status: 200,
        head: meta({
          title: `${SITE_NAME}: ${PROMISE.replace(/\.$/, '')}`,
          description: LANDING_DESCRIPTION,
          image: null,
          index: true,
          ld: {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: SITE_NAME,
            applicationCategory: 'CommunicationApplication',
            operatingSystem: 'Web, iOS, Android',
            description: LANDING_DESCRIPTION,
            url: publicUrl,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          },
        }),
        body: `
<main class="pub">
  <h1>${SITE_NAME}</h1>
  <p class="lead">${esc(PROMISE)}</p>
  <p>Your family, your work and your customers don’t belong in one list. Caime asks who each
  person is to you, once, and from then on it knows: what needs you first, who may reach you
  when, what was decided and what’s owed, and what each side of your life should see of you.</p>
  <ul>
    <li><strong>Connect in three taps.</strong> Say how you know someone, and the conversation, its
    notifications and its cards fit the relationship.</li>
    <li><strong>Needs you, not everything.</strong> The inbox puts what matters first and says why;
    quiet hours and rules are yours, by relationship.</li>
    <li><strong>Nothing is lost.</strong> Commitments, dates, amounts and decisions are found in the
    conversation and offered as actions; you decide.</li>
    <li><strong>Organizations, verified.</strong> A business proves its domain, and its team answers
    as the organization, in one inbox.</li>
    <li><strong>Private when it should be.</strong> End-to-end encrypted conversations, with a
    recovery key only you hold.</li>
  </ul>
  <p class="cta"><a href="/sign-up">Start free</a> <a href="/sign-in" class="quiet">Sign in</a></p>
  <p class="small">Free for people, always. Organizations start free and can buy Business.
  <a href="/help">Help</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
</main>`,
      };
    case 'person': {
      const line = [page.headline, page.organizations[0]?.name].filter(Boolean).join(' · ');
      const description = clip(page.bio ?? line ?? `${page.displayName} is on ${SITE_NAME}.`, 200);
      return {
        status: 200,
        head: meta({
          title: `${page.displayName} (@${page.handle}) · ${SITE_NAME}`,
          description,
          image: page.avatarUrl ? `${publicUrl}${page.avatarUrl}` : null,
          index: true,
          ld: {
            '@context': 'https://schema.org',
            '@type': 'Person',
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
<main class="pub">
  ${page.avatarUrl ? `<img class="face" src="${esc(page.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(page.displayName)}</h1>
  <p class="lead">@${esc(page.handle)}${line ? ` · ${esc(line)}` : ''}</p>
  ${page.bio ? `<p>${esc(page.bio)}</p>` : ''}
  ${page.organizations.length ? `<p>With ${page.organizations.map((o) => `<a href="/o/${esc(o.handle)}">${esc(o.name)}</a>`).join(', ')}.</p>` : ''}
  <p class="cta"><a href="${esc(path)}">Message ${esc(page.displayName)} on ${SITE_NAME}</a></p>
</main>`,
      };
    }
    case 'org': {
      const o = page.org;
      const facts = [
        o.verified && o.verifiedDomain ? `Verified · ${o.verifiedDomain}` : null,
        page.foundedYear ? `Since ${page.foundedYear}` : null,
      ].filter(Boolean);
      const description = clip(
        page.about ?? `${o.name} is on ${SITE_NAME}. ${facts.join(' · ')}`.trim(),
        200,
      );
      return {
        status: 200,
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
<main class="pub">
  ${o.avatarUrl ? `<img class="mark" src="${esc(o.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(o.name)}</h1>
  <p class="lead">@${esc(o.handle)}${facts.length ? ` · ${esc(facts.join(' · '))}` : ''}</p>
  ${page.about ? `<p>${esc(page.about)}</p>` : ''}
  ${page.website ? `<p><a href="${esc(page.website)}" rel="noopener">${esc(page.website.replace(/^https?:\/\//, ''))}</a></p>` : ''}
  <p class="cta"><a href="${esc(path)}">Message ${esc(o.name)} on ${SITE_NAME}</a></p>
</main>`,
      };
    }
    case 'missing':
      return {
        status: 404,
        head: meta({
          title: `Not here · ${SITE_NAME}`,
          description: 'Nobody by that handle.',
          image: null,
          index: false,
          canonical: false,
        }),
        body: `
<main class="pub">
  <h1>Nobody by that handle</h1>
  <p>It may have changed, or been let go of. <a href="/">${SITE_NAME}</a></p>
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
export const PUBLIC_STYLE = `
<style id="pub-style">
#root:empty{display:none}
#root:not(:empty)~#static{display:none}
body:has(#root:empty){overflow:auto}
#static{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#23193a;background:#faf8fc;min-height:100%}
.pub{max-width:640px;margin:0 auto;padding:48px 20px 64px;line-height:1.5}
.pub h1{font-size:2rem;line-height:1.15;margin:0 0 8px;color:#3b2e5b}
.pub .lead{font-size:1.15rem;color:#5b4f75;margin:0 0 20px}
.pub ul{padding-left:20px}.pub li{margin:8px 0}
.pub .cta a{display:inline-block;background:#3b2e5b;color:#fff;text-decoration:none;border-radius:999px;padding:12px 22px;font-weight:600;margin:12px 8px 0 0}
.pub .cta a.quiet{background:transparent;color:#3b2e5b;border:1px solid #3b2e5b}
.pub .small{color:#5b4f75;font-size:.9rem}.pub a{color:#3b2e5b}
.pub img.face{border-radius:50%}.pub img.mark{border-radius:28px}
@media (prefers-color-scheme:dark){#static{background:#16121f;color:#ece7f5}.pub h1,.pub a,.pub .cta a.quiet{color:#ece7f5}.pub .lead,.pub .small{color:#b9afcf}.pub .cta a{background:#ece7f5;color:#3b2e5b}.pub .cta a.quiet{background:transparent;border-color:#ece7f5}}
</style>`;

/** The shell with a page's head and body in it. Tolerant of a template without the markers. */
export function injectPublic(template: string, page: Rendered): string {
  let html = template.replace(/<title>[^<]*<\/title>\s*/i, '');
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

/** The pages worth indexing: the landing page, Caime's own pages, and open organizations. */
export async function sitemapXml(db: Q, publicUrl: string, pagesHere: string[]): Promise<string> {
  const orgs = await db
    .selectFrom('organizations')
    .select(['handle', 'updated_at'])
    .where('archived_at', 'is', null)
    .orderBy('created_at')
    .limit(50_000)
    .execute();
  const entry = (loc: string, lastmod?: Date) =>
    `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entry(`${publicUrl}/`),
    ...pagesHere.map((p) => entry(`${publicUrl}/${p}`)),
    ...orgs.map((o) => entry(`${publicUrl}/o/${o.handle}`, o.updated_at)),
    '</urlset>',
    '',
  ].join('\n');
}

/** What the browser may use on Caime's pages, and nothing on anyone else's frame. */
export const PERMISSIONS_POLICY =
  'camera=(self), microphone=(self), geolocation=(self), display-capture=(self), payment=(), usb=(), interest-cohort=()';
