# Roadmap and status

The live status of the build. Update this file at the end of every work block: tick what is
done **and verified**, add what was discovered, and keep "Blocked" honest. A box is ticked only
when the thing works end to end and has a test; partial work stays unticked with a note.

Legend: `[x]` done and verified · `[~]` in progress or partial (note says what is missing) ·
`[ ]` not started · `⛔` blocked on something outside the repository.

## M0 — Foundation

- [x] Monorepo (pnpm, hoisted), TypeScript, Biome, shared configs
- [x] Docs: PRD, product review, brand, competitive strategy, architecture, roadmap, goal
- [x] CLAUDE.md operating manual
- [x] GitHub repository [`h-khalid-h/Caishy`](https://github.com/h-khalid-h/Caishy), `main`
- [x] One API contract (`packages/core/src/api.ts`); server views annotated against it

## M1 — Core domain (`packages/core`)

- [x] Sphere and role taxonomy (inclusive, R28), complementary roles (PRD §53)
- [x] Zod schemas for every API payload
- [x] Attention engine (PRD §19–20, R7–R8)
- [x] Relationship policy engine: notifications, attention, privacy, workweek (R9–R11, R31)
- [x] Message intelligence: questions, requests, commitments, decisions, dates, amounts, links
      (PRD §23, R12) — English and Egyptian/MSA Arabic
- [x] Search query parser (PRD §25)
- [x] Privacy evaluator (PRD §34, §62)
- [x] Connect Kits registry (PRD §41, R19)
- [x] Formatting and ids

## M2 — Server foundation

- [x] Config, logging, errors, health, migrations under advisory lock
- [x] Auth: sign-up, sign-in, sessions (cookie + bearer), CSRF header, recovery codes, age gate
- [x] Profiles and identities, people search with privacy and age rules
- [x] Connections, requests with context, relationships (versioned, private, shared), history
- [x] Suggestions (relationship signals), custom roles, policies

## M3 — Messaging

- [x] Direct, group, topic conversations; participants; drafts. Groups are run from their details
      (PRD §56): who's in it and who runs it, adding people and removing them, making admins,
      its name and what it's for, and leaving; an owner who leaves (or whose account goes) hands
      it to the admin there longest, else whoever has been in it longest. Only its owner and admins
      change it, its context or disappearing messages; a decision changes only by whoever made or
      recorded it, or them; a context is linked only by someone who can see it; admins take down
      anyone's message. Every change to who's in it or who runs it runs under its own lock; someone
      added again starts as a member; leaving a space or deleting an account hands on what they
      owned, and says so; renaming it is said; someone removed while it's open sees it go
      (`messaging.test.ts`, E2E). A group's header says what it has gathered,
      "6 people · 3 decisions · 4 open · 8 files · Friday" (PRD §57), and "@" in the composer
      offers who's in it: whoever a message names is told, and sees it marked, edited or not; a
      name two people share names neither, so the picker writes that person's handle (PRD §20;
      `mentions.test.ts`, `messaging.test.ts`, E2E)
- [x] Messages: ordered, idempotent; replies, reactions, edit, delete; read state; polls; pinned
      messages (PRD §22), five at most, kept at the top for everyone and gone once deleted, by
      whoever may change the conversation, and never while a message request is unanswered
      (`messaging.test.ts`, `blocking.test.ts`, E2E); forwarding from a message's actions to up to
      20 conversations, each checked as sending there would be first, so to all of them or none,
      never from or into a private one; cards, polls and live locations stay where they were
      shared (`messaging.test.ts`, E2E). A change to a message (an edit, a card moved on, a pin)
      reaches other devices as a change to the one they show, never a message added to their
      history, and keeps what's theirs: their votes, which reactions are theirs (`cache.test.ts`)
- [x] Realtime hub (WebSocket + pg NOTIFY), typing, presence
- [x] Attention inbox API
- [x] Message requests from non-connections (R14): links inert until accepted; declined, one stays
      shut and reads to its sender as unanswered (`messaging.test.ts`, E2E)

## M4 — Memory, action, notification

- [x] Tasks, waiting, requests, reminders (R13); decisions, saved from a message's actions too
      (PRD §30); contexts. A task or decision points back only to a message in its own
      conversation and a context its maker can see; a customer sees the organization decide, never
      which of its team (`actions.test.ts`, `business.test.ts`, E2E)
- [x] Suggestions from message intelligence (and emerging topics, follow-ups)
- [x] Topics (PRD §58), offered when a subject keeps coming up or started from a conversation's
      details: of a one-to-one, the two of them on one subject, while they're connected; of a
      group, the group again with its people in the roles they have there, who come and go with
      it (as muted as they have the group), as private as it is, disappearing as it does, and
      listed in it; never from a private one-to-one. Accepting an offer follows the same rules,
      and once one person has, the others' offers open the same topic. A topic goes by its
      group's name with its own in chats, notifications, calls, call history and search
      (`messaging.test.ts`, E2E)
- [x] Conversation memory and asset index: what's been shared, a kind at a time (photos and
      videos, files, links), newest first and a page at a time, from the conversation's details,
      each opening from there or shown where it was said; what someone deleted for themselves
      stays out of what they're shown, and of what the memory counts (PRD §24, §26;
      `messaging.test.ts`, `files.test.ts`, E2E)
- [x] Search across people, relationships, orgs, messages, assets, actions, contexts
- [~] Notifications: levels, burst consolidation, schedules, and Web Push: a service worker
      (`apps/app/public/sw.js`) shows what the server pushes when Caishy isn't open in front (a
      call rings until it's answered, turned down or over, then says so quietly) and a tap opens
      it in the open tab without a reload; each new one alerts, even over an older one about the
      same thing; one read anywhere closes. Each browser is asked once, from Settings →
      Notifications or Chats; every later sign-in there gets its pushes unless they turned them
      off there, and signing out drops them and what's shown. Pushes name people as they show
      themselves to that person, and Safari keeps them coming (`sw.test.ts`, `webPush.test.ts`,
      `messaging.test.ts`, `calls.test.ts`, `group-calls.test.ts`, E2E registers the worker under
      the app's CSP; a real push service isn't reachable from the E2E). Expo push implemented but
      ⛔ needs EAS credentials for production builds; not yet exercised end to end
- [x] Jobs: reminders, held notifications, follow-ups, retention
- [x] Automations (PRD §69), set up by the person they act for: keeping what arrives from someone
      known a way (or anyone) that's a file, photo, video, voice note or link, with a word in
      its name or its message ("invoice"), in a collection of one's own ("Customer Files"). A
      reminder when someone hasn't answered and quiet hours are rules, listed with them on one
      Automations page. A message is saved by hand from its actions, and one file or link of
      it from what's shared in the conversation. Saved
      lists every collection and what's in it, each opening where it is and shown where it was
      said; what's deleted or disappears, or is deleted for oneself, goes from it too
      (`automations.test.ts`, core `automations.test.ts`, E2E)

## M5 — App (iOS, Android, Web)

- [x] Design system from `BRAND.md`: theme, primitives, wordmark, characters; light and dark
      verified in screenshots; the Minimal style swaps characters for icons wherever a guide
      appears (E2E, reviewed on screen)
- [x] Auth and onboarding: sign-up with live handle checks, sign-in, recovery codes, relationship
      defaults, find people (E2E)
- [x] Attention inbox, conversation, composer, inline suggestions, typing, presence, reciprocal
      read ticks (E2E, phone and desktop)
- [x] Connect flow in ≤ 3 taps (sphere, role, done), accept with a label, People (E2E)
- [x] Share links: `/@handle` opens that person or organization, found only as search would
      find them; a Caishy link in a message opens in the app; a desktop browser without a
      share sheet copies the link. Someone signed out keeps the link through sign-in, sign-up
      and onboarding ("You came here for @noor") and lands on it (`handles.test.ts`,
      `paths.test.ts`, E2E)
- [x] Person profile, relationship change and its history, one line per change (E2E). Who they
      are to you (PRD §67, §71): your conversation (how often you talk, in words, and when you
      last did), what it's about (its contexts), what's shared, actions open and waiting,
      questions each way, and what they see of you. What Caishy thinks they may be to you
      (PRD §12), from a team or a space you're both in, a company email or how they described
      it, is offered on their page and at the top of People: accept it, change it first, or
      not now, which it remembers (`relationship-profile.test.ts`, core `profile.test.ts`, E2E)
- [x] Possible duplicates (PRD §51): two of someone's people who may be one (the same name as
      they show it, the same nickname, or one name inside the other from the same place) are
      offered at the top of People, never merged for them. Merged, one row stands for both,
      only in that person's view, each account keeps its conversations, and either can be
      separated again. Only what the person sees is compared, never an email or a phone number;
      every one of their people is compared (however many), with every account of anyone
      merged, in any script; blocking takes an offer back, and losing the account the others
      show under keeps them one person (`duplicates.test.ts`, E2E)
- [x] Search: finds a message and opens its conversation scrolled to it, marked (E2E)
- [x] Settings: every page opens; the theme follows the account to a fresh device (E2E);
      download your data and delete your account (E2E)
- [x] Where someone lives and when they were born, and what follows from them (R29, R31):
      sign-up asks a date of birth (13 or over, an age exact to the day where they live, never
      shown, not changed in the app) and a country, suggested from the device's time zone; an
      organization says where it's based and, if it likes, the year it was founded. From them
      come the work week, the currency a card's amount starts in (rounded as that currency is)
      and who is under 18. Language and region holds the country, the time zone, the language
      things are written in and the work week (`auth.test.ts`, `geo.test.ts`, `orgs.test.ts`,
      `migrations.test.ts`, E2E)
- [x] Pickers made for each platform: a date on the phone's own wheel or dialog and on a
      calendar on the web, a time the same way, in 12 or 24 hours as the person's language
      writes it; for when something is due, a mute ends or a card's day falls, quick picks
      before a day and a time; countries (250, Kosovo among them), currencies, time zones (by
      city, in the person's language, with the offset now) and languages in lists found as
      they're typed, in any script, by several words, with or without accents, dots or hamza;
      amounts typed with any language's separators or digits; a status's emoji from a grid; a
      collection picked like a folder, one of the person's or a new one made there, never twice
      for a difference of case; and where you know someone from picked from where you've said before, one
      organization however it's typed. A due date is changed on any action in
      Actions (`find.test.ts`, `when.test.ts`, `times.test.ts`, `dates.test.ts`,
      `amounts.test.ts`, core `time.test.ts`, `digits.test.ts`, `emoji.test.ts`,
      `connections.test.ts`, `automations.test.ts`, E2E). [ ] A map to pick a location card's
      place ⛔ a map provider
- [x] Rules (PRD §68–70): how Caishy treats a kind of relationship, a role in it, or one
      person, all of it changed from Settings → Notifications and priorities: notifications
      (always, in set days and hours, only if important, never), urgent messages, priority (in
      hours only, too), a reminder when they haven't answered, the tone Caishy suggests, and how
      much of you they see. What a rule leaves alone shows as it comes from the broader one; a
      named rule is a template ("My Vendors"), and asking for one the same people have is that
      one. The work week is changed there. A person's page has a rule just for them over their
      relationship's, taken away when it says nothing; one is only ever for one's own connection
      (`connections.test.ts`, E2E)
- [x] Actions: add one in words ("by Friday" becomes its due date), finish it, undo; a request
      from someone lands in Asked me (E2E)
- [x] Alerts: requests and message bursts arrive, each with why it was held or sent (E2E)
- [x] Spaces tab (phones) and rail item (desktop): your spaces busiest first, start one, open
      one (E2E, screenshots)
- [x] Desktop web: rail, list, detail and context panel (E2E screenshots); keyboard shortcuts:
      Ctrl/⌘ K search, Alt ↑/↓ between conversations, ↑ edits your last message, ? lists them
      (E2E)
- [x] Realtime client with reconnect and catch-up; on-device cache with revalidation; offline
      outbox: a message written offline sends the moment the network returns (E2E). Offline
      first (PRD §49): an action added or ticked offline is on the list at once as Pending, kept
      on the device and sent when the network returns, once however often it's sent (the
      device's id for it makes a retry the same action); the last tick wins; one the server
      refuses says why, with Try again or Discard. Offline, search reads what's on the device
      (people, conversations, messages, actions; never a private conversation's words) and says
      so (`taskOutbox.test.ts`, `onDevice.test.ts`, `actions.test.ts`, E2E). On the web the
      service worker keeps the app itself, its page and every file of its build, replaced
      together by the next build: Caishy opens and moves between screens with no network (or
      while a deploy restarts the server), a page is always the network's while there is one,
      and nothing the API answers is kept (`sw.test.ts`, `web.test.ts`, E2E). Opened offline,
      it says Offline, not Connecting
- [x] Stickers (Caishy Friends, 16): sent, and arrive live (E2E)
- [~] Native: iOS and Android bundles export (Hermes); not yet run on a device or simulator.
      Share links open the app only once it claims its domain (iOS associated domains, Android
      app links, and the two files the server would serve under `/.well-known/`)

## M6 — Expansion

- [~] Files, images (metadata stripped, thumbnails), resumable uploads, ranges done; voice notes
      store and play; transcription ⛔ needs a speech-to-text provider
- [x] Organizations: a business, shop, clinic, school, nonprofit or public service with a
      profile anyone can find and a team. Its handle shares one namespace with people's, so
      nobody can pose as it. It verifies its domain with one DNS TXT record
      (`_caishy-verify.<domain>`); only then is it "Verified · <domain>" and its team "Verified at
      <name>", and no other organization can claim that domain. Changing the domain unverifies it
      until the new one is proven. The team is made of adult connections; owners and admins
      manage it and the domain; an owner who leaves or deletes their account hands it on; the
      last one out closes it (`orgs.test.ts`, E2E)
- [x] Organizations' updates (PRD §59, §15 broadcast): an organization's owner and admins (or its
      app, with `updates`) post to whoever follows it; anyone reads them on its page, as the
      organization's. People follow from the page (and choose whether each update notifies
      them); Updates is one row at the top of Chats and a screen of its own, never among their
      conversations or what needs them, each organization with whether Caishy verified it.
      Nobody sees who follows; the team sees how many. A review found that the notifications
      could stop halfway, reach someone who'd blocked it or say what was taken back, that
      blocking and the page could disagree, and that an app's posts weren't marked; all fixed:
      a job tells followers a batch at a time (restarts lose nobody, nobody hears twice, a
      taken-back update stops), notifications follow the update when it changes or goes and
      are read with it, posts are sent once however often they're retried, changes are limited,
      an update or an organization can be reported, and one that closes is followed by nobody
      (`updates.test.ts`, E2E)
- [x] Business inbox: a customer messages an organization from its page (found in Connect or
      by its link) and gets one conversation with it; the whole team is in it and answers as the
      organization, so the customer never sees who (masked in every view, search, notification,
      live event and AI transcript). The inbox sorts its conversations by what they need
      (customer waiting, new, assigned to me, waiting on customer, escalated, resolved), longest
      wait first; whoever answers an unassigned conversation has it; anyone on the team can hand
      it on; escalating tells the owner and admins; resolving holds until the customer writes.
      States come from the order of messages, never timestamps. It's on the desktop rail and at
      the top of Chats for anyone on a team, and team members' own chats never fill with it
      (`business.test.ts`, E2E). A customer can block an organization: its team and bots can no
      longer write to them and the conversation closes until they unblock it (`blocking.test.ts`,
      E2E). A verified organization's team writes to someone first by their handle, and it
      arrives as a message request: silent, in Requests, links inert, one message until they
      answer; they accept, decline or block it. Never to anyone under 18 or who only hears from
      people they know, and limited by plan per day (`business-start.test.ts`, E2E, which also
      verifies a domain end to end against a DNS stand-in). Customers under 18 write only to an
      organization that has verified who it is (a school, a club, a clinic) and are told its team
      will know; the team sees "Under 18", no card about money is offered or accepted, and its
      apps' webhooks say so too (`business-minors.test.ts`, E2E). What either side asks or promises
      is offered as a follow-up, by the heuristics or Find follow-ups: to the customer in the
      organization's name, pointing at nobody on its team; to whoever on the team has the
      conversation (`business-suggestions.test.ts`, `ai.test.ts`, E2E)
- [x] Spaces: a family, team, project, community or school with its people and conversations.
      Everyone is in its General conversation (which goes by the space's name); its other
      conversations are open to join; a topic that keeps coming up in General becomes one.
      People join only through someone inside who is connected with them; owners and admins
      manage it; an owner who leaves or deletes their account hands it on; the last one out
      closes it. Its kind picks the cards its conversations offer (`spaces.test.ts`, E2E). Its
      page is also its calendar (PRD §41, a family's shared calendar): Coming up lists the
      meetings and appointments proposed or agreed in its conversations each person is in,
      soonest first, each opening its card, as a conversation's details do for its own
      (`calendar.test.ts`, E2E)
- [x] Connect Kits as cards: approval, meeting, review, order, delivery, invoice, purchase
      order, payment request, support ticket, appointment, and polls; offered only where they fit
      the relationship, moved by the right person, live (`kits.test.ts`, E2E). Checklists anyone
      in the conversation ticks and adds to, done when all is ticked; a place, or where you are
      right now, shared once and never by under-18s (`kits.test.ts`, `checklists.test.ts`, E2E).
      Albums everyone in the conversation adds photos to, newest first, seen only by the people
      in it; whoever added a photo, or made the album, takes it out, and its maker closes it
      (`albums.test.ts`, E2E). Where you are, live for 15 minutes, an hour or 8 hours: it follows
      its sharer while Caishy is open, keeps only the latest point, and ends at its time or when
      they stop it; the sharer always sees it's on. Never by anyone under 18, never with an
      organization (`live-location.test.ts`, E2E). An organization's own kinds of card (PRD §74,
      §86 "Custom"): its app makes them through its token (fields, states, and who makes each
      move), and it or the team sends them to customers, who make the customer's moves; the app
      moves and changes its own cards and hears on its webhook when someone sends or moves one.
      Data, never code; a card keeps the kind it was sent with; none about money reaches anyone
      under 18 (`custom-kits.test.ts` in core and on the server, E2E; `docs/API.md`)
- [x] Integrations (PRD §72): a calendar feed. Google Calendar, Outlook or Apple Calendar
      subscribes to a secret address (shown once, kept as a hash; a new one ends the old) and
      shows open actions with a due date, on their day or at their time, what you're waiting
      on, and the meetings and appointments agreed in your conversations, busy for their length
      and with where; done, cancelled or left, they go. Caishy stays the record: nothing in a
      calendar changes anything in it (`calendar.test.ts`, `ics.test.ts`, E2E).
      [ ] Storage, CRM and helpdesk connectors: apps and webhooks cover the Business inbox
      (`docs/API.md`); two-way calendar sync needs each provider's OAuth app (⛔ credentials)
- [x] AI assist with Claude, off until each adult turns it on (Privacy settings), never on
      private conversations: rewrite a draft (clearer, shorter, more formal, friendlier, in the
      relationship's tone), translate a message, catch me up (offered when ten or more are
      unread), find follow-ups (filed as ordinary suggestions, never twice). Everything it writes
      is labelled "Suggested by Caishy" and used only on a tap; the heuristics stay the default
      and the fallback (`ai.test.ts` against a Messages API stub, E2E)
- [x] Export and account deletion (`account.test.ts`, E2E); others keep their conversations,
      shared files and the actions they were waiting on
- [x] Retention: disappearing messages per conversation (24 hours to 1 year), set from the
      conversation's details, announced to everyone in it (`system-messages.test.ts`, E2E)
- [x] Block, report, rate limits, link safety
- [x] Apps for organizations (R16): an owner or admin adds an app, which gets a bot on the
      team, a token shown once and limited to the routes and permissions it was given, and a
      webhook signed with a secret shown once, retried with its deliveries listed on the app's
      sheet. The bot answers customers as the organization and every reply says "Automated";
      it never takes a conversation or counts as the team's answer (`apps.test.ts`, E2E; the
      developer guide is `docs/API.md`). Personal access tokens for people's own scripts: named,
      with the permissions they chose and a lifetime, shown once, reaching only their messages
      and actions and never the account itself; what they send says "via" the token
      (`personal-tokens.test.ts`, E2E). OAuth for third-party apps: a developer registers one in
      Developer, people see who made it and what it asks before letting it in, and it gets
      tokens that act within that and say "via" it, ended from Connected apps
      (`oauth.test.ts`, E2E; `docs/API.md`). AI agents (PRD §74–75): an organization's support
      agent answers customers first from what the organization told it, says it's an AI in
      everything it writes, hands a conversation to the team when it can't answer or is asked
      for a person, and never answers anyone under 18 (`agents.test.ts`, E2E)
- [x] Plan entitlements (R23): what each plan includes lives in core and is checked on the server
      where something is added (AI assists, files, a team's people, apps). The wedge is never
      counted, and a lower plan never removes anything. You → Plan shows what's used; an
      organization's owner and admins see its plan on its page. The operator sets plans with
      `ADMIN_TOKEN` (`docs/DEPLOY.md`), and a plan set that way is never changed by billing
      (`plans.test.ts`, `ai.test.ts`, E2E).
- [x] Billing with Stripe (PRD §84, R25): Pro for a person and Business for an organization,
      monthly or yearly, bought through Stripe Checkout and managed in Stripe's customer portal;
      prices are found in Stripe by their lookup keys, and the plan follows the subscription
      (on while it's paid, in a trial or being retried; off once it ends) from signed webhooks,
      each re-read from Stripe, one at a time for each subscription. Only a person, or an
      organization's owner or admins, buy or manage its plan; nobody under 18 buys. A review
      found twelve ways it could charge wrongly or keep a plan wrongly, all fixed: people on a
      price whose key moved are followed to the end, an organization that closes and an account
      deleted end their customer at Stripe (a job and a six-hourly check if Stripe is away), an
      operator's plan is never changed or sold over, nothing is sold twice while a webhook is
      late, test and live mode stay apart, and the plan page shows what the subscription itself
      costs (`billing.test.ts` against a Stripe stand-in, 34 mutations, E2E through the stand-in's
      Checkout and portal pages). ⛔ The live account's products, prices,
      portal and webhook endpoint are set up once billing is deployed (`docs/DEPLOY.md`)
- [x] Metrics: `/metrics` for the operator's scraper (PRD §81), product metrics from what Caishy
      already keeps (PRD §82–83: activation, engagement, the core rates, retention), and insights
      for organizations on Business (PRD §71: customers who wrote, first answer, waiting,
      resolved), all counts and times, never content (`metrics.test.ts`,
      `product-metrics.test.ts`, `insights.test.ts`, E2E). Needs you precision (answered, against
      "doesn't need me"), time to find something (from the first letter of a search in the apps
      to opening a result) and invites (sign-ups through someone's @handle link, and the
      K-factor), each recorded without anyone's id or what anyone wrote or searched for
      (`product-metrics.test.ts`, E2E)
- [x] Calls (PRD §47): 1:1 voice and video on the web, between two people who can already
      write to each other. The server rings every device of the person called, lets one answer,
      and passes offers, answers and candidates only between the two devices in the call; the
      media goes device to device. Missed after 45 seconds, busy while in another call (said
      only to those who may see that someone is online), ended when either side leaves or one
      blocks the other, and each call leaves its line in the conversation ("Video call ·
      4 min", "Missed voice call") (`calls.test.ts`, E2E with Chromium's fake camera).
      Screen sharing on desktop browsers, in a video call or a voice one, with no renegotiation
      (video goes both ways from the start); the two devices tell each other what they show, so
      the other side sees the screen whole, the avatar rather than black when a camera is off,
      and a muted mark (`engine.web.test.ts`, E2E with Chromium's fake screen).
      Group calls in groups of up to eight: every device in one connects to every other (whoever
      joined later makes the offer, so two never offer each other), everyone who can take part is
      rung, a call that's on shows a banner to join it, and it goes on while two are in it, then
      leaves its line ("Group video call · 12 min"). Blocks and R29 keep people apart in a call,
      and leaving the group leaves its call (`group-calls.test.ts`, `group.web.test.ts`, E2E with
      three browsers). Call history: every call a person was in or was rung for, newest first,
      the missed ones, and those with one person (People → Calls, and on a person's page), each
      with how it ended and how long it lasted; a group call shows only who was in it while the
      person was part of it, and someone who's left a group sees only their own place in its
      calls; indexed, so it reads only that person's calls (`call-history.test.ts`, E2E).
- [x] Private conversations (R18, PRD §61), end to end encrypted, on the web: with a connection
      (or a group of them), started from their page; every message sealed on the sender's device
      for every device of everyone in it and signed by it, so the server keeps only envelopes it
      can't read, change or forge. Each device's keys are its own and go when it signs out; a
      later device waits until one of the person's approves it, and each device checks those
      approvals itself, so the server can't add a device as someone's; a security code for each
      person (their first device's, so it holds as they add devices) to compare, and a notice
      when one changes; a device added later can't read what came before it. A review found
      sixteen ways the server or a stolen copy of it could still read, forge, replay or hide
      messages; all are fixed (keys pinned on each device, approvals, drafts and the outbox
      kept off disk, messages opened only in their conversation and at their newest edit,
      replies sealed with what they answer, a deleted account's messages still checkable).
      Text only for now; never forwarded, never read by AI (`e2ee.test.ts`, `private.test.ts`
      on the server and in the app, E2E with two browsers and a third device approved from the
      phone). [ ] Private conversations in the phone apps
      [ ] Calls in the phone apps. ⛔ Call summaries need a speech-to-text provider
      ⛔ A TURN relay for calls on strict networks (`TURN_URLS`, `TURN_SECRET`, `docs/DEPLOY.md`)

## M7 — Ship

- [x] One image (API, realtime, web): built, pushed to `ghcr.io/h-khalid-h/caishy` and
      smoke-tested by CI on every push to `main` (readiness, the page, security headers)
- [x] CI: lint, typecheck, tests on Postgres 16, build, web budget (448.4 KB gzip against 450 KB),
      Playwright E2E against the production bundle
- [x] Security review: `docs/SECURITY.md` lists each control with the test proving it, and the
      gaps. [ ] Third-party penetration test
- [x] Caishy's own privacy policy, terms and help at `/privacy`, `/terms` and `/help`, for
      anyone and linked from About and sign-up, each claim checked against the code; what's
      recorded of use kept only for set times (`lib/retention.ts`). [ ] A lawyer's review of the
      texts, and the operator's name and contact confirmed (`LEGAL_NAME`, `CONTACT_EMAIL`)
- [ ] EAS config and store builds ⛔ Apple and Google developer accounts, `EXPO_ACCESS_TOKEN`
- [x] Deployed to EasyPanel: https://caishy-caishy.0hqwb7.easypanel.host (project `caishy`,
      services `caishy` and `db`; `docs/DEPLOY.md`, "Live deployment"). Checked from outside:
      readiness, the page and its headers, and a sign-up whose realtime socket connected
      through EasyPanel's proxy before the account deleted itself. Only what passed CI is
      deployed: a green run fast-forwards the `production` branch, which EasyPanel builds from;
      AI assist is on there (`ANTHROPIC_API_KEY`)

## Log

- 2026-09-26 — Session 1: docs written; brand system adopted from the owner's board (vector
  recreation pending); monorepo scaffolding started.
- 2026-09-26 — Session 1 (cont.): core engines (105 tests), brand tokens (49 tests), server M2–M4
  and files (71 integration tests on real Postgres). GitHub repository still unreachable, so all
  commits are local to the container. Next: the Expo app (M5).
- 2026-09-26 — Session 2: pushed to GitHub. Shared API contract. The universal app (auth,
  onboarding, attention inbox, conversations, people, connect, actions, search, settings, desktop
  three-column layout, realtime, outbox, stickers). Driving it end to end found and fixed: live
  read receipts bypassing the reciprocal rule, a device locale ("en-US@posix") that broke every
  date, a restored cache that hid new conversations, a vague commitment titled "It" plus a
  duplicate suggestion. Server bundle, Dockerfile, CI, E2E suite and deploy guide. Tests: 111
  core, 49 brand, 74 server, 2 E2E.
- 2026-09-26 — Session 2 (cont.): the image builds, pushes and passes its smoke test in CI.
  Account export and deletion (a deleted account no longer takes other people's waiting actions
  with it: migration 0003). Relationship history on profiles, one event per change. Search opens
  the message it found. A second E2E spec (history, search, stickers, offline, settings) found
  and fixed: raw highlight markers in search results, a change recorded as an addition plus a
  change, and the app staying "offline" after a network blip on Chromium (NetInfo's web build
  never hears the network return). Alerts read "sent 56 messages (56)" and
  "outside 08:00–20:00" on a Saturday; they now read "sent 56 messages" and "outside Mon–Fri
  08:00–20:00". Keyboard shortcuts; their test found that editing your last message left the
  old text in the inbox preview. Connect Kits as live cards; the server now owns what a card
  says and where it stands (it used to store whatever a client sent, "approved" included). Its
  test's frames showed 55 "Update N" messages each suggesting a task titled with the number: a
  verb and only a number is no longer a request. Disappearing messages; building them found
  that system lines (group created, people added or leaving) were stored without words and
  showed as blank pills, that any conversation change touching only shared settings (renaming a
  group) failed with a 500, and that phones had no way into a group's details. Reviewing the
  Minimal style found characters it didn't replace (Connect, Search, About, the error screen).
  Arabic messages now align right on every platform (they relied on the browser's own
  direction, which iOS doesn't do). A flaky E2E run traced to a real race: a message arriving
  while a conversation's first page loaded was dropped; the app now applies live changes again
  once the page lands (unit-tested; the app has unit tests now). Tests: 125 core, 49 brand,
  86 server, 3 app, 14 E2E.
- 2026-09-26 — Session 2 (cont.): AI assist through Claude (rewrite, translate, catch me up,
  find follow-ups), with server-side refusal fallbacks, tested against a local stand-in for the
  Messages API in both the server tests and E2E. Building it found four older bugs. Waiting
  items were titled by their object alone, so "I'll confirm the caterer" became "Caterer"; only
  hand-over verbs (send, share) are titled that way now. After a reload, a conversation took its
  unread line from the device's stale copy, so neither "New messages" nor the catch-up offer
  appeared; it now waits for a fresh copy. On desktop web, the Reply and React buttons beside a
  message vanished the moment the pointer reached them (a pressable inside another ends the
  outer one's hover), so they could never be clicked; they sit beside the bubble now. And a
  message sent after a conversation's first page loaded but before the socket was listening was
  never shown; the app now catches up on every connection, the first included (E2E holds the
  socket back to prove it). Each AI call is recorded without its text (feature, model, tokens,
  time, outcome) and is in the person's export. Tests: 126 core, 49 brand, 94 server, 3 app,
  16 E2E.
- 2026-09-26 — Session 2 (cont.): Spaces, with the Spaces tab. Building them found two more
  bugs. A system line in a conversation preview read "You: Noor Haddad started…" instead of
  "You started…". And the flaky right-to-left test was real: after a reload, a live message
  written into the restored cache made TanStack treat that cache as fresh, so the conversation
  never refetched and a message sent just before the reload stayed missing. Live writes now
  keep the data's fetch time and its refetch mark (unit-tested; fails without the fix). A
  sheet that emptied itself while closing now keeps its content until it's gone. Tests: 129
  core, 49 brand, 101 server, 4 app, 17 E2E.
- 2026-09-26 — Session 2 (cont.): Organizations, with DNS verification and the trust label their
  teams carry. Building them found two bugs in how the server serves the web app. Any page whose
  path ended in something like a file extension got the API's 404 instead of the app, so an
  organization with a dot in its handle (`/o/nile.dental`) broke on reload, and so did a link
  whose query ended in one (`?h=sara.ali`); a page load is now recognized by what the browser
  asks for, and a missing file is still a 404, never the app (`web.test.ts`, fails without the
  fix). And the Connect screen's "Find me there" link pointed at a domain and a route that don't
  exist; that's next. Tests: 133 core, 49 brand, 110 server, 4 app, 18 E2E.
- 2026-09-26 — Session 2 (cont.): share links. `/@handle` opens a person or an organization,
  and a link survives signing up: the welcome page says whose link it is, onboarding ends on it,
  and Back goes home. Sharing on a desktop browser used to do nothing (there's no share sheet);
  it copies the link now. Tests: 133 core, 49 brand, 112 server, 8 app, 19 E2E.
- 2026-09-26 — Session 2 (cont.): the Business inbox. The hard part was R15's "staff reply as
  the organization": a customer's view of a conversation passes through one mask (every id but
  theirs reads as the organization's), applied where messages are built and on the realtime
  bus, and tested against every place the team could leak (views, live events, typing, reads,
  search, memory, shared links, cards, notifications); each protection fails its test when
  removed. Two bugs found on the way: whose turn it was compared timestamps, which tie within a
  millisecond, so it reads the order of messages now; and embedding the conversation screen in
  the inbox route moved it into the shared startup chunk (460 KB against 450), so on desktop
  the inbox is a list pane beside the conversation's own route, as Chats is. Tests: 135 core,
  49 brand, 121 server, 8 app, 20 E2E.
- 2026-09-26 — Session 2 (cont.): apps for organizations: scoped tokens, bots that always say
  they're automated, and signed webhooks (`docs/API.md`). A bot is on the team but never takes a
  conversation, moves whose turn it is, signs in, or inherits an organization when its owner
  leaves. Reviewing it before shipping found four holes, each now closed with a test that fails
  without the fix. A thread could be assigned to a bot, by a person or by an app's own token,
  which would have taken a new customer out of the team's New view and its waiting count. An IPv4
  address written as IPv6 (`[::ffff:127.0.0.1]`, which the URL parser turns into hex groups)
  passed the private-network check, and Node skips the DNS guard for a literal address (checked),
  so on a host with IPv6 a webhook could have reached the server's own loopback (this container
  has no IPv6 to show that last step); the check now reads every IPv6 form that carries an IPv4
  address. An endpoint that answered one byte at a time never tripped the socket's idle timeout
  and could hold the job queue indefinitely; a delivery now has 10 seconds in all. And jobs ran
  one after another, so one slow endpoint delayed every other job; they run eight at a time.
  Tests: 137 core, 49 brand, 132 server, 8 app, 21 E2E.
- 2026-09-26 — Session 2 (cont.): plan entitlements (R23, PRD §84). What each plan includes lives
  in core and is checked on the server where something is added: AI assists (10 a day on Personal,
  200 on Pro, over any 24 hours; a refusal says when the next one is ready, on the person's own
  clock), files (5 GB, 100 GB; an upload under way counts at its full size), and an organization's
  team (3 people on Free, 100 on Business) and apps (1, 25). Nothing that makes Caishy useful is
  counted, and a lower plan never removes anything. You → Plan shows what's used; an
  organization's owner and admins see its plan, and the team sheet and Apps say when there's no
  room before anyone tries. The operator sets plans until billing is connected. Building it found
  that an organization's member count included its apps' bots; it counts people now. Tests: 141
  core, 49 brand, 138 server, 8 app, 22 E2E.
- 2026-09-26 — Session 2 (cont.): metrics. `GET /metrics` was documented in DEPLOY.md but never
  built; it is now, in Prometheus's format behind METRICS_TOKEN: requests by route as declared,
  realtime connections, messages, jobs, webhooks, AI calls, pushes, the database pool and the
  event loop. The operator's product metrics (PRD §82–83) are computed from what Caishy already
  keeps, with no new tracking of anyone, and say what they can't measure yet. Organizations on
  Business see how their inbox is doing; a customer's wait ends when a person answers, never an
  app's bot. Building it found that a business conversation's start was stamped by the database's
  clock rather than the app's, unlike the rest of it. Tests: 142 core, 49 brand, 146 server, 8
  app, 23 E2E.
- 2026-09-26 — Session 2 (cont.): blocking an organization. A customer blocks it from its page;
  its team and its apps' bots can no longer write to them, the team sees the conversation "Closed
  by the customer" with nothing left to do in it, and the customer can unblock it from the page or
  the conversation. Building it found that a block only ever stopped sending: in a blocked
  person's conversation they could still react, edit what they'd written, vote, move a card and
  show as typing. All of them now ask one check first, and each fails its test when removed. CI
  failed once on a test of mine that read the AI allowance before the call's record had landed
  (it's written after the response); reproduced by slowing the record, fixed by waiting for it.
  Tests: 142 core, 49 brand, 149 server, 8 app, 24 E2E.
- 2026-09-26 — Session 2 (cont.): location and checklist kits. A checklist card that anyone in the
  conversation ticks and adds to, done when everything is ticked; a place, or where you are right
  now (asked once, shown with how precise it was), never live and never from someone under 18. The
  end-to-end test found two bugs. Checking a card's fields twice, as the app does before sending
  and the server does on arrival, broke a checklist's items; checking is idempotent now, with a
  test. And React Native Web drops accessibility state: every checkbox, radio, tab and toggle in
  the app read as unchecked and unselected to screen readers on the web; the shared Pressable now
  says it as ARIA. Under-18s' location, and simultaneous ticks under a row lock, each fail their
  test when removed. Tests: 148 core, 49 brand, 152 server, 8 app, 25 E2E.
- 2026-09-26 — Session 2 (cont.): shared albums. Anyone in a family, friend or community
  conversation makes one; everyone in it adds photos and videos from their own uploads, sees
  them newest first on the card and all of them in the album, and takes out what they added
  (with Undo); whoever made it can take anything out and closes it when it's done. A photo is
  seen through the album only by the people in the conversation, and is its owner's alone again
  once taken out or the album is deleted; a deleted account's photos stay for the others. The
  end-to-end test found that every toast raised inside a sheet (an error, "copied", an Undo) was
  drawn under it, behind the scrim and out of reach; toasts now show in the topmost sheet.
  Access, ownership, closing and removal each fail their test when removed. Tests: 148 core, 49
  brand, 155 server, 8 app, 26 E2E.
- 2026-09-26 — Session 2 (cont.): organizations write first. Someone on a verified organization's
  team writes to a person by their handle, from the Business inbox; unless they've written to it
  before, it reaches them as a message request from the organization: silent, in Requests, one
  message until they answer, and they accept, decline or block it. Never to anyone under 18,
  anyone who blocked it, or anyone who only takes messages from people they know, and a plan's
  starts a day limit it. Building it found two gaps in message requests. A declined request
  stayed open: its sender could keep writing, and each message notified the person who had
  declined it; it now stays shut and reads to its sender as unanswered, as a connection request
  does. And links in a request were clickable, though R14 says they wait until it's accepted;
  they're text until then. End-to-end tests now verify a domain for real, against a DNS
  stand-in. Tests: 148 core, 49 brand, 163 server, 8 app, 27 E2E.
- 2026-09-26 — Session 2 (cont.): customers under 18. They were refused by every organization,
  which left out the ones most of them need: their school, a club, a clinic. They can now write
  to an organization that has verified who it is, never to one that hasn't, and never hear from
  one first. The page tells them its team will know they're under 18; the team sees it on the
  conversation, cards about money aren't offered (the server refuses them, as before), and
  webhooks carry it so an integration never treats them as a customer to market to. Tests: 148
  core, 49 brand, 165 server, 8 app, 28 E2E.
- 2026-09-26 — Session 2 (cont.): follow-ups with organizations. What an organization asks of a
  customer ("Please bring your insurance card on Thursday") is offered to them as something to
  do, said as the organization's, never as the person on its team who wrote it; what a customer
  asks goes to whoever on the team has the conversation, and each side's own promises become
  their reminders. Find follow-ups works there too, on the same terms, and nothing comes of a
  request the customer hasn't accepted. Its test found a race of my own: a follow-up the
  heuristics write after the response could land in the middle of the AI's, and was taken for a
  duplicate; the test now waits for it. Local test runs could also fail at the end of a file
  when an autovacuum worker was in its database, which the local role may not end; dropping
  waits it out. Tests: 148 core, 49 brand, 168 server, 8 app, 28 E2E.
- 2026-09-26 — Session 2 (cont.): live location. After finding where you are, you choose just now,
  or live for 15 minutes, an hour or 8 hours. The server keeps the clock; only the sharer moves
  it, from their device while Caishy is open, and only the latest point is kept, never a trail. A
  pill says "Sharing your location live · until 6:04 PM" wherever they are in the app, with
  Stop, and the card has Stop sharing too. Under-18s can't share one and it's never shared with
  an organization. Tests: 149 core, 49 brand, 171 server, 8 app, 29 E2E.
- 2026-09-26 — Session 2 (cont.): the last three product metrics. Needs you precision counts the
  times someone answered what Needs you asked of them against the times they said it didn't
  need them; time to find runs from the first letter typed in the apps' search to opening a
  result, or to leaving with nothing; and a sign-up through someone's @handle link records whose
  it was, for invites and the K-factor. None of it keeps anyone's id beside the event, or what
  was written or searched for, and nobody is told who came through their link. Its test found
  that "answered" was decided after the response, when a quick "doesn't need me" had already
  moved the line it's measured from; it's decided as the message is sent now. Tests: 149 core,
  49 brand, 172 server, 8 app, 29 E2E.
- 2026-09-26 — Session 2 (cont.): personal access tokens. You → Developer makes one for your own
  scripts: a name, what it may do (read or send messages, read or change actions, see your name
  and handle) and how long it lasts; it's shown once and only its hash is kept. It reaches only
  the routes behind those permissions, and nothing about the account itself: not the password,
  privacy, sessions, tokens, export or deletion. Revoked, or out of time, it stops at once;
  recovering an account ends all of them. A message it sends shows "via" its name, so nobody
  takes a script for someone typing. Tests: 149 core, 49 brand, 176 server, 8 app, 30 E2E.
- 2026-09-26 — Session 2 (cont.): OAuth for third-party apps. A developer registers an app in
  You → Developer: its name, website, exact return addresses, and whether it runs on phones and
  in browsers (PKCE, no secret) or on its own server (a secret, shown once). Someone the app
  sends to Caishy sees who made it and what it asks, signing in first if they need to and coming
  back to the question, and lets it in or not. The app trades a code (single use, ten minutes,
  bound to its PKCE challenge) for an hour's access token and a month's refresh token that turns
  over on each use; a code or refresh token used twice ends the grant, since only a copy would
  be. The app acts within what it was allowed, and what it sends says "via" it. People end it in
  You → Connected apps, its developer removing it ends it for everyone, and nobody under 18 lets
  one in. `/.well-known/oauth-authorization-server` tells OAuth libraries where everything is.
  Its review found that a Basic header that didn't decode answered 500 and that revocation didn't
  check which app asked; both are fixed and tested. The export now lists the tokens and apps
  that act for you and the apps you made. Tests: 153 core, 49 brand, 185 server, 9 app, 31 E2E.
- 2026-09-26 — Session 2 (cont.): AI agents (PRD §74–75). An organization's owner or admins turn
  on its AI agent on the organization's page: a name ("Nile Dental Assistant" to start), what it
  knows (hours, prices, how to book), and a question to try it on first, with nothing sent. It
  joins the team as its own member, and a customer sees on the organization's page, before
  writing, that it answers first. When a customer writes, it waits a moment (so three quick
  messages are read as one), reads the conversation and what it was told, and answers, hands the
  conversation to the team (a booking, a payment, a complaint, anything it wasn't told, or a
  customer asking for a person), or closes it when the customer is done. Everything it writes
  says "AI agent", and like any bot it never takes a conversation or counts as the team's answer.
  It stays out of anyone under 18, private conversations, anything escalated or handed over, and
  any conversation a person on the team is in; a customer writing to a resolved conversation
  asks something new, so it may answer again until the team writes. It answers each message
  once, even with two workers on it, at most ten times in a conversation a day, and within the
  plan (50 answers a day on Free, 2,000 on Business). Its review found that it would never have
  answered a customer who had once talked to a person; `reopened_at` fixed that. Tests: 154
  core, 49 brand, 196 server, 9 app, 32 E2E.
- 2026-09-26 — Session 2 (cont.): calls (PRD §47), 1:1 voice and video on the web. A phone and
  a camera button in a direct conversation's header ring every device of the other person
  wherever they are in the app, with the caller's name and photo; one device answers, and the
  others stop ringing. The server passes offers, answers and candidates only between the
  caller's device and the one that answered, so nothing else can join; the media goes device to
  device. In the call: the other camera full screen, yours in a corner, a running clock, mute,
  camera off and hang up. Unanswered it's missed after 45 seconds (with a notification), a
  second call finds you busy, and a call both sides left ends by itself. Each call leaves one
  line, read by each side their way ("Video call · 4 min", "Missed voice call", "Voice call · no
  answer"). The E2E found that ICE candidates were refused (the browser adds a username
  fragment the schema didn't expect) and that the other camera stayed black once a voice became
  a picture; both are fixed. A TURN relay for strict networks is configuration (⛔). Tests: 156
  core, 49 brand, 205 server, 9 app, 33 E2E.
- 2026-09-26 — Session 2 (cont.): a review of OAuth, the AI agent and calls, with every confirmed
  finding fixed and a test that failed first. OAuth: only the token and revocation endpoints take
  form posts (every `/v1` route did, so another site could sign someone in to its own account);
  recovering an account ends the apps it let in; allowing an app again only adds to its
  grant, so the grant always covers its tokens; two first allows at once no longer fail; a code turning up after it
  expired ends nothing; browser apps can trade their code (CORS on token, revocation and
  discovery, without credentials); a rate limit answers as OAuth libraries expect; a business
  customer sees "via an app", never a team member's app's name; and someone who signs up from an
  app's link ends onboarding on its question. The AI agent: every model call counts against a
  conversation (twenty a day), so writing while it thinks can't keep it thinking; an answer
  thrown away isn't counted against the plan; a person who wrote since a conversation was
  resolved, or took it since the customer came back, keeps it; it knows the day where the
  customer is; a try is one of the person's own AI assists; at its cap it tells the customer
  it passed them on; and `business.thread` says who moved a thread (`by`). Calls: each side says
  for itself that it's still there, so one side can't keep a call the other left; blocking ends a
  call at once; "on another call" is said only to someone who may see that person is online;
  the ring's notification is read once it stops, its push lives only while it rings and reaches
  browsers only; large signals leave the database within ten minutes, and offers are limited. On
  the web, a failed heartbeat no longer ends a working call, a lost event can't leave either side
  waiting (the heartbeat reconciles, and a call that can't connect in 30 seconds ends), closing
  one ringing tab no longer declines everywhere, a ring that arrives while starting a call
  isn't lost, a video call without a camera goes ahead with the voice, and the call screen is a
  dialog with a name, focus on what to do, its status announced and a ring. Every new guard was
  mutated and its test failed. A second review of those fixes found more, now fixed too:
  allowing an app again only adds to its grant (it replaced it, so an app asking for one more
  thing lost the rest); a push reaches only devices still signed in (a device signed out from
  elsewhere kept getting previews); the agent's notice follows the customer's language; a call
  to someone busy and hidden rings for the caller like any unanswered call (it answered at once,
  which gave them away); and on the web, signing out mid-call stops the camera and microphone,
  a ring whose end was lost stops when its time is up, a caller without a camera still gets the
  other camera, the clock isn't read out every second, the keyboard stays in the call screen,
  a tab answering but not yet in the call never declines it, and late answers can't end the
  next call (`engine.web.test.ts` drives the engine with fake WebRTC for these). Tests: 156 core,
  49 brand, 223 server, 20 app, 33 E2E.
- 2026-09-26 — Session 2 (cont.): screen sharing in calls on the web. In a call on a desktop
  browser, "Share screen" shows a window, a tab or the whole screen instead of the camera, in a
  voice call too: every call carries video both ways from the start, so nothing is renegotiated,
  and "Stop sharing" (or the browser's own bar) puts the camera back. The two devices tell each
  other what they show over a data channel of their own, so the other side sees the screen whole
  ("Noor is sharing their screen"), the avatar instead of black frames when a camera is off, and
  when someone is muted. Tests: 156 core, 49 brand, 223 server, 25 app, 33 E2E (the call test now
  shares a screen in a video call and in a voice one).
- 2026-09-27 — Session 2 (cont.): group calls on the web, in groups of up to eight. Every device
  in a call connects to every other, so the media goes device to device as in a 1:1 call; the
  server rings everyone who can take part, keeps who's in it on which device (`call_members`),
  passes offers, answers and candidates only between two joined devices, and ends the call when
  fewer than two are left in it, with its line in the group ("Group video call · 12 min").
  Whoever joined later makes the offer, so two devices never offer each other; `rev` goes up with
  every change others can see, so a device ignores older views; a device that joins again gets a
  new connection. Blocks and R29 keep people apart (nobody rung by or joining a call with
  someone they're blocked with; someone under 18 only with people they're connected with);
  leaving the group, being removed or deleting the account is leaving its call; one call at a
  time for each person, 1:1 or group, and one on at a time in a group. On the web: a ring with
  who's in it, a grid with mute, camera, screen sharing (shown large) and leave, call buttons in
  groups of up to eight, and a banner to join a call that's on. Three reviews, each confirmed
  finding fixed and its test shown to fail without the fix: every change to who's in a call is
  made under the call's lock, and placing, answering, starting or joining under the person's
  own, so a leave or the sweep never decides on a call someone just joined and nobody ends up in
  two calls; a start or join under way is seen by any block, removal or connection ended; what
  the group sees is who's in it, never who was rung, turned it down or missed it (a ring that
  stops is told only to its person and moves nothing anyone can count, and an unanswered call
  rings its whole time); signals go by person and device; and on the web, Mute or Camera off
  pressed while the browser asks holds for what it gives (1:1 too), Leave while joining from a
  ring turns it down, a join left for another lets go of its microphone, whoever joins while a
  call is being started is answered, a ring stays the server's to end (never the device's
  clock), a ring that couldn't get the microphone still asks when its time is up, either engine
  looks for the other's ring once free, and in Firefox a candidate that comes before its ICE
  restart's answer waits for it. Tests: 157 core, 49 brand, 257 server, 55 app, 34 E2E (three
  browsers in one call).
- 2026-09-27 — Session 2 (cont.): offline first, and a calendar. An action added or ticked
  offline is on the list at once as Pending, kept on the device and sent when the network
  returns, once however often it's sent (the device's id for it; the server returns the one it
  has, also when both copies arrive at once); one refused says why, with Try again or Discard.
  Offline, search reads what's on the device and says so. On the web the service worker keeps
  the app itself (its page and every file of its build, replaced together), so Caishy opens and
  moves between screens with no network; opened offline it says Offline, where it used to say
  Connecting forever. A calendar feed (PRD §72) gives Google Calendar, Outlook or Apple Calendar
  a secret address with open actions that have a due date and agreed meetings and
  appointments; its address is shown once and kept as a hash. Mutation-tested: 46 changes to
  the new code, each caught by a test but two that change nothing observable. Tests: 193
  core, 49 brand, 388 server, 100 app, 50 E2E (actions made and ticked offline, search offline,
  the web app reloaded with no network, and a calendar reading its address).
- 2026-09-27 — Session 2 (cont.): what's coming up, in a conversation's details and on a
  space's page (its shared calendar), soonest first and each opening its card.
- 2026-09-27 — Session 2 (cont.): automations, rules and Caishy's offers, after a review. With
  an organization, its team keeps only what the customer sends, and the customer what the
  organization sends whoever on it wrote (blocks of people on its team included), so a missing
  file never says who sent it. Only what someone can see and remove counts toward what they may
  keep, counted and added one at a time; Saved and Automations catch up on every device; words
  are found in camelCase, after digits, next to Chinese or Japanese, after the Arabic
  article and in names written decomposed, each text folded once; automations and what's saved are in the export; one file or link is saved from
  what's shared; nothing of a private message (or one still waiting to go) becomes an action,
  a decision or something saved. Opening someone's rule makes none, closing it removes none, and quick changes
  never undo each other (merged as written). An offer goes once you've said how you know them,
  blocked them or left where it came from, is offered once however it came, names them as they show themselves, and
  reads as a person. A calendar's address is never in the server's log, recovering the account
  ends it, a message request's asks never reach it (and one that can't be sent leaves no action),
  and what's ahead is always in it, however much is behind. Cached pages from before are dropped
  rather than misread. Migrations 0028
  (automations by person), 0029 (offers in one form) and 0030 (the cards a calendar reads, by
  kind, so a message's payload changes in place again). Mutation-tested: 29 changes to the fixes, each caught by a test. Tests: 198
  core, 49 brand, 405 server, 100 app, 50 E2E (an automation turned off beside it, one file saved
  from what's shared, and someone's rule opened and closed without making one).
- 2026-09-27 — Session 2 (cont.): offline, after a review and a review of its fixes. A deploy's
  error page counts as no network, so what's waiting stays Pending; a browser's tabs share one
  queue, each showing and sending what another queued, the later change winning; a tick or an
  Undo made while an action is being sent, or after an answer was lost, reaches the server as
  the row says; the queue is only ever the signed-in person's. A screen reader can retry or
  discard a refused action. Offline search understands the same questions as the server
  ("tasks from Sarah", "my manager", "from Uncle O"), finds only what's still to do, makes
  only the results it shows, names an organization's messages by it and never a group as a
  sender, forgets a group left and its topics, and folds case the same in every language. The
  service worker keeps the app as it installs (open tabs never wait on it), keeps the page on a
  slow first visit, and only with its own build's files, fonts and images included; the
  offline E2E proves the page came from it. Mutation-tested: 24 changes to the fixes, each
  caught by a test but one that changes nothing observable. Tests: 198 core, 49 brand, 405
  server, 118 app, 50 E2E; 449.4 KB of initial JavaScript.
- 2026-09-27 — Session 2 (cont.): an organization's own kinds of card (PRD §74, §86 "Custom").
  Its app makes them through its token (fields, states, and who makes each move: the
  organization, its customer or either); the app or its team sends them to customers, each side
  makes only its own moves, and the app moves and changes its own cards and hears on its webhook
  when someone sends or moves one. A kind of card is data, never code: plain-text labels, each
  its own, fixed field types and icons; a card keeps the kind it was sent with; none about money
  reaches anyone under 18, and one organization's never go in another's conversations. A review
  found eleven more (two changes to a card at once, moves limited, history kept to its last 50,
  a teammate shown the customer's moves, past dates, invisible characters); all fixed. Offers from
  a whole team or space are one read. Mutation-tested: 54 changes to the new code, each caught by
  a test but one the tests can't tell apart (a row lock two sequential moves don't need). Tests:
  208 core, 49 brand, 420 server, 118 app, 51 E2E (an app's card sent by token, moved by the
  customer, and one sent by hand from Share).
- 2026-09-27 — Session 2 (cont.): Caishy's own privacy policy, terms and help at `/privacy`,
  `/terms` and `/help`, for anyone, linked from About and sign-up, served as their own text (no
  script, nothing loaded, never framed), each written from a claim-by-claim check against the
  code, then reviewed page by page again. Where the code fell short of what the pages say, the
  code changed: a request's assignee never sees how its owner described them; a rename renames
  the name people see; a photo whose details can't be removed isn't kept; the Order card is
  adults-only; what's recorded of use goes after a year (security), 30 days (activity, AI use,
  ended sign-ins, copies for apps) or 400 days (counts that name nobody), a few thousand rows at a
  time beside the worker loop; a message deleted or disappeared takes its words out of every
  notification (a burst's too, with a quiet replacement for a browser that isn't open), what
  Caishy offered from it and an album's photos; a disappearing message keeps the setting it was
  sent with, so turning it on no longer empties years of both people's history; "Verified at" is
  one of your professional details; reporting an organization's message works; a sign-in ended
  anywhere clears the browser's cache of photos; the age to sign up is counted on New Year's Day
  where you are. Where the code was right and the words weren't, the words changed. The web app
  copies and picks photos without the Expo modules (the tap opens the chooser, as Safari wants):
  446.0 KB of initial JavaScript. Mutation-tested: 70 changes to the new code, each caught by a
  test but one that changes nothing observable. Tests: 209 core, 49 brand, 442 server, 123 app,
  52 E2E. The texts still want a lawyer's review.
- 2026-09-27 — Session 2 (cont.): a tab never acts as an account it isn't showing. When another
  tab signs out, or in as someone else, the cookie changes under every tab: a tab left open
  showed the last person's account, and what it had waiting would have gone out as whoever was
  signed in by then. The app now says whose account it shows on every call, and the server
  refuses one that finds someone else signed in (409 wrong_account); a tab follows at once, as
  whoever is signed in now or on the welcome page; the realtime socket checks the account its
  hello names; opening on a saved account that isn't the one signed in signs it out here first.
  Mutation-tested: 9 changes to the new code, each caught by a test. Tests: 209 core, 49 brand,
  445 server, 126 app, 53 E2E (two tabs, one signed out and in as someone else under the other).
- 2026-09-27 — Session 2 (cont.): recovery codes are kept as slow hashes. They were SHA-256 of
  40 random bits, which a copy of the database gives up in minutes; now scrypt, with a salt of the
  account's own, so one hash checks a try against all ten codes and making them costs 146 ms at
  sign-up. Codes made before keep working until used or replaced. Found on the way: confirming
  the password while signed in (a new password, new recovery codes) had no limit, so a session
  someone took could be used to guess it; now ten tries in ten minutes. A code tried twice at the
  same moment works once (tested now). Mutation-tested: 15 changes, each caught by a test but one
  that changes nothing observable. Tests: 209 core, 49 brand, 450 server, 126 app, 53 E2E.
- 2026-09-28 — Session 2 (cont.): the phone's layout, from how people hold the messengers they
  already use, kept where it serves relationships first (BRAND.md, Phone layout): Chats, People,
  Spaces and Actions in a floating pill at the bottom with Search in a circle beside it; you as
  your picture at the top of each place, opening your status, presence and the way to everything
  else; round header buttons; and Chats by relationship, a chip each for Attention, All and every
  kind of relationship your conversations have. Calls load when there's one, so the app starts
  without both call engines: 440.3 KB of initial JavaScript before the layout, 443.7 KB with it.
  Its review found, and the code now does: a call that rings while the calls can't load is asked
  for again once they do, and a call button that can't load them says so; All settings opens over
  the place you were in, so Back comes back to it; the chips are one choice to a screen reader,
  keep their 44-px targets and focus rings whole, and wrap on a desktop; presence is a list that
  reads at any text size, shown as chosen while it's saved; your picture's dot is what people see
  (none when your privacy shows it to nobody); a tab's name fits a 320-wide phone. Mutation-tested:
  11 changes to the calls' loading, each caught by a test but one that changes nothing observable.
  Tests: 209 core, 49 brand, 450 server, 132 app, 53 E2E.
- 2026-09-28 — Session 2 (cont.): Download your data has everything Caishy keeps about someone,
  as the app shows it to them (lib/export.ts). New in it: their items on others' checklists, how
  far they've read, what Caishy noted in their messages, the actions asked of them and whom theirs
  wait on, whom a suggestion is about, each device's notification service, the business
  conversations they worked on, the copies an organization's apps were sent of their conversation
  with it (found by an index of their own, 0034), an operator's change to their plan, and all of
  their billing. Its review found 30 things, each now fixed and tested. The file said more than
  the app does: a call turned down read "declined" to the caller, a sent request said it was
  turned down, a customer's cards named who on the team moved them, a group, space or context
  they'd left showed what it has become, an app they no longer run showed its address, and whose
  link brought them named that person. It carried other people's words: items added to their
  checklist, a suggestion's reason quoting a reply, notes someone else edited, an update another
  admin rewrote, an action someone keeps to themselves about them. And it left things out.
  Mutation-tested: 35 changes to its rules, each caught by a test but one that changes nothing
  observable today; another showed a check that could never matter, now gone. Tests: 209 core,
  49 brand, 452 server, 132 app, 53 E2E.
- 2026-09-28 — Session 2 (cont.): a date of birth and a country for everyone, and a country
  (and, if it likes, the year it began) for every organization, because the defaults that matter
  come from them: the work week, the currency a card's amount starts in, and who is under 18,
  now exact to the day where someone lives rather than to the year. Accounts made before keep an
  age from the last day of the year they gave and choose their country again; none is guessed
  for them (0035). Every picker was redone for where it runs (M5): the phone's own date and time
  wheels and dialogs, a calendar on the web, lists found as they're typed, quick picks for when,
  amounts in any language's writing, a grid of emoji for a status, and collections and
  organizations picked from the person's own. Recovery codes are only slow hashes now: the few
  kept as fast ones went (0036), and making new ones asks for the password. Two reviews found 61
  things (23, then 38), each now fixed and tested. Among them: Android's time dialog crashed on
  Expo's theme as the date one had; on iOS one sheet swapped for another in the same render and
  the second never opened; a due day without a time was overdue at nine that morning; an amount
  typed with the keypad's other separator was read a thousand times too big or too small; the
  lists found nothing once a second word was typed; Make new codes never sent the password it
  needs; an amount in Kuwaiti dinars lost its third decimal; a report opened two sheets on a
  desktop; and a collection or an organization typed in another case became a second one.
  Mutation-tested: 48 changes to the new rules, each caught by a test but one that changed
  nothing (a check another already made, now gone); two that first survived had no test, and a
  third showed the names of languages a phone can't name were a variety's ("Austrian German"),
  now the language's. The sheets that open on a tap (a new conversation, how you know someone,
  asking to connect) load the first time they're opened, so the app still starts in 448.4 KB of
  JavaScript. Tests: 219 core, 49 brand, 466 server, 155 app, 53 E2E.
