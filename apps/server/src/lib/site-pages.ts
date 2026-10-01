/**
 * Caime's public site (R44, R50): the pages about Caime a visitor reads before signing in, in
 * the app's shell but without its scripts. Each is a spec sheet, in sentence case with mono
 * labels, and an explorer where one earns its place: radio inputs and CSS pick a panel, so a
 * page stays a page. What they say is what the code does: every number here is read from the
 * plans, the encryption design, the retention spans and the API's guide, never typed twice.
 *
 * The landing page is in public-pages.ts; it shares the masthead, the nav and the explorer.
 */

import { AGENT_KNOWLEDGE_MAX } from '@caime/core/agents';
import type { MarketingPage } from '@caime/core/api';
import type { PriceView } from '@caime/core/billing';
import { BUSINESS_VIEW_LABELS, BUSINESS_VIEWS } from '@caime/core/business';
import { GROUP_CALL_MAX } from '@caime/core/calls';
import { MAX_DEVICES, PRIVATE_GROUP_MAX } from '@caime/core/e2ee';
import { ORG_ALLOWANCES, PERSON_ALLOWANCES } from '@caime/core/plans';
import { KEPT_DAYS } from './retention';

export const SITE_NAME = 'Caime';
export const PROMISE = 'Messaging that understands your relationships.';

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** What the pages say about who runs this Caime, and what it charges. */
export interface SiteFacts {
  legalName: string;
  contactEmail: string;
  /** Pro's and Business's prices in Stripe, or null where billing isn't connected. */
  prices: PriceView[] | null;
}

/** The site's pages, in the order the nav lists them; `home` is the landing page. */
export const SITE_NAV: ReadonlyArray<{ path: string; label: string; kicker: string }> = [
  { path: '/', label: 'Home', kicker: 'messaging that understands your relationships' },
  { path: '/business', label: 'For organizations', kicker: 'for organizations' },
  { path: '/pricing', label: 'Pricing', kicker: 'pricing' },
  { path: '/security', label: 'Security', kicker: 'security and privacy' },
  { path: '/developers', label: 'Developers', kicker: 'developers' },
  { path: '/about', label: 'About', kicker: 'about' },
];

/** The masthead every page of the site shares: the wordmark, what this page is, the nav. */
export function masthead(current: string): string {
  const here = SITE_NAV.find((n) => n.path === current);
  const links = SITE_NAV.map(
    (n) =>
      `<a href="${n.path}"${n.path === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`,
  );
  links.push('<a href="/sign-in">Sign in</a>');
  return `<header class="masthead">
    <a class="wordmark" href="/">${SITE_NAME}</a>
    <span class="mono">${esc(here?.kicker ?? '')}</span>
    <nav class="sitenav mono" aria-label="${SITE_NAME}">${links.join('\n      ')}</nav>
  </header>`;
}

export function footer(facts: Pick<SiteFacts, 'contactEmail'> | null): string {
  const mail = facts
    ? ` · <a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>`
    : '';
  return `<footer class="foot">
    <p class="small"><a href="/help">Help</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>${mail}</p>
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
  name: string;
  title: string;
  body: string;
  /** Drawn as the app draws it (already HTML). */
  sample: string;
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
            `<label for="${id(i)}" role="listitem"><span class="mono">0${n + 1}</span> ${esc(i.name)}</label>`,
        )
        .join('\n      ')}
    </div>
    <div class="panels">
      ${items
        .map(
          (i, n) => `<article class="panel" id="panel-${id(i)}">
        <p class="mono">0${n + 1} · ${esc(i.name)}</p>
        <h3>${esc(i.title)}</h3>
        <p>${esc(i.body)}</p>
        <div class="sample" aria-label="Example">${i.sample}</div>
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

/**
 * The landing page's layer explorer: Caime as it's built, one layer at a time, each with an
 * example drawn as the app draws it.
 */
export const LANDING_LAYERS: ExplorerItem[] = [
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

const n = (x: number) => x.toLocaleString('en');
const gb = (bytes: number) => `${n(Math.round(bytes / 1024 ** 3))} GB`;

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
  if (!mine.length) return '<span class="mono">price shown in the app</span>';
  const month = mine.find((p) => p.interval === 'month');
  const year = mine.find((p) => p.interval === 'year');
  return [
    month ? `<strong>${esc(money(month.amount, month.currency))}</strong> a month` : null,
    year ? `${esc(money(year.amount, year.currency))} a year` : null,
  ]
    .filter(Boolean)
    .join(', or ');
}

/** One plan as a sheet of its own: its name, its price, what it includes. */
const plan = (name: string, price: string, rows: Array<[string, string]>, note?: string) =>
  `<section class="plan" aria-labelledby="plan-${name.toLowerCase()}">
    <h3 id="plan-${name.toLowerCase()}">${esc(name)}</h3>
    <p class="price">${price}</p>
    ${spec(rows)}
    ${note ? `<p class="small">${note}</p>` : ''}
  </section>`;

const BUSINESS_STEPS: ExplorerItem[] = [
  {
    id: 'writes',
    name: 'A customer writes',
    title: 'It lands in the inbox, first if they’ve waited longest.',
    body: 'Lina writes to Nile Dental from the app she uses for everyone else. The team sees one conversation, its state and who has it; Lina sees the organization, never which person.',
    sample: `<div class="row"><span class="tag">Customer waiting</span><span><strong>Lina</strong> · Can I book a cleaning on Thursday?</span></div>
<div class="mono">new · nobody has it · 2 min</div>`,
  },
  {
    id: 'agent',
    name: 'The agent answers',
    title: 'From what you wrote down, and it says so.',
    body: `The organization’s AI agent answers only from its knowledge (up to ${n(AGENT_KNOWLEDGE_MAX)} characters you gave it), is marked as an AI, and hands over to a person the moment it isn’t sure. With bookable hours set, it offers the open slots and books the one the customer picks, for the team to confirm.`,
    sample: `<div class="bubble them">I can offer Thursday 10:00 or 10:30. Which suits you?</div>
<div class="row"><span class="tag tag-3">Appointment</span><span>Cleaning · Thursday 10:00 · requested</span></div>
<div class="mono">Nile Dental · AI agent · automated</div>`,
  },
  {
    id: 'answers',
    name: 'The team answers',
    title: 'Whoever answers has it; the customer hears from the organization.',
    body: 'Answering takes the conversation. Assign it, escalate it to an owner or admin with a note, or resolve it; it comes back the moment the customer writes again.',
    sample: `<div class="bubble me">10:00 is yours. See you Thursday.</div>
<div class="row"><span class="tag tag-2">Waiting on customer</span><span>You have it</span></div>`,
  },
  {
    id: 'apps',
    name: 'Your tools hear it',
    title: 'A helpdesk, a CRM or your own bot, in the same conversation.',
    body: 'An app’s bot replies as the organization, marked automated, and never counts as the team’s answer. Its webhook hears each message and each change of state.',
    sample: `<div class="row"><span class="tag tag-3">business.thread</span><span>resolved · by person</span></div>
<div class="row"><span class="tag tag-3">kit.moved</span><span>Booking · confirmed · by customer</span></div>`,
  },
];

const SIDES: ExplorerItem[] = [
  {
    id: 'work',
    name: 'Work',
    title: 'A colleague sees the professional you.',
    body: 'Name, headline, organization, the hours you answer in. Your birthday, your family and your location stay out of it unless you say otherwise.',
    sample: `<div class="row"><span class="mono">sees</span><span>Noor Haddad · Dentist · Nile Dental</span></div>
<div class="row"><span class="mono">doesn’t see</span><span>birthday · family · where you are</span></div>`,
  },
  {
    id: 'family',
    name: 'Family',
    title: 'Family sees more, because you said so.',
    body: 'What each sphere sees is a setting you own, field by field. Sharing your location live is one tap, for as long as you chose, and ends on its own.',
    sample: `<div class="row"><span class="mono">sees</span><span>everything you chose, and where you are while you share it</span></div>
<div class="row"><span class="mono">until</span><span>the hour you picked</span></div>`,
  },
  {
    id: 'stranger',
    name: 'A stranger',
    title: 'A stranger may ask. Nothing more.',
    body: 'Someone who isn’t connected to you sees your name and handle, if you let yourself be found. Their first message arrives as a request: one message until you answer.',
    sample: `<div class="row"><span class="tag tag-2">Request</span><span><strong>Sami</strong> · Hi Noor, found you!</span></div>
<div class="mono">one message until you answer · decline and they never know</div>`,
  },
  {
    id: 'customer',
    name: 'A customer',
    title: 'A customer sees the organization, never its people.',
    body: 'In a business conversation the team’s names and ids are masked everywhere: messages, read receipts, suggestions, exports. Anything filed for the customer names the organization.',
    sample: `<div class="row"><span class="dot dot-3"></span><span><strong>Nile Dental</strong><br><span class="mono">verified · answered in an hour</span></span></div>`,
  },
];

/** Every explorer on the site, by input group, for the CSS that picks a panel. */
export const EXPLORERS: ReadonlyArray<{ group: string; items: ExplorerItem[] }> = [
  { group: 'layer', items: LANDING_LAYERS },
  { group: 'step', items: BUSINESS_STEPS },
  { group: 'sees', items: SIDES },
];

export function renderSite(
  page: MarketingPage,
  facts: SiteFacts,
): { title: string; description: string; body: string } {
  const p = PERSON_ALLOWANCES;
  const o = ORG_ALLOWANCES;
  switch (page) {
    case 'business':
      return {
        title: `${SITE_NAME} for organizations: answer as the organization, and prove it’s you`,
        description:
          'A clinic, a shop, a school or a nonprofit verifies its domain with one DNS record and answers customers as the organization, in one inbox, with an AI agent and apps that always say what they are. Free for a team of three.',
        body: `
<main class="pub pub-home pub-site">
  ${masthead('/business')}
  <section class="hero">
    <h1>Answer as the organization, and prove it’s you.</h1>
    <p class="lead">A clinic, a shop, a school, a nonprofit or a public service gets a profile people can trust once it verifies its domain, and one inbox where its team answers customers as the organization. Customers write from the app they already use for everyone else in their life.</p>
    <p class="cta"><a href="/sign-up">Start free</a> <a href="/pricing" class="quiet">Pricing</a></p>
  </section>
  <section class="sheet" aria-labelledby="business-sheet">
    <h2 id="business-sheet" class="mono">Specification</h2>
    ${spec([
      [
        'verification',
        'One TXT record on your domain. Verified shows on your page and beside your team; it is checked, never bought, and yours again if you ever close and come back.',
      ],
      [
        'the inbox',
        `Every customer conversation in one place, sorted by who has waited longest, in six views: ${BUSINESS_VIEWS.map((v) => BUSINESS_VIEW_LABELS[v].toLowerCase()).join(', ')}.`,
      ],
      [
        'the team',
        'Owners, admins and members. A customer sees the organization, never which person answered. A seat that ends takes nothing with it.',
      ],
      [
        'writing first',
        'Your team may write to someone first. It arrives as a request: one message until they answer, and their answer opens the conversation.',
      ],
      [
        'the ai agent',
        `Answers from what you wrote down (up to ${n(AGENT_KNOWLEDGE_MAX)} characters), is marked as an AI, and hands over to a person the moment it isn’t sure. It never speaks for the team.`,
      ],
      [
        'bookings',
        'Set bookable hours once. Customers pick from the open slots, your AI agent offers the next few and books the one they choose, and every booking is an appointment your team confirms.',
      ],
      [
        'apps',
        'A helpdesk, a CRM or your own bot: a token that reaches only your conversations, a signed webhook, and cards of your own design.',
      ],
      [
        'updates',
        'Post to everyone who follows you. Nobody sees who follows, and nothing about following reaches anyone’s inbox.',
      ],
      [
        'spaces',
        'Spaces for the team, a project or a branch, started from the organization’s page, with your team already there to pick from.',
      ],
      [
        'calls',
        `Voice and video, one to one and in groups of up to ${GROUP_CALL_MAX}, in the browser.`,
      ],
      [
        'insights',
        'How fast the team answers, how many customers write and what is still open. On Business.',
      ],
      [
        'price',
        `Free for a team of ${o.free.teamSize}, with ${o.free.apps === 1 ? 'one app' : `${o.free.apps} apps`}. Business for the rest: <a href="/pricing">pricing</a>.`,
      ],
    ])}
  </section>
  ${explorer('step', 'A customer’s day · pick a step', BUSINESS_STEPS)}
  <section class="hero">
    <p class="cta"><a href="/sign-up">Start free</a> <a href="/developers" class="quiet">For developers</a></p>
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'pricing':
      return {
        title: `${SITE_NAME} pricing: free for people, organizations pay for their team`,
        description:
          'What makes Caime Caime is never counted. People use it free; Pro adds AI, storage, automations and insights. Organizations start free for a team of three and buy Business for the rest.',
        body: `
<main class="pub pub-home pub-site">
  ${masthead('/pricing')}
  <section class="hero">
    <h1>Free for people. Organizations pay for their team.</h1>
    <p class="lead">What makes Caime Caime is never counted: connections, relationships, what needs you, what you’re waiting for, search and sync are in every plan. Plans differ only in what costs money to run, and in what organizations buy.</p>
  </section>
  <section class="sheet" aria-labelledby="people-plans">
    <h2 id="people-plans" class="mono">For people</h2>
    <div class="plans">
      ${plan('Personal', '<strong>Free</strong>, always', [
        ['ai assist', `${n(p.personal.aiPerDay)} actions a day, once you turn it on`],
        ['files', gb(p.personal.storageBytes)],
        ['automations', n(p.personal.automations)],
        ['everything else', 'connections, attention, memory, spaces, calls, private conversations'],
      ])}
      ${plan('Pro', priceLine(facts.prices, 'pro'), [
        ['ai assist', `${n(p.pro.aiPerDay)} actions a day`],
        ['files', gb(p.pro.storageBytes)],
        ['automations', n(p.pro.automations)],
        ['insights', 'how your relationships are going, from your own messages, for you only'],
      ])}
    </div>
  </section>
  <section class="sheet" aria-labelledby="org-plans">
    <h2 id="org-plans" class="mono">For organizations</h2>
    <div class="plans plans-3">
      ${plan('Free', '<strong>Free</strong>', [
        ['team', `${o.free.teamSize} people`],
        ['apps', n(o.free.apps)],
        ['writing first', `${n(o.free.startsPerDay)} conversations a day`],
        ['ai agent', `${n(o.free.agentRepliesPerDay)} answers a day`],
      ])}
      ${plan('Business', priceLine(facts.prices, 'business'), [
        ['team', `${n(o.business.teamSize)} people`],
        ['apps', n(o.business.apps)],
        ['writing first', `${n(o.business.startsPerDay)} conversations a day`],
        ['ai agent', `${n(o.business.agentRepliesPerDay)} answers a day`],
        ['insights', 'how fast the team answers, who is waiting, what is open'],
      ])}
      ${plan('Enterprise', `<a href="mailto:${esc(facts.contactEmail)}">Talk to us</a>`, [
        ['team', `${n(o.enterprise.teamSize)} people`],
        ['apps', n(o.enterprise.apps)],
        ['writing first', `${n(o.enterprise.startsPerDay)} conversations a day`],
        ['ai agent', `${n(o.enterprise.agentRepliesPerDay)} answers a day`],
        ['insights', 'included'],
      ])}
    </div>
  </section>
  <section class="sheet" aria-labelledby="pricing-rules">
    <h2 id="pricing-rules" class="mono">The rules</h2>
    ${spec([
      [
        'never counted',
        'A conversation a customer starts. Anyone who writes to you. Your connections, however many.',
      ],
      [
        'a lower plan',
        'takes nothing away: nobody is removed from a team and no app stops. It only stops new additions until they fit.',
      ],
      [
        'paying',
        'Through Stripe, by card. Cancel whenever you like: it stays on until the end of what you paid for, and nothing you use today goes away after.',
      ],
      ['a seat', 'on a Business or Enterprise team includes everything Pro does.'],
    ])}
  </section>
  <section class="hero">
    <p class="cta"><a href="/sign-up">Start free</a> <a href="/business" class="quiet">For organizations</a></p>
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'security':
      return {
        title: `${SITE_NAME} security and privacy: each side of your life sees what you chose`,
        description:
          'How you describe people is only ever yours. Profile by sphere, read receipts both ways only, requests before strangers, end-to-end encryption with a recovery key you hold, and a server that keeps envelopes, not words.',
        body: `
<main class="pub pub-home pub-site">
  ${masthead('/security')}
  <section class="hero">
    <h1>Each side of your life sees what you chose.</h1>
    <p class="lead">Privacy in Caime isn’t a setting you find later. How you describe someone is only ever yours, what each sphere of your life sees of you is decided by you, field by field, and a conversation that should be private is encrypted so that not even Caime can read it.</p>
  </section>
  ${explorer('sees', 'Who sees what · pick a side', SIDES)}
  <section class="sheet" aria-labelledby="security-sheet">
    <h2 id="security-sheet" class="mono">Specification</h2>
    ${spec([
      [
        'your labels',
        'How you describe the people you know (family, work, a client) is yours. The person you describe sees it only if you both turn on sharing; nobody else ever does.',
      ],
      ['read receipts', 'Only both ways: you see theirs when they see yours.'],
      [
        'strangers',
        'A message from someone you don’t know arrives as a request: one message until you answer. Declined, they never know.',
      ],
      [
        'under 18',
        'No public page, no money cards, no messages from organizations they didn’t write to first, and adults are told when a conversation includes a minor.',
      ],
      [
        'private conversations',
        `End to end encrypted: a fresh AES-256-GCM key for every message, wrapped for each device allowed to read it with P-256 ECDH and HKDF, and the whole envelope signed by the device that sent it. The server keeps envelopes, never words. Up to ${PRIVATE_GROUP_MAX} people, ${MAX_DEVICES} devices each.`,
      ],
      [
        'your devices',
        'A new device reads nothing until you say it’s yours on one you already have. Your security code is your first device’s, so it stays the same as you add devices and changes only when you start over.',
      ],
      [
        'recovery',
        'A recovery key you hold, shown once, brings your private conversations back when every device is gone. Caime keeps nothing of it.',
      ],
      [
        'what isn’t hidden',
        'Who is in a conversation, when messages are sent and how long they are, and reactions. The app says so.',
      ],
      [
        'blocks and reports',
        'A block stops every write, both ways. Reports are read by a person and acted on; every action is in the audit log.',
      ],
      [
        'your data',
        `Download all of it, or delete your account, from Settings. Ended sign-ins are kept ${KEPT_DAYS.endedSignIns} days, security records ${KEPT_DAYS.securityRecords === 365 ? 'a year' : `${KEPT_DAYS.securityRecords} days`}, a handle you let go of ${KEPT_DAYS.heldHandles === 365 ? 'a year' : `${KEPT_DAYS.heldHandles} days`} from everyone.`,
      ],
      [
        'the server',
        'A content security policy on every page, no third-party scripts, no ads, no tracking across sites, and a backup checked after every dump.',
      ],
      ['money', 'Never held or moved by Caime. A split records who owes whom; nothing else.'],
      [
        'ai',
        'Off until an adult turns it on, never on a private conversation, and everything it infers is a suggestion you accept or don’t.',
      ],
    ])}
  </section>
  <section class="hero">
    <p class="cta"><a href="/privacy">Read the privacy policy</a> <a href="mailto:${esc(facts.contactEmail)}" class="quiet">Report a concern</a></p>
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'developers':
      return {
        title: `${SITE_NAME} for developers: an API that reaches only what it was given`,
        description:
          'Apps for organizations with scoped tokens, signed webhooks, bots and cards of their own; personal tokens and OAuth for apps that act for a person; a typed SDK. Every write is idempotent.',
        body: `
<main class="pub pub-home pub-site">
  ${masthead('/developers')}
  <section class="hero">
    <h1>An API that reaches only what it was given.</h1>
    <p class="lead">Organizations connect a helpdesk, a CRM or a bot of their own. People let an app act for them, with the permissions they chose. Every token reaches a fixed set of routes, every webhook is signed, and nothing an app does is passed off as a person.</p>
  </section>
  <section class="sheet" aria-labelledby="dev-sheet">
    <h2 id="dev-sheet" class="mono">Specification</h2>
    ${spec([
      [
        'apps',
        'Added on the organization’s page. Each has its own bot on the team, a token shown once, and a webhook signed with a secret shown once. Replace either and the old one stops at once.',
      ],
      [
        'permissions',
        '<code>inbox:read</code>, <code>messages:read</code>, <code>messages:write</code>, <code>threads:write</code>, <code>updates</code>, <code>kits</code>: given one by one. A route the token can’t use answers 403.',
      ],
      [
        'webhooks',
        '<code>business.message</code>, <code>business.thread</code>, <code>kit.posted</code>, <code>kit.moved</code>, <code>ping</code>. Signed, https only, no private addresses, one deadline for the whole exchange.',
      ],
      [
        'your own cards',
        'Define a kind of card with fields and states. Your bot sends it, the team and the customer move it, and you hear when they do.',
      ],
      [
        'idempotent',
        'Every write carries a <code>clientId</code>. Sending it again returns the first result, never a second message.',
      ],
      ['rate', '600 requests a minute per token.'],
      [
        'the sdk',
        '<code>@caime/sdk</code>: a typed client for every route an app reaches, and the webhook check. Built from the repository until it is on npm.',
      ],
      [
        'personal tokens',
        'A person makes a token for their own scripts (<code>profile:read</code>, <code>messages:read</code>, <code>messages:write</code>, <code>actions:read</code>, <code>actions:write</code>). It never reaches the account itself.',
      ],
      [
        'oauth',
        'Third-party apps ask people for consent (OAuth 2.0; errors as RFC 6749 and 7009 say), hold only what they were given, and can be revoked any time from Settings.',
      ],
      [
        'the guide',
        'In the app: Settings → Developer, and beside each app on the organization’s page.',
      ],
    ])}
  </section>
  <section class="hero">
    <p class="cta"><a href="/sign-up">Start free</a> <a href="/business" class="quiet">For organizations</a></p>
  </section>
  ${footer(facts)}
</main>`,
      };
    case 'about':
      return {
        title: `About ${SITE_NAME}`,
        description: `${SITE_NAME} is made by ${facts.legalName}: a communication product, and only that. It never holds or moves money, runs no third-party code and has no feed. The primary object is the connection between two people, not the chat.`,
        body: `
<main class="pub pub-home pub-site">
  ${masthead('/about')}
  <section class="hero">
    <h1>Made for the people in your life, not for a feed.</h1>
    <p class="lead">${SITE_NAME} is made by ${esc(facts.legalName)}. It is a communication product, and only that: it never holds or moves money, runs no third-party code, and has no feed. The primary object is the connection between two people, not the chat.</p>
  </section>
  <section class="sheet" aria-labelledby="about-sheet">
    <h2 id="about-sheet" class="mono">Specification</h2>
    ${spec([
      [
        'made by',
        `${esc(facts.legalName)} · <a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>`,
      ],
      [
        'what it is',
        'Messaging for people, and for the organizations they deal with, on the web, iOS and Android, from one account.',
      ],
      [
        'what it isn’t',
        'A super-app. No wallet, no marketplace, no feed, no scripts from anyone else.',
      ],
      [
        'the characters',
        'Caishy and friends (Momo, Panda, Lumi, Pico, Niko and Zuzu) appear where there is something to celebrate or nothing yet to show, never beside your invoice.',
      ],
      [
        'how it’s built',
        'One codebase for the server, the web and the phones. Every change is tested end to end against the real server before it ships, and only what passed goes live.',
      ],
      [
        'your say',
        `Questions, ideas and concerns go to <a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>.`,
      ],
      ['runs on', 'Web, iOS and Android.'],
    ])}
  </section>
  <section class="hero">
    <p class="cta"><a href="/sign-up">Start free</a> <a href="/sign-in" class="quiet">Sign in</a></p>
  </section>
  ${footer(facts)}
</main>`,
      };
  }
}
