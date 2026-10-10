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
- [ ] ⛔ `cai.me`: parked for sale at Afternic on 2026-09-28, for about $400, which the owner has
      agreed to (still on Afternic's nameservers on 2026-09-29). Once it's bought it's pointed at
      EasyPanel (docs/DEPLOY.md, "Domain to come"); until then production stays at its current
      addresses
- [ ] `cai.me/@handle` for people and organizations (R35), opening the app where it's installed:
      `apple-app-site-association` and `assetlinks.json` served by the server, the app's
      associated domains. After the domain
- [x] Reserved handles (R35): nobody takes one that reads as Caime (its names, inside other
      handles too), one of its characters, the people who run it, or its pages and screens.
      Refused at sign-up, on a handle change and for a new organization as a taken handle is;
      given out only by the operator (`/v1/admin/{people,orgs}/:handle/handle`), audited, one
      claim of a handle at a time
- [x] Handles let go of are held (R35): one someone changes from, a deleted account's, or one
      the operator moves someone from is held from everyone for a year, whoever had it included,
      keeping only the handle and the days (`released_handles`, forgotten once it's over); an
      organization keeps its handle for good; the operator can give a held one back
- [ ] Passkeys (R36): WebAuthn sign-in on web, iOS and Android, password optional once a passkey
      exists, recovery codes kept. After the domain, since a passkey is bound to it
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
      (`insights.test.ts`, E2E). Not sold: identities (not built), history (the wedge), search
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
      against the provider that passed
- [ ] Candidates from the 2026-09-30 brainstorm review (R46), the owner's call: organizations
      taking WhatsApp Business messages into the Business inbox through Meta's official Cloud
      API ⛔ a Meta business account, verification and fees; contact matching by hashed phone
      numbers with consent on both sides. Everything else in it (reading other apps'
      notifications, auto-replies in the person's name, an Android hub) is declined for good
- [x] Email (R48): the address confirmed with six digits, a forgotten password reset by a link,
      through `SMTP_URL` (`email.test.ts`, E2E with `e2e/smtp-stub.mjs`) ⛔ an SMTP account on
      production: until then nothing is sent and recovery codes are the way back
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
- [ ] Phone push: the server sends through Expo when `EXPO_ACCESS_TOKEN` is set, but the app
      registers no phone yet (`expo-notifications` is imported nowhere; the native push module
      is a stub). It joins the development build, with the store work.

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
- [ ] Later layers of R60: stock that runs out, an Orders view for the team, the AI agent taking
      an order, options on an item (sizes, extras).
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
- [ ] Later in R66: "Catch me up" and "Ask Cai" as Cai's explicit moments in a conversation and
      in Search, Cai's settings (how proactive, ask when unsure), digests.
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
- [ ] Later in R67: Cai in a conversation ("Catch me up" opening Cai's chat on it), Cai's digests
      in its chat, public pages for @cai and the friends (answer engines), more of what each friend knows.
- [ ] ⛔ A trademark and store-name clearance for "Caime" before the store builds (the owner's).
- [ ] Later layers of R62: a receipt from a paid card, refunds from a card paid by card, a
      split's shares paid with Pay.
- [x] R63: an item's photo: `BookingItem.photoFileId`, set only to an image its saver uploaded
      (`assertItemPhotos`), served by `/v1/{orgs,people}/:id/items/:itemId/photo` to whoever may
      see the item (anyone for a public one), addressed by core `itemPhotoPath`; on the item's
      public page (picture, `og:image`, JSON-LD `image`), its sheet, a collection's list and the
      order picker; added, changed or taken off in the item's editor. `item-photos.test.ts`,
      `e2e/bookings.spec.ts`.
- [ ] Later layers of R61: a collection's order on the host's page, person pages' items in a
      sitemap only if a person opts in.
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
- [ ] Later layers of R58: a recurring card (each occurrence its own brief), a resource shared
      by several items (one set of chairs for two services), a customer choosing who does it
      where an organization allows it, group meetings' briefs.

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
- [ ] R75, Caime Mail phase 1: `MAIL_DOMAIN` and the inbound interface (`lib/mail-in.ts`, a
      provider's webhook; a stand-in in tests, `e2e/mail-stub.mjs`), the authenticated From only,
      provisional people (visible to whoever they wrote to, found by nobody, gone with their
      conversations or after a year), a stranger's mail as a request that keeps every message,
      threads as topics named by the subject, attachments through files, replies out with sent,
      delivered and bounced, claiming an account by signing up or in with the address, the
      Business inbox for an organization's address, under-18 addresses closed to strangers,
      export and erasure, the privacy and help pages and the processor list.
- [ ] ⛔ R75 in production: the mail domain's MX at the inbound provider, DKIM, SPF and DMARC,
      the provider's credentials and webhook secret (the owner's).
- [ ] R79 layer 1, bridges (PRODUCT-REVIEW R79): Zapier, Make, n8n, Pipedream and IFTTT as
      bridge built-ins in Discover (a sheet that makes a scoped personal token in one tap and
      says what each can do with Caime; on while the token lives); a contacts file into People
      (vCard, CSV: who's here by address, invite links for the rest); personal webhooks for
      push triggers after the polling bridges are in use.
- [ ] ⛔ R79 layer 2, first-party connectors: Google Calendar and Outlook calendar sync, live
      contacts, sign-in with Google, Apple and Microsoft, each needing the owner's OAuth client
      with the provider; built on one connector interface with a stand-in and a health gauge.
- [ ] R79 layer 3, a self-hosted connector engine for breadth: evaluated against what Discover's
      no-result searches say people want; decided after layers 1 and 2.
- [ ] R78, apps as contracts (PRODUCT-REVIEW R78, with Open Connector evaluated): a
      `provider.health` task and gauges; an OpenAPI 3.1 document generated from the schemas for
      the token-reachable routes, served and named in API.md; `@caime/mcp` over the SDK's
      person methods; a hash chain on `audit_log`; a `provides` list on listings for apps that
      give Caime something (calendar sync, mail), reviewed as the listing is.
- [ ] R80, the marketplace page (PRODUCT-REVIEW R80, Slack's marketplace read as the model):
      `/marketplace` on the site with a page per listed app (`/marketplace/<slug>`, JSON-LD,
      sitemap, Connect through sign-in), categories, the built-ins and bridges first; a listing
      with screenshots, a declared pricing model, languages, support and privacy addresses and
      an AI disclosure; the written bar on `/developers` and in API.md; "Reviewed by Caime" with
      the operator's checklist; delisting with a note. After Block 4 and R79 layer 1.
- [ ] ⛔ R80, cai.me as the public address: parked today (a registrar's lander, 2026-10-10), so
      the owner acquires it; then DNS and the certificate at EasyPanel, `PUBLIC_URL` and
      `WEB_URL` moved, the old host answering 301, one canonical.
- [ ] R75 phase 2: notices (no-reply senders, bulk mail) under Notices, HTML as sent in a
      sandbox, reply-all with CC, sending as the address from Gmail and Outlook through Caime's
      submission, the agent answering by mail.
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
- [ ] Block 4, Apps and Developer in harmony: one publisher-and-icon helper for consent,
      Connected and Discover; the developer told of a review and shown usage; `OrgApps` listing
      the organization's listings; `afterCardMove` for the move route and Checkout; cards to
      organization apps and `GET /orgs/:id/calendar` in the SDK; the SDK's person methods; the
      review's Ls on R74.
- [ ] Block 5, scale: `USER_COLUMNS`/`ORG_COLUMNS`; the booking lock; `card_start_at`; the module
      rule with its test; the job pool, the early NOTIFY and the brief jitter; one TTL cache;
      the sitemap cached and paged; the god modules split; `AppListing` lazy.
- [ ] Block 6, design, a11y, exports, realtime, the ICS length, the calendar bridges, cards
      that ask.
- [ ] R76, country-aware UX (PRODUCT-REVIEW R76).
- [ ] R77, consistent pickers (PRODUCT-REVIEW R77).
- [ ] Docs drift (BRAND.md friends, type rows, radii, five places; CLAUDE.md's page sizes, axe
      languages, auth kicker, setup list; `previewUrl` in `API_ROUTES` and API.md).

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
