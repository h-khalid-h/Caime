/**
 * Caime's own pages about itself: its privacy policy, its terms and its help, served on its
 * own address (PUBLIC_URL) at /privacy, /terms and /help, so they work before signing in, in any
 * browser, and for anyone reviewing the apps. Plain HTML and CSS, no script. Who runs Caime and
 * how to reach them come from the environment (LEGAL_NAME, CONTACT_EMAIL), as do the minimum age
 * (MINIMUM_AGE) and how calls connect (STUN_URLS, TURN_URLS); how long records are kept comes
 * from lib/retention.ts.
 *
 * What they say is what the code does, checked claim by claim against it: change one with the
 * other (docs/SECURITY.md).
 */

import {
  ACCOUNT_BUSY_DAYS,
  ACCOUNT_FRESH_SECONDS,
  ACCOUNT_SYNC_MINUTES,
  PUSH_TRIES,
} from '@caime/core/accounts';
import type { AgeTrigger } from '@caime/core/age-assurance';
import type { SitePage } from '@caime/core/api';
import { LAW_MINIMUM_AGES } from '@caime/core/countries';
import { REQUESTS_PER_DAY } from '@caime/core/privacy';
import type { SubProcessor } from '@caime/core/processors';
import { FACE, THEME_VARS, type } from './page-style';
import { KEPT_DAYS } from './retention';

export type PageName = SitePage;

export interface PageFacts {
  /** Who processes data for this Caime (R54): core's list, as this server is configured. */
  processors: SubProcessor[];
  legalName: string;
  /** The operator's postal address (LEGAL_ADDRESS); null leaves it out of the pages. */
  legalAddress: string | null;
  /** The law and courts the terms are under (GOVERNING_LAW, "Estonia"); null leaves the clause out. */
  governingLaw: string | null;
  /** The register the operator is in and its number (LEGAL_REGISTRATION); null leaves it out. */
  legalRegistration: string | null;
  contactEmail: string;
  minimumAge: number;
  /** Where Caime is, as people reach it: PUBLIC_URL. */
  publicUrl: string;
  /** The domain every handle is an address at (R75), or null where mail is off. */
  mailDomain: string | null;
  /** Whose public server tells a device its own address for calls, if any (STUN_URLS). */
  stun: 'google' | 'other' | 'none';
  /**
   * Whose relay carries calls that can't connect directly, if any: Caime's own (TURN_URLS) or
   * Cloudflare's (CLOUDFLARE_TURN_KEY_ID).
   */
  relay: 'own' | 'cloudflare' | 'none';
  /** The shell's font declarations (`shellFaces`), so these pages draw in Caime's faces too. */
  faces: string;
  /** Who checks ages here and where Caime asks (M16 B7), or null where nobody is asked. */
  ageChecks: { provider: string; triggers: readonly AgeTrigger[] } | null;
}

/** When each page last changed in what it says. */
const UPDATED = '14 October 2026';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );

/** Who runs Caime, in brackets after its name: its register entry and its address, as set. */
const identity = (f: PageFacts) => {
  const parts = [f.legalRegistration, f.legalAddress].filter((p): p is string => Boolean(p));
  return parts.length ? ` (${parts.join(', ')})` : '';
};

/** The same, as the contact line writes it. */
const contactLine = (f: PageFacts, mail: string) =>
  [f.legalName, f.legalRegistration, f.legalAddress, mail]
    .filter((p): p is string => Boolean(p))
    .join(' &middot; ');

/**
 * Where the law of the country someone lives in asks more than this Caime's own minimum age
 * (`LAW_MINIMUM_AGES`, core countries), the countries by name and their age.
 */
function lawAges(minimumAge: number): string {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const higher = LAW_MINIMUM_AGES.filter((l) => l.age > minimumAge);
  if (!higher.length) return '';
  const byAge = new Map<number, string[]>();
  for (const l of higher)
    byAge.set(l.age, [...(byAge.get(l.age) ?? []), names.of(l.country) ?? l.country]);
  const list = (xs: string[]) =>
    xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
  return [...byAge]
    .map(([age, countries]) => `${age} and older for people who live in ${list(countries)}`)
    .join('; ');
}

/** A number of days as the pages say it. */
const span = (days: number) => (days === 365 ? 'a year' : `${days} days`);

/** Where Caime checks ages (M16 B7): when it asks, what the provider sees, what Caime keeps. */
function ageChecksSaid(a: NonNullable<PageFacts['ageChecks']>): string {
  const when = [
    a.triggers.includes('org') ? 'start an organization' : null,
    a.triggers.includes('paid') ? 'sell something for a price' : null,
    a.triggers.includes('stranger')
      ? 'write first to someone you&rsquo;re not connected with'
      : null,
  ].filter(Boolean);
  const asked = when.length
    ? `Before you ${when.length > 1 ? `${when.slice(0, -1).join(', ')} or ${when.at(-1)}` : when[0]}, Caime may ask you to check your age once`
    : 'You may check your age if you want to (Caime asks nobody to)';
  return `<p><strong>Age checks.</strong> ${asked}, with ${escapeHtml(a.provider)}, on its own page:
you take a selfie there, or show a document. ${escapeHtml(a.provider)} tells Caime only whether
you&rsquo;re 18 or over, whether it estimated or read a document, how sure it was and when; the
picture never reaches Caime. If it finds you&rsquo;re under 18, the rules above are yours for a
year, whatever date of birth you gave, unless a document says otherwise; a face that reads older
the next time changes nothing. Someone under 18 by their date of birth is never asked.</p>
`;
}

function privacy(f: PageFacts, mail: string): string {
  const calls =
    f.stun === 'none'
      ? ''
      : ` To connect, each device learns the network address of every other device in the call,
with the help of a public server that tells a device its own${f.stun === 'google' ? ' (Google&rsquo;s)' : ''}.`;
  const relay =
    f.relay === 'none'
      ? ''
      : ` When a network won&rsquo;t let two devices connect directly, the call goes through
${f.relay === 'cloudflare' ? 'a relay Cloudflare runs for Caime' : 'Caime&rsquo;s relay'} instead, still encrypted: the relay sees both network addresses.`;
  return `
<h1>Privacy</h1>
<p class="updated mono">last updated ${UPDATED}</p>
<p>Caime is messaging that understands the difference between the people in your life. This page
says what Caime keeps about you, why, who else sees it, how long it&rsquo;s kept, and what you
can do about it. Caime is run by ${f.legalName}${identity(f)}, which is responsible for
your data (its controller, in the words of data protection law). Questions about it go to
${mail}.</p>

<section class="short">
<h2>The short version</h2>
<ul>
<li>How you describe the people you know (family, work, a client) is yours: the person you
describe sees it only if you both turn on Share with <em>name</em>, and nobody else does. When you
ask to connect, they see which kind it is and
where, such as &ldquo;Work &middot; Acme&rdquo;, unless you turn off Show <em>name</em> the
context.</li>
<li>Caime keeps your messages so they reach the people you write to and your own devices. In a
private conversation, what messages say is encrypted end to end: Caime can&rsquo;t read it.</li>
<li>No ads, no selling your data, and no tracking you across other sites or apps.</li>
<li>AI assist is off until you turn it on, and nothing from a private conversation is ever sent
to it. With it on, your voice notes are turned into words too, shown under the note and
searchable, by the speech-to-text provider named below when this Caime has one.</li>
<li>You can download your data, and delete your account, whenever you like.</li>
</ul>
</section>

<h2>What Caime keeps</h2>
<ul>
<li><strong>Your account.</strong> Your email address, your name and @handle, your date of birth,
the country you live in, and your password, kept only as a salted hash, never the password
itself. Your date of birth is only to check you&rsquo;re old enough and for the protections that
apply under 18; your country only sets your defaults (the days your work notifications wait for,
the currency of amounts, the Arabic Cai and the Caime Friends speak with you), and with AI assist
on, their AI is told the country too, so what it suggests fits where you are. Neither is shown to
anyone. Caime also keeps your device&rsquo;s
language and time zone, so times and quiet hours are right, and, if you joined from someone&rsquo;s
link, whose it was: that&rsquo;s only counted, and never shown to anyone.</li>
<li><strong>Your profile.</strong> What you choose to show: a photo, About you, pronouns, your
gender if you say it (never guessed), a status and your presence (Automatic, Busy, Away or Invisible). Caime also keeps when you were last
active.</li>
<li><strong>The people you know.</strong> Who you&rsquo;re connected with, how you&rsquo;ve told
Caime you know each of them (and how you described them before), what you call them, your
requests to connect, the invite links you make (how you&rsquo;d know whoever joins, what they&rsquo;re
shown, and how many joined), the links you make to join a group or a space you run (where each
leads, how many joined through it and when it runs out; the link itself only as a fingerprint,
and never who opened it), your asks to join through a link that asks (when, and whether you were
let in; its owner and admins see who asked until they answer), and who you&rsquo;ve blocked.</li>
<li><strong>What you send.</strong> Messages, photos, videos, files, voice messages, places you
share, cards (a meeting, an order, a poll) and your votes, and reactions, with which messages each
person has received and read, so Caime can show them to the people they&rsquo;re for. A live
location keeps only its latest point, which stays in the conversation. What you start typing is
kept as a draft, so it&rsquo;s there on your other devices too; in a private conversation it stays
on the device you&rsquo;re writing on. Where a photo or a video was taken, and its other hidden
details, are removed before anyone sees it: a JPEG, PNG or WebP photo is made again without them,
and a HEIC photo, an MP4 or QuickTime video or a recording has them cleared where they are; one
that can&rsquo;t be read for certain isn&rsquo;t kept at all. Other files, GIFs and WebM videos
among them, are kept as you send them, with anything they carry. The first link in a message
you write in a conversation that isn&rsquo;t private is opened once by Caime&rsquo;s server, to
show the title, the description and the picture its page gives itself: the site sees Caime ask,
never you or anyone you sent it to, and their devices get the picture from Caime. You can take
the preview off before sending; a link in a private conversation or in mail is never opened.</li>
<li><strong>Private conversations.</strong> What each message says is sealed on your device, and
the server keeps only envelopes it can&rsquo;t open. It still knows who is in the conversation,
what it&rsquo;s called and what it&rsquo;s for, who sent each message and when, which message it
answers, reactions, and who has read what. Private conversations carry text only.</li>
<li><strong>Your calls.</strong> Who called whom, voice or video, when, for how long, and whether
it was answered, missed or declined. What&rsquo;s said and shown in a call isn&rsquo;t kept: it
goes between the devices in it.</li>
<li><strong>Meetings with guests.</strong> When you invite someone to a meeting by email address,
Caime keeps the address, who invited them and when, and gives the meeting its own group, where the
guest sees only that meeting. Their link to join is kept only as a fingerprint, and ends when
they&rsquo;re invited again. Given another time, the meeting invites them again, and what they
answered before is let go; called off, they&rsquo;re sent its cancellation. Joining keeps the name they give, when they first came in and whether
they said they&rsquo;re 18 or over; they&rsquo;re signed in to that meeting only, until a day after
it. The invitation comes from Cai&rsquo;s address (assistant@), for whoever invited them, and
their calendar&rsquo;s answer to it (coming, not coming, maybe) is kept and shown to whoever
invited them; nothing else sent to Cai&rsquo;s address is read. Someone invited who isn&rsquo;t on
Caime can do nothing else on it. A guest can be invited by a link instead, which the inviter sends
them themselves: then Caime keeps only the name the inviter gave, with no address, shows the link to
the inviter once (and keeps it only as a fingerprint), and whoever opens it joins that meeting
alone. A guest may keep the meeting as a Caime account of their own: the account is that guest, so
the meeting and what was said in it stay theirs, and the guest&rsquo;s sign-ins end then, on every
device.</li>
<li><strong>Booking or writing before an account.</strong> On an organization&rsquo;s page, or a
person&rsquo;s bookable item, someone who isn&rsquo;t on Caime can book a time or write a message
with a name and an email address. Caime keeps the address and the name to send a six-digit code
there; what they chose or wrote is kept nowhere until the code comes back (it rides, sealed, in the
page&rsquo;s own address, for fifteen minutes), and an address whose code never came back is
removed within two days. With the code, the booking or the message is kept as that address&rsquo;s,
seen by the organization or the person it went to, in one conversation with them; their answers
reach the address by email where Caime carries mail, and a reply to that email comes back into the
same conversation. Signing up with the address makes all of it theirs; an address that has been
silent for a year is removed, and its words stay with whoever they went to.</li>
<li><strong>What Caime works out for you.</strong> In conversations that aren&rsquo;t private,
Caime notes the dates, amounts, links, email addresses, phone numbers, reference numbers (an order,
an invoice, a ticket), topics (such as Project Atlas), questions and requests in each message. From these, and from a team, a space or a work email domain you share with someone,
it suggests actions, decisions, reminders and how you may know someone (such as &ldquo;Sarah may be
your colleague at Acme&rdquo;). They stay suggestions, with the reason for them, until you accept
one.</li>
<li><strong>Your notifications</strong>, each with a short preview, never of a private
conversation.</li>
<li><strong>Your settings.</strong> Rules for who reaches you and when, privacy settings,
automations and what you&rsquo;ve saved; the spaces and organization teams you&rsquo;re in, with
your role and title; and the organizations you follow.</li>
<li><strong>Reports you make</strong>: who or what you reported, and why, with what you saw when
you made it: the message you reported and up to four before it in that conversation, each with its
sender&rsquo;s name (never a private conversation&rsquo;s, and never one you had deleted for
yourself), or the update you reported.</li>
<li><strong>A report from a page, without an account</strong> (a person&rsquo;s or an
organization&rsquo;s page, an item or a collection): what you chose and wrote, the page, and the
name and email address you gave (neither is asked about a child&rsquo;s safety). Caime writes to
that address twice: to say the report arrived, and to say what was decided.</li>
<li><strong>An appeal</strong>, if your account is suspended: signing in shows you why, and lets you
appeal and download your data. Caime keeps what you wrote and what was decided, with the note the
person who decided it wrote to you, and mails you the decision.</li>${
    f.ageChecks
      ? `
<li><strong>A check of your age</strong>, if you make one (see Children): whether it found you
18 or over or under, whether by an estimate or a document, how sure ${escapeHtml(f.ageChecks.provider)} said it was, and when. Each check is kept a year; what it found stays on your account. Never the picture.</li>`
      : ''
  }
<li><strong>Your devices.</strong> Each one you&rsquo;re signed in on, with the network address and
browser it signed in from and when it was last used; its address for notifications, if you turned
them on; and, for private conversations, its public keys.</li>
<li><strong>What you let act for you.</strong> Access tokens and apps you make, apps you let act
for you, and your calendar&rsquo;s address, with when each was last used. Their tokens and secrets
are kept only as hashes.</li>
<li><strong>Passkeys.</strong> For each passkey you add: its public key, the browser it was made in,
whether your password manager keeps it on your other devices, and when it was last used. Its private
key, and the face, fingerprint or screen lock that unlocks it, never leave your device. A recovery
code or a reset link removes your passkeys with every other way in.</li>
<li><strong>Security records.</strong> When you sign up, sign in, sign out, sign out a device,
change your password, add or remove a passkey, make new recovery codes or recover your account,
Caime records the time,
the network address it came from and the browser or device. A sign-in that fails is recorded the
same way, with the email or @handle that was typed. Other changes, such as approving a device for
private conversations, making an access token, letting an app in or downloading your data, are
recorded with the time.</li>
<li><strong>How Caime is used.</strong> Counts and times, such as how many people are active and
how long an answer takes, never what anyone wrote or searched for. To apply your plan&rsquo;s
limits and keep Caime safe, it also keeps a log of what you do, never the words: when you send
and read messages, connect with someone or use an AI feature, and which one. The server&rsquo;s own
log notes each address asked of it (which can include an @handle) and the network address it came
from.</li>
</ul>

<h2>Why</h2>
<p>Each of these is one of the grounds data protection law allows (in the GDPR, Article 6):</p>
<ul>
<li>To give you Caime: to deliver your messages and run the features you use (our agreement with
you, the <a href="/terms">terms</a>).</li>
<li>To keep Caime safe: limits on how fast things can be sent, blocks, reports and security
records (our legitimate interest in protecting the people on it).</li>
<li>To bill a paid plan, and keep the records accounting law asks for (a legal obligation).</li>
<li>With your permission: AI assist, and notifications on your devices. Turn either off at any time
(You &rarr; Privacy &rarr; AI assist; You &rarr; Notifications and priorities &rarr; In this
browser); withdrawing it changes nothing about what happened while it was on.</li>
</ul>
<p>Caime makes no decision about you by machine alone that has a legal or similarly serious effect
on you. What it sorts, suggests or infers is a suggestion you can see the reason for and
decline.</p>

<h2>Who else sees what</h2>
<ul>
<li><strong>The people you talk with</strong> see what you send them, your name and @handle, when
their messages reach your device, and when you&rsquo;re typing. You &rarr; Privacy decides whether
they also see your profile photo, About you, pronouns, gender, status, your professional details (with an
organization Caime has verified you&rsquo;re on the team of), when you&rsquo;re online, when you
were last seen, and when you&rsquo;ve read their messages.</li>
<li><strong>Anyone on Caime</strong> who finds you by your name or @handle (unless you turn off By
your name or @handle), by your email address (unless you turn off By your email), or by a phone
number you proved yours (while By your phone number is on), sees your
name, @handle and what You &rarr; Privacy shows everyone: at first, your profile photo, About you
and your professional details. People in your groups and spaces see the same.</li>
<li><strong>Organizations you write to.</strong> When you message a business, a clinic, a school
or any organization on Caime, its team and the apps it uses see your messages, your name and
@handle, and what You &rarr; Privacy shows everyone. Its apps can pass them on to the
organization&rsquo;s own systems, outside Caime, and the organization is responsible for what it
does with them. If it has an AI agent, the agent reads your messages (not your name) and answers
first; it always says it&rsquo;s an AI, and everything it writes is marked &ldquo;AI agent&rdquo;.
You see the organization, not which person on its team wrote. If you&rsquo;re under 18, the
organization and its apps are told so. What you write to a clinic, a pharmacy or a doctor may say
something about your health: that is sensitive data, and it is the organization&rsquo;s to look
after, under its own duties to you; ${f.legalName} only stores and delivers it on the
organization&rsquo;s instructions, never reads it for anything of its own, and never uses it to
train a model.</li>
<li><strong>An organization at your address&rsquo;s domain.</strong> If an organization proved it
controls the domain of an address you confirmed, and lets people with an address there join its
team, Caime tells you, and joining is yours to choose. Once you join, its team sees you on it,
never which address let you in.</li>
<li><strong>Apps you let in</strong> do only what you allowed. Remove one in You &rarr; Connected
apps; what it already has stays with it.</li>
<li><strong>Companies that help run Caime</strong>, each only for what it does for Caime. The same
list, from the same place in Caime&rsquo;s code, is what an organization&rsquo;s data processing
agreement names:
<ul>
${f.processors
  .map(
    (p) =>
      `<li><strong>${escapeHtml(p.name)}</strong> ${escapeHtml(p.does)} ${escapeHtml(p.receives)}${
        p.when === 'used' ? ' Only when the feature is used.' : ''
      }</li>`,
  )
  .join('\n')}
<li>Calls, group calls too, go directly between the devices in them, encrypted.${calls}${relay}</li>
</ul></li>
<li><strong>Your contacts, when you look for your people in them.</strong> Whether they come
from your phone, your browser&rsquo;s contact picker, a file, or your Google or Microsoft account,
Caime reads them on your device and sends only their email addresses and phone numbers, to say
which of them are on Caime and can be found by them (a number finds only someone who proved it
theirs and lets a number find them); nothing of them is kept, on the server or in your data, and
an invitation to the rest is one you send yourself, by WhatsApp, a text or an email. To read a Google or Microsoft account, you sign in to it and allow Caime to read
your contacts: Caime&rsquo;s server trades that permission for access that lasts an hour, hands
it to your device without keeping it, and asks for nothing that would let it read them again
without you. The account remembers your permission until you remove it there (in your Google
Account&rsquo;s third-party connections, or your Microsoft account&rsquo;s apps and services).
Caime&rsquo;s use of information received from Google APIs adheres to the
<a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services
User Data Policy</a>, including the Limited Use requirements.</li>
<li><strong>A Google or Microsoft account you connect, for your calendar.</strong> When you connect
one under You &rarr; Apps and turn its calendar on, you allow Caime to read when you&rsquo;re busy
there, in each calendar of your own (Google asks you separately whether Caime may see the list of
your calendars; without it, only your main one is read), and Caime keeps the account&rsquo;s email
address, a permission to read again (encrypted on Caime&rsquo;s server with a key of its own), and
the start and end of each busy time for the next ${ACCOUNT_BUSY_DAYS} days, read again every
${ACCOUNT_SYNC_MINUTES} minutes, and again before your bookable times are shown or one is booked
when the last read is more than ${ACCOUNT_FRESH_SECONDS} seconds old; never an event&rsquo;s title,
its people or its place. Those times only keep your bookable times from being offered while
you&rsquo;re busy, and nobody sees them. From Google, Caime asks for busy times and the list of your
calendars alone; Microsoft offers no such permission, so Caime asks to read your calendar&rsquo;s
basics and keeps only the times. When you turn its Plans on, Caime writes your meetings and
appointments in Caime into that account&rsquo;s main calendar, each with its title, whom it&rsquo;s
with, when, where and a link back to Caime (one still asked for as tentative), keeps them up to
date as they&rsquo;re agreed, moved or cancelled, and invites nobody by it. On an organization&rsquo;s
team that keeps its conversations from its members&rsquo; own apps, its meetings and appointments are
written as what they are, the organization&rsquo;s name and the time, never whom they&rsquo;re with or
their own words. Of each event it wrote, Caime keeps the account&rsquo;s id for it, when it is and a
fingerprint of what it wrote, so it can change it or take it out; it reads nothing else of the
calendar for it. One the calendar refuses on its own is tried ${PUSH_TRIES} times as it is and then
waits until it changes: of it, Caime keeps which one, the calendar&rsquo;s answer and how many tries,
until it&rsquo;s written or no longer yours to write. From Google, Caime asks to
manage events on the calendars you own; Microsoft offers nothing narrower than reading and writing
your calendar. An event whose meeting is cancelled or removed in Caime is taken out; one that is
over stays in your calendar, as yours. Disconnecting first takes out the events Caime wrote that
are still ahead; disconnecting, deleting your account or signing out everywhere deletes what was
kept and gives the permission back. Your export lists the accounts you connected.</li>
<li><strong>Your places.</strong> You can add the places you are (home, work), each with its
address and, only if you ask, the point where you stood when you added it; nobody looks an address
up, and no map service sees one. Each is shown only to whom you choose (nobody until you choose;
under 18, your family at most). When you pick one for a meeting or a delivery, its words are
copied into that card and stay with it. An organization's places are shown to anyone on its page,
to its customers, or to its team, as it chooses. Your export lists your places; deleting one, or
your account, deletes it.</li>
<li><strong>Email addresses and phone numbers you add as yours.</strong> Beside the email you sign
in with, you can add more addresses and numbers under You &rarr; Apps. Each is proven by a six-digit
code sent to it (an email by mail; a phone number over WhatsApp, which Meta delivers and which reads
nothing of yours) before it counts for anything. Once proven, mail from it is from you, and people
who have it can find you by it as by your sign-in email: an address if you let people find you by
email, a number if you turn on By your phone number (it starts off for accounts made before it
existed). Caime
keeps the address or number, how and when it was proven, and the code only hashed, for ten minutes.
Removing it, or deleting your account, deletes it. Your export lists them.</li>
<li><strong>A file from your Google Drive or OneDrive.</strong> When you turn on Files for a connected
account, you can attach a file from it in a conversation. From Google, you pick it in Google&rsquo;s
own window, which gives Caime that file and no other; from Microsoft, Caime lists your OneDrive as
you browse it, since Microsoft offers no such per-file permission, and keeps nothing of the list.
The file you pick is copied into Caime as your own upload, and from then on it&rsquo;s kept, shown,
exported and deleted like any file you send. Caime keeps no link to it there.</li>
<li><strong>Services you choose.</strong> If you add Your calendar (You &rarr; Apps) to
Google Calendar, Outlook or Apple Calendar, that service reads your open actions with a due date,
with who asked you or who you&rsquo;re waiting on, and the meetings and appointments you&rsquo;ve
agreed, with their titles, notes and places, and so can anyone with its address. Apps under You &rarr; Apps &rarr; Discover are listed by their developers and looked at once by Caime; Discover shows how many people connected an app, never who, and an app reaches only what you allow it when its own sign-in asks. Opening a shared place on the map takes you to OpenStreetMap.</li>
</ul>
<p>Some of these companies, and Caime&rsquo;s servers where the hosting provider above says so,
are outside the European Economic Area, in countries the European Commission hasn&rsquo;t found to
protect personal data as the EU does. Where your data goes there, it goes under the safeguards the
GDPR asks for (Article 46): the European Commission&rsquo;s standard contractual clauses in each
company&rsquo;s data processing terms, or, for a company in the United States certified under it,
the EU&ndash;U.S. Data Privacy Framework. Write to ${mail} for a copy of the safeguards for any of
them. We don&rsquo;t sell personal data, and we don&rsquo;t share it for advertising.</p>

<h2>How long it&rsquo;s kept</h2>
<ul>
<li>What you keep in Caime stays while your account exists.</li>
<li>Your conversations with an organization are the organization&rsquo;s to answer for (it is
the controller; ${escapeHtml(f.legalName)} processes them for it). An organization can set how
long it keeps them: each message then goes when that time is up, as a disappearing message does,
and the conversation says so to you. It can export its conversations, and it can erase yours at
your request, which empties every message in it and leaves a line saying so. Ask the
organization; its team does it from its inbox.</li>
<li>When an organization closes, nothing more is written in its conversations, and you keep
yours with it, to read, as your own. Whoever ran it last can still export it for
${span(KEPT_DAYS.closedOrgExport)}; then what was the organization&rsquo;s alone is deleted: its
team, its page and settings, its catalog, its AI agent and what it was told, its apps, its
updates and its team&rsquo;s notes on its conversations.</li>
<li>In a conversation with disappearing messages, each message is emptied within about an hour of
its time being up: the setting when it was sent, counted from then, so a change to the setting
applies only to messages sent after it. It then shows as &ldquo;Message deleted&rdquo;:
its words, card and links go, and its files with them unless a copy someone forwarded still
holds them, as do the notifications about it. A message you delete for everyone goes the same way
at once, and so does what an organization&rsquo;s apps were sent of it (they&rsquo;re told it was
deleted); reactions to it stay. Decisions and actions made from a message and copies someone
forwarded stay, and so does the copy made for an organization&rsquo;s apps of one that
disappeared, for ${span(KEPT_DAYS.appDeliveries)} or the organization&rsquo;s own time if that&rsquo;s
shorter.</li>
<li>What a link&rsquo;s page said of itself, read for its preview, is kept for
${span(KEPT_DAYS.linkPreviews)} by a code made from the link, without the link, who sent it or
where, and goes sooner with a message that disappears or is deleted for everyone.</li>
<li>Security records are kept for ${span(KEPT_DAYS.securityRecords)}, and a device&rsquo;s sign-in
for ${span(KEPT_DAYS.endedSignIns)} after it ended. The log of what you do, without the words, is
kept for ${span(KEPT_DAYS.activity)}, and copies of what you send an organization, made for its
apps, for ${span(KEPT_DAYS.appDeliveries)} (or the organization&rsquo;s own time, if shorter). Counts that name nobody are kept a little longer than
a year.</li>
<li>An invite link that ran out or was taken back is kept for ${span(KEPT_DAYS.spentInvites)}, then
forgotten; the people who joined through it stay your connections. An organization&rsquo;s invite
to its team, with the address it was sent to, is kept the same way once it ran out, was taken back
or was used; whoever joined through it stays on the team. A link to join a group or a space is
kept the same way once it ran out or was taken back; whoever joined through it stays in it. An ask
to join is kept the same way once it was answered or taken back, and so is an invitation to a
group or a space once it was answered or ran out (who asked you is never in it). A link you
gave out to one of your files is kept the same way once it ran out or was taken back, with how
many times its page was opened, never by whom; it opens nothing once its message is deleted, you
leave that conversation, or it&rsquo;s taken back. A
notification is kept for
${span(KEPT_DAYS.notifications)}, then goes.</li>
${
  f.mailDomain
    ? `<li>Mail to your address (your @handle at ${escapeHtml(f.mailDomain)}) is a message like any
other, kept and erased with the rest; what the mail was on the wire (its ids, its subject, the
addresses) stays with the message, and erasing the message clears the subject and the sender&rsquo;s
address. A sender is taken for who they are only when their mail proves it came from their address
(its signature or the server that sent it, checked by Caime itself). Mail that doesn&rsquo;t is
never taken as anyone&rsquo;s: it&rsquo;s kept for you under Notices, saying its sender wasn&rsquo;t
confirmed, from a stand-in of its own named only by the address it claims, never answered and read
for nothing; unless its domain asks for such mail to be refused, which it then is, unread, as it is
at an organization&rsquo;s address and for anyone under 18. Someone who writes to you by mail and isn&rsquo;t on
Caime is kept as a person only you can see (their address and the name their mail gave) until a
year passes with no mail either way, or until every conversation with them is gone; signing up
with that address makes that person, and your conversations with them, theirs. A list&rsquo;s
mail or one from an address nobody answers (a newsletter, a no-reply sender) is a notice: kept
the same way, one conversation per sender under Notices, muted, and read for nothing. A mail&rsquo;s
layout (its HTML) is kept with it as it came, shown only to the conversation&rsquo;s people in a
sandbox where nothing in it runs or loads (so a tracking image tells its sender nothing), and
erased with the message. A mail in&rsquo;s signature is kept apart from its words, and erased
with them. A mail sent from Caime links back to the conversation; following that link, or
replying, tells its sender it was seen. Unless its sender turned it off, it also asks the mail
provider to say when it&rsquo;s opened, which shows its sender &ldquo;Opened, probably&rdquo;:
every such mail says so at its end. A card sent to someone reached by email goes as words in a
mail, a meeting&rsquo;s or an appointment&rsquo;s with an invitation their calendar adds and
answers; that answer, from the address invited and checked as any mail is, moves the card and is
kept only as that move. An invitation someone&rsquo;s calendar mails to your address, from that
address&rsquo;s own organizer, becomes a meeting card from them; your answer to it goes back to
their calendar from your address, and their later changes move the same card; the mail itself is
kept as any mail is.</li>
`
    : ''
}<li>A handle you stop using, by changing it or deleting your account, is kept from everyone for
${span(KEPT_DAYS.heldHandles)}, you included, so a link to it can&rsquo;t come to open someone
else. Only the handle and the days are kept, never whose it was, and then it&rsquo;s
forgotten. An organization keeps its handle, even once it has closed.</li>
<li>Billing records (your plan, what it cost and Stripe&rsquo;s reference to you) are kept as
accounting law requires, also after you delete your account. Reports are kept so the people who
run Caime can look into them: what a report holds stays with it whatever is deleted afterwards,
until it&rsquo;s closed and for ${span(KEPT_DAYS.closedReports)} after
(${span(KEPT_DAYS.childSafetyReports)} for a report about a child&rsquo;s safety), and then goes
with it; the name and address of someone who reported a page without an account go with it too. An
appeal is kept until it&rsquo;s decided and for ${span(KEPT_DAYS.decidedAppeals)} after.</li>
<li>When you delete your account, it goes at once, with your profile, devices, connections, how
you describe people, rules, automations, suggestions, actions, notifications, what you saved, and
your reactions and poll votes. Messages you sent stay in other people&rsquo;s conversations, shown
as from a deleted account. Lines in a conversation about what you did (&ldquo;Sam added
Lina&rdquo;) still show your name, and so do notifications people already have. Files you uploaded
that aren&rsquo;t in any message or album are removed. A group, space or organization you ran
passes to someone in it; one nobody else is in is closed. What stays: your handle, kept from
everyone for ${span(KEPT_DAYS.heldHandles)} (the handle and the days alone, never that it was
yours); security records and the log of what you did, until their time is up; copies of what you
sent an organization, made for its apps, for ${span(KEPT_DAYS.appDeliveries)}; billing records;
reports by or about you; your calls, in
the history of the people you called; and your devices&rsquo; public keys, so the people you wrote
to privately can still check your messages.</li>
</ul>

<h2>Your choices, and your rights</h2>
<ul>
<li><strong>Download your data:</strong> on the web, You &rarr; Security &rarr; Download your data
gives you a file with everything Caime keeps about you, for as long as it keeps each, as the app
shows it to you: your account and profile, your privacy settings, how you describe people, your
rules, connections, requests to connect and who you&rsquo;ve blocked; the conversations you&rsquo;re
in or were in, with your settings and drafts, the messages you sent, what you added to
others&rsquo; checklists, your shares of others&rsquo; splits, your reactions and votes; your files, each with a link; your actions, and
those people asked of you; what Caime suggested, and the decisions you&rsquo;re part of; your
notifications and calls; your devices, with where each signed in from and which service delivers
its notifications; your spaces, organizations and automations, what you&rsquo;ve saved, the apps
and tokens that can act for you, and your billing; what an organization&rsquo;s apps were sent of
your conversation with it; the reports you made; your security records, the log of what you do,
and when you used AI features. It leaves out other people&rsquo;s words (their messages, what they
added to a checklist, their notes, and a notification&rsquo;s or a suggestion&rsquo;s quote of
them); what the app doesn&rsquo;t show you either, such as who on an organization&rsquo;s team did
what, whether a call or a request was turned down, and what a group you&rsquo;ve left is called
now; reports about you, which would say who made them; secrets, which Caime keeps only as hashes
or never shows; and the server&rsquo;s own log. To ask about anything in it, or not in it, write to
${mail}.</li>
<li><strong>Correct it:</strong> change your name, @handle, photo, pronouns, gender, About you and status
in You &rarr; Profile at any time. To correct your email address or your date of birth, write
to ${mail}.</li>
<li><strong>Delete it:</strong> You &rarr; Security &rarr; Delete your account.</li>
<li><strong>Choose who sees what:</strong> You &rarr; Privacy decides who sees your profile photo,
About you, pronouns, gender, status, when you&rsquo;re online, when you were last seen and when
you&rsquo;ve read a message; whether people can find you by your @handle or your email; and who
can send you a message request.</li>
<li><strong>Keep people away:</strong> block or report someone from their page, and report a
message from its menu. Block or report an organization from its page.</li>
<li><strong>AI assist and notifications:</strong> AI assist is off until you turn on Use AI assist
in You &rarr; Privacy (from 18), and you can turn it off there at any time. In a browser, turn
notifications on or off in You &rarr; Notifications and priorities &rarr; In this browser.</li>
</ul>
<p>Wherever you live, you can ask us what we keep about you, ask us to correct or delete it,
object to how we use it, and take it with you. Where data protection law applies (in the EU and
the UK, for example), you can also complain to your data protection authority. Write to ${mail}
and we&rsquo;ll answer within a month.</p>

<h2>Children</h2>
<p>Caime is for people ${f.minimumAge} and older, from the day they turn ${f.minimumAge} where they
live${lawAges(f.minimumAge) ? `, and ${lawAges(f.minimumAge)}, whose law asks a guardian&rsquo;s consent for younger people that Caime doesn&rsquo;t yet ask for` : ''}. The rules for people under 18 apply until the day they turn 18. Under 18:</p>
<ul>
<li>Adults you&rsquo;re not connected with can&rsquo;t find you, by name, @handle or email, and
can&rsquo;t send you a connection or message request unless you share a connection. Nor can they
open your profile, unless one of you asked the other to connect or you&rsquo;re in a conversation
together. An adult&rsquo;s invite link connects you only with someone you know through someone.</li>
<li>You can&rsquo;t share a location, whether a place or where you are right now. A file kept as
it was sent (a GIF, a WebM video, a document) still carries whatever it holds.</li>
<li>You can start a conversation only with an organization that has verified who it is, and an
organization never writes to you first. It&rsquo;s told you&rsquo;re under 18, and its AI agent
never answers you. Its apps still can, and what they write is marked Automated.</li>
<li>Nobody can send an Invoice, an Order, a Purchase order or a Payment request, or an
organization&rsquo;s own card with an amount, in a conversation you&rsquo;re in.</li>
<li>Group calls are only with people you&rsquo;re connected with.</li>
<li>AI assist, access tokens and apps, Your calendar, buying a plan and running an organization are
for people 18 and over. Nothing on your profile (your photo, About you, when you&rsquo;re online)
is shown to everyone, whatever was set before: your connections at most.</li>
<li>Someone over 18 in a conversation with you can still use AI assist on it, and an
organization&rsquo;s apps get what you write to it.</li>
</ul>
${f.ageChecks ? ageChecksSaid(f.ageChecks) : ''}
<h2>Security</h2>
<p>Passwords are kept as salted scrypt hashes, and passkeys as their public keys alone, for
the domain Caime is on. Sign-in sessions, recovery codes, access tokens,
your calendar&rsquo;s address, and apps&rsquo; tokens, codes and secrets are kept only as hashes;
the exception is an organization&rsquo;s webhook secret, which Caime keeps so it can sign what it
sends. Caime is served over HTTPS, so what passes between your device and Caime is encrypted in
transit. The keys of private conversations are made on your devices and never leave them. No
system is perfect: if you find a weakness, please tell us at ${mail}. If a breach of Caime&rsquo;s
security puts your data at risk, we&rsquo;ll tell you what happened, what it touched and what to
do, without undue delay, and tell the authority as the law requires.</p>

<h2>On your device</h2>
<p>On the web, Caime sets one cookie, to keep you signed in, and no advertising or analytics
cookies; the phone apps keep your sign-in in the phone&rsquo;s secure storage. So it opens quickly
and works offline, the app keeps what you&rsquo;ve seen recently on your device: your account
details, your inbox, the latest messages in up to 30 conversations, your people, actions and
notifications, and messages, drafts and actions still waiting to be sent. Of a private
conversation it keeps only messages that are still sealed. Signing out removes all of this from
that device, and on the web asks your browser to clear the photos and files it kept. If
you&rsquo;re signed out from another device, all of this goes the next time Caime is opened on
that device with a network; until then, it opens on what it kept. On the
web, Caime also keeps its own files (never your messages) so it can open without a network.</p>

<h2>Changes</h2>
<p>When this page changes, its date above does. For a change that matters, we&rsquo;ll say so here
before it applies.</p>

<h2>Contact</h2>
<p>${contactLine(f, mail)}</p>`;
}

function terms(f: PageFacts, mail: string): string {
  return `
<h1>Terms</h1>
<p class="updated mono">last updated ${UPDATED}</p>
<p>These terms are the agreement between you and ${f.legalName}${identity(f)} (&ldquo;we&rdquo;) about using
Caime. By creating an account, you agree to them. How Caime handles your data is on the
<a href="/privacy">privacy</a> page.</p>

<h2>1. Your account</h2>
<ul>
<li>You need to be ${f.minimumAge} or older${lawAges(f.minimumAge) ? ` (${lawAges(f.minimumAge)})` : ''}, and to tell Caime the truth about your date of birth
and where you live. What&rsquo;s for people 18 or over is yours from the day you turn 18. Use any
name you like, as long as it doesn&rsquo;t pretend you&rsquo;re someone you&rsquo;re not.</li>
<li>Keep your password and recovery codes safe: you&rsquo;re responsible for what&rsquo;s done with
your account.</li>
<li>An account is one person&rsquo;s. By creating an organization on Caime, you confirm you may
act for it.</li>
</ul>

<h2>2. What you send is yours</h2>
<p>You keep every right you have in what you send and share. You let us store, process and
deliver it, only to run Caime for you and for the people and organizations you send it to. We
don&rsquo;t use it for advertising.</p>

<h2>3. Using Caime well</h2>
<p>Don&rsquo;t use Caime to:</p>
<ul>
<li>break the law, or help anyone else break it;</li>
<li>harass, threaten or exploit anyone, or harm children in any way;</li>
<li>send spam or messages people didn&rsquo;t ask for, in bulk;</li>
<li>pretend to be a person or an organization you&rsquo;re not;</li>
<li>share someone&rsquo;s private information without their permission;</li>
<li>spread malware, get around Caime&rsquo;s security or limits, scrape it, or overload it.</li>
</ul>
<p>We may limit, suspend or close an account or an organization that does, and we act on
reports.</p>

<h2>4. Organizations, their apps and their AI agents</h2>
<ul>
<li>An organization is responsible for its team, its apps, its bots and its AI agent, and for
following the law on marketing and on its customers&rsquo; data, above all for anyone under 18.
Its apps can receive what its customers write to it and pass it on to the organization&rsquo;s
own systems.</li>
<li>In a conversation, Caime always says when an app or an AI agent writes, and never passes one
off as a person. An organization&rsquo;s updates read as the organization&rsquo;s, whoever posted
them. Caime keeps an organization&rsquo;s apps to the permissions it gave them. Keep your tokens,
client secrets and webhook secrets secret.</li>
<li>&ldquo;Verified&rdquo; on an organization means it proved, with a DNS record, that it
controlled its domain when it verified. On a person, &ldquo;Verified at&rdquo; an organization
means that organization has them on its team. Neither is an endorsement.</li>
<li>An organization&rsquo;s conversations with its customers are the organization&rsquo;s to answer
for: it decides why and how long they are kept (it is their controller), and ${f.legalName}
stores and delivers them for it (as their processor) under a data processing agreement, available
from ${mail}. Caime is not a medical, legal or accounting record system: an organization keeps
its own records where the law asks it to.</li>
<li>An organization&rsquo;s owner can close it. Its export then stays open to that owner for
${span(KEPT_DAYS.closedOrgExport)} (You &rarr; Security); after that, what was the
organization&rsquo;s alone is deleted, and its customers keep their conversations with it.</li>
</ul>

<h2>5. AI features</h2>
<p>What Caime&rsquo;s AI suggests (a rewrite, a summary, a translation, a follow-up, an answer
about a conversation) can be wrong.
Check it before you rely on it: you decide what&rsquo;s sent. AI assist is off until you turn it
on. An organization can have an AI agent answer its customers: when you write to one that does,
its agent reads your messages and answers first, and says it&rsquo;s an AI agent. It stays out once
someone on the team has the conversation, and it never answers anyone under 18.</p>

<h2>6. Paid plans</h2>
<ul>
<li>Pro and Business are billed monthly or yearly, at the price shown before you buy, through
Stripe, and renew until you cancel. Plans are bought by someone 18 or over.</li>
<li>Cancel whenever you like with Manage billing, which opens Stripe&rsquo;s billing portal: for
Pro in You &rarr; Plan, for Business on the organization&rsquo;s page (its owner or an admin). When
you cancel, the plan stays until the end of the time you&rsquo;ve paid for. Deleting your account
ends Pro at once. Business is the organization&rsquo;s: it goes on for its team when you delete
your account, so if you pay for it, cancel it first. It ends at once only when the organization
closes.</li>
<li>Moving to a lower plan never deletes what you have. If you have more than it includes (files,
people on a team, apps), it all stays, but you can&rsquo;t add more until it fits.</li>
<li>Your rights as a consumer where you live, such as withdrawing from a purchase, still
apply. In the EU you can withdraw from a plan within 14 days of buying it by writing to ${mail};
a plan starts at once, with your agreement given when you buy, so you pay for the days it was
on.</li>
</ul>

<h2>7. Caime as it is</h2>
<p>We work to keep Caime running, safe and useful, but it&rsquo;s provided as it is, without a
promise that it will never fail. Features change; when we take one away, we&rsquo;ll say so here
first. Caime&rsquo;s name, its characters, its design and its software are ours; what you send
stays yours (see 2).</p>

<h2>8. Ending</h2>
<p>You can delete your account whenever you like (You &rarr; Security &rarr; Delete your account).
Deleting it ends Pro at once; an organization&rsquo;s Business plan goes on for its team (see 6).
Spaces, groups and organizations you run pass to someone in them; an organization with no one else
on its team closes, and its plan ends with it. We may suspend or close an account that
breaks these terms, and we&rsquo;ll tell you why unless the law or someone&rsquo;s safety stops
us; signing in then shows you why, lets you appeal, and lets you download your data. If we ever close Caime, or your access to it for any other reason, we&rsquo;ll give you 30
days&rsquo; notice by email, with your data there to download until then and any time paid for
and not used returned.</p>

<h2>9. Liability</h2>
<p>As far as the law allows, we aren&rsquo;t liable for indirect or unforeseeable losses, and our
liability to you is limited to what you paid us for Caime in the 12 months before the claim.
Nothing here limits a liability that the law doesn&rsquo;t let us limit, or your rights as a
consumer.</p>

<h2>10. Changes</h2>
<p>When these terms change, their date above does. For a change that matters, we&rsquo;ll say so
here before it applies. If you don&rsquo;t agree with a change, you can delete your account.</p>
${
  f.governingLaw
    ? `
<h2>11. The law</h2>
<p>These terms are under the law of ${f.governingLaw}, and its courts settle a dispute about them,
except that where you live in the EU as a consumer you keep the protection of your own
country&rsquo;s law and may bring a claim in your own courts. The EU&rsquo;s online dispute
resolution platform is at ec.europa.eu/consumers/odr.</p>

<h2>12. Contact</h2>`
    : `
<h2>11. Contact</h2>`
}
<p>${contactLine(f, mail)}</p>`;
}

function help(f: PageFacts, mail: string): string {
  const handle = `${escapeHtml(f.publicUrl)}/@<em>yourhandle</em>`;
  return `
<h1>Help</h1>
<p>Caime is messaging that knows who&rsquo;s who: your family, your friends, your team, the
businesses you deal with. Here&rsquo;s how it works.</p>

<h2>Getting started</h2>
<ul>
<li><strong>Your link.</strong> Your @handle is your address on Caime: ${handle}. Share it, and
whoever opens it can sign in and ask to connect, as You &rarr; Privacy allows (Finding you, and
Message requests). An adult can open the link of someone under 18 only once they&rsquo;re
connected, or one has asked to connect with the other.</li>
${
  f.mailDomain
    ? `<li><strong>Your email address.</strong> ${handle}@${escapeHtml(f.mailDomain)} is yours too
(You &rarr; Profile shows it). Mail sent to it arrives as a message from whoever sent it, in your
conversation with them: a thread is a topic named by its subject, attachments are files, and
what you answer goes back to them as mail from your address, with &ldquo;Sent&rdquo;,
&ldquo;Delivered&rdquo; or &ldquo;Bounced&rdquo; beside it as the mail servers say. A stranger&rsquo;s
first mail is a message request, like anyone&rsquo;s first message; under 18, only people you&rsquo;re
connected with reach you by mail. A newsletter or a no-reply sender&rsquo;s mail is a notice: it
waits under Notices, tells you nothing, asks nothing of you, and isn&rsquo;t answered. So does
mail Caime couldn&rsquo;t confirm came from the address it names, which says so and is never taken
as theirs. A card you send someone reached by email goes in words, and a meeting or an
appointment as an invitation their calendar adds: their yes or no from it moves the card here, as
a tap would. An invitation someone&rsquo;s calendar sends you is a meeting card from them: your
Accept or Decline goes back to their calendar, and if they move it, the card asks you again. What a
mail can&rsquo;t carry (a sticker, a poll, a live location) isn&rsquo;t offered.
An organization&rsquo;s address lands in its inbox.</li>
`
    : ''
}<li><strong>Inviting someone.</strong> In Connect, Invite someone makes a link that says who
you are and, if you choose, how you know them (&ldquo;Work &middot; DATA C&rdquo;). Whoever opens
it signs up in half a minute, on the web with nothing to install, and lands in a conversation with
you, already connected, with your label for them applied. A link works for thirty days, for
anyone who has it; take one back from the same place.</li>
<li><strong>Connecting.</strong> Find someone in Connect by their @handle, name or email, or open
their link, and ask to connect. Anyone can find you by your name or @handle while By your name or
@handle is on, by your email address while By your email is on, and by a phone number you proved
yours while By your phone number is on (all in You &rarr; Privacy). Both start on if you sign up as
an adult. Under 18, adults you&rsquo;re not connected with can&rsquo;t find you, and nobody can
find you by email or number.</li>
<li><strong>Say how you know them.</strong> Family, friend, work, a client: only you see it, and
Caime uses it to put what matters first. If you both turn on Share with <em>name</em>, each of you
sees how the other described you. Asking to connect shows them which kind it is and where, unless
you turn off Show <em>name</em> the context. Caime may suggest one, and says why; nothing changes
until you accept it.</li>
<li><strong>Message requests.</strong> A first message from someone you&rsquo;re not connected
with waits in Requests, silently, and they can send one until you answer. Reading it or declining
it never tells them: to them it stays unanswered. Replying accepts it. Its photos come blurred
until you tap one (under 18, until you accept), and nobody starts more than ${REQUESTS_PER_DAY}
new requests a day.</li>
<li><strong>Who can add you.</strong> Only people you&rsquo;re connected with can add you to a group
or a space. Choose Nobody (You &rarr; Privacy) and they invite you instead: the invitation waits on
Attention, and you&rsquo;re in only if you say yes. Under 18, you&rsquo;re always asked first where
the group or space holds people you&rsquo;re not connected with. Someone you blocked can&rsquo;t
add or invite you.</li>
</ul>

<h2>Conversations</h2>
<ul>
<li><strong>One to one, groups and spaces.</strong> Groups have topics of their own; a space (a
family, a team, a community) keeps its people and conversations together, with Coming up: the
meetings and appointments ahead in its conversations.</li>
<li><strong>Private conversations</strong> are end-to-end encrypted. On the web, open the page of
someone you&rsquo;re connected with and choose Private conversation, then tap the lock at the top
of it and compare security codes to be sure it&rsquo;s them. For now they&rsquo;re text only, and
not in the phone apps.</li>
<li><strong>Disappearing messages</strong> are set in a conversation&rsquo;s details: Off, 24
hours, 7, 30 or 90 days, or 1 year. In a one-to-one, either of you can set them; in a group, its
owner and admins. A topic follows its group.</li>
<li><strong>Cards</strong> are under Share (the paperclip): a Meeting, an Approval, a Poll, a
Checklist, an Album, a Location, a Payment request and, for work and businesses, a Review, an
Order, a Delivery, an Invoice, a Purchase order, a Support ticket or an Appointment, and an
organization&rsquo;s own. Each conversation offers only the ones that fit, and private
conversations don&rsquo;t have them yet. A Location can be where you are now, or live for 15
minutes, an hour or 8 hours while Caime is open: stop it from the Sharing your location live
bar. Either of you can give a meeting or an appointment another time from its card: Suggest
another time asks the other side again, and whoever has it by email, or as a guest, gets the
change in their calendar.</li>
<li><strong>A message&rsquo;s menu</strong> lets you react, Reply, Forward, Pin, Edit or Delete.
You edit only your own text messages. Forward isn&rsquo;t in private conversations, nor for cards,
polls or a live location. Pin is in
one-to-ones, and in groups for their owner and admins. Delete for everyone is for your own
messages (and a group&rsquo;s owner and admins); Delete for me is always there.</li>
</ul>

<h2>What needs you</h2>
<ul>
<li>Chats puts first what needs you: a question someone asked you, something they asked you to do,
a mention, and actions due soon or overdue (a private conversation&rsquo;s messages, which Caime
can&rsquo;t read, never count). That&rsquo;s the Attention view, which also keeps message requests
and archived conversations, folded away at its end. All lists every other conversation.</li>
<li>You &rarr; Notifications and priorities sets who reaches you and when: a rule for each kind of
relationship, and your work week. A rule for one person is on their page, under Notifications and
priority. Quiet hours are there too: whose messages wait for set hours.</li>
</ul>

<h2>Actions</h2>
<ul>
<li>Turn a message into an action with Add to my actions, in its menu (not in a private
conversation). When you ask someone to do something in a one-to-one, or @mention them in a group,
Caime offers to track it. See what you were asked (Asked me) and
what you&rsquo;re waiting on (Waiting) in Actions.</li>
<li>You &rarr; Apps &rarr; Your calendar gives Google Calendar, Outlook or Apple Calendar
a private address with your open actions with a due date, and the meetings and appointments
you&rsquo;ve agreed. Anyone with the address sees them, so keep it to yourself. It&rsquo;s for
people 18 and over.</li>
</ul>

<h2>With no network</h2>
<p>Messages and actions you make offline wait on your device and go when the network is back.
Photos, files and cards need the network, and in a private conversation a message waits only while
Caime stays open. Search finds what&rsquo;s on your device, and on the web Caime opens without a
network once you&rsquo;ve opened it there before.</p>

<h2>Organizations</h2>
<ul>
<li>Businesses, clinics, schools and nonprofits have a page anyone on Caime can find, and a team
that answers as the organization, from one shared inbox.</li>
<li>An organization verifies its domain with a DNS record, and then reads as
&ldquo;Verified&rdquo;. Its updates reach those who follow it.</li>
<li>In conversations, its apps and its AI agent always say they&rsquo;re automated. Its updates
read as the organization&rsquo;s, whoever posted them.</li>
<li>For developers: an organization&rsquo;s apps are added on its page and get a token, and a
webhook if you give one an address. From 18, you can make tokens for your own scripts or register
an app in You &rarr; Developer.</li>
</ul>

<h2>Plans</h2>
<p>Caime is free. Pro, for a person, and Business, for an organization, add more. See Pro, buy it
or cancel it in You &rarr; Plan; Business is on the organization&rsquo;s page, for its owner and
admins. Plans are bought by someone 18 or over.</p>

<h2>Safety and privacy</h2>
<ul>
<li>Block or report someone from their page, and report a message from its menu. Block or report
an organization from its page, or block it when it writes to you first.</li>
<li>You &rarr; Privacy decides who sees your profile photo, About you, pronouns, status, when
you&rsquo;re online, when you were last seen and when you&rsquo;ve read a message, who can find
you, and who can send you a message request. From 18, it&rsquo;s also where you turn Use AI assist
on or off.</li>
<li>Under 18, Caime keeps more in place: see <a href="/privacy">privacy</a>. That changes on the
day you turn 18.</li>
</ul>

<h2>Your account</h2>
<ul>
<li>You &rarr; Security shows where you&rsquo;re signed in, changes your password, adds and
removes passkeys, makes new recovery codes and deletes your account. Download your data there on the web; the phone apps send
you to the web for it.</li>
<li>Forgot your password? On the sign-in screen, tap Forgot your password? and use one of your
recovery codes to set a new one.</li>
<li>Where you live is in You &rarr; Profile, and sets your defaults. Your date of birth can&rsquo;t
be changed in the app, so the protections for people under 18 hold: if it&rsquo;s wrong, write to
${mail} and we&rsquo;ll correct it.</li>
</ul>

<h2>Still stuck?</h2>
<p>Write to ${mail}.</p>`;
}

const TITLES: Record<PageName, string> = {
  privacy: 'Privacy',
  terms: 'Terms',
  help: 'Help',
};

/** One of Caime's pages, whole: a small document with its own styles and no script. */
export function renderPage(name: PageName, facts: PageFacts): string {
  const f = {
    ...facts,
    legalName: escapeHtml(facts.legalName),
    legalAddress: facts.legalAddress ? escapeHtml(facts.legalAddress) : null,
    governingLaw: facts.governingLaw ? escapeHtml(facts.governingLaw) : null,
    legalRegistration: facts.legalRegistration ? escapeHtml(facts.legalRegistration) : null,
    contactEmail: escapeHtml(facts.contactEmail),
  };
  const mail = `<a href="mailto:${f.contactEmail}">${f.contactEmail}</a>`;
  const body =
    name === 'privacy' ? privacy(f, mail) : name === 'terms' ? terms(f, mail) : help(f, mail);
  const nav = (['help', 'privacy', 'terms'] as const)
    .map((n) =>
      n === name
        ? `<a href="/${n}" aria-current="page">${TITLES[n]}</a>`
        : `<a href="/${n}">${TITLES[n]}</a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLES[name]} · Caime</title>
<meta name="description" content="Caime's ${TITLES[name].toLowerCase()}">
<meta name="color-scheme" content="light dark">
${f.faces}
<style>
${THEME_VARS}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--text);font:17px/1.6 ${FACE.body}}
header,main,footer{max-width:720px;margin:0 auto;padding:0 20px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 14px;padding-top:24px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.brand{font-family:${FACE.heading};font-weight:800;font-size:22px;color:var(--ink);text-decoration:none}
.mono{${type('mono')};color:var(--text-secondary)}
header .mono{margin-inline-end:auto}
nav{display:flex;gap:16px}
nav a{color:var(--text-secondary);text-decoration:none}
nav a[aria-current]{color:var(--text);font-weight:600}
a{color:var(--link)}
h1{font-family:${FACE.heading};font-weight:800;color:var(--ink);font-size:32px;line-height:1.2;margin:32px 0 4px}
h2{font-size:21px;margin:32px 0 8px}
.updated{margin-top:0}
.short{border:1px solid var(--border);border-radius:12px;padding:4px 20px;margin:24px 0}
ul{padding-inline-start:22px}
li{margin:6px 0}
footer{color:var(--text-secondary);font-size:15px;padding-top:32px;padding-bottom:40px}
</style>
</head>
<body>
<header><a class="brand" href="/">Caime</a><span class="mono">about Caime</span><nav class="mono" aria-label="About Caime">${nav}</nav></header>
<main>${body}
</main>
<footer>${f.legalName} &middot; ${mail} &middot; <a href="/">Open Caime</a></footer>
</body>
</html>
`;
}
