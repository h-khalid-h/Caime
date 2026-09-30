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
import { canSee, handleError, normalizeHandle, SPHERE_DEFS, type Sphere } from '@caime/core';
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
  | PublicPerson
  | PublicOrg
  | PublicInvite
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
    .where('suspended_at', 'is', null)
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
  const invite = /^\/i\/([^/?#]+)$/.exec(path);
  if (invite) return (await publicInvite(db, invite[1] ?? '', now)) ?? { kind: 'missing' };
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

/**
 * The landing page's layer explorer: Caime as it's built, one layer at a time, each with an
 * example drawn as the app draws it. No script: radio buttons and CSS pick the layer, so a
 * visitor's page stays a page (R44).
 */
const LAYERS: Array<{ id: string; name: string; title: string; body: string; sample: string }> = [
  {
    id: 'connection',
    name: 'Connection',
    title: 'Who someone is to you comes first.',
    body: 'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.',
    sample: `<div class="row"><span class="dot"></span><span><strong>Sarah Ahmed</strong><br><span class="mono">colleague · DATA C · work</span></span></div>
<div class="row"><span class="dot dot-2"></span><span><strong>Omar Haddad</strong><br><span class="mono">brother · family</span></span></div>`,
  },
  {
    id: 'conversation',
    name: 'Conversation',
    title: 'Messages that know their context.',
    body: 'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.',
    sample: `<div class="bubble them">هل وصل العقد؟</div>
<div class="bubble me">Yes, signing it Friday.</div>
<div class="mono">read · 2 min</div>`,
  },
  {
    id: 'attention',
    name: 'Attention',
    title: 'What needs you, not everything.',
    body: 'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.',
    sample: `<div class="row"><span class="tag">Needs you</span><span>Sarah asked about the contract</span></div>
<div class="row"><span class="tag tag-2">Waiting</span><span>Omar · the deck · since Tuesday</span></div>
<div class="mono">3 need you</div>`,
  },
  {
    id: 'memory',
    name: 'Memory',
    title: 'Nothing said is lost.',
    body: 'Commitments, dates, amounts, questions and decisions are found in the conversation and offered back as actions. They become facts only when you say so.',
    sample: `<div class="row"><span class="tag tag-3">Suggested</span><span>Remind me: send the deck · Monday</span></div>
<div class="row"><span class="tag tag-3">Suggested</span><span>Waiting on Sarah: contract</span></div>
<div class="mono">based on “I’ll send the deck on Monday.”</div>`,
  },
  {
    id: 'organizations',
    name: 'Organizations',
    title: 'A business that proves it’s the business.',
    body: 'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.',
    sample: `<div class="row"><span class="dot dot-3"></span><span><strong>Nile Dental</strong><br><span class="mono">verified · niledental.example</span></span></div>
<div class="row"><span class="tag">Customer waiting</span><span>Lina · new patient forms</span></div>`,
  },
  {
    id: 'privacy',
    name: 'Privacy',
    title: 'Each side of your life sees what you chose.',
    body: 'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.',
    sample: `<div class="row"><span class="mono">work sees</span><span>name · headline · organization</span></div>
<div class="row"><span class="mono">family sees</span><span>everything, and where you are when you share it</span></div>
<div class="row"><span class="mono">a stranger sees</span><span>your name and handle, and may ask</span></div>`,
  },
];
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
      // Which page this is, for the app: it stays out of a visitor's way on a person's or an
      // organization's page only (R44).
      `<meta name="caime-page" content="${page.kind}">`,
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
<main class="pub pub-home">
  <header class="masthead">
    <span class="wordmark">${SITE_NAME}</span>
    <span class="mono">messaging that understands your relationships</span>
  </header>
  <section class="hero">
    <h1>${esc(PROMISE)}</h1>
    <p class="lead">Your family, your work and your customers don’t belong in one list. Say who
    each person is to you, once. From then on Caime knows what needs you first, who may reach
    you when, what was decided and what’s owed, and what each side of your life sees of you.</p>
    <p class="cta"><a href="/sign-up">Start free</a> <a href="/sign-in" class="quiet">Sign in</a></p>
  </section>
  <section class="sheet" aria-labelledby="sheet-title">
    <h2 id="sheet-title" class="mono">Specification</h2>
    <dl class="spec">
      <div><dt class="mono">primary object</dt><dd>The connection between two people, not the chat.</dd></div>
      <div><dt class="mono">to connect</dt><dd>Connect in three taps. Say how you know someone; the conversation, its notifications and its cards fit the relationship.</dd></div>
      <div><dt class="mono">attention</dt><dd>“3 need you”, never “47 unread”. The inbox puts what matters first and says why.</dd></div>
      <div><dt class="mono">memory</dt><dd>Commitments, dates, amounts and decisions are found in the conversation and offered as actions. You decide; nothing is written for you.</dd></div>
      <div><dt class="mono">organizations</dt><dd>A business proves its domain with one DNS record; its team answers as the organization, in one inbox.</dd></div>
      <div><dt class="mono">privacy</dt><dd>Each side of your life sees what you chose. End-to-end encrypted when you say so, with a recovery key only you hold.</dd></div>
      <div><dt class="mono">money</dt><dd>Never held or moved by Caime. A split records who owes whom; nothing else.</dd></div>
      <div><dt class="mono">price</dt><dd>Free for people, always. Organizations start free and can buy Business.</dd></div>
      <div><dt class="mono">runs on</dt><dd>Web, iOS and Android, from one account.</dd></div>
    </dl>
  </section>
  <section class="layers" aria-labelledby="layers-title">
    <h2 id="layers-title" class="mono">Layers · pick one</h2>
    ${LAYERS.map(
      (l, i) => `<input type="radio" name="layer" id="layer-${l.id}"${i === 0 ? ' checked' : ''}>`,
    ).join('\n    ')}
    <div class="tabs" role="list">
      ${LAYERS.map(
        (l, i) =>
          `<label for="layer-${l.id}" role="listitem"><span class="mono">0${i + 1}</span> ${esc(l.name)}</label>`,
      ).join('\n      ')}
    </div>
    <div class="panels">
      ${LAYERS.map(
        (l, i) => `<article class="panel" id="panel-${l.id}">
        <p class="mono">0${i + 1} · ${esc(l.name)}</p>
        <h3>${esc(l.title)}</h3>
        <p>${esc(l.body)}</p>
        <div class="sample" aria-label="Example">${l.sample}</div>
      </article>`,
      ).join('\n      ')}
    </div>
  </section>
  <footer class="foot">
    <p class="small"><a href="/help">Help</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
  </footer>
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
<main class="pub pub-sheet">
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono">a person on ${SITE_NAME}</span></header>
  ${page.avatarUrl ? `<img class="face" src="${esc(page.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(page.displayName)}</h1>
  ${page.bio ? `<p class="lead">${esc(page.bio)}</p>` : ''}
  <dl class="spec">
    <div><dt class="mono">handle</dt><dd>@${esc(page.handle)}</dd></div>
    ${page.headline ? `<div><dt class="mono">headline</dt><dd>${esc(page.headline)}</dd></div>` : ''}
    ${page.organizations.length ? `<div><dt class="mono">with</dt><dd>${page.organizations.map((o) => `<a href="/o/${esc(o.handle)}">${esc(o.name)}</a>`).join(', ')}</dd></div>` : ''}
  </dl>
  <p class="cta"><a href="${wayIn('sign-up', path)}">Message ${esc(page.displayName)} on ${SITE_NAME}</a> <a href="${wayIn('sign-in', path)}" class="quiet">Sign in</a></p>
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
<main class="pub pub-sheet">
  <header class="masthead"><a class="wordmark" href="/">${SITE_NAME}</a><span class="mono">an organization on ${SITE_NAME}</span></header>
  ${o.avatarUrl ? `<img class="mark" src="${esc(o.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(o.name)}</h1>
  ${page.about ? `<p class="lead">${esc(page.about)}</p>` : ''}
  <dl class="spec">
    <div><dt class="mono">handle</dt><dd>@${esc(o.handle)}</dd></div>
    ${o.verified && o.verifiedDomain ? `<div><dt class="mono">verified</dt><dd>${esc(o.verifiedDomain)}, proved with a DNS record</dd></div>` : `<div><dt class="mono">verified</dt><dd>Not yet</dd></div>`}
    ${page.foundedYear ? `<div><dt class="mono">since</dt><dd>${page.foundedYear}</dd></div>` : ''}
    ${page.website ? `<div><dt class="mono">website</dt><dd><a href="${esc(page.website)}" rel="noopener">${esc(page.website.replace(/^https?:\/\//, ''))}</a></dd></div>` : ''}
  </dl>
  <p class="cta"><a href="${wayIn('sign-up', path)}">Message ${esc(o.name)} on ${SITE_NAME}</a> <a href="${wayIn('sign-in', path)}" class="quiet">Sign in</a></p>
</main>`,
      };
    }
    case 'invite':
      return {
        status: 200,
        head: meta({
          title: `${page.displayName} invited you · ${SITE_NAME}`,
          description: `Join ${page.displayName} on ${SITE_NAME}${page.context ? ` (${page.context})` : ''}: sign up in half a minute and you’re connected.`,
          image: page.avatarUrl ? `${publicUrl}${page.avatarUrl}` : null,
          index: false,
          canonical: false,
        }),
        body: `
<main class="pub">
  ${page.avatarUrl ? `<img class="face" src="${esc(page.avatarUrl)}" alt="" width="96" height="96">` : ''}
  <h1>${esc(page.displayName)} invited you</h1>
  ${page.context ? `<p class="lead">${esc(page.context)}</p>` : ''}
  ${page.note ? `<p>“${esc(page.note)}”</p>` : ''}
  <p>${SITE_NAME}: ${esc(PROMISE)} Sign up in half a minute and you’re connected with ${esc(page.displayName)}, no app to install.</p>
  <p class="cta"><a href="${wayIn('sign-up', path)}">Join ${esc(page.displayName)} on ${SITE_NAME}</a> <a href="${wayIn('sign-in', path)}" class="quiet">Sign in</a></p>
</main>`,
      };
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
export /**
 * A visitor's way in from someone's page: sign-up or sign-in, carrying the page as `?link=` so
 * the app brings them back to it, and counts the invite for whoever it was (state/pendingLink.ts).
 */
const wayIn = (to: 'sign-up' | 'sign-in', path: string) =>
  `/${to}?link=${encodeURIComponent(path)}`;

const PUBLIC_STYLE = `
<style id="pub-style">
#root:empty{display:none}
#root:not(:empty)~#static{display:none}html[data-visitor] #root{display:none!important}html[data-visitor] #static{display:block!important}html[data-visitor] body{overflow:auto!important}
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
.pub{--ink:#3b2e5b;--text:#2b2340;--text2:#5e5673;--text3:#6f6885;--line:#e7e2ef;--muted:#f3f0f8;--surface:#fff;--accent:#ff8fb1;--accent-soft:#ffd6e7;--plum:#5b40a0}
@media (prefers-color-scheme:dark){.pub{--ink:#f5f2fa;--text:#f5f2fa;--text2:#b7afc9;--text3:#9c94b0;--line:#342d46;--muted:#2a2438;--surface:#1a1625;--accent:#ff8fb1;--accent-soft:#4a2c3f;--plum:#6a57a8}}
.pub-sheet{font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text)}.pub-sheet h1{font-size:2rem;font-weight:800;margin:14px 0 6px;color:var(--ink)}.pub-sheet .masthead{margin-bottom:8px}.pub-sheet .wordmark{text-decoration:none}.pub-sheet .spec{margin:14px 0 6px}
.pub-home{max-width:840px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text)}
.pub .mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:.78rem;letter-spacing:.03em;color:var(--text3);font-weight:500}
.pub-home h1,.pub-home h3,.pub-home .wordmark,.pub-sheet .wordmark{font-family:Nunito,Inter,system-ui,sans-serif}
.pub-home .masthead,.pub-sheet .masthead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid var(--line)}
.pub-home .wordmark,.pub-sheet .wordmark{font-weight:800;font-size:1.35rem;color:var(--ink)}
.pub-home .hero{padding:36px 0 28px}
.pub-home h1{font-size:2.4rem;line-height:1.1;font-weight:800;letter-spacing:-.01em;margin:0 0 14px;max-width:16ch}
.pub-home .lead{font-size:1.05rem;max-width:58ch}
.pub-home h2.mono{margin:0 0 10px;padding-top:26px;border-top:1px solid var(--line)}
.pub-home .spec,.pub-sheet .spec{margin:0;display:grid;grid-template-columns:1fr;gap:0}
.pub-home .spec>div,.pub-sheet .spec>div{display:grid;grid-template-columns:150px 1fr;gap:16px;padding:10px 0;border-bottom:1px solid var(--line)}
.pub-home .spec dt,.pub-sheet .spec dt{margin:0;padding-top:3px}.pub-home .spec dd,.pub-sheet .spec dd{margin:0;font-size:.95rem;line-height:1.5}
.pub-home .layers{margin-top:8px}
.pub-home .layers input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pub-home .tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px}
.pub-home .tabs label{display:inline-flex;align-items:baseline;gap:6px;padding:8px 12px;border:1px solid var(--line);border-radius:999px;cursor:pointer;font-size:.92rem;font-weight:600;color:var(--text2);background:var(--surface)}
.pub-home .tabs label .mono{color:var(--text3)}
.pub-home .panel{display:none;border:1px solid var(--line);border-radius:12px;padding:18px;background:var(--surface)}
.pub-home .panel h3{font-size:1.25rem;line-height:1.25;margin:6px 0 8px;font-weight:800;color:var(--ink)}
.pub-home .panel>p{margin:0 0 6px}.pub-home .panel>p.mono{margin:0}
.pub-home .sample{margin-top:14px;padding:14px;border-radius:10px;background:var(--muted);display:grid;gap:8px;font-size:.92rem}
.pub-home .sample .row{display:flex;gap:10px;align-items:flex-start}
.pub-home .sample .dot{width:28px;height:28px;border-radius:50%;background:var(--accent);flex:none}.pub-home .sample .dot-2{background:var(--plum)}.pub-home .sample .dot-3{background:var(--ink)}
.pub-home .sample .tag{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.72rem;letter-spacing:.03em;padding:3px 8px;border-radius:999px;background:var(--accent-soft);color:var(--text);flex:none}
.pub-home .sample .tag-2{background:var(--surface);border:1px solid var(--line)}.pub-home .sample .tag-3{background:var(--surface);border:1px dashed var(--line)}
.pub-home .sample .bubble{max-width:80%;padding:8px 12px;border-radius:16px;background:var(--surface)}.pub-home .sample .bubble.me{background:var(--plum);color:#fff;margin-left:auto;border-bottom-right-radius:6px}.pub-home .sample .bubble.them{border-bottom-left-radius:6px}
${['connection', 'conversation', 'attention', 'memory', 'organizations', 'privacy']
  .map(
    (id) =>
      `#layer-${id}:checked~.tabs label[for="layer-${id}"]{border-color:var(--ink);color:var(--ink);background:var(--muted)}#layer-${id}:checked~.panels #panel-${id}{display:block}#layer-${id}:focus-visible~.tabs label[for="layer-${id}"]{outline:2px solid var(--plum);outline-offset:2px}`,
  )
  .join('\n')}
@media (min-width:720px){.pub-home .layers{display:grid;grid-template-columns:200px 1fr;column-gap:20px;align-items:start}.pub-home .layers h2{grid-column:1/-1}.pub-home .tabs{flex-direction:column;align-items:stretch;margin:6px 0 0}.pub-home .tabs label{border-radius:10px}}
.pub-home .foot{margin-top:28px;padding-top:14px;border-top:1px solid var(--line)}
@media (max-width:560px){.pub-home h1{font-size:1.9rem}.pub-home .spec>div,.pub-sheet .spec>div{grid-template-columns:1fr;gap:2px}.pub-home .spec dt,.pub-sheet .spec dt{padding-top:0}}
@media (prefers-reduced-motion:no-preference){.pub-home .tabs label{transition:border-color .15s ease-out,background .15s ease-out}}
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
