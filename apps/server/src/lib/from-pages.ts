/**
 * Pages for someone coming from another app (R120 K5): `/from` and one page for each app whose
 * way over Caime has (`FROM_SOURCES`): WhatsApp's and Telegram's exports, which the importers
 * read (R45, M18 J6), and Calendly, whose link a person's or an organization's own booking page
 * stands in for (R58, R97). Rendered in the site's shell like its other pages, for everyone, in
 * the reader's language, cached ten minutes. They say only what Caime does, each number read from
 * code, never what the other app does or costs (it changes, and nothing here could check it); they
 * say what stays behind as plainly as what comes; and the other apps are named as words, never a
 * mark, with a line that they're their owners'. The council's record is R120's "K5".
 */
import { msg, tr } from '@caime/core/i18n';
import { IMPORT_MAX_MESSAGES } from '@caime/core/imports';
import {
  cta,
  esc,
  footer,
  langAttrs,
  masthead,
  SITE_NAME,
  type SiteFacts,
  siteHref,
  spec,
} from './site-pages';

/** The apps someone may come from, each with its own page at `/from/<source>`. */
export const FROM_SOURCES = ['whatsapp', 'telegram', 'calendly'] as const;
export type FromSource = (typeof FROM_SOURCES)[number];

/** Each app's name as its owner writes it: a name, never translated. */
const NAMES: Record<FromSource, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  calendly: 'Calendly',
};

/** Where "Start free" leads on each: sign-up, then straight to the step that page is about. */
const START: Record<FromSource, string> = {
  whatsapp: `/sign-up?link=${encodeURIComponent('/connect?contacts=1')}`,
  telegram: `/sign-up?link=${encodeURIComponent('/connect?contacts=1')}`,
  calendly: `/sign-up?link=${encodeURIComponent('/settings/bookings')}`,
};

export const fromPath = (source: FromSource | null) => (source ? `/from/${source}` : '/from');

/**
 * What a page may say depends on what this Caime runs (`SiteFacts.from`): Caime Mail on (R75),
 * so someone not on Caime is written to at their address; and Google's or Microsoft's calendar
 * to connect (R90), whose busy times hold the slots.
 */
type FromFacts = NonNullable<SiteFacts['from']>;

export interface FromPage {
  title: string;
  description: string;
  body: string;
}

const KICKER = msg('coming from another app');

function page(
  source: FromSource | null,
  facts: SiteFacts,
  parts: { h1: string; lead: string; rows: Array<[string, string] | null>; steps: string[] },
): string {
  const path = fromPath(source);
  const name = source ? NAMES[source] : null;
  return `
<main class="pub pub-home pub-site" ${langAttrs()}>
  ${masthead(path, facts, path, tr(KICKER))}
  <section class="hero">
    <h1>${esc(parts.h1)}</h1>
    <p class="lead">${esc(parts.lead)}</p>
    ${cta(facts, [
      [source ? START[source] : '/sign-up', tr('Start free')],
      ['/pricing', tr('Pricing')],
    ])}
  </section>
  <section class="sheet" aria-labelledby="from-sheet">
    <h2 id="from-sheet" class="mono">${esc(tr('What comes with you'))}</h2>
    ${spec(parts.rows)}
  </section>
  <section class="sheet" aria-labelledby="from-steps">
    <h2 id="from-steps" class="mono">${esc(tr('Your first ten minutes'))}</h2>
    <ol class="steps">${parts.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </section>
  ${
    name
      ? `<p class="small">${esc(
          tr('{name} is a trademark of its owner. {site} isn’t affiliated with it.', {
            name,
            site: SITE_NAME,
          }),
        )}</p>`
      : ''
  }
  ${footer(facts)}
</main>`;
}

/** The rows every way over from a messenger shares: your people, the price, what's different. */
function messengerRows(name: string, from: FromFacts): Array<[string, string]> {
  return [
    [
      tr('your people'),
      esc(
        from.mail
          ? tr(
              'They don’t need {site} to hear from you. Send your link from {name} itself, and whoever opens it is connected with you; anyone else you write to at their email address, and they answer from their mail.',
              { site: SITE_NAME, name },
            )
          : tr(
              'They don’t need {site} to hear from you. Send your link from {name} itself, and whoever opens it is connected with you.',
              { site: SITE_NAME, name },
            ),
      ),
    ],
    [
      tr('what’s different'),
      esc(
        tr(
          'Every conversation knows how you know the person in it. Promises, asks and dates in what’s written become actions you confirm, a call can have Cai’s notes, and a private conversation is end to end encrypted.',
        ),
      ),
    ],
    [
      tr('nothing is deleted'),
      esc(
        tr('Keep {name} as it is. {site} copies the words; nothing is taken out of {name}.', {
          name,
          site: SITE_NAME,
        }),
      ),
    ],
  ];
}

/** How a chat is exported from each messenger, and what of it comes over. */
function chatsRow(source: 'whatsapp' | 'telegram'): string {
  const said = { site: SITE_NAME, max: IMPORT_MAX_MESSAGES };
  return source === 'whatsapp'
    ? tr(
        'In WhatsApp, open the chat’s menu and choose Export chat. Open the file in {site}, in your conversation with that person or in a group you run: the words, who wrote them and when come over, up to {max} messages a chat, marked as imported. Photos, voice notes and files stay in WhatsApp.',
        said,
      )
    : tr(
        'In Telegram Desktop, open the chat, then Export chat history, as JSON. Open its result.json in {site}, in your conversation with that person or in a group you run: the words, who wrote them and when come over, up to {max} messages a chat, marked as imported. Photos, voice notes and files stay in Telegram.',
        said,
      );
}

/** A messenger's page: its chats by its own export, your people by your link. */
function messengerPage(
  source: 'whatsapp' | 'telegram',
  facts: SiteFacts,
  from: FromFacts,
): FromPage {
  const name = NAMES[source];
  return {
    title: tr('Coming from {name}: bring your chats and your people to {site}', {
      name,
      site: SITE_NAME,
    }),
    description: tr(
      'Bring a {name} chat into {site} with who said what and when, reach your people with your link sent from {name} itself, and keep {name} as it is.',
      { name, site: SITE_NAME },
    ),
    body: page(source, facts, {
      h1: tr('Bring what matters from {name}. Keep {name} too.', { name }),
      lead: tr(
        '{site} is messaging that understands your relationships: family, a client, your dentist. A chat comes over as its words, your people come with a link, and nothing is deleted anywhere.',
        { site: SITE_NAME },
      ),
      rows: [[tr('your chats'), esc(chatsRow(source))], ...messengerRows(name, from)],
      steps: [
        tr('Make your account: an email address and a password, no phone number.'),
        tr(
          'Find your people: your phone’s contacts or a contacts file, and your link for the rest.',
        ),
        tr('In your conversation with someone, open its details and bring the chat over.'),
      ],
    }),
  };
}

export function renderFrom(source: FromSource | null, facts: SiteFacts): FromPage {
  const from = facts.from ?? { mail: false, calendars: false };
  switch (source) {
    case 'whatsapp':
    case 'telegram':
      return messengerPage(source, facts, from);
    case 'calendly':
      return {
        title: tr('Coming from {name}: bookings where you talk to people, on {site}', {
          name: NAMES.calendly,
          site: SITE_NAME,
        }),
        description: tr(
          'A booking page anyone books from without an account, each booking a card in your conversation with them that you confirm, with invitations and reminders by mail.',
        ),
        body: page(source, facts, {
          h1: tr('Bookings where you talk to people.'),
          lead: tr(
            'Set your hours and what people may book once. Anyone books from your page in a minute, without an account, and each booking arrives in your conversation with them as a card you confirm.',
          ),
          rows: [
            [
              tr('your link'),
              esc(
                tr(
                  'Your page, with what you offer and the week’s open times, is your link: share it wherever you shared the old one. An organization has its own, and puts it on its website.',
                ),
              ),
            ],
            [
              tr('without an account'),
              esc(
                tr(
                  'A visitor picks a time, gives their name and email address, and confirms with a code we mail them. They get an invitation for their calendar, a reminder the day before, and a link to join when it’s held on {site}.',
                  { site: SITE_NAME },
                ),
              ),
            ],
            [
              tr('you decide'),
              esc(
                tr(
                  'Nothing lands in your day you didn’t agree to: each booking is a request you confirm, or answer with another time.',
                ),
              ),
            ],
            from.calendars
              ? [
                  tr('your calendars'),
                  esc(
                    tr(
                      'Connect a Google or Microsoft calendar: what’s busy there holds the time here, and what’s booked here is written there.',
                    ),
                  ),
                ]
              : null,
            [
              tr('paying'),
              esc(
                tr(
                  'A price on anything you offer, paid your way: a bank account, a payment link of your own, a wallet number or cash, shown to whoever pays. An organization takes cards through its own Stripe account.',
                ),
              ),
            ],
          ],
          steps: [
            tr('Make your account: an email address and a password, no phone number.'),
            tr('In Settings, under What you offer, set your hours and what people may book.'),
            tr('Copy your booking link and share it.'),
          ],
        }),
      };
    case null:
      return {
        title: tr('Coming to {site} from another app', { site: SITE_NAME }),
        description: tr(
          'What comes with you to {site} from WhatsApp, Telegram or Calendly, and your first ten minutes.',
          { site: SITE_NAME },
        ),
        body: `
<main class="pub pub-home pub-site" ${langAttrs()}>
  ${masthead('/from', facts, '/from', tr(KICKER))}
  <section class="hero">
    <h1>${esc(tr('Coming from another app?'))}</h1>
    <p class="lead">${esc(
      tr(
        'Bring your chats and your people, or your booking link, and keep the app you came from as it is.',
      ),
    )}</p>
  </section>
  <section class="sheet" aria-labelledby="from-sheet">
    <h2 id="from-sheet" class="mono">${esc(tr('Where from'))}</h2>
    ${spec(
      FROM_SOURCES.map((s): [string, string] => [
        NAMES[s],
        `<a href="${esc(siteHref(fromPath(s), facts))}">${esc(
          s === 'calendly'
            ? tr('Your booking link, and bookings in your conversations')
            : tr('Your chats and your people'),
        )}</a>`,
      ]),
    )}
  </section>
  ${footer(facts)}
</main>`,
      };
  }
}
