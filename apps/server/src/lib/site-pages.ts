/**
 * Caime's public site (R44, R50): the pages about Caime a visitor reads before signing in, in
 * the app's shell but without its scripts. Each is a spec sheet, in sentence case with mono
 * labels, and an explorer where one earns its place: radio inputs and CSS pick a panel, so a
 * page stays a page. What they say is what the code does: every number here is read from the
 * plans, the encryption design, the retention spans and the API's guide, never typed twice.
 *
 * The site reads in English or Arabic (R54): every string goes through `tr`, in the language
 * `siteLanguage` picks for the request (`?lang=ar|en`, else the browser's first language), and
 * the masthead offers the other. Its copy is the server's alone, so its Arabic lives in
 * `apps/server/src/locales/ar-server.ts`, never in the catalog the app downloads.
 */

import { AGENT_KNOWLEDGE_MAX } from '@caime/core/agents';
import type { MarketingPage } from '@caime/core/api';
import type { PriceView } from '@caime/core/billing';
import { BUSINESS_VIEW_LABELS, BUSINESS_VIEWS } from '@caime/core/business';
import { GROUP_CALL_MAX } from '@caime/core/calls';
import { MAX_DEVICES, PRIVATE_GROUP_MAX } from '@caime/core/e2ee';
import {
  currentTranslator,
  INTERFACE_LANGUAGES,
  type InterfaceLanguage,
  languageFor,
  languageInSearch,
  msg,
  tr,
  trn,
} from '@caime/core/i18n';
import { ORG_ALLOWANCES, PERSON_ALLOWANCES } from '@caime/core/plans';
import { KEPT_DAYS } from './retention';

export const SITE_NAME = 'Caime';
export const PROMISE = msg('Messaging that understands your relationships.');
export const LANDING_DESCRIPTION = msg(
  'Caime is messaging that knows who each person is to you: your family, your work, your customers, each in its place, with what needs you first. Free for people; organizations verify who they are.',
);

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/**
 * The language a page of the site is read in: `?lang=` when it names one (the masthead's switch
 * sets it), else the first language the browser asks for, else English.
 */
export function siteLanguage(
  lang: unknown,
  acceptLanguage: string | string[] | undefined,
): { language: InterfaceLanguage; linkLang: InterfaceLanguage | null } {
  const h = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
  const browser = languageFor(
    typeof h === 'string' ? h.split(',')[0]?.split(';')[0]?.trim() : null,
  );
  const chosen = (typeof lang === 'string' && languageInSearch(`lang=${lang}`)) || browser;
  return { language: chosen, linkLang: chosen === browser ? null : chosen };
}

/** Each language's name in itself, for the links that read this page in the others. */
const LANGUAGE_NAMES: Record<InterfaceLanguage, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  tr: 'Türkçe',
};

/** What the pages say about who runs this Caime, and what it charges. */
export interface SiteFacts {
  legalName: string;
  contactEmail: string;
  /** Pro's and Business's prices in Stripe, or null where billing isn't connected. */
  prices: PriceView[] | null;
  /**
   * The language to carry on links to the site's other pages (`?lang=`), when the page is read
   * in one the browser didn't ask for: a reader who switched stays switched. Null otherwise.
   */
  linkLang?: InterfaceLanguage | null;
}

/**
 * Where a chosen language is carried on to: the site's own pages, and the two ways into the app,
 * whose entry screens and app honour it (so a reader who switched is Arabic all the way in).
 */
const SITE_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/business',
  '/pricing',
  '/security',
  '/developers',
  '/about',
  '/sign-up',
  '/sign-in',
]);

/** A link within the site, carrying the chosen language where there is one. */
export const siteHref = (path: string, facts: Pick<SiteFacts, 'linkLang'> | null): string =>
  facts?.linkLang && SITE_PATHS.has(path) ? `${path}?lang=${facts.linkLang}` : path;

/** The site's pages, in the order the nav lists them; `home` is the landing page. */
export const SITE_NAV: ReadonlyArray<{ path: string; label: string; kicker: string }> = [
  { path: '/', label: msg('Home'), kicker: msg('messaging that understands your relationships') },
  { path: '/business', label: msg('For organizations'), kicker: msg('for organizations') },
  { path: '/pricing', label: msg('Pricing'), kicker: msg('pricing') },
  { path: '/security', label: msg('Security'), kicker: msg('security and privacy') },
  { path: '/developers', label: msg('Developers'), kicker: msg('developers') },
  { path: '/about', label: msg('About'), kicker: msg('about') },
];

/** The attributes that say what language a page is in, for `<main>` and the shell's `<html>`. */
export function langAttrs(): string {
  const t = currentTranslator();
  return `lang="${t.language}" dir="${t.dir}"`;
}

/**
 * The masthead every page of the site shares: the wordmark, what this page is, the nav, and the
 * other language (named in itself, so whoever needs it can read it).
 */
export function masthead(current: string, facts: Pick<SiteFacts, 'linkLang'> | null): string {
  const here = SITE_NAV.find((n) => n.path === current);
  const links = SITE_NAV.map(
    (n) =>
      `<a href="${siteHref(n.path, facts)}"${n.path === current ? ' aria-current="page"' : ''}>${esc(tr(n.label))}</a>`,
  );
  links.push(`<a href="/sign-in">${esc(tr('Sign in'))}</a>`);
  const here_ = currentTranslator().language;
  for (const other of INTERFACE_LANGUAGES.filter((l) => l !== here_))
    links.push(
      `<a href="${current}?lang=${other}" lang="${other}" hreflang="${other}" rel="alternate">${LANGUAGE_NAMES[other]}</a>`,
    );
  return `<header class="masthead">
    <a class="wordmark" href="/">${SITE_NAME}</a>
    <span class="mono">${esc(tr(here?.kicker ?? ''))}</span>
    <nav class="sitenav mono" aria-label="${SITE_NAME}">${links.join('\n      ')}</nav>
  </header>`;
}

export function footer(facts: Pick<SiteFacts, 'contactEmail'> | null): string {
  const mail = facts
    ? ` · <a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>`
    : '';
  return `<footer class="foot">
    <p class="small"><a href="/help">${esc(tr('Help'))}</a> · <a href="/privacy">${esc(tr('Privacy'))}</a> · <a href="/terms">${esc(tr('Terms'))}</a>${mail}</p>
  </footer>`;
}

/** A spec sheet: mono labels, their values (already HTML). */
export const spec = (rows: Array<[string, string] | null | false>) =>
  `<dl class="spec">
    ${rows
      .flatMap((r) => (r ? [`<div><dt class="mono">${esc(r[0])}</dt><dd>${r[1]}</dd></div>`] : []))
      .join('\n    ')}
  </dl>`;

export interface ExplorerItem {
  id: string;
  /** English, marked with `msg`: translated where drawn. */
  name: string;
  title: string;
  body: string;
  /** Drawn as the app draws it (HTML), in the request's language. */
  sample: () => string;
}

/**
 * An explorer: numbered tabs down the side, one panel shown. Radio inputs and CSS, no script;
 * each input's id is `${group}-${item.id}`, and `explorerStyle()` writes the rules for every
 * explorer in EXPLORERS.
 */
export function explorer(group: string, title: string, items: ExplorerItem[]): string {
  const id = (i: ExplorerItem) => `${group}-${i.id}`;
  return `<section class="layers" aria-labelledby="${group}-title">
    <h2 id="${group}-title" class="mono">${esc(title)}</h2>
    ${items.map((i, n) => `<input type="radio" name="${group}" id="${id(i)}"${n === 0 ? ' checked' : ''}>`).join('\n    ')}
    <div class="tabs" role="list">
      ${items
        .map(
          (i, n) =>
            `<label for="${id(i)}" role="listitem"><span class="mono">0${n + 1}</span> ${esc(tr(i.name))}</label>`,
        )
        .join('\n      ')}
    </div>
    <div class="panels">
      ${items
        .map(
          (i, n) => `<article class="panel" id="panel-${id(i)}">
        <p class="mono">0${n + 1} · ${esc(tr(i.name))}</p>
        <h3>${esc(tr(i.title))}</h3>
        <p>${esc(tr(i.body))}</p>
        <div class="sample" aria-label="${esc(tr('Example'))}">${i.sample()}</div>
      </article>`,
        )
        .join('\n      ')}
    </div>
  </section>`;
}

/** The rules that show a picked panel, for every explorer on the site. */
export function explorerStyle(): string {
  return EXPLORERS.flatMap((e) =>
    e.items.map((i) => {
      const id = `${e.group}-${i.id}`;
      return `#${id}:checked~.tabs label[for="${id}"]{border-color:var(--ink);color:var(--ink);background:var(--muted)}#${id}:checked~.panels #panel-${id}{display:block}#${id}:focus-visible~.tabs label[for="${id}"]{outline:2px solid var(--plum);outline-offset:2px}`;
    }),
  ).join('\n');
}

/** A sample's pieces, as the app draws them. */
const row = (...cells: string[]) => `<div class="row">${cells.join('')}</div>`;
const dot = (n = 1) => `<span class="dot${n > 1 ? ` dot-${n}` : ''}"></span>`;
const tag = (text: string, n = 1) =>
  `<span class="tag${n > 1 ? ` tag-${n}` : ''}">${esc(text)}</span>`;
const mono = (text: string) => `<span class="mono">${esc(text)}</span>`;
const who = (name: string, line: string) =>
  `<span><strong>${esc(name)}</strong><br>${mono(line)}</span>`;
const cell = (html: string) => `<span>${html}</span>`;
const bubble = (side: 'me' | 'them', text: string) =>
  `<div class="bubble ${side}">${esc(text)}</div>`;
const note = (text: string) => `<div class="mono">${esc(text)}</div>`;

/**
 * The landing page's layer explorer: Caime as it's built, one layer at a time, each with an
 * example drawn as the app draws it.
 */
export const LANDING_LAYERS: ExplorerItem[] = [
  {
    id: 'connection',
    name: msg('Connection'),
    title: msg('Who someone is to you comes first.'),
    body: msg(
      'A connection is two people and how they know each other, said by each side, private to each. Everything else in Caime hangs off it.',
    ),
    sample: () =>
      row(dot(), who('Sarah Ahmed', tr('colleague · DATA C · work'))) +
      row(dot(2), who('Omar Haddad', tr('brother · family'))),
  },
  {
    id: 'conversation',
    name: msg('Conversation'),
    title: msg('Messages that know their context.'),
    body: msg(
      'One-to-one, groups, topics under a connection, spaces for a family, a team or a club. Ordered, delivered once, and yours offline.',
    ),
    sample: () =>
      bubble('them', tr('Did the contract arrive?')) +
      bubble('me', tr('Yes, signing it Friday.')) +
      note(tr('read · 2 min')),
  },
  {
    id: 'attention',
    name: msg('Attention'),
    title: msg('What needs you, not everything.'),
    body: msg(
      'The inbox sorts by what needs you, what’s important, what’s waiting on someone else and what’s quiet, and says why. Your rules by relationship win.',
    ),
    sample: () =>
      row(tag(tr('Needs you')), cell(esc(tr('Sarah asked about the contract')))) +
      row(tag(tr('Waiting'), 2), cell(esc(tr('Omar · the deck · since Tuesday')))) +
      note(tr('3 need you')),
  },
  {
    id: 'memory',
    name: msg('Memory'),
    title: msg('Nothing said is lost.'),
    body: msg(
      'Commitments, dates, amounts, questions and decisions are found in the conversation and offered back as actions. They become facts only when you say so.',
    ),
    sample: () =>
      row(tag(tr('Suggested'), 3), cell(esc(tr('Remind me: send the deck · Monday')))) +
      row(tag(tr('Suggested'), 3), cell(esc(tr('Waiting on Sarah: contract')))) +
      note(tr('based on “I’ll send the deck on Monday.”')),
  },
  {
    id: 'organizations',
    name: msg('Organizations'),
    title: msg('A business that proves it’s the business.'),
    body: msg(
      'An organization verifies its domain with one DNS record. Its team answers customers as the organization, in one inbox, with apps and an AI agent that always say what they are.',
    ),
    sample: () =>
      row(dot(3), who('Nile Dental', tr('verified · niledental.example'))) +
      row(tag(tr('Needs a reply')), cell(esc(tr('Lina · new patient forms')))),
  },
  {
    id: 'privacy',
    name: msg('Privacy'),
    title: msg('Each side of your life sees what you chose.'),
    body: msg(
      'Profile fields by sphere, read receipts only both ways, requests before strangers reach you, and end-to-end encryption when a conversation should be private.',
    ),
    sample: () =>
      row(mono(tr('work sees')), cell(esc(tr('name · headline · organization')))) +
      row(
        mono(tr('family sees')),
        cell(esc(tr('everything, and where you are when you share it'))),
      ) +
      row(mono(tr('a stranger sees')), cell(esc(tr('your name and handle, and may ask')))),
  },
];

const n = (x: number) => x.toLocaleString('en');
const gb = (bytes: number) => tr('{n} GB', { n: n(Math.round(bytes / 1024 ** 3)) });

/** A price as the page says it: "€29 a month", from Stripe's minor units. */
export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function priceLine(prices: PriceView[] | null, plan: PriceView['plan']): string {
  const mine = (prices ?? []).filter((p) => p.plan === plan);
  if (!mine.length) return `<span class="mono">${esc(tr('price shown in the app'))}</span>`;
  const month = mine.find((p) => p.interval === 'month');
  const year = mine.find((p) => p.interval === 'year');
  return [
    month
      ? tr('{price} a month', {
          price: `<strong>${esc(money(month.amount, month.currency))}</strong>`,
        })
      : null,
    year ? tr('{price} a year', { price: esc(money(year.amount, year.currency)) }) : null,
  ]
    .filter(Boolean)
    .join(tr(', or '));
}

/** One plan as a sheet of its own: its name, its price, what it includes. */
const plan = (
  id: string,
  name: string,
  price: string,
  rows: Array<[string, string]>,
  note?: string,
) =>
  `<section class="plan" aria-labelledby="plan-${id}">
    <h3 id="plan-${id}">${esc(name)}</h3>
    <p class="price">${price}</p>
    ${spec(rows)}
    ${note ? `<p class="small">${note}</p>` : ''}
  </section>`;

const BUSINESS_STEPS: ExplorerItem[] = [
  {
    id: 'writes',
    name: msg('A customer writes'),
    title: msg('It lands in the inbox, first if they’ve waited longest.'),
    body: msg(
      'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.',
    ),
    sample: () =>
      row(
        tag(tr('Needs a reply')),
        `<span><strong>Lina</strong> · ${esc(tr('Can I book a cleaning on Thursday?'))}</span>`,
      ) + note(tr('new · nobody has it · 2 min')),
  },
  {
    id: 'agent',
    name: msg('The agent answers'),
    title: msg('From what you wrote down, and it says so.'),
    body: msg(
      'The organization’s AI agent answers only from its knowledge (up to {n} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.',
    ),
    sample: () =>
      bubble('them', tr('I can offer Thursday 10:00 or 10:30. Which suits you?')) +
      row(tag(tr('Appointment'), 3), cell(esc(tr('Cleaning · Thursday 10:00 · requested')))) +
      note(tr('Nile Dental · AI agent · automated')),
  },
  {
    id: 'answers',
    name: msg('The team answers'),
    title: msg('Whoever answers has it; the customer hears from the organization.'),
    body: msg(
      'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.',
    ),
    sample: () =>
      bubble('me', tr('10:00 is yours. See you Thursday.')) +
      row(tag(tr('Waiting for the customer'), 2), cell(esc(tr('You have it')))),
  },
  {
    id: 'apps',
    name: msg('Your tools hear it'),
    title: msg('A helpdesk, a CRM or your own bot, in the same conversation.'),
    body: msg(
      'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.',
    ),
    sample: () =>
      row(tag('business.thread', 3), cell(esc(tr('resolved · by person')))) +
      row(tag('kit.moved', 3), cell(esc(tr('Booking · confirmed · by customer')))),
  },
];

const SIDES: ExplorerItem[] = [
  {
    id: 'work',
    name: msg('Work'),
    title: msg('A colleague sees the professional you.'),
    body: msg(
      'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.',
    ),
    sample: () =>
      row(mono(tr('sees')), cell(esc(tr('Noor Haddad · Dentist · Nile Dental')))) +
      row(mono(tr('doesn’t see')), cell(esc(tr('birthday · family · where you are')))),
  },
  {
    id: 'family',
    name: msg('Family'),
    title: msg('Family sees more, because you said so.'),
    body: msg(
      'What each sphere sees is a setting you own, field by field. Sharing your location live is one tap, for as long as you chose, and ends on its own.',
    ),
    sample: () =>
      row(
        mono(tr('sees')),
        cell(esc(tr('everything you chose, and where you are while you share it'))),
      ) + row(mono(tr('until')), cell(esc(tr('the hour you picked')))),
  },
  {
    id: 'stranger',
    name: msg('A stranger'),
    title: msg('A stranger may ask. Nothing more.'),
    body: msg(
      'Someone who isn’t connected to you sees your name and handle, if you let yourself be found. Their first message arrives as a request: one message until you answer.',
    ),
    sample: () =>
      row(
        tag(tr('Request'), 2),
        `<span><strong>Sami</strong> · ${esc(tr('Hi Noor, found you!'))}</span>`,
      ) + note(tr('one message until you answer · decline and they never know')),
  },
  {
    id: 'customer',
    name: msg('A customer'),
    title: msg('A customer sees the organization, never its people.'),
    body: msg(
      'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.',
    ),
    sample: () => row(dot(3), who('Nile Dental', tr('verified · answered in an hour'))),
  },
];

/** Every explorer on the site, by input group, for the CSS that picks a panel. */
export const EXPLORERS: ReadonlyArray<{ group: string; items: ExplorerItem[] }> = [
  { group: 'layer', items: LANDING_LAYERS },
  { group: 'step', items: BUSINESS_STEPS },
  { group: 'sees', items: SIDES },
];

export interface SitePage {
  title: string;
  description: string;
  body: string;
}

const cta = (facts: Pick<SiteFacts, 'linkLang'> | null, links: Array<[string, string]>) =>
  `<p class="cta">${links
    .map(
      ([href, text], i) =>
        `<a href="${siteHref(href, facts)}"${i ? ' class="quiet"' : ''}>${esc(text)}</a>`,
    )
    .join(' ')}</p>`;

const people = (count: number) => trn(count, '{n} person', '{n} people', { n: n(count) });
const aDay = (count: number, what: 'actions' | 'conversations' | 'answers') =>
  what === 'actions'
    ? tr('{n} actions a day', { n: n(count) })
    : what === 'conversations'
      ? tr('{n} conversations a day', { n: n(count) })
      : tr('{n} answers a day', { n: n(count) });

/** The landing page: what Caime is, its spec sheet and its layers. */
export function renderLanding(facts: SiteFacts | null): SitePage {
  return {
    title: `${SITE_NAME}: ${tr(PROMISE).replace(/[.。]$/, '')}`,
    description: tr(LANDING_DESCRIPTION),
    body: `
<main class="pub pub-home" ${langAttrs()}>
  ${masthead('/', facts)}
  <section class="hero">
    <h1>${esc(tr(PROMISE))}</h1>
    <p class="lead">${esc(
      tr(
        'Your family, your work and your customers don’t belong in one list. Say who each person is to you, once. From then on Caime knows what needs you first, who may reach you when, what was decided and what’s owed, and what each side of your life sees of you.',
      ),
    )}</p>
    ${cta(facts, [
      ['/sign-up', tr('Start free')],
      ['/sign-in', tr('Sign in')],
    ])}
  </section>
  <section class="sheet" aria-labelledby="sheet-title">
    <h2 id="sheet-title" class="mono">${esc(tr('Specification'))}</h2>
    ${spec([
      [tr('primary object'), esc(tr('The connection between two people, not the chat.'))],
      [
        tr('to connect'),
        esc(
          tr(
            'Connect in three taps. Say how you know someone; the conversation, its notifications and its cards fit the relationship.',
          ),
        ),
      ],
      [
        tr('attention'),
        esc(tr('“3 need you”, never “47 unread”. The inbox puts what matters first and says why.')),
      ],
      [
        tr('memory'),
        esc(
          tr(
            'Commitments, dates, amounts and decisions are found in the conversation and offered as actions. You decide; nothing is written for you.',
          ),
        ),
      ],
      [
        tr('organizations'),
        esc(
          tr(
            'A business proves its domain with one DNS record; its team answers as the organization, in one inbox, and customers book from its open slots.',
          ),
        ),
      ],
      [
        tr('privacy'),
        esc(
          tr(
            'Each side of your life sees what you chose. End-to-end encrypted when you say so, with a recovery key only you hold.',
          ),
        ),
      ],
      [
        tr('money'),
        esc(tr('Never held or moved by Caime. A split records who owes whom; nothing else.')),
      ],
      [
        tr('price'),
        esc(tr('Free for people, always. Organizations start free and can buy Business.')),
      ],
      [tr('runs on'), esc(tr('Web, iOS and Android, from one account.'))],
    ])}
  </section>
  ${explorer('layer', tr('Layers · pick one'), LANDING_LAYERS)}
  <section class="hero">
    ${cta(facts, [
      ['/business', tr('For organizations')],
      ['/pricing', tr('Pricing')],
      ['/security', tr('Security')],
    ])}
  </section>
  ${footer(facts)}
</main>`,
  };
}

export function renderSite(page: MarketingPage, facts: SiteFacts): SitePage {
  const p = PERSON_ALLOWANCES;
  const o = ORG_ALLOWANCES;
  const main = `<main class="pub pub-home pub-site" ${langAttrs()}>`;
  const sheetTitle = (id: string) => `<h2 id="${id}" class="mono">${esc(tr('Specification'))}</h2>`;
  switch (page) {
    case 'business':
      return {
        title: tr('{site} for organizations: answer as the organization, and prove it’s you', {
          site: SITE_NAME,
        }),
        description: tr(
          'A clinic, a shop, a school or a nonprofit verifies its domain with one DNS record and answers customers as the organization, in one inbox, with an AI agent and apps that always say what they are. Free for a team of three.',
        ),
        body: `
${main}
  ${masthead('/business', facts)}
  <section class="hero">
    <h1>${esc(tr('Answer as the organization, and prove it’s you.'))}</h1>
    <p class="lead">${esc(
      tr(
        'A clinic, a shop, a school, a nonprofit or a public service gets a profile people can trust once it verifies its domain, and one inbox where its team answers customers as the organization. Customers write from the app they already use for everyone else in their life.',
      ),
    )}</p>
    ${cta(facts, [
      ['/sign-up', tr('Start free')],
      ['/pricing', tr('Pricing')],
    ])}
  </section>
  <section class="sheet" aria-labelledby="business-sheet">
    ${sheetTitle('business-sheet')}
    ${spec([
      [
        tr('verification'),
        esc(
          tr(
            'One TXT record on your domain. Verified shows on your page and beside your team; it is checked, never bought, and yours again if you ever close and come back.',
          ),
        ),
      ],
      [
        tr('the inbox'),
        esc(
          tr(
            'Every customer conversation in one place, sorted by who has waited longest, in six views: {views}.',
            {
              views: BUSINESS_VIEWS.map((v) => tr(BUSINESS_VIEW_LABELS[v]).toLowerCase()).join(
                tr(', '),
              ),
            },
          ),
        ),
      ],
      [
        tr('the team'),
        esc(
          tr(
            'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.',
          ),
        ),
      ],
      [
        tr('writing first'),
        esc(
          tr(
            'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.',
          ),
        ),
      ],
      [
        tr('the ai agent'),
        esc(
          tr(
            'Answers from what you wrote down (up to {n} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.',
            { n: n(AGENT_KNOWLEDGE_MAX) },
          ),
        ),
      ],
      [
        tr('bookings'),
        esc(
          tr(
            'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.',
          ),
        ),
      ],
      [
        tr('apps'),
        esc(
          tr(
            'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.',
          ),
        ),
      ],
      [
        tr('updates'),
        esc(
          tr(
            'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.',
          ),
        ),
      ],
      [
        tr('spaces'),
        esc(
          tr(
            'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.',
          ),
        ),
      ],
      [
        tr('calls'),
        esc(
          tr('Voice and video, one to one and in groups of up to {n}, in the browser.', {
            n: GROUP_CALL_MAX,
          }),
        ),
      ],
      [
        tr('insights'),
        esc(
          tr(
            'How fast the team answers, how many customers write and what is still open. On Business.',
          ),
        ),
      ],
      [
        tr('price'),
        tr('Free for a team of {team}, with {apps}. Business for the rest: {pricing}.', {
          team: o.free.teamSize,
          apps: o.free.apps === 1 ? tr('one app') : tr('{n} apps', { n: o.free.apps }),
          pricing: `<a href="${siteHref('/pricing', facts)}">${esc(tr('pricing'))}</a>`,
        }),
      ],
    ])}
  </section>
  ${explorer('step', tr('A customer’s day · pick a step'), BUSINESS_STEPS)}
  <section class="hero">
    ${cta(facts, [
      ['/sign-up', tr('Start free')],
      ['/developers', tr('For developers')],
    ])}
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'pricing':
      return {
        title: tr('{site} pricing: free for people, organizations pay for their team', {
          site: SITE_NAME,
        }),
        description: tr(
          'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.',
        ),
        body: `
${main}
  ${masthead('/pricing', facts)}
  <section class="hero">
    <h1>${esc(tr('Free for people. Organizations pay for their team.'))}</h1>
    <p class="lead">${esc(
      tr(
        'What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.',
      ),
    )}</p>
  </section>
  <section class="sheet" aria-labelledby="people-plans">
    <h2 id="people-plans" class="mono">${esc(tr('For people'))}</h2>
    <div class="plans">
      ${plan(
        'personal',
        tr('Personal'),
        `<strong>${esc(tr('Free'))}</strong>${esc(tr(', always'))}`,
        [
          [
            tr('ai assist'),
            esc(tr('{n} actions a day, once you turn it on', { n: n(p.personal.aiPerDay) })),
          ],
          [tr('files'), esc(gb(p.personal.storageBytes))],
          [tr('automations'), n(p.personal.automations)],
          [
            tr('everything else'),
            esc(tr('connections, attention, memory, spaces, calls, private conversations')),
          ],
        ],
      )}
      ${plan('pro', tr('Pro'), priceLine(facts.prices, 'pro'), [
        [tr('ai assist'), esc(aDay(p.pro.aiPerDay, 'actions'))],
        [tr('files'), esc(gb(p.pro.storageBytes))],
        [tr('automations'), n(p.pro.automations)],
        [
          tr('insights'),
          esc(tr('how your relationships are going, from your own messages, for you only')),
        ],
      ])}
    </div>
  </section>
  <section class="sheet" aria-labelledby="org-plans">
    <h2 id="org-plans" class="mono">${esc(tr('For organizations'))}</h2>
    <div class="plans plans-3">
      ${plan('free', tr('Free'), `<strong>${esc(tr('Free'))}</strong>`, [
        [tr('team'), esc(people(o.free.teamSize))],
        [tr('apps'), n(o.free.apps)],
        [tr('writing first'), esc(aDay(o.free.startsPerDay, 'conversations'))],
        [tr('ai agent'), esc(aDay(o.free.agentRepliesPerDay, 'answers'))],
      ])}
      ${plan('business', tr('Business'), priceLine(facts.prices, 'business'), [
        [tr('team'), esc(people(o.business.teamSize))],
        [tr('apps'), n(o.business.apps)],
        [tr('writing first'), esc(aDay(o.business.startsPerDay, 'conversations'))],
        [tr('ai agent'), esc(aDay(o.business.agentRepliesPerDay, 'answers'))],
        [tr('insights'), esc(tr('how fast the team answers, who is waiting, what is open'))],
      ])}
      ${plan(
        'enterprise',
        tr('Enterprise'),
        `<a href="mailto:${esc(facts.contactEmail)}">${esc(tr('Talk to us'))}</a>`,
        [
          [tr('team'), esc(people(o.enterprise.teamSize))],
          [tr('apps'), n(o.enterprise.apps)],
          [tr('writing first'), esc(aDay(o.enterprise.startsPerDay, 'conversations'))],
          [tr('ai agent'), esc(aDay(o.enterprise.agentRepliesPerDay, 'answers'))],
          [tr('insights'), esc(tr('included'))],
        ],
      )}
    </div>
  </section>
  <section class="sheet" aria-labelledby="pricing-rules">
    <h2 id="pricing-rules" class="mono">${esc(tr('The rules'))}</h2>
    ${spec([
      [
        tr('never counted'),
        esc(
          tr(
            'A conversation a customer starts. Anyone who writes to you. Your connections, however many.',
          ),
        ),
      ],
      [
        tr('a lower plan'),
        esc(
          tr(
            'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.',
          ),
        ),
      ],
      [
        tr('paying'),
        esc(
          tr(
            'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.',
          ),
        ),
      ],
      [tr('a seat'), esc(tr('on a Business or Enterprise team includes everything Pro does.'))],
    ])}
  </section>
  <section class="hero">
    ${cta(facts, [
      ['/sign-up', tr('Start free')],
      ['/business', tr('For organizations')],
    ])}
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'security':
      return {
        title: tr('{site} security and privacy: each side of your life sees what you chose', {
          site: SITE_NAME,
        }),
        description: tr(
          'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.',
        ),
        body: `
${main}
  ${masthead('/security', facts)}
  <section class="hero">
    <h1>${esc(tr('Each side of your life sees what you chose.'))}</h1>
    <p class="lead">${esc(
      tr(
        'Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.',
      ),
    )}</p>
  </section>
  ${explorer('sees', tr('Who sees what · pick a side'), SIDES)}
  <section class="sheet" aria-labelledby="security-sheet">
    ${sheetTitle('security-sheet')}
    ${spec([
      [
        tr('your labels'),
        esc(
          tr(
            'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.',
          ),
        ),
      ],
      [tr('read receipts'), esc(tr('Only both ways: you see theirs when they see yours.'))],
      [
        tr('strangers'),
        esc(
          tr(
            'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.',
          ),
        ),
      ],
      [
        tr('under 18'),
        esc(
          tr(
            'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.',
          ),
        ),
      ],
      [
        tr('private conversations'),
        esc(
          tr(
            'End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to {people} people, {devices} devices each.',
            { people: PRIVATE_GROUP_MAX, devices: MAX_DEVICES },
          ),
        ),
      ],
      [
        tr('your devices'),
        esc(
          tr(
            'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.',
          ),
        ),
      ],
      [
        tr('recovery'),
        esc(
          tr(
            'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.',
          ),
        ),
      ],
      [
        tr('what isn’t hidden'),
        esc(
          tr(
            'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.',
          ),
        ),
      ],
      [
        tr('blocks and reports'),
        esc(
          tr(
            'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.',
          ),
        ),
      ],
      [
        tr('your data'),
        esc(
          tr(
            'Download all of it, or delete your account, from Settings. Ended sign-ins are kept {signIns} days, security records {records}, a handle you let go of {handles} from everyone.',
            {
              signIns: KEPT_DAYS.endedSignIns,
              records:
                KEPT_DAYS.securityRecords === 365
                  ? tr('a year')
                  : tr('{n} days', { n: KEPT_DAYS.securityRecords }),
              handles:
                KEPT_DAYS.heldHandles === 365
                  ? tr('a year')
                  : tr('{n} days', { n: KEPT_DAYS.heldHandles }),
            },
          ),
        ),
      ],
      [
        tr('the server'),
        esc(
          tr(
            'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.',
          ),
        ),
      ],
      [
        tr('money'),
        esc(tr('Never held or moved by Caime. A split records who owes whom; nothing else.')),
      ],
      [
        tr('ai'),
        esc(
          tr(
            'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.',
          ),
        ),
      ],
    ])}
  </section>
  <section class="hero">
    ${cta(facts, [
      ['/privacy', tr('Read the privacy policy')],
      [`mailto:${esc(facts.contactEmail)}`, tr('Report a concern')],
    ])}
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'developers':
      return {
        title: tr('{site} for developers: an API that reaches only what it was given', {
          site: SITE_NAME,
        }),
        description: tr(
          'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.',
        ),
        body: `
${main}
  ${masthead('/developers', facts)}
  <section class="hero">
    <h1>${esc(tr('An API that reaches only what it was given.'))}</h1>
    <p class="lead">${esc(
      tr(
        'Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.',
      ),
    )}</p>
  </section>
  <section class="sheet" aria-labelledby="dev-sheet">
    ${sheetTitle('dev-sheet')}
    ${spec([
      [
        tr('apps'),
        esc(
          tr(
            'Added on the organization’s page. Each has its own bot on the team, a token shown once, and a webhook signed with a secret shown once. Replace either and the old one stops at once.',
          ),
        ),
      ],
      [
        tr('permissions'),
        tr('{scopes}: given one by one. A route the token can’t use answers 403.', {
          scopes: [
            'inbox:read',
            'messages:read',
            'messages:write',
            'threads:write',
            'updates',
            'kits',
          ]
            .map((s) => `<code>${s}</code>`)
            .join(tr(', ')),
        }),
      ],
      [
        tr('webhooks'),
        tr(
          '{events}. Signed, https only, no private addresses, one deadline for the whole exchange.',
          {
            events: ['business.message', 'business.thread', 'kit.posted', 'kit.moved', 'ping']
              .map((s) => `<code>${s}</code>`)
              .join(tr(', ')),
          },
        ),
      ],
      [
        tr('your own cards'),
        esc(
          tr(
            'Define a kind of card with fields and states. Your bot sends it, the team and the customer move it, and you hear when they do.',
          ),
        ),
      ],
      [
        tr('idempotent'),
        tr(
          'Every write carries a {clientId}. Sending it again returns the first result, never a second message.',
          {
            clientId: '<code>clientId</code>',
          },
        ),
      ],
      [tr('rate'), esc(tr('{n} requests a minute per token.', { n: 600 }))],
      [
        tr('the sdk'),
        tr(
          '{sdk}: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.',
          {
            sdk: '<code>@caime/sdk</code>',
          },
        ),
      ],
      [
        tr('personal tokens'),
        tr(
          'A person makes a token for their own scripts ({scopes}). It never reaches the account itself.',
          {
            scopes: [
              'profile:read',
              'messages:read',
              'messages:write',
              'actions:read',
              'actions:write',
            ]
              .map((s) => `<code>${s}</code>`)
              .join(tr(', ')),
          },
        ),
      ],
      [
        tr('oauth'),
        esc(
          tr(
            'Third-party apps ask people for consent (OAuth 2.0; errors as RFC 6749 and 7009 say), hold only what they were given, and can be revoked any time from Settings.',
          ),
        ),
      ],
      [
        tr('the guide'),
        esc(
          tr('In the app: Settings → Developer, and beside each app on the organization’s page.'),
        ),
      ],
    ])}
  </section>
  <section class="hero">
    ${cta(facts, [
      ['/sign-up', tr('Start free')],
      ['/business', tr('For organizations')],
    ])}
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'about': {
      const mail = `<a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>`;
      return {
        title: tr('About {site}', { site: SITE_NAME }),
        description: tr(
          '{site} is made by {maker}: a communication product, and only that. It never holds or moves money, runs no third-party code and has no feed. The primary object is the connection between two people, not the chat.',
          { site: SITE_NAME, maker: facts.legalName },
        ),
        body: `
${main}
  ${masthead('/about', facts)}
  <section class="hero">
    <h1>${esc(tr('Made for the people in your life, not for a feed.'))}</h1>
    <p class="lead">${esc(
      tr(
        '{site} is made by {maker}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.',
        { site: SITE_NAME, maker: facts.legalName },
      ),
    )}</p>
  </section>
  <section class="sheet" aria-labelledby="about-sheet">
    ${sheetTitle('about-sheet')}
    ${spec([
      [tr('made by'), `${esc(facts.legalName)} · ${mail}`],
      [
        tr('what it is'),
        esc(
          tr(
            'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.',
          ),
        ),
      ],
      [
        tr('what it isn’t'),
        esc(tr('A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.')),
      ],
      [
        tr('the characters'),
        esc(
          tr(
            'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.',
          ),
        ),
      ],
      [
        tr('how it’s built'),
        esc(
          tr(
            'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.',
          ),
        ),
      ],
      [tr('your say'), tr('Questions, ideas and concerns go to {mail}.', { mail })],
      [tr('runs on'), esc(tr('Web, iOS and Android.'))],
    ])}
  </section>
  <section class="hero">
    ${cta(facts, [
      ['/sign-up', tr('Start free')],
      ['/sign-in', tr('Sign in')],
    ])}
  </section>
  ${footer(facts)}
</main>`,
      };
    }
  }
}
