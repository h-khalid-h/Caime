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
- [x] GitHub repository [`h-khalid-h/Caime`](https://github.com/h-khalid-h/Caime) (formerly Caishy), `main`
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
- [x] Profiles (one face per person, R99), people search with privacy and age rules
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
      (`apps/app/public/sw.js`) shows what the server pushes when Caime isn't open in front (a
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
      find them; a Caime link in a message opens in the app; a desktop browser without a
      share sheet copies the link. Someone signed out keeps the link through sign-in, sign-up
      and onboarding ("You came here for @noor") and lands on it (`handles.test.ts`,
      `paths.test.ts`, E2E)
- [x] Person profile, relationship change and its history, one line per change (E2E). Who they
      are to you (PRD §67, §71): your conversation (how often you talk, in words, and when you
      last did), what it's about (its contexts), what's shared, actions open and waiting,
      questions each way, and what they see of you. What Caime thinks they may be to you
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
- [x] Rules (PRD §68–70): how Caime treats a kind of relationship, a role in it, or one
      person, all of it changed from Settings → Notifications and priorities: notifications
      (always, in set days and hours, only if important, never), urgent messages, priority (in
      hours only, too), a reminder when they haven't answered, the tone Caime suggests, and how
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
      together by the next build: Caime opens and moves between screens with no network (or
      while a deploy restarts the server), a page is always the network's while there is one,
      and nothing the API answers is kept (`sw.test.ts`, `web.test.ts`, E2E). Opened offline,
      it says Offline, not Connecting
- [x] Stickers (Caishy Friends, 16): sent, and arrive live (E2E)
- [~] Native: iOS and Android bundles export (Hermes); not yet run on a device or simulator.
      Share links open the app only once it claims its domain (iOS associated domains, Android
      app links, and the two files the server would serve under `/.well-known/`)

## M6 — Expansion

- [~] Files, images (metadata stripped, thumbnails), resumable uploads, ranges done; voice notes
      recorded in the composer (expo-audio on every platform), uploaded with their length, played
      from the bubble, and read into words (PRD §46, docs/SPEECH.md): the `speech.transcribe`
      job sends a non-private note of a sender with AI assist on (an adult, one assist of their
      day, ten minutes at most) to the provider behind `lib/speech.ts` and keeps the words as the
      message's body, searched and erased as words are, shown under the note as "Transcript ·
      Suggested by Caime" (`speech.test.ts` against a stand-in, `e2e/voice.spec.ts` against the
      fake microphone). ⛔ The key on production waits for the owner's bake-off
      (`scripts/speech-bakeoff.mjs`) on real Egyptian and Gulf clips: OpenAI first, ElevenLabs
      the challenger
- [x] Organizations: a business, shop, clinic, school, nonprofit or public service with a
      profile anyone can find and a team. Its handle shares one namespace with people's, so
      nobody can pose as it. It verifies its domain with one DNS TXT record
      (`_caime-verify.<domain>`); only then is it "Verified · <domain>" and its team "Verified at
      <name>", and no other organization can claim that domain. Changing the domain unverifies it
      until the new one is proven. The team is made of adult connections; owners and admins
      manage it and the domain; an owner who leaves or deletes their account hands it on; the
      last one out closes it (`orgs.test.ts`, E2E)
- [x] An organization's end (R42): its owner closes it, or its last person leaving does; its
      page goes, seats, apps, agent, billing and followers end, and its customers keep their
      conversations to read. Closed unverified, its handle is held a year; closed verified, it
      waits for the organization, which takes it back by proving its domain again (the new-
      organization screen says whose it was and offers the record), continuing under the same
      handle and page with a new owner and team, customers' blocks kept and their old
      conversation left as it was. The operator deletes a closed one for good
      (`orgs.test.ts`, E2E)
- [x] An organization's logo: an image its owner or an admin uploaded, on a rounded square
      wherever the organization is (its page, the Chats row, the conversation, its updates,
      requests), set from Edit details; the year it began picked from a list, never typed
      (`orgs.test.ts`, E2E)
- [x] An organization's spaces (R43): its owner or admins start one from its page, its team
      can be in it without a connection, the space says whose it is and the page lists them
      (the ones you're in; running it, all of them, with Join); leaving the team leaves them,
      and the organization closing leaves them to their people (`spaces.test.ts`, E2E)
- [x] A person's organizations on their profile (R43): the teams they're on, by logo, opening
      the organization's page, shown as their professional details are (`orgs.test.ts`, E2E).
      Next of R43: the organization's actions, held with the thread
- [x] Organizations' updates (PRD §59, §15 broadcast): an organization's owner and admins (or its
      app, with `updates`) post to whoever follows it; anyone reads them on its page, as the
      organization's. People follow from the page (and choose whether each update notifies
      them); Updates is one row at the top of Chats and a screen of its own, never among their
      conversations or what needs them, each organization with whether Caime verified it.
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
      its sharer while Caime is open, keeps only the latest point, and ends at its time or when
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
      and with where; done, cancelled or left, they go. Caime stays the record: nothing in a
      calendar changes anything in it (`calendar.test.ts`, `ics.test.ts`, E2E).
      [x] Caime's own calendar (R51): `GET /v1/calendar` and the Calendar in the Actions tab
      (meetings, appointments and due actions by day, each with whom and what they are to you),
      and `GET /v1/orgs/:id/calendar` with Bookings in the Business inbox for the team
      (`calendar.test.ts`, E2E). [x] Bookings (R51): an organization's bookable hours
      (`PUT /v1/orgs/:id/booking`, set on its page by its owner or admins, shown to everyone),
      the open slots in them less what's booked (`GET /v1/orgs/:id/slots`, core `openSlots`), a
      customer or the team booking one from a picker on the appointment card, and the AI agent
      offering the next open slots and booking the one the customer picks as a requested card the
      customer confirms, never a time it wasn't given (`booking.test.ts`, `agents.test.ts`, E2E).
      [x] In a meeting, work waits (R51): the `holdWhileBusy` preference holds work, customer,
      vendor and professional notifications until an agreed meeting or appointment ends
      (core `policy.test.ts`, `messaging.test.ts`, E2E). [x] Busy or free, by relationship
      (R51): privacy fields `busy` (connections) and `busyDetails` (family, and the
      conversation it was made in), a "now" line on the profile (`PersonProfileView.busy`;
      core `privacy-safety.test.ts`, `connections.test.ts`). ⛔ Provider sync (Google,
      Microsoft): their OAuth credentials.
      [ ] Storage, CRM and helpdesk connectors: apps and
      webhooks cover the Business inbox (`docs/API.md`); two-way calendar sync is an add-on
      behind each provider's OAuth app (⛔ credentials)
- [x] AI assist with Claude, off until each adult turns it on (Privacy settings), never on
      private conversations: rewrite a draft (clearer, shorter, more formal, friendlier, in the
      relationship's tone), translate a message, catch me up (offered when ten or more are
      unread), find follow-ups (filed as ordinary suggestions, never twice). Everything it writes
      is labelled "Suggested by Caime" and used only on a tap; the heuristics stay the default
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
      Checkout and portal pages). The live account has its products and prices
      (Pro €6 a month or €60 a year, Business €29 or €290; lookup keys `caishy_*`), portal and
      webhook endpoint; a refusal by Stripe is answered in its words (2026-09-29)
- [x] Metrics: `/metrics` for the operator's scraper (PRD §81), product metrics from what Caime
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
      and a muted mark (`engine.test.ts`, E2E with Chromium's fake screen).
      Group calls in groups of up to eight: every device in one connects to every other (whoever
      joined later makes the offer, so two never offer each other), everyone who can take part is
      rung, a call that's on shows a banner to join it, and it goes on while two are in it, then
      leaves its line ("Group video call · 12 min"). Blocks and R29 keep people apart in a call,
      and leaving the group leaves its call (`group-calls.test.ts`, `group.test.ts`, E2E with
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
      phone).
      [x] A recovery key for private conversations (R41): made in Settings on a device that
      reads them, shown once; a recovery device it stands for joins the person's chain and every
      private message is sealed for it from then on; typed on a new device, that device reads
      what was sealed since and is approved by it, with the code unchanged; a phone keeps its
      keys across sign-out and takes its device up again (`e2ee-recovery.test.ts`,
      `private.test.ts` server and app, E2E: made on the desktop, typed in a fresh browser, what
      was sent since opens and Alex isn't told her code changed).
      [~] Private conversations in the phone apps: the phones encrypt in JavaScript
      (`@caime/core/e2ee-noble`, audited @noble libraries), byte for byte what the browser's Web
      Crypto makes and reads, so a message sealed on either opens on the other, and
      introductions and security codes match (`e2ee-noble.test.ts`, every pairing, mutation-
      checked; and on a standalone Hermes 0.12, a browser's message opened, a reply sealed back
      that Web Crypto opened, and the introduction and code accepted). Keys in the Keychain or
      Keystore (`keystore.ts`, this phone only); opening and sealing take turns so the screen
      stays responsive (on Hermes 0.12 on the build machine: sealing about 45 ms a device,
      opening about 50 ms a message). iOS and Android bundles export. Not yet tried on a phone
      itself: that is what's left before it's ticked
      [~] Calls in the phone apps, 1:1 and in groups: the web's engines, shared as they are
      (`engine.ts`, `group.ts`), over react-native-webrtc's WebRTC (`rtc.native.ts`), with its
      view for the cameras (`Media.native.tsx`), the phone's audio set up for a call (speaker for
      video, the ear for voice, a Speaker button; `callAudio.native.ts`), a vibration while it
      rings, and the screens clear of the notch. The permission prompts say calls, and a call
      goes on with the app in the background (iOS audio mode). iOS and Android bundles export,
      the plugins apply (camera, microphone, audio and Bluetooth permissions), and the web's
      calls are unchanged (the whole conversation E2E, 48 tests, locally). It's native code, so
      it's in a development or store build only: in Expo Go calls aren't offered and nothing of
      them loads. Not yet tried on a phone; a call rings only while the app is open (ringing a
      closed app needs VoIP push with CallKit and ConnectionService), and a phone can't share
      its screen yet. ⛔ Call summaries need a speech-to-text provider
      [x] A TURN relay for calls on strict networks: Cloudflare's, live since 2026-09-28
      (`CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` on the `caime` service; the live
      privacy page names it). Each person gets credentials of their own that expire; STUN only
      if Cloudflare doesn't answer (`calls.test.ts`). Verified by the owner with a call between
      two networks on production. Caime's own coturn (`TURN_URLS`, `TURN_SECRET`) still works
      instead. Without any relay, a call that can't connect says a network may be blocking it
      (`engine.test.ts`)

## M7 — Ship

- [x] One image (API, realtime, web), built from the `Dockerfile` and smoke-tested by CI on every
      push to `main` (readiness, the page, security headers); EasyPanel builds the same one from
      source, and none is published
- [x] CI: lint, typecheck, tests on Postgres 16, build, web budget (448.4 KB gzip against 450 KB),
      Playwright E2E against the production bundle
- [x] Security review: `docs/SECURITY.md` lists each control with the test proving it, and the
      gaps. [ ] Third-party penetration test
- [x] Caime's own privacy policy, terms and help at `/privacy`, `/terms` and `/help`, for
      anyone and linked from About and sign-up, each claim checked against the code; what's
      recorded of use kept only for set times (`lib/retention.ts`). [ ] A lawyer's review of the
      texts, and the operator's name and contact confirmed (`LEGAL_NAME`, `CONTACT_EMAIL`)
- [~] EAS config written (`apps/app/eas.json`: development, preview, production; `expo-dev-client`;
      `docs/DEPLOY.md`, "Development and store builds"); the builds ⛔ Apple and Google developer
      accounts, `EXPO_TOKEN` and the project
- [x] Deployed to EasyPanel: https://caime.datac.com, also at
      https://caishy-caishy.0hqwb7.easypanel.host (project `caishy`, services `caime` and `db`,
      built from `h-khalid-h/Caime`; `docs/DEPLOY.md`, "Live deployment"). Checked from outside:
      readiness, the page and its headers, and a sign-up whose realtime socket connected
      through EasyPanel's proxy before the account deleted itself. Only what passed CI is
      deployed: a green run fast-forwards the `production` branch, which EasyPanel builds from;
      AI assist is on there (`ANTHROPIC_API_KEY`)

## M8 — Caime (R34–R40)

The product's name is Caime, for the domain cai.me; the brand and its characters stay. What of a
super-app brainstorm the product takes, and what it leaves with the reason, is R34–R40.

- [x] The name everywhere (R34): the apps and their store identity (`me.cai.app`), the server
      and its headers, cookie, metrics and webhook signatures, the pages, the wordmark ("Caıme",
      the heart its dot) and the docs. What keeps its name: the characters, Caishy included,
      and the Caishy Friends; Stripe's price keys and metadata; the repository, image, database
      and EasyPanel names; deployed migrations; and this log
- [~] `cai.me` is Caime's (the owner, 2026-10-13) and serves it: `https://cai.me/v1/readyz`
      answered `{"ok":true}` on 2026-10-13, `PUBLIC_URL=https://cai.me`, and the service answers
      to `cai.me`, `www.cai.me` and `caime.datac.com` (checked through EasyPanel's API); a page
      on any name but `cai.me` goes there for good (`lib/canonical-host.ts`), the API answering
      on all of them. `HOSTING_PROVIDER`, `go.cai.me`'s own record and Stripe's webhook on `cai.me` done by the
      owner on 2026-10-14. Left, the owner's, in DEPLOY.md's "Going live on cai.me": the
      wildcard record gone, SSL Full (strict), Postmark for sending, the staff addresses and
      DMARC. The phone builds, Expo Go's image and the SDK
      default to `cai.me`
- [x] Counsel's pass (2026-10-14, LEGAL-REVIEW "Counsel's decisions"): the privacy page names
      the network in front (`EDGE_PROVIDER`), the mail sender by company, each transfer's
      safeguard and how to get a copy, and the register entry (`LEGAL_REGISTRATION`); the
      minimum age by country (18 in Egypt and Saudi Arabia) in sign-up and a change of country;
      Checkout carries the consumer's request to start at once; every DPA mark decided.
- [x] The service's legal facts set and live (2026-10-14, checked on `cai.me`): the privacy page
      names DATA C OÜ with its register code and address, Cloudflare in front, Postmark sending;
      the terms are under Estonian law. Every provider probe is up (`caime_provider_up`: DNS,
      Stripe, Cloudflare, Anthropic, SMTP).
- [ ] ⛔ Owner, before launch: hosting moved to a Google Cloud region in the EU (counsel's
      decision: removes the Chapter V transfer to Qatar); Postmark's DPF coverage confirmed;
      `_dmarc.cai.me` one record (two are published, so receivers apply neither) and Postmark's
      DKIM verified; `cai.me`'s MX points at Postmark inbound while Caime Mail is off, so
      `hello@` (the privacy contact) reaches nobody: back to Cloudflare Email Routing, or Caime
      Mail turned on; Egyptian and Saudi counsel before Caime is offered there (Egypt's licence,
      transfer permits and DPO by 1 November 2026).
- [x] An organization's closing as the DPA's section 12 says: closing records its last owner and
      keeps the seats' roles as they stood; its export (now everything it holds: page, settings,
      catalog, agent and its knowledge text, apps without secrets, updates, conversations) stays
      open to that owner alone for `KEPT_DAYS.closedOrgExport` (30) days, from Settings ·
      Security (`GET /me/closed-orgs`); then the daily `closed-orgs` sweep (`clearClosedOrg`)
      deletes what was its alone (team, page, settings, catalog, agent, apps with tokens, webhooks
      and deliveries, updates and their notifications, checkout, the team's notes on threads,
      files nothing else uses) and keeps the customers' copies whole (`org-closing.test.ts`, the
      E2E's closing step downloads it).
- [ ] The privacy page and the terms in Arabic, French and Turkish (English prevailing), by a
      translator who reads law, before launch in those languages' countries.
- [ ] `cai.me/@handle` for people and organizations (R35), opening the app where it's installed.
      Built (2026-10-14): the server writes `apple-app-site-association` and `assetlinks.json`
      from `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` (core `APP_LINK_PREFIXES`: a person's page,
      an organization's, a conversation, an invite, a space, a profile; the passkeys' claim too),
      a 404 without them, and nothing under `/.well-known/` is ever the app's page any more (it
      was); a build talking to an https Caime claims that domain (`app.config.ts`: associated
      domains, verified intent filters), held to the server's list (`app-links.test.ts`,
      `appLinks.test.ts`, `expo config`). ⛔ The team id and signing fingerprints come with the
      first development or store build; then a link opened on a phone is the test
- [x] Reserved handles (R35): nobody takes one that reads as Caime (its names, inside other
      handles too), one of its characters, the people who run it, or its pages and screens.
      Refused at sign-up, on a handle change and for a new organization as a taken handle is;
      given out only by the operator (`/v1/admin/{people,orgs}/:handle/handle`), audited, one
      claim of a handle at a time
- [x] Handles let go of are held (R35): one someone changes from, a deleted account's, or one
      the operator moves someone from is held from everyone for a year, whoever had it included,
      keeping only the handle and the days (`released_handles`, forgotten once it's over); an
      organization keeps its handle for good; the operator can give a held one back
- [x] Passkeys on the web (R36): added in Settings · Security after the password, named by the
      browser that made them, listed with when each was last used and removed after asking; the
      sign-in screen signs in with one, nothing typed (a discoverable credential), the same
      session, cookie and audit a password's sign-in makes (its server-painted twin shows the
      button, waiting for the app as its form does).
      Bound to `PUBLIC_URL`'s name (`cai.me`), checked by `@simplewebauthn/server` (pinned), the
      challenge single-use for five minutes in the database; never for another origin, another
      account's handle, a spent or stale challenge, a suspended, deleted or bot account; a
      recovery or the operator's "end all access" removes them; in the export without the key
      (`passkeys.test.ts` with a software authenticator, `e2e/passkeys.spec.ts` with Chromium's
      virtual one)
- [ ] Passkeys on phones (R36): the store builds carry Caime's associated domain
      (`apple-app-site-association`, `assetlinks.json`) and a native passkey module; ⛔ store
      builds. Then the password optional once a passkey exists (recovery codes kept), and the
      browser's autofill offering the passkey in the sign-in field (conditional mediation)
- [x] Several steps, one approval (R37): more than one suggestion in a conversation is offered
      as one card listing each step, done in order on one tap (`POST /suggestions/accept`, each
      step on its own, one that fails not stopping the rest), each task, reminder or waiting item
      taken back from the toast (`POST /suggestions/:id/undo`, only while it's still exactly as
      made; a decision stays, as one recorded by hand does), or taken one at a time
      (`suggestions-many.test.ts`, E2E)
- [x] A Split card (R38) that records who owes whom for what one person paid and moves nothing:
      an equal share each for everyone else in the conversation (people, not bots), worked out
      once on the server (rounding stays with the payer), each share marked settled or taken back
      by the person who owes it or by whoever paid, the payer told when someone settles up, the
      split settled when every share is; family, friends, work and community, never with a minor
      or an organization (`splits.test.ts`, `kits.test.ts`, E2E)
- [ ] Pay on an organization's card (R38), through its own checkout (Stripe Connect or its link),
      the card saying it's paid from the provider's webhook. ⛔ The owner's decision on Stripe
      Connect for the live account, and on a fee
- [x] `@caime/sdk` (R39): a typed client for every route an app's token reaches (inbox,
      conversations, replies and cards, threads, updates, its own kinds of card) and the webhook
      checks (`verifyWebhookSignature`, `parseWebhook` to typed events), `CaimeError` carrying
      the server's code; unit tests, and `sdk.test.ts` running every method against the real
      server and a real delivery (`packages/sdk`, `docs/API.md`). ⛔ Not published to npm: needs
      the owner's npm account; built from the repository until then
- [x] Broadcasts (§59, R40): fan-out measured at 500,000 followers (`updates-scale.test.ts`,
      `FANOUT_FOLLOWERS`; 2,000 in CI): 954.6 s as it was, a follower at a time; now one insert
      (the unique index dropping any told twice), one realtime event and one device lookup for
      each batch of 1,000, 108.2 s for all 500,000 on this container

## M9 — Reach, and what the review found (docs/REVIEW-2026-09.md)

The product reviewed whole on 2026-09-30: the wedge works end to end on the web; what stops it
outperforming the alternatives is reach and operations. In the order the review gives:

- [x] Backups (P0): a daily `pg_dump` by a worker instance, each checked with `pg_restore
      --list`, kept 30 days on the data volume, the last remembered in the database and on
      `/metrics` (`caime_backup_last_success_timestamp_seconds`, `caime_backup_bytes`), the
      operator's `GET`/`POST /v1/admin/backups`, the image carrying `postgresql-client-16`, and
      the restore drill in `docs/DEPLOY.md` (`backup.test.ts`), and a copy of each checked dump
      off the host to any S3-compatible bucket (`lib/s3.ts`, `copyOffHost`, tried again hourly
      when the store was away, `caime_backup_last_copy_timestamp_seconds`; `backup-copy.test.ts`)
      ⛔ the bucket and its keys (`BACKUP_S3_*`) are the owner's to set; the drill itself is to
      be run once on production
- [x] The public site (R50): `/business`, `/pricing`, `/security`, `/developers` and `/about`
      beside the landing page, in the app's shell without its scripts, for everyone; a shared
      masthead and nav, spec sheets with every number read from the code, an explorer on the
      organizations and security pages, prices from Stripe when billing is connected
      (`lib/site-pages.ts`, `public-pages.test.ts`, `core-flow.spec.ts`)
- [x] A readable web (R44, P1): the landing page in the shell for a visitor who isn't signed in,
      public pages at `/@handle` and `/o/handle` (Open Graph, Twitter cards, canonical, JSON-LD
      `Person`/`Organization`, a plain body the app replaces), only what's shown to everyone and
      only while findable by handle, never under 18; a real 404 for a handle nobody has; the
      app's screens marked noindex; `robots.txt` and `sitemap.xml` (organizations, never
      people); `Permissions-Policy`; a logo and a photo shown to everyone served without sign-in
      for the cards (`public-pages.test.ts`, E2E)
- [~] Operations (P1): `caime_jobs_queued` and `caime_jobs_oldest_seconds` on `/metrics`,
      `pnpm audit --prod --audit-level=high` in CI, the alert rules written down in
      `docs/DEPLOY.md` (readiness, 5xx, queue age, backup age). ⛔ The uptime check and the
      alert receiver are the operator's to point at it (Grafana Cloud, Better Stack, or
      Prometheus's Alertmanager)
- [~] The phone (P1): EAS configuration written (`eas.json`, the development client, the steps in
      `docs/DEPLOY.md`); the development build on the owner's iPhone (calls, private
      conversations, push), then TestFlight and Play internal testing ⛔ Apple and Google
      developer accounts, `EXPO_TOKEN`: `pnpm build:dev` in `apps/app` once they exist
- [x] Pro that sells the wedge (P1, R47): relationship insights for a person (their own
      one-to-ones, for them only: connections by sphere, active against the time before, closest,
      gone quiet, reply times both ways, who writes first, when they write), automations counted
      by plan (5, then 50), the plan screen saying so, insights locked with the reason on Personal
      (`insights.test.ts`, E2E). Not sold: several faces (decided against, R99), history (the
      wedge), search (free, R23).
- [x] Network bootstrap (P1): a WhatsApp export brought over as a topic of the one-to-one (R45:
      read on the device, who's who chosen, dated as written, every message marked imported,
      both have read it, nothing notified or inferred; `whatsapp.test.ts`, `import.test.ts`,
      E2E). The contextual invite (R1): a link from Connect that says who invites and, if they
      choose, "Work · DATA C"; a visitor reads it without the app, signs up, and lands in the
      conversation connected, the inviter's label applied on their side and the context offered
      on the other (`invites.test.ts`); E2E measures link-open to first message sent at
      4.8 s on a phone viewport (target ≤ 60 s; the sign-up form filled by the test, so the typing is not counted)
- [~] Polish that shows (P2): empty states that end in an action (Requests, Notifications,
      Updates, Actions), confirmations on one-tap destructive actions (a connected app removed,
      a token revoked, an organization blocked from a request, an update taken back), skeletons
      and retry on Requests and Notifications and the skeleton in Saved, no pronoun fallback in
      call history, colours through the theme (the auth backdrop, read ticks, the call surface
      and its end/go buttons), start/end for RTL in place of every one-sided left/right. A new
      connection with nothing said yet offers three first lines fitted to the relationship, a tap
      from the box (PRD §87, `FirstWords`, E2E). Still to do: a screen reader pass on a device
- [ ] Recording calls and meetings into transcripts, summaries and actions (R52): consent from
      every participant each time with a visible indicator, never in a private conversation,
      everyone on the call gets the recording, encrypted at rest with a retention the owner sets,
      summaries only when asked, a Pro and Business feature with monthly minute allowances. ⛔ A
      speech-to-text provider tested on Egyptian and Gulf Arabic clinic calls, with a data
      processing agreement and no training on customer audio; the consent flow is built first,
      against the provider that passed. How it's built is R82 (one browser in the call records
      every voice as its own track, uploading utterances as they end) and ADR-17 (Cai's voice
      in a call, through a media unit beside the container), in order:
      [ ] The consent flow (R52, R82 (4), decided in R85: a labelled choice, anyone's no at any
      time, nothing with anyone under 18)
      [ ] 1:1 calls with a browser in them: the recorder, utterances cut at pauses and uploaded,
      transcribed in order by speaker on the call's line; summary and actions only when asked
      [ ] Group calls: late joiners, the recorder handed on when it leaves
      [ ] Cai asked in the call by name, answering in writing (R82 (7))
      [ ] Phone-only calls ⛔ a native recorder, and calls tried on a device first
      [ ] In person on a phone, with the provider's speaker turns
      [ ] Cai's voice and calls above eight (ADR-17) ⛔ streaming Arabic speech to text passing
      its own bake-off
- [~] Meetings (R83), beside Chats and Calls: the Meetings list (`/meetings`); Join on every agreed meeting and booking (card, Calendar,
      brief, feed URL), "starting now" at its time; outsiders added by address get an iCalendar
      invitation with their own link, Accept and Decline coming back by mail; the link proves the
      address (a code on a second device, a code and the lobby without a link); a guest session
      scoped to the meeting; consent and the age question on the join page; "Keep it" to claim.
      Caime Mail is on in production by 2026-10-18 (R83 (4) decided in R85)
      [x] Join and Open on the meeting card: where it's held from the kit's own Where (core
      `meetingVenue`: empty or "Caime" here, a web address on another service, anything else
      in person); Join from ten minutes before to half an hour after its planned end (`joinOpen`,
      an hour when its length isn't known, as the calendar takes it; never for a day without a
      time), opening the conversation's own call by the header's rules (`meetingCall`: not with
      Cai, a friend, a request or someone reached by mail; a group of up to eight); Open for a
      link (`meetingAction`). Strings already in every catalog. Tests: `meetings.test.ts` (11),
      `meetingCall.test.ts` (4); core 635 and app 194 pass, lint and typecheck clean, the web's
      initial JavaScript 448.1 KB before and after. Not run: the server suites and E2E (no
      Postgres in this session), and no E2E step for Join yet
      [x] Meetings (`/meetings`, beside Calls on People, and a row in the Calendar): the
      calendar's list with only the meetings, the last month's as well as two months ahead,
      each with Join or Open (core `calendarAction`, the same window as the card's, its end the
      server's); `meetings` reserved as a handle (R35, `paths.test.ts`). Join from the calendar
      and from a calendar app: a meeting held on Caime is "Caime" in the feed, and its URL is
      the card's join address (core `joinPath`: `/c/<id>?seq=<n>&join=<card>`); the
      conversation opens at the card and calls only when the card itself says it can be
      joined now (`joinFromLink`: there, not deleted, an accepted meeting held here, inside its
      window, in a conversation that can call), so an address alone starts nothing. Calendar
      items carry the card's `seq`. Its three new strings are in every catalog (written in this
      session, for a native reviewer). Tests: core `meetings.test.ts` (14), the app's
      `meetingCall.test.ts` (6), the server's calendar test (the feed's join address, Caime as
      the place, `seq` on the item; a link and a place unchanged); core 638, app 196 and server
      749 pass (the six backup tests need `pg_dump`, which this session lacks, and fail the same
      on `main`), lint and typecheck clean; the web's initial JavaScript 448.7 KB (448.1 before: the People
      bar's button and the card's rule). E2E `meetings.spec.ts`: Meetings lists it with its
      Join, Join on the card rings the other side, and their Join from the meeting's address
      answers that ring (it caught the page asking before it had heard the ring, and placing a
      second call: `joinDirect` now asks what's live first). Before deploying: whether anyone
      already holds the handle `meetings`
      [x] "Starting now" (`lib/meeting-start.ts`): accepting a meeting held on Caime queues one
      job for its start (per card and start, as the brief's), which tells everyone still in the
      conversation, "Starting now: <title>", at attention, its data carrying the join address,
      so the tap opens the call through the same check as the calendar's (the notifications
      screen, and web push: `sw.js` follows `path` only when it's a conversation's address with
      a query, never another site's or another screen's). Nothing for a meeting elsewhere, in
      person, cancelled, moved, all day, in a private conversation, to someone who left, or from
      a job run more than half an hour after the start. Its two strings in the server's
      catalogs; server 752 pass in one clean run (the six backup tests need `pg_dump`, absent
      here). Tests: `meeting-start.test.ts` (3), `sw.test.ts` (four more cases), the brief
      test's job count (the first meeting's start now runs too). Both people pressing Join at
      once: the one whose call rings here answers it rather than placing a second
      (`joinDirect`, `joinDirect.test.ts`). Not built: Join inside the
      brief, which opens from the card that has it already; a ring for the meeting rather than
      a notification (the call rings when the first person joins, as any call does)
      [x] Guests, the guard (R84 (2)): a provisional session is refused on every API route but
      `GUEST_ROUTES` (today: read and end the session), in the auth plugin before any route
      runs (403 `guest_route`, a new code; OAuth's form endpoints answer in RFC 6749's shape
      with the same words), and the realtime socket closes for it. The app's pages load for
      anyone. `guest-routes.test.ts` walks every registered route (the plugin now keeps the list)
      with a guest's session: none open but the two listed. SECURITY.md row. Its string in the
      server's catalogs. Server 755 pass in one clean run (the six backup tests need `pg_dump`)
      [x] Guests, the meeting's own space and the invitation (server; `lib/meeting-guests.ts`,
      `POST /v1/messages/:id/guests`, migration 0074): the first guest gives an accepted
      meeting held on Caime a group of its own (the conversation's people, a copy of the card,
      accepted), and the original card says it moved (`movedTo`) and leaves the calendar, Join
      and "starting now" to the copy; the guest is a provisional person (one already on Caime is
      asked, as a request, and nothing says which an address is); their own link is kept hashed
      and a new invitation ends the last one; a calendar invitation (`METHOD:REQUEST`, core
      `buildInvitation`) goes by the transactional mail. Never from a private or business
      conversation, by someone under 18, or past eight people. The export lists invitations
      (never a link) and the privacy page says what's kept. Tests: `meeting-guests.test.ts`
      (3), `ics.test.ts` (3 more), the route walk still refuses a guest everywhere. In review
      (2026-10-13): the space claimed under the card's row lock and its copy sent with the
      claim's own client id, so two invitations at once make one space; nobody under 18 ever
      in a conversation with a guest (R29: the invitation refused where anyone under 18 is,
      such an account never asked, the members route refusing one into a conversation that
      holds a guest); someone on Caime asked only as a message request could reach them; the
      link's token masked in the request log. `meeting-guests.test.ts` (6), `log.test.ts`
      [x] Guests, the way in (server): `GET`/`POST /v1/join/:token` read and take a guest's link
      (`lib/meeting-join.ts`; migration 0075 keeps when they came and whether they said 18 or
      over); taking it signs them in as their provisional self until a day after the meeting,
      never over someone signed in already, and tells an address that is a Caime account to
      sign in; `GUEST_ROUTES` now holds their name, reading the space and its card, and its call,
      and a group call takes the space's guests. Tests: `meeting-join.test.ts` (3), the route
      walk, the export
      [x] Guests, the app (2026-10-14): Invite by email on an accepted meeting card held here
      (`MeetingGuests`, the sheet lazy), and the card that moved says so and opens the space;
      the join page at `/j/<token>` (open to anyone: the meeting, when, who asked, the name, "I'm
      18 or over", Join, which signs the guest in); the guest's meeting at the same address (who's
      in it, Join the call while it's on, else Start, rung like anyone), any other address
      taking them back to it (`(guest)/meeting`), the app itself never mounted for a guest; the
      guest's socket opens on their cookie (`GET /v1/realtime` in `GUEST_ROUTES`, which it
      wasn't: a guest in a browser was never rung) and their typing is dropped; times in the
      device's zone; the call drawn at the root for anyone signed in. `e2e/meetings.spec.ts`
      (invited from the card, the mailed link opened in a fresh browser, joined, rung and in the
      call with the organizer, no request refused on the guest's page), `e2e/a11y.spec.ts` (the
      join page in English and Arabic), `meeting-join.test.ts` (the socket, rung, no typing).
      ⛔ SMTP in production to send the invitation. Not built: a code on a second device (R83 (3))
- [ ] Candidates from the 2026-09-30 brainstorm review (R46), the owner's call: organizations
      taking WhatsApp Business messages into the Business inbox through Meta's official Cloud
      API ⛔ a Meta business account, verification and fees; contact matching by hashed phone
      numbers with consent on both sides. Everything else in it (reading other apps'
      notifications, auto-replies in the person's name, an Android hub) is declined for good
- [x] Email (R48): the address confirmed with six digits, a forgotten password reset by a link,
      through `SMTP_URL` (`email.test.ts`, E2E with `e2e/smtp-stub.mjs`); production sends
      through Postmark's SMTP, set by the owner on 2026-10-14
- [x] Moderation (R49): the operator's `/admin/reports` over `GET`/`PATCH /v1/admin/reports`,
      the reported message removed for everyone or the update taken back through the same code
      as their owners', the person suspended and the suspension lifted (`moderation.test.ts`), the
      reporter told once it was looked at and whether Caime acted
- [x] Operators by name and a contribution process: `OPERATOR_TOKENS` (each person on the
      operator's side named in the audit log); `CONTRIBUTING.md`, the pull request template and
      `.claude/skills/steward/SKILL.md` (a pull request against `main`, CI, review by the
      reviewer against the conventions and `docs/RESOURCES.md`) ⛔ branch protection on `main`
      and the repository secret for an automatic first review are the owner's to set
- [x] Resource budgets (`docs/RESOURCES.md`): what the server, AI and devices may cost, with
      the numbers measured so far; the agent's knowledge sent as a cached prefix and
      `ANTHROPIC_MODEL_LIGHT` for the light features (`ai.test.ts`, `agents.test.ts`)
- [~] The second instance (P2): files in an S3-compatible bucket (`FILES_S3_*`, `s3Storage`:
      durable files and thumbnails streamed in and read back signed, uploads in progress on the
      instance's scratch; `files-s3.test.ts` against a signing stand-in) and `docs/DEPLOY.md`
      "Scaling" (what to pin, what to set). Rate limits stay per instance by design (each bounds
      its own share; a shared counter would cost a query a request), caches are a minute or
      fixed. ⛔ A bucket and its keys on production are the owner's to add; the pentest is a
      third party's
- Measurements: Lighthouse 12 on the production bundle served locally, mobile preset
      (2026-09-30): landing page and a public organization page both 100 accessibility, 100
      best practices, 100 SEO, 74 performance (FCP 0.6 s, LCP 0.8 s, TBT 750 ms, Speed Index
      7.4 s); 4.6 MB over the wire uncompressed, of which 1.5 MB were five TTF fonts. Fonts now
      go as Latin WOFF2 (362 KB for all sixteen cuts; the landing page fetched 82 KB of them),
      and the same run then read 100/100/100 with Speed Index 3.8 s and 3.4 s. With the app kept
      off a visitor's public page, the organization page is visually complete at 0.7 s (Speed
      Index) and is now served without scripts at all. The landing page still boots the app
      (performance 61, LCP 4.5 s under Lighthouse's throttling, uncompressed: production's Brotli
      takes the 2.8 MB of scripts to about 450 KB). Load test (autocannon, 50 connections, 15 s,
      one instance on a 4-core container with Postgres beside it, no errors): `/v1/healthz`
      7,920 req/s at p99 15 ms; a signed-in `GET /v1/inbox` 871 req/s at p50 54 ms and p99
      98 ms; a visitor's organization page 1,356 req/s at p99 61 ms. Still to take: a screen
      reader on a device

## M10 — The first customers (docs/REVIEW-2026-10.md)

Status 2026-10-04: every build item of the review's plan is done and verified (Arabic across
the app, the server's words, the public site and every public page; the organization's door;
the lawyer's side of an organization's data; the first screen painted by the server; the P2
polish), each on production. What remains is the owner's (⛔ below: the contact address and
SMTP, a bucket, an uptime check, the phone accounts and the first device build, the lawyer's
review of privacy, terms and the data processing agreement, Stripe's currencies and tax, a Meta
business account, a native speaker's review of the Arabic) and the measurements that need a
phone. Nothing in the plan is left for this side to build before a first customer is shown it.

The product reviewed whole again on 2026-10-01: M9's build work is done; what stands between
Caime and its first customers (organizations, R53) is language, the phone, a handful of the
owner's accounts and settings, and what a clinic's lawyer needs. In the order the review gives:

- [ ] ⛔ P0, the owner's, today: `CONTACT_EMAIL` and `VAPID_SUBJECT` on a domain the owner holds
      (the live pages say `hello@cai.me`, a domain still parked for sale), an SMTP account
      (`SMTP_URL`, `EMAIL_FROM`), a bucket (`BACKUP_S3_*`, `FILES_S3_*`), an uptime check and an
      alert receiver. The full list, with costs, is the owner's checklist in the review
- [x] Caime in Arabic (R54): the interface's 2,073 strings wrapped where they're written
      (core `i18n.ts`: `tr`, `trn`, `msg`; ADR-16), the Arabic catalog (`locales/ar.ts`, a
      lazy chunk of 61.0 KB gzip, never in the startup bundle), a language setting in Language
      and region (the device's by default, mirrored to the account so every device follows),
      `lang` and `dir` on the web and `I18nManager` on phones, and `i18n-catalog.test.ts`
      failing CI for a string without its Arabic (`e2e/arabic.spec.ts`: chosen, right to left,
      kept across a reload and followed on a second device). The server writes for whoever
      reads (`apps/server/src/lib/i18n.ts`): a request is answered in the language its app
      shows (`X-Caime-Language`, so inbox reasons, relationship labels and kit labels come back
      in it), and a notification in its reader's own (`notify` and `replaceShown` resolve their
      words inside `asReader`; `preferences.language`, else `interfaceLanguage`, what the app
      last showed, else the account's locale; one cached lookup per reader per five minutes,
      dropped on a change), every relationship role and kit name and state now in the catalog
      (`i18n.test.ts` on the server, a notification in Arabic in `e2e/arabic.spec.ts`). ⛔ A
      native speaker's review of the Arabic. The long tail of templated strings the extraction
      left in English (call summaries and screens, automation intervals, meeting lengths, the
      organization screen's counts, invite uses, the WhatsApp import's dates, OAuth app kinds)
      now reads through `tr` and `trn`, with CLDR plural forms in the catalog (2,394 entries,
      65.4 KB gzip, 2026-10-04). The public site reads in Arabic too (`/business?lang=ar`, or an
      Arabic browser's `Accept-Language`; the landing page and the five pages, right to left,
      hreflang alternates with the English as canonical, the masthead offering the other
      language in its own name, and a reader who switched kept switched on the site's links):
      its 248 strings are the server's own catalog (`apps/server/src/locales/ar-site.ts`,
      `site-i18n.test.ts`), so the app's chunk didn't grow; `e2e/site.spec.ts`. Every other
      page the server paints (a person's, an organization's door, an invitation, the 404)
      follows the browser's language too, and what the server stores for one person (a
      suggestion's words) is written in that person's language. Verified on production
      (2026-10-04): `/business?lang=ar`, `/sign-in` and `/o/macrocare` for an Arabic browser.
      Still English: mail (7-bit, R48); the privacy, terms and help pages (⛔ the lawyer's text
      first); the pronoun suggestions (English pronouns)
- [x] The organization's own door (R53): its public page's "Message … on Caime" is the door
      (`/o/<handle>?write`, `doorPath` in `lib/public-pages.ts`), so a visitor signs up and
      lands in the conversation as an invite's guest does (onboarding's last step names it,
      "Write to Nile Dental"; the organization screen walks a signed-in customer in once, `?write`
      from the route); the team's page shows the door (`GET /orgs/:id/door`: the link and its QR
      code as one SVG path, `lib/door.ts` on `toqr`, MIT, server-side, so the app draws it with
      react-native-svg and a browser saves it as an SVG file); "Verified" is explained to the
      customer in one line under the button, and the manager's cards run in a clinic's order
      (door, domain, hours and bookings, the agent, then the team, apps, insights, plan).
      `door.test.ts`, `paths.test.ts`, `public-pages.test.ts`; `e2e/door.spec.ts` measures
      door-open to first customer message: 4.0 s on a phone viewport in this container (2026-10-04), against the invite's 4.8 s. Not done: a short link
      of its own (the handle link is the short link), the receipt and bio copy for the clinic
- [x] What a clinic's lawyer needs (R54): an organization exports its own conversations
      (`GET /orgs/:id/export`, owner or admins, three an hour, each in the audit log: the team
      by name, each customer named once, every message with who it was from, its words, card and
      files' names; nothing of its people's own), erases a customer's at that customer's request
      (`DELETE /orgs/:id/conversations/:id` from the thread's More menu: every message goes by the
      very statement the disappearing sweep runs, `eraseMessagesWhere` in `lib/org-data.ts`, the
      customer reads a line from the organization saying so, the team who did it, the thread
      says "Erased at the customer's request", and the audit log keeps it), and its owner sets
      how long conversations are kept (`organizations.retention_days`, 0046: applied to every
      message in them as `expires_at`, the shorter of it and the conversation's own, from then
      on and for what's there; the customer reads "keeps this conversation for 90 days" where
      they write). Who processes data is one list, `packages/core/src/processors.ts`, read by
      the privacy page as the server is configured (`processorsFor`: the host from
      `HOSTING_PROVIDER`, Cloudflare and the mail provider only when set), with a paragraph on
      organizations as controllers and Caime as their processor. `org-data.test.ts`. ⛔ The data
      processing agreement's text and a lawyer's review of privacy, terms and agreement. A
      draft for the lawyer exists (`docs/DPA-DRAFT.md`, 2026-10-04: the Article 28 structure
      filled with what the product does, every fact read from the code and held to it by
      `dpa-draft.test.ts`, the legal wording marked for them); it is not published, and the
      page for it reads the same list once the reviewed text exists. Not done: an export too large for
      one request (above 200,000 messages it asks to be made by Caime)
- [ ] ⛔ The owner's decisions: the phone (accounts, then the development build on the owner's
      iPhone, TestFlight, Play internal testing); prices in EGP, AED and SAR, local payment
      methods and Stripe Tax; WhatsApp Business through Meta's Cloud API; a smaller organization
      tier (a line in `plans.ts`)
- [x] The app's first screen under 2 s on the mobile preset: the entry chunk measured
      (`expo export --source-maps`: entry 278 KB gzip is the router, React and the web renderer,
      common 162 KB the app, core, react-query, the icons; nothing of a later screen to move), so
      the server paints welcome, sign-in and sign-up itself before the app runs (R44,
      `entryBody`: the screen's words through `tr` in the browser's language, its shape in CSS,
      links that work, a form that waits) and the app's scripts are asked for after that paint
      (`bootstrapScripts`, one inline script allowed by hash on those pages alone). Lighthouse,
      mobile preset, 2026-10-04: LCP 1.1–1.4 s (from 4.6 s), FCP 0.8 s, TBT 690–800 ms,
      interactive 4.4–4.6 s (from 4.2 s), CLS 0.01–0.04 (docs/RESOURCES.md). Not done: the
      app's own weight, where interactivity still waits; a screen-reader pass on a phone
- [x] Polish that shows (P2): quiet hours are added from Notifications and priorities ("Add
      quiet hours" beside "Add a rule"; the shared `RuleFor` picker; Automations keeps reminders
      and what's kept), a profile names an organization once (the trust line reads "Verified"
      when its chip is there), disappearing messages are one row that opens the choice
      (`disappearing-row`), a segmented control that doesn't fit scrolls instead of cutting its
      words (`Segmented`), `X-Frame-Options: DENY` agrees with `frame-ancestors 'none'`, the bare
      `/healthz` and `/readyz` answer 404 with the real path (`/v1/…`, DEPLOY.md), the help page's
      quiet-hours line follows the setting, and `e2e/fit.spec.ts` checks a 320-px phone and a
      desktop at 200% (640 CSS px) for a sideways scroll and screenshots the dark scheme. Found
      already right: one description meta (the shell carries none; a page sets its own). Not done:
      "not in the phone apps" on the help page stays true until the store builds; a screen-reader
      pass once a phone exists
- Measurements taken for the review (2026-10-01, this container, mobile preset): landing and
  `/business` 100/100/100/100 (LCP 1.4 s, 1.2 s; TBT 20 ms); sign-in 75/100/100/63 (LCP 4.2 s,
  TBT 440 ms). Budget 438.0 KB gzip. 1 of 106 pressables without a label or role; 14 physical
  left/right styles beside 26 logical. Not done: a sign-up on production, a load test (unchanged
  paths since 2026-09-30), a phone

## M11 — Intelligence (R17 and PRD §42: understand, remember, predict)

What Caime infers is rules you can read, in core, the same on every device, and a model only
where a person asked (R12, R17). This milestone takes the model to the places R17 named and the
plan hadn't reached, in the order people will ask for them.

- [x] Natural-language search (R17, PRD §25): a query the rules understood nothing of and that
      reads like a sentence ("anything Sam promised to send me", "ماذا قال سامي عن العقد") is
      read by the model into the very structure the rules fill (`SearchUnderstanding`,
      `fromUnderstanding` in core `search.ts`: every value checked against the taxonomy and the
      scope and file-kind lists, so the model widens what's understood and never what's
      searched), then runs as any query does. Only for a person with AI assist on, an adult,
      within their plan's allowance; the model sees the words typed and nothing else, on the
      light model; one reading is kept ten minutes per person and query; anything that stops it
      (AI off, no allowance, a refusal, the model busy) falls back to the text match without a
      word. The response says who read it (`understoodBy`, `label`) and the app shows the
      reading beside "Suggested by Caime". Every call is one `ai_runs` row (`feature: search`),
      through the one `runAi` the AI routes use. `ai.test.ts`, `search-kits-misc.test.ts`,
      `e2e/around-the-conversation.spec.ts`.
- [x] What you take, Caime offers more readily (core `learning.ts`): when a suggestion is
      made, the person's last decisions on that kind are read (the same person's first: three
      of Sam's promises passed on make the next quieter, three taken make it readier; the kind
      at large needs five), and the lean is kept on the suggestion with its counts
      (`payload.learned`). The app places, never hides: a favoured one comes first with "You
      took 3 of the last 4 like this", quiet ones wait in one line ("2 quieter suggestions you
      usually pass on · Show") until asked for. Rules, not a model; off with one switch under
      Automations (`learnFromChoices`, the account's, mirrored like the rest), and then nothing
      is learned or kept. One partial index (0047) and two small reads per suggestion made.
      `learning.test.ts` (core and server).
- [x] How sure, said in one line on every suggestion (core `sureness.ts`): the confidence every
      suggestion has carried becomes words before its reason, "Quite sure · Sam wrote “…”" for
      a dated promise or a verified team, "Fairly sure" for the rest, "A guess" for a shared
      space; never a number. On the conversation's card, the relationship offer and the
      same-person card (`suggestion-sure`). `sureness.test.ts`; the E2E reads it on a request.
- [x] Arabic depth in the message intelligence (core `intelligence.ts`): promises in Gulf and
      Levantine phrasing ("راح أرسل لك", "رح ابعتلك", "بكرا بعطيك") and MSA beside the
      Egyptian, taken back by a negation before them ("مش", "ما راح", "لن") and never "راح" as
      went; requests introduced by "تقدر", "فيك", "أبغاك", "بدي ياك", "لو تكرمت", "إذا ممكن" or
      their own verbs ("عطني", "طرشلي", "أرسل لي"), the thing asked for found past the particles
      ("لي", "لك") and the politeness after it; decisions ("نعتمد", "خلاص نمشي على", "القرار
      إننا", "تمت الموافقة") with the "خلاص" and "طيب" before them dropped; Gulf and Levantine
      question words ("وين", "شو", "ليش", "شلون", "بكم"), with "ما" read as a negation where it
      is one; a yes of several words ("خلاص تمام", "أبشر", "من عيوني"); payment words
      ("سدد", "مصاري", "بيزات"); and amounts as Arabic writes them: Arabic-Indic digits,
      "ألف"/"آلاف"/"مليون", "ر.س"/"د.إ"/"د.ك", a country word deciding "ريال قطري" or "دينار
      كويتي", and a bare "دينار" or "ليرة" saying no currency rather than a wrong one. Rules, no
      model, the same on every device; fifty more cases in `intelligence.test.ts`.
- [x] Memory across a relationship: a person's profile remembers, under "and you", the latest
      decisions across every conversation with them and what's still promised either way
      ("Sam owes · Send the deck · Fri", "you owe · Check the budget"), each opening where it
      was said (`PersonProfileView.memory`, five of each, soonest due first; the viewer's own
      rows only: their waiting items and what was asked of them, never the other side's
      private ones; nothing on your own profile). Two bounded reads when a profile opens.
      `relationship-profile.test.ts`.
- [x] The accessibility pass on the web (`e2e/a11y.spec.ts`): axe, WCAG 2.1 A and AA, over the
      primary signed-in screens on a phone and a desktop, in English and in Arabic, and over
      every page a visitor gets (the landing page, the five site pages, the entry screens, a
      person's and an organization's page, the 404), a serious or critical violation failing
      CI. The first run found five kinds, all fixed: the wordmark's and the rail's mark's name
      on a div with no role (now an image), the desktop rail's links saying `aria-selected`
      (now `aria-current="page"`, in the one `Pressable` that turns state into ARIA), the
      message ticks' words on the icon's path (now an image around it), the presence dot's
      colour with its raw state as its name (now "Online", "Busy", "Away", translated) and an
      invalid autocomplete token on the sign-up handle. 24 screens, nothing found after. A
      screen-reader pass on a phone still waits on a phone.
- [~] Voice notes transcribed and searchable (PRD §46): built behind one speech-to-text
      interface with two providers (docs/SPEECH.md; the decision, the rules and the bake-off the
      owner runs before a key goes on production). ⛔ Call summaries with decisions and actions
      (PRD §47, R52) wait for the consent flow and minute allowances, on the same interface.

## M12 — Reviewed from all angles (docs/REVIEW-2026-10-05.md)

Six reviews of the same commit (security, architecture, UX, intelligence, performance,
integration), merged and ranked on that page. Done here means fixed with a test; the rest is
listed there with its owner.

- [x] Security: a session that ends (sign-out, revocation, password change, recovery, suspension,
      a device removed) closes its live sockets on every instance (`endSessions`,
      `session.ended` on the bus); invite links honour R29 (an adult an under-18 doesn't know
      through someone gets a request the inviter decides on); push endpoints checked like
      webhooks with a deadline; relay credentials cached and limited; the backup's connection
      out of the command line; the email code limited and counted atomically; reports only of
      what the reporter saw, imports marked for the operator.
- [x] Architecture: socket frames validated (zod), a failing handler closes its socket alone,
      an unhandled rejection is logged, never fatal.
- [x] Intelligence: pleasantries aren't questions, negated or asked decisions aren't decisions,
      quoted and forwarded words aren't the sender's, sentences keep "$2.5k" and URLs whole,
      Arabic promises are first person only, "ممكن"/"فيك"/"بدك" ask only before a second-person
      verb, an agent's reply drafts nothing for the customer; a golden set of 127 labelled lines
      (80 English, 47 Arabic) with precision and recall floors in CI.
- [x] UX: "Needs a reply" and "Waiting for the customer" as wrapping radio chips; fifteen strings
      into Arabic; the terms sentence spaced, with its server twin; characters off business
      surfaces (B2); a message's actions by keyboard on the web (focus, Enter, Shift+F10), in the
      shortcuts sheet and `e2e/a11y.spec.ts`.
- [x] Performance: the inbox's last message by `last_seq`, the reply's sender by a join; search
      by word prefixes on the tsvector; `ai_runs (user_id, created_at)`; the app refetches the
      inbox soon only for a message that can move a conversation between sections, else once a
      quarter-minute; done jobs swept after 7 days and notifications after 180; the bus counts
      bytes; the membership cache forgets; the build's files skip the cookie lookup.
- [x] Integration: `GET /v1/apps/me` and `caime.me()`; `message.deleted` and
      `conversation.erased` webhook events; `GET /v1/files/:id` and `/thumb` for apps
      (`caime.file()`, `caime.thumbnail()`); the retry schedule and its end documented;
      `business.thread.by` says `ai_agent`; the mail log carries the kind, not the subject.
- [x] From the next block: the conversation's permission rules in core
      (`packages/core/src/permissions.ts`: who edits a conversation, removes others' messages,
      sets disappearing messages, and who under 18 may write to an organization), read by the
      server and the app alike; the four foreign-key indexes (migration 0049); a failed
      preferences save stays pending and is tried again, a draft is marked synced only once the
      account has it; a `Sheet` closes on Escape on the web (`e2e/a11y.spec.ts`); an app lists
      its own deliveries and retries a failed one (`GET /v1/apps/me/deliveries`,
      `POST …/:id/retry`, `caime.deliveries()`, `caime.retryDelivery()`); migrations expand
      first and contract later (convention 7).
- [x] The operator's tools for someone locked out (R48): an account's facts without its content
      (`GET /v1/admin/people/:handle`), every way in ended at once (`DELETE …/sessions`), a reset
      link mailed to the account's own address (`POST …/reset`, the sign-in screen's link through
      `lib/reset.ts`); audited with who did it; docs/DEPLOY.md "Someone locked out".
- [x] A refusal reads in the app's language (R54): every `AppError` message on the server goes
      through `tr` where it's thrown (480 sites, 336 strings), so a 404, a rule's "Only the
      owner…" or a plan's limit reaches an Arabic or French app in its words; what only the
      server says (those, the site's pages, notifications) is the server's own catalog
      (`locales/ar-server.ts`, `fr-server.ts`, `isServerKey` in `scripts/i18n-keys.mjs`,
      `server-i18n.test.ts`), so the app's Arabic and French chunks took on none of the 336 and
      let go of 74 notification strings they never showed;
      `i18n.test.ts` asks a 404 and a 400 in three languages. Zod's field messages stay English
      (a later block).
- [x] A message to a group costs the group once, not per member: what every recipient needs is
      read once for the set and each is written four at a time (`notifyRecipients`, `prepareFor`,
      `eachLimit` in `lib/batch.ts`); a group of 80 went from 813 queries and 294 ms to 267 and
      187 ms (`fanout-scale.test.ts`, with the counter `createTestApp` now keeps). The
      conversation view decides every read position in one check (`readReceiptsVisibleTo`) and
      takes its people from `personViewsFor`; an ack reaches whoever sent what it newly covers
      and the reader's devices, never the whole group.
- [x] A connection never labelled is asked for where the two of you are (R3): one chip in the
      conversation's intro, "How do you know {name}?", opens the relationship picker, and the
      intro shows the label once saved (`label-relationship`, `e2e/relationship-chip.spec.ts`).
- [x] R56, the first five minutes: onboarding is two steps (how Caime works, your people) and
      someone who came through a link, a door or an app's consent goes straight to it; the
      recovery codes leave the gate for a card at the top of Chats (`RecoveryCodesCard`), kept on
      the device until the person says they're saved and remembered by the account
      (`users.recovery_codes_seen_at`, `MeView.recoveryCodesSeen`, migration 0050), with new ones
      made by password when the fresh ones are gone; the one untranslated onboarding line through
      `tr`. `core-flow.spec.ts` walks it; the linked paths in `around-the-conversation.spec.ts`
      and `door.spec.ts` skip to their step.
- [x] The remaining UX mediums: toasts at the bottom, above the phone's tab bar, where a thumb
      reaches Undo (`ScreenToasts`, `ToastHost above`); reduced motion read from the device as
      well as the preference (`useReduceMotion`, `lib/motion.ts`: a `Sheet` stops sliding, a
      skeleton stops pulsing); a mono label in Arabic keeps its letters joined (no letter-spacing
      where the text has Arabic); the rail's Alerts is Notifications, as the screen is; a message
      arriving in an open conversation is read to a screen reader (`new-message-announcer`); and
      a form's own field messages go through `msg()` in core's schemas and `tr` in `validate.ts`,
      so a refused field reads in the app's language too.
- [x] The intelligence's dates and the edit path: the recent past ("last Friday", "yesterday",
      "last night", "last week") is past and never a due date; a day of the month ("by the 12th")
      is this month while ahead, else next; Arabic durations ("بعد أسبوعين", "خلال 3 أيام") and
      clock words ("5 ونص", "إلا ربع"); a bare hour after dinner, drinks or tonight is the
      evening's; an edited message is read again (`analyseText` in `lib/messages.ts`,
      `afterEdit`), its flags and dates kept and its new suggestions offered once each.
      `when.test.ts`, five golden lines, `messaging.test.ts`.
- [x] The intelligence's leftovers: a vague promise ("I'll do it Thursday") re-dates only the
      item it answers, the one it replies to or the only one open within two days, else it's a
      suggestion of its own (`absorbVague`); a time at the end of a search ("photos from last
      week", "decisions in March", "invoices 2025") is the days to search (`splitPeriod`,
      `query.period`, filtered on the server), never a person; the model reads a sentence only
      once typing has settled for a second or on Enter (`understand=1`; the rules answer every
      keystroke); two people with the same two-word name are offered as one only with a place or
      a nickname they share. `search-kits-misc.test.ts`, `ai.test.ts`, `duplicates.test.ts`.
- [x] R57, setting up apart from the day's work: an organization's page keeps the inbox,
      updates, spaces, the team and insights, and its owner and admins set it up on
      `/o/<handle>/setup` (`features/orgs/OrgSetup.tsx`: the door, the domain, customers' data,
      hours, the AI agent, apps and the plan, in a clinic's order), reached from one row that says
      what's next (`org-setup`, `setupNextLine`); the team's others get neither the row nor the
      screen. `door.spec.ts`, `around-the-conversation.spec.ts` and `a11y.spec.ts` walk it.
- [x] The remaining hand-written role checks are core's: `canAddToGroup`, `canPostTo` (a
      broadcast's owner and admins), `canRemoveFromGroup` and `canChangeGroupRole` (the space
      rules, by their group names), `handsOverOnLeaving` (whose leaving calls `nextOwner`),
      `MANAGING_ROLES` for a query's `in` list, and `ownsOrg` (closing, retention, making
      admins), read by the server before it acts and the app before it offers; outside core a
      role is compared only to label it. `permissions.test.ts`, `orgs.test.ts`.
- [x] The review's six small lows: a suggestion accepted twice at once makes one task
      (`acceptSuggestion` claims the row under its lock), forwarding needs a live seat (tested),
      an invite's token never reaches the request log (`lib/log.ts`), a stranger's wrong guesses
      at a known handle slow that stranger alone (the per-identifier limit is per address),
      running or listing backups and reading reports are in the audit log, and a resumable
      upload appends one chunk at a time under its row's lock. `log.test.ts`,
      `suggestions-many.test.ts`, `messaging.test.ts`, `auth.test.ts`, `backup.test.ts`,
      `moderation.test.ts`.
- [x] The review's performance mediums: the AI actions route checks what's suggested and
      tracked in three queries for the set; the reminder and held-notification sweeps take 200
      at a time beside the job loop; migration 0051 drops the covered `messages_conversation_seq`
      and records cache read and creation tokens on `ai_runs` (and on `caime_ai_tokens_total`);
      a message is selected by `MESSAGE_COLUMNS`, never with its tsvector (held to the table and
      the source by `messaging.test.ts`); the app's query cache is saved at most every 1.5 s and
      serialised in idle time (`queryClient.ts`, its own persister; the async-storage persister
      package is gone).
- [x] The budget's blind spots: `pnpm budget` measures the chunks loaded later as well (84, 476
      KB gzip in all), prints the five largest (the Arabic catalog 69.5 KB, the conversation
      screen 68.6 KB, French 57.9 KB, private conversations 24.9 KB, the stack 15.5 KB) and fails
      for any one over 100 KB; `features/shell/panes.test.ts` fails on a static import of a pane
      anywhere in the app.
- [x] Typed responses on every route (the review's last medium): the contract gains a
      `…Response` section (`packages/core/src/api.ts`), every HTTP route annotates its answer
      with one (288 of 289; the WebSocket upgrade has none), the app's endpoints read the same
      names (no inline shape left), and a refusal's codes are one list (`ERROR_CODES`,
      `packages/core/src/errors.ts`, typed on `AppError` and `ApiError`; the app's three own
      codes for a private conversation it may not write in yet are in it too). `errors.test.ts`.
- [x] The review's remaining lows: every query key lives in `qk` (`api/keys.test.ts` holds it);
      the billing reconcile's and the account deletion's swallowed failures are logged; dead code
      (`setInboxDraft`, `translatorFor`, `isIOS`/`isAndroid`, five icons) is gone; the nine routes
      no test reached have tests (health, custom roles, merge, identities, an app's secret
      rotation and ping, an update taken back from a report); the one raw `Pressable` uses the
      app's; every shadow is the theme's (`ui/shadow.ts`, `lifted`).
- [x] `modules/conversations.ts` split: what every module shared is `lib/conversation-views.ts`
      (`membership`, `conversationView`, `sendSystem`, `hadSeat`), `lib/topics.ts` (starting a
      topic) and `lib/space-conversations.ts` (`createSpaceConversation`, `activeMembers`,
      `tellSpace`, out of the space routes); the message routes are `modules/messages.ts` and the
      conversation's own stay (775 lines from 2,502); no route module imports another.
- [x] Webhook secrets rotate with a day's overlap: a replaced secret keeps signing deliveries
      beside the new one (`t=…,v1=<new>,v1=<old>`, `SECRET_OVERLAP_MS`, migration 0052), core's
      `parseSignature` and the SDK's verifier accept either, the app's sheet says until when
      (`OrgAppView.secretOverlapUntil`), and the developer guide's sample checks every `v1`.
      OAuth answers carry `iss` (RFC 9207) and the metadata says so. `apps.test.ts`,
      `oauth.test.ts`, `webhooks.test.ts`.
- [ ] Next block: the owner's ⛔ items as they come (TRUST_PROXY, local-currency payment, the
      npm account, a development build for a phone, store builds, the penetration test), and
      whatever the next review finds.
- [x] R55: French as the third language, for the Maghreb and Lebanon: every string of the app
      and core (2,543, 27 with plurals) and of the public site (267) in French, chosen in
      Language and region, loaded as its own chunk, the site's switch and `hreflang` alternates
      for three languages, the Open Graph locale by language, the AI agent's hand-over line in
      French, the catalog tests over every language, `e2e/french.spec.ts`. A native speaker's
      review is owed (as Arabic's was).
- [ ] ⛔ The owner: `TRUST_PROXY` against the live proxy chain; payment in local currencies with
      tax; an npm account for `@caime/sdk`; a development build for calls and private
      conversations on a phone; store builds; a third-party penetration test.
- [ ] Phone push, tried on a phone: built (2026-10-14) and tested off the phone. The app asks
      once (Chats' offer, Settings · Notifications "On this phone"), registers the phone's Expo
      token for the session, makes Android's two channels first, shows nothing over Caime in
      front, opens a tapped one where the browser's would (`notificationPath`), clears what was
      read or deleted elsewhere as it comes to the front (`watchShown`) and forgets the token on
      signing out; the server's Expo sender reads each ticket
      (`DeviceNotRegistered` drops the token), keeps one deadline, sends no replacement to a phone
      and is probed hourly (`phone-push.test.ts`, `push.native.test.ts`, the native export). ⛔
      Tried on the owner's iPhone in Expo Go (`caime-go`, which carries the Expo project) once
      deployed; Android needs the development build (Expo Go on Android has no remote
      notifications since SDK 53)

## M13 — Bookings for everyone (R58), the fourth language (R59)

- [x] R58: a host is a person or an organization. A person sets hours and a catalog in
      Settings · Bookings (`users.booking`, `users.booking_items`, `GET`/`PUT /me/booking`,
      migration 0053) as an organization does in its setup (`PUT /orgs/:id/booking` takes the
      catalog too); the shape is one (core `BookingItem`, `BookingSetup`), and a person's own
      agreed cards make them busy. Slots are an item's (`GET /orgs/:id/slots?item&quantity`,
      `GET /people/:id/slots`): the item's length on the hours' grid, full only at its capacity
      for the quantity wanted (places, or days for a stay, checked a night at a time), and only
      while one of its named providers is free. A booking from the catalog is checked on send
      (`payload.booking`, 403 `not_bookable`, 409 `slot_taken`) and the card keeps the item,
      quantity, the price as it was and its end. Who does it is decided when the team confirms
      (the free member with the fewest that day), kept from the customer (masked), shown and
      changed on the Bookings view (`POST /messages/:id/booking/provider`). Public items are on
      the public pages with Book first (`/@handle?book`, `/o/<handle>?book`), the profile
      and the organization's page offer Book, and a link lands on the card's form. The agent
      reads `<catalog>` and books with `bookItem`. `booking.test.ts` (core and server),
      `public-pages.test.ts`, `e2e/bookings.spec.ts`.
- [x] R58: the brief before a meeting. An agreed meeting or appointment in a work, customer,
      vendor or professional relationship (never family or friends) gets each participant a
      notification an hour before (`card.brief` job, one per card and start) with what Caime
      remembers since the last such card: decisions, promises open either way, their questions
      unanswered, files, how much was said; read in full from the card ("Before it",
      `GET /messages/:id/brief`), with a bounded AI summary only for a reader with assist on and
      an allowance left (`runAi`, 'brief'). `briefs.test.ts`.
- [x] R60: orders from the catalog. An item is booked or ordered by the piece (`unit: 'each'`);
      a host turns orders on with ordering settings (pickup, delivery, a note; `ordering` on
      `users` and `organizations`, migration 0054, the booking routes take it and keep it when
      left out). The existing Order card is the one card: with a catalog its form picks
      quantities, and the server checks and fixes the lines, prices, total, the way it's had and
      an order number (`placeOrder`, `orderFor`; `not_bookable` on a refusal); without one it's
      written by hand and needs its number. The card gains "Ready to collect" and "Collected".
      Public pages list items sold by the piece with "Order from", profiles and the
      organization's page offer Order, `?order` links land on the form. `booking.test.ts` (core
      and server), `e2e/bookings.spec.ts`.
- [x] R60, stock that runs out: an item sold by the piece may be counted (`item_stock`,
      migration 0079, apart from the catalog so an order takes one row's count under its lock and
      a save that leaves a count out keeps it: the setup sends a count only when it was changed
      there, `BookingSaveBody`). An order takes what it asks inside its message's transaction
      (`takeStock`, rows locked in item order; fewer left refuses it `409 sold_out` with the
      count, in every language) and keeps what it took in `order_stock` while it's open; a cancel
      gives it back, ready or shipped spends it, and an open order taken down for everyone or
      erased (a customer's erasure, the disappearing sweep) gives it back in the same statement
      (`stockBackCtes`), once, since the ledger row's delete is what gives it. The host reads every
      count; anyone else only once it limits an order (`withStock`: fewer than one order may
      take), so the host's setup reads "12 in stock", the picker caps at what limits the customer
      and reads "Only one left", "Sold out" disables Order on the
      item's sheet, and the public page says it with schema.org `OutOfStock` or
      `LimitedAvailability` and no Order link. A count changed by an order or a give-back
      publishes `booking.changed` to the host's devices (M15); exports carry the counts and a
      closed organization's go with its catalog. `stock.test.ts` (eight cases, the race for the
      last one included), core `booking.test.ts`, `e2e/bookings.spec.ts` (the last one ordered,
      sold out on the sheet, the visitor's page and the team's setup).
- [x] R60, the organization's AI agent takes an order: where the organization takes orders, the
      agent reads a `<menu>` of what this customer may order (`menuLines`: id, name, price, "up to
      n" or "sold out", from the items as the customer sees them, so it knows no more of the stock
      than they would) and the ways it's had; once the customer has said exactly what they want
      (and pickup or delivery where both are offered) it answers `order` with `orderLines` and
      `orderWay`, and the server posts an Order card from the organization through `sendMessage`,
      checked against the catalog and the stock like anyone's, for the team to confirm. Anything
      not on the menu, sold out, refused, or a way not chosen where there are two goes to a
      person; it never says an order is confirmed. Without ordering, no menu is sent and orders
      stay a person's. `agents.test.ts` (an order placed and its stock taken, sold out and no way
      handed over, no menu without ordering).
- [x] R60, options on an item: something sold by the piece may carry options (core `ItemOption`:
      one of its choices or any, required or not, each choice adding to the price on a paid
      item), set in the item's editor (`ItemOptionsEditor`), listed on its sheet and its public
      page, and read by the AI agent on its menu (choice ids and what they add). An order's line
      is an item and a set of choices (`lineKey`): the same item with other choices is a line of
      its own, priced per piece (`piecePrice`), named on the card ("2 × Coffee (Large, Oat
      milk)"), checked by `chosenOf` (an option not chosen as it asks is refused, "Choose from
      “Size” for Coffee."), and the item's most and its stock count over all its lines. The
      picker opens an item with options on its choices first and counts each line on its own.
      Found on the way: an item's sheet stayed open over the conversation its Order opened (a
      sheet is a layer above every screen); it closes as the conversation opens now.
      `item-options.test.ts`, core `booking.test.ts`, `e2e/bookings.spec.ts` (a latte's size
      set, chosen and ordered).
- [x] R61: collections and a page for each thing offered. `CatalogCollection` (core
      `catalog.ts`: addresses with `slugify`/`withSlugs`/`bySlug`, `RESERVED_SLUGS`) on
      `users.collections` and `organizations.collections` (migration 0055); an item gains its
      address, a line and its collection, and is seen only where its collection's audience allows
      too (`bookableItems`). Public items and collections have pages (`/o/<handle>/<slug>`,
      `/@<handle>/<slug>`) with JSON-LD, breadcrumbs and sitemap lines; signed in, the address
      opens the host's page with `ItemSheet` over it, and Book or Order lands on the form with the
      item chosen (`?item`). The setup groups items by collection and edits collections and
      addresses; the card pickers group by collection. Found on the way: `RelationshipPicker` sat
      in the startup chunk because two lazy sheets imported it statically (2 KB gzip back), and
      the setup's day and lead labels were never translated. `catalog.test.ts`,
      `public-pages.test.ts`, `paths.test.ts`, `e2e/bookings.spec.ts`.
- [x] R62: ways to be paid and the Pay card. `PaymentSettings` (core `payments.ts`) on
      `users.payments` and `organizations.payments` (migration 0056), saved with the rest of the
      offer and shown as set only to whoever sets them; the payment request is the Pay card with
      a direction (ask or pay), payer and payee moves (`kitMoves` with the card's fields,
      `initialKitState`), and `payTo` fixed by the server from the payee's ways the payer may see
      (`payToFor`). Priced orders and bookings carry their `payee` and offer Pay, which opens the
      Pay card filled and replying (`useCardAction`). Pay on profiles (`payable`), the
      organization's page and the public pages (`?pay`, "pays by" with the kinds only). On the
      way: card buttons, choice chips and field labels were shown in English in every language,
      now through the catalogs. `payments.test.ts` (core and server), `public-pages.test.ts`,
      `e2e/bookings.spec.ts`.
- [x] R64: organizations pay each other: `POST /orgs/:id/conversations` takes `asOrgId` (its
      owner or admins only; `business_threads.customer_org_id`, one conversation per person and
      organization they write as), the team sees `customerOrg` first (thread, title, Business
      inbox row), the writer `business.asOrg` ("As …", inbox "…, for …"), and a Pay card the team
      sends pays the writing organization through its ways for those it knows (`payToFor`).
      OrgScreen's "Writing as" chips. `org-payments.test.ts`, `e2e/org-to-org.spec.ts`.
- [x] R65: an organization's own checkout: its owner connects its own Stripe account (Connect
      OAuth, `org_checkout`, a one-time `checkout_states` row per consent), a Pay card the
      organization is paid by carries `payTo.checkout`, its payer opens a Checkout Session on the
      organization's account (`Stripe-Account`, no fee) from **Pay by card**, and the card is
      marked paid only from Stripe's answer (`settleCheckout`: the payer's return and the Connect
      webhook). Setup's Card payments section (owner connects or disconnects, admins see).
      `checkout.test.ts` (server, against `stripe-connect-stub.ts`), `checkout.test.ts` (core),
      `e2e/checkout.spec.ts` against the stand-in's Connect.
- [ ] ⛔ R65 in production: Connect turned on for Caime's live Stripe account, the redirect URI and
      the Connect webhook endpoint added, `STRIPE_CONNECT_CLIENT_ID` and
      `STRIPE_CONNECT_WEBHOOK_SECRET` set in EasyPanel. Needs the owner of the live Stripe account
      (docs/DEPLOY.md). Until then nothing offers it.
- [x] R66: the Attention home is the first screen (`/`; Chats moves to `/chats`): a greeting in
      the reader's own hour, "N things need you" from the inbox's needs-you rows (a space's
      folded into one line once two need you), waiting on others oldest first, coming up for three
      days, "Nothing needs you right now" (and "Say hello to someone" before anyone's there), the
      recovery codes card; `GET /v1/attention`. Cai's one question about a wait gone quiet for
      three days, in the first person ("Still waiting · It's done · Not needed any more"; still
      waiting asks again in three days through the task's reminder). The conversation's open line
      above the composer (`ConversationView.open`), Actions' words (Yours, Asked of you, Waiting
      for, Coming up, Done), and "What this changes" on a person's page (`policyEffects`, from
      their effective rule). `attention-home.test.ts`, `home.test.ts`, `policy.test.ts`,
      `e2e/attention.spec.ts`, the Arabic tour; the whole E2E suite on the new home.
- [x] R66, Cai's explicit moments: "Catch me up" and "Ask about this conversation" in a
      conversation's assist tools, the weekly digest (R68), and Ask Cai in Search
      (2026-10-14: `POST /v1/search/answer`, the search's own rows to the model and the ones
      the answer rests on back, kept nowhere; `ai.test.ts`, `e2e/around-the-conversation.spec.ts`).
- [x] R66, what Cai does unasked: Settings · Cai's "Cai on its own" (Less, Usual, More;
      `preferences.caiInitiative`, core `initiative.ts`). Less offers only "Quite sure"
      suggestions (`createSuggestion` and the bulk place offers), asks about no quiet wait and sends
      no notice before a meeting; More asks about a wait after a day; what's asked for is never held
      back (`initiative.test.ts`, `cai-initiative.test.ts`, `e2e/cai.spec.ts`).
- [x] R67: Caime's own accounts. @cai (kind `assistant`) and the seven Caime Friends (kind
      `character`) are users with fixed ids (migration 0059), opened through the ordinary direct
      route, greeted once in the reader's language, words and stickers only. Cai answers what you
      wait on, what's asked of you, what you said you'd do and what's coming up by the rules
      (`caiIntent` in four languages, three queries, no model) and anything else with the model
      (`runAi('cai')`, the person's allowance, adults with AI assist on, nothing private); the
      friends answer from their scripts with their stickers. Nobody is notified, the chat never
      needs you, and Cai counts as AI on every message. Entry points: "Ask Cai" on Attention, the
      "+" sheet's Chat with Cai and Caime Friends, `@cai` and each friend's page (and a public page
      for visitors: what it is, JSON-LD that never says Person). With it: "Suggested by Cai",
      "Rewrite with Cai", an organization's waiting customers on Attention.
      `system-accounts.test.ts` (core and server), `e2e/system-accounts.spec.ts`; the whole E2E
      suite (86 passed); initial web JS 449.6 KB gzip.
- [ ] ⛔ R67 @caime: the owner creates the organization in production, the operator gives it the
      reserved handle (`/v1/admin/orgs/:handle/handle`), it proves caime.datac.com's domain and turns
      on its agent; then About offers "Message Caime".
- [x] R68: Cai keeps going (OpenAI's dots evaluated). A wait handed to Cai ("Still waiting" on
      Attention, `tasks.cai_follow_up`) comes back at its remind time as an offer in Cai's chat
      with a follow-up ready to send (`offerFollowUp`, from the reminders sweep), sent as the
      person's own message only on their tap and once (`POST /messages/:id/follow-up`), then
      watched again in three days; "Write to {name}" and "Change it first" open the conversation
      with the words in the composer (`?say`). An opt-in morning brief in Cai's chat
      (`preferences.caiBrief`, one `cai.brief` job a day where the person is, rules only).
      Settings · Cai: the brief, the follow-ups Cai keeps (Stop), what it learned per kind with
      Forget or Forget everything (`users.learning_reset`, honoured by `leanFor`), and the
      learning switch, moved from Automations. `cai.test.ts`, `e2e/cai.spec.ts`; `pnpm check`
      (server 661), the whole E2E suite (86 passed, then the new spec with the accessibility and
      R67 specs after `ListRow` kept a row's id); initial web JS 449.8 KB gzip.
- [x] R69: the 2026 look. Inter for the interface (tight titles, semibold headings), quiet sans
      section and spec labels in place of the monospace, Nunito for brand moments only, neutral
      cooler surfaces with lighter lines (contrast tested), larger radii, roomier rows, headers
      and settings, the Attention home's greeting on its own lines; the public pages follow.
      Every E2E screenshot retaken; initial web JS unchanged at 449.8 KB gzip. Second pass, screen
      by screen: a fact's label reads as a heading ("Handle", "Based in": `Spec` and the public
      pages' `dt` sentence-case it in the reader's language), settings groups lose their outline
      on the canvas, and a person's page gathers Book, Order, Pay and Private conversation in
      one row of compact buttons under Message.
- [x] R70, intelligence in every language: the message intelligence reads French and Turkish
      (promises, requests, decisions, questions, dates, amounts) in readers of their own
      (`intelligence-fr.ts`, `intelligence-tr.ts`, `latin-language.ts` choosing per sentence),
      measured by the golden set per language with floors at what was measured, 32 lines of it
      written apart from the rules (29 of 32 read right before the review's fixes: a French
      present-tense visit, a Turkish aorist, a habit taken for a promise). The app reads typed
      dates and amounts through `lib/useReaders`, out of the startup chunk.
- [x] Search in every interface language (convention 17): the rules read files from someone,
      what was asked of you or by you, waits, what someone said, decisions, tasks, conversations
      and times in Arabic (Egyptian and the Levant's words too), French and Turkish
      (`search-languages.test.ts`, 44 cases); relationships by their names in the reader's
      language, "my" included; the interpretations that were English only ("PDFs from Sarah",
      "“X” from Y") are keys in every catalog.
- [x] R71: every Caime Friend thinks for itself. Rules first in four languages and as people type
      (`chatIntent`: greetings, a greeting of peace answered in kind, "how can you help",
      thanks, the four open-things questions, which any friend answers), answered in the
      language written (`writtenIn`); anything else in the friend's own character through the
      model (`runAi('friend')`, Cai's gates), reading only its own part of what's open; without
      the model its tips in turn, never a sticker alone; every friend's message counts as AI.
      `chat-intent.test.ts`, `system-accounts.test.ts`, `e2e/system-accounts.spec.ts` (the
      owner's Arabic messages, answered in Arabic).
- [x] R72, the bar: the phone's bar of places stays on every screen opened from a place, the
      place someone came from lit, a tab goes to its root from anywhere, and it steps aside in a
      conversation, a creation flow, onboarding, an app's consent and an invite (and, on
      Android, while typing); 16 points off the edge without a home indicator.
      `phoneBar.test.ts`, `e2e/attention.spec.ts` (a person's page, Spaces in one tap, the
      conversation, Search lit), the whole E2E suite.
- [x] R72, spoken like you: Cai and the Caime Friends answer in the Arabic someone chose, writes
      or lives in (core `arabicVariety`), by the rules in Egyptian, Gulf and Levantine Arabic and
      through the model in those and four more, told the country they live in; an
      organization's agent mirrors only the Arabic written; Settings · Cai's "How Cai speaks
      Arabic". `arabic-variety.test.ts`, `voices.test.ts`, `system-accounts.test.ts`,
      `e2e/system-accounts.spec.ts` (Egyptian for someone in Egypt), `e2e/cai.spec.ts`.
- [ ] Later in R72: Cai's lines in Iraqi, Maghrebi, Sudanese and Yemeni Arabic by the rules (the
      model speaks them already), each read by a native speaker first; the same care for French
      (Maghreb, Lebanon, Canada) and Turkish where it differs by place.
- [x] R73, Arabic reads as Caime: the paired faces (Noto Sans Arabic, Baloo Bhaijaan 2) under
      Inter's and Nunito's names by `unicode-range` on the web (`pnpm fonts` writes the shell's
      block) and through expo-font on phones; no tracking and lines ×1.18 for Arabic in `Text`
      and the server pages' `type()`; the layout's direction told to react-native-web (`ui/
      Direction`) at the root and in sheets; `Back` and `Chevron` mirrored; the interface's words
      at the layout's start, user text by its own; fields start at their labels. `fonts.test.ts`
      holds every style to Latin, Latin-extended and Arabic faces; `e2e/arabic.spec.ts` checks
      the faces load, a Latin label sits at the right and the chevrons are mirrored; the Arabic
      screenshots retaken.
- [ ] Later in R73: phones seen in Arabic on a device (the layout flips at the next launch after
      the change, as `I18nManager` works; a relaunch could be offered); Hebrew and Persian would
      take the same path with their own paired faces.
- [x] Cai in a conversation, in its privacy-safe shape (R67): "Ask about this conversation" in
      its assist tools answers a question from the transcript a catch-up reads (never a private
      conversation, a hidden or deleted message, or who on an organization's team wrote), in the
      language the question is asked in, labelled "Suggested by Cai" and kept nowhere, within
      the AI allowance (`ai.test.ts`, the AI assist E2E). Opening Cai's chat on a conversation
      stays declined: a summary kept there would outlive the words it came from, past every
      erasure path
- [x] R68, Cai's weekly digest: `preferences.caiDigest` (Settings · Cai, "Your week"), the
      `cai.digest` job on the first day of the person's week at the brief's hour or nine, in
      Cai's chat: who they talked with, what they did that they'd said they would, who has gone
      quiet, the longest wait, the week ahead; by the rules, in the reader's language and their
      Arabic, never anyone's words or anyone blocked (`cai-digest.test.ts`, `voices.test.ts`,
      `e2e/cai.spec.ts`).
- [x] R87, who Cai is and for whom: an organization's agent opens its first message with a
      rule-written introduction in the customer's language ("Hi Paola, I'm Nour, the AI assistant
      for Nile Dental."), left out of what the model reads; trying the agent shows it; Cai's
      invitation mail from its own address says who it is and whom it writes for; the agent's
      hand-over line through the catalogs; the weekly digest gains the organizations a person
      runs (new conversations, customers waiting on the team, bookings ahead, orders open). The
      authority levels and what was declined (titles, slides, a second intelligence table,
      autonomous sending) are written in PRODUCT-REVIEW R87 (`agents.test.ts`, `cai-mail.test.ts`,
      `meeting-guests.test.ts`, `cai-digest.test.ts`, `voices.test.ts`, the AI agent E2E).
- [x] R88, a place's head stays and searches itself: Chats, People, Spaces and Actions keep
      their head above the list (a hairline once it scrolls) and Attention its bar; a field at
      the top of each list finds among it at once, on the device (core `finds`: no case, no
      accents, Arabic folded), with "Search everything" and "Ask Cai" (Search opened with the
      words, asked at once and once). The composer is a 40-point line, bare "+" and microphone,
      stickers inside the box, five lines at most on a phone, shrinking again on the web when
      words are taken out. Photos open full screen in Caime (`PhotoViewer`, paged, saved), files
      with the session (`openFile`: a tab of its own on the web), and a phone's browser offers
      Camera in "+"; a HEIC that reaches the server has where it was taken zeroed
      (`stripHeifDetails`), and one no screen can draw shows as a file. Verified on the web at a
      phone's size and on the server; Chats loads like the other panes, so the first download is
      445.5 KB of 450 (`fold.test.ts`, `heif.test.ts`, `files.test.ts`, `photoSize.test.ts`,
      `e2e/chat-features.spec.ts`).
- [ ] R88 on phones, built and not yet tried on one: a file fetched with the session and handed
      to the system's sheet (expo-file-system, expo-sharing), the camera, the pinch in the photo
      viewer (iOS), a HEIC made a JPEG on the device (an iPhone's picker, a phone's re-encoding,
      Safari's canvas), a sheet handing on to a picker, a form or another sheet once it has gone
      (`afterSheet`, iOS), a long press anywhere in a bubble, voice notes with the ringer off,
      and Return sending with "Enter sends" on; each to try on an iPhone and an Android phone.
- [ ] On a phone (needs one to check): a WhatsApp export from an iPhone, which comes as a .zip
      (unzip it on the device); a Pay card's checkout returning to the app rather than the
      browser (an auth session with a `caime://` return); printing a receipt (expo-print); the
      keyboard over the composer and sheets on Android 15's edge to edge.
- [x] R89, your people from wherever you keep them: one "From your contacts" sheet, first on
      Connect and on onboarding's last step (`/connect?contacts=1`), reads the browser's contact
      picker, a Google or an Outlook account, or a file (dropped on it on a desktop) on the
      device, as one cleaned list; only addresses reach the server, whose match now costs the
      same three queries however many are found. An account is read once: the server trades the
      provider's code for an hour's access, sealed to a key the device made for that request and
      handed back in the address's fragment, keeping nothing and asking for nothing that renews
      (`lib/contact-accounts.ts`, core `contact-seal.ts`). Who's here gets Connect and Connect with
      all; everyone else an invitation sent by the person, WhatsApp to their number as dialled
      from anywhere, a text on a phone, mail, with their own link. The privacy page says so, with
      Google's Limited Use statement. Verified on the web with a stand-in for both providers
      (`contact-sources.test.ts`, `contact-accounts.test.ts`, `contacts.test.ts`,
      `e2e/contacts.spec.ts`, `e2e/bridges.spec.ts`).
- [x] R90 phase 1, a Google or Microsoft account connected for its calendar: Settings · Apps,
      "Your accounts", connects one per account (the consent returns a sealed claim only its asker
      redeems; the refresh token sealed on the server), reads busy times alone, every fifteen
      minutes for ninety days, and holds them where Caime's own cards hold time (a person's slots,
      an organization's providers, who the team's booking goes to); "Needs connecting again" when
      the provider refuses, which stops its times holding; disconnect tells Google and deletes
      what was read; export and privacy page say so. Verified with a stand-in for both providers
      (`connected-accounts.test.ts`, `e2e/connected-accounts.spec.ts`).
- [ ] R90 on phones, built and not yet tried on one: the consent in the system's sign-in sheet,
      returning to `caime://settings/apps`.
- [x] R90 on cai.me: the owner's Google client (calendar.freebusy, in Testing with its test
      users until Google verifies it) and Microsoft client (`common`) carry the new redirect
      addresses, and both connected a real calendar from Settings · Apps (the owner, 2026-10-14).
- [x] R90 phase 2, a file from Google Drive or OneDrive in a conversation: Settings · Apps adds
      Files to a connected account (the provider asks again for that alone); the Share sheet
      offers each drive; OneDrive is browsed in Caime (folders, search, pages) through the server;
      Google's file is picked in Google's picker on its own page (a one-time ticket, its own
      policy; a phone opens it in the sign-in sheet); the server copies the one picked in as the
      person's upload (streamed, hashed, 100 MB cap, a Google document as a PDF). Verified with
      stand-ins (`cloud-files.test.ts`; `e2e/connected-accounts.spec.ts` attaches from OneDrive in
      the browser). Google's picker itself runs only against Google, so it's checked on cai.me.
- [ ] ⛔ R90 Google files on cai.me need the owner's Picker key: a browser API key limited to the
      Picker API and `https://cai.me/*`, and the project's number (`GOOGLE_PICKER_API_KEY`,
      `GOOGLE_PICKER_APP_ID`; docs/DEPLOY.md). Until then Files is offered for Microsoft alone.
- [x] R91 phase 1, a person's own addresses (PRODUCT-REVIEW R91): Settings · Apps' "Your accounts"
      is one list, the sign-in email (verified or not), the Caime address, then email addresses
      and phone numbers added as one's own (`own_addresses`, migration 0081, `lib/addresses.ts`),
      each "Not proven yet" until a six-digit code sent to it comes back (hashed, ten minutes,
      five tries counted in the database), then "Verified · Proven by a code by email" (or on
      WhatsApp), then the connected accounts. A proven one is one person's alone (a unique index;
      someone's sign-in email is refused as taken), finds them in a contacts file and in search as
      their sign-in does, is the person for Caime Mail, travels in the export and goes with the
      account. Mail from one's own address to one's own Caime address lands in one's Cai chat,
      kept and unanswered (it was refused). Verified with `addresses.test.ts` (WhatsApp's Cloud
      API played by a stand-in: the template, the code in the body and the copy-code button),
      `mail.test.ts` and `e2e/addresses.spec.ts` (an email proven in the browser by the code the
      SMTP stand-in caught).
- [ ] ⛔ R91 phone numbers on cai.me need the owner's WhatsApp sender: a verified Meta Business
      account, a WhatsApp Business number, an approved authentication template named `caime_code`
      (body with the code, a copy-code button) and `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
      (docs/DEPLOY.md). Until then "Add a phone number" isn't offered.
- [x] R91 people found by a proven phone number: a contact's number (made international on the
      device by the person's country) or a number typed in People search finds whoever proved it
      theirs while By your phone number is on (`discoverByPhone`, off for accounts that never
      saved it, never under 18). Verified with `addresses.test.ts` and `contacts.test.ts`.
- [ ] R91 phase 1, the rest: an organization's own list (its domain, its Caime address, its
      connected accounts), LinkedIn and PayPal as verified identities (⛔ their sign-in apps), SMS
      as the phone's fallback (⛔ a provider). A number is proven only over WhatsApp until then
      (⛔ `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` in EasyPanel).
- [x] R92 places (PRODUCT-REVIEW R92): a person's and an organization's named addresses
      (`places`, migration 0082, core `places.ts`, `lib/places.ts`), saved as a whole list in
      Settings · Places and an organization's setup by one editor (`PlacesSetup`); a person's shown
      through the privacy evaluator (`placeVisible`: their audience, the limited preset, blocks;
      nobody until chosen, family at most under 18), an organization's to anyone (its page, a map
      link, `PostalAddress` in its JSON-LD), its customers or its team. A card's "Where" fills from
      either side's with one tap (`GET /conversations/:id/places`), an order to deliver carries the
      customer's address (`deliverTo`, copied, shown on the card), a Location card is one of the
      places (its words and its point, copied, never live), and both exports carry them.
      Verified with `places.test.ts` (core and server) and `e2e/places.spec.ts`.
- [x] R92 branches as booking hosts: an item at one of the organization's places (customers'
      or everyone's), a branch's own days (`placeHours`, core `hoursFor`), the branch's address
      copied into the appointment's "Where" (`AppointmentBooking.where`), named on the public
      page when it's everyone's and in the agent's catalog; a place let go of or kept for the team
      leaves its items done wherever. Verified with core `booking.test.ts`, `branches.test.ts`
      and `e2e/branches.spec.ts`.
- [x] R92 branches for real (owner's report 2026-10-15, "not built yet: branches with their own
      hours and staff"): a branch's people (`PlaceHours.staff`, people on the team only,
      `assertBranchStaff`), read through core `providersFor` (the item's people, else its
      branch's, else anyone) by the slots, `pickProvider` and the reassign route, so a booking
      at a branch goes to whoever works there and holds them; a branch may keep its people
      without days of its own; hours that differ by day, for the host and for a branch, in one
      editor (`WeekHours`); a customer with items at two or more branches says where first
      (`book-branch`, items done there or anywhere); the booking keeps its branch
      (`AppointmentBooking.placeId`) and the team's Bookings view filters by it. Verified with
      core `booking.test.ts`, `branches.test.ts` and `e2e/branches.spec.ts`.
- [x] R92 a place as a Location card anywhere: the Location kit is offered in every
      conversation (customer conversations and unlabelled chats included, still never by
      someone under 18), and the form says where saved places come from when there are none.
- [ ] R92 next: sending a saved place from the place itself (Settings · Places) into a chosen
      conversation; the agent offering each branch's own slots (it offers the first item's).
- [x] R93 writing to an address that isn't on Caime (PRODUCT-REVIEW R93): an email address typed in
      Search or Connect offers "Write to … by email" (`POST /conversations/by-email`,
      `openMailConversation` in `lib/provisional.ts`, one provisional person per address shared with
      inbound mail and meeting guests), a message request (one mail until they answer, twenty new
      addresses a day), the first mail saying who wrote and how replying works; an address that is
      someone's on Caime is refused as taken and never mailed. Verified in `mail.test.ts` and
      `e2e/mail.spec.ts`.
- [ ] R91 phase 2: other calendars and Outlook mail read live inside Caime, tied to people,
      answered from one's own address; Gmail reading after the owner's CASA decision.
- [ ] R91 phase 3: an organization's WhatsApp Business, Instagram and Messenger in its Business
      inbox (Meta's business APIs; ⛔ Meta app review and business verification).
- [ ] R90 next use: mail sent as one's Gmail or Outlook address, and Outlook mail read in; Gmail
      read only after the owner decides on Google's CASA.
- [ ] R89 on phones, built and not yet tried on one: the phone's own address book (expo-contacts,
      READ_CONTACTS alone on Android), iOS 18's "share more" picker, an account's consent in the
      system's sign-in sheet returning to `caime://connect`, and a text from the system's
      composer over Caime (expo-sms).
- [ ] ⛔ R89's accounts need the owner's OAuth clients (docs/DEPLOY.md, "Contacts from Google and
      Microsoft"): a Google Cloud web client with the People API and the two read-only contacts
      scopes, which Google verifies before more than a hundred people may use them, and a
      Microsoft Entra app (any account) with Contacts.Read and People.Read; until then those two
      rows aren't offered and the phone, the picker and a file are.
- [x] R67, @cai's and the friends' public pages say what each does: its own help line and what it
      knows (Cai's five things beyond its chat; a friend's tips, the lines it tells in its chat), the
      friend drawn, `SoftwareApplication` with a `featureList` for Cai, every line in the reader's
      language (it was English on an Arabic page: the words were translated before the reader's
      language was known; now at render) (`public-pages.test.ts`, `e2e/a11y.spec.ts`).
- [ ] Later in R67: more of what each friend knows than its three tips, each line one it can stand
      behind in every language.
- [ ] ⛔ A trademark and store-name clearance for "Caime" before the store builds (the owner's).
- [x] R62, a split's shares paid with Pay: "Pay your share" on a split opens the Pay card with
      the share (they pay, the split's payer is paid, its amount, answering the split); between
      the two of them even in a group (`standsAside`: no moves, no notifications for the rest;
      only the ways for everyone on it), one open card a share under the split's lock, and the
      share settled in the move's transaction when its payee says it arrived (`lib/splits.ts`,
      `payments.test.ts`, `e2e/around-the-conversation.spec.ts`).
- [x] R62, a receipt from a paid card: Receipt on a paid Pay card for its two sides (in a group,
      whoever paid and was paid: `paySides`), `GET /v1/messages/:id/receipt` (`lib/receipts.ts`:
      the number from the card's id, `receiptNumber`; the organization for its team, never a team
      member to a customer; the customer's organization when they write for one; by card or
      confirmed received), the sheet's lines and shared words from core `receipts.ts`, printed on
      the web with the page left out (`ReceiptSheet`, lazy). `payments.test.ts` (three cases),
      `receipts.test.ts`, `e2e/bookings.spec.ts`.
- [ ] Later layers of R62: refunds from a card paid by card (R65's Connect, ⛔ in production).
- [x] R63: an item's photo: `BookingItem.photoFileId`, set only to an image its saver uploaded
      (`assertItemPhotos`), served by `/v1/{orgs,people}/:id/items/:itemId/photo` to whoever may
      see the item (anyone for a public one), addressed by core `itemPhotoPath`; on the item's
      public page (picture, `og:image`, JSON-LD `image`), its sheet, a collection's list and the
      order picker; added, changed or taken off in the item's editor. `item-photos.test.ts`,
      `e2e/bookings.spec.ts`.
- [x] R61, the host's order: "Move up" and "Move down" in a collection's, an item's and a way to
      be paid's sheet (core `moveOne`, `moveItem`: an item moves among its own collection's), and
      the public page lists each public collection under its own name with what's on it, then
      the rest. `catalog.test.ts`, `public-pages.test.ts`, `e2e/bookings.spec.ts`.
- [ ] Later layers of R61: person pages' items in a sitemap only if a person opts in.
- [x] R59: Turkish as the fourth language (`tr`): core and server catalogs, the setting, the
      site's switch and alternates (`tr_TR`), the catalog tests over four languages, the agent's
      hand-over line, voice-note hints; `e2e/turkish.spec.ts`.
- [x] Native-language review of all six catalogs (2026-10-05): Arabic app ~330 and site ~150,
      French app 236 and site ~165, Turkish app ~470 and site 314 values; one glossary per
      language shared by the app and the site. Code that left English in other languages fixed:
      "You"/"Someone" and who-did-what lines (now "what happened: who"), "Yesterday", day counts,
      votes and photos as plurals, "tomorrow at", the mutual description and insights as whole
      sentences, a group call's "the group", countries named in the language on screen. A paid
      professional translator's pass before a market launch is still worth it.
- [x] R58, a meeting that repeats: "Repeats" on the Meeting card (every week, every two weeks,
      every month; a chat or a group), agreed once, each time a card of its own posted a minute
      after the one before ends, already accepted and told to nobody, with its own brief, Join,
      "starting now", guests (asked again in the meeting's space) and "Cancel this one"; the
      proposer's wall clock across clock changes, a month's day held, missed times skipped;
      "Stop repeating" on the time ahead; the calendar, the feed (one event a time) and the
      slots look ahead from the latest card (core `series.ts`, `lib/meeting-series.ts`,
      `upcoming.ts`). `series.test.ts`, `meeting-series.test.ts`, `e2e/meetings.spec.ts`.
- [x] R58, a group's meeting has its brief an hour before: in a space by its kind (a team's or a
      project's to everyone, a family's or a community's to nobody), outside one by each
      person's own label for whoever called it, one query (`groupReaders` in `lib/briefs.ts`).
      `group-briefs.test.ts`.
- [x] R58, a meeting every workday and until a day: "Every workday" on the days its proposer
      works (the week kept on the series, R76), "Until" asked once it repeats (the last day
      held; the calendar, feed and slots stop there), "Stop repeating" clearing both
      (`series.test.ts`, `meeting-series.test.ts`, `e2e/meetings.spec.ts`).
- [x] R58, a resource shared by several items: the hours keep what items share
      (`BookingHours.resources`: a name and how many, up to seven, so an item's choice stays a
      row of eight chips), an item takes one of them (`resourceId`), and a time is open for it
      only while the resource has room beside every booking of every item that uses it (core
      `openSlots`' `resource`, the server's `busyFor`); Settings' and the setup's "Add something
      shared" and an item's "Takes one of" (`booking.test.ts` core and server,
      `e2e/bookings.spec.ts`).
- [x] R58, an appointment that repeats: "Repeats" on the Appointment card in a chat or with an
      organization, confirmed once, on the host's clock; each time posted confirmed and booked
      as it's posted (`bookingFor` with its series), its slots held ahead in the slots, the
      team's Bookings (`OrgBookingView.ahead`, `id`, `repeat`) and both calendars; a taken
      time skipped and told, an item no longer offered ends it and says so; the provider kept;
      no thread reopened (`appointment-series.test.ts`, `e2e/bookings.spec.ts`).
- [ ] Later layers of R58: a customer choosing who does it where an organization allows it
      (R15 keeps the team unnamed to a customer: the owner's decision).

## M14 — Apps and Mail (R74, R75)

Everything that reaches Caime from outside, in one place: the apps someone connects and
discovers, and mail at their own address.

- [x] R74, Apps: Settings · Apps with Connected (grants and built-ins as one kind of row) and
      Discover (listed apps, keyset-paged, trigram search, categories, icons, publisher,
      connect count, Connect through the app's own sign-in); a developer lists an app from
      Developer, the operator reviews a listing (`/v1/admin/listings`); the calendar address as
      the first built-in app. Privacy and help pages reworded; `app-directory.test.ts` (seven
      cases, 46 listed apps paged in three), the E2E paths moved from `/settings/connected` to
      `/settings/apps` with a Discover scenario (listed, reviewed, found, counted, Connect in its
      own tab).
- [x] R75, Caime Mail phase 1: `MAIL_DOMAIN` and the provider behind one interface
      (`lib/mail-provider.ts`, Postmark first; a stand-in in tests, `e2e/mail-stub.mjs`), the
      authenticated From only (DMARC, or DKIM or SPF aligned, from the headers the receiving
      server wrote), provisional people (`users.kind = 'provisional'`, visible to whoever they
      wrote to, found by nobody, swept after a year's silence or when in no conversation), a
      stranger's mail as a request that keeps every message, threads as topics by References
      or by subject, attachments through files (a long mail whole as a text file), replies out
      from the person's or the organization's address in the thread with sent, delivered and
      bounced, claiming by signing up with the address, an organization's address as a customer
      thread, under-18 addresses closed to strangers, erasure of a mail's subject and sender,
      the privacy and help pages and the processor list; the app says "by email" with the
      delivery state, marks a person reached by email (no handle, no call), shows the address in
      Settings, and its composer shows the subject a mail carries (the thread's, else the first
      line) and starts the topic a written subject names. Not in phase 1: unverified mail shown as a notice (dropped and
      counted, `caime_mail_total`), the hourly notification tempo for mail, a card or a sticker
      said by mail, the agent answering by mail, signing in with the address (sign-up claims).
- [x] R75 in production, the code (review 2026-10-13): who sent a mail in is checked by Caime
      from the raw message Postmark forwards ("Include raw email content"; `lib/mail-auth.ts`,
      mailauth pinned): DKIM verified against DNS through `ctx.dns`, SPF for the address
      Postmark's own `Received` lines at the top saw connect, DMARC from both; any verdict in the
      payload or the sender's headers ignored, no raw message no vouching, and provider health
      shows `mail` down when Postmark sends none. The envelope recipient (`OriginalRecipient`) is
      read, so Bcc and list mail reach their handle; the staff addresses (`postmaster@`,
      `abuse@`, `hello@`, `support@`, `help@`, `contact@`, `info@`, `privacy@`, `security@`,
      `legal@`, `billing@`) reach `MAIL_STAFF_HANDLE`; a mail lands once wherever its addresses
      meet, and a provider's retry is the one message (a client id from the mail's own).
- [x] R75 in production on cai.me (2026-10-15): Postmark Pro, the inbound domain with raw content
      and both webhooks, `MAIL_*` with `MAIL_STAFF_HANDLE`, the MX at Postmark. Verified live: a
      mail from outside to `hussein.khalid@cai.me` logged `"outcomes":["delivered"]` with DKIM and
      DMARC passing, arrived as a conversation, and the owner's replies reached the senders' inboxes.
- [x] R79 layer 1, bridges (PRODUCT-REVIEW R79): Zapier, Make, n8n, Pipedream and IFTTT as
      bridge built-ins in Discover (a sheet that makes a scoped personal token in one tap and
      says what each can do with Caime; on while the token lives); a contacts file into People
      (vCard, CSV: who's here by address, an invite link for the rest); the OpenAPI 3.1 document
      from the routes' own schemas (`GET /v1/openapi.json`).
- [ ] R79 layer 1, personal webhooks for push triggers, after the polling bridges are in use.
- [ ] ⛔ R79 layer 2, first-party connectors: Google Calendar and Outlook calendar sync, live
      contacts, sign-in with Google, Apple and Microsoft, each needing the owner's OAuth client
      with the provider; built on one connector interface with a stand-in and a health gauge.
- [ ] R79 layer 3, a self-hosted connector engine for breadth: evaluated against what Discover's
      no-result searches say people want; decided after layers 1 and 2.
- [x] R78, apps as contracts (PRODUCT-REVIEW R78, with Open Connector evaluated): the
      `provider.health` task and gauges (each configured provider's cheapest read, hourly, on
      `/metrics` and for the operator); the OpenAPI 3.1 document (done with R79); `@caime/mcp`
      over the SDK's person methods (nine tools, JSON-RPC over stdio, built from the repository;
      ⛔ publishing to npm needs the owner's account); the audit log as a hash chain sealed by
      the database at commit and verified daily; `provides` on listings (calendar sync, mail),
      reviewed as the listing is.
- [x] R80, the marketplace page (PRODUCT-REVIEW R80, Slack's marketplace read as the model):
      `/marketplace` on the site with a page per listed app (`/marketplace/<slug>`, JSON-LD,
      sitemap, Connect through sign-in), categories, the built-ins and bridges first; a listing
      with screenshots, a declared pricing model, languages, support and privacy addresses and
      an AI disclosure; the written bar on `/developers` and in API.md; "Reviewed by Caime" with
      the operator's checklist; delisting with a note.
- [x] R80, cai.me as the public address: the domain is Caime's and serves the app (DNS and the
      certificate done, 2026-10-13), `PUBLIC_URL` moved, and Caime's pages answer on that one
      name (every other sends them there; the API answers on all, so webhooks and feeds posting
      to the old address keep working).
- [x] R81, said, never guessed (PRODUCT-REVIEW R81, owner 2026-10-11): `users.gender` (woman,
      man, another word, or null; migration 0070), `UpdateMeBody.gender`, `MeView.gender`,
      `PersonView.gender` under the new `gender` privacy field (connections by default, hidden by
      the limited preset), set in Settings · Profile (`gender`, a `ChoiceSheet` row) and listed
      under Privacy; core `ReaderForms` and `GenderForms` in the catalogs (`tr` picks the reader's
      own form, `trFor(gender, key)` someone else's, `trForms` every form for search), the 141
      short Arabic imperatives and every role and sphere label in Arabic and French with their
      forms, `relationshipLabel({ gender })` and `relationshipView(r, gender)` at every site that
      has the person's view, the picker's roles in the person's form, the reader's gender carried
      by the server's `Reader` (`asReader`, `inLanguage`, a signed-in request through
      `adoptReader` in the auth plugin) and by the app's translator (`setReaderGender`, a remount
      on change), Cai and the friends told it (`voiceLines`), the privacy page naming it, the
      handle isolated left to right in an Arabic line (`handleOf`, U+2066). `i18n.test.ts` (core
      and server), the catalog tests, `e2e/arabic.spec.ts`. Not done: feminine forms of the longer
      Arabic sentences (a native reviewer's), French reader-addressed forms (none exist yet), the
      Arabic varieties' voice lines by gender.
- [x] R75 phase 2, the agent answering by mail: a customer who writes to an organization's
      Caime address is answered by its AI agent, introduced as an AI, as mail from the
      organization's address (an app's replies there too). Its replies had been dropped by the
      send job, which took only a person's words. Verified with `mail-agent.test.ts`.
- [x] R75 phase 2, notices: a list's mail, an automatic one or one from an address nobody
      answers (core `isNoticeMail`: List-Id or List-Unsubscribe, bulk precedence, Auto-Submitted,
      a no-reply local part) lands in one conversation per sender (`conversations.notice`,
      migration 0084), never a request, muted, with no topics, no notifications and no
      suggestions, under the folded Notices section; nothing is sent from it (`notice_only`).
      Only a conversation that starts as a notice is one, so a correspondent's list mail never
      silences them. Verified with core `mail.test.ts`, `attention.test.ts` and `mail.test.ts`.
- [x] R75 phase 2, HTML as sent: a mail's HTML is kept with it (`mail_messages.html`, migration
      0085, up to `MAIL_HTML_MAX`), said by `MessageMailView.hasHtml` without being sent with the
      view, and opened by "View as sent" through `GET /messages/:id/mail.html` for the
      conversation's people alone, under a CSP `sandbox` with nothing loaded but `data:` (no
      script, no origin, a tracking pixel never fetched, `no-store`); erasure clears it. Verified
      with `mail.test.ts`.
- [x] R75 phase 2, how far a mail got and words that read as chat (owner's request
      2026-10-15): seen when they reply (every mail before it, `seenByReply`) or follow the
      mail's "Open in Caime" link (`/v1/mail/seen/<id>.<mac>`, `serverKey('mail.seen')`, masked
      in the log, landing on sign-up); "Opened, probably" from Postmark's open pixel
      (`TrackOpens` on an HTML copy of the text, the `Open` webhook record, `opened_at` only
      where `track_opens`), disclosed at each mail's end and on the privacy page, on by default
      and off under the Caime address (`preferences.mailOpens`); a mail in's emphasis marks out
      and its signature apart (core `mailText`, `mail_messages.signature`, migration 0086),
      folded under the words. Verified with core `mail-text.test.ts` (the owner's own Gmail
      thread) and `mail.test.ts`.
- [x] R75 mail from before the change: a mail out later answered by its address is seen at the
      answer's time (migration 0087), and the closing lines a sender's mails share fold into
      their signature once (`lib/mail-backfill.ts`, core `sharedTail`, marked done in
      `server_settings`). Verified with `mail-backfill.test.ts` on the owner's thread's shape.
- [x] R94 handles by one engine (`docs/HANDLES.md`): ranked, deterministic candidates for people
      and organizations (`GET /v1/handles/candidates`, chips at sign-up and on a new organization),
      generic words alone reserved, lookalikes refused (`handle_skeleton`, migration 0088), the
      Latin spelling asked for a name in another script, numbers in order instead of at random,
      gender asked at sign-up and never required (its twin too). Verified with core
      `handle-engine.test.ts`, `rules.test.ts`, server `handle-engine.test.ts` and
      `e2e/entry-twins.spec.ts`; two sign-ups racing for one handle get one account and one
      `handle_taken` (`claimLost`). Not yet: more scripts' names.
- [x] R95 the pages a visitor lands on, designed (owner's request 2026-10-15): a person, an
      organization, an item, a collection, an invite and the 404 are built of one set of parts
      (`lib/page-parts.ts`): a top bar with Sign in, a header with the face or logo (initials when
      there's none, the heart for Cai), the verified mark, the actions, offers as cards with their
      photo or icon, places as cards with a map, the facts as a spec sheet, and Caime's foot. An
      item's page has a cover, fact chips, who offers it as a card, more from them, and a bar with
      its price and Book or Order in reach of a thumb (a side card on a desktop) saying what
      happens next. Tokens only, no script, logical sides, every language. Verified with
      `public-pages.test.ts`, `invites.test.ts`, `e2e/a11y.spec.ts` and screenshots at 390 and
      1280 px in English and Arabic. Next: the landing page, the site and the marketplace on the
      same parts; an item's next open times on its page (for an organization; a person's would
      show their week to anyone, which needs the owner's word).
- [x] R96 bookings and connected calendars in step both ways (owner's report 2026-10-17): a
      booking from a person's own catalog holds their time and is on their calendar while the
      booker's message request waits (`AppointmentBooking.hostId`, older bookings backfilled by
      migration 0089); busy times come from every calendar the person owns (Google's calendar list,
      Microsoft's own calendars), a calendar Google answers with an error is a failed read, not an
      empty one, and a read older than a minute is redone before a slot is offered or taken; with
      Plans on, Caime's meetings and appointments are written into the connected Google or Outlook
      calendar (asked as tentative), rewritten as they move, taken out when cancelled, removed or
      no longer theirs, and taken out ahead of a disconnect; what Caime wrote is left out of what's
      read back. Verified with `calendar-sync.test.ts` (Google and Microsoft stand-ins, events
      included), `connected-accounts.test.ts` and `e2e/connected-accounts.spec.ts` (a stranger's
      booking lands in Google as tentative and leaves it on disconnect).
- [ ] ⛔ R96 live: add Google's `calendar.calendarlist.readonly` and `calendar.events.owned` and
      Microsoft's `Calendars.ReadWrite` to the owner's clients (DEPLOY, Connected accounts, step
      5), then connect again ("Read every calendar", "Add Plans") on each account.
- [ ] R75 phase 2: reply-all with CC, sending as the address from Gmail and Outlook through
      Caime's submission.
- [ ] R75 phase 3: sign in with Google, Apple and Microsoft (claiming in one tap); Google
      Calendar and Outlook calendar sync as apps in Discover; a verified organization receiving
      at its own domain.

## M15 — Review 2026-10-09 (docs/REVIEW-2026-10-09.md)

The six-slice review's plan, in its order; a block is ticked when its tests and the E2E pass.

- [x] Block 1, privacy and money: `visibleTasksSql` for Cai, the briefs and the inbox (H1);
      the checkout session settled under the card's lock, never replaced while paid, expired when
      the card is settled otherwise (M1); slots gated by the item's audience (M2); items'
      providers stripped for customers and named by nobody else (M3); the payer masked (M4);
      priced bookings adults-only (M5); a seat ending or a close clearing what leaned on it,
      `closeOrg` disconnecting the checkout, `checkoutAccountOf` open only (M6); listing review
      by revision with an operator icon (M7); the security Ls (the provider route under
      `assertCanWrite` and a limit, asks parsed, the Connect return tied to its session, http(s)
      websites and openable schemes, the brief without hidden messages, reclaims per person,
      re-encoded images only). Arbitrary payloads on text messages (L9) wait for Block 6.
- [x] Block 2, integration Hs: the provider filter in `cardsAhead` (H2); an organization's files
      spared when its owner's account goes (H3); listings cleared of a closed or left
      organization (H4, with block 1); cards and organizations in search (H5: `search_all`,
      a bare month the nearest one, a year bounded); slots from every overlapping card (H6).
- [x] Block 3, words: `msg()` on the eleven label tables; the friend's line true to R71; every
      fragment and bare literal a whole key (156 keys, the three catalogs complete, 25 stale
      entries gone); `bareLiterals` in the collector, held empty by `i18n-literals.test.ts`.
- [x] Block 4, Apps and Developer in harmony: one `AppPublisher` (`publisherOf`) on consent,
      Connected, Discover and an organization's listings, drawn by `PublisherLine` (a tap to the
      publisher's page) with the app's icon on consent; the developer told of each review
      (`kind: 'app'`) and shown `connectedCount`; `GET /orgs/:id/listings` on the setup screen;
      `afterCardMove` for the move route and Checkout (a card paid by card tells the asker and
      the apps); `kit.posted` and `kit.moved` for Caime's cards to every listening app, the
      customer's card on `business.message`; `GET /orgs/:id/calendar` and a new
      `GET /orgs/:id/orders` for apps (`inbox:read`) and the SDK (`calendar`, `orders`), the
      Business inbox's Orders view; the SDK's person methods; the R74 lows (tokens in Connected,
      Connect hidden under 18, suspended developers unlisted, built-in counts cached, delivery
      polling only while pending, `patchCache`, `qk.orgApps`).
- [x] Block 5, scale: `USER_COLUMNS`/`ORG_COLUMNS` held by `columns.test.ts` (33 reads off the
      catalogs); the booking checked again under the host's advisory lock (a race test);
      `messages.card_start_at` with its index, read by the calendar, the slots, the briefs and
      search; the module rule with `modules.test.ts` (eight imports moved into `lib/`); the job
      pool that refills, the NOTIFY for anything due within a rest, the brief's per-person
      minutes; one `TtlCache` for five caches; the sitemap cached ten minutes and forgotten by
      its writers; `AppListing` lazy; the Ls: four foreign-key indexes, `returning(MESSAGE_COLUMNS)`,
      the shared `clip` and `escapeLike`, one `AGREED_STATES`, the brief jobs' two prefixes
      apart, the reminder sweep four at a time, the previews three at a time, the Arabic faces
      waited for by Arabic readers alone. Not done, for a block of their own: the god modules'
      splits (M28: `public-pages.ts`, `lib/messages.ts`, `modules/messages.ts`, `BookingSetup`,
      `KitForm`, `OrgScreen`), the sitemap paged past 50,000 addresses, Attention's two
      `taskViews` calls, the friend's tip count, the import cycle.
- [x] Block 6, design, a11y, exports, realtime, the ICS length, the calendar bridges, cards
      that ask: a person's export carries their offer (collections, ordering, ways to be paid),
      what Cai forgot and which waits Cai follows up, an organization's its offer, its checkout
      account, its listings and whom a customer writes for (M13); a card that asks is a request
      until the move that answers it (`ASKING_STATES`, `cardAsks`, `afterCardMove`), and a Pay
      card or an invoice is on its due day in the app's calendar, the feed and Cai's coming-up
      list (`dueCards` beside `cardsAhead`, `card_start_at` for due days, migration 0067) (M14);
      `apps.changed` on a grant, the feed, a listing change or review, `booking.changed` on an
      offer saved, the calendar refreshed on a delete or a hide (M15); the ICS takes the app's
      `minutesOf` (M16); Bookings names the customer's organization, Cai reads the calendar's
      cards, and the three calendar entrances bridge each other (M17). Design and a11y: the
      pointing icons mirrored through `ui/directional`, raw radii onto the tokens (45 sites), the
      choice rows 56 tall, no characters beside reset, recover and forgot, Attention's section
      heads on `SectionTitle`, every labelled View with a role and icon labels on roleful Views,
      axe over the newer screens in all four languages, the listing form driven in E2E; a text
      message takes no client payload (L9). Not done: an E2E of Cai's question on Attention (a
      wait quiet three days needs a clock the E2E can move).
- [x] R76, country-aware UX (PRODUCT-REVIEW R76): one module, `@caime/core/countries`
      (`countryFacts`: currency, the calendar's first day, the weekend, the week worked derived
      from it, the clock, the Arabic variety, the ways people are paid), its data generated by
      `scripts/geo.mjs` from CLDR (`countries-data.ts`, deviations only; `currency-data.ts`, one
      decimals table; `calling-codes.ts` from ITU's list in the script) with the server's zones;
      the four tables folded in (`time.ts`'s regions, `arabic-variety.ts`'s countries, the
      server's `COUNTRY_CURRENCY`, `format.ts`'s exponents). `MeView` and `OrgView` carry
      `weekStart`, `weekend`, `hour12`, `payKinds`; an organization has `timeZone` and `workweek`
      of its own (migration 0068, derived from its country until set in Edit details, moved with
      a country change as a person's week is). Readers: the amounts reader settles "$", "£",
      "ريال", "دينار" by the writer's currency (the sender's on the server, the form's in
      `KitForm`); booking hours start on the host's days worked in the host's own zone; the
      hours line runs in the host's week order; `DayPicker` runs in the person's week and names
      days in their language; the formatting locale carries the country (`withRegion`: the
      clock, the digits and the dates as the country writes them); the agent and Cai are told the
      place, the currency, the week and the clock; the morning brief skips the weekend; a way to
      be paid is offered from the country's common ones; the device's region is the first sign
      at sign-up; a country change offers the country's main zone; a free item's structured data
      names the seller's currency. Not done: reading a local phone number by the calling code,
      plan prices in more than one currency, a date picker's first day on the web (the browser's).
- [x] R77, consistent pickers (PRODUCT-REVIEW R77): one family in `ui/` (`ChoiceChips` with
      `multiple`, `count`, `trailing` and `onClear`; `ChoiceList`; `ChoiceSheet`; `SpherePicker`;
      `DayPicker` on it; `PickerField` + `SearchSheet`; `FieldShell` under every field, the web's
      date and time inputs in the account's `lang`; `Stepper`; `SwitchRow`; a checked `ListRow`'s
      own mark), every picker moved onto it (six chip-rows, four radio-row looks, five panels of
      radios, five `Segmented` form values, eleven switches, the five hand-drawn field shells,
      three sphere pickers, the people picker found by name, a catalogue above eight found by
      name, the slot picker's memo), per-option test ids, arrow keys and one tab stop in every
      group, `pickers.test.ts` failing on a screen's own, the E2E on the rows that now open their
      choice. Not done: `CurrencyField` keeps its chip trigger beside the amount (it already
      opens the finding sheet); `Segmented` for an insights period stays a tablist (a view).
- [x] Docs drift (BRAND.md friends, type rows, radii, five places; CLAUDE.md's page sizes, axe
      languages, auth kicker, setup list; `previewUrl` in `API_ROUTES` and API.md).

## M16 — The whole-product challenge (docs/REVIEW-2026-10-17.md)

The owner asked (2026-10-17) that the product be challenged beyond code: journeys, adoption,
trust, intelligence, reliability, mail, calendar, chat, calls, files, apps, copy and readiness, so
a person or an organization using Caime in full needs no Workspace, Microsoft 365, Slack, WhatsApp
or Signal; and that an integration framework come before more connectors, then governed AI over
all data. Ten read-only slices at `87fc778`; the synthesis, the matrix, the age-assurance design
and the framework are in the review. Blocks in order, each commit through the full gate; a tick
means verified, and anything needing the owner's credentials stays ⛔ until it has them. Every
slice names the unfair advantage it sharpens (REVIEW §14: the relationship as the object, one
identity with the customer side as a conversation, the door link that needs no account, flat
pricing, privacy from the business model, Arabic-first intelligence, governed AI, the compounding
graph) and the number that will show it; one that sharpens none is hygiene and says so.

- [x] A1. The reliability core (2026-10-17): the bus listens again with backoff for as long as
      it's open, destroys the lost client, counts its reconnects and tells the hub, which sends
      every socket `resync` (the client catches up); `/v1/readyz` says the database answers and
      the bus is heard, the container's check is `/v1/healthz` with a ten-minute start period;
      every connection starts with a 30 s statement timeout and a 60 s idle-in-transaction
      timeout and waits ten seconds at most for the pool; a migration runs with no statement
      timeout and a 15 s `lock_timeout`, and a file marked `-- no-transaction` runs outside one
      (`create index concurrently`); an upload's chunk lands in a temp file before the row lock;
      the send transaction's slot check no longer reads calendars under the lock; `x-request-id`
      on every answer and in a 500's details; the backup, audit and provider gauges written to
      `server_settings` and read on every scrape. Verified with `bus.test.ts` (the listener's
      backend terminated, readyz 503 meanwhile, events after), `migrations.test.ts`,
      `health.test.ts`, `files.test.ts`, `calendar-sync.test.ts`, `metrics.test.ts`.
- [x] A2. The job system and the heavy work (2026-10-17): a job out of attempts is dead
      (`jobs.dead_at`, migration 0090), out of the due index (`jobs_due`), counted on
      `caime_jobs_dead`, listed to the operator with its last error and never its payload
      (`GET /v1/admin/jobs`) and retried by hand (`POST /v1/admin/jobs/:id/retry`); a running job
      renews its lock every minute, so a stale lock is a dead worker's, and has a time limit (ten
      minutes, or its kind's own); a periodic task is claimed once per interval across every
      instance (`periodic_runs`, `claimPeriodic`), so `billing.reconcile` (now in the background)
      and the calendar sweep run on one; a backup's copy off the host is streamed, never read
      whole; images are decoded two at a time on an instance (`lib/semaphore.ts`) and never past
      50 megapixels. Verified with `jobs.test.ts` (dead after the last attempt, the time limit,
      the retry, the claim), `metrics.test.ts`, `backup-copy.test.ts` (an unsigned streamed put),
      `files.test.ts`, `migrations.test.ts`.
- [x] A3. Launch floor, the rest (2026-10-17): a message's effects (who is told, the push, the
      suggestions, the webhooks, the mail out) are an outbox — the send writes
      `messages.effects_at` a grace ahead (migration 0091; its partial index built concurrently
      in 0092, the first `-- no-transaction` file), `afterMessage` clears it, and the
      `message.effects` sweep replays what an instance that died never finished, reading the
      words again at the message's own time, ten minutes on after a failure, let go after a day
      and counted (`caime_message_effects_total`); the migrations lint
      (`scripts/migrations-lint.mjs`, `pnpm migrations:lint`, in `check` and CI against
      `origin/production`): a committed migration changed fails, a contraction names the commit
      already in production that stopped reading it (`-- contracts after <sha>`), a backfill of a
      big table is a procedure that commits each batch, an index on one is built concurrently,
      a `-- no-transaction` file holds one statement; the image says which commit it is
      (`CAIME_VERSION` → `/v1/healthz` and `/v1/readyz` `version`), CI builds it with the sha it
      tests, checks the image answers as that sha, publishes it to
      `ghcr.io/h-khalid-h/caime:<sha>` and moves the `production` tag with the branch, and tries
      staging first when its webhook and address exist (the `staging` tag, its webhook, up to ten
      minutes for staging to answer as the commit and be ready, else production stays). Verified
      with `effects-outbox.test.ts` (due a grace ahead, cleared by the fast path, replayed and
      told, left within the grace, let go after a day), `migrations-lint.test.ts` (each rule,
      every big table in the schema, A3's own files), `health.test.ts`, `migrations.test.ts`,
      `messaging.test.ts`, `metrics.test.ts`; the lint against production (3 new, ok).
- [ ] ⛔ A3, the owner's: the `caime` service switched from EasyPanel's own build to the
      published image (Source → Docker image `ghcr.io/h-khalid-h/caime:production`, the deploy
      webhook set; DEPLOY "Running the tested image"), after which `/v1/healthz` on cai.me says the
      commit; a `caime-staging` service on the `staging` tag with `EASYPANEL_STAGING_DEPLOY_WEBHOOK`
      and `STAGING_URL` in GitHub (DEPLOY "Staging"); the restore drill run and timed once the
      bucket exists (`BACKUP_S3_*`); the alert receiver (an uptime check on `/v1/readyz`, a status
      page, `caime_jobs_dead > 0` and `caime_message_effects_total{outcome="dropped"}` rising, and
      the rules in DEPLOY), a Sentry project for the server and the app, log shipping.
- [ ] ⛔ A, the owner's: the support address answered (the `@caime` organization made, `hello@`
      landing in its inbox), the alert receiver's account, the Sentry project, the bucket for
      backups (`BACKUP_S3_*`).
- [x] B1. Safety and trust, the first slice (2026-10-18): the condition of the switch for a parent,
      a school or a clinic's compliance officer rather than an advantage, so its numbers are the
      tests that hold each rule. The address oracle closed as far as one address, one person allows
      (REVIEW §2 H2): writing to an address by email counts every new address against the day
      (twenty) before anything is said of it, and an address that's someone's on Caime is refused
      in words that name nobody and say nothing of how they're found; what still differs (a held
      address refused, an unknown one opened, twenty a day for an adult's account) tells no more
      than sign-up's `email_taken`, and SECURITY says so. The invite rule both ways (H3): an
      adult's link opened by someone under 18 who doesn't know them through someone is refused,
      saying why (a school or a club uses a verified organization's join link, which asks), as a
      minor's link opened by an adult stranger stands as a request. A profile (`GET /people/:id`)
      reads as nobody to anyone new where finding them would: a suspended account (R49), someone
      found no way they allowed (a provisional person by nobody), someone under 18 to an adult
      (R29); whoever is in touch keeps it (a connection, a request either way, a block of theirs
      to undo, a conversation they're both in: `inAConversationTogether`). A minor's
      privacy is clamped whatever is stored or sent (core `clampForMinor`, read by `privacyOf` and
      saved by `PUT /me/privacy`: nothing to everyone, never found by an address, requests from
      shared connections at most), and the audience sheet offers them no Everyone. The read
      receipt's timing: someone who may not see a read hears nothing at its moment; a request
      not answered, or declined, tells its sender nothing (no receipt, no position in the
      conversation, no event when it's declined). The guest's age answer: a guest
      who doesn't say they're 18 or over joins (R85 (3)) and counts as under 18 from then on
      (`anyMinor`), so the meeting takes no more guests and opens no join link. Verified with
      `trust.test.ts` (5), `meeting-guests.test.ts`, `mail.test.ts` (the day's limit hit before a
      held address is refused), core `privacy-safety.test.ts` (the clamp), `invites.test.ts` and
      the full gate.
- [x] B2. What's deleted is gone (2026-10-18), the condition for a clinic's compliance officer (DPA
      §8, erasure on request): a message deleted for everyone runs the one statement a
      disappearance and an erasure run (`eraseMessagesWhere`), so its mail copy's envelope goes
      too (subject, sender address, HTML, signature: the delete left them); the files only those
      messages pointed at go with their bytes once the transaction commits (`dropErasedFiles`,
      `removeStored`; a forward, another album or an avatar keeps its file), for all three; a
      removal or an erasure in a customer conversation takes what the organization's apps were
      sent of those words from their delivery log (`forgetDeliveries`, by the payload's
      conversation through an index built concurrently, migration 0098), leaving the deliveries
      that say a message was deleted or the conversation erased; deliveries are kept no longer
      than the organization's own retention. The export carries a message's mail envelope, the
      busy times read from connected calendars and what Caime wrote into them, a reclaim, and an
      invite link's last four characters only (a file passed on connected whoever held it). The
      privacy page and the DPA draft say each. Verified with `erasure.test.ts` (7), `org-data`,
      `privacy-upkeep`, `account`, `messaging`, `mail`, `files`, `business`, `apps`,
      `dpa-draft`, the migrations lint and the full gate.
- [x] B3. Reports that hold up (2026-10-18), the condition for a school, a parent and a regulator:
      a report keeps what its reporter saw when they made it (`report_evidence`, in the report's
      own transaction: the reported message and up to four before it, each with its sender's name
      then, never a sealed one or one deleted or hidden for the reporter, an imported one marked;
      or the update's words), so it's judged after its sender deletes it, and the review page
      shows it beside the message as it is now; a child's safety is a reason (`child_safety`, in
      every language, with a line to call the emergency number) and is listed first; a closed
      report (`closed_at`) goes with what it held after 180 days, a year for a child's safety. An
      organization suspended (migration 0099, from a report or `PUT /admin/orgs/:handle/suspension`)
      answers as nobody's to anyone new (page, handle, id, search, sitemap; `409 org_suspended` for
      a new conversation), vouches for nobody, is written in by nobody, posts and tells no update,
      its agent stays quiet and its apps' tokens answer 401; its customers and team keep what they
      have to read, its team sees why, and lifting it brings everything back. A date of birth is
      corrected by the operator (`PUT /admin/people/:handle/birth-date`): a real day, never under
      the age where the person lives, audited without the date. Verified with `reports.test.ts`
      (5), `moderation`, `business`, `apps`, `updates`, `orgs`, `privacy-upkeep`, `columns`, the
      migrations lint and the full gate.
- [x] B4. Asked before being added (2026-10-18), the condition WhatsApp and Telegram already meet:
      "Who can add you" (`privacy.groupAdds`: your connections, or nobody: they invite you), and
      under 18 asked first wherever a group or a space holds people they're not connected with
      (R29, R97 (3)); an invitation (`place_invites`, migration 0100, seven days, one pending per
      person and place) shows the place, its kind, its size and who asked, waits on Attention
      (riding `GET /attention`, no request of its own; its notification opens there), and lets
      them in through `addToGroup` or `addToSpace` with the invitation claimed under the place's
      lock and its inviter still running it; a decline tells nobody; someone blocked either way is
      answered as invited and never reached (a block now stops being added, as it should have);
      an organization's own team goes straight into its spaces; where nobody under 18 may be at
      all (a meeting's guests, a link open to anyone) one is refused, never invited (an invitation
      they could never accept). Message requests: twenty new ones
      a day (`REQUESTS_PER_DAY`, `429 requests_today`; one already started reopens freely), and a
      request's photos come blurred until tapped (under 18, until accepted). Verified with
      `place-invites.test.ts` (7), the catalogs in every language and the full gate.
- [x] B5. Keys apart from the data (2026-10-18), the condition of a clinic's DPA and of the copy
      off the host: `VAULT_KEY` from the environment seals connected accounts' refresh tokens, each
      naming its key by id (`connected_accounts.refresh_kid`, migration 0101); what the database's
      own key sealed moves to it as it's used, by a pass queued at start and by the daily
      `vault.reseal`, which then deletes the database's key, so no later dump holds what opens the
      tokens; `VAULT_KEY_PREVIOUS` replaces a key the same way; `BACKUP_KEY` encrypts each checked
      dump (AES-256-GCM, streamed, the key's id in its header, decrypted through once before it's
      kept or copied; `dist/decrypt-backup.js` turns one back); both checked as 32 bytes at start
      and by `check-env`; `/metrics` says where each stands (`caime_vault_key_external`,
      `caime_vault_database_key`, `caime_vault_sealed`, `caime_backup_encrypted`). Verified with
      `vault-keys.test.ts` (5), `backup.test.ts` and `backup-copy.test.ts` (an encrypted dump
      restored by `pg_restore`; another key, a changed or cut file refused, leaving nothing),
      `connected-accounts.test.ts` run under `VAULT_KEY`, the built tool decrypting a file byte for
      byte, and the full gate. ⛔ The owner sets `VAULT_KEY` and `BACKUP_KEY` in EasyPanel, each kept
      in a password manager too (DEPLOY.md, "Keys apart from the data"); until then the database
      holds its key and dumps are plain.
- [x] B6. Notice and action for everyone (2026-10-18), the DSA's Art. 16, 17 and 20 and the first
      thing a regulator or a parent checks: anyone reports a person's or an organization's page, an
      item or a collection from the page itself (a form folded at its end, no script, no account:
      `POST /v1/public/report` in its own plugin, five an hour from one network and three a day from
      one address, the page named by its own fields, a few words, a name and an address unless it's
      about a child's safety, a statement of good faith), kept as a report with whom to tell
      (migration 0102), who is mailed a receipt and, once it's closed, the decision; a suspension
      says why (ten characters at least; from a report, what it was for); a suspended sign-in, after
      the password or the passkey alone, answers with that reason and a claim
      (`serverKey('suspension.claim')`, thirty minutes) that opens an appeal (one open at a time)
      and the person's export, never a session; the operator lifts or upholds on `/admin/reports`
      or `POST /admin/appeals/:id`, the lift and the decision in one transaction, the person mailed
      with the note; a decided appeal is kept 180 days and is in the export; `/metrics` says what
      waits on the operator (`caime_moderation_waiting`, `caime_moderation_oldest_seconds`, a
      child's safety apart) and counts reports and appeals, with two alerts in DEPLOY. The reasons
      are one list in core (`REPORT_REASON_CHOICES`) for the app's sheet and the page's form.
      Verified with `visitor-reports.test.ts` (8), `reports.test.ts`, `metrics.test.ts`, the
      catalogs in every language, the E2E `safety.spec.ts` (a visitor on a phone reports an
      organization's page and gets both mails from the SMTP stand-in; a suspended person signs in,
      reads why, appeals, downloads their data, and signs in once it's lifted) and the full gate.
- [x] B7. Age assurance, phase 1 (2026-10-18), REVIEW §3: a check of someone's age as Caime keeps
      it (`users.age_check`, its method, when, and `age_minor_until`; `age_checks` per check, a
      year; migration 0103), by core's rules (`nextAgeStanding`: a document wins, under 18 by a
      check holds a year whatever was declared, a face retried that reads older lifts nothing),
      read by every under-18 rule (`minorOf`, compiler-held at each of its readers, and people
      search's SQL); the provider behind one interface (`lib/age-provider.ts`, Agemin first, from
      its published API: its page `verify.agemin.com/start/<asset>` with a reference and the three
      return addresses, the lookup by reference with the secret key, the RS256 notice in
      `X-Bynn-Signature` whose signed copy alone is read, a health probe); `POST /me/age-check`,
      `GET /age/return` (asks the provider, never the address), `POST /age/webhook/agemin`, applied
      once whichever lands first; the triggers (`AGE_CHECK_TRIGGERS`: starting an organization,
      pricing an offer or taking cards, a first message request or mail to an outside address),
      `403 age_check_needed` only where a provider is set and never for someone under 18 by their
      own date of birth; the app's sheet (opened by any refused call) and Settings · Security's
      row, on the web and on phones (the system's sign-in sheet back to `caime://age-checked`);
      the processors list, the privacy page (said only where a provider is set), the DPA, the
      export. Verified with `age.test.ts` (11: no provider changes nothing, the config refused
      without keys; the organization asked for, the provider's page carrying nothing but a
      reference, the notice applied once and audited; the return read back by reference with the
      key, landing on the web or the phone; a forged notice and an unknown reference; under 18 for
      a year, a retried face, a document; a spoof; the hold lapsing and the sweep; three a day;
      the export; the triggers and where they're off), `about.test.ts`, `dpa-draft.test.ts`, the
      E2E `age-check.spec.ts` (from Settings to the stand-in's page and back, 18 or over and
      under), the catalogs in every language and the full gate. ⛔ The owner chooses the provider
      and signs its terms and DPA (retention, region, the NIST result), then sets `AGE_PROVIDER`
      and its keys and the webhook in its dashboard (DEPLOY, "Age checks"); until then nobody is
      asked. Phase 2: a country's law demanding a level, the report that names an age, minors
      searching for minors, "Age checked" as a privacy field.
- [ ] ⛔ B, the owner's: an age-assurance provider (Agemin or another) with retention terms, a DPA
      and the NIST result; the penetration test.
- [x] C1a. Booking before an account (2026-10-17): an organization's bookable public item's page
      lists the week's open times by the host's day (`publicSlotsFor`: `openSlotsFor` with the
      public booker, seven days, sixteen a day, paged by `?from=`, nothing reads a calendar under
      a visitor's view), with a script-free form (the time, a name, an address, "I'm 18 or over")
      that posts to `POST /v1/public/book` (its own form parser, anonymous, limited by address and
      ip): a known account's address is sent to sign in and never mailed, no mailer is said so,
      else the provisional person (`personForAddress`, R93) gets the six-digit code
      (`lib/email-codes.ts`, now shared with sign-up's confirmation) and the choice rides back to
      the page as a sealed fifteen-minute claim (`?code=`); `POST /v1/public/book/confirm` spends
      the code, starts the customer conversation and posts the appointment card as the provisional
      person through `sendMessage` with the catalog booking (a taken time said on the page), then
      `?booked=` says the organization confirms in the conversation and that joining with the same
      address claims it. Every step is the page itself (`PublicItemPage.booking`,
      `visitorBookingState`); a refresh repeats nothing. Verified with `public-booking.test.ts`
      (the week's times and the lead, the code by the memory mailer, the card as a request from
      the provisional customer with nothing of the team on any page, the time held after, the
      claim sealed and run out, a taken time, a known account, the age box, no mailer),
      `public-pages.test.ts`, `server-i18n.test.ts`, and the E2E `public-booking.spec.ts` (a
      visitor books with the SMTP stand-in's code; the team finds the request). Live, production has
      the mailer it needs (Postmark's SMTP; an instance without one says "join to book").
      Sharpens advantage 3 (the door link that needs no account) and the customer side of 2
      (REVIEW §14); its numbers, bookings per door link and bookers who join within thirty days,
      are counted from C1b on (`caime_public_bookings_total`, the booker's `claimed_at`).
- [x] C1b. The booker told, and the claim proven (2026-10-18): signing up with an address that
      has a provisional person's history (mail, a meeting's guest, a booking made before an
      account) claims it only with the code sent to that address (B's first item, pulled forward
      because C1a made that history real: `email_code_needed`, `emailCode`, `spendEmailCode`; the
      claim sets `email_verified_at` and `users.claimed_at`, migration 0093; without a mailer
      `email_unprovable`, never a claim), and the app's sign-up shows the code field under the
      address when asked; a provisional booker hears by mail when the team confirms or cancels
      (`mailProvisionalBooker` from `afterCardMove`: the time on the clinic's clock, an ICS
      invitation or cancellation under the appointment's event id, the link that claims the
      address), a customer with an account only in Caime; the page offers no form where this
      Caime can't send mail; advantage 3's numbers are counted (`caime_public_bookings_total` by
      outcome; product metrics' `growth.door`: bookings made this way, and bookers who joined within
      thirty days). Verified with `public-booking.test.ts` (the mail and its event on confirm and
      cancel, none for an account, the counter, the proven claim and its refusals, the door's
      numbers a month on, no form without a mailer), `mail.test.ts` (the mail claim now proven),
      `product-metrics.test.ts`, `public-pages.test.ts`, and the E2E `public-booking.spec.ts` (the
      team confirms, the booker's mail arrives, the booker signs up in the browser, is asked the
      code, and the booking is in the new account). Live through production's mailer (Postmark).
- [x] C1c. The day before, and a professional's own page (2026-10-18): advantage 3 says "a
      professional's one link shows times, books, later reminds", and now it does both. A confirmed
      booking whose customer booked before an account is recalled by mail the day before
      (`booking.remind` at start less 24 hours, queued only when that is twelve hours or more after
      the confirmation, so one confirmed within a day and a half is its own reminder; its payload
      ids alone, the card read again when it runs, silent once moved, cancelled or claimed; counted
      as `reminded`). A person's public item books from their page the same way as an
      organization's (`VisitorHost`, `visitorMayBook`: an adult on Caime who takes message requests
      from everyone, the rule a stranger on Caime meets; R29: never a minor): the booking is a
      message request in their one-to-one that holds the time while it waits, an unanswered one
      refuses a second (`waiting`), and agreeing to a card that came as a request answers it (the
      kit move route), as a reply does; the booker hears by mail when the person confirms or
      cancels, under the person's name. Verified with `public-booking.test.ts` (the reminder queued
      a day ahead and sent once, none after a cancel or for a confirmation 26 hours out; a
      person's page, its form, the request in their inbox, the confirm answering it, the mail; one
      request at a time; no form for someone who takes no requests; never a minor), and the E2E
      `public-booking.spec.ts` (a visitor books Lina's lesson from her page, Lina confirms it on
      the card in the app, the request banner goes and the visitor's confirmation arrives). Live
      through production's mailer (Postmark).
- [x] C1d. A message before an account at an organization's door (2026-10-18): its page, and the
      door's link and QR (`?write`, where the form leads the page: three fields on a link
      arrival), take a name, an address and the message (up to 1,000 characters; "I'm 18 or over"
      only where the organization hasn't proved who it is, R29). The address proves itself by the
      six-digit code (`sendEmailCode`, whose mail now says that without it nothing is booked or
      sent), what was written riding between the steps as a sealed claim
      (`serverKey('public.write')`, fifteen minutes; a code spent by tries hands it back to the
      form), and the message lands in the Business inbox as the provisional person's
      (`startCustomerConversation`, `sendMessage`, its effects run: the team told, the agent
      asked), twice being once (a `public-write:` client id; a claim posted again is answered as
      written). The team's answer reaches the visitor by mail from the organization's address
      where Caime Mail is on, threaded on what they wrote and saying how to answer, and their reply
      comes back into the same conversation; the page says so, or, without Caime Mail, that
      joining with the address shows it. Joining with the address (by its code, §2 H1) makes the
      conversation theirs, and onboarding comes back through the door into it. An account's
      address is sent to sign in, never mailed; without a mailer the page offers sign-up as
      before. The daily sweep leaves a provisional person in no conversation alone for a day, so
      it never takes a visitor from under their code (booking's too). Counted on
      `caime_public_writes_total{outcome}` and `growth.door.written`, whose joined share now counts
      whoever first came through the door either way. Verified with `public-write.test.ts` (9: the
      page and the door's order, the code, the inbox, the team told, twice once, the answer by
      mail and the reply back, an account refused unmailed, the age where asked, a code spent by
      tries, a claim run out, no mailer, no Caime Mail, the counts, the claim by sign-up), the E2E
      `public-write.spec.ts` (a visitor on a phone writes from the door with the code from the
      mail stand-in, 0.5 s of server time to the message; the team answers in the app and the mail
      goes out from the organization's address) and `door.spec.ts` (the funnel: the door, the
      message without an account, joining with the same address, onboarding into the
      conversation, which holds the page's message, and writing on from the app). Not built: a
      phone number proven by WhatsApp code as the address, since nothing could answer it (Meta
      lets a business send only approved templates to a phone that hasn't written to its own
      WhatsApp number within a day), so a visitor by phone would hear nothing back; it waits for an
      organization's own WhatsApp number as a connector (block G).
- [x] C2a. The business front door, first part (2026-10-18): days a host is closed (holidays, a
      week away) are kept with the hours (`BookingHours.closed`, `from`/`to` on its clock, a note,
      fifty at most) and skipped by core `openSlots` at every branch and for every night of a stay
      (`closedOn`), so neither the page nor the app nor the agent offers a time on one and a
      booking that names one is refused `slot_taken`; the setup lists them and edits them in a
      sheet ("Add closed days"). The door carries the way to book beside it (`OrgDoorView.book`:
      the one item a visitor may book from a page, else the organization's page listing them, with
      its own code to print). "Start free" on the page for organizations goes to sign-up with
      `?link=/orgs/new`, and onboarding treats it as a linked arrival ("Start your organization"),
      so a new owner lands on starting theirs. Sharpens advantage 3 (the Book link and its code
      beside the door, and a clinic's holidays honoured) and adoption on the way in (review §1
      H2, H4). Verified with core `booking.test.ts` (a closed day and a stay over one), the server's
      `booking.test.ts` (no time, a refused booking, a backwards closure refused), `door.test.ts`
      (none, one item's page, the organization's page, none again), `public-pages.test.ts`, and
      the E2E `front-door.spec.ts` (closed days added in the setup leave the item page without
      times that day; the door shows the Book link and code; Start free signs a new owner up and
      lands them on `/orgs/new`).
- [x] C3a. Team invites by link and by email (2026-10-18, review §1 H3: staff couldn't be
      invited, only added once connected): an organization's owner or admins make a link to share,
      or send one to an address (`POST /orgs/:id/invites`; an admin only from the owner; fifty open
      at once; `TEAM_INVITE_DAYS`, fourteen), list and take them back (`GET`, `DELETE
      …/invites/:id`), from the team's Add sheet (`TeamInvites.tsx`, above the people they're
      connected with). The token is shown once and kept as its hash (`org_invites`, migration
      0094), masked in the log; whoever has a link opens `/t/<token>` (a visitor's page from the
      page parts: whose team, who asks, the role, Join or Sign in, both carrying the link), and
      signed in, the accept screen (`t/[token]`) asks before joining, since the team's customer
      conversations come with it; someone who signed up through it joins in one tap on
      onboarding's last step and lands in the team's Business inbox. One sent to an address is for
      whoever proves it (the sign-in address once confirmed, or one added and proven, R91; anyone
      else is told it's for another address, never which) and is spent by its use; a link counts
      its uses until it runs out. Everyone joins through `seatOnTeam` (`lib/orgs.ts`, which the
      members route uses too): under the organization's row, so two at once never pass the plan's
      room together and a closed one takes nobody; the team hears it (`business.updated` without a
      thread refreshes its page live), and whoever invited is told. Invites are in the
      organization's export and go when it's cleared; spent ones are swept after
      `KEPT_DAYS.spentInvites`, as invite links are (the privacy page says so). Sharpens
      advantages 2 and 4 (a clinic brings its whole team, each on their own one identity, at one
      price) and adoption (review §1 H3). Verified with `team-invites.test.ts` (made, listed
      without the token, the hash alone kept; the visitor's page; opened and accepted, the
      customer's earlier conversation in the new member's inbox, twice is once, the use counted,
      the inviter told, the audit naming the invite; taken back, run out and swept; who may make
      and for whom, admins only from the owner, never under 18, the plan's room with nothing spent
      on a refusal; an address mailed once, refused to anyone else and to the address's owner until
      confirmed, accepted after, spent; an address proven later; no mailer, no sending but links
      still; a closed organization's invites dead, in its export, gone when it's cleared),
      `log.test.ts`, `phoneBar.test.ts`, and the E2E `team-invites.spec.ts` (the owner makes a
      link in the Add sheet; someone new reads the page without the app, signs up through it,
      joins in one tap on onboarding and lands in the Business inbox; the owner's team list shows
      them without a reload). Production mails invites through Postmark; links work on an
      instance without a mailer too.
- [x] C2b. The front door's first steps, the rest (2026-10-18, review §1 H2, H4): someone who
      signs up directly sets up their organization from onboarding's last step ("Set up my
      organization", beside finding people), as whoever came from the page for organizations
      does; and setting one up is a checklist that moves past DNS (`setupSteps`: bookable hours,
      the rest of the team, the domain verified, an AI agent that answers first, each done or
      not), so the page's "Set up" row says the first one still to take and a clinic without a
      domain is never stuck before it lets customers in. The setup screen lists them at its top
      ("Getting set up"); a tap goes to the step's section, and the team's opens C3a's invites
      there. Sharpens adoption on the way in for advantages 2 and 3 (an owner reaches hours, the
      Book link and the team without a domain). Verified with `setupSteps.test.ts` (the order, the
      next line at each stage, the team counted by its people) and the E2E: `front-door.spec.ts`
      (with hours set, the page says "Next: invite your team"; the checklist shows hours done and
      the team to do, and its row opens the invites; a direct sign-up reaches `/orgs/new` from
      onboarding) and `around-the-conversation.spec.ts` (a new organization's row says "Next: set
      bookable hours", verified or not).
- [x] C3c. A guest by link, and a page for an invite that isn't open (2026-10-18, review §1 H6
      and M): meeting guests were invited by mail alone, and the organizer never had the link to
      send, for someone better reached on WhatsApp or wherever an instance has no mailer. Now the
      guest sheet makes a link
      for a guest named by the inviter ("Make a link instead"), shown once with Copy and Share, to
      send on WhatsApp or anywhere; the guest is a provisional person of their own with no
      address (`LINK_GUEST_DOMAIN`, `guest.invalid`), whose only conversation is the meeting's
      space, so a link someone was handed never stands for anyone's address or what was written
      to it (a guest session reads whatever its provisional person is in, which is why the
      address-bound link stays mail-only). The same name asked again gets that guest a new link
      and ends the last; the rules any guest keeps hold (an adult inviter, nobody under 18 in the
      meeting, eight at most); nothing mails that domain and `personForAddress` answers nobody for
      it. A dead invite link (`/i/…`, `/t/…`) says "This invite isn't open" and to ask for a new
      one, never "Nobody by that handle". Verified with `meeting-guest-links.test.ts` (with no
      mailer: by address refused, by link made; the guest at no one's address in the space alone;
      the link reads and joins, the space opens and the conversation it was agreed in doesn't;
      asked again, a new link and the last ended, another name another guest; a name needed; never
      with someone under 18 in it or by them, nothing made; no one's address), `invites.test.ts`
      and `team-invites.test.ts` (the dead link's page), and the E2E `meetings.spec.ts` (Ana makes
      Lina's link from the card, the meeting moves to its space, Lina opens the link in a fresh
      browser, sees the name Ana gave, joins and is in the meeting). Sharpens advantage 3's way in
      for meetings (no account, no mail needed) and adoption where WhatsApp carries invitations.
- [x] C3d. Invite-first sharing, WhatsApp first where no contacts can be read, and the iPhone
      card (2026-10-18, review §1 M and H7): onboarding's "Share your link" sent the bare
      `/@handle`, which only finds someone; it now sends the person's general invite link
      (`generalInviteUrl`, their live link with no relationship or note, else one made then), read
      as the step shows since a browser shares only inside the tap, so whoever opens it is
      connected (or asks, R29) at once; the contacts sheet sends the same link, so a person has one
      to take back, never one per tap. Where the browser reads no contacts (a desktop's, an
      iPhone's: no picker), the sheet opens with "Invite on WhatsApp" and, on a phone, "Text an
      invite" (core `openInviteWays`: WhatsApp asks whom, a message with nobody in it yet) above
      the accounts and the file. An iPhone's or iPad's browser tab, which Safari never notifies,
      gets a card on Attention: Share, then Add to Home Screen, then open Caime from there
      (`homeScreenHint`: an Apple device in a tab without push, iOS 16.4 or later, not told
      before; "Not now" remembered on that browser), loaded only on such a tab, so the startup
      chunk stays 448.4 KB. Verified with `homeScreen.test.ts` (iPhone Safari and Chrome, an iPad
      that says it's a Mac; never from the Home Screen, with push, before 16.4, on a Mac or
      Android; told once), `contact-sources.test.ts` (the open ways' links, with and without a
      messages app) and the E2E `first-steps.spec.ts` (onboarding makes the link as the step
      shows, Share copies it, twice is the same link and the account has one; the contacts sheet
      offers WhatsApp first with that link and no text on a desktop; whoever accepts it is
      connected; a desktop gets no card; on an iPhone the card shows, "Not now" keeps it gone
      after a reload, and the sheet offers WhatsApp and a text). The condition of the switch
      (making it cheap), not an advantage: its number is the connections made through invite
      links in a new person's first week.
- [x] C3e. Join links for groups and spaces (2026-10-18, review §1 H5: a group couldn't be
      brought over, since a group or a space took only its members' connections, one by one). Now
      a group's or a space's owner or admins make a link from its Add sheet (`g_…`, shown once,
      kept as its hash, open thirty days, ten open at most) to post where its people already are,
      and a group may start with nobody: "Create, then invite with a link" opens it on its link.
      Whoever opens `/g/<token>` without an account reads a page without the app (the place, its
      kind, how many are in it, who asks; never who is in it, nothing said there), signs up
      through it and joins in one tap on onboarding's last step; signed in, the link's screen asks
      before joining. They land in the group, or the space's General, reading what was said
      before (both pages say so), and its people see "… joined". A link leads only into a
      standard group of its own (never a topic, a space's conversation, a private group or a
      meeting's group, core `joinLinkFits`) or an open space, stops at 256 people, and dies when
      it runs out, is taken back, or its maker stops running the place. Under 18 (R29), whoever
      comes in by a link is a stranger to the people there, as a meeting's guest is: only adults
      make or use one, none where someone under 18 is, and while one is open nobody under 18 is
      added by any path; blocks either way with its maker, or by anyone in it, keep someone out;
      every refusal reads the same whatever the reason. Anyone joins a group only through
      `addToGroup` and a space through `addToSpace`, each under the place's row with what vouches
      for them (the seat that adds, or the link claimed then), so two taps count one join. An
      account made for the link is its maker's to have brought (`invited_by`), counted with links
      made and joins in `growth.joinLinks` and `caime_join_links_total`. Verified with
      `join-links.test.ts` (18: who makes, lists and takes back; the hash alone; the visitor page
      with no names, no history and no script; a stranger in with one tap, into its topics and
      its history, twice once; an older account brought by no one; taken back, run out and swept,
      the maker demoted; never a private group, a topic, a space's conversation or a meeting's
      group; ten open and the room; a group with nobody yet; under 18 in the same words with
      nothing written, both add routes refusing a minor while a link is open, no link where one
      is; three kinds of block; a space into General as a member; an organization's space in its
      name, archived dead; the export without tokens or names; the product metrics' three
      deltas; the page 7 queries and a join 40, the same with two in it or twenty-three),
      `permissions.test.ts`, `log.test.ts`, and the E2E `join-links.spec.ts` (an empty group opens
      on its link; a fresh browser reads the page without the app, signs up, joins in one tap and
      reads what was said before while the owner sees them come in; a space's link from its Add
      sheet, opened signed in, asks first and lands in General) and `a11y.spec.ts` (the page, in
      English and Arabic). The link panel and the accept screen load apart; the startup chunk is
      448.7 KB (448.4 before). The condition of the switch (moving a group over costs one message),
      not an advantage: its number is `growth.joinLinks.newPeople`, the accounts made for a link
      that joined through it. Not built: approval before joining (the review's optional half,
      and R97 (3)'s way to let someone under 18 in on an adult's acceptance: until it comes, a
      link refuses them, stricter than R97 asks), and the importer's groups and iPhone `.zip`
      (H5's other half).
- [x] C3b. Onto a verified organization's team by an address at its domain (2026-10-18, review
      §1 H3's last part: staff joined only by an invite each). Its owner or an admin turns it on
      from the setup screen's verified card ("Anyone with a confirmed address at niledental.com
      may join the team"); from then, anyone with a confirmed address there sees "Join Nile
      Dental's team" on its page and is in its Business inbox with one tap, as a team member,
      through the one way onto a team (`seatOnTeam`: the plan's room, threads joined, the team
      told). An address counts once proven: the sign-in once its code came back, or one added and
      proved (R91); a sign-in still waiting for its code is asked to confirm first, and whoever
      proves an address there hears they may join, the notice opening the page. Teams stay for
      adults (R29); someone the team took off (`org_members.removed_at`, never set by leaving)
      comes back only by a manager or an invite, which clears it; a domain claimed and never
      proven, the switch off or the domain let go lets nobody in. The audit names the join
      `byDomain`, never the address, its managers hear who came in, and
      `caime_team_joins_total{by}` counts joins by invite and by domain. Verified with
      `domain-join.test.ts` (9: off until a manager turns it on, an agent can't; one tap as a team
      member, twice once, the owner told, the audit without the address, the counter; a sign-in
      waiting for its code asked first, then told and offered; an added address only once
      proven; under 18 refused, a lookalike domain not the domain; removed stays off until an
      invite, leaving isn't removal; off, or the domain let go, lets nobody in; the plan's room;
      an unverified domain takes nobody; the page three reads more for someone not on the team,
      only where it takes people) and the E2E `domain-join.spec.ts` (the owner turns it
      on from the setup screen; someone new signs up with an address there, confirms its code,
      finds the card on the page and lands in the inbox, on the team as an agent). Advantages 2
      and 4: the whole team on one identity each at one price, without an invite per person; the
      number is joins by domain (`caime_team_joins_total{by="domain"}`, the audit's `byDomain`).
- [x] C3f. "Keep this" on a meeting guest's page (2026-10-18, review §1 M: the guest page offered
      only Sign out). The guest's meeting page offers "Keep this meeting"; one tap takes them to
      sign-up already knowing their name (and, for a guest invited by address, the address), titled
      "Keep “Budget review”", and the account they make is the guest they were (the same row), so the
      meeting, its people and what was said there stay theirs; onboarding's last step opens it
      ("Open “Budget review”": a pending conversation link is now a linked arrival). A guest by
      address keeps it as anyone claims an address, by the code sent there (§2 H1); a guest by link,
      who has no address and nothing behind them but the meeting, is handed a claim naming them
      (sealed with its own server key, half an hour), which sign-up takes in place of a code and
      which is spent once the guest is a person. Under 18 nobody keeps one (a meeting's guests are
      strangers to each other, R29), and an address with messages of its own is never folded into a
      guest's (refused as taken; keep it with another address). Found on the way and closed for
      every claim, not only a kept meeting: a provisional person's sessions (a guest's, for one
      meeting) lived on as the claimed account's, on whatever device had taken the link, a forwarded
      invitation's included; now every one ends as the account is made, and a claim that finds its
      row already claimed makes no session. Verified with `guest-keep.test.ts` (6: a claim only for a
      guest by link, the address for one by address, nothing for a person or nobody; kept, the same
      row, the address unconfirmed and a code mailed, the guest's session ended, what was said there
      read and the space written in as a person, the audit's `keptMeeting`, the link then asking to
      sign in, the claim spent; a changed or run-out claim refused and under 18 refused on the birth
      date; an address with history or an account refused; a guest by address keeping it by the code,
      their session ended; `growth.guests`), `paths.test.ts` (`conversationIn`) and the E2E
      `meetings.spec.ts` (Gus joins by link, keeps it, signs up already named, lands in the meeting
      from onboarding reading what Ana said, the same person, nobody twice). The startup chunk 448.8
      KB (448.7 before). The condition (meeting guests without accounts), not an advantage: its number
      is `growth.guests` (guests who came in by their link, and of guests, who made it their account).
      Not built: keeping a guest's meeting with an address that already has messages waiting (its
      history and the guest's in one account; refused for now).
- [x] C3g. WhatsApp's groups and an iPhone's `.zip` into the importer (2026-10-18, review §1
      H5's other half: a group came over one message at a time, and the `.zip` an iPhone exports
      couldn't be picked). The importer takes the `.zip` as it is, unzipped on the device (fflate
      0.8.3, pinned, the release that fixed GHSA-px8p-9vwx-vf98; loaded only when a zip is picked,
      inflating the text alone, never the photos beside it), and a group's export comes into a
      group its owner or an admin runs, as a topic everyone in the group reads: each name in it is
      one of the group's people where they say so (matched by name, changed on one row each), or
      stays a name on the line of whoever brought it (`payload.imported.author`, drawn and read
      out as that name's, never as theirs). WhatsApp's own lines in an iPhone's export, written
      under the group's name (or the other person's, in a one-to-one) with a mark before their
      words, stay behind: found on the way, a one-to-one from an iPhone brought its encryption
      notice over as the other person's first message. A topic made for an import is always new (a
      group's topic of the same name is otherwise the one topic, and the past would land in the
      middle of what's said there: refused, to be named otherwise), and its lines follow whatever
      the topic holds, under its row's lock. Never a private group (its words are sealed for its
      people's devices), a topic, a space's conversation, or a group the importer doesn't run; a
      name is taken only as someone in the group now. Nothing is notified, suggested or read from
      the past, as in R45; and a one-to-one reached by email alone is no longer offered an import
      the server refuses (connections only, as it always was). Verified with `import.test.ts` (4 more: a topic of the group with
      everyone in it, names taken or kept, nobody told; refused for a member who doesn't run it, a
      name taken as someone outside it, a line naming no name, a one-to-one, a stranger; the
      product metrics' `growth.imports`; a second export under a topic's name refused, the first
      left as it was, and one named otherwise landing apart), `whatsapp.test.ts` (an iPhone's own
      lines, a group's and a one-to-one's), `chatFile.test.ts` (the zip's `_chat.txt`, another
      text file, nothing, bytes that aren't a zip), `rows.test.ts` (a kept name's lines as that
      name's run) and the E2E `whatsapp-group.spec.ts` (an iPhone's zip into a group: five
      messages from four names, the group's own lines left out, Omar matched, Kim chosen, Uncle
      Sami kept as his name, each line read out as its writer's for Noor and for Kim). The startup
      chunk 448.8 KB (unchanged); the conversation route's chunk 84.3 KB (83.1 before) and the
      unzipper 12.3 KB, loaded with a zip. The condition of the switch (a group's history comes
      with it), not an advantage: its number is `growth.imports` (chats and groups brought over,
      and their lines).
- [x] C3h. A join link that asks (2026-10-18, review §1 H5's optional half and R97 (3): a link let
      in whoever opened it, and nobody under 18 at all). Making a link, its owner or an admin may
      turn on "Each person asks first": whoever opens it then asks (the visitor's page, the link's
      screen and onboarding's one tap all say "Ask to join"), the place's owner and admins are told
      once ("Rana asks to join “Choir”"), and they let each person in, or not, from the group's
      people or the space's people ("Asking to join · 1", Let in, Not now), live on every device
      (`join.asked`). Let in, they come in through the one way into each place (`addToGroup`,
      `addToSpace`), the ask claimed under the place's lock (two answers at once let them in
      once), and are told "You’re in"; declined, they aren't told by a notice, the link's screen
      says it wasn't accepted and that link takes no ask from them again (a new link may); an ask
      is taken back while it waits. Under 18 (R29): a link that asks lets nobody in by itself, so
      it may stand where someone under 18 is (the panel offers only that kind there), and someone
      under 18 may ask through one only where the place is run for them by someone they may trust,
      its organization verified or its owner an adult connection of theirs (R98 (3)); whoever
      answers is an adult who runs it, and an open link beside it still keeps them out. Asks are
      in the asker's export (never who answered) and swept, once answered, after
      `KEPT_DAYS.spentInvites`; the privacy page says both. Verified with `join-requests.test.ts`
      (14: made and said; an ask, not a join, told once, twice is once; answered only by whoever
      runs it; let in once under two answers at once, told, the link then theirs; declined
      untold and not again by that link, a new link a new ask; taken back; a block after asking
      keeps them out; a place with someone
      under 18 takes only a link that asks; under 18 asks only where an adult connection runs it,
      or a verified organization's space; an open link beside it keeps them out; an admin under 18
      can't answer; the export; the sweep), `join-links.test.ts` (the new shapes), `log.test.ts`,
      `sw.test.ts` (a space's notice opens the space) and the E2E `join-asks.spec.ts` (a group
      made with a link that asks; someone new reads "then ask" on the page, signs up, asks in one
      tap from onboarding and sees it wait; the owner sees the ask among the group's people without
      a reload, lets them in, and the link opens the group for them). The asks list loads apart,
      where it's shown. The condition of the switch (a community moves over without strangers
      walking in, and a school or a family can use links at all), not an advantage: its number is
      `growth.joinLinks.asked` beside `joined`.
- [x] C2–C3. The rest of the front door: all built, C1d (a message before an account) the last.
- [x] D. Performance and integrity: the aliased `selectAll` guard and its eleven sites; people
      lists through `personViewsFor` with a scale ceiling; `participants.last_sent_seq` for the
      inbox; a large-group mode and one transcript view; a `defer` semaphore and gauge; bus payload
      chunking; the user foreign-key indexes; one `cardEnd`, one `truncate`, `escapeLike`
      everywhere, one `visibleMessages`, one transcript builder, one `publicUrl`; `apply.ts` on
      `qk` with a unit test and `patchCache` everywhere; `toLocaleLowerCase`, the 98 placeholders
      renamed, numbers through core's formatter; the two OAuth pipelines merged; identities
      decided.
- [x] D1. Whole rows only where they're the point; lists that cost the same at any size; the
      inbox without a walk back (2026-10-18, review §4 H6, H7, H8): the guard is
      `select-all.test.ts`, read from the source's syntax tree, so an alias, a join or a `where`
      before `selectAll`, and a `returningAll`, hide nothing; a whole person or organization
      only in the functions it names (an export, `orgById`, the public pages, an item's photo, a
      profile), a whole message nowhere. It found seventeen the old one passed: the inbox
      carried both search vectors of every last message and the Business inbox of every
      thread's; every open of a conversation each member's catalog; the organizations' lists,
      their search, the following list and a profile's organizations whole rows; the invite
      page its maker's catalog; five updates returned their whole message or person. Each now
      names its columns (`columnsOf(alias, LIST)`, `ORG_REF_COLUMNS` for an `orgRef`). Connections, requests, people
      search and the organizations' lists draw people through `personViewsFor` and their
      standing through `betweenMany`, with team sizes and seats in one query each: measured on
      the same test, 274 queries for 30 connections became 12 (and 12 for 3), requests 272 → 10,
      a search's 364 → 15, the organizations' 32 → 3, held equal for 3 and 30 under a ceiling
      (`people-scale.test.ts`). Where someone last wrote is `participants.last_sent_seq`
      (migration 0104, filled by a procedure a thousand rows a batch from a no-transaction file,
      0105), written with the read mark by a message, a system line and an import; the inbox's
      "asked since I last wrote" is one row a conversation by `distinct on`, decided in SQL, and
      `sendMessage`'s count of what a reply answered reads the column too. Verified:
      `select-all.test.ts`, `people-scale.test.ts`, `last-sent.test.ts` (each path, the inbox,
      the fill across three batches leaving a higher mark alone), `inbox-scale.test.ts` (a
      5,000-message conversation never written in, needing me, the inbox at 17 queries for 301
      conversations), `import.test.ts`, and the full gate. The fill runs once more with D2's
      migration, for anything the old container wrote while this one started.
- [x] D2a. Work after a response bounded, the bus without a table for a crowd, every foreign key
      indexed (2026-10-18, review §4 M, §6 M): `ctx.defer` runs eight at once on an instance and
      the rest wait their turn in order (`lib/deferred.ts`; it started everything at once against
      the pool the requests share), with `caime_deferred{state}` and failures by label on
      `/metrics` and a DEPLOY alert for a backlog. A bus message too long for a NOTIFY because of
      whom it's for is split across several that fit: a typing tick to 500 people is three
      messages, where it wrote a row to `domain_events` that every instance read back; only an
      event too large by itself still goes by reference. Every foreign key now leads an index:
      fifty-three didn't (thirty-four to people, `messages.pinned_by` among them, so an account's
      deletion scanned every message; `hidden_messages.message_id`, so an erasure scanned what
      people hid), forty in one migration and thirteen on big tables built concurrently, a file
      each; `fk-indexes.test.ts` holds every new key to an index. A transcribed voice note is
      told once, one view to everyone, where a group built it once a member. The fill of
      `last_sent_seq` ran again for the deploy window and its procedure is gone. Verified:
      `deferred.test.ts`, `bus.test.ts` (500 recipients in three messages, no row; a large event
      whole by reference), `fk-indexes.test.ts`, `speech.test.ts` (the transcript told once to
      both), `last-sent.test.ts` (the procedure made again from its migration), the migrations
      lint and the full gate.
- [x] D2b. A group of many (2026-10-18, review §4 H5): telling a conversation's people is one set
      of reads, each one's notification decided and worded in memory in their language, and one
      insert, one update for what a burst adds to, one event per set of the same words and one
      device lookup for the lot (`notifyRecipients`, `writeNotifications`, `readersOf`): a group
      of 80 costs 34 queries where it cost 267, and a crowd of 153 or 303 costs 33 either way.
      Past a hundred people (core `isLargeGroup`, `LARGE_GROUP`) a group or a broadcast is a
      crowd: no device says what arrived (the receipts route writes nothing for it and tells a
      read to the reader's own devices; the app sends no delivered acks and draws one tick),
      nobody is seen typing (the socket and the route drop it, the composer sends none), and each
      device patches its inbox row rather than reading the whole inbox again after every message
      (only one that names or answers it is read again). In a group, what someone a member
      doesn't know says to everyone waits in that member's inbox (`decideNotification`'s
      `crowd`, R97 (3)): a mention, a reply, a question or request to them, the people they know
      (a relationship or a connection), urgent words and a group they made a priority still
      alert them. Verified: `large-group.test.ts` (who is alerted and why; the same 33 queries
      at 153 and 303; a delivered ack writes nothing and a read reaches only the reader's
      devices; nobody typing on the socket or the route, while the same socket's typing to one
      person is heard), `fanout-scale.test.ts` (a fixed ceiling), core `policy.test.ts` and
      `large-group.test.ts`, the app's `rows.test.ts` (one tick past a hundred), and the full
      gate.
- [x] D3a. One reading of a conversation (2026-10-18, review §10's fragments): what a person may
      read is one rule, `readableBy` (not deleted, not expired, not hidden for them), in every
      reader that shows messages or hands them to a model (Cai and the friends, catch-up, ask,
      translate, the brief, search, the profile's memory, their cards, pins, the agent): Cai's
      transcript had read the model what someone deleted for themselves, and now doesn't. A
      conversation as a model reads it is one builder (`lib/transcript.ts`: a voice note's words
      and a caption whole, a line's reply named, the reader's own clock), so the brief's summary
      now has the times the catch-up had. When a card ends is one rule (core `cardEndMs`: its
      booking's end, else its minutes, else an hour), where the booker's mail had said half an
      hour and the guests and the series read no booking's end. Words cut to a length are cut by
      character (core `truncate`, never a lone half of an emoji) in the transcripts (the agent's
      now holds each message to 1,500 characters, where a pasted file went whole), previews,
      search's snippets, what a model answers and a mail's subject; what
      someone types into search and memory's contexts is escaped for LIKE (a `%` no longer finds
      everything); `PUBLIC_URL` is trimmed once, in `loadConfig`, where 27 places trimmed it
      themselves. Verified: `transcript.test.ts`, `system-accounts.test.ts` (a PIN deleted for
      oneself never reaches the model), core `meetings.test.ts` (when a card ends),
      `about.test.ts` (the address without its slash), and the full gate.
- [x] D3b. Live events by their keys (2026-10-18, review §10): `realtime/apply.ts` asks again
      only by `qk`'s keys, where 23 were written by hand (calls, requests and relationship history
      given prefixes of their own), each debounced under its query's own key, so a key is always
      one piece of work: a card's update had replaced a message's waiting refresh of what the
      conversation shares, and a space's update the refresh of the space on screen. A slower ask
      never puts off a sooner one, where a mention followed within a second by an ordinary message
      had its inbox read put off by a quarter-minute. A conversation made or changed, and a space
      removed, read the inbox once where they read it twice (the second invalidation of the same
      list cancelled the first's request and sent another), and leaving a conversation drops
      every refresh waiting for it. The cache is written only through `state/cache.ts`: a change
      worked out on the device (an action ticked, an automation switched, a suggestion put away,
      the account kept on the device) through `patchCache` or `patchCaches`, the server's answer
      through `putAnswer`, and `keys.test.ts` fails on a bare `setQueryData` or on a key written by
      hand. "Do all"'s Undo counts only what it took back and says why one couldn't be, where it
      said "Undone" whatever happened, and is offered only when there's something to take back;
      putting suggestions away says so when it fails. Verified: `apply.test.ts` (a burst read once,
      a sooner read never put off, nothing said of a crowd's messages, a conversation left
      forgotten, a connection's and a card's refreshes by `qk`'s keys), `keys.test.ts`, and the
      full gate.
- [x] D4a. Words that read right in every language (2026-10-18, review §10). First, a private
      conversations bug the R54 conversion made: the label a device signs to approve another of
      its person's devices went through `tr`, so a device reading Arabic, French or Turkish signed
      its own translation, which a device reading another language couldn't check, and that
      person's new devices went unvouched for across languages. An approval now signs the
      protocol's own words in every language (`introductionText`), and one made since R54 still
      verifies (`introductionTexts`; `e2ee-noble.test.ts` signs in Arabic and checks in English,
      on the browser's and the phones' code). A catalog's words
      lowered inside a sentence go through core `lower` and `lowerFirst`, by the reader's
      language's rules, at the ten places that lowered them by hand (Turkish "İş" read "i̇ş" in
      the Notifications and Automations choices, a person's rhythm, the relationship offers, a
      refused role, a space's suggestion, the site's list of views), and `i18n-case.test.ts` fails
      on one more. The reminders read "If this person haven't answered" in English in every
      language (five phrases never reached the catalog): each rule is now a sentence of its own,
      naming who it's for as automations do. A relationship offer is a sentence whole for each
      kind, with and without where ("Cy may be a customer at Acme"), where an English "a" or "an"
      and " at …" were glued on in every language. The hours chart's words for a screen reader
      read "tr(), tr(), 9h 3)" since the R54 conversion, and now read the hours. A number in a
      sentence is written as the reader's language writes it (`fill` through `shownNumber`:
      "12 345" in French, "12.345" in Turkish, a year passed as text, Arabic's digits Latin as they
      were), where an organization's allowances, a limit's message and the site's numbers and
      prices were forced into English; a size is said in the reader's units ("1,5 Mo"); a
      price's period ("€6 a month") goes through the catalog; a copy button's name keeps its
      field's label, where a name in it lost its capital. Verified: `i18n-case.test.ts`,
      `profile.test.ts` (the offers in English, French and Turkish), the catalogs in all four
      languages, and the full gate.
- [x] D4b. Sentences whole, placeholders that say what they hold, lists the reader's way
      (2026-10-18, review §10). The placeholders named after the code that filled them
      (`{toLowerCase}`, `{length}`, `{PLAN_NAMES}`, `{teamSize2}`, `{PINNED_MAX}`, `{i}`, `{e}`)
      are named for what they hold in 124 sentences (114 the app's, 10 the server's) and every
      catalog, so whoever translates reads `{count}` or `{max}`. Every sentence that was glued
      from pieces is whole: an app's consent with and without "You let it in before", the
      recovery key with and without "This device has it", up or down, a plan with or without
      insights, a video call or a voice one (French had read "Appel Vidéo" with its capital), a
      WhatsApp export's facts, the comma passed through `tr(', ')` on the site, onboarding and the
      insights, "Free, always", a price "a month, or a year". Lists read the reader's way: 48 go
      through core `listed` (Arabic's "،") and 13 through `joinNames`, which names people in the
      interface's language, where Arabic had read an English "and" in "who's typing" and wherever
      people were listed, and people in a call read "A, B are in the call". A call
      without a name says "Someone" in the reader's language, a number in the importer, the
      contacts and the marketplace is written as the reader's language writes it, and two helpers
      nothing read (`describeAudience`, which said "Everyone" in English, and `isOrgPlan`) are
      gone. On the web a sheet now leaves at once: React Native Web kept a closing sheet's focus
      trap through its fade, so what was typed in that moment (the next message, right after a
      decision's Save) went into the sheet going away, which the group test met twice.
      `i18n-sentences.test.ts` fails on a fragment, a placeholder named by the code, one
      not passed or passed and never said, and a list joined by hand; the catalogs fail on a
      translation naming a placeholder its English doesn't fill, and on an Arabic string kept in
      both halves. Verified: `i18n-sentences.test.ts`, `i18n-catalog.test.ts`, `server-i18n.test.ts`,
      `duplicates.test.ts`, the startup chunk at 449.7 KB (0.1 KB less), and the full gate.
- [x] D4c. One consent pipeline (2026-10-18, review §10): contacts from an account (R89) and a
      connected account (R90) asked Google and Microsoft through two copies of the same steps, so
      a fix to one missed the other. Both now go through `lib/provider-consent.ts`: the providers'
      clients, the consent link (an hour online for contacts, a refresh token offline for a
      connection, the account chosen every time), the state sealed with a server key under each
      use's own label and read back only before its deadline (the Google picker's ticket too),
      the code traded under one deadline, and the landing on the web or the phone. Each keeps its
      own return address, as the providers have them registered, so nothing changes for the
      owner's clients or for a consent under way at a deploy. A return that said "adults", which
      nothing sent (the start refuses someone under 18 before any consent), is gone, its words
      the server's alone. Verified: `provider-consent.test.ts` (each link's parameters, the secret
      never in one, a state read under its own label and key only, before its deadline and
      untouched), `contact-accounts.test.ts`, `connected-accounts.test.ts`, and the full gate.
- [x] D4d. One face per person (2026-10-18, review §4 and §10, R99): identities (a name and a
      headline a person could show one connection and not another) had routes and no screen, and
      every list of people, notification and call paid to name people through them. Decided and
      done: a person's name and photo are the same to everyone; what they do is `users.headline`
      (migration 0121 adds it with a fill from the default identities a batch at a time, 0122
      runs the fill), set in Settings · Profile ("What you do"), drawn under their name on their
      profile and as "Work" on their visitor page (`jobTitle` in its JSON-LD), shown only where
      Work details lets it be. The identities routes, `identityId` on a request and a connection,
      `identitiesShownTo` and the per-viewer names in conversation views, profiles,
      notifications, calls and suggestions are gone: connections cost 10 queries (from 12),
      requests 8 (10), a people search 13 (15), the inbox of 301 conversations 15 (17) and a
      message to 79 people 32 (34), with the ceilings tightened to hold it (14 for people's lists,
      16 for the inbox); the table stays for the export until a later release drops it.
      An organization's chip on a profile is named for a screen reader in the reader's language
      (it said "verified" in English). Verified: `account.test.ts` (the line set, trimmed,
      cleared to nothing, too long refused, shown to a stranger, hidden by Work details, the old
      routes gone, the fill taking each default identity's line once and never over one said), `public-pages.test.ts` (the row and `jobTitle`, gone when kept for
      connections), the naming cases rewritten in `messaging`, `group-calls`,
      `relationship-profile` and `privacy-upkeep`, the scale ceilings, and the full gate.
- [x] E. Chat polish: distinct read ticks with a contrast test; the English leaks and a scanner
      that flags any word-bearing literal; quoted replies with the author and a jump, swipe to
      reply; message info and who reacted; video as a message, voice notes with a waveform, speed
      and scrub; link previews fetched once on the server for non-private chats; a sticky date
      pill, open at first unread, counts on the jump button, big emoji-only messages, highlighted
      mentions; honest error states with retry; one vocabulary; confirm and undo on delete; mark
      as unread, reply privately, last seen.
- [x] E1. A chat that says what's true (2026-10-18, review §7 H1, H2, H5 and the M row). Read
      and delivered no longer look alike: their colours had been 1.04:1 apart on the default
      bubble; now sent and delivered take each bubble's `tick` token (3:1 on the bubble, 1.8:1
      from its text) and read takes the text's colour with a heavier stroke, a card of one's own
      the tertiary text and the text, held by `tokens.test.ts` for every bubble in both schemes.
      English that showed through in the other three languages is gone: the call screen's
      states, "typing…" and "You:" in Chats, the server's "Encrypted message", the inbox reasons
      core counted by hand ("{n} requests for you", "{n} new"), a link's safety reasons (whose
      "suspicious" was read back from their English words), every toast, field error and note
      handed to a helper, the reported thing's name, a field's "not chosen", and the camera's
      "in Settings" dropped into a sentence; the scanner that missed them now flags any string
      of words that isn't the code's own (6 left, each data and listed). "All {kinds}" became
      whole sentences ("All of them", "All photos"…), Search's examples come from core and are
      each understood whole in every language ("links in work" wasn't, even in English). A first
      load that fails says so with Try again (`LoadFailed`) on Home, Chats and a conversation,
      never "nothing needs you", the first-run screen or "the beginning". A delete (for everyone
      or for oneself) shows at once and offers Undo, sent only once Undo has passed, so taking it
      back is exact. Verified: `tokens.test.ts`, `i18n-literals.test.ts` and the catalogs in four
      languages, `search-languages.test.ts`, `cache.test.ts` (a delete undone lands in its own
      page), `e2e/honest-chat.spec.ts` (Undo puts it back and the server still has it; past it,
      the other side sees it deleted; a failed first load and Try again), and the full gate.
- [x] E2. Replies and reactions (2026-10-18, review §7). A quoted reply says whose words it
      quotes ("You" for one's own, the organization to its customer; it said "Reply", or
      "Replying to themselves") and a tap on it goes to them, loading older pages as search's
      jump does; the composer's banner said "Replying to yourself" with the English word in every
      language, and a photo's kind ("media"), now whole sentences and core's preview. A reaction
      chip is touched at a finger's size and a hold on it names who reacted, as the message's
      sheet now does ("You and Alex", anyone since gone counted). One's own message in a group of
      up to a hundred says who read it, who has it and who doesn't yet, counted as the ticks are
      (reading withheld says "delivered", someone reached by mail is left to the mail line). On a
      phone a message swiped toward the reading direction's end (right, or left in Arabic) is
      answered; built, not yet tried on a phone. E1's delete for everyone now says so in its Chats
      row at once too (its Undo window had left the words there). Verified:
      `rows.test.ts` (who has it, the cases that say nothing, the quote's names), the catalogs in
      four languages, `e2e/honest-chat.spec.ts` (the quote's names both ways and the jump, the
      banner's own sentence, a hold on a reaction naming both, a group message read once the other
      opened it), and the full gate.
- [x] E3a. Reading a conversation (2026-10-18, review §7's partials and missing). A conversation
      with unread messages opens at the first of them, their count on the line ("30 unread
      messages", it said "New messages"), older pages loaded down to it; past 150 it opens at the
      newest, where Cai's catch-up is offered. The jump button counts others' messages below what
      was last seen at the bottom. A pill over the list says the day of what's at the top while it
      scrolls. One to three emoji alone are drawn big, without a bubble (core `emojiOnly`). The
      names a message mentions are marked where they're written, the reader's own most (core
      `mentionSpans`, the same reading as `mentionedIn`). A chat's head says when the other person
      was last here ("Last seen today at 14:05", core `lastSeenLine`: whole sentences, no gender),
      only as their privacy shows it and asked again when they leave while it's open. Verified: `emoji.test.ts`, `mentions.test.ts`, the format tests, `rows.test.ts`, the catalogs
      in four languages, `e2e/reading-flow.spec.ts` (opened at the first of 30 with the count,
      the jump button's 30, the pill, a big 👍, a mention of the reader marked, "Last seen just
      now" once the other closed their tab), and the full gate.
- [x] E3b. Coming back, and answering privately (2026-10-18). Mark as unread from a row's
      actions puts a dot in Chats (`participants.marked_unread_at`, migration 0123, expand only)
      that reading the conversation, opening it or "Mark as read" clears; only its person sees
      it. Reply privately, on someone else's message in a group, opens the chat with them (a
      message request where they aren't a connection, as any first message is) with the message
      quoted above the composer; the server takes it only into the chat of two people who are both
      in that group now and may read it there, keeps only which message it was, and every reader
      gets the quote as they may read it then (`privateReply`: the group's name and the words,
      neither once they've left, the words not once it's deleted or gone), so nothing of the group
      is copied into the chat; a tap on it opens the group at the message. Row actions' "Unmuted"
      was English in every language. Verified: `reading.test.ts` (the mark set, cleared by reading
      and by its person, never the other side's; the quote for both people, nothing of its words
      in the reply's row, refused into the group, from a chat, with an outsider and for a deleted
      message, and said as where-not-what once deleted or left), the catalogs in four languages
      and the server's, `e2e/reading-flow.spec.ts` (the dot until opened; answered privately from
      a group, quoted in the chat, and back to the message), and the full gate.
- [x] E4a. Voice notes with a shape (2026-10-18, review §7). A voice note shows what its recorder
      heard: the recorder measures how loud it is as it goes (expo-audio's metering, in a browser
      and on a phone) and sends up to 48 bars with the note (core `voice.ts`), drawn live while
      recording, once stopped, and in the bubble, played and unplayed in the bubble's own colours.
      A press anywhere along them goes there; a screen reader steps five seconds (a slider with
      "Forward 5 seconds"), the keyboard's arrows too, the way the reading runs. While it plays
      it offers 1.5× and 2× with the pitch kept, and the next note starts at the speed chosen
      last. The server now keeps of any client's payload only what its kind reads (L9, past text:
      a voice note's length and bars within their bounds, a sticker's, a contact's, a poll's, a
      place's, nothing for a photo or a file), so no device writes the marks Caime puts on a
      message (a transcript's "Suggested by Cai", an import, a private reply); a private reply is
      a text's alone, and a forward of one is its words without its group's quote. Built for
      phones, not yet tried on one. Verified: `voice.test.ts`, `voice-payload.test.ts` (bars
      kept, forged marks dropped, bars and lengths a note can't have refused, a file keeping
      none, a forward keeping Caime's own), `reading.test.ts` (a forwarded private reply),
      `speech.test.ts` (a note longer than one refused, one whose recording is longer than it
      says never heard), the catalogs in four languages, `e2e/voice.spec.ts` (bars kept from the
      fake microphone, a press halfway along, 1.5×, played through and back at its start), and
      the full gate.
- [x] E4b. Videos, with no place they were filmed (2026-10-18, review §7). Photos and videos are
      picked together; a video plays where it is in the bubble on the web (the browser's own
      player, streamed by byte ranges, only its first frame and length loaded before it's
      played), opens in the phone's own player there, is veiled from a stranger as a photo is,
      and reads "🎥 Video" in Chats, notifications and quotes (the server marks a message of
      videos alone from its files). A phone's video kept where it was filmed and the camera's
      make in its movie box; every `udta` and `meta` box of the movie and its tracks, and XMP
      beside it, is now a zeroed `free` box of the same size (`video-details.ts`), so nothing
      moves and the picture and sound are untouched, and one that can't be read for certain is
      refused, as an unreadable HEIC is. The privacy page had said HEIC photos and videos keep
      their location; it now says what's cleaned and what's kept as sent (GIFs, WebM, other
      files). Verified: `video-details.test.ts` (an Android and an iPhone layout cleared, the
      movie found after the picture, XMP beside it, nothing changed where nothing is kept,
      unsure of a file without a movie or cut short; uploaded as an MP4, a QuickTime file and a
      recording with nothing kept, a broken one refused; a video message marked and previewed),
      the HEIC and file tests on the shared box reader, the catalogs in four languages,
      `e2e/chat-features.spec.ts` (a canvas recorded as WebM in the browser, sent from a phone,
      playing for both, "🎥 Video" in Chats), and the full gate.
- [x] E4c. Link previews, read once on the server (2026-10-18, review §7). The first link of a text
      in a conversation that isn't private gets a card: the page's title, a line of description,
      its site and Caime's own small copy of its picture. The server reads each address once and
      keeps what it said for 30 days by the SHA-256 of the address (`link_previews`, migration
      0124, expand only), never the address, the sender or the conversation, so a link sent to a
      group of a hundred, or a thousand times, is one request to the site, and the site sees
      Caime ask, never who sent it or who read it (the picture comes from Caime). The composer
      shows the card once the typing settles on a link, and its × sends the message without one.
      Never for a suspicious first link (a card would make it look trusted), for mail (a link
      there may tell its sender it was opened), for a sealed message or a notice. A request goes
      only where a webhook may: http(s) on their own ports, no private, loopback or link-local
      address in the name or any answer for it, each of three redirects checked again, a
      6-second deadline each for the page and its picture, 512 KB of a page read to the end of
      its head and 5 MB of a picture, no SVG, the picture made a 960-px WebP under the image
      semaphore. Erasing a message drops its link's card, the daily sweep old ones; a person's
      messages read at most 60 pages in ten minutes, the composer 30 a minute. What it costs:
      one request and one resize per new address a month on the server, a row of a few dozen KB
      for a month in the database, a WebP of a few dozen KB per card on a device, and nothing
      for a link already read. Verified: `link-previews.test.ts` (read once and told to the
      conversation as one view, the picture served by Caime at 960 × 504 and to nobody signed
      out, the same link elsewhere carded from the start without asking again, nothing kept that
      names the link; a redirect followed, gzip unpacked, windows-1256 read, an icon kept as no
      picture; a page that says nothing kept as nothing and asked once, a busy one kept as
      nothing at all and asked again; a link taken off or suspicious never queued, a forged
      payload refused; the composer's card filling the cache the message reads; an edit's new
      link carded and its card dropped by deleting the message; a month's card swept and read
      again; the addresses that may never be asked, the first-link rule, the page reader),
      `link-text.test.ts` (the composer's first link is the server's), the catalogs in four
      languages, `e2e/link-previews.spec.ts` (the card above the composer, in both people's
      bubbles with its picture from Caime, taken off before sending, and the site asked by the
      server alone, once for the page and once for the picture), and the full gate.
- [x] E5. One vocabulary (2026-10-18, review §7 M and §10). A thing has one name where people
      read it. "Find people" is `/connect`'s title and every way to it (People's button, Requests,
      the Chats "+" sheet, which says "By @handle, email or your contacts"); the Chats filter is
      "Needs you" with its count, since "Attention" is Home's own name; an organization is called
      one (its chip in Chats says "Organization" until it's verified, then "Verified business";
      a conversation's head "Verified business · its domain" or "Organization · Not verified
      yet"; its first lines "A conversation with an organization"), and "Business" is only the
      plan, the inbox and the badge; Search reads "Your actions" and "Actions with {person}". A
      plan, a poll and a place are rows of their own in the composer's sheet beside a photo and
      a file ("Plan a meeting", "Poll", "Place"), every other card under Cards. Words a new
      person wouldn't know are said plainly: the conversation panel's "Memory" is "Remembered
      here", Cai's "Contexts" is "What conversations are about", a profile's "context" is
      "working on", connecting's "Show the context" is "Say how you know them", Discover's to-do
      apps are "Actions and notes", and no refusal says "kit", "task" or "sphere" any more (a
      card, an action, how you know them; an app's own kinds of card included). An organization
      of the kind "Something else" was named in English in every language; it's "Organization"
      in each. Verified: the catalogs in four languages and the server's (nothing missing, nothing
      left over), `custom-kits.test.ts`, the i18n tests, `e2e/around-the-conversation.spec.ts`
      (a verified organization's head and its chip in Chats), and the full gate.
- [ ] F. Mail, calendar, meetings: CC and reply-all as people on the topic; unverified mail shown
      under Notices, never dropped; a follow-up allowance to new addresses; invitations arriving
      by mail become cards; cards travel by mail; "Suggest another time" with guest invitations
      updated and cancelled; week and month grids, "New meeting" picking the person first, Google
      and Outlook events shown to the person alone with consent, the other side's local time; an
      in-call side panel and the call linked to its card; VoIP ringing (⛔ a development build on
      a phone); more than eight people by ADR-17's media server (decided after F).
- [x] F1. Mail its sender couldn't be confirmed for, kept as such (2026-10-19, review §6: "mail
      failing the sender check is dropped silently (`mail-in.ts:111`, against R75's promised
      notice; the owner lost mail this way)"; R75 (1); advantage 5, privacy that never costs you
      your mail. The number: mail failing the check that reaches a person and is kept, every one
      now unless its domain's DMARC asks for a reject, none before). Such mail is never taken as
      anyone's: for a person it lands from a stand-in of its own for that person and the address
      it claims (`unverifiedSender`: a provisional row at the reserved `unverified.invalid`, named
      by that address alone, never by the name the mail gave; never the address's own person,
      never found, claimed or mailed), in one notice per claimed address under Notices (muted,
      never a request, never answered, read for nothing: no suggestion, action, link preview or
      notification from its words), marked `mail_messages.unverified` (migration 0143, expand
      only). The bubble says "by email, sender not confirmed", the composer "Caime couldn’t
      confirm this mail came from {address}…", and its profile "Sender not confirmed" with
      nothing to press. It teaches nothing of the real sender (a signature it came with folds
      none of theirs, and its arrival marks nothing seen), and mail from the same address that
      its server does vouch for is that address's own person's, apart. Refused and counted, as
      before, where the From domain's DMARC asks (`p=reject`, `t=y` read as one step less:
      `MailAuth.dmarc.policy`, from mailauth's own evaluation), at an organization's address (a
      forged customer would be answered as one), at Cai's (a forged acceptance), and for anyone
      under 18; the counter says `kept_unverified` for what's kept. The privacy page and the help
      say so. Left: CC and reply-all (the F line's first item, designed apart); an organization's
      address still refuses such mail.
      Costs: a mail that was dropped is now kept as a notice is (the stand-in once per person and
      address, the message, its files), read for nothing; nothing on devices. Verified:
      `mail.test.ts` (kept and said so, named by the address, nobody told and nothing asked,
      never answered, its profile, the address's own person never made and the vouched-for mail
      landing apart; a signature that teaches nothing; refused under a domain's reject and kept
      under its quarantine, refused at an organization's address and Cai's, and under 18; the
      four failing kinds kept and counted), `mail-auth.test.ts` (the policy read from the record,
      test mode one step less), the catalogs in four languages, and the full gate.
- [x] F2. Following up by email (2026-10-19, review §6: "one mail to a new address until they
      reply"; R93; advantage 2, everyone you deal with in one place, by mail too. The number:
      what a person may send someone reached by email before they answer, three mails a day
      apart where it was one). A person writing to an address (R93) follows up as anyone
      writing by mail would: once a day has passed since their last, twice at most, then nothing
      more until the other side answers; too soon, the refusal says when, in the writer's
      language and on their clock ("You can follow up tomorrow at 10:32: once a day, twice at
      most, until they answer."). Anyone on Caime is still asked once (a message request), and
      twenty new addresses a day still bound who's written to. Costs: the count a refused send
      already made, with its latest time, and the other's kind read only once a message has
      gone; nothing on devices. Verified: `mail.test.ts` (three mails out a day apart, the
      fourth refused until they answer, the refusal's when; a stranger on Caime still asked
      once), the server catalogs, and the full gate.
- [x] F3. Cards travel by mail (2026-10-19, review §6: "cards are offered in mail conversations
      but never mailed"; "a meeting proposed in a mail thread is never mailed, can't be accepted,
      stays 'asked'"; "customers who write by mail never get their appointment or Pay cards";
      advantage 2, everyone you deal with in one place, by mail too. The number: of the cards a
      person can send someone reached by email, the share that reaches them, every one offered
      now (meeting, appointment, Pay, invoice, order, delivery, purchase order, ticket, place,
      voice note) where none did, and a meeting's answer from their calendar moving the card
      where nothing could). A card goes in words as it reads on Caime (`mailedAs`, in its sender's
      language, times whole on the sender's or the organization's clock with the zone named,
      the ways to pay a Pay card names); a meeting or an appointment carries its calendar
      invitation (`METHOD:REQUEST`, organized by the address it goes from, the card's own event
      id), and the answer their calendar sends back to that address (`METHOD:REPLY`, from the
      address invited, its sender confirmed) moves the card through the same `moveCard` a tap
      does (`lib/kit-moves.ts`, the kit route's move made shared): yes agrees it and answers
      their request, as a reply does; no declines it, or cancels what was agreed; a "maybe" moves
      nothing and arrives as their mail; nothing is posted, the card says it and its sender is
      told as of any move, and the card's mail reads "Seen". Cancelled here, the cancellation goes
      in the same thread with the update that takes it off their calendar (`SEQUENCE:1`, once a
      card). The calendar is read from an attached `.ics`, else from the message as it arrived
      (Outlook's and Apple's carry it as an alternative part: base64, quoted-printable or as it
      is), else from the words. What a mail can't carry isn't offered (`reachedByMail`: no
      sticker, no poll, no card that asks for taps, no live location, no Repeats, and a meeting
      must say where, since nobody joins a call on Caime from a mail) and is refused by the
      server in the reader's language (core `notByMail`, four sentences). A booker who booked
      from a page is still mailed by `mailProvisionalBooker`; a card the host sent them by mail
      no longer is, since its invitation went with it. Left: a meeting's later change of time
      ("Suggest another time", the F line's own item), order and delivery moves told by mail, a
      card in a group with someone reached by mail, an organization's own kinds of card (an
      app's) by mail, and Gmail's, Outlook's and Apple's own handling of the invitation tried on
      a real mailbox (⛔ the owner's, once cai.me's mail runs: built to RFC 5545/5546/6047 and
      tested against the stand-ins, not yet against those clients). Costs: one mail per card
      (the provider's call, under a cent), a small calendar file; an answer is one mail in that
      moves a card; nothing on devices but a filter over what's already offered. Verified:
      `mail.test.ts` (a meeting's words and invitation from her address, her calendar's yes
      agreeing it, seen, told, the request answered; no declining it; a cancellation's update in
      the thread; an answer refused from another address, for another attendee, unconfirmed,
      or for an event not Caime's, and a "maybe" arriving as mail; a Pay card and a place in
      words; a sticker, a poll, an
      approval, a repeating meeting, one held on Caime and a live location refused; an
      organization's appointment from its address on its country's clock, confirmed by the
      customer's calendar with no booker's mail), `mail-calendar.test.ts` (base64,
      quoted-printable and plain calendar parts), core `mail.test.ts`, the 40 server suites that
      move cards or mail (391 tests), `e2e/mail.spec.ts` (Connect to an address, only what travels offered, the meeting
      sent with its invitation, the calendar's yes agreeing it live), the catalogs in four
      languages, and the full gate.
- [x] F4. Invitations arriving by mail become cards (2026-10-19, review §6: "calendar invitations
      arrive as a bare file"; "invitations mailed to a person never become cards"; advantage 2,
      everyone you deal with in one place, their calendars too. The number: of the invitations
      someone's Google, Outlook or Apple calendar mails a person's address for one time ahead,
      the share that arrives as a card that can be answered here, every one now where none did,
      and the answer reaching the organizer's calendar where it couldn't). Such an invitation
      (`lib/mail-invitations.ts`, read by core `readInvitation`: a zone by name, Windows' names as
      Outlook writes them, UTC, a floating time on the person's clock, a length or an end) is a
      meeting card from its organizer, trusted (`payload.invitation`: its event, sequence,
      organizer and the address invited), where their mail lands and never in a topic named
      after it, after what they wrote of it (core `invitationWords`: their calendar's own block
      for its call and Outlook's heading left out, HTML read as lines) and the files it came
      with, its calendar never a file; its length as it is ("50 min", "2 h", `fieldDetails`), its
      Where the location, else the call's address (Teams' where the location only names Teams),
      and never held on Caime (`meetingVenue(place, invitation)`: no Join, no guests, no
      "Starting now"; the calendar and the feed say so through `CardAhead.invited` and
      `CalendarItemView.invitation`). Its Accept or Decline here goes back to the organizer as
      the person's calendar app would send it (core `buildReply`, `METHOD:REPLY`, from their
      address, in the invitation's thread: `queueInvitationAnswer`, the `mail.card` job), once a
      move; the card says where the answer goes. The organizer's later word moves the same card
      (found by `invite:` client ids, the event's and the address's): a new time writes the time
      under the card's lock and asks again ("New time", `afterCardMove`'s `label`), a new place or
      name is shown quietly, a cancellation cancels it (`moveCard` as its organizer), a card they
      called off stands again on their word, the same word again or an older one changes
      nothing. Only what reads as theirs alone is a card: from a sender confirmed who is its
      organizer, inviting this address, one time ahead of at most a day, in a zone Caime can
      name, never a notice; anything else arrives as mail, its calendar a file, as before. The
      server's own cards now carry their kit's kind of message (`KIT_MODES`), as a client's do.
      Left: a series and a day-long event as cards, an invitation to an organization's address,
      who else an invitation names, a room beside a call's link, and Gmail's, Outlook's and
      Apple's handling of the reply on a real mailbox (⛔ the owner's, as F3's). Costs: one mail
      in that makes up to two messages (the words, the card), one query by an indexed client id
      for each invitation mail, one mail out per answer (the provider's call, under a cent);
      nothing on devices. Verified: core `ics.test.ts` (Google's and Outlook's invitations, a
      time in UTC, floating, a day, a length, a calendar app's path to a zone, a series, a time
      of one, two events and an unknown zone refused, a cancellation, the words without their
      calendar's blocks, the reply), `meetings.test.ts` (never on Caime), `kit-cards.test.ts`
      (lengths no choice names), `mail.test.ts` (the card from its organizer after their words,
      no topic, no file, the yes mailed back from her address in the thread, the request
      answered, the provider's retry; a new time asks again and says so, the same and an older
      word change nothing, the yes for the new time, a cancellation by its organizer, its
      standing again, the no mailed back, a new place quiet; no guests, no start, the calendar's
      flag; someone else's event, another address, a series, a day, over, longer than a day, an
      unknown event's cancellation, unconfirmed, and a list's arriving as mail), `e2e/mail.spec.ts`
      (an invitation as a card among the requests, its Accept mailed back as a reply, its new
      time asking again live), the catalogs in four languages, and the full gate.
- [x] F5. Another time for a meeting or an appointment (2026-10-19, review §6: "rescheduling
      (cancel and re-propose is the only way)"; "guests' calendars go stale (sequence always 0, no
      cancellation sent)"; advantage 2, everyone you deal with in one place, their calendars kept
      in step. The number: of the meetings and appointments whose time moves, the share that move
      on their own card, keeping its conversation, its guests and the one event in every calendar
      it reached, every one now where none could: a new time was a decline and a second card, a
      second event in each calendar). Either side suggests it from the card ("Suggest another
      time", `features/kits/CardTime.tsx`, the time chosen in `WhenSheet`; `POST
      /messages/:id/time`, `retimeCard` in `lib/kit-moves.ts`): the time and `card_start_at` are
      written under the card's lock, it asks again (a meeting proposed, an appointment requested:
      core `RETIMES`), now of the other side (its asker is who suggested it, `payload.proposedBy`,
      read through core `askedBy` by `mayMove`, the card's buttons and the notification, which
      reaches them as something to answer), and its `sequence` counts on; then what follows any
      move (`afterCardMove`, "New time"), and a line from whoever suggested it ("Ben suggested
      another time for “Plan the launch”", `time_suggested`) that puts the conversation under
      Needs you for the others until the card's next move lets it go (`payload.askLine`). Whoever
      has it by mail (F3) is sent the update in its thread, the same event one sequence on
      (`queueCardUpdate`, `updateOf`), so their calendar moves it and asks them again, and their
      calendar's answer to the time before moves nothing (core `readReply`'s sequence, at a
      person's address and Cai's); a meeting's guests (R84) are asked again for the new time, each
      with a new link and what they answered of the time before let go, and are sent its
      cancellation when it's called off (`askGuestsForTime`, `tellGuestsCancelled`, one sequence
      past the last they were sent). To a customer, who suggested it is the organization
      (`maskPayload`). Refused, in the reader's language, where the time isn't the card's to move
      (core `retimeBlock`): a series (each time keeps its own: cancel it and send another), an
      invitation from someone's calendar (its organizer moves it, F4), a card moved to its space
      (its copy there is the one), a booking from a catalog (its open time is the catalog's); and
      a time already over. Left: one time of a series moved alone, a booking moved to another
      open time of its catalog and an organization's app moving an appointment through the API
      (both F5b), the other side's clock beside the time, and Gmail's, Outlook's and Apple's handling of the update
      on a real mailbox (⛔ the owner's, as F3's). Costs: one request, one update and one line per
      suggestion; a mail out per person reached by mail and per guest (the provider's call, under
      a cent); on devices, the first download 447.9 KB of 450, 0.1 KB more than F4's (the day
      picker loads when it's opened: a static import of it from the cards put 2.7 KB there, and
      `panes.test.ts` now holds `WhenSheet` to lazy imports everywhere). Verified: core
      `kit-cards.test.ts` (`askedBy`, `retimeBlock`, the lines), `ics.test.ts` (a reply's
      sequence), `card-times.test.ts` (either side moves an agreed meeting, the line needs the
      other and is let go by the answer, the notification is to be answered, the other side moves
      it again; an appointment the same and never to a time over; a series, an invitation, a
      booking, a text and someone outside refused; guests asked again at sequence 1 with a new
      link and their answer let go, the cancellation at 2), `mail.test.ts` (the update in the
      invitation's thread at sequence 1, the time before's answer ignored and the new one agreeing
      it, the cancellation at 2), `business.test.ts` (the organization suggested it, to the
      customer, on the card, the line and live; her suggestion back hers), `e2e/meetings.spec.ts`
      (Ben suggests tomorrow from the card, Ana reads the line and agrees, live on both),
      `panes.test.ts`, the catalogs in four languages, and the full gate.
- [x] F5b. A booking moved to another open time of its catalog (2026-10-19, F5's first two
      "Left"; advantage 3, the business that runs itself: rescheduling is a clinic's most common
      change, and was a cancellation and a new booking. The number: of bookings from a catalog
      whose time moves, the share that move on their own card at an open time of what they
      booked, every one now where none could). "Suggest another time" on a booking offers the
      open times of what it booked (`features/kits/RebookSheet.tsx`, with the card, over the card's
      form's `SlotPicker`), the time it has now freed for it: the slots routes take `except` for someone
      in its conversation (anyone else learns nothing from it). The server checks the time as a
      booking is checked (`rebookingFor` in `lib/booking.ts`: the host's side keeps no lead time,
      as for its own slots; the customer books by the catalog's rules; `exceptCard` so its own
      time holds nothing against it, in the slots and in who is free), before the transaction and
      again under the host's slot lock inside it, as `sendMessage` checks a booking; what it was
      booked at (its name, its price) stays, its end follows the item, and whoever did it keeps it
      while they're free then, else confirming it picks again. An organization's app gives a card
      its bot sent another time through `POST /v1/messages/:id/time` (`kits`, the SDK's
      `suggestTime`, the OpenAPI document), as it moves only its own cards. Refused, in the
      reader's language: a booking given a length of its own, and one booked from a page by
      someone without an account (nothing reaches them but mail: F5c). Left: that booker's answer
      from the mail itself, an app moving the team's or a customer's cards, and one time of a
      series moved alone. Costs: the slots read once more under the lock (the queries a booking
      costs); on devices, the first download 448.0 KB of 450, 0.1 KB more than F5's (the sheet
      comes with the card in the conversation's chunk, 89.9 KB of its 100: loaded apart, the slot
      picker it shares with the card's form moved into the first download, 1.0 KB). Verified:
      `card-times.test.ts` (the team moves a confirmed booking half an hour on over its own time,
      its end and provider kept, the old time freed; a taken time, one outside the hours and a
      length refused, nothing moved; the customer kept to the notice and asking the team; the
      slots' `except` for those in the conversation alone; a page's booker refused; a person's
      catalog from either side), `sdk.test.ts` (`suggestTime` on the bot's card, a time over
      refused, the team's card refused), `openapi.test.ts`, core `kit-cards.test.ts`,
      `e2e/bookings.spec.ts` (the team picks one of the haircut's open times, the customer reads
      the line and confirms), the catalogs in four languages, and the full gate.
- [x] F6. Where a meeting or a booking is, said every time; a booking held on Caime joined as a
      meeting; calendar events that name whom (2026-10-19, the owner's report: a booking from
      their page was a card and not a meeting, a meeting reached Google as "Great Meeting test ·
      Great Meeting test" with nobody named and its link in the notes, Meetings left page bookings
      out, and "Your calendar" looked like a second Google; R108; advantage 2, everyone you deal
      with in one place. The number: of meetings and bookings, the share whose Where is said,
      every one now, where a booking said nothing unless an organization's branch did; of
      bookings of a person's time held on Caime, the share with Join, every one, where none had
      it; of the events Caime writes into a calendar, the share that name whom they're with, every
      one, where a meeting's own space doubled its title). Where is a choice on the forms
      (`features/places/WherePicker.tsx`, in the places chunk, its room held while it loads: On
      Caime, first and chosen wherever a call can be made; the places whoever fills it in may see;
      somewhere else, typed), on a meeting, an appointment and an item (`BookingSetup`); core
      `cardVenue` and `heldOnCaime` read it (a meeting with none on Caime, R83; an appointment with
      none at its provider's; a conversation that holds a call). A person's item by the minute is a
      call on Caime unless it says a place anyone may see or words of its own (`BookingItem.onCaime`,
      `whereNote`, kept one of three by `whereOf`), which `whereBooked` writes into its booking's
      card and an order's (`PlacedOrder.where`, "Sent on Caime"); a confirmed appointment held here
      has Join on its card, in the calendar and in Meetings (which lists appointments too),
      "starting now" and its join address in calendars. What Caime writes into Google and Outlook
      and what the feed says are one wording (`lib/card-events.ts`, in the reader's language):
      whom by name (the customer to the team, the organization to the customer, a space by its
      name, a meeting's own space by its people), never the same words twice, "With …", the join
      address as its place (Outlook's `locationUri` too); nobody invited, on purpose (R108 (5)).
      The feed leaves to a connected account writing plans the meetings and appointments it writes
      (90 days), its other lines in the reader's language too, and is the Calendar feed in Apps
      (for Apple Calendar and the rest; Google and Outlook pointed to Your accounts). A person's
      public items say where (a call on Caime, sent on Caime, the place, the words), the agent's
      catalog says an item's words, a page's booker is mailed that it's a call taken once they join
      with the address, and a call to them says why it can't ring yet. Left: that booker joining
      without an account (F6c), Cai's notes in the call (F7), an organization's items on Caime (its
      conversations hold no call yet), and the other side's clock beside a time. Costs: the feed
      four queries more per read (whom its cards are with, three batched, and whether an account
      writes the plans), the push one more per run, none per row; on devices, the first download
      448.2 KB of 450, 0.2 KB more than F5b's (the picker and its places load with the form's
      first Where, in the places chunk), the conversation's chunk 90.3 KB of its 100 (0.4 KB more:
      the form's choice and its room). Verified: core `meetings.test.ts` (`cardVenue`,
      `holdsCalls`, `heldOnCaime`, a confirmed appointment's Join until its booking ends),
      `booking.test.ts` (`itemOnCaime`, `itemWhereSaid`), `kit-cards.test.ts` (an order's Where),
      `card-where.test.ts` (an item's three wheres kept one of three and a place not everyone's
      refused; a booking's card says Caime, the place's address or the words; Join in the calendar
      for one held here and none elsewhere; the Plans event and the feed name whom with the join
      address; an order sent on Caime; the item pages; a page's booker mailed that it's a call and
      a call to them refused in words; "starting now" at its time; a meeting's own space named by
      its people; a business conversation's events name the customer to the team and the
      organization to the customer, nobody on the team, and hold no call), `calendar.test.ts` (the
      feed's words, the join address as its place, a connected account's plans left to it and back
      once it's to reconnect), `calendar-sync.test.ts`, `member-apps.test.ts` (a space by its
      name), `branches.test.ts` (a person's item at someone else's place refused, a branch's days
      an organization's), `app-directory.test.ts`, the E2E `places.spec.ts`, `bookings.spec.ts`,
      `mail.spec.ts` and `around-the-conversation.spec.ts` (Where chosen on the forms, the Calendar
      feed), the catalogs in four languages, and the full gate.
- [x] F6c. Whoever is reached by mail joins a call held on Caime from their own link, with no
      account (2026-10-20, R108, R84, R93; the owner's report: a booking from their page couldn't
      be met on Caime by someone who isn't on it; advantage 3, the door that needs no account, and
      what Calendly with Zoom gives an invitee: the link in the invitation, and nothing to sign up
      for. The number: of bookings held as a call on Caime from a page, and of meetings held on
      Caime mailed to someone, the share whose mail carries a way into the call without an
      account, every one, where none had it; `growth.guests.fromMail` counts who came in by it).
      A page's booker, once the booking is confirmed, and whoever a meeting or an appointment held
      on Caime is mailed to in a one-to-one, are handed their own link (`callLinkFor`,
      `lib/meeting-join.ts`: a `meeting_guests` row on the card itself, its token made from the
      server's key, the card and the person, so the confirmation, its calendar event, the reminder
      and a new time's invitation all carry the same link and nothing keeps it but its hash), in
      the words and as the calendar event's place and address, so their calendar's Join is it; a
      meeting held on Caime now goes by mail in a one-to-one, which F3 kept back (core `notByMail`
      takes `oneToOne`), and the form offers On Caime there (`meetingCall`).
      `/j/<token>` is the guest's page they know (`JoinMeeting`: the card, whom it's with, the name,
      "I'm 18 or over", already on for a booker who said it as they booked), signing them in as
      their provisional self for that one-to-one until a day after the card ends, while it's asked
      or agreed (`guestLink`); there "Join the call" calls whoever it's with, or answers them, and
      a call to them rings their page. The call routes are a guest's (`GUEST_ROUTES`), and a call
      takes someone reached by mail only by their link to a card there, taken (`callLinkIn`):
      the link is the invitation, so it stands for a request answered; a call to them before they
      opened it says so ("hasn't opened the link Caime mailed yet"), and to someone with no such
      link, that a meeting held on Caime mails one. They're never notified, never record, and
      answer Cai's notes as any guest; "Keep this conversation" makes it their account. Left: a
      group's member reached by mail (a mail group holds a group call), an organization's items
      on Caime (its conversations hold no call yet), and that booker's answer from the mail itself
      (F5c). Costs: a link is one HMAC and one row a card and person, made when the mail goes; the
      start of a call one or two queries more where someone is reached by mail; on the device, the guest's page 5.3 KB where it was 4.9 (it loads only at `/j/`), the first download 448.8 KB of 450 and the conversation's chunk 91.5 KB, as before. Verified:
      `card-where.test.ts` (a page's booker's confirmation and reminder carry the same link, as the
      event's place and address; before it's opened a call says so; taken, the booker reads the
      conversation and nothing else, calls the host, who is told and answers, and is rung by the
      host's call and answers, told nowhere else; called off, the link and the calls end),
      `mail.test.ts` (a meeting held on Caime mailed to someone goes with their link; taken, the
      sender's call rings them though they never answered in Caime), `guest-routes.test.ts`,
      `product-metrics.test.ts`, the E2E `public-booking.spec.ts` (the visitor opens the link from
      the confirmation, joins with no account, and the host's call rings their page and they're
      on), the catalogs in four languages, and the full gate.
- [x] F7. Cai takes notes in a call (2026-10-20, R82 phase 1 under R85, R109; the owner's report
      of 2026-10-19: "the Assistant didn't join and so the meeting wasn't recorded"; advantages 5
      and 4: everyone's yes and no audio kept, on every plan at its published cost, where Meet,
      Zoom and Teams sell a note-taker in their paid tiers. The number: of notes taken, the share
      that started only once everyone in the call had said yes, every one (`started` on
      `caime_call_notes_total` is counted there alone); of what was said, the share whose audio is
      kept once heard, none; an hour of speech heard costs €0.1955, so Personal's day covers 2.56
      hours). "Take notes" sits beside Mute in a call between two and in a group call (a meeting's
      call is one), for an adult on Caime with AI assist on and room left in the day (`mayAsk`),
      never in a private conversation or with anyone under 18 in the call (refused in words that
      never say who); the ask is the asker's own yes. A caller may ask while it rings,
      and the ring then asks: "Answer, Cai takes notes" and "Answer without Cai", no plain Answer;
      a group call joined while notes are asked for or on offers "Join, Cai takes notes" and "Join
      without Cai", its banner too; whoever is already in it is asked in the call ("Let Cai take
      notes", "Not now"). On once everyone in the call has said yes; anyone's no (Not now, a ring
      answered or a call joined without Cai, Stop Cai) stops it for everyone at once, the utterance
      under way dropped, and nobody is told who, only why, in words that name nobody. Its state
      moves in one place, `reconcileNotes` (`lib/call-notes.ts`), under the notes' row lock, after
      an ask, an answer or a stop, a call between two answered or ended, and any change to who's
      in a group call. The recorder is one member's browser that said yes (the asker's, else
      whoever said yes first, handed on as one leaves; never a guest's; a call of phones alone is
      told Cai needs someone in a browser): each voice on its own track, cut at its pauses on the
      device (`features/calls/notes.ts`: a quarter of a second above the room starts an utterance,
      most of a second of quiet ends it, half a minute cuts it, under half a second is never
      sent), each sent as it ends; the server takes lines from the recorder's device alone, of
      voices that said yes, reads each one's length from the file, hears it in a `call.note` job
      through `runAi('notes')` on the asker's allowance by cost (a day run out stops the notes and
      says so) and deletes the audio once heard. The call's line opens "Notes from the call"
      (`NotesSheet`, lazy), speaker by speaker, for whoever was in it, from when they joined; each
      deletes their own words; the notes go with the line (`eraseMessagesWhere`, an organization's
      erasure); a person's export carries their own answers and words; the privacy page, the DPA
      and the processors list say what the speech provider receives. Nothing is drawn from them
      unless asked. Costs: on the server, a row per ask and per answer, and per utterance a row, a
      file until it's heard, a job and one speech call; an event per change of state; no timer or
      poll; on devices, the recorder's AudioContext with an analyser and a delay per voice and a
      MediaRecorder only while someone speaks, about 4 KB a second of speech sent; the first
      download 448.5 KB of 450 (0.2 KB more than the Settings audit's 448.3: the notes' endpoints
      and their event), the conversation's chunk 90.8 KB of its 100 (0.5 KB more: the call line's
      way to the notes); the call screens' part is in the calls' own chunk.
      Verified: `call-notes.test.ts` (asked while it rings and told to both, on when answered
      with Cai, on the asker's browser; lines from the recorder alone, a short one never heard,
      heard and its audio deleted, the run priced by its length; read the same by both from when
      they joined, each deleting their own; a stop for everyone; a no that never lets it start;
      the call's line marked, the notes in the export and erased with it; who may ask: AI assist
      off, a private conversation, someone under 18, two asks at once making one; a call nobody
      can record; a group's recorder handed over as it leaves, and a join without Cai stopping
      it), the app's `notes.test.ts` (where an utterance starts, ends and is cut; a noisy room;
      the lines that say why it stopped), the E2E `call-notes.spec.ts` in Chromium with
      microphones that speak and pause (`e2e/fake-speech.ts`, a project of its own: asked while
      it rings, answered with Cai, utterances heard, stopped by the other side, read from the
      call's line, one's own deleted; a ring answered without Cai never starts it), the catalogs
      in four languages, and the full gate.
- [x] F7c. "Cai takes notes" chosen on a meeting card ahead of its call (2026-10-20, the owner's
      expectation that the assistant joins the meeting; advantages 5 and 4 as F7. The number: of
      meetings that say Cai takes notes, the share whose Join asks for them in the same tap,
      every one, where the asking was a second step in the call; of joins into a call whose notes
      are asked for or on, the share made without a choice, none, where a meeting's card, a
      calendar's join address and a guest's page joined plainly and stopped the notes for
      everyone). The meeting form offers "Cai takes notes" under Where while the meeting is held
      on Caime, outside a private conversation, to someone who could ask in the call (an adult
      with AI assist on); the card says it under Where ("Notes: Cai, once everyone in the call
      says yes", in its mail and its calendar events too), and `sendMessage` refuses it for a
      meeting held elsewhere or where Cai may not take notes, through the same check as the
      call's ask (`assertNotesAllowed`, `lib/notes-allowed.ts`). Join on such a card, and on any
      meeting whose call has notes asked for or on, is a labelled pair, "Join, Cai takes notes"
      and "Join without Cai", leading the card's buttons (a meeting that can be joined now leads
      with Join, never Cancel): with Cai it answers a ring that asks, or starts the call and asks
      as it rings, so the other side's ring asks too (`joinDirect`); in a group it joins the call
      that's on rather than meeting it with a second (`joinGroupMeeting`: the second person to
      press Join was refused "There's a call on here already"), and a calendar's join address
      joins nothing while notes are asked for or on, the choice being the person's. A guest's
      page says "Notes" before they join (`JoinView.meeting.notes`) and joins with Cai or
      without while they're asked for or on. Costs: none on the server beyond a field, the check
      on send and a line in the calendar's words; on devices, the first download 448.6 KB of 450
      (0.1 KB more than F7's: Join with Cai in the calls' entry), the conversation's chunk 91.5
      KB of its 100 (0.7 KB more: the card's pair and the form's switch). Verified: `call-notes.test.ts` (a meeting that says so, a guest's page that says so
      before they join, and its calendar events that say so; refused held elsewhere, from someone with AI assist off, and
      with someone under 18 in the conversation, in words that name nobody), the app's
      `joinDirect.test.ts` (with Cai: starts and asks, answers and asks, answers a ring that
      asks with a yes and asks nothing more; without Cai: a no; a group's Join to the engine),
      core `kit-cards.test.ts` (the card's Notes line), the E2E `call-notes.spec.ts` (the form's
      switch, the card's line, "Join, Cai takes notes" and the other side's ring asking) and
      `meetings.spec.ts`, the catalogs in four languages, and the full gate.
- [x] F7d. Cai on a call's notes, on ask (2026-10-20, R82 (3), R12; what Meet's, Zoom's and
      Teams' note-takers sell as the summary and its action items, here kept nowhere and offered
      as the reader's own suggestions; advantages 1 and 8: a call's promises join the relationship
      they were made in, where a note-taker's land in a document. The number: of follow-ups found
      in a call's notes, the share offered for the reader to accept or dismiss, every one, never
      written as a fact (R12); of catch-ups, the share kept anywhere, none). "Notes from the call"
      offers "Catch me up" and "Find follow-ups" to whoever may use AI assist once something was
      heard, the conversation's own words and shape (`NotesSheet`): the catch-up is labelled
      "Suggested by Cai" and kept nowhere; each follow-up (something the reader agreed or was
      asked to do, something they wait on someone in the call for, something decided) is the
      reader's suggestion by the line it came from (`ai:callnote:<line>:<kind>`, so a line's is
      offered once and a dismissed one stays dismissed), tied to the call's line in its
      conversation, with "{speaker} said “…”" for its reason. The notes are read as a
      conversation is, by the same instructions as a conversation's catch-up and follow-ups
      (`lib/call-notes-ai.ts`: `notesFor`'s lines, the reader's own as "You", numbered by
      `transcriptText`; prompts `notes-catch-up` and `notes-actions` in `PROMPT_VERSIONS`), only
      what the reader may read (from when they joined), never anyone's audio. The privacy page
      and the processors list say what the AI provider receives. Costs: one light-model call per
      catch-up and one per "Find follow-ups" on the plan's tier, each on the asker's day by cost,
      the transcript at most 24,000 characters (under a conversation's 60,000, whose cost is
      measured in `ai-costs.test.ts`); no timer, no row kept but the suggestions; on devices,
      the first download 448.6 KB of 450, as F7c's (two endpoints: the buttons load with the
      notes' sheet), the conversation's chunk 91.5 KB as before. Verified:
      `call-notes.test.ts` (a catch-up labelled Cai's from both people's lines; follow-ups by
      their lines, the waiting one naming the other speaker, a line out of range skipped, none
      offered twice; refused with AI assist off and for someone not in the call), the E2E
      `call-notes.spec.ts` (Catch me up and Find follow-ups from the call's line), and the full
      gate.
- [x] F7e. A call's notes written up once, as a note-taker would (2026-10-21, PRODUCT-REVIEW R112;
      the owner's "no fragmentation, duplication or confusion across the entire Caime
      intelligence", with Gemini Notes as the example; advantages 1 and 2: a call's next steps
      land with the people they're for, in the relationship, where a note-taker's land in a
      document. The number: of calls with notes, the share that end with notes written for
      everyone who heard it all and each next step offered to its person, every one where the
      asker may use AI assist, where none had them unless someone asked). Once a call with notes
      ends and every word is heard, the `call.notes.summary` job (`lib/call-notes-summary.ts`)
      writes them once (`ai.callNotes`, prompt `notes-summary`: what it was about, up to six
      topics with their points, what was decided, the next steps by person with their line and
      any deadline as said), in the language most of the call was heard in, on the asker's day
      by cost and their plan's model, kept on `call_note_summaries` (migration 0145) with the
      call's line and erased with it. Whoever was in it for all of it reads them above what was
      said (`CallNotesResponse.summary`, `NotesSheet`); someone who came in later keeps "Catch me
      up" and "Find follow-ups" on what they heard. Each next step is its person's suggestion by
      its line (`ai:callnote:<line>:task`, F7d's key), the other one's wait in a call of two, a
      decision the asker's; each is told once, in their own words. A line its speaker deletes
      takes back what was drawn from it and not yet answered, and writes the notes again,
      unannounced. The steps are offered as Cai's own initiative (R66) to whoever has AI assist
      on; the latest ask writes them (`requested_at`), and a busy model or the asker's hour used
      up puts them off. Costs: on devices, the first download 448.8 KB of 450 as before, the conversation's chunk 91.4 KB as before, and the notes sheet's 2.9 KB, loaded when the notes open; on the server, one job and one model call a call with notes (a deleted line's rewrite once, by its latest ask), €0.0091 at the bounds on the light model and €0.36 on the top model (61,477 tokens in, 8,192 out), on the asker's day. Verified: `call-notes.test.ts` (written once
      for both, each step its person's and the other's wait, a decision the asker's, nobody
      outside the call; told once; a deleted line's steps gone and the notes written again
      without it; nothing heard, nothing written and no model asked; gone with the call's line;
      a busy model waited out; nothing offered to someone who wants Cai to do less or has AI
      assist off, both told; two lines deleted a second apart written up again once),
      the E2E `call-notes.spec.ts` (the write-up in the sheet from the call's line, without the
      buttons it replaces), and the full gate.
- [ ] G. Integration framework and governed AI (REVIEW §11): credentials (key outside the
      database with a key id and re-seal, a downscoped picker token, sealed webhook secrets,
      rotation); per-use health, Google and Microsoft probes, a freshness gauge, a reconnect
      notification, an operator dead-letter view; the connector interface with stand-ins,
      per-item dead-letter, `Retry-After`, single-run sweeps; audit rows for accounts, automations
      and policies, deliveries purged on erasure, an organization policy over members' tokens;
      real response schemas and webhooks in OpenAPI, a forward-compatible versioned SDK on npm, a
      sandbox; a person event feed and personal webhooks; recipes per conversation and space,
      organization-installed apps, posting as an app into a space, slash commands as signed
      deliveries; Cai with sources everywhere, read-only tools over the person's own records,
      voice transcripts analysed, the agent's review mode, on/off per action, office hours and
      citations, a nightly evaluation harness with prompt hashes, golden-set hardening, allowance
      by tokens with no silent search spend (by cost, priced by H7's `lib/ai-costs.ts`: a count a
      day bounds nothing), a recording's length read from the file before it's sent, private
      content filtered and refused on the server.
- [x] G1. Credentials (2026-10-19, review §8 H2 and M, §11 (b); advantage 5, privacy that
      follows from the business model, for an organization's integrations as for its people; the
      number that shows it: credentials kept in clear, every webhook secret today, none once G1b
      ships). An organization's webhook secrets are sealed by
      the vault's key (`lib/app-secrets.ts`, bound to the app, migration 0130), as connected
      accounts' tokens are, and the vault's pass seals the ones kept only in clear (with or without
      `VAULT_KEY`, once a deployment's overlap is over), seals again one that no longer opens to its
      clear copy, moves them to a new key, counts them with the tokens and keeps the database's key
      while it seals any; a removed app keeps none of its secrets, a replaced one is forgotten past
      its day, and a delivery whose secret no key here opens is never sent unsigned. This release
      still writes the clear copy and signs with it while it's there, since the release before reads
      that alone while a deployment overlaps. Google's picker page opens once by its ticket
      (`spent_tickets`, migration 0131, swept daily) and hands the browser an access asked narrowed
      to the files picked (`drive.file`), the connection's own where Google answers with more,
      counted by `caime_picker_access_total` so whether Google narrows is read in production, not
      assumed. An OAuth app's developer replaces its client secret from Developer (shown once, the
      old one still taken for a day, migration 0132, then forgotten), in four languages. An
      organization's app token is still replaced at once: a replacement is how a leaked one is
      stopped. Not done: G1b, the next release, empties the clear copies and reads the sealed ones
      alone, and the one after drops the columns (`-- contracts after` G1b); whether Google narrows
      a renewed access is unverified (the counter says). Verified: `apps.test.ts` (sealed beside the
      clear copy and never in it, signed by the sealed one alone, a replaced one sealed and both
      signing for its day, an unopenable secret never sent, the pass at start queued once past the
      overlap and sealing an older release's clear secret, again one replaced meanwhile, forgetting
      a removed app's and a replaced one past its day; with `VAULT_KEY` every app's secret moves and
      the database's key goes), `vault-keys.test.ts`, `cloud-files.test.ts` (the narrowed access on
      the page and never the connection's, the ticket opening once, a stale one never, the
      connection's own where Google won't narrow, counted), `oauth.test.ts` (the new secret and the
      old for a day, then the new alone, only by its developer, only for an app with a secret,
      audited), the catalogs in four languages, and the full gate.
- [x] G1b. Webhook secrets sealed alone (2026-10-19): nothing reads or writes the clear copies any
      more, migration 0134 empties those whose sealed copy is kept, and the vault's pass only moves
      secrets to a new key and forgets what signs nothing. Verified: `apps.test.ts` (a new app's
      secret and a replaced one sealed and never in clear, both signing for its day, never sent
      unsigned, a removed app's and a replaced one past its day forgotten, every one moved to a new
      `VAULT_KEY` at start), and the full gate.
- [x] G1c. The clear columns dropped (2026-10-19): migration 0136 drops
      `org_apps.webhook_secret` and `previous_webhook_secret`, marked `-- contracts after
      c1076d0`, G1b's commit, which production ran first; nothing keeps a webhook secret in clear.
      Verified: `apps.test.ts` (no such column left, a new and a replaced secret sealed and never in
      clear), the migrations lint against `origin/production`, and the full gate.
- [x] G2. Connected accounts that say how each use is doing (2026-10-19, review §8 H3; advantage 3,
      the door link whose bookings respect the professional's calendar, and the number that shows
      it: connections failing unseen, from any to none). The busy read and the plan push each keep
      when they last worked and why their last try failed (`unanswered`, `refused`, `limited`;
      migration 0133), so a good read never hides a failing push or clears it, and `pushed_at` is
      written only when a push works. A 429, or Google's 403 for a rate, sets how long the provider
      asked Caime to wait from its Retry-After, which reads, pushes and both sweeps honour; a failed
      push is tried again an hour on, and a failed read isn't asked again for every slot. A network
      blip or Caime's own client turned away no longer marks the person's connection; a grant that's
      gone asks to be connected again and tells them once (a notification opening Settings · Apps,
      in four languages). Each account's row says when its calendar was read and its plans written,
      and each failing use in words. Google's and Microsoft's sign-in join provider health (their
      token address asked to renew a token that can't exist: `invalid_grant` is up, `invalid_client`
      down), and `caime_connected_accounts{use,health}` counts them, with an alert in DEPLOY.md.
      Not done: a per-event record of what failed to write, and the operator's view of failing
      connections (G). Verified: `account-health.test.ts` (a failing push beside a good read, a 429
      and Google's 403 waited out with nothing asked meanwhile, a refusal said apart, a blip and
      `invalid_client` blaming no account, the counts on /metrics, the probe up and down, a grant
      gone told once and nothing asked of it after), `connected-accounts.test.ts`,
      `calendar-sync.test.ts`, `cloud-files.test.ts`, `sw.test.ts` (the tap opens Settings · Apps on
      the web and a phone), the catalogs in four languages, and the full gate.
- [x] G3. An organization's say over its members' own apps, and audit rows (2026-10-19, review §8
      H4; advantage 5, privacy that follows from the business model, now for the organization that
      answers for its customers' words; the number that shows it: an organization's conversations
      reachable by a team member's own token without its say, every one before, none now). An
      organization keeps its conversations from its team's own apps until its owner or an admin
      turns on "Team members' own apps" in its setup (`organizations.member_apps`, migration 0135,
      off by default; `OrgView.memberApps` for its team): a token acting as someone on its team who
      doesn't run it (a personal token, a bridge, an OAuth app they let in) is refused the team's
      side of its customer threads, its spaces' conversations and a thread written as it (R64) with
      `403 org_apps_closed` in four languages, only once the person is in the conversation, and the
      inbox, search and actions it reads leave them out (`lib/member-apps.ts`: one query for the
      person's closed organizations, nothing more when there are none). The person's own
      conversations, a customer's side and Caime's own app are never asked; the owner and admins
      decide, so their own apps are their choice. The switch is audited with who turned it, and
      connecting or disconnecting an account (which and for what, never its address), making,
      changing or removing an automation and setting, changing, removing or resetting a rule now
      write audit rows (what changed, never what it says or whom it's for); search's actions read
      `visibleTasksSql` as every reader of actions does. Verified: `member-apps.test.ts` (refused
      and left out by default, never for Caime's app, the owner's token or the customer's, let in by
      the owner and not by a member, audited once per change, a thread written as it kept once its
      writer no longer runs it, automations' and rules' audit rows without what they say),
      `connected-accounts.test.ts` (the connect and disconnect rows, no address),
      `dpa-draft.test.ts`, the catalogs in four languages, and the full gate.
- [x] G3b. A member's own calendars by the organization's say (2026-10-19, the rest of review §8
      H4; the number: customers' names written into a team member's own calendar without the
      organization's say, every booking they do before, none now). A calendar of a person's is one
      of their apps: while an organization keeps its conversations from its team's own apps, the
      feed and the plans written to a connected Google or Outlook calendar show its cards and
      actions as their kind, its name and the time ("Meeting · Nile Dental", "Action · Nile
      Dental"), never the customer's name, the card's own words, its place, an amount or an
      action's notes (`keptFromApps`, one query more only for someone on a team that keeps them);
      turning the switch either way queues the team's pushes at once rather than at the hourly
      sweep, and the setup's switch says calendars too, in four languages. Caime's own calendar
      screens are never asked. Verified: `member-apps.test.ts` (the feed and the written plans
      without who, what or where, Caime's own calendar whole, let in and they say it again, the
      owner's own never kept), `calendar.test.ts`, `calendar-sync.test.ts`, the catalogs, and the
      full gate.
- [x] G4. Plans one event can't hold up, and the operator's view of connections (2026-10-19,
      review §8 M and §11 (d)(e); advantage 3, the door link whose bookings land in the
      professional's own calendar; the number: plans asked again forever with no record, every
      refused one before, none now). A plan a connected calendar refuses on its own (a 400, say;
      never a grant gone, a wait or an outage, which stop the run as before) is that event's alone:
      kept in `calendar_push_failures` (migration 0137) with what it was refused as, sent as it is
      core `PUSH_TRIES` (3) times at most while the rest go in, then left until its card changes;
      one Caime can't take out is let go after its tries and stays in their calendar. The
      account's row says how many wait ("Google refused one of your plans", four languages), the
      person's export lists them beside what was written, the privacy page says what's kept of
      one (and G3b's rule for an organization's bookings), `caime_calendar_plans_stuck` counts
      them with an alert in DEPLOY.md, and the operator's `GET /v1/admin/connections` lists how
      every use last went and the connections not working by whose they are, never an address or
      anything read or written, audited with the operator's name. Not done: the connector
      interface (Google and Microsoft still branch in each file that talks to them). Verified:
      `calendar-push-failures.test.ts` (the rest written beside a refused one, its tries and then
      nothing asked, the count on the row, /metrics and the operator's list without an address,
      the export, written again once its card changes, a removal let go), `account-health.test.ts`,
      `calendar-sync.test.ts` (the privacy page), `connected-accounts.test.ts`, the catalogs, and
      the full gate.
- [x] G5. What reached a person, for the bridges (2026-10-19, review §8 M and §11 step 6; the
      condition, not an advantage (§14): Caime reaching the apps people already use. The number:
      recipes that start on a new message, none before, since the inbox lists conversations and has
      no "since"; now every message, none passed over, counted by `caime_feed_reads_total`). `GET /v1/feed` (`messages:read`, `PERSON_ROUTES`, the OpenAPI document, the
      SDK's `feed()`, the MCP's `feed` tool) answers each new message in the person's conversations
      as an event shaped like a webhook delivery (`id` the message's, `event: 'message.created'`,
      `data`: the conversation as their inbox names it, through the title rule the two now share in
      `lib/conversation-titles.ts`; who sent it, the organization to its customer; its words or what
      it is; a card as a webhook says one; the `MessageView`). Without a cursor the newest first, for
      a poller that dedupes by id; after `next`, oldest first, gap-free: each message keeps the
      transaction that wrote it (`messages.tx`, migration 0138, no backfill) under a partial index
      built concurrently (0139), and the feed reads only below the oldest transaction still running
      in this database (the snapshot's running ids matched to this database's sessions, so a
      transaction elsewhere on the server never holds it back); a page not full moves the cursor to
      that horizon. The cursor is sealed to its person; one from beyond the database's count (a
      backup restored into a new server) is refused, and `caime_feed_forget()` forgets the restored
      rows' transactions (DEPLOY.md). It reads as the inbox does (never the team's side of an
      organization's conversations, a request not yet taken, a private conversation, a line Caime
      wrote, a chat brought over, a notice, or what was deleted, hidden or ran out; the person's own
      only with `mine=1`), keeps G3's rule for an organization's conversations, allows sixty reads
      a minute and counts them (`caime_feed_reads_total{mode}`). The bridge sheet shows the feed's
      address beside the token, and Zapier's line names Retrieve Poll on it with Key `events`.
      Costs: one eight-byte column and one index entry per message sent; a read is the horizon (a
      snapshot and this database's sessions), one index probe per conversation of the person bounded
      by the page, and the views of at most a hundred messages. Not done: personal webhooks (the
      same events pushed), and kinds beyond a new message (a card moved, an action asked of them).
      Verified: `feed.test.ts` (newest first with where and who; after a cursor, a page at a time;
      a transaction still writing holds the feed back and nothing is lost; one in another database
      never does; what's left out; a customer hears the organization; refused cursors; the token's
      route and the counter; the restore procedure), `business.test.ts` (no team id or name in the
      customer's feed), `member-apps.test.ts`, `personal-tokens.test.ts`, `sdk.test.ts`, the MCP's
      `server.test.ts`, `openapi.test.ts`, `messaging.test.ts`, the catalogs, and the full gate.
- [x] G6a. An agent its organization can answer for (2026-10-19, review §10 "for a clinic" and
      §11 "governed AI"; advantage 7, governed, honest AI for the people who are liable. The
      number: answers the team can open to what they rest on, none before, every one resting on
      what the agent was told now; hand-overs counted by why, `caime_agent_actions_total`, the
      hand-over rate the nightly set (G6c) will hold). What the agent was told is numbered a
      sentence a passage (core `knowledgePassages`, every word kept, the same numbers each time)
      and every answer names the passages it rests on: kept on the message as `payload.cited` (the
      passage's words, at most five, numbers it wasn't given dropped), read by its team in the
      message's sheet from a "Sources" link under the answer and in the try box, and taken off for
      the customer by `maskPayload` (the conversation, live events, the feed, the export) and off a
      forwarded copy. Its owner and admins say what it may do (`org_agents.may_book`, `may_order`,
      migration 0140, on by default, as before): kept from booking it offers no times and hands a
      booking over, kept from orders it gets no menu and hands an order over; and when it answers
      (`answers_when`: always, or only while the organization's hours say it's closed, so its
      team answers first while open and the greeting goes out then; without hours it answers),
      each change audited with what it was. Handing over, it says why (`unknown`: what it was told
      doesn't say; `person`), and the rules add `limit` and `refused` (a booking or order it
      couldn't make). Every model call keeps the version of its instructions on `ai_runs`
      (`prompt_hash`, a short hash of each feature's template written out with fixed
      placeholders, `PROMPT_VERSIONS`; the agent's includes its output schema). Costs: the numbers
      add a few tokens to the agent's cached prefix; the hash is computed once at start. Not done:
      review before send (G6b), a list of what it couldn't answer (G6b), the nightly evaluation
      (G6c), and `sources[]` for Cai's own answers and suggestions. Verified: `agents.test.ts`
      (numbered passages to the model, the citations the team reads and the customer never does,
      in the conversation, the feed and a forward; the switches' refusals and their audit rows; an
      answer only while closed, and without hours; the counts by reason; the try's citations; the
      prompt version on every run), `org-replies.test.ts` (the greeting while it waits for closing
      time), `ai.test.ts` (the version on another feature's run), core `agents.test.ts`, the
      catalogs in four languages, the E2E (the try's passage, the switch and the choice, the
      team's Sources and none for the customer), and the full gate.
- [x] G6b. Checked before it's sent, and what it couldn't answer (2026-10-19, review §10 "for a
      clinic": no review-before-send mode, no report of unanswered questions; advantage 7. The
      number: an organization's AI answers a customer reads that no person checked, every one
      before for a clinic that wanted otherwise, none now with the switch on; and the questions it
      couldn't answer, kept for the team to add to what it knows, none before). With "Check its
      answers before they're sent" on (`org_agents.review`, migration 0141, off by default), the
      agent's answer, booking, order or close waits in its conversation as a draft for the team
      (`agent_drafts`, one per conversation, the newest in its place): what the customer would read,
      what sending it also does ("Sending it books Cleaning for Thu 10:00"), the sentences it rests
      on. Anyone on the team sends it as it is (the agent's words, said to be an AI's, with who
      checked it on `payload.checkedBy` for the team alone, and the booking or order made with the
      times and the menu read again then), takes its words into their own reply (Edit), or lets it
      go; a newer customer message, a person writing there or the conversation resolved ends it, and
      a draft is sent once. Handing over while checked, it tells the team and writes nothing to the
      customer, and its organization's greeting and away message go out meanwhile (its own words,
      never the AI's). Its run counts against the plan when the draft is written, as it cost a call, and is
      given back when the draft is let go, replaced or its agent removed (which takes every draft
      with it). The team is told of a
      draft ("{agentName} drafted an answer for you to check"), the Business inbox row says "AI draft
      to check", and each send or letting go is audited. Whatever it hands over because what it was
      told doesn't say (`unknown`) is kept as the customer's message by reference (`agent_questions`,
      gone with the message, the conversation's erasure and the organization's clearing), listed for
      its owner and admins on the agent's setup ("2 questions it couldn't answer") with Open and
      Done. Both are in the organization's export with the agent's switches. Costs: a draft row per
      conversation waiting, one query for a page of the inbox, a question row per hand-over it
      couldn't answer. Not done: editing a draft in place before sending it as the agent (Edit makes
      it the person's own reply), and the nightly evaluation (G6c). Verified: `agents.test.ts` (a
      draft instead of a message, the customer seeing nothing of it, the team reading it whole and
      told, sent once as the agent's with who checked it hidden from the customer, the plan counting
      it as written and giving back what was let go, replaced or removed with the agent, a newer message, a person's reply and Edit ending it, a booking made only when
      sent, handing over without a word to the customer, the questions listed for managers and gone
      with a deleted message, erasure and the export), `org-replies.test.ts` (the greeting and the
      away message while its answer waits), `business.test.ts`, `org-data.test.ts`,
      `fk-indexes.test.ts`, the catalogs in four languages, the E2E (the switch, the draft in the
      conversation, sent and read by the customer), and the full gate.
- [x] G6c. The agent measured every night (2026-10-19, review §10 H, no model-backed path was
      measured; advantage 7's number, REVIEW-2026-10-17 §14: hand-over rate and wrong
      confirmations on a nightly set, none measured before, every night on each model a plan
      gives an agent now). Caime's own set of a clinic's questions (`lib/agent-eval-set.ts`: 24
      cases in the four interface languages, written apart from the agent's instructions: answers
      from the passage that says it, hand-overs by why, a medical question, a refund, times
      offered and booked from the open ones, "so it's confirmed now?", a thanks, and instructions
      a customer plants) goes through the agent's own call (`supportAgent`, the instructions
      customers meet, `PROMPT_VERSIONS.agent` kept on the run and each call's `ai_runs` row, for
      nobody) once a night on each model the plans give an agent (`modelFor`: the light model on
      Free, the top one on Business; a model two tiers share, once), and is scored by rules
      (`scoreCase`, never a model): what it did, why it handed over, what it rests on, the
      language it answered in (core `writtenIn`), a slot not listed, words only a planted
      instruction would write, and `claimsDone`, saying in any of the four languages that
      something was confirmed, booked, cancelled or refunded, never what will be once someone
      acts or isn't yet. What it found (cases handled as they should be, hand-overs missed or
      needless, wrong confirmations, instructions followed, answers resting on nothing, the
      tokens and what they cost, each failing case by id) is kept for every instance
      (`server_settings` `agent.eval`), on /metrics (`caime_agent_eval_cases`,
      `caime_agent_eval_findings`, `caime_agent_eval_last_run_timestamp_seconds`, by tier), for
      the operator (`GET /v1/admin/agent-eval`; `POST …/run`, a job, audited), and on an agent's
      setup as one line for the model its plan gives it ("23 of 24 test questions handled as they
      should be · 0 wrong confirmations · Caime tests it every night", gone after three days
      without a run). A failed call asks nothing and is counted apart. `AGENT_EVAL_ENABLED` (on
      where AI assist is; the tests and the E2E off). Costs: 24 calls a night on each model, at
      most €1.20 a night at their ceiling (a token a character, every answer at 2,048 tokens,
      measured by `agent-eval.test.ts`), recorded under `agent_eval` in the operator's AI spend
      and never in anyone's; nothing on devices. Not done: the real models' first numbers, which
      production's first night writes (this container holds no key: ⛔ `ANTHROPIC_API_KEY` is
      production's alone); measuring Cai's own answers and suggestions (faithfulness, finding
      follow-ups) and the golden-set hardening G names. Verified: `agent-eval.test.ts` (the set's
      shape and its good answers, claims in four languages and their near-misses, the scoring,
      a run on two models through the agent's own call and version, a bad night's counts, the
      gauges, the operator's routes and their audit rows, the owner's line by plan), the
      catalogs in four languages, and the full gate.
- [x] G7. Nothing from a private conversation on the server (2026-10-19, review §10 M "private
      content reaches the model"; advantage 5, privacy that follows from the business model. The
      number: to-dos and decisions the server would keep, and titles a model would be handed,
      from a private conversation, one way each before (a token's request, Ask Cai in Search),
      none now). The app never offered an action or a decision from a private conversation, but
      the server took one from anyone who asked (a personal token, an app, an accepted
      suggestion): `createTask` and `createDecision` (`lib/actions.ts`, the one way every path
      makes either) now refuse a private conversation ("Nothing from a private conversation is
      kept on the server.", in four languages), and whatever an older row ties to one stays out
      of the server's search (to-dos and decisions), Ask Cai in Search (so the model is never
      handed its title), and what Cai writes into its own chat, which the server keeps and a
      model reads later: the morning brief (`openFor` with `forModel`), the digest's oldest wait
      and a follow-up's offer (a plain reminder instead). Costs: a query on the conversation's
      class when a to-do or a decision is tied to one; nothing on devices. Verified:
      `private-reach.test.ts` (the refusals by route, a to-do tied to nothing and a standard
      conversation's decision as before, older rows left out of search, the model's input, the
      brief, the digest and the follow-up), the server catalogs, and the full gate.
- [x] G8. A voice note's words read like typed ones (2026-10-19, review §11 "voice transcripts
      analysed"; advantage 1, the relationship's memory: what was asked and promised, however it
      was said. The number: suggestions and asks read from a transcribed voice note, none
      before, the same as for its words typed now). A transcript was kept as the note's body,
      searched and previewed, but nothing read it: a promise said aloud never became a reminder,
      an ask never read "Asked you to do something" in the inbox, and its "Friday" was no date.
      Now the job reads the words as its sender's typed words at the note's own time
      (`analyseText` with their zone, locale, week and country: entities, `is_question` and
      `is_request` in the transcript's own update), and `afterTranscript`
      (`lib/message-effects.ts`) offers what a text would have: each side's suggestions once by
      fingerprint, a customer conversation's through `suggestBusiness` (R15), a chat's follow-up
      check and emerging topic; nobody is told again. The adult check reads `minorOf`: it read
      the date of birth alone, so someone a check of their age found under 18 (M16 B7) had their
      notes sent to the provider. Costs: one rules pass over a note's words (ten minutes at
      most) and the effects' few queries per transcribed note; no model call, nothing on
      devices. Verified: `speech.test.ts` (an ask heard a day after it was said, dated from when
      it was said, each side offered it once, the inbox's reason; a customer's spoken ask filed
      for whoever has the thread; an age check's minor never sent), each failing on the old
      code, and the full gate.
- [x] G9. AI by what it costs (2026-10-19, R107; review §5 M "allowance per call not per token;
      search spends it silently", R106's next step; advantage 4, one flat price that holds. The
      number: a month at a plan's edge, by cost: Pro €70.89 where it was €2,178.96, a Business
      agent €907.07 where it was €14,061.74, a free person €16.60 against the €20 the test holds,
      and a search's reading a 1,250th of a free day where it was one of ten assists). Every call
      is priced as it runs (`ai_runs.cost_usd`, migration 0142, through `chargedUsd`: a model or
      provider the list doesn't name counts at the dearest listed rate, never as nothing). A
      person's AI assist is euros of model time in any 24 hours (`aiEurPerDay`: Personal €0.50,
      Pro and a Business seat €2, an Enterprise seat €10), refused once spent with when there's
      room again, the moment enough of the day's calls have left the window ("There's more
      tomorrow at 9:00 AM", in four languages); Settings · Plan's meter fills by the share and says
      what's left in words, never a price or a count. An organization's agent keeps its answers a
      day ("up to" on the pricing page) and gains a backstop by cost (`agentEurPerDay`: €0.30, €30,
      €300) the test holds above a day of its count at the assumed answer; past it the agent
      waits as past the count, and the organization's plan says until when (`agentHeldUntil`).
      Costs: one indexed sum per AI check, as the count was (a second, ordered read only once a day
      is spent), and a float per call; nothing on devices. RESOURCES.md's tables were produced
      again from `ai-costs.test.ts` (the agent's prompt had grown since H7: 56,082 characters at
      its bound, so Business's €29 now covers 76 answers a day on Opus 5.5, not 79). Verified:
      `ai.test.ts` (a spent day refused with its time, the share 1 then 0.96 as the oldest call
      leaves, a real call priced as it ran, an unlisted model charged at the dearest rate),
      `agents.test.ts` (long answers holding a free agent short of its count, the plan's time),
      `plans.test.ts`, `ai-costs.test.ts` (the free edges, the backstops above a day of answers),
      `public-pages.test.ts` (the pricing page's lines), the catalogs in four languages, the E2E's
      plan screens and the full gate.
- [x] G10. The golden sets hardened (2026-10-19, review §5 M "Measurement": "the due-date floor
      is pooled across languages", "48 Arabic lines in all, 4 Arabic decision positives, no Gulf
      or Maghrebi dialect lines; amounts, `chatIntent` and search unmeasured; 'Quite sure'
      hand-set"; advantage 6, Arabic-first intelligence by dialect, and its number: the floors per
      label and language). Every new line was written before the rules were measured on it. The
      golden set grew to 465 lines, at least 15 positives of each label and 15 dated lines in each
      language, the due date held per language on the writer's own clock (a pooled UTC day had
      read "tonight" in New York as tomorrow). A held-out set of Arabic as Cairo, the Gulf, the
      Levant and the Maghreb write it (156 lines, 39 each, a third negatives) that no rule is fixed
      against. Golden sets of their own for amounts (90 lines), what's written to Cai and the friends
      (100) and Search (64, each query in its reader's language). And "Quite sure" and "Fairly sure"
      checked against how often such a suggestion is right over both sets (124 of 124 and 181 of
      185; the words promise nine in ten and three in four). Measured before any fix: Arabic requests
      at recall 0.61, promises 0.67, decisions 0.59 and the due date 0.60 on the golden set; on the
      held-out set, promises at 0.57 in Cairo and the Gulf, 0.29 in the Levant and 0.00 in the
      Maghreb, due dates 0.57, 0.43, 0.43 and 0.14; amounts in Arabic at precision 0.75 and recall
      0.60 (a currency word took the word after it: "١٢٠٠ ريال للفندق" came back in the currency
      "ريال للفندق", which a conversation's memory showed); Cai's intents right on 62% to 67% of
      lines ("summarise my week" got the week's list, "what am I waiting for from Ana?" every wait);
      Search reading 63% of Arabic and Turkish queries right. Fixed in the rules alone, against the
      golden set's lines: Arabic promises from the stems each dialect's future mark takes (Cairo's
      "ه", the Levant's "ح" and bare "رح", the Gulf's and the Levant's "ب", the Maghreb's "غادي ن",
      "باش", "راني", MSA's "سـ"), "أوعدك", a bare first person's verb once the sentence says when
      or takes it on, negation held to its clause, a meaning once or a guess, a habit; requests by
      the Gulf's "تكفى", the Levant's "دخيلك", Morocco's "عافاك", "متنساش", "يرجى", "ذكرني",
      "صيفط ليا", "دز لي", a "please" at the end; decisions by "استقرينا", "اخترنا", "تفاهمنا",
      "حسمنا", "وافقت … على", "القرار النهائي"; "ما" a question only before what it asks about;
      tomorrow as the Gulf ("باكر", "باچر") and the Maghreb ("غدوة") say it; English hedges and
      "we've picked", "deal,"; French "on s'est mis d'accord", "va pour"; Turkish "onayladı";
      amounts' currency word taking only a country, "ج" as Egypt's pound, codes and "$" after the
      number, amounts in words in all four languages and a bare amount in a sentence about money;
      Cai's four questions in each dialect's and language's words, a list only when that's all the
      message asks, and a question about one person left to the model, which reads the names;
      Search's "pdfs Maya sent", "قال إيه عمر عن العقد", "اللي طلبه مني كريم", "رسائل خالد عن
      السفر", "les PDF envoyés par Léa", Turkish's time before what it's of ("geçen haftaki
      bağlantılar", "Ayşe'nin geçen ayki belgeleri") and what people call a relationship
      ("coworkers", "أهلي", "iş arkadaşlarım"). After: every golden set at 1.00 in every language;
      the held-out set, which none of it was fixed against, at promises' recall 1.00, 1.00, 1.00
      and 0.86, requests 0.86, 1.00, 0.86 and 1.00, decisions 1.00, 0.83, 0.67 and 0.83, and due
      dates 1.00 in all four, its floors set there. One held-out line showed a gap (a promise joined
      by "و" after a refusal); its rule came with its own golden line and the held-out line stays
      counted. Left as the held-out set still reads them: reported speech without quotation marks
      ("قالي هبعتلك الفلوس ومبعتش"), "اعتمدت الإدارة", Levantine "منمشي", "ليش لأ", "كيفك" without
      its mark, "معلش ابقى هات"; Arabic written in Latin letters (Arabizi) isn't read at all; Cai
      answering "from Ana" by the rules is the qualifiers step. Costs: rules only, nothing on the
      server's or a device's clock worth a number; the app's first download carries the few
      relationship words. Verified: the five golden tests (`intelligence-golden`,
      `intelligence-heldout`, `amounts-golden`, `chat-intent-golden`, `search-golden`), core's 813
      tests, and the full gate.
- [x] G11. Cai about one person, by the rules (2026-10-19, review §5: "Qualifiers are dropped
      ('what am I waiting for *from Ana*' lists every wait). Nothing can answer 'what did Ana and
      I agree, is it in my calendar, did she pay'"; §13 G's "read-only tools over the person's own
      records"; advantage 1, the relationship is the object, and 8, the graph: "my landlord" is
      someone because they were labelled so. The number: questions about one person answered
      without a model, none before (the model, for an adult with AI assist on and an allowance
      left, else "That one's beyond me"), every one of the golden set's 110 lines now, in four
      languages). Core `chatAbout` reads six questions about one person (what you wait on from
      them, what they asked of you, what you said you'd do for them, when you see them next, what
      you agreed, whether they paid) in English, Arabic as Cairo, the Gulf and the Levant write
      it, French and Turkish, the name as typed, a day beside it ("Ana yesterday") or a handle's
      "@" left out; `aboutRelationship` reads what someone is called in a name's place ("my
      dentist", "the client", "مديري", "أخويا", "mon patron", "annem", "avukatım") as a
      relationship through taxonomy's `relationshipFromWord`, which now prefers a label's own
      word to another's form ("frère" a brother before a sibling) and reads every Turkish "my"
      ending, search's reading too. The server: `lib/people-named.ts` (`peopleNamed`: the person's
      connections and those they're in a chat or a group with, never through an organization's
      conversation (R15), by a word of the name or the nickname, a whole word before the start of
      one, without accents and with Arabic's letter forms as one, in one query the database folds
      as the reader does, `plainColumn`), else the people they keep that relationship with (its
      role, else its sphere, or a label of their own); `aboutAnswer` in `lib/system-accounts.ts`
      answers from the records with them alone: to-dos through `visibleTasksSql`, a promise as one
      said it in their chat, meetings and appointments ahead in conversations with them
      (`cardsAhead`), decisions there, Pay cards in which they pay the person (`paySides`), five
      lines at most, each naming whose when the name meant several people, and "I don't know who
      “Zed” is among your people." when it meant no one. Cai and every friend answer it, in the
      Arabic it was asked in too (R72: each line in the Egyptian, Gulf and Levantine overlays),
      and "how can you help" says so. Nothing from a private conversation; and, found in passing,
      Cai's answers to the four questions about one's own things now leave out what an older row
      ties to one too (G7 had covered the brief, the digest and a follow-up, not these, which a
      model reads later in the chat's transcript). Measured before the rules met them: the
      questions 21 of 22, 18 of 22, 19 of 21 and 17 of 21 (English, Arabic, French, Turkish); the
      lines added once they met the server (a day where a name would be, "to" or "@" before one,
      a day after one, a relationship in a name's place) left the whole set at 25 of 30, 25 of 28,
      24 of 26 and 25 of 26; the relationship words 2 of 10, 5 of 9, 2 of 8 and 6 of 8 as search
      had read them; all at 1.00 after, the floors set there. Left: "is it in my calendar" (a
      connected calendar's busy times) and a team member's "did the customer pay", which the
      organization's side and its mask answer differently; a question about someone that isn't
      one of the six still goes to the model, which reads what's open, not the records with them.
      Costs: two to four bounded queries a question (the name, the shared conversations, the
      records), no model and no tokens; nothing on devices. Verified: `chat-intent-golden.test.ts`
      (the questions and the relationships per language), `cai-about.test.ts` (each question, two
      Anas, "Ayse", "my landlord", Zed, Cairo's Arabic without its hamza answered in Cairo's, a
      friend, the private wait), `voices.test.ts`, the server catalogs, and the full gate.
- [x] G12. A recording's length read from the recording (2026-10-19, the G line's "a recording's
      length read from the file before it's sent"; convention 11, nothing trusts device input;
      H7's bound on what a voice note costs, since a speech provider bills by the minute). The
      number: voice notes whose length the server reads rather than takes, every kind Caime's
      apps record (a browser's WebM and MP4, Firefox's Ogg, a phone's m4a), none before (H7
      bounded a note by the length its device said). `lib/audio-length.ts` reads how long a
      recording plays from its own bytes, as a decoder does: Opus by each packet's table of
      contents wherever it's carried (a WebM's blocks, laced or not, in the clusters of unknown
      size a live recording writes; an Ogg stream's packets; an MP4's samples, in chunks or in
      fragments), AAC by its frames at the rate its decoder's configuration gives (HE-AAC's
      core), a WAV by its frames at its sample rate; never a header's duration, a chunk's size or
      a byte-rate field. A recording cut short, one with a picture or a second sound, a sample
      table pointing past the file, or a kind Caime's apps don't record (an MP3, AMR) reads as
      nothing and isn't sent. `transcribe.ts` sends a note only when it plays for ten minutes at
      most, and keeps that length as the run's `audio_ms`, what H7's price list charges. Found on
      the way: a browser's MP4 of sound alone (Chromium's "audio/mp4", Safari's, an Android
      phone's; none says "M4A") was sniffed as a video, so a voice note recorded in Safari was
      kept as a video and never heard; the video cleaner now says which tracks a movie has
      (`soundOnly`), and an MP4 of sound alone is a recording. Left: an MP3 or AMR voice note
      (none of Caime's apps records one) isn't heard; the bubble still shows the length the
      device gave. Costs: one pass over the bytes already read to send them, no decoding;
      nothing on devices. Verified: `audio-length.test.ts` (Chromium's own two-second WebM and
      MP4 recordings read as 1.98 s, a phone's m4a by its frames, HE-AAC, Ogg Opus, a WAV and a
      track that say less or more than they hold, files cut short, a picture),
      `speech.test.ts` (a note longer than its device said judged by its bytes, one that can't be
      read not sent whatever its device said, a browser's MP4 of sound alone heard and kept at
      1.98 s; three of its cases fail on the old code), `video-details.test.ts`,
      `files.test.ts`, and the full gate.
- [x] G13. Cai keeps what it's asked to (2026-10-20, R110; the owner's "Save it as a task", which
      Cai answered with directions to Actions; advantage 2, the assistant that keeps going, R68.
      The number: asks to keep something that end with it kept, every one of the golden set's in
      four languages and none it holds as a near-miss, where Cai kept none). Core `chatSave` reads
      an ask to keep something by the rules in the four interface languages, from its first word
      once what only makes it polite is off (a reminder or an action, its words, or none when they
      point back), and `keptTitle` cuts its time and joiners out ("remind me tomorrow at 9 to call
      Sam" keeps "Call Sam", tomorrow at nine on their clock). Cai and every friend keep it on the
      spot through `createTask` (`keepAsked`, `keepIt` in `lib/system-accounts.ts`: they asked,
      so it's theirs, never a suggestion), with a line that says what and when ("I’ll remind you:
      “Call Sam” · Tomorrow 9:00 AM") and carries the action (`payload.kept`) for Undo and Open
      Actions under it (`features/cai/KeptAction.tsx`, loaded with the first). "Save it" is what
      Cai's model reads "it" as, for whoever may use it (`caiChat` now answers `{ reply, keep }`,
      the reply never claiming what Caime didn't do), else the person's own words before the ask,
      with a time either said; an ask the rules don't read ("could you jot that down for
      Monday?") is the model's to read and is kept as the rules' would be. Left (R110's phases): a
      message drafted to one of their people, a call, a meeting proposed and something found
      (G14), settings and money after. Costs: on the device, the first download 448.8 KB of 450 as before, the conversation's chunk 91.6 KB (91.5 before: the line's check and its import), and the Undo and Open beside a kept line 0.8 KB, loaded with the first; on the server, an ask the rules read asks no model and writes one action, and "it" with AI assist is one light-model call within the day's allowance (R107). Verified:
      `chat-save-golden.test.ts` (102 hand-labelled lines in four languages, every one read
      right; no question to Cai or about someone read as an ask, nor an ask as one of them),
      `cai-keep.test.ts` (a reminder by the rules at nine on his clock, no model asked; an action
      after a lead, and a friend's reminder; "it" without the model from his words before, with
      the day they said; nothing before, so it asks what; with AI assist, "it" as the model read
      it with its details, an ask the rules don't read kept from the model's answer, and a model
      that keeps nothing keeping nothing; Arabic said in her Egyptian; Undo), the system
      accounts' and the voices' tests (each new line in every Arabic), the E2E
      `system-accounts.spec.ts` (a reminder kept and undone; "Save it as a task" kept from the
      line before and opened in Actions), and the full gate.
- [x] G14. Cai does what it's asked with your people (2026-10-20, R110's second phase; the owner's
      "not only actions, Cai shall be capable of handling any things"; advantage 2, the assistant
      that keeps going, R68. The number: asks to write to someone, call them, meet them or find
      something that end with it ready to send or start, all 49 of the golden set's in four
      languages and none of its 22 near-misses, where Cai answered every one with directions).
      Core `chatAct` reads the ask by the rules in the four interface languages, from its first
      word once the polite lead and close are off (`chat-words.ts`, G13's `chatSave` reads through
      it too): a message and its words in the person's own writing (`asWritten`: their quotes and
      Arabic marks; "tell Sami to call me" goes as "Could you call me?", French's "de" as "Tu
      peux … ?", Arabic and Turkish as written), a call (video or not), a meeting with its subject
      and time, something to find. Whom it's for is found as Cai's G11 answers find anyone
      (`peopleMeant`, moved beside `peopleNamed` in `lib/people-named.ts`: a name; a surname taken
      from the words only for a name held whole; "my dentist"); two of a name, Cai asks which;
      nobody, it says so. Cai's line carries the offer (`payload.offer`, core `CaiOfferPayload`),
      shown as it will go, and the person's tap does it as theirs (`carryOutOffer`,
      `POST /messages/:id/offer`, through `postAs`: once by its client id, a block or a request as
      for any send): the message or the meeting card into their chat with that person (opened
      first, as the app opens any, when there's none), a call started on the device, Search
      opened on the words. Nothing reaches anyone without that tap. When the words, the time or
      the person are missing, Cai asks, and the next words finish it within the hour
      (`payload.awaiting`, `answerAwaited`, by the rules). What the rules don't read is Cai's
      model's (`caiChat` answers `{ reply, keep, act }`, told it never sends, calls or schedules
      anything itself), and a friend does what the rules read as Cai does. A drafted message and
      R68's follow-up are drawn by one component (`DraftOffer`) in one module, loaded only when a
      line carries an offer (`features/cai/CaiOffer.tsx`: as two lazy modules sharing it, it moved
      into the first download, 0.7 KB). Left (R110): what changes settings or
      money, each with its own confirmation. Costs: on devices, the first download 448.8 KB of 450 as before and the conversation's chunk 91.4 KB (91.6 before: R68's follow-up moved into the offers' module, 1.8 KB, loaded with the first offer shown); on the server, an ask the rules read asks no model, one they don't is answered within the one call Cai already makes (its request 13,023 tokens at most where it was 11,322 before G13 and G14 told it what to keep and do: €0.0016 a reply where it was €0.0015, the free month's €0.03 as before), and an offer carried out is one send. Verified:
      `chat-act-golden.test.ts` (71 hand-labelled lines in four languages, every one read right,
      and no line the rule answers or G13's keep read as an act), `cai-acts.test.ts` (a draft that
      sends nothing until tapped, then once, as his; "ask Sarah to…" as his own question; a call
      and a search; a meeting about its subject at the time said, as his card; the time asked for
      and given in the next words, and the words too; two Samis asked between and the answer
      taken, a surname picking one; nobody by a name; with AI assist, what the rules don't read
      offered from the model's act, and a plain ask read by the rules with no model; a friend; a
      block), the voices' and catalogs' tests (each new line in every Arabic), the E2E
      `system-accounts.spec.ts` (a message drafted, sent on the tap, in Sarah's chat once), and
      the full gate.
- [ ] H. Business depth: a Business seat includes Pro; a cap on organizations per person; room
      checks inside the transaction; quick replies, away and greeting messages; customer notes,
      tags and fields; tax invoices (counsel); booking and revenue analytics; intake forms as
      cards; a files place per person and space with scoped share links and Office previews; a
      €/user cost model in RESOURCES.md.
- [x] H1. Plans that hold up (2026-10-18, review §9, PRODUCT-REVIEW R100; advantage 4, flat pricing
      for an organization). A seat on a Business or Enterprise team now includes what Pro or
      Enterprise does for its person while the seat lasts: AI assists, files, automations and
      relationship insights read their plan with their seats (one query, `effectivePlan`), Settings
      · Plan says "Included with Tiles Co's Business plan.", the settings row names the
      organization, and nothing is billed or sold over it. An owner runs at most three
      organizations on the Free plan at once, counted under their lock as one is made or taken
      back; one moved to Business, or closed, makes room, and the pricing page says so. A plan's
      room for an app, a conversation the team starts and a resumable upload is counted inside the
      transaction that takes it, under the organization's row or the person's lock, so two at once
      never both pass at the limit. The pricing page names paid plans by their product names
      (French read "Entreprise" for Business beside "Enterprise"), and billing's "You're on Pro
      already." was English in every language. Not done: a direct upload still checks before its
      row is written (at most one file over, as before), and a free organization's agent still
      answers on the top model (the light model for free organizations waits for the cost model).
      Verified: `plans.test.ts` (a seat's plan, its insights and its end; the cap's refusal, another
      owner's count their own, a Business one making room and two asked at once taking one; two
      apps at once, two uploads at once), `business-start.test.ts` (the day's last start to one of
      two asked at once), `billing.test.ts`, core `plans.test.ts` (`planWithSeats`), the catalogs in
      four languages and the server's, and the full gate.
- [x] H2. An organization's own replies (2026-10-19, review §9, PRODUCT-REVIEW R101; advantage 2,
      the door). Quick replies: the owner and admins keep the team's on the setup screen (Replies,
      after the AI agent), a shortcut of one word in any script and the words it puts in, saved
      whole (`PUT /orgs/:id/quick-replies`, one a shortcut however it's cased); the team types "/"
      in a customer's conversation and picks one by its shortcut's start (arrows, Enter or Tab,
      Escape), asked for at the first "/" and refreshed when they change (`business.updated` with
      `quickReplies`). A greeting goes once when a customer writes first or after a quiet
      fortnight, and an away message once each closed spell while the bookable hours say it's
      closed, ending with when it opens again in the customer's language and on their clock;
      neither while the AI agent answers, no away message while someone on the team wrote there
      within the hour, both from the organization's automatic-replies account, marked automated,
      never moving the thread or telling the team, read again when they're sent (turned off since,
      or opened since, nothing); an away message asked for with a greeting says the greeting first,
      so the two arrive in that order however their jobs run. By mail they say they're automatic
      and are never tracked. They're in the organization's export and go when a closed one is
      cleared. Verified: `org-replies.test.ts` (who keeps and reads them, folded duplicates, ids
      kept and foreign ids new, the team told; greeting then away with the opening line, in that
      order when the away's job runs first, once a spell; open hours; the team answering; a quiet
      fortnight; Arabic; turned off before sending; mail's `Auto-Submitted` without tracking; the
      agent; export and clearing), core `opening.test.ts`,
      `e2e/org-replies.spec.ts` (the owner writes all three on the setup screen, the customer reads
      the greeting and "We're open again tomorrow at 9:00", the team puts in /hours), the catalogs
      in four languages and the server's, and the full gate.
- [x] H3. What a team keeps about its customers (2026-10-19, review §9, PRODUCT-REVIEW R102;
      convention 1, the relationship first). One record per organization and customer
      (`org_customers`, migration 0126): a note, tags (one of each however it's cased), and the
      values of the fields its owner and admins define on the setup screen (Customer fields: words,
      a number, a day or one of a few choices; core `fieldValue` keeps a number in any script's
      digits in Latin ones and refuses what a field's kind can't hold). Anyone on the team keeps it
      from the customer's conversation, below who they are in the details ("What your team keeps
      about Lina", the customer never sees it); the inbox shows a customer's first two tags on
      their row and filters by one (`?tag=`), and the team's devices hear which record changed.
      A field taken away takes every customer's value for it; the record goes with an erasure at
      the customer's request, with their account, and when a closed organization is cleared, and
      it's in the export. Verified: `org-customers.test.ts` (fields by the owner alone and read by
      the team, the record kept and refused, nothing in the customer's views, the tags on rows,
      the filter and its counts, a field let go, erasure, an account deleted, export and clearing),
      core `customers.test.ts`, `e2e/customer-records.spec.ts`, the catalogs in four languages and
      the server's, and the full gate.
- [x] H4. What the conversations came to (2026-10-19, review §9, PRODUCT-REVIEW R103; advantage 2,
      the customer books, orders and pays inside the chat). An organization's insights (its owner
      and admins on Business) say what was booked (asked for, confirmed, cancelled, still asked,
      from the catalog; a repeating appointment once), ordered (placed, cancelled, and what the
      rest come to by currency) and paid (Pay cards and invoices marked paid in the period, by
      currency, the largest first, never converted); of the customers who wrote, who bought and
      who came back; what was booked or ordered most; and when customers write, by hour and
      weekday on the organization's clock; each against the period before. The plan's refusal and
      the pricing page say so. The operator's metrics count bookings, orders and the organizations
      with any (`business.commerce`): advantage 2's number. Three queries, over the organization's
      cards (the kit cards' partial index), its paid cards (sent within a year before) and its
      customers' messages; nothing kept. Verified: `org-insights.test.ts` (catalog bookings, one
      confirmed and one cancelled, the team's still asked, two orders and one cancelled, a Pay card
      and a dollar invoice paid, a returning customer, the ten days before, thirty days, owners and
      admins alone, the operator's number), `product-metrics.test.ts`, `e2e/org-insights.spec.ts`,
      the catalogs in four languages and the server's, and the full gate.
- [x] H5. Intake forms as cards (2026-10-19, review §9, PRODUCT-REVIEW R104; advantage 2, the
      customer books, orders and pays inside the chat, and answers there what's asked before a
      visit). An organization's owner and admins keep up to ten forms on the setup screen (Forms,
      after the customer fields): a name, a line before the questions and up to twenty questions
      (words, several lines, a number, a day, one of a few choices, yes or no; needed or not), an
      answer kept in one of its customer fields where the kinds agree (a choice kept so asks the
      field's choices). Its team sends one from a customer's conversation (the cards offer Form to
      the organization's side alone, once it has one), and an item of its catalog may name one ("A
      form to fill in"), which its automatic-replies account sends by itself once the item is
      booked or ordered, answering the booking, once. The card keeps a copy of the form; the
      customer fills it in on the card (a sheet on a phone), each answer checked as the server
      checks it, once; both sides read the answers on the card ("Filled in"), the kept ones go into
      the customer's record, whoever on the team sent it is told, and the organization's apps hear
      `kit.moved` with the questions and the answers. A blocked, closed or suspended organization
      takes no answers, and someone reached by mail is sent none. A model reading the conversation
      reads the form's name, never its answers; the answers are in the customer's export, the
      forms in the organization's, and they go when a closed organization is cleared. Not done: a
      form on a visitor's page before an account, files and signatures in answers, and telling the
      thread's assignee when a form the automatic-replies account sent is answered (its booking is
      theirs to confirm in the same conversation). Verified: `org-forms.test.ts` (forms kept by the
      owner and refused to the team and to strangers, a question kept in a field of another kind,
      a choice without choices and a form without questions refused, a choice kept taking the
      field's choices, ids kept, the team's view naming them and the customer's not; a card sent by
      the organization's side alone, never between people nor with a form not its own; answered by
      its customer alone, once, each answer checked, Arabic digits kept as Latin ones, nothing of
      the team in what she gets back; the record keeping the file number and the insurer; a model
      reading "Form: Before your visit"; the form changed and the card not; a booking of an item
      that names it followed by one card from the organization, run twice and posted once, an item
      without one followed by nothing, a form not the organization's let go from the catalog; both
      exports; clearing), `blocking.test.ts` (a customer who blocked the organization can't
      answer), core `intake.test.ts` and `kit-cards.test.ts`, `e2e/intake-forms.spec.ts` (the owner
      writes the form on the setup screen, the team sends it, the customer fills it in on a phone
      in Arabic digits, both read the answers, her record shows 1234), the catalogs in four
      languages and the server's, and the full gate.
- [x] H6. A files place, links to your own files, and Office files read as pages (2026-10-19,
      review §6 and §9, PRODUCT-REVIEW R105; hygiene, said as such in §14: the condition for
      leaving a drive, not an advantage). The files between two people (their chat and its topics,
      the profile's "shared" row now a tap into them) and a space's (its conversations the viewer
      is in): the conversation's Photos, Files and Links sheet across them, saying who shared each
      and in which topic, opening there at the message; never a group's for two people, a request
      still waiting, a private conversation, or what someone deleted for themselves or let run out
      (`readableBy`, now the conversation's own index's rule too). Whoever sent a file gives out a
      link to it from that sheet (`/f/<token>`, shown once, kept as its hash, masked in the log): for
      anyone who has it or only someone signed in, for a day, a week or a month, five open at most,
      taken back with a tap, counted but never who; dead once its message is deleted for everyone or
      by its maker for themselves, past its time, they've left the conversation, their account is
      suspended or gone, or the conversation's organization is closed or suspended; only adults make
      one, never from a private conversation. Its page (for everyone, the app never booted there,
      never cached, indexed or sent as a referrer, `Disallow: /f/`) shows a picture, plays a video or
      a sound, shows a document's words, offers the download and takes a visitor's report naming the
      message and its maker; the bytes are held to so many an hour by link and by address. A Word
      document, a workbook, a deck, a list of values or plain words opens on the web as the server's
      page of what it holds (`/v1/files/:id/view`, `FileView.viewUrl`, the conversation panel's
      documents too): a zip read by its own directory with each part inflated on the thread pool
      under a ceiling (a zip that lies about its sizes stops there), escaped into Caime's own tags,
      no script at all, two read at once and each kept ten minutes; a phone opens the file itself in
      its system viewer. Links are in their maker's export, swept a month after they end, and the
      privacy page says so. Not done: folders, editing together, versions and a trash, full-text
      search inside files, the old binary Office formats and OpenDocument, a signed-in visitor sent
      back to the page after signing in (the page says to open the link again), and the €/user cost
      of a link's bytes (H7). Verified: `files-place.test.ts` (a document's headings, table, escaped
      marks and Arabic; a workbook's shared words, day, number and yes; a deck's slides; 3,000
      paragraphs then cut; a part that says ten bytes and holds seventeen megabytes never read
      whole; a list of values by its separator and quotes, words in UTF-16 and Western encodings;
      the page served to the conversation's people alone, no script, in an Arabic reader's
      direction; the files between two people from both sides, a topic named, another person's
      conversation left out, a stranger's and one's own empty, what one deleted for oneself gone
      for them alone; a space's for its people as each is in its conversations, refused to a
      stranger; a link made by the sender alone, a month refused, a fifteen-year-old refused in
      words, its hash kept and its message named; its page and file for a visitor, counted, never
      the app even signed in, `robots.txt`; signed-in links asking a visitor to sign in and closed
      to someone blocked; a visitor's report naming the message and maker, never the token; taken
      back, run out, hidden by its maker, deleted for everyone, a suspended maker and back; five
      at most; the export without a token; swept after a month), `log.test.ts`, core
      `file-views.test.ts`, the app's `paths.test.ts`, `e2e/files-place.spec.ts` (Noor finds the
      letter on Omar's page, makes a month's link, a visitor reads the letter's words and downloads
      it, the link counts one open and is taken back, and Omar's phone browser opens the Word file
      as its page), `e2e/a11y.spec.ts` (the file link's page in English and Arabic), the catalogs
      in four languages and the server's, and the full gate.
- [x] H7. What a person costs (2026-10-19, review §5 M Cost, §9 and §14, PRODUCT-REVIEW R106; advantage 4,
      the number that shows it: €/person/month served, under the price). Production ran every AI
      feature on Claude Opus 5.5: it sets `ANTHROPIC_API_KEY` and no model, so the light features
      fell back to the top one. The light model is now Haiku 5.5 unless set (forty times cheaper in
      and out), and finding follow-ups and an organization's agent run on the top model only on a
      paid plan (core `aiModel`, `agentModel`; the pricing page says which model each
      organization's agent answers on, in four languages). One price list, `lib/ai-costs.ts`
      (Anthropic's page and the speech providers', read 2026-10-19; the ECB's euro rate of
      2026-10-16), prices a call from `ai_runs`; the operator's product metrics say what the
      window's calls cost (`ai.cost`: in euros, per person active over thirty days, by plan with
      seats, by feature, and the calls it couldn't price). A transcript keeps its recording's
      length (`ai_runs.audio_ms`, migration 0129) and a voice note with none stated isn't sent; the
      agent's runs keep their cache tokens. RESOURCES.md "What a person costs" carries the tables
      `ai-costs.test.ts` writes from each feature's real request at its bounds. Not done: an
      allowance by cost (200 calls a day on the top model reach €2,178.96 at their edge; G), a
      recording's length read from the file before it's sent (G), and the instance's bill per
      person (⛔ the owner's figure). Verified: `ai-costs.test.ts` (the price list, dated ids and an
      unlisted model; a call's cost with the cache, Haiku's long prompts and a recording; nothing
      for an unanswered call; every feature's request at its bounds on its model; the free plans
      held under €20 and €15 a month at the edge; the operator's figure from runs of three plans, an
      agent, a recording and two unpriced), `ai.test.ts` (follow-ups on the light model on
      Personal, the top one on Pro), `agents.test.ts` (a free organization's agent on Haiku 5.5, its
      cache tokens kept), `speech.test.ts` (a transcript's length kept; a note with no length never
      sent), `plans.test.ts`, `product-metrics.test.ts`, the catalogs in four languages, and the
      full gate.
- [ ] H8. An organization's Cai answers its calls (PRODUCT-REVIEW R111, decided 2026-10-21; the
      owner's brainstorm, the caller paying left out: the organization pays, by what the minutes
      cost, as its agent's words are, R107). In order, since none of it stands on air: (a) a
      customer calls an organization: its team rings, whoever answers takes it, and the customer
      sees the organization (R15), where today its conversations hold no call; (b) a call nobody
      on the team answers lands as the agent's offer in the thread, in writing; (c) ⛔ the agent's
      voice (ADR-17: a media service beside the container, or a provider's agent session the
      caller's browser joins), after a streaming speech bake-off on Egyptian and Gulf Arabic with
      English inside, its first word's time measured on a real call, the cost a minute in
      RESOURCES.md, and the provider in `processors.ts` and the DPA first. Who may reach it by
      voice is the organization's audience setting (everyone, its customers, nobody), never a
      price; it opens as it opens every chat (R87).
- [ ] ⛔ H, the owner's: a smaller paid tier; WhatsApp Business in the inbox and reminders by
      WhatsApp or SMS (Meta's approval); Stripe Connect live with local currencies.
- [ ] R98, after C: places as a context for spaces (PRODUCT-REVIEW R98): `spaces.place` from
      one of the owner's places (the copied line, point and scope shown as a fact on the space's
      head), one join rule (invitation, link or QR, ask to join; "ask" by default for a person's,
      "link" for a verified organization's), an organization's updates on its place-space
      through `org_updates`, the organization's page listing the spaces it runs, admins as any
      space's. Declined there: ownerless places and claiming, public reading of a group's words,
      following people, guardians by time spent in a place, finding people by proximity.

## M17 — One intelligence, ahead of the alternatives (docs/REVIEW-2026-10-21-INTELLIGENCE.md)

The owner, 2026-10-21: "ensure that entire Caime intelligence is properly optimal and outperform
its alternatives. Go deeper and wider" (PRODUCT-REVIEW R113). Caime hasn't launched, so nobody has
met any of this: ranked by what it would cost the first people at launch, then by how far it moves
the three reasons to switch: nothing slips, ask anything in your language with sources, an agent a
clinic can sign for. I1 lands before launch.

- [x] I1. Two bugs and the agent's honesty (S each, first): (a) the organization's agent's model
      runs priced as every run is (`recordRun` writes `cost_usd`), so its plan's backstop trips
      and a manager's try counts against their own day; (b) every model answer in the language the
      person reads Caime in (`languageOf`: the catch-up, ask, translate, the call notes' catch-up,
      Ask Cai, the brief, the write-up's fallback), the brief's day on the reader's clock and its
      summary labelled as every model answer is; (c) the agent books or orders before it speaks
      (`makeCard`), says a refusal in a fixed line (`refusedLine`), and the team confirms what it
      books for a customer (the card's `proposedBy` the customer: the customer's inbox reads
      nothing asked of them, the team is told), as it confirms a page's booking; `claimsDone` on
      every live answer, before it's sent or drafted (moved to `lib/agent-claims.ts`); (d) never
      silent: the away message or the greeting while the agent stays out (`agentOut`), a failed
      call tried once more half a minute on, then the customer told it was passed on; (e) the
      light model's calls leave room for thinking within their caps (Cai's 2,048, a friend's and
      search's 1,024) and send no `fallbacks`, which it doesn't have. Verified: `agents.test.ts`
      (the run's price; card before words; the team confirms and the customer can't; a refused
      time, a sold-out order and a false claim each a fixed line and a hand-over; a failed call
      tried again then passed on), `org-replies.test.ts` (greeting and away while it stays out),
      `ai.test.ts` (translate, the catch-up and ask in the chosen language, a question in its own; no fallbacks on the light model), the E2E's
      clinic (the team confirms the agent's booking from the conversation). Drafts are checked by
      the team before they're sent, so a claim in one is held back as in a live answer.
- [x] I2a. Reminders by one rule (S): when an action reminds its owner is core `remindAtFor`
      (server `reminderFor`, run by `createTask` whenever `remindAt` is left out), whichever way it
      was made (a suggestion accepted, Cai asked to keep it, one added by hand, the API): one of
      their own the morning of its day (their brief's hour, else nine) or an hour before an early
      hour it names, never at the moment it's late; a "remind me" at its hour, its morning, or with
      no day the next morning (Cai's line says when); a wait on someone at the hour they named,
      else the end of that day, saying whose it is ("Sami said it would be done by now"), none
      with Cai on "Less"; Attention asks about a wait three quiet days after its day, not after it
      was made; a moved day moves the reminder the rule made, never one chosen by hand. Verified:
      `remind-at.test.ts`, `reminders.test.ts`, the task, Attention, Cai-keep and messaging suites.
- [x] I2b. Promises kept, offered to close (S): when whoever promised something sends it, a
      file, a link, or words that say it's here (core `saysDelivered`: "Sent!", "Here it is",
      "تم", "بعتلك", "c'est fait", "ci-joint", "gönderdim", "tamamdır", never a question, a
      negation or a future in its clause), the one waiting on it, or the one who promised it, is
      offered "Mark done" as a suggestion of its own kind (`done`), never closed by itself (R12);
      only an open, unshared action of that conversation waiting on the sender (the one the
      message answers, else the only one), once an action; accepting marks it done, Undo opens it
      again. Verified: `delivered.test.ts` (12 deliveries and 12 near-misses in each language),
      `reminders.test.ts`.
- [x] I2c. One way a wait is brought up, and cards that follow their words (S): where a wait
      stands is read once (`waitStates`, `lib/waits.ts`: what was waited on arrived, they said it
      would be done by a day now gone, nothing from them where it was asked since it was asked, or
      none of these can be said), and every way it's brought up says that and nothing more: the
      reminder on its day ("No reply from Omar yet", "Still waiting on Omar", "Omar sent
      something. Is it done?"), Cai's follow-up (none for what arrived) and Attention's "Still
      waiting?" (never about what arrived; its sentence by `ask.state`); an ask that became a wait
      with its own day is that wait's to bring up, so the rule's "No reply from X yet" push and
      the chat's "follow up?" stand down for it. A pending card follows an edit of its words (the
      same card, the new day) and goes when they no longer say it, one already answered stays;
      none waits for ever: a card goes a week past its day, a month after it without one, a "Mark
      done" as soon as its action is closed. The number: waits closed within seven days of their
      day (`core.waitsClosedOnTime` in the operator's product metrics). Verified:
      `reminders.test.ts`, `product-metrics.test.ts`, and the Cai, messaging and suggestion suites.
- [x] I3a. A catch-up says how much it read (S): "Catch me up" reads a conversation's latest 200
      messages and 60,000 characters; it now counts everything others wrote since the reader last
      read (`AiCatchUpView.unread`, one count under `readableBy`) and, when it read only the
      latest of it, says so under the summary ("From the latest 39 of 45 new messages."), never
      passing for the whole. Verified: `ai.test.ts` (45 long messages: all 45 counted, the latest 39 read).
- [ ] I13. Cai in a call in three modes, Notes, Record and Interact (R114; the owner's report and
      brainstorm of 2026-10-21, ahead of I3):
  - [x] I13a. Better words, and nothing left at the provider (S): an utterance ends after a second
        and a half of quiet (was 0.9 s), past twenty seconds at the next breath; the notes heard
        clean (Scribe's `no_verbatim`), a voice note as said; a speaker's lines one after another
        one paragraph in the notes, deleted together; every transcript ElevenLabs keeps by default
        deleted by its id once read (`speech.forget`, `lib/speech-forget.ts`), counted on
        `caime_speech_forgotten_total`. Verified: `speech-provider.test.ts` (Scribe's fields, a
        blank transcript forgotten at once, a delete asked again after the provider was away, a
        call's line heard clean), `notes.test.ts`, `turns.test.ts`, `call-notes.test.ts`, the
        notes E2E.
  - [ ] ⛔ The owner: turn off ElevenLabs' use of the account's content for training ("Data use",
        or its opt-out form); zero retention needs ElevenLabs' enterprise contract.
  - [ ] I13b. Record (L): "Record" beside "Take notes", the labelled pair at a ring and a join
        ("Answer, recorded", with what's kept and that it may be shared), the mark for everyone
        throughout; voices and shared screens by one member's browser, ten-second pieces during the
        call, a part at each join; MP4 (H.264, AAC) where the browser records it, made seekable on
        the server without re-encoding; bytes an hour measured in the E2E before RESOURCES says one.
  - [ ] I13c. Played with the notes (M): the recording on the call's line, lines, topics and next
        steps opening it at their moment, screens in step with voices, on the web and on phones.
  - [ ] I13d. Kept and deleted (S): thirty days by default, an organization's retention when
        shorter, Keep by whoever asked against their storage, anyone in it deletes it for everyone;
        erasure, the export and the privacy page.
  - [ ] I13e. Shared on (S): into a conversation of the sharer's, as the consent said; gone with
        the recording.
  - [ ] I13f. Asked in writing (S): in every mode a question typed in the call, answered to the one
        who asked from what was said, cited.
  - [ ] I13g. Interact (L): the third mode and its labelled consent ("Answer, Cai joins in");
        "Cai, …" by name in a person's own track (golden lines per language and variety); Cai's
        introduction aloud once; a short spoken answer from what the call shares, mixed into the
        recording browser's outgoing audio with "Cai is speaking" on every screen, anything
        personal to the asker in writing; what it's asked to do on the asker's tap (R110); the
        time to a first word measured on a call, the cost per answer in RESOURCES.
  - [ ] I13h. What was on screen (M): a frame at each change of a shared screen while recording,
        read into the write-up, and the screen as shown when Cai is asked about it in Interact, on
        the light model within the asker's day.
- [ ] I3. What did I miss (M; L with the summary): the Needs-you conversations since each was last
      read, by the rules, ranked as Attention ranks them, with a cited summary for whoever has
      assist on, cached by read position, in Cai's chat and on Attention.
- [ ] I4. One cited answer engine (M): Cai's chat answers questions about people and what they said
      through Search's engine with its sources; "Ask about this conversation" is that engine scoped
      to it; one answering prompt; the model keeps the rules' time phrase; catch-ups and briefs cite
      their lines. Number: the share of answers with a source.
- [ ] I5. Arabic-first retrieval (M): a folded index built concurrently (hamza and alef forms, ة/ه,
      ى/ي, accents, dotted İ), queries and names folded the same way, relevance with recency, the
      unread index dropped in a later release; a retrieval golden set per language.
- [ ] I6. Evaluations for every model path (M–L): `lib/evals/` from the agent's, scored by rules
      first (follow-ups by line, faithful summaries and write-ups, Cai's keep and act, search
      readings, translations, the agent with a catalog, a menu, moves and every variety), nightly
      in batches and in CI when a prompt's hash moves, floors that only rise.
- [ ] I7. A calendar-aware Cai (M): "when am I free" from the calendar and connected busy times; a
      prepared meeting warns of a clash and offers the next free time; "move my 3pm" as another
      time suggested (F5); the coming-up list says its true count.
- [ ] I8. An agent that learns and proves (M): catalog descriptions, places and hours as passages;
      slots for the item and day asked; the time now; the customer's own cards as they stand; "add
      to what it knows" from a team member's answer, as a suggestion the owner accepts; the owner's
      numbers (resolved by the agent, hand-overs by reason, drafts, time to first answer, cost per
      conversation); a test before saving that replays what it couldn't answer.
- [ ] I9. Words become cards (L): a plan offers a filled Meeting card, money a Pay card, "every
      Monday" a repeat, "before the meeting" that meeting's time; dates, numbers and addresses
      tappable.
- [ ] I10. Groups (M): whom a promise or an ask is for by the names in it (`peopleMeant`), and
      "everyone".
- [ ] I11. Cai by voice, and a reply drafted in a conversation (M each).
- [ ] I12. Calls and files in answers, then meaning (L): a call's lines and write-up as passages;
      Office and PDF text indexed; search by meaning after I5, with its processor in the DPA and
      erasure removing what it kept.

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
- 2026-09-28 — Session 2 (cont.): Caishy is Caime (R34), for the domain cai.me. The name changed
  everywhere the product speaks: the apps (named Caime, `me.cai.app` on iOS and Android, the
  `caime:` scheme), every page and message, the wordmark (made again from the same Nunito Black
  lettering: "Caıme", the pink heart its dot, cut to the letters now that none drops below the
  line) and the docs. The code followed: `@caime/*` packages, `X-Caime-*` headers, the
  `caime_session` cookie, `Caime-Signature` on organizations' webhooks, `_caime-verify` DNS
  records, `caime_*` metrics, and the stores on devices and in the service worker. What kept its
  name, on purpose: Caishy *The Dreamer* and the Caishy Friends stickers; Stripe's price keys
  and metadata, by which the live account's prices are found; the repository, image, database
  and EasyPanel names; the migrations already deployed; and this log. A test caught the rename's
  one slip, a price key built from a template. Found on the way: a test of the data download
  that took two things saved in the same millisecond to come in one order. Tests: 219 core, 49
  brand, 466 server, 155 app, 53 E2E.
- 2026-09-28 — The repository is `h-khalid-h/Caime`, and EasyPanel's service `caime` builds it
  from source for https://caime.datac.com. Stripe's products, webhook and portal say Caime; their
  lookup keys keep their names. CI builds and smoke-tests the image but no longer publishes it,
  and the `caishy` package it published to ghcr.io before the rename was deleted, by a one-off
  workflow removed once it had run.
- 2026-09-28 — Session 3: handles nobody can take (R35). With `cai.me/@handle` as everyone's
  link, @caime, @support or @admin were anyone's for the asking, and would read as Caime itself.
  Now the product's names (caime, caishy, conniqt, cai), its characters, words that sound like
  whoever runs it or its messages (admin, support, noreply, billing…) and the names of its pages,
  screens and web-root files are reserved (`RESERVED_HANDLES`, beside `Handle` in core), and the
  product's names stay out of every handle they read in: caime.support, caime2, cai.me,
  caimesupport, officialcaime. Cai is people's name too (R34), so only @cai itself is kept and
  cai.mei stays someone's. Sign-up, a handle change and a new organization refuse them through
  one check, with a taken handle's status, code and words ("That handle isn’t available.", which
  a taken one now says too), and the availability check never offers one; an account that had
  one before keeps it. The operator gives one out (`/v1/admin/people/:handle/handle`,
  `/v1/admin/orgs/:handle/handle`) only while nobody else has it, one claim of a handle at a time,
  into the audit log and the person's data. A test fails if a screen, a page or a character comes
  without its name reserved. Mutation-tested: 43 changes, 42 caught. The one left, a max in how
  run-together words are read, changes nothing for today's words (checked for each word that ends
  another, and over 356,250 handles). One that first got through showed a test proving less than
  it said: deleting an account removes its row, so the test now marks one deleted, as the
  operator's route checks for. Found on the way: the data download listed two updates posted in
  the same instant in either order, which failed on Windows; and deleting an account frees its
  handle for anyone at once, which printed links make worth holding (not done). Tests: 223 core,
  50 brand, 474 server, 156 app; E2E not run this session.
- 2026-09-28 — Session 3 (cont.): handles let go of are held. Deleting an account removed its
  row, so its handle was anyone's a moment later, and every link its person had shared (R35: on
  cards, in signatures, as QR codes) would open whoever took it; changing a handle let go of the
  old one the same way. Now a handle someone lets go of (a new one, a deleted account, one the
  operator moves them from) is held from everyone for a year, whoever had it included, in the
  transaction that lets it go. Sign-up, a handle change and a new organization refuse it as a
  taken one, and the availability check never offers it. Only the handle and two days are kept
  (`released_handles`, 0037), never whose it was, and no time of day, so a hold can't be matched
  to the deletion's security record; the daily sweep forgets it when it's over, and the privacy
  page says so. An organization keeps its handle for good, even closed: its row does, and its
  handle is on its shopfront and receipts. Nobody can tell whose a held handle was, so the
  operator's route gives one back once they've been shown it was theirs; a reserved handle needs
  no hold. Profile and the sheet that deletes an account say what each does to a handle.
  Mutation-tested: 20 changes, all caught. The one that first got through (the availability
  check counting a hold's last day) has a test on the day now, and writing them found a race: a
  check that looked for a hold before a holder would miss a handle let go of between the two. It
  looks for the holder first, and a test commits a change exactly there. Tests: 223 core, 50
  brand, 479 server, 156 app; E2E not run this session.
- 2026-09-28 — The sidebar's mark is the favicon's: the heart with a face (`IconMark`), drawn
  from the same geometry as `favicon.svg` (`ICON_MARK`, generated), and the boot screen shows
  it too. The web app's head links a vector favicon (the .ico, 16/32/48, only for browsers
  without SVG), an apple-touch icon and an install manifest with a maskable icon, all made by
  the brand script; `favicon.svg` and `manifest.webmanifest` are reserved handles. Calls stuck
  on "Connecting…" in production: there's no relay there (only Google's STUN), so calls across
  strict networks can't connect; Cloudflare's relay is supported now and waits on a TURN key
  (⛔, M6), and a failed call without one says what to try. Web budget 448.6 KB (448.3 before).
  Tests: 223 core, 50 brand, 480 server, 159 app; E2E left to CI.
- 2026-09-28 — Cloudflare's TURN key set on production; the privacy page says calls may go
  through a relay Cloudflare runs, and the owner's call between two networks connected. The
  relay is ticked (M6).
- 2026-09-28 — Private conversations in the phone apps (R18), all but trying them on a phone:
  a pure-JavaScript backend in core (`e2ee-noble.ts`) that interoperates with Web Crypto in
  every direction, the phone keystore in the Keychain or Keystore, a device name from the phone,
  and the app's copy no longer sending people to the web. Web budget unchanged (448.6 KB; the
  web build doesn't carry the phone backend). Tests: 235 core, 50 brand, 480 server, 159 app.
- 2026-09-29 — Calls in the phone apps (PRD §47), all but trying them on a phone: the call
  engines and screens are one for the web and the phones now (the `.web` files renamed, with
  `.native` files only where a phone differs: WebRTC, the camera's view, the call's audio), on
  react-native-webrtc and react-native-incall-manager. Where calls can't be made (Expo Go, a
  browser without WebRTC) nothing of them loads. Web budget 448.9 KB (448.6 before: the
  Speaker icon). Tests: 235 core, 50 brand, 480 server, 159 app; the conversation E2E, 48,
  locally.
- 2026-09-29 — The recovery key (R41): private history survives losing every device, without
  Caime ever holding a key. Decided with the owner over the alternative (Signal's: lost devices,
  lost history), since Caime is for relationships that run for years. And a phone keeps its
  keys when its account signs out (`resume`), which is what tripped the owner up on the iPhone.
- 2026-09-29 — An organization's end (R42): the owner made DATA C on production, verified it,
  deleted the account and couldn't make DATA C again (a closed organization kept its handle for
  good, the rule since 48d8fd8). Now a closed unverified organization's handle is held a year,
  and a closed verified one waits for whoever proves its domain again, who continues it under
  the same handle and page; an owner can close one; the operator can delete a closed one.
  Customers' conversations with a closed organization stay to read (`409 org_closed`).
- 2026-09-29 — Organizations, from the owner's own use of production: "Get Business" failed
  with a bare 500 (Stripe's refusal was hidden; the live account can charge, its prices are there,
  so the refusal is Checkout's own, most likely a restricted key: now said in Stripe's words and
  logged, `billing.test.ts`); the year an organization began is picked, not typed (`YearField`,
  a list found as you type, the same on every platform); an organization has a logo; and an
  organization owns spaces (R43). The super-app brainstorm was reviewed again: R34–R40 stand,
  nothing new to adopt; `cai.me` is still parked.
- 2026-09-29 — R43 continued, after "Are you sure? Proceed": the Stripe key on production was
  checked (a full live key, and it reads Checkout sessions), so the "restricted key" guess was
  wrong and withdrawn; the cause is in Stripe's answer to Checkout itself, which the deployed
  fix now shows. Then: an organization's owner and admins see every space of its and join one
  as its admin; a person's profile shows the organizations they're with.
- 2026-09-30 — The product reviewed whole (docs/REVIEW-2026-09.md): four audits (UX, web presence,
  engineering, competitive) and production probed. Findings: no database backups (P0); a
  signed-out visitor sees an empty shell, nothing public for search or answer engines, no
  sitemap (P1); no phone in anyone's hands (P1); paid tiers sell capacity, not the wedge (P1);
  no alerting (P1); a UX polish list (P2). The plan is M9. The stale line about Stripe's live
  prices corrected: they exist.
- 2026-09-30 — Backups (M9, P0): a daily checked `pg_dump` kept 30 days, its age on
  `/metrics`, the operator's routes to see and make one, the restore drill written down. The
  image now installs PostgreSQL's own client 16; the image build itself couldn't be run here
  (Docker has no network in this container), so CI's build is the check.
- 2026-09-30 — The readable web (M9, P1, R44): the shell carries each page's head and a plain
  body until the app renders; the landing page, public pages for people (by their own switch,
  adults only, everyone-fields only) and organizations, 404s, noindex on the app's screens,
  robots and sitemap, Permissions-Policy. Cloudflare's managed robots.txt now sits in front of
  Caime's own.
- 2026-09-30 · R45, a WhatsApp chat brought over: `packages/core/src/whatsapp.ts` reads the
  export on the device (Android and iOS shapes, clocks, date order decided or asked, media
  counted), `POST /v1/conversations/import` lands it as a topic with a connected person, dated
  as written, each message `payload.imported`, a system line at the end; offered under "Before
  Caime" in a one-to-one's details, the sheet loaded only when opened.
- 2026-09-30 · Polish (P2, from the review): empty states with a next step, confirmation sheets
  before the four one-tap destructive actions, skeletons and retry where screens rendered
  nothing, names not pronouns in call history, the last raw colours onto brand tokens, and
  physical left/right styles turned to start/end so Arabic reads mirrored. CI's red on main
  (the landing page's tagline matching the welcome test's text locator) fixed first.
- 2026-09-30 · Brainstorm "unified inbox and edge-automation engine" reviewed and declined (R46);
  two compliant candidates recorded above. Production checked at e93217b: the readable web is
  live (Open Graph title, sitemap, robots). Production's environment holds 12 of the server's
  44 variables; the rest run on code defaults, and the explicit lines to add are in the session
  notes to the owner (the panel refused writes from here).
- 2026-09-30 · R47, Pro that sells the wedge's depth: `lib/insights.ts` `personInsights`,
  `GET /v1/me/insights` (Pro; 403 `plan_limit` with `nextPlan` otherwise), automations by plan
  (`assertAutomationRoom`), `PlanUsageView.used.automations`, the plan screen's "what Pro
  includes" and the Settings › Relationship insights screen.
- 2026-09-30 · R48, email: `lib/email.ts` (nodemailer over `SMTP_URL`, a memory mailer for
  tests), `email_codes` and `password_resets` (0042), `POST /auth/email/{send,verify}`,
  `POST /auth/reset` and `/reset/confirm`, the `/forgot` and `/reset` screens, the Email group in
  Security. Production needs `SMTP_URL` and `EMAIL_FROM` set by the operator.
- 2026-09-30 · First words (PRD §87): an empty one-to-one with a new connection offers three
  openers by sphere, put in the composer with `ComposerHandle.insert`; the deploy guide gains the
  production environment checklist.
- 2026-09-30 · Lighthouse taken (numbers above) and the web's fonts moved to subsetted WOFF2 in
  `public/fonts`, served for a year and kept offline, expo-font idle on the web.
- 2026-09-30 · A signed-out visitor stays on a public page (R44): the root layout mounts nothing
  on `/@handle` and `/o/handle` until they're signed in. Before, the app booted and sent them to
  Welcome within half a second.
- 2026-09-30 · Load test taken (numbers above): one instance answers an inbox read for fifty
  people at once under 100 ms at the 99th percentile.
- 2026-09-30 · R49, reports reviewed: `lib/moderation.ts` (`removeForEveryone`, `takeBackUpdate`,
  shared with the person's delete and the poster's take-back), the operator's report routes and
  the `/admin/reports` page.
- 2026-09-30 · Suspension (R49): `setSuspended` and `endAllAccess` in `lib/moderation.ts` (the
  latter what a recovery code and a reset link run too), refused at the session, at sign-in, at
  tokens and grants, at the handle and the public page; the report page's Suspend button.
- 2026-09-30 · Operators by name: `OPERATOR_TOKENS` (`lib/operator.ts`) gives each person on the
  operator's side a token of their own; `requireOperator` says who it was, and every admin audit
  entry carries `metadata.operator` (left out of a person's export).
- 2026-09-30 · R37, several steps, one approval: `acceptSuggestion` lifted out of its route,
  `POST /suggestions/accept` (ids, each on its own) and `POST /suggestions/:id/undo` (a task
  still as made goes, the suggestion is offered again); the `SuggestionBar` shows one card for
  several, with Do all, One at a time and Not now, and Undo on the toast.
- 2026-09-30 · AI spend on `/metrics`: `caime_ai_tokens_total` by feature and direction, and a
  `CaimeAiSpend` alert rule in the deploy guide (`ai.test.ts`).
- 2026-09-30 · Leaving a group from two devices at once: the second answers done, not
  "not found" (the membership read ran before the group's lock; `messaging.test.ts` caught it
  once under a loaded run).
- 2026-09-30 · Backups off the host: `lib/s3.ts` (Signature Version 4 over fetch, put and
  delete, no SDK) and `copyOffHost` in `lib/backup.ts`; each checked dump goes to
  `BACKUP_S3_*`'s bucket, a failed copy is tried again hourly, `/metrics` says when the last
  went (`backup-copy.test.ts` against a signing stand-in) ⛔ the owner's bucket and keys.
- 2026-09-30 · The job loop rests until something is due and wakes on `enqueue` (LISTEN/NOTIFY
  through the bus, `onNotify`): an idle instance asks the queue every 5 s (its soonest sweep)
  rather than every second, and a job for now runs at once (`jobs.test.ts`).
- 2026-09-30 · Photos shrunk on the device before upload (`lib/photoSize.ts`, expo-image-manipulator
  on phones, a canvas on the web): 2,048 px on the long edge, 1,024 for faces and logos; the
  E2E sends a 3,000 px photo and the server receives 2,048 (`photoSize.test.ts`, E2E).
- 2026-09-30 · The characters' SVG builders leave the startup chunk (loaded on the first
  character drawn): budget 447.3 KB gzip, 356.5 KB over the wire.
- 2026-09-30 · A phone put away rests its socket after 30 s (`realtime/client.ts` `rest`), unless a
  call or a live share is on; back in front, it reconnects and refreshes as after a gap
  (`client.test.ts`).
- 2026-09-30 · Precompressed web (`scripts/precompress.mjs`, `preCompressed` in `plugins/static.ts`):
  the first visit downloads 358.8 KB of scripts instead of 450 KB (Brotli 11 at build time, where
  the proxy's on-the-fly Brotli had saved 3.6% over gzip); the whole export is 788 KB instead
  of 966 KB.
- 2026-09-30 · Budgets and contributions: `docs/RESOURCES.md` (server, AI and device budgets,
  CLAUDE.md convention 14), `CONTRIBUTING.md` with the pull request template and the steward
  skill (convention 15); the agent's knowledge is a cached system block and the light features
  may run on `ANTHROPIC_MODEL_LIGHT`.
- 2026-09-30 · Invite links (R1): `invites` (0044), `lib/invites.ts` and `modules/invites.ts`, the
  visitor's `/i/<token>` page, the app's `InviteSheet` in Connect, the `i/[token]` route that
  accepts and opens the conversation, onboarding and Welcome naming the inviter. E2E times
  link-open to first message at 4.8 s.
- 2026-09-30 · Split card (R38): `split` in `kits.ts`, `shareOut`/`applySplitOp`/`splitState` in
  `kit-cards.ts`, shares set in `sendMessage`, `POST /messages/:id/split`, the app's
  `SplitCard`; a person's export lists their shares of others' splits. Budget unchanged at
  447.9 KB gzip.
- 2026-09-30 · `@caime/sdk` (R39): `packages/sdk` (client over `fetch`, webhook checks over
  Node's crypto, types from core by `import type` only, so nothing of core runs in an app);
  `apps/server/test/sdk.test.ts` drives it through the real routes with an inject-backed fetch.
- 2026-09-30 · Fan-out measured and batched (R40): `updates.fanout` tells a batch of 1,000 with
  one insert, one `notification.created` to them all (its `id` null: the list refreshes) and one
  `withLivePush` lookup; 500,000 followers in 108.2 s, from 954.6 s.
- 2026-09-30 · Files in a bucket (P2): `s3Storage` in `lib/storage.ts` over `s3PutStream`,
  `s3Get` (ranges) and `s3Head` in `lib/s3.ts`; `storageFor(config)` picks it with `FILES_S3_*`;
  thumbnails go through a `tmp/` key so both storages take them.
- 2026-09-30 · The web export runs with Metro's tree shaking (`build:web`): 436.3 KB gzip and
  347.5 KB Brotli on the wire, from 447.9 KB and 355.7 KB, nothing in the app changed; every
  E2E spec run against the shaken bundle.
- 2026-09-30 · What a launch costs, measured (`e2e/launch-cost.spec.ts`, `LAUNCH_COST=1`): a warm
  launch of Chats makes 11 API requests, from 12, and no longer fetches the private sheet's code
  (the waiting-devices card loads only when a device is waiting; the launch's device listing is
  shared for a moment). The numbers are in `docs/RESOURCES.md`.
- 2026-09-30 · The inbox measured and trimmed (`inbox-scale.test.ts`): 300 conversations answer
  in 61 ms from 127, 2,000 in 637 ms from 1,010; the age check made a new Intl formatter for
  every person listed (`todayIn` now reads `zonedParts`, cached per zone and instant), the
  batched person views searched lists per row (maps now), and the app reads Attention and All
  from one `view=all` request (core `inboxSections`, `inboxAllList`), so a launch builds the
  inbox once and makes 10 API requests, from 11. Then unread and mentions counted in one
  lateral pass: 2,000 conversations in 377 ms.
- 2026-09-30 · One answer for what's live: `GET /calls/live` carries the group call too, and the
  socket asks once per connect (`checkLiveCalls`), a request fewer on every launch and reconnect.
- 2026-09-30 · Boot measured: the bundled server is healthy 1.2 s after `node` starts and idles at
  157 MB resident (docs/RESOURCES.md).
- 2026-09-30 · One place to start a space: `/new-space` asks whose it is (mine, or an
  organization I run) once I'm on a team, offers only the organizations I can start spaces for
  and says why the others aren't offered, and comes preset from an organization's page; nothing
  is asked of someone on no team (E2E). The landing page rebuilt as Caime's own: a spec sheet
  with mono labels, sentence case, and a layer explorer (connection, conversation, attention,
  memory, organizations, privacy) drawn from the app's own shapes, with no script
  (`public-pages.test.ts`); a visitor at `/` now gets that page without the app's scripts, as
  on a person's or an organization's page, and the app opens from its links (`core-flow.spec.ts`).
- 2026-09-30 · The app takes the same identity: a `mono` text style (the system monospace, no
  file, `fontFamily` in `theme/fonts.ts`) for spec-sheet labels; Welcome carries the tagline in
  it and three spec lines (connection, attention, privacy) beside the characters; the Chats "+"
  sheet offers "Start a space" beside "New group" and "Connect", so starting anything begins in
  one place.
- 2026-09-30 · Private conversations: a device approved or restored since read its own person's
  earlier messages as unverified unless the codes or a send had judged that person's devices
  together first (the wrong answer then kept until the next change). `senderOf` now judges the
  sender's person's devices together, so a pinned one (the recovery device, this device once
  approved) says which first device is theirs; a unit case reproduces it (`private.test.ts`),
  and the E2E that failed twice on it passes.
- 2026-09-30 · Spec sheets in the app: `Spec` (`src/ui/Spec.tsx`) states facts as the public
  pages do (mono label, value, hairlines); an organization's page lists handle, kind, verified,
  based in, since and website that way (`org-spec`), a person's "and you" block its lines, and
  every auth screen carries a mono kicker (sign in, new account, password, new password,
  recovery) above its title, with the brand panel's tagline in mono. Budget 437.6 KB gzip
  (+0.6 KB); `around-the-conversation` and `core-flow` E2E pass (57).
- 2026-09-30 · Several teams, one step apart: the Business inbox shows a chip per team (with
  how many wait) when someone is on more than one, and the rail's Business comes back to the
  inbox opened last, not always the first (`state/business.ts`). E2E: Noor on two teams
  (`desktop-business-teams.png`). Budget unchanged at 437.6 KB gzip. The Arabic-alignment E2E
  now waits for the bubble itself (its label is the words, then the time): the list's row can
  preview the words before the bubble is drawn, which once read as `start`.
- 2026-09-30 · The rest of the web in the same identity: the invite page and the 404 take the
  sheet (masthead, mono labels, `from` / `about` / `to join` rows; `invites.test.ts`), and the
  privacy, terms and help pages the masthead, a mono nav and a mono "last updated", with no
  new download (their CSP still loads nothing but their own images). In the app, the
  Organizations row in settings names the teams you're on.
- 2026-09-30 · Spaces by owner: once someone's spaces span owners, the Spaces tab offers All ·
  Mine · each organization, from the list it already has (no request); E2E on the phone
  (`phone-spaces-mine.png`). Budget unchanged at 437.6 KB gzip.
- 2026-09-30 · Two more spec sheets: a space's head (kind, people, organization as a link) and
  About (version, running on, for, price, under the tagline in mono). E2E 53 pass; budget
  437.6 KB gzip.
- 2026-09-30 · Sentence case everywhere: the `overline` type style (every section label in the
  app: the inbox's "Needs you", a settings group, "Team · 2") is now the spec sheet's mono in
  sentence case, no longer uppercase Inter; badge digits keep the body face. One token, no
  copy changed; `around-the-conversation` and `core-flow` pass (58). Budget 437.6 KB gzip.
- 2026-09-30 · The phone's Welcome carries the same three spec lines as the desktop's
  (`core-flow` passes, 5).
- 2026-09-30 · R50 written (one identity, one place to start: the rules from today's work, in
  `docs/PRODUCT-REVIEW.md`), and onboarding's steps say where they are in mono ("step 2 of 3 ·
  how Caime works"; `core-flow` checks two of them).
- 2026-09-30 · The public site: five pages beside the landing page (for organizations, pricing,
  security, developers, about), each a spec sheet in the shared masthead and nav, script-free
  for everyone and cached ten minutes; the organizations page walks a customer's day and the
  security page who sees what, as explorers (radio inputs and CSS). Every number is read from
  the plans, the encryption design, the retention spans and the API's guide; prices from Stripe
  when billing is connected, "price shown in the app" otherwise (production has billing, so it
  shows them). The sitemap lists them. Budget unchanged at 437.6 KB gzip.
- 2026-10-01 · R51, Caime's own calendar: `lib/calendar.ts` turns what the feed gathers into
  `CalendarItemView`s with whom each is with (a direct conversation's other side, whom an action
  waits on, or the organization) and the viewer's relationship label; the Actions tab's
  Calendar segment lists them by day (`features/calendar/CalendarList.tsx`, loaded when shown);
  an organization's Bookings (`orgBookings`, the appointment cards in its customer conversations)
  are a view in the Business inbox for the team (`OrgBookings.tsx`). Live card events refresh
  both. Budget 437.7 KB gzip (+0.1 KB); `calendar.test.ts` 11 pass; E2E 53 pass
  (`desktop-calendar.png`, `desktop-business-bookings.png`).
- 2026-10-01 · R51, bookings: `organizations.booking` (migration 0045, core `BookingHoursBody`:
  a zone, a slot length, a range per weekday, a lead, a horizon), `lib/booking.ts` working out the
  open slots from the hours and the appointment cards in the organization's conversations (never
  kept), `OrgBooking.tsx` to set them, `SlotPicker.tsx` on an appointment card wherever the
  organization takes bookings, and the agent given its next eight open slots (fourteen days) in
  `<slots>`: it offers up to three, and `book` with the chosen iso becomes an appointment card
  from the organization, requested, that the customer confirms; a slot it wasn't given, or one
  taken meanwhile, hands over to a person. Core `booking.test.ts` 3, server `booking.test.ts` 2
  and the agent's case pass; E2E 53 pass (`phone-business-ai-booking.png`,
  `phone-slot-picker.png`). Budget 437.8 KB gzip (+0.1 KB).
- 2026-10-01 · R51, in a meeting work waits: `Preferences.holdWhileBusy` (off by default; Settings ·
  Notifications, mirrored to the account like the rest), `busyUntilFor` (`lib/calendar.ts`: the
  agreed cards from the last six hours that haven't ended, one query, run only for people who
  asked), and core `decideNotification` holding `HELD_WHILE_BUSY_SPHERES` (work, customer,
  vendor, professional) until `busyUntil` with the reason "in a meeting", after mute and quiet
  hours: calls, reminders, allowed urgency and every other sphere arrive as before, and the
  held-notifications task releases them. Core `policy.test.ts` 10 pass, server
  `messaging.test.ts` 60 pass, E2E toggles it. The site's business page and the landing page now
  name bookings.
- 2026-10-01 · R51, busy or free: `busyNow` (`lib/calendar.ts`, what `busyUntilFor` now reads)
  behind two new privacy fields, `busy` (connections by default) and `busyDetails` (family by
  default; both hidden by a limited preset), looked up in `GET /people/:id` only when the
  viewer's allowed, with the title also to anyone in the card's conversation;
  `PersonProfileView.busy`, a "now" row in the profile's spec (`person-busy`), and the two
  fields in Settings · Privacy. Core `privacy-safety.test.ts` 20 pass, `connections.test.ts`
  26 pass. Not in E2E: the E2E clock is real, and its meetings are ahead.
- 2026-10-03 · R54, Caime in Arabic: core `i18n.ts` (a catalog keyed by the English, CLDR
  plurals, `tr`/`trn`/`msg`, `trAll` for tables of options; ADR-16); a codemod wrapped 2,073
  strings across the app and core (JSX text, labels and titles, toasts, templates with their
  variables, plural shapes, tables with `msg` and `tr` where they're shown); the Arabic
  catalog written for all of them; `scripts/i18n-keys.mjs` lists the keys and what a catalog
  lacks, `i18n-catalog.test.ts` fails CI on a missing or stale entry or a lost placeholder;
  the language is a preference (`language: auto | en | ar`, in Language and region, mirrored
  to the account), loaded before the first screen (`lib/i18n.ts`, waiting for the device's
  preferences), remounting the app on a change, with `lang` and `dir` on the web. Budget
  440.8 KB gzip (+2.8 KB for the wrapping); the catalog is a separate chunk, 61.0 KB gzip,
  48.0 KB Brotli, fetched only when Arabic is on. Server tests 545, core 266, app 169.
- 2026-10-01 · The product reviewed whole (docs/REVIEW-2026-10.md): facts from the repository,
  production and Lighthouse runs; findings by dimension (strategy, reach, legal, money, product,
  operations, UX); R53 (organizations first) and R54 (Arabic, and what an organization's lawyer
  needs) in the product review; the plan as M10 and the owner's checklist with costs. Found
  today: the live contact address is on `cai.me`, a domain not yet the owner's (P0, the
  owner's to set); no SMTP on production; no Arabic interface; no DPA or organization export;
  euro-only prices; the app's first screen at 4.2 s LCP on a throttled phone.
- 2026-10-01 · R52 written: recording's rules (consent each time, never private, everyone gets
  it, encrypted with a set retention, summaries on request, paid with minute allowances) and the
  provider test it waits on (Arabic dialects, a DPA, no training on audio). No code, on purpose.
- 2026-10-03 — CI red on main at 7ab3b0a: two new advisories with no fixed release (node-forge in
  Expo's dev certificates, braces in Metro's file map), both in the app toolchain only. Ignored by
  id in `pnpm-workspace.yaml` with the reason beside each; SECURITY.md says so and when they go.
- 2026-10-03 — R54, second layer: the server's own words per person. Core's `tr` takes its
  translator from a provider; the server's is AsyncLocalStorage: the request's `X-Caime-Language`
  (the app sends what it shows) for everything answered, and `asReader` for everything written to
  someone else (notifications, replaced pushes), whose language is their account's. Every
  relationship role (103, with plurals) and every kit name and state joined the catalog, which
  the kit cards and the people pickers now read through `tr`. Catalog 2,333 entries.
- 2026-10-04 — R53, the organization's own door: the public page's call to action is
  `/o/<handle>?write`, so a visitor signs up and lands in the conversation (door-open to first
  message 4.0 s in E2E); the team's page shows the link and its QR code (encoded on the server,
  drawn as one SVG path, saved as a file in the browser), "Verified" is said in one line before
  the button, and a manager's cards run in a clinic's order. CI's E2E went red on 705a4da (twice:
  not a flake): the new language mirror was a request of its own, whose answer (read back, or
  echoed live) carried the account's preferences from before a language change still being
  saved, undoing it; the shown language now rides the one debounced preferences save.
  Playwright's GitHub reporter is on in CI so a failing test is named in the run's annotations.
- 2026-10-04 — R54, the lawyer's side: an organization's export, erasure at a customer's request
  (the disappearing sweep and an erasure now run one statement), owner-set retention applied as
  each message's expiry, and the sub-processors as one list in core that the privacy page renders
  from the server's configuration (`HOSTING_PROVIDER` names the host). The agreement itself waits
  on the owner's lawyer (⛔).
- 2026-10-04 — The app's first screen: welcome, sign-in and sign-up are painted by the server
  before the app runs, in the browser's language, and the app's scripts are fetched after that
  paint through a hashed inline bootstrap. LCP 4.6 s → 1.1–1.4 s on the mobile preset; interactive
  about 0.3 s later than before. Measured with Lighthouse against the local production bundle.
- 2026-10-04 — P2 polish from the review: quiet hours added from Notifications and priorities,
  one organization line on a profile, disappearing messages as one row, a scrolling segmented
  control, `X-Frame-Options: DENY`, bare health paths answering 404 with the real path, the help
  line, and `e2e/fit.spec.ts` (320 px, 200%, dark).
- 2026-10-04 — R54, the long tail: the templated strings the extraction left in English (call
  history and call screens, automation intervals, meeting lengths, the organization screen's
  waiting and team-full lines, spaces' counts, invite uses, the WhatsApp import's date range and
  left-out files, OAuth app kinds) now read through `tr` and `trn`, the Arabic plural forms added
  to the catalog (2,394 entries; the chunk 65.4 KB gzip, 51.3 KB Brotli). Budget 442.2 KB.
- 2026-10-04 — R54, the public site in Arabic: `lib/site-pages.ts` (the landing page moved in
  beside the five pages) writes every string through `tr`, in the language `siteLanguage` picks
  (`?lang=ar|en`, else the browser's first language), on `<html lang dir>` and `<main>`, with
  hreflang alternates, `og:locale` and `Vary: Accept-Language`; the strings the site alone says
  live in the server's `locales/ar-site.ts` (248 entries, 38.2 KB on disk, 12.9 KB gzip, server
  memory only: the app's Arabic chunk stays 65.4 KB), told apart by `scripts/i18n-keys.mjs`
  (`SITE_FILES`, `keysFor`), with `site-i18n.test.ts` beside core's catalog test. Logical CSS
  (`margin-inline-start`, `border-end-end-radius`) so the nav and the sample bubbles mirror.
  `public-pages.test.ts` (asked for, the browser's, back to English, signed in), `e2e/site.spec.ts`
  (right to left on screen, the switch, an Arabic browser). The way in keeps the language: the
  site's sign-up and sign-in links carry `?lang=`, the entry screens honour it, and the app on
  the web takes it as this device's choice when none was made (`languageInSearch`, core), so a
  reader who switched is Arabic all the way in and after a plain reload (`e2e/site.spec.ts`).
  Budget 442.3 KB. ⛔ A native speaker's review, as for the app.
- 2026-10-04 — R54, what the Arabic screenshots showed: the notification rules' summaries
  (`describePolicy`, "Always notify", "Quiet unless important", "Priority in hours"), the two
  template names ("My Customers", "My Vendors") and the schedules' day names were English in an
  Arabic interface; all through `tr`/`msg` in core `policy.ts` now (the server writes a summary
  in the request's language). An Arabic sentence that opens with a Latin word ("Caime …") ran
  left to right: React Native Web gives every text `dir="auto"` (first strong letter), so the
  `Text` primitive now runs any text holding an Arabic letter right to left, and leaves text
  without one (a handle, a date) to the browser, so "@handle" keeps its order; its
  `I18nManager.isRTL` is never true on the web, so nothing reads it. `phone-arabic-chats.png`
  is taken once the empty state has drawn (it was taken blank). Budget 442.4 KB. Verified on
  production: `/business?lang=ar` serves `<html lang="ar" dir="rtl">` with `Vary:
  Accept-Language`, and `/sign-in` in Arabic for an Arabic browser.
- 2026-10-04 — R54, a tour of the screens in Arabic (`e2e/arabic.spec.ts`, five more
  screenshots: the inbox, a conversation, People, a person, an organization, Appearance) found
  and fixed: the inbox line ("1 needs you") and the tab bar's count now plural forms
  (`trn`, in core `attention.ts`), the notification reasons core `policy.ts` writes ("needs
  you", "muted", "within hours"), the relative times in `format.ts` ("now", "5m", "Yesterday",
  "just now", "at 7:00", "on Sat", the day headings), the People chips ("Everyone", "Not
  labelled"), a person's facts (every counter a plural form; "last now"; the busy line; the
  privacy line; the mono labels), an organization's mono labels, the privacy screen's
  "Everyone", and the bubble themes' names. Still English, by design: user-written text and
  the pronoun suggestions (English pronouns). Budget 442.4 KB.
- 2026-10-04 — R54, stored words in the reader's language: a suggestion's title and rationale
  are kept in a row for one person, so they are written in that person's language once, when
  made: `createSuggestion` takes each as a string or a function and runs a function in the
  reader's scope (`asReader`), the message effects draft each person's suggestions inside their
  scope (the sender's own in theirs, each recipient's in theirs, a business thread's for the
  customer and the assignee), relationship offers and duplicates run in their owner's, a
  shared place's fan-out looks every owner's language up in one query (`languagesOf`), and the
  remaining raw strings in `intelligence.ts`, `suggest.ts`, `duplicates.ts` and `modules/ai.ts`
  go through `tr`. `i18n.test.ts`: the same message leaves an Arabic reader's "waiting" in
  Arabic and the English sender's "reminder" in English.
- 2026-10-04 — R54, the door in the customer's language: a person's page, an organization's
  page (the door a clinic prints, R53), an invitation and the 404 follow the browser's language
  or `?lang=`, as the site does (`<html lang dir>`, `Vary: Accept-Language`; names, handles and
  the door's link unchanged), so every page the server paints but the app itself now does. Their
  strings are the server's catalog too (`SITE_FILES` covers `public-pages.ts`; the entry screens'
  words, which the app shows, stay core's). `public-pages.test.ts`.
- 2026-10-04 — R54, the desktop in Arabic, photographed (a conversation with its context panel,
  the Business inbox, People, You, Notifications and priorities, the alerts, Actions, Spaces):
  the layout mirrors cleanly; found and fixed the context panel's week line ("2 messages this
  week. Next date: …", `modules/memory.ts`, now plural forms in the request's language), a
  customer's wait in the Business inbox ("just now", "5 min", "2 h", "3 days"; core
  `business.ts`, with `waitedMinutes` for the thread bar's comparison) and two raw lines in
  the location kit. Stored notifications and suggestions made before a person switched
  language stay in the language they were made in, by design. Arabic chunk 67.2 KB gzip
  (2,500 entries); budget 442.5 KB.
- 2026-10-04 — The dark pass the review asked for (P2): `e2e/dark.spec.ts` photographs the
  primary screens in the dark scheme on a phone (Chats, a conversation, a person, You, an
  organization, Actions) and a desktop (a conversation with its panel, the Business inbox,
  Notifications and priorities, People), the scheme the device's with nothing chosen in the
  app, and fails on a console error. Read through once: contrast, chips, cards, bubbles and the
  suggestion card hold in dark; nothing to fix.
- 2026-10-04 — M11, natural-language search: a sentence the rules can't read is read by the
  model into the rules' own structure and run (core `isPlainText`, `looksLikeSentence`,
  `fromUnderstanding`; server `understandWithAi` in `modules/search.ts`, `understandSearch` in
  `lib/ai.ts`, the shared `lib/ai-run.ts`), for a person with AI assist on, labelled in the app.
  Budget 442.6 KB. The E2E stand-in answers the search prompt from the words.
- 2026-10-04 — M11, what you take: suggestions follow a person's own decisions on each kind
  (core `leanFrom`, `placeByLean`; server `leanFor` read in `createSuggestion`, migration 0047),
  placed in the suggestion bar with the count as the reason, off with `learnFromChoices` under
  Automations. `learning.test.ts` in core and on the server. Budget 442.6 KB.
- 2026-10-04 — M11, Arabic depth: the message intelligence reads Gulf, Levantine and MSA
  promises, requests, decisions, questions, confirmations and amounts beside the Egyptian
  (core `intelligence.ts`: `AR_COMMIT`, `AR_REQUEST`, `AR_DECISION`, `AR_NOT_A_QUESTION`,
  `AR_CURRENCY_OF`, Arabic-Indic digits through `asciiDigits`). Fifty new cases in
  `intelligence.test.ts`; nothing on the server, nothing on an AI. Budget 442.6 KB.
- 2026-10-04 — M11, how sure and what's remembered: every suggestion says how sure Caime is in
  words before its reason (core `sureness.ts`, `surenessLine`, on the three suggestion cards),
  and a person's profile remembers the decisions and open promises across every conversation
  with them (`PersonProfileView.memory`, `modules/people.ts`, the `Remembered` rows under
  "and you"). `sureness.test.ts`, `relationship-profile.test.ts`, the E2E's business request.
  Budget 442.8 KB.
- 2026-10-04 — The accessibility pass: `e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA) over 24
  screens and pages in both languages and fails CI on a serious or critical violation; the
  five kinds it found are fixed (`Wordmark`, `NavRail`, `Pressable`'s ARIA for a selected
  link, the message ticks in `MessageBubble`, the presence dot in `Avatar`, the sign-up
  handle's autocomplete). Budget 443.0 KB.
- 2026-10-04 — Measured again after M10 and M11 (docs/RESOURCES.md): a launch 563 KB and the
  first message at 1.14 s; the inbox p99 126 ms at 725 req/s; `/v1/healthz` 9,437 req/s; an
  organization's page 1,050 req/s and a person's 520 req/s, which ran four reads in a row and
  now runs three, the last two together (`publicPerson`, `publicPageFor`), 2.9 ms alone from
  4.4 ms.
- 2026-10-04 — Reviews in three chairs. As a native speaker: the Arabic catalogs read well
  (MSA, Caime's voice, consistent terms); fixed what read as a man addressing a man or
  describing a third person by pronoun (participles for the reader: "متصل", "متواصل",
  "جاهز", "جديد هنا", "مسجّل الدخول"; "اجعله" for someone of unknown gender), count
  agreement ("{n} متأخرة"), an organization's gender ("موثّقة", "أثبتت أنها تملك"), the
  status "Requested" ("أُرسل الطلب"), and one term: an admin is now "مشرف" everywhere (the site
  already said so), a manager stays "مدير". The English is British with "organization" as the
  product's term; the two leaks ("Neighbor", "anymore") are fixed; every key spell-checked
  (cspell, en-GB), nothing else found. As a lawyer: `docs/LEGAL-REVIEW-2026-10.md`, 25
  findings on the privacy policy, the terms and the DPA draft, the product-side ones fixed
  (the controller's address and the governing law as `LEGAL_ADDRESS` and `GOVERNING_LAW`,
  rendered when set; health data, legal bases, automated decisions and breach notice on the
  privacy page; the law clause, the organizations-as-controllers clause, EU withdrawal, notice
  on closing and Caime's own rights in the terms; the Article 28(3) clauses, health-data
  warranty, 48-hour breach notice, sub-processor notice and objection, end-of-processing and
  liability in the DPA), the rest marked ⛔ for the owner and a licensed lawyer.
- 2026-10-04 — Speech to text, decided and built (docs/SPEECH.md): one interface
  (`lib/speech.ts`), OpenAI's transcription model first and ElevenLabs Scribe as the challenger,
  chosen by configuration; the owner's bake-off (`scripts/speech-bakeoff.mjs`, scored by
  `speech-wer.mjs` with Arabic normalized) decides on real clips before a key goes on
  production. Voice notes end to end: recorded in the composer, played in the bubble, read into
  words by the `speech.transcribe` job for a sender with AI assist on, the words the message's
  body. The provider joins the processors list, the privacy page and the DPA draft.
  `speech.test.ts`, `speech-wer.test.ts`, `e2e/voice.spec.ts`.
- 2026-10-05 — Found by the voice note's E2E and fixed: on the web, a bubble's hover actions
  (Reply, React) took room in the bubble's row, so the pointer arriving made a long bubble
  reflow a line, and a press that began on something inside it (the play button, a file row)
  ended on something else and was cancelled; the first click missed. They now sit beside the
  bubble over the margin, taking no room (`MessageBubble`).
- 2026-10-05 — Reviewed from all angles (docs/REVIEW-2026-10-05.md, M12): six parallel reviews
  of 6f1d5f9, merged and ranked, and the high findings fixed in one block with tests: live
  sockets closed when a session ends, socket frames validated and failures contained, invite
  links under R29, push endpoints checked, relay credentials cached, the backup's password out
  of the log, the email code limited, reports checked; the message intelligence's false
  positives (pleasantries, negations, quotes, forwards, dotted words, third persons) with a
  golden set of 127 lines and precision floors in CI; the business inbox's words and chips,
  fifteen Arabic leaks, the terms sentence, characters off business surfaces, keyboard access
  to a message's actions; the inbox query and its refetch, prefix search, two sweeps; the two
  webhook events and files for apps. Budget 445.9 KB gzip of 450. Tests: core 341, sdk 5, brand 50, app 170, server 589; E2E a11y, conversation, voice and core flow green.
- 2026-10-05 — R55: the third language is French (docs/PRODUCT-REVIEW.md R55 says why: the
  Maghreb and Lebanon are the part of the first market Arabic and English leave out). The whole
  interface and the public site translated (`locales/fr.ts`, `fr-site.ts`), the language list
  the one place a language is named, the catalog tests over every language, the site's switch
  and alternates for three, the agent's hand-over line in French, an E2E that chooses it.
- 2026-10-05 — From M12's next block: the conversation's permission rules moved into core and
  read on both sides, the message foreign keys indexed (0049), a failed preferences save and a
  failed draft sync no longer lose the device's choice, a Sheet closes on Escape on the web, an
  app lists and retries its webhook deliveries, and convention 7 says expand, then contract.
- 2026-10-05 — The operator helps someone locked out (R48): their account's facts without its
  content, every way in ended at once, a reset link to the account's own address; the sign-in
  screen's reset and the operator's share `lib/reset.ts`; `mailUnavailable` is `lib/errors`'.
- 2026-10-05 — A refusal reads in the app's language: every server error message through `tr`
  where it's thrown (480 sites, 336 strings in Arabic and French), the server's catalog widened
  to everything only the server says (`ar-server.ts`, `fr-server.ts`; 74 notification strings
  moved out of the app's chunks), `i18n.test.ts` asks a 404 and a 400 in three languages.
- 2026-10-05 — A message to a group costs the group once: the fan-out reads what every recipient
  needs in six queries and writes four at a time (813 → 267 queries for 80 members, 294 → 187
  ms), read positions are decided in one check for a whole group, and an ack reaches only
  whoever sent what it covers (`fanout-scale.test.ts`).
- 2026-10-05 — An unlabelled conversation asks how you know them: one chip in its intro opens
  the relationship picker, and the label shows there once saved (`e2e/relationship-chip.spec.ts`).
- 2026-10-05 — R56, the first five minutes: onboarding is two steps and a link goes straight
  to its step; the recovery codes wait on Chats until saved, remembered by the account
  (migration 0050); the untranslated work-week line through `tr`.
- 2026-10-05 — The remaining UX mediums: toasts in thumb reach, reduced motion read from the
  device, Arabic mono joined, Notifications named once, new messages announced to a screen
  reader, and a form's field messages in the app's language (`msg()` in the schemas).
- 2026-10-05 — The intelligence reads the recent past as past, a day of the month, Arabic
  durations and clock words, and an evening's bare hour; an edited message is read again.
- 2026-10-05 — The intelligence's leftovers: a vague promise re-dates only its own item, a time
  at the end of a search is a period, the model reads a sentence once typing settles, and
  same-name duplicates need a second sign.
- 2026-10-05 — R57: an organization's setup (door, domain, data, hours, agent, apps, plan) moves
  to its own screen for the owner and admins; the page is the daily work.
- 2026-10-05 — The last hand-written role checks become core's rules (`ownsOrg`,
  `canAddToGroup`, `canPostTo`, `canRemoveFromGroup`, `canChangeGroupRole`,
  `handsOverOnLeaving`, `MANAGING_ROLES`).
- 2026-10-05 — The review's six small lows: one accept makes one task, forwarding needs a seat,
  invite tokens out of the log, sign-in limits per handle and address, backups and report reads
  audited, upload chunks under a lock.
- 2026-10-05 — The review's performance mediums: set queries in the AI actions route, bounded
  background sweeps, the covered index dropped, no tsvector in a message row, cache tokens
  recorded, the query cache serialised in idle time.
- 2026-10-05 — The budget measures the chunks loaded later (100 KB each) and a test holds the
  panes to lazy imports.
- 2026-10-05 — Every route's answer has a name in the contract, the app reads the same names, and
  error codes are one list in core.
- 2026-10-05 — The review's remaining lows: keys in `qk`, failures logged, dead code gone, nine
  routes tested, one `Pressable`, themed shadows.
- 2026-10-05 — The conversations module split: shared helpers in `lib/`, message routes in
  `modules/messages.ts`, no route module importing another.
- 2026-10-05 — ARCHITECTURE matches the code: ADR-12 and ADR-14 reworded, paging by `before`,
  the layout tree as it is.
- 2026-10-05 — Webhook secrets rotate with a day's overlap; OAuth answers carry `iss`.
- 2026-10-05 — R58: bookings are a catalog, for people as well as organizations: items with a
  price, a length in minutes or days, a capacity and an audience; slots per item; who does it
  decided at confirmation and kept from the customer; Book on the public pages and profiles;
  the agent reads the catalog; and the brief before an agreed meeting, an hour ahead.
- 2026-10-05 — R60: orders from the catalog: items sold by the piece, ordering settings, the
  Order card's picker with quantities and the server-fixed lines, total and number; Order on
  profiles, the organization's page and the public pages.
- 2026-10-05 — R59: Turkish as the fourth language, in the app, the server's words and the
  site. Three sign-in strings had shown a literal `\u2019` to everyone; the suggestion line put
  English's "a"/"an" into Arabic and French. Both fixed. A piece sold now allows ten an order
  by default.
- 2026-10-05 — R61: collections and a page for each public item and collection, with JSON-LD
  and sitemap lines; Book and Order from an item land on the card with it chosen. The startup
  chunk lost 2 KB gzip (the relationship picker loads with its sheets).
- 2026-10-05 — R62: ways to be paid and the Pay card (ask or pay, payer and payee, the payee's
  ways fixed on the card); Pay from priced orders and bookings, profiles and public pages.
  Settings' Bookings is now What you offer. Card buttons and form labels translated at last.
- 2026-10-05 — Harmony pass over cards: kit names in the "+" menu, the form's title, the card's
  label and a sticker's screen-reader name read in the reader's language; checked across the
  bookings, Arabic, French, Turkish, conversation and accessibility specs (66 passed).
- 2026-10-05 — The six catalogs reviewed as a native speaker would (Arabic, French, Turkish; app
  and site), and the code that put English words into translated sentences fixed. Language,
  accessibility, bookings and core-flow specs pass; the Arabic screens read right to left.
- 2026-10-09 — R73 (the owner: "the Arabic font and alignment across the entire UX is not the
  best"): the paired Arabic faces on web and phones, Arabic metrics, react-native-web told the
  layout's direction (it had mirrored rows and nothing else), mirrored arrows and chevrons, the
  interface's words aligned to the layout's start. Checked: app and server tests, the Arabic,
  accessibility, entry-twin and core-flow specs, the retaken Arabic screenshots.
- 2026-10-08 — R72 (the owner: the bar "higher and visible whenever it makes sense"; "in
  Egypt and speaks Arabic … Egyptian Arabic"): the phone's bar is under every screen opened from
  a place and steps aside where it would cover what someone's doing; Cai and the friends speak
  the Arabic someone chose, writes or lives in, by the rules (Egyptian, Gulf, Levantine) and the
  model (and four more, told the country). The full E2E run caught the bar coming back as a
  field lost the focus and swallowing the Confirm press below it; it now moves for the keyboard
  only on Android. Checked: `pnpm check` (server 679 alone: a one-off vitest run beside the
  full one drops every `caime_t_*` database at its start, so never run two), the whole E2E
  suite with the bar, then the Attention, Cai and Friends specs with the Arabic, the
  screenshots.
- 2026-10-08 — Search in every interface language: the rules read files from someone, asks,
  waits, what someone said, decisions, tasks, conversations and times in Arabic, French and
  Turkish, relationships by their names in the reader's language; the English-only
  interpretations are keys in every catalog (`search-languages.test.ts`, 44 cases).
- 2026-10-08 — R71, every Caime Friend thinks for itself (the owner's screenshot: Caishy
  answering "السلام عليكم" with stickers and an English "That's all my tips"): rules first in
  four languages, answered in the language written, the model in each friend's own character
  with only its own part of what's open, tips in turn without it. Checked: `pnpm check` (server
  668), the whole E2E suite (93 passed), the owner's Arabic messages answered in Arabic in
  `phone-caishy.png`.
- 2026-10-08 — French and Turkish message intelligence (a background agent's work, reviewed):
  29 of 32 lines written apart from the rules read right; the three misses (a French present
  visit, a Turkish aorist, a habit) fixed with golden lines. The readers of typed dates and
  amounts left the startup chunk (`lib/useReaders`): 452.9 KB gzip with them in `__common`,
  442.9 KB now (447.4 KB before).
- 2026-10-06 — R70, sharp at every size: an image keeps a 1,280-px preview beside its 480-px
  thumbnail (`lib/renditions.ts`, migration 0061, `/files/:id/preview`), core's `imageFor` picks
  by the points drawn, so a photo in a message, an item's sheet and page and a link's card are
  sharp on a 3x screen; older images get theirs from a once-only backfill; deleting an account
  takes the preview too (the bucket test caught it). Photos go up at 3,072 px, JPEG 0.9. A shared
  link to Caime shows a 1200 x 630 card made with the icons instead of the 180-px icon. The AI's
  default model is the latest. Checked: full suite, the conversation and bookings E2E (54 + 13).
- 2026-10-06 — Room in the startup chunk: icons imported where they're used, not through the
  `ui/icons.ts` barrel that put all 127 in the first download (initial web JS 449.8 to 447.4 KB
  gzip; a test keeps it so). CI's red run on `4facc89` was `calls.test.ts` reading bus events
  before they'd arrived; the wait the group calls' tests had (`busSettled`) is now the helpers'
  and every test that clears what it heard waits for the bus first.
- 2026-10-06 — The web's faces declared once (Inter and Nunito by weight) for the app and every
  server page; the server's pages drawn from the tokens (`lib/page-style.ts`: theme variables,
  type, radii, control heights; no colour of their own, tested); the entry screens' twins made
  the app's screens on a phone and a desktop (brand panel, wordmark, characters, the welcome's two
  layouts), held by `e2e/entry-twins.spec.ts`, which measures every line in both. Found on the
  way and fixed: the welcome's labels untranslated, the terms line built from fragments (now one
  tagged key, `tagged`), "Forgot your password?" in the twin going to `/recover`, the 8 px frame
  on every visitor page, French and Turkish "ia"/"ai" in lowercase, and 23 lint warnings (dead
  code in automations among them). Initial web JS 449.8 KB gzip.
- 2026-10-06 — Production checked as a visitor (`f674455`, R67–R69 live, five pages, no console
  errors). Found and fixed: every visitor page drew in the system's font (its CSS named `Inter`
  and `Nunito`, which the shell declares only under expo-font's names), and the sign-in screens'
  labels were lowercase or untranslated ("password", "recovery"). Public pages, door, core flow
  and accessibility specs pass (10); initial web JS 449.9 KB gzip.
- 2026-10-06 — R69: the look brought up to date at its source (type, labels, surfaces, radii,
  rhythm), so every screen follows; checked on the retaken screenshots.
- 2026-10-06 — R68 built: OpenAI's dots evaluated; Cai keeps a wait and comes back with a
  follow-up ready to send (sent only on a tap), an opt-in morning brief, and Settings · Cai, where
  everything Cai keeps or has learned can be stopped or forgotten.
- 2026-10-05 — R67 built: Cai and the seven Caime Friends are accounts anyone can chat with;
  Cai answers what's open by the rules and the rest with AI assist; the friends from their
  scripts. "Suggested by Cai" across the app; team inboxes on Attention.
- 2026-10-05 — R66 built: Attention is the first screen, Cai asks about a wait gone quiet in the
  first person, a conversation shows what's open, Actions use coordination's words, and a
  person's page says what how you know them changes. Initial web JS 449.2 KB gzip.
- 2026-10-05 — R66: the design brainstorm checked (Attention home, quiet intelligence, the
  relationship's effects adopted; "Cai" adopted as Caime's short name where the intelligence is
  asked for, amending R34; the boards' colours and mark not, per BRAND.md).
- 2026-10-05 — R65: an organization's own checkout through its own Stripe account (Connect),
  verified against stand-ins on the server and end to end; off in production until the owner
  turns Connect on for the live account.
- 2026-10-05 — R64: organizations write to and pay each other: "Writing as" on an
  organization's page, the other team sees whom it answers, and Pay goes to the writing
  organization's own ways.
- 2026-10-05 — R63: an item's photo, on its page (and link previews), its sheet and the order
  picker. CI's red run was the site spec pinning the old Arabic headline; fixed and the full
  E2E suite run (the voice spec, last in the run, passes on its own: its job queue was busy).
- 2026-10-09 — R74: Settings · Apps. "Connected apps" held the calendar address and the OAuth
  grants with no way to find an app; now Connected lists both as one kind of row and Discover is
  a directory (`oauth_clients` listed by `(connected_count, id)` keyset, a trigram search, eight
  categories, an icon of the owner's own, a publisher that may be a verified organization, a
  Connect that opens the app's own sign-in), reviewed once by the operator; the count moves only
  inside the grant's own transaction, so a page costs one query at any size.
- 2026-10-09 — Review: six read-only slices in parallel (country awareness, pickers,
  cross-integration, architecture and scale, security, UX and words) over `21f2402`; the
  synthesis and plan are `docs/REVIEW-2026-10-09.md` (M15). Headlines: private waits reach the
  person they're about through Cai, the briefs and the inbox counts; a team member's calendar
  and feed carry the whole organization's appointments; free slots are read from a capped list;
  nine core label tables aren't in any catalog; the country sets the work week and the currency
  and nothing else; a single choice is built six ways.
- 2026-10-10 — R80 written (the owner: Slack's App Marketplace and cai.me/marketplace): the
  marketplace as a public page with a page per app, what a listing says, the written bar for
  listing and delisting, what's declined (ratings, a usage floor, paid placement), and the short
  domain as the public address once it's Caime's (cai.me is parked today). Roadmap lines under
  M14, after Block 4 and R79 layer 1.
- 2026-10-09 — Review block 3 (words): the eleven label tables in core (scopes, rewrites,
  organization kinds and roles, space roles, thread states and views, the agent's actions,
  Attention's sections, the privacy fields) are `msg()` keys and every place that showed one
  raw shows it through `tr` (the consent screen's permissions in the request's language on the
  server); a friend's profile says what a friend is (rules, and a model's help with assist on);
  some sixty screens' fragments and bare words are whole keys (`trn` for every count, no
  English word as a variable, no `.toLowerCase()` on translated text, a typed name never
  `tr`'d); an automation reads "When someone you call “Customer” sends a file…" (the label as
  given, no article to agree, no gender to guess) in every language; the calls' lines, the
  retention words, the custom kit's refusals and the password rule's message are keys. The
  collector lists English shown outside `tr` (`node scripts/i18n-keys.mjs bare`:
  templates with prose, a template as a key, JSX text, words in a field a person reads) and
  `i18n-literals.test.ts` holds it to seven lines of data. 156 keys translated into Arabic,
  French and Turkish; 25 stale entries dropped. BRAND.md's friends paragraph says the same.
- 2026-10-09 — Review block 2 (integration): on a team, your calendar is yours (the bookings you
  do, the threads assigned to you), everywhere the calendar is read; deleting an account spares
  an organization's logo, its items' photos and an app's icon; search finds a card by what it
  says of itself (`messages.search_all`, generated: title, reference, summary, what was booked,
  the parser's joiners cut so "INV-7731" and "7731" both find it), by when it's for ("budget in
  November": a bare month is now the nearest one, a year 1900–2099), and an organization through
  the conversation you write in; a busy host's slots come from every card overlapping the window
  (600 cards the day before no longer hide one). Cases in booking, business, calendar and core's
  search tests.
- 2026-10-09 — Review block 1 (privacy and money): one task-visibility rule for every reader (a
  private wait never reaches the person it's about, nor their model), one Checkout Session ever
  payable per card (settled, reused, expired, never replaced while paid), slots and providers
  kept to whom the profile shows them, priced bookings adults-only, what leans on a seat or an
  open organization cleared when either ends, listing reviews by revision, reclaims per person,
  re-encoded images only. `task-visibility.test.ts`; cases in checkout, booking, minors,
  app-directory, orgs and item-photos.
- 2026-10-11 — Review block 4, Apps and Developer in harmony: one publisher shape across consent,
  Connected, Discover and an organization's listings (`AppPublisher`, `PublisherLine`); the
  developer notified of reviews and shown usage; `afterCardMove` shared by the kit route and
  Checkout; Caime's cards and the customer's cards to organization apps; the calendar and a new
  orders route for apps and the SDK, with the Business inbox's Orders view; the SDK's person
  methods; the R74 lows. Tests in `app-directory.test.ts`, `checkout.test.ts`, `sdk.test.ts`.
- 2026-10-11 — Review block 5, scale: people and organizations read without their catalogs
  (`USER_COLUMNS`, `ORG_COLUMNS`), `card_start_at` as a column (migration 0066), the booking's
  second check under the host's lock, the route-module rule held by a test (`lib/tasks.ts`,
  `lib/relationships.ts`, `lib/space-members.ts`, `lib/connections.ts`), the job loop's
  refilling pool and early wake, the brief's jitter, one TTL cache, the sitemap cached, the
  listing form lazy, the Ls. The god modules' splits (M28) are left for a block of their own.
- 2026-10-11 — Review block 6, cards that ask and what's owed: `ASKING_STATES` and `cardAsks`
  make a card a request until answered; `dueCards` puts a Pay card or an invoice on its due day
  for the calendar, the feed and Cai; exports carry the offer, the checkout, the listings, the
  customer's organization and Cai's follow-ups; `apps.changed` and `booking.changed` keep every
  device in step; the ICS and the app agree on a booking's length; Bookings names the customer's
  organization and the three calendars bridge each other; a text message takes no client
  payload. The design and accessibility Ms: mirrored pointing icons, radii from the tokens,
  roles on every labelled View, no characters on security screens, axe in four languages.
- 2026-10-11 — R76, country-aware UX: `@caime/core/countries` generated from CLDR by
  `scripts/geo.mjs` (weeks, weekends, clocks, currencies and their decimals; calling codes from
  ITU's list), four tables folded into it; `MeView` and `OrgView` carry the derived facts; an
  organization gets its own zone and days worked; amounts, booking hours, the hours line, the
  day picker, the formatting locale, the agent's and Cai's prompts, the brief, the pay presets,
  sign-up's region hint and the zone offer all read the country.
- 2026-10-11 — R77, consistent pickers: the family in `ui/` (`FieldShell`, `ChoiceChips`,
  `ChoiceList`, `ChoiceSheet`, `SpherePicker`, `Stepper`, `SwitchRow`, arrow keys and a roving
  tab index), ~40 screens moved onto it, `pickers.test.ts`; the E2E server's warnings piped into
  the run's output. The family in the startup chunk cost 4.4 KB gzip, won back by loading apart
  what the first screen never needs (the You sheet's body, the shortcuts, the live events'
  applier, the organization details editor); the next budget work is M28's split of `api/hooks.ts`
  and `api/endpoints.ts` (15.9 and 13.9 KB raw in the startup chunk, most of it for later screens).
- 2026-10-11 — Docs drift (REVIEW-2026-10-09 §7, block 9): BRAND.md's type rows (Overline and
  Mono are Inter 13/18 since R69), its radii read from the tokens, five places with Attention
  first, the friends' paragraph as R71, R72 and R68 have it; CLAUDE.md's pages (they carry their
  own layout sizes), the setup list with `OrgCheckout`, the auth kicker as a mono line, axe in
  all four languages; the preview route in `API_ROUTES`, `docs/API.md` and the SDK
  (`preview(id)`), with its case in `sdk.test.ts`.
- 2026-10-11 — A send's answer never takes away what the socket brought since (`addSentMessage`,
  `state/cache.ts`): the voice E2E lost a note's words under load, two runs in six; a probe
  logging the socket's frames and the client's cache showed the transcript's `message.updated`
  27 ms after the echo, and the send's own answer, a copy made before either, read after them
  and putting the message back as sent. The outbox and the card form add their answer where the
  socket hasn't and never replace what it brought; `cache.test.ts` holds the three cases.
- 2026-10-11 — An app's sheet on the setup screen shows the app as the list has it now, not the
  copy tapped (a list restored from the device and read again a moment later never reached the
  open sheet; the E2E found it under load).
- 2026-10-11 — R75, Caime Mail phase 1: a handle is an address at `MAIL_DOMAIN`, mail in from
  the authenticated From alone (DMARC, or DKIM or SPF aligned) through one provider interface
  (`lib/mail-provider.ts`, Postmark first) behind `POST /v1/mail/in/:provider` and
  `/events/:provider`; a stranger becomes a provisional person (`users.kind = 'provisional'`,
  found by nobody, claimed by signing up with the address) and their mail a request that keeps
  every message; threads are topics by References or by subject (core `mail.ts`); attachments
  are files, a long mail rides along whole; a reply goes out from the person's or the
  organization's address in the thread (`mail.send`) and says sent, delivered or bounced; an
  organization's address is a customer thread; under-18 addresses take mail from connections
  only; erasure, export, the privacy and help pages, the processor list, the DPA annex and the
  metrics say so. The app says "by email" with the delivery state under each such message,
  marks a person reached by email in place of a handle, shows the address under Profile, and in
  a one-to-one reached by mail shows the subject a mail carries (the thread's, else the first
  line) and starts the topic a written subject names. `mail.test.ts` (14 cases) and `e2e/mail.spec.ts` against the
  provider's stand-in (`e2e/mail-stub.mjs`). Not turned on in production (⛔: the domain's MX,
  DKIM, SPF and DMARC at the provider; docs/DEPLOY.md).
- 2026-10-11 — R81, said, never guessed: gender as a declared, optional profile fact (never
  inferred, R27 kept) that the words honour in Arabic and French: what's said to the reader in
  their form (the short imperatives), what's said of someone in theirs as shared (every
  relationship label, in the picker too), Cai and the friends told it; the privacy field, the
  profile row, the server's reader scope on every write and signed-in request, the app's
  translator remade on change. Also the handle in an Arabic line isolated left to right, after
  the owner's screenshot showed "abdallah@".
- 2026-10-11 — R79 layer 1: the bridges (Zapier, Make, n8n, Pipedream, IFTTT) in Discover's
  Automation category, each a sheet in Caime that makes a scoped personal token for the platform
  in one tap (reading by default, writing ticked, no expiry, one live per platform), shows it
  once with the platform's own web-request step, lists it under Connected as the platform with
  its last use and stops it there; the OpenAPI 3.1 document at `GET /v1/openapi.json`, written
  from the schemas the routes parse with (the token routes' inline query schemas moved into core
  for it); and a contacts file into People (vCard and CSV from Google, iCloud and Outlook,
  parsed on the device by `@caime/core/contacts`), matched by address under search's rules,
  each match a row to connect from and the rest one invite link. Personal webhooks wait for the
  polling bridges to be in use.
- 2026-10-11 — R78, apps as contracts: `lib/provider-health.ts` probes each configured provider's
  cheapest authenticated read hourly (a `ping` on each provider interface, `cloudflareIceRequest`
  shared with the relay, `s3Head` on a key that isn't there, a TXT lookup) into
  `caime_provider_up{provider}` and `caime_provider_latency_seconds{provider}`, with
  `GET /v1/admin/providers` and `POST …/check`; migration 0072 makes the audit log a hash chain
  (`audit_hash` in the database, `audit_log_seal` as a deferred constraint trigger under one lock
  held for the commit alone, `seq` as the chain's order, the existing rows backfilled), verified
  by `verifyAuditChain` (`GET /v1/admin/audit`, the daily `audit.verify` task with the head in
  the log and `caime_audit_chain_ok` on `/metrics`), retention taking the chain's start by `seq`;
  `packages/mcp` is `@caime/mcp`, a hand-written JSON-RPC server over stdio (`initialize`,
  `ping`, `tools/list`, `tools/call`) with nine tools over the SDK's person methods, each with a
  JSON Schema the server checks and a bounded projection, the token's refusals passed through
  as tool errors, built by esbuild to `dist/caime-mcp.mjs`; `provides` (`APP_PROVIDES`:
  `calendar_sync`, `mail`) on listings, saved by the listing route (a change asks again), shown
  in Discover's sheet and picked with chips in the listing editor; the E2E stand-ins answer the
  probes' reads. Tests: `audit-chain.test.ts`, `provider-health.test.ts`, the directory test's
  provides case, `packages/mcp/src/*.test.ts`.
- 2026-10-12 — R80, the marketplace: `/marketplace`, `/marketplace/<category>` and
  `/marketplace/<slug>` (`lib/marketplace-pages.ts`, routed by `publicPageFor` before the site's
  pages, rendered in the shell with no script, `public, max-age=600`, every interface language
  with hreflang), listing what Discover lists from the same `listed(directoryQuery(…))`, Caime's
  own and the bridges first, 48 a page by keyset; each app's page with its screenshots, price,
  languages, help and privacy links, the model it says it uses, "Reviewed by Caime" or "Built by
  Caime", `SoftwareApplication` and breadcrumb JSON-LD, and Connect opening the app's sheet in
  Caime; the sitemap names every category with apps and every app. Migration 0073 gives
  `oauth_clients` the listing's new fields and its `slug`, given by `giveSlug` on the first look
  that lets it through and held for good (a unique index over every row, never a category's or
  Caime's own). Listing now needs a pricing model, a help address and a privacy policy;
  screenshots are the developer's own re-encoded images, 8:5 and 1280 pixels wide at least,
  served from the preview rendition; a listed app's icon and screenshots are public. The
  operator lists only with every point of `LISTING_CHECKS` sent back, and `delist` takes a listed
  app out with a note the developer reads. The listing editor, Discover's sheet (screenshots, a
  spec of price, languages and the model line, links to its page, help and privacy) and the bar
  on `/developers#bar` follow; links to the site's pages open as pages in the app (`appPath`).
  Tests: `marketplace.test.ts` (10), the directory test's terms, the E2E listing flow's new
  fields and a visitor's marketplace page, the accessibility pass over four marketplace pages.
- 2026-10-13 — R82 and ADR-17, documents only (R82 supersedes R68's "not adopted: voice calls
  with Cai", by the owner's decision): how R52's recording is built (one browser in
  the call records each person's stream as its own track, since the mesh already delivers them
  apart, so speakers are known without a diarization model and phones in the call are heard;
  utterances cut at pauses and uploaded as they end, so silence is never paid for and no word
  timestamps are needed; summaries only when asked; Cai asked by name answers in writing) and
  where Cai's voice in a call will run (a media unit beside the container). No code; R52 stays
  ⛔ on the speech bake-off and the lawyer's answer on consent.
- 2026-10-13 — R83, documents only: Meetings, a surface beside Chats and Calls (planned, online or
  in person by the kit's own Where; a list, not a menu, R19), and anyone can join one. The invitation is the key: an
  iCalendar invitation by mail lands in any calendar without a connector, and each invitee's own
  link proves their address, so a guest joins without a code or an account, in a session scoped
  to the meeting; consent is a tap on the join page. No code; ⛔ on Caime Mail in production.
- 2026-10-13 — R83, first code: Join and Open on the meeting card (core `meetings.ts`, the app's
  `meetingCall`), by the kit's own Where and a join window, through the calls the conversation
  already makes. No server change; the server suites and E2E not run here (no Postgres).
- 2026-10-13 — R83, Meetings and Join from anywhere: the Meetings list, Join and Open on the
  calendar, and a meeting held on Caime joined from Google, Outlook or Apple Calendar through
  the feed's URL, checked against the card before anything is called. Calendar items carry
  `seq`; `meetings` is a reserved handle.
- 2026-10-13 — R83, "Starting now": at an agreed meeting's time everyone in it is told, and the
  tap joins through the card's check. What's left of R83 is blocked: guests (Caime Mail) and
  recording (R82, the bake-off and the lawyer).
- 2026-10-13 — R84, documents only: guests join a meeting's own space, never the conversation
  it was agreed in (R83 would have shown them its history, and a direct call has no room for a
  third), and a provisional session is refused on every route but a guest's, by one guard
  proven against every registered route. The full server suite ran clean here: 752 pass, the
  six backup tests needing `pg_dump`.
- 2026-10-13 — R84, the guard first: a provisional session can reach nothing in the API but its
  own session, proven against every registered route, before any guest can exist.
- 2026-10-13 — R85, documents only: the owner decided what R82–R84 left for a lawyer, taking the
  stricter choice each time (consent a labelled choice, anyone's no at any time, nothing with
  anyone under 18, the recorder never a guest, the words kept and the voices not). The roadmap's
  ⛔ on the lawyer is gone; the speech bake-off's and Caime Mail's stand.
- 2026-10-13 — R84, the meeting's own space and the invitation: server only, a guest can't do
  anything yet (the guard holds; the join page is next).
- 2026-10-13 — R84, a guest's way in, server side: their link read and taken, a session for that
  meeting only, and its space and call opened to them; the app's join page is next.
- 2026-10-13 — R86: Cai's own address, `assistant@cai.me`. It sends a meeting's invitations for
  whoever invites and reads only the guests' calendar answers to them, from the invited address
  itself; nothing else to it is read. `cai.me` is Caime's: its DNS and mail records are left.
- 2026-10-13 — Review of the seven stacked contributions (#1–#7, R82–R86), merged in order with
  the reviewer's fixes named in each: one meeting space however many invite at once, no guest
  ever in a conversation with anyone under 18 (R29), someone on Caime asked only as a message
  request could reach them, a guest's link out of the request log, starting now through
  `eachLimit`, the meetings E2E strict, `/meetings` in the accessibility pass. Measured on the
  top before merging: check green (server 773), initial JavaScript 448.8 KB, E2E 101 passed.
- 2026-10-13 — Going live on cai.me, checked: the domain serves Caime, but `PUBLIC_URL` still
  named `caime.datac.com`, which no longer reached the app; DEPLOY.md now holds the ordered
  steps, and the code's defaults (SDK, phone builds) moved. The mail provider weighed with
  current prices (RESOURCES.md): Postmark, free through the beta, Pro ($16.50 for 10,000) once
  Caime Mail is on. Found on the way: Caime Mail's inbound check believes an
  `Authentication-Results` header that Postmark never writes, so it stays off until the check
  is computed from the raw message (next).
- 2026-10-13 — R75's inbound check rebuilt: Caime verifies who sent a mail from the raw message
  itself (DKIM against DNS, SPF for the address Postmark's own server saw connect, DMARC), never
  a header the payload or the sender wrote (a forged `Authentication-Results` is now refused, in
  `mail-auth.test.ts`, `mail.test.ts` and the E2E, which signs its mail with a published key);
  Bcc and list mail reach their handle, the staff addresses reach `MAIL_STAFF_HANDLE`, a mail
  lands once per place, and a retry can't post twice. Caime Mail now waits only on the owner's
  Postmark and DNS steps.
- 2026-10-13 — One address. Read through EasyPanel's API (names only): the service answers to
  `cai.me`, `www.cai.me`, `caime.datac.com` and its default, `PUBLIC_URL` is `https://cai.me`,
  and `production` runs 7e9544f. `www` and the old address served the whole site as copies
  (cookies, push and storage are per name, so a sign-in there met a signed-out `cai.me` at the
  first link Caime mailed); now a page on any name but `PUBLIC_URL`'s goes there for good, path
  and query kept, and the API, `/metrics` and `/.well-known/` answer on every name
  (`lib/canonical-host.ts`, `canonical-host.test.ts`). The runbook loses its Cloudflare redirect
  rule, keeps `go.cai.me` before the wildcard goes, and keeps the sender at `hello@`.
- 2026-10-13 — Where Caime runs, checked: the EasyPanel server (34.18.125.16, the panel's own
  address too) is in Google Cloud's `me-central1` range (Doha, Qatar), per Google's published
  ranges of the day. ⛔ The owner sets `HOSTING_PROVIDER=Google Cloud, Doha, Qatar` in EasyPanel
  (this session's write to the service was refused by its permission check), and the lawyer
  covers the transfer outside the EEA in the DPA's section 13. The origin also answers on its
  own address past Cloudflare: a firewall rule admitting only Cloudflare's ranges closes that.
- 2026-10-14 — Counsel's pass, at the owner's request. The live deployment read again: Cloudflare
  proxies every request (now named, `EDGE_PROVIDER`), hosting is in Qatar (a Chapter V transfer:
  counsel decides to move to an EU region before launch), Postmark will send the mail (named by
  company). The privacy page says each transfer's safeguard (SCCs, or the DPF) and how to get a
  copy, and with the terms names the register entry the e-Commerce Directive asks for. Minimum
  age by country in code (18 in Egypt and Saudi Arabia, whose laws ask a guardian's consent
  Caime doesn't take; `auth.test.ts`), Checkout's start-now request for the EU withdrawal right,
  and every DPA mark decided (LEGAL-REVIEW). The environment in full is in DEPLOY.md; this
  session's writes to EasyPanel were refused by its permission check, so the owner adds it.
- 2026-10-14 — The environment in full is live, set by the owner: `GOVERNING_LAW`, `EDGE_PROVIDER`,
  `LEGAL_ADDRESS`, `LEGAL_REGISTRATION`, `SMTP_URL` (Postmark) and `EXPO_ACCESS_TOKEN`, with the
  code's defaults stated; a first paste left thirteen placeholders uncommented (the new container
  would have refused `SPEECH_PROVIDER`'s), caught by reading the shapes of the values, never the
  values, and put back as comments before it deployed. Live: the terms under Estonian law, the
  register line, every provider probe up. Still the owner's: one DMARC record, Postmark's DKIM,
  and where `hello@cai.me` lands.
- 2026-10-14 — DPA §12 built: an organization's export stays open to its last owner for 30 days
  after it closes (Settings · Security), then a daily sweep deletes what was its alone and keeps
  its customers' copies. The export now carries everything that will go (page, agent and its
  knowledge text, apps without secrets, updates); closing keeps the team's roles for it. The DPA,
  the privacy page and the terms say so, read from `KEPT_DAYS.closedOrgExport`
  (`dpa-draft.test.ts`, `about.test.ts`). Files nothing points at are found by one query with an
  index for each reference (`dropUnusedFiles`; migration 0077 adds the two missing ones).
- 2026-10-14 — R36, passkeys on the web: Settings · Security adds one after the password (named
  by the browser that made it, listed with its last use, removed after asking) and the sign-in
  screen signs in with one, nothing typed. WebAuthn by `@simplewebauthn/server` 13.3.3, pinned (a
  pnpm override keeps one `@peculiar/asn1-schema`: with two, every signature was refused), the
  relying party from `PUBLIC_URL`, each challenge one use within five minutes in the database
  (migration 0078); a recovery, the emailed reset and the operator's "end all access" remove
  them. Every way in makes its session through the one `createSession`, now in
  `lib/sessions.ts` with the cookie in `lib/session-cookie.ts`, so the new module imports no
  other. `passkeys.test.ts` runs a software authenticator (a phishing origin, another account's
  handle, a replayed and a stale challenge, a suspended account, the limit, the sweep),
  `e2e/passkeys.spec.ts` Chromium's virtual one. Startup chunk 449.1 KB of 450. Phones wait for
  the store builds (⛔), and the password stays required until they have them.
- 2026-10-14 — Phone push, built: the phones register their Expo token (`push.native.ts`, the
  web's module shape, so sign-in, sign-out, Settings, the Chats offer and a read elsewhere needed
  no change), Android's two channels from core `PUSH_CHANNELS`, a tap opening where a browser's
  does (`notificationPath`, held to the service worker's answers in `sw.test.ts`), nothing shown
  over Caime in front, and none offered in Expo Go on Android. The server's Expo sender moved to
  `lib/expo-push.ts`: it had no deadline and took every 200 as delivered, when Expo answers a
  phone the app is gone from with a `DeviceNotRegistered` ticket inside a 200, so dead tokens
  were never dropped; now one deadline, the ticket read, a sound and channel by level, no
  `quiet` replacement to a phone, and an hourly probe with the token. Tested with an Expo
  stand-in (`phone-push.test.ts`) and mocked natives (`push.native.test.ts`); both native bundles
  export. Not yet tried on a phone (⛔ the owner's iPhone in Expo Go, after this deploys).
- 2026-10-14 — A phone's lock screen made true as Caime comes to the front: Expo can't replace
  what a phone shows, so a notification read on another device, or whose message was deleted,
  kept its words there. Now the app asks once for the set it shows (`POST /notifications/shown`:
  the person's own still unread, with what each says now) and clears the rest, a burst whose
  preview was taken back included (`phone-push.test.ts`, `push.native.test.ts`).
- 2026-10-14 — Passkey sign-in stores nothing for asking: the anonymous options route wrote a
  challenge row per request (bounded only by the per-address limit until the daily sweep). Its
  challenge is now a nonce and a deadline signed with a key made once (`signingKey`,
  `server_settings`), checked from the answer itself, and the nonce is written only when a
  passkey has signed in, which is also what stops a synced passkey's replay (its counter is
  always 0). `passkeys.test.ts` adds a forged challenge, both kinds of replay and the count of
  rows (none for asking, one per sign-in, swept).
- 2026-10-14 — App links (R35), built for the store builds: `/.well-known/apple-app-site-association`
  answered with the web app's page (any extensionless path under `/.well-known/` did), and
  nothing claimed the domain for the phone apps. Now the server writes both files from the team
  id and the signing fingerprints (404 until set; JSON on every name the service has), the paths
  come from one list in core that the app's config is held to, and the app's builds claim the
  domain they talk to for links and passkeys. Mail DNS checked: one DMARC record now (the
  owner's fix); MX still at Postmark's inbound with Caime Mail off.
- 2026-10-14 — Ask about this conversation (R67's "Cai in a conversation"): a question in the
  conversation's assist tools, answered from the same bounded transcript a catch-up reads, in
  the question's language (`writtenIn`), labelled and kept nowhere, one AI call within the
  allowance (`POST /conversations/:id/ask`, `ai.ask`, `AiAnswerView`; `ASK_MAX` in core's
  light `assist` module). Opening Cai's chat on a conversation was weighed and declined: a
  summary kept in Cai's chat would outlive the words it came from. The terms' list of AI
  suggestions names the answer; SECURITY's AI line and RESOURCES' AI table say what it reads.
- 2026-10-14 — R60, stock that runs out: counts apart from the catalog (`item_stock`), taken
  under row locks as an order is written and refused with the count when fewer are left, held
  in `order_stock` while the order is open and given back once on a cancel, a removal or an
  erasure; the host reads every count, a customer only one that limits their order; "Sold out"
  and "Only one left" on the picker, the item's sheet, the public page and its schema.org offer,
  in all four languages. The setup sends a count only where it changed, so an order since it
  was opened isn't undone.
- 2026-10-14 — R60, the AI agent takes an order: a `<menu>` of what the customer may order (a
  count only where it limits them), the `order` action with its lines and way, an Order card
  from the organization checked by the server as anyone's is, and a person for anything off the
  menu, sold out or unclear.
- 2026-10-14 — R60, options on an item: sizes and extras with what they add to the price, set in
  the item's editor, chosen per line in the order picker (a line per set of choices, the item's
  most and stock over all its lines), named and priced on the card, read by the agent on its
  menu, listed on the item's sheet and page; and an item's sheet no longer stays open over the
  conversation its Order opens.
- 2026-10-14 — R62, a split's shares paid with Pay: "Pay your share" on a split sends a Pay card
  for the share to whoever paid, answering the split; between those two even in a group, one open
  card a share, and the share settled when its payee says it arrived. The Split card's "You"
  and "Someone" read in the reader's language.
- 2026-10-14 — R83/R84, guests in the app: a meeting card invites by email; the guest's link
  opens a join page anyone can read, signs them in for that meeting alone, and is then their
  meeting with its call; a guest in a browser is now rung (their socket was refused before).
- 2026-10-14 — R62, receipts: a paid Pay card has one for its two sides (number, when, how much,
  for what, to and by whom, how), shared or printed; and the photo shrinker loads when a photo is
  picked, out of the first download.
- 2026-10-14 — R58, a meeting that repeats: "Repeats" on the Meeting card, agreed once, each time
  its own card posted a minute after the one before ends (brief, Join, guests asked again,
  "Cancel this one"), "Stop repeating", and the calendar, the feed and the slots looking ahead.
  Whole E2E suite 106 passed; initial web JS 449.9 KB gzip.
- 2026-10-14 — R58, a group's meeting has its brief: by its space's kind, else by each one's own
  label for whoever called it.
- 2026-10-14 — R61, the host's order: collections, items and ways to be paid moved up or down in
  their sheets; the public page lists each collection with what's on it, in that order.
- 2026-10-14 — R68, Cai's weekly digest: off until turned on, once a week on the first day the
  person works, in Cai's chat: who they talked with, what they kept, who has gone quiet, the
  longest wait and the week ahead, by the rules, in their language and their Arabic.
- 2026-10-14 — R58, a meeting every workday and until a day: the proposer's week kept on the
  series, "Until" asked once it repeats, and the calendar, the feed and the slots stopping there.
- 2026-10-14 — R87, who Cai is and for whom: the agent's introduction written by the rules in the
  customer's language and kept from the model, Cai's invitation mail introducing itself, the
  authority levels written down, and the organizations a person runs in their weekly digest.
- 2026-10-14 — R58, a resource shared by several items: the hours keep what's shared, an item
  takes one, and a time is open only while one is free beside every item that uses it.
- 2026-10-14 — Search leaves out a message, and its files, that someone deleted for themselves,
  as every other reader does (`notHiddenFor`): it still found them. Found reading the search
  for Ask Cai; `files.test.ts` fails without it.
- 2026-10-14 — R66, Ask Cai in Search: a question typed there is answered from what search finds
  in the person's own messages, decisions and to-dos, with what it rests on; one model call a
  tap, none when nothing is found, nothing kept. The AI gate is one function (`lib/ai-gate.ts`).
- 2026-10-14 — Leaving a group call in the right order: the others are told by the server, and by
  a goodbye on each connection, before the leaver's connections close, so a device still in the
  call no longer restarts its connection against a call that has ended (an E2E caught three
  refused signals once in a run; `group.test.ts` fails on the old order).
- 2026-10-14 — R88, the places and the conversation: each place's head stays as its list
  scrolls and the list searches itself, handing the words to Search or Cai; the composer is one
  line and five at most; photos open in Caime and files with the session (they opened a browser
  without one on a phone, and nothing on the web's production build); a HEIC's location cleared
  on the server. For phones, built and not yet tried on one: the file sheet, the camera, HEIC to
  JPEG, iOS sheets handing on once gone, long press, voice notes with the ringer off. Chats left
  the first download.
- 2026-10-14 — R89, contacts from wherever they are: the phone's address book, the browser's
  picker, a Google or Outlook account read once on the device (the server keeps no token: the
  access is sealed to the device that asked), or a file; who's here with Connect and Connect with
  all, the rest invited by the person from their own WhatsApp, texts or mail. The match route's
  connection states are one batched read. The accounts wait on the owner's OAuth clients (⛔).
- 2026-10-14 — R58, an appointment that repeats: a weekly session with a clinic or a tutor is
  confirmed once and each time is booked as it's posted, its slot held ahead so nobody else
  takes it; a time taken all the same is skipped and said, a withdrawn item ends it and says so.
  Found on the way: a link to the Bookings view (`?view=bookings`) opened the default view on a
  desktop, whose list pane didn't read it; it does now (`useInboxView`).
- 2026-10-14 — R66, what Cai does unasked: one choice (Less, Usual, More) for how sure Cai must be
  to suggest, whether and how soon it asks about a quiet wait, and whether it speaks before a
  meeting; Usual is unchanged. The team's Bookings give a repeating appointment's "Every week" a
  line of its own, so a narrow pane no longer cuts it off.
- 2026-10-14 — R67, Cai's and the friends' pages: what each helps with and knows, from the lines
  it says in its chat, the friend drawn; fixed on the way: those pages showed a friend's words in
  English to an Arabic reader.
- 2026-10-14 — Production stopped taking new builds after 20:41: the service's environment fails
  the server's own configuration (`MINIMUM_AGE=10`, below its 13; a second `SMTP_URL` that isn't
  an address), so each new container exits and the old one keeps answering while EasyPanel
  reports the deployment done. ⛔ The owner corrects the environment. `check-env` names what fails
  (never a value) before a deploy; the runbook says to verify a page the release changed.
- 2026-10-14 — From the owner: Postmark Pro is not active, so Caime Mail stays off (no inbound on
  Postmark's lower plans) and `cai.me`'s MX, which points at Postmark's inbound, reaches nobody
  until it goes back to Cloudflare Email Routing (DEPLOY step 6) or Pro is on. The Apple Developer
  and Google Play accounts are ready: the store builds (DEPLOY "Phone builds"), `APPLE_TEAM_ID` and
  `ANDROID_CERT_SHA256` for app links and passkeys, wait on the owner's Expo account and first
  `eas build` (it asks for the store credentials once).
- 2026-10-14 — Production back on current code: the owner corrected the environment
  (`check-env` passes; two identical duplicates left), and 97f1971 deployed and verified live
  (healthz 200, readyz ok, `/@panda` in Arabic and `/@cai` with R67's words, the site's pages,
  the API document). Caime Mail is on (its inbound refuses an unsigned request, 401) but receives
  nothing until Postmark Pro (⛔ the owner: Pro, or the `MAIL_*` variables off and the MX back to
  Cloudflare Email Routing).
- 2026-10-14 — R90 phase 1, connected accounts for the calendar: one Google or Microsoft account
  connection per account in Settings · Apps, busy times read and kept as times alone, holding a
  person's and an organization's providers' slots. Found on the way: a job's dedupe key is kept
  for good, so a "read again" keyed by the account alone would have run once ever; it's keyed by
  the minute. Postmark Pro is on (the owner): Caime Mail can now receive.
- 2026-10-14 — Caime Mail live test: Postmark Pro on, MX at Postmark, both test mails "Processed"
  by Postmark, yet neither reached a conversation. Caime answered 200 and dropped them at one of
  its own checks, which said so to nobody. Each mail in now writes one log line ("mail in": its
  outcomes and the DKIM, SPF and DMARC results, never an address or a word), so the operator sees
  why in the service's log; the cause is found with Postmark's Retry once that's deployed.
- 2026-10-15 — R90 phase 2, files from Google Drive and OneDrive: a connection's Files use, the
  Share sheet's drives, OneDrive browsed in Caime, Google's picker on its own page, the picked
  file copied in as an upload. Found on the way: following OneDrive's download redirect with
  `fetch` carried the access to it when it was same-origin; the redirect is now followed by hand.
- 2026-10-15 — Caime Mail verified live both ways: the "mail in" line named the earlier silence
  (mails that came before raw content was on could vouch for no sender); with it on, an outside
  mail was delivered (DKIM and DMARC pass) and the owner's replies went out as mail.
- 2026-10-15 — Caime Mail's SPF was never checked: Postmark's topmost Received line is its own
  local hand-off ("by p-pm-inbound… (Postfix, from userid 996)", no sending address), and
  `receivingHop` gave up there instead of reading on to the line from outside. Every mail logged
  `spf: null`, so a sender whose DMARC passes only through SPF (Google Workspace's default
  signing: `datac.com`, `d=…gappssmtp.com`) was dropped as unverified. Fixed, with a test from
  the real header. Mail from one's own sign-in address to one's own Caime address is refused (by
  design, but silently): what it should do (a note to self, "forward to Caime") is a decision
  still open.
- 2026-10-15 — R91, accounts: the owner's brainstorm validated into the product review. One list
  of what is someone (Verified: ownership proven, a phone by WhatsApp code; Connected: access
  working), the honest reach of "never leave Caime" per provider, personal WhatsApp, Messenger,
  Instagram and LinkedIn messages declined (no official interface), organizations' business
  channels into the Business inbox. Three phases on the roadmap.
- 2026-10-15 — R91 phase 1 built: own email addresses and phone numbers, each proven by a code (by
  mail, by WhatsApp through Meta's Cloud API with a provider-health probe), in the one "Your
  accounts" list; proven ones find their person and are them for mail; self-mail lands with Cai.
- 2026-10-15 — R92 places and R93 writing by email built: places for people and organizations
  with audiences, on profiles, pages (JSON-LD addresses) and cards (a meeting's "Where", an order's
  delivery address); an address not on Caime written to from Search or Connect, by mail from one's
  own Caime address, as a message request. One provisional person per address now everywhere.
- 2026-10-15 — "Connecting…" that never ends, on some Wi-Fi: a socket that doesn't say hello
  within 15 s is given up and tried again, and while none gets through the app fetches what's
  new over HTTP every 20 to 60 s when it's in front, saying so in the banner (`delayed`).
- 2026-10-15 — R92: a place shared as a Location card (the place's words and point copied, never
  live), from the card's form beside "Use where I am now".
- 2026-10-15 — R92 branches as booking hosts: items at a branch, a branch's own days, the
  branch's address on the card, its name on the public page and in the agent's catalog.
- 2026-10-15 — R91: people found by a proven phone number, from contacts and People search, by
  its own privacy switch.
- 2026-10-15 — R75: an organization's AI agent (and its apps) answer a customer by mail when the
  customer wrote by mail; the send job had dropped every word not a person's.
- 2026-10-15 — R75 notices: newsletters and no-reply mail land under Notices, muted, never a
  request, never answered.
- 2026-10-15 — R75: "View as sent" opens a mail's own HTML in a sandbox (nothing runs or loads).
- 2026-10-15 — R75: mail says Seen when they reply or open it in Caime and "Opened, probably"
  by the provider's pixel (disclosed, off by a switch); signatures fold, Gmail's asterisks go.
- 2026-10-17 — Whole-product challenge review (docs/REVIEW-2026-10-17.md): ten slices over
  journeys, safety, reliability, performance, intelligence, mail and calendar, chat, integrations,
  business and code integrity; the matrix against WhatsApp, Signal, Slack, Calendly and Workspace;
  an age-assurance design; the integration framework mapped to the code; plan M16 (A–H).
- 2026-10-20 — The French and Turkish catalogs come in two halves fetched side by side, as Arabic
  does: their largest download 48.9 KB where one was 95.2 KB of a chunk's 100; the first download
  448.8 KB of 450 (0.2 KB more: the two loaders).
- 2026-10-21 — M17 I13a (R114, the owner's call report): call notes in whole sentences, heard
  clean, a speaker's turn one paragraph; every transcript the speech provider keeps deleted once
  read; Cai in a call decided in three modes (Notes, Record, Interact: Cai heard by name, answering
  aloud through the recording browser, acting on a tap).
- 2026-10-21 — M17 I3a: a catch-up that read only the latest of what's new says how much
  ("From the latest 39 of 45 new messages.").
- 2026-10-21 — M17 I2c, and so I2: one way a wait is brought up (where it stands read once; the
  reminder, Cai's follow-up and Attention's ask say only that; the "No reply" push and the chat's
  "follow up?" leave an ask to the wait it became); a pending card follows its edited words and
  goes once its moment has passed; the number, waits closed within a week of their day.
- 2026-10-21 — M17 I2b: "Mark done" offered when whoever promised something sends it (a file, a
  link, "Sent!", "تم", "c'est fait", "gönderdim"), never closed by itself; Undo opens it again.
- 2026-10-21 — M17 I2a: one rule for when an action reminds its owner (core `remindAtFor`): its
  morning, never the moment it's late; a "remind me" without a day the next morning; a wait looked
  at on its day and saying whose it is; Attention asking after a wait's day; a moved day moving the
  reminder it made.
- 2026-10-21 — M17 I1: the agent's runs priced, so its backstop trips; AI answers in the
  language a person reads Caime in; the agent makes a booking or an order before it says so, the
  team confirms it, a refusal or a false claim is a fixed line and a hand-over; never silent (the
  organization's greeting and away message while it stays out, a failed call tried again); the
  light model's caps leave room for its thinking and it sends no fallbacks. Before launch.
- 2026-10-21 — Intelligence review (docs/REVIEW-2026-10-21-INTELLIGENCE.md, R113): five slices
  against the best alternatives; ahead on people, behind on volume; two bugs found before anyone
  met them (the agent's runs unpriced, AI answers in the sign-up locale); the plan is M17, I1
  before launch.
- 2026-10-21 — M16 F7e: a call's notes written up once it's over, for whoever heard it all: its
  summary, topics, decisions and next steps, each step offered to its person (R112).
- 2026-10-21 — R111 decided: an organization's Cai answers its calls, the organization pays and
  the caller never does; built after customers can call an organization at all (H8).
- 2026-10-20 — M16 G14: Cai and the friends get a message, a call, a meeting or a search ready
  when asked, in four languages, done on the person's tap: R110's second phase.
- 2026-10-20 — M16 G13: Cai and the friends keep what they're asked to ("remind me to…", "add a
  task:", "save it as a task") on the spot, with Undo, in four languages: R110's first phase.
- 2026-10-20 — M16 F6c: whoever is reached by mail (a page's booker, someone a meeting held on
  Caime was mailed to) joins its call from their own link in the mail and their calendar, with no
  account; a call to them rings their page.
- 2026-10-20 — M16 F7d: "Catch me up" and "Find follow-ups" on a call's notes, on ask: a catch-up
  labelled Cai's and kept nowhere, the follow-ups the reader's own suggestions by the line they
  came from, offered once.
- 2026-10-20 — M16 F7c: a meeting proposed with "Cai takes notes" says so on its card, mail and
  calendar, and its Join asks as it starts or answers the call; a group meeting's Join joins the
  call that's on; no plain Join into a call whose notes are asked for or on, a guest's included.
- 2026-10-20 — M16 F7: Cai takes notes in a call: asked by anyone in it, on once everyone has
  said yes (the ring and the join ask, never a plain Answer), stopped for everyone by anyone's
  no; one member's browser records each voice apart in utterances, heard by the speech provider
  on the asker's day and deleted once heard; the call's line opens the notes, each person's
  words theirs to delete.
- 2026-10-20 — Settings, every page on a desktop and a phone: `/settings` opens You, never a
  page that isn't there; a browser's session is named by its browser ("Chrome · macOS") as a
  passkey is; in a customer's conversation the team is offered the organization's places for a
  card's Where, never a team member's own; template rules read in the reader's language; Personal
  shows no period picker over insights it can't show; the calendar feed, places, region, About
  and Apps say what they do in truer words ("Turned on", not "On since").
- 2026-10-19 — M16 F6: Where is said on every meeting, booking and item (on Caime, a place, or
  somewhere else); a booking of a person's time held on Caime is joined as a meeting; Google,
  Outlook and the feed name whom it's with, never doubled, with the join link as its place; the
  feed leaves to a connected account what it writes there.
- 2026-10-19 — Speech: ElevenLabs is production's speech provider (its privacy page names it);
  the adapter's default model is Scribe v2, which the price list prices, where it asked for v1,
  which ElevenLabs deprecated and no longer prices (`ai-costs.test.ts` holds every provider's
  default to a price).
- 2026-10-19 — M16 F5b: a booking takes another open time of what it booked, from its card and
  through an organization's app, checked as a booking is, where it took a cancellation.
- 2026-10-19 — M16 F5: either side suggests another time on a meeting or an appointment's card,
  which asks the other side again and says so; whoever has it by mail and a meeting's guests get
  the update their calendar moves (and the cancellation), where it took a decline and a new card.
- 2026-10-19 — M16 F4: an invitation someone's calendar mails a person is a meeting card from its
  organizer, answered here and back in their calendar (`METHOD:REPLY` from the person's address),
  moved by their later word (a new time asks again, a cancellation cancels it); a series, a day,
  someone else's event and a notice arrive as mail, as before.
- 2026-10-19 — M16 F3: cards reach someone by email, a meeting as an invitation their calendar
  answers, the answer moving the card; what a mail can't carry isn't offered.
- 2026-10-19 — M16 F2: someone reached by email can be followed up, a day apart and twice at
  most, before they answer, where one mail was all.
- 2026-10-19 — M16 F1: mail whose sender couldn't be confirmed is kept for the person it reached,
  under Notices and saying so, never taken as the address's own person's; refused only where its
  domain asks, at an organization's or Cai's address, and under 18.
- 2026-10-19 — M16 G12: a voice note's length read from the recording itself, never its device's
  word, before a provider is paid for it; a browser's MP4 voice note (Safari's) is a recording,
  heard, where it was kept as a video.
- 2026-10-19 — M16 G11: Cai about one person, by the rules: "what am I waiting for from Ana",
  "what did my manager ask me", "امتى هشوف أحمد" answered from the records with that person alone
  in four languages, no model; Cai's own-question answers keep an older private to-do out.
- 2026-10-19 — M16 G10: the golden sets hardened: 465 golden lines with a per-language due date,
  156 held-out lines of Arabic by dialect, and golden sets for amounts, Cai's intents and Search;
  the Maghreb's promises read on lines nobody tuned for at 0.86 where they were 0.00.
- 2026-10-19 — The web's first download back to 447.5 KB of 450: a phone's haptics, keychain and
  AsyncStorage reached on the web through twins that load none of them (2.5 KB gzip), held by
  `webVariants.test.ts`; G9's plan screens took it to 450.3 before.
- 2026-10-19 — M16 G9: AI by what it costs: every call priced as it runs, a person's day in euros
  of model time said in words, an agent's backstop by cost beside its count; Pro's edge €70.89 a
  month where it was €2,178.96.
- 2026-10-19 — M16 G8: a voice note's words read like typed ones: its asks, promises and dates
  offered once as a text's would be (a customer's for whoever has the thread), and an age
  check's finding keeps a minor's notes from the provider.
- 2026-10-19 — M16 G7: nothing from a private conversation on the server: to-dos and decisions
  tied to one refused on every path, older ones kept out of search, Ask Cai and Cai's own chat.
- 2026-10-19 — M16 G6c: the agent measured every night: Caime's 24 questions in four languages
  through its own call on each plan's model, scored by rules (hand-overs, wrong confirmations,
  planted instructions), on /metrics, for the operator and on the agent's setup.
- 2026-10-19 — M16 G6b: an organization may check its agent's answers before they're sent (a
  draft to send, take into a reply or let go); what it couldn't answer is listed for its owner.
- 2026-10-19 — M16 G6a: an organization's agent cites the sentences of what it was told under
  every answer for its team alone, books and takes orders only where it's let, can answer only
  while closed, says why it hands over, and every model call keeps its instructions' version.
- 2026-10-19 — M16 G5: a person's feed of what reached them (`GET /v1/feed`), newest first or
  after a cursor, never passing over a message still being written: the bridges' trigger on a
  new message, with the address on the bridge sheet, the SDK's `feed()` and the MCP's `feed`.
- 2026-10-19 — M16 G4: a plan a connected calendar refuses is that event's alone: tried three
  times, then left until it changes while the rest go in; the person, /metrics and the operator's
  new list of connections say how many wait.
- 2026-10-19 — M16 G3b and G1c: a team member's own calendars show an organization's bookings
  by its name and time alone while it keeps its conversations from their apps; the clear webhook
  secret columns dropped.
- 2026-10-19 — M16 G3: an organization keeps its conversations from its team's own tokens,
  bridges and apps until its owner or an admin lets them in; accounts, automations and rules
  write audit rows.
- 2026-10-19 — M16 G2 and G1b: each connected account's read and plans say how they last went,
  a provider's wait honoured, a grant gone told once, Google's and Microsoft's sign-in probed;
  webhook secrets sealed alone.
- 2026-10-19 — M16 G1: credentials: organizations' webhook secrets sealed by the vault's key
  (the clear copies emptied next release), Google's picker page opened once with an access asked
  narrowed to the files picked, an OAuth app's client secret replaced with a day's overlap.
- 2026-10-19 — M16 H7: what a person costs: production's AI moved off Opus 5.5 for everything
  (the light model is Haiku 5.5 unless set; the top model for a payer's follow-ups and agent), one
  price list priced against `ai_runs`, the operator's AI cost per person by plan, the free plans
  held at the edge of their allowances, the tables in RESOURCES.md. R106.
- 2026-10-19 — M16 H6: a files place, links to your own files, Office files read as pages: the
  files between two people and a space's, a link for anyone or the signed-in, a day to a month,
  dead with its message or maker, a visitor's page with a report; Word, Excel, PowerPoint, CSV and
  text as escaped pages on the web, a zip read under a ceiling. R105.
- 2026-10-19 — M16 H5: intake forms as cards: an organization's forms, sent from a customer's
  conversation or by themselves after a booking, filled in on the card and kept in the record.
- 2026-10-19 — M16 H4: what the conversations came to: bookings, orders and money paid on an
  organization's insights, who bought and came back, what sold most, when customers write;
  the operator's metrics count advantage 2.
- 2026-10-19 — M16 H3: what a team keeps about its customers: a note, tags and its own fields,
  beside the conversation, for the team alone; tags on the inbox's rows and a filter by one.
- 2026-10-19 — M16 H2, after CI: the away message landed before the greeting when both
  jobs came due at once; an away message asked for with a greeting now says it first (by
  its client id, so once), and a test runs the away's job first.
- 2026-10-19 — M16 H2: an organization's own replies: quick replies by "/" for the team, a
  greeting, and an away message that says when it opens again, in the customer's language.
- 2026-10-18 — M16 H1: plans that hold up: a Business seat includes Pro for its person, an owner
  runs three free organizations at once, and a plan's room is counted inside the transaction that
  takes it (two at once never both pass).
- 2026-10-18 — M16 E5: one vocabulary: "Find people" for every way to find and connect, "Needs
  you" for the Chats filter, an organization called one ("Business" only the plan, the inbox and
  the badge), Plan a meeting, Poll and Place as rows of their own, and no "kit", "task",
  "sphere", "Memory" or "Contexts" left where people read. E is whole.
- 2026-10-18 — The appointment form keeps the slot picker's room while a host's slots are asked
  for: the free "When" it showed meanwhile was swapped for the picker, which moved "Repeats"
  from under a tap (the full run found it). The link card's spec reads an address of its own
  each run, since the server keeps a page's card for a month and the database outlives a run.
- 2026-10-18 — M16 E4c: link previews, each page read once by the server and kept 30 days by
  its address's hash; shown in the composer (taken off by its ×) and in the bubble, the picture
  from Caime, so no site learns who sent or read a link. E4 is whole.
- 2026-10-18 — E2E: six races in the E1–E3 specs closed where each starts (the cache a second tab
  saved, a hover's grace, the Chats row beside the bubble, a read never seen), the batch on main.
- 2026-10-18 — M16 E4b: videos picked with photos, played in the bubble, "🎥 Video" where they're
  named, and every MP4, QuickTime file and recording cleared of where it was filmed.
- 2026-10-18 — M16 E4a: voice notes with their bars (measured as recorded, pressed along, read by a
  screen reader in five-second steps), 1.5× and 2×, and every client payload kept as its kind
  reads it; the startup chunk back to 448.4 KB (the Actions row out of `__common`).
- 2026-10-18 — M16 E3b: mark as unread (a dot until it's read) and reply privately from a group
  (quoted as each reader may read it, nothing copied). Block E's reading flow done.
- 2026-10-18 — M16 E3a: reading a conversation: opened at the first unread with their count, the
  jump button's count, a date pill, big emoji, mentions marked, last seen in a chat's head.
- 2026-10-18 — M16 E2: replies and reactions: a quote names whose words it quotes and goes to
  them, a hold on a reaction names who, one's own group message says who read it, and a swipe
  answers on a phone (built, not yet tried on one).
- 2026-10-18 — M16 E1: a chat that says what's true: read never looks like delivered, no English
  showing through in the other languages (and a scanner that would see it), a failed load said
  as one with Try again, Undo on delete. D4b verified on cai.me (the shared chunk byte for byte,
  the pricing page's whole-sentence keys in Arabic).
- 2026-10-18 — M16 D4d: one face per person (R99): a line about what you do, shown by Work
  details, in place of identities nobody could set; block D (performance and integrity) done.
- 2026-10-18 — M16 D4c: one consent pipeline for contacts and connected accounts (the link, the
  sealed state, the code's trade, the landing), each use keeping its own return address.
- 2026-10-18 — M16 D4b: placeholders named for what they hold (124 sentences), every sentence
  whole, lists in the reader's own comma and "and" (Arabic had read an English "and"); a sheet
  on the web leaves at once, so what's typed right after it closes is never lost.
- 2026-10-18 — M16 D4a: a device's approval is signed in the protocol's own words, so devices
  reading different languages vouch for each other again; words lowered by the reader's own
  rules; reminders and relationship offers whole sentences in every language; numbers written as
  each language writes them. D3a and D3b verified on cai.me.
- 2026-10-18 — M16 D3b: live events refresh by `qk`'s keys alone, a sooner refresh never put off,
  the inbox read once per change where it was read twice; the cache written only through its two
  helpers; "Do all"'s Undo honest about what it couldn't take back.
- 2026-10-18 — M16 D3a: one rule for what a person may read of a conversation (Cai's model no
  longer reads what someone deleted for themselves), one transcript, one end for a card, words cut
  by character, LIKE escaped, the public address trimmed once. D2b verified on cai.me.
- 2026-10-18 — M16 D2b: a group past a hundred is a crowd: no acks, no typing, the inbox patched,
  and a stranger's word to everyone waits in each inbox while what's for you still alerts; every
  group's notifications written at once (80 members: 267 queries → 34).
- 2026-10-18 — M16 D2a: work after a response eight at a time with a gauge; a crowd's bus message
  split rather than written to a table; every foreign key indexed (53 weren't), held by a test.
- 2026-10-18 — M16 D1: whole rows only where they're the point (a guard over the syntax tree
  that found seventeen reads the old one passed), people lists at a fixed cost (274 queries for 30
  connections → 12), and where someone last wrote kept on their row for the inbox.
- 2026-10-18 — M16 B7: age assurance, phase 1: a check on the provider's own page (Agemin first,
  from its published API), heard by its signed notice and by the return, the stricter reading
  applied to every under-18 rule, asked before an organization, a sale or a first message to a
  stranger where a provider is set; ⛔ the provider's contract is the owner's.
- 2026-10-18 — M16 B6: notice and action for everyone: a report from any public page without an
  account, answered by mail; a suspension says why, and a suspended person appeals and downloads
  their data; what waits on the operator is on /metrics. B4 verified on cai.me.
- 2026-10-18 — M16 B5: keys apart from the data: VAULT_KEY seals connected accounts' tokens and
  the database's key goes once nothing it opens is left; BACKUP_KEY encrypts every dump before it's
  kept or copied, with a tool to turn one back; ⛔ both values are the owner's to set.
- 2026-10-18 — M16 B4: asked before being added: "Who can add you", minors asked where strangers
  are, invitations on Attention, blocks honoured by adds, twenty new message requests a day, a
  request's photos blurred. B3 went live after its own gate; B1 and B2 verified on cai.me.
- 2026-10-18 — M16 B3: reports that hold up: what the reporter saw kept with the report, a child's
  safety first, closed reports gone after their time, an organization suspended by the operator
  (nobody new finds it, nobody writes as it or to it, its apps refused, lifted whole), a date of
  birth corrected by the operator. B1 and B2 went out together (one CI run for both).
- 2026-10-18 — M16 B2: a message deleted for everyone, disappeared or erased leaves no copy:
  its mail envelope, the files only it held (bytes and all) and what an organization's apps were
  sent of it go; app deliveries keep no longer than the organization's retention; the export
  carries mail envelopes, calendar times and reclaims, and no live invite link. C1d live on
  cai.me (`0067d29`: every organization's page carries "Message …" and its form).
- 2026-10-18 — M16 B1, safety and trust's first slice: writing to an address by email counts
  against the day before anything is said of it and refuses someone's address without naming
  them (H2; what still differs is in SECURITY); an adult's invite link no longer connects someone
  under 18 they don't know through someone (H3); a profile reads as nobody to anyone new where
  finding them would (suspended, found no way they allowed, under 18 to an adult), and those in
  touch keep it; a minor's privacy is clamped whatever was saved; a read nobody may see sends
  nothing at its moment, and a request pending or declined tells its sender nothing; a guest who
  doesn't say they're 18 or over keeps further guests and join links out. The privacy page and
  the help say what changed for people under 18 and for requests.
- 2026-10-18 — M16 C1d: an organization's page, and its door's link and QR, take a message from
  anyone with a name and an address proven by its code, into the Business inbox; the team's
  answer goes back by mail from the organization's address, and the reply comes back into the
  same conversation; joining with the address later makes it theirs. Block C is done but the
  phone by WhatsApp code (why above). The bubble's screen-reader words (You, Mentions you,
  Pinned, Forwarded, where it is, a photo or a card without words) and a reaction's "including
  you" read in the reader's language (block E's English leaks, in part). C3g live on cai.me
  (`f7079a6`: the iPhone `.zip` reader in the served bundle).
- 2026-10-18 — M16 C3h: a join link may have each person ask first, the owner or an admin letting
  them in or not; such a link may stand where someone under 18 is, who may ask where an adult
  connection or a verified organization runs the place. C3f live on cai.me (`a27d078`: the keep
  route answering).
- 2026-10-18 — M16 C3g: the WhatsApp importer takes an iPhone's `.zip` as it is and a group's
  export into a group its owner or an admin runs, each name taken as one of its people or kept as
  a name; an iPhone's own lines (the encryption notice, who added whom) no longer come over as
  someone's messages. C3e and C3b live on cai.me (`e4ddb3d`: a dead `/g/` link's page, the join
  route answering).
- 2026-10-18 — M16 C3f: a meeting's guest keeps the meeting as their own account in one tap from
  its page; a guest's sessions no longer outlive a claim of their row. CI on `2710524` had failed
  on a join link spec's sent line matching the list's preview too (fixed in `5eb72bd`).
- 2026-10-18 — M16 C3b: a verified organization may let anyone with a confirmed address at its
  domain onto its team in one tap, without an invite each; someone it removed comes back only by
  a manager or an invite.
- 2026-10-18 — M16 C3e: join links for groups and spaces. Its owner or admins post one where
  its people already are; whoever opens it reads where it leads without the app, signs up and
  joins in one tap, reading what was said before; adults only, none where anyone is under 18,
  and nobody under 18 added while one is open. One way into a group (`addToGroup`) and one into
  a space (`addToSpace`). C3c and C3d live on cai.me (`3b573a9`).
- 2026-10-18 — Correction: production has sent mail through Postmark's SMTP since the owner set
  `SMTP_URL` on 2026-10-14 (logged that day), so the ⛔ "needs `SMTP_URL`" this log and C1a–C1c,
  C3a and C3c carried since was wrong when written. Checked from here without a credential: the
  service's variables (`SMTP_URL`, `EMAIL_FROM`, Caime Mail's `MAIL_PROVIDER` and `MAIL_DOMAIN`
  set, its token and webhook secret present), the live privacy page naming Postmark for sending
  Caime's mail and for receiving mail to Caime addresses, `POST /v1/auth/reset` answering with a
  mailer (200, not 503) for an address with no account, and `cai.me`'s MX at
  `inbound.postmarkapp.com` and Return-Path (`pm-bounces`) at `pm.mtasv.net`, under DMARC
  `p=reject` with strict alignment. A delivery itself is seen in Postmark's Activity (the owner's);
  mail from an address at `cai.me` rests on its DKIM being verified there, since strict DMARC
  rejects anything else.
- 2026-10-18 — M16 C3d: onboarding shares the general invite link (it connects at once, one per
  person, the contacts sheet's too); where a browser can't read contacts, WhatsApp and a text
  come first; an iPhone's browser tab is told how to get notifications. C2b live on cai.me
  (`795de62`).
- 2026-10-18 — M16 C3c: a meeting guest invited by a link the inviter sends themselves (works
  without mail, on WhatsApp or anywhere; the guest at no one's address); a dead invite link says
  so. C3a live on cai.me (`b225093`).
- 2026-10-18 — M16 C2b: a direct sign-up sets up their organization from onboarding; setting
  one up is a checklist (hours, the team, the domain, an AI agent) whose next step never waits on
  DNS.
- 2026-10-18 — M16 C3a: team invites by link and by email. An owner or admin hands out a link
  (or sends one to an address) from the team's Add sheet; whoever opens it reads whose team it is
  without the app, signs up through it and joins in one tap; an emailed one is for whoever proves
  that address. One path onto a team (`seatOnTeam`) under the organization's row. C2a live on
  cai.me (`9930faa`).
- 2026-10-18 — M16 C2a: closed days (holidays) kept with the hours and skipped by the slots
  everywhere; the Book link and its code beside the door; "Start free" on the page for
  organizations lands a new owner on starting theirs through onboarding. With it, a group call's
  late signal (from or to a device that had just left a call others were still in) answers 409
  as one to an ended call does; it was 403, and the meeting guests' E2E caught the race.
- 2026-10-18 — M16 C1c: the booker recalled by mail the day before a confirmed booking, and a
  person's public item booked from their page as an organization's is (a message request that
  holds the time; agreeing to it answers it). Advantage 3 now books from a professional's own
  link and reminds; numbers as C1b counts them, plus `reminded`.
- 2026-10-18 — M16 C1b: the claim of a provisional person's history needs the address's code
  (review §2 H1, pulled forward from B since C1a made that history real); a provisional booker
  hears by mail with a calendar invitation when the clinic confirms or cancels; no booking form
  where this Caime can't send mail; advantage 3's numbers counted (`caime_public_bookings_total`,
  product metrics' door). A1–A3 and R98 live on cai.me (`9cc277a`); the tested image is published
  at `ghcr.io/h-khalid-h/caime` and pulls without a login.
- 2026-10-17 — M16 C1a: booking before an account. A visitor books an organization's public item
  from its page: the week's times, a name and an address, a code, the appointment request from
  their provisional self; every step is the page, nothing kept before the code. Needs `SMTP_URL`
  live (⛔). The confirmation's mail to the booker and the door's "message before an account"
  are C1b.
- 2026-10-17 — R98: the owner's "Caime Places" brainstorm validated into places as a context
  for spaces (a place-space with an owner, follow for updates and join for the group, one join
  rule, admins as any space's; time-in-place guardians, ownerless places, public groups,
  following people and proximity discovery declined, with why). Queued after block C.
- 2026-10-17 — M16 block A, the launch floor: A1 the reliability core (the bus listens again
  and tells the hub, readyz says both, liveness apart, statement and pool timeouts, the
  no-transaction migration path, chunks spooled, request ids, gauges from the database), A2 the
  job system (dead letter, heartbeat and time limit, periodic claims, streamed backups, the image
  semaphore, the operator's jobs routes), A3 the rest (the effects outbox and its sweep, the
  migrations lint in check and CI, the image by sha with its version on healthz, the staging
  gate). Each through the full gate; A1 live on cai.me (`readyz` ok on cceea42), A2 and A3 pushed
  in turn behind their E2E. The owner's switch to the published image, staging, the bucket and
  the alert receiver stay ⛔.
- 2026-10-17 — R96: bookings and connected calendars in step (owner's report): a stranger's
  booking holds the host's time while its request waits; every calendar of one's own read, a
  failed read never taken for a free day, a stale read redone before booking; Plans writes
  Caime's meetings and appointments into Google and Outlook and keeps them in step.
- 2026-10-15 — R95: the pages a visitor lands on (a person, an organization, an item, a
  collection, an invite, the 404) designed: a header with face or logo, offers as cards, a
  bar with the price and Book in reach of a thumb, Caime's foot.
- 2026-10-15 — R94: handles by one engine (ranked candidates, generic words kept, lookalikes
  refused); gender asked at sign-up, never required; mail from before folded and marked seen.
- 2026-10-15 — R92: branches have their own people and per-day hours; customers choose a branch;
  the team filters Bookings by branch; a Location card from a saved place in any conversation.
- 2026-10-15 — R93: a person reached by email offers "Write by email" (their mail conversation)
  rather than Connect, which failed with "That person wasn't found" (owner's report); the profile
  says "Reached by email" once.
