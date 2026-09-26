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

- [x] Direct, group, topic conversations; participants; drafts
- [x] Messages: ordered, idempotent; replies, reactions, edit, delete; read state; polls; forward
- [x] Realtime hub (WebSocket + pg NOTIFY), typing, presence
- [x] Attention inbox API
- [x] Message requests from non-connections (R14): links inert until accepted; declined, one stays
      shut and reads to its sender as unanswered (`messaging.test.ts`, E2E)

## M4 — Memory, action, notification

- [x] Tasks, waiting, requests, reminders (R13); decisions; contexts
- [x] Suggestions from message intelligence (and emerging topics, follow-ups)
- [x] Conversation memory and asset index
- [x] Search across people, relationships, orgs, messages, assets, actions, contexts
- [~] Notifications: levels, burst consolidation, schedules, Web Push (VAPID) done; Expo push
      implemented but ⛔ needs EAS credentials for production builds; not yet exercised end to end
- [x] Jobs: reminders, held notifications, follow-ups, retention

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
- [x] Person profile, relationship change and its history, one line per change (E2E)
- [x] Search: finds a message and opens its conversation scrolled to it, marked (E2E)
- [x] Settings: every page opens; the theme follows the account to a fresh device (E2E);
      download your data and delete your account (E2E)
- [x] Actions: add one in words ("by Friday" becomes its due date), finish it, undo; a request
      from someone lands in Asked me (E2E)
- [x] Alerts: requests and message bursts arrive, each with why it was held or sent (E2E)
- [x] Spaces tab (phones) and rail item (desktop): your spaces busiest first, start one, open
      one (E2E, screenshots)
- [x] Desktop web: rail, list, detail and context panel (E2E screenshots); keyboard shortcuts:
      Ctrl/⌘ K search, Alt ↑/↓ between conversations, ↑ edits your last message, ? lists them
      (E2E)
- [x] Realtime client with reconnect and catch-up; on-device cache with revalidation; offline
      outbox: a message written offline sends the moment the network returns (E2E)
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
      closes it. Its kind picks the cards its conversations offer (`spaces.test.ts`, E2E)
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
      organization (`live-location.test.ts`, E2E)
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
      developer guide is `docs/API.md`). [ ] Personal access tokens, OAuth for third-party apps,
      AI agents
- [x] Plan entitlements (R23): what each plan includes lives in core and is checked on the server
      where something is added (AI assists, files, a team's people, apps). The wedge is never
      counted, and a lower plan never removes anything. You → Plan shows what's used; an
      organization's owner and admins see its plan on its page. The operator sets plans with
      `ADMIN_TOKEN` (`docs/DEPLOY.md`) until billing is connected (`plans.test.ts`, `ai.test.ts`,
      E2E). [ ] Billing ⛔ Stripe
- [x] Metrics: `/metrics` for the operator's scraper (PRD §81), product metrics from what Caishy
      already keeps (PRD §82–83: activation, engagement, the core rates, retention), and insights
      for organizations on Business (PRD §71: customers who wrote, first answer, waiting,
      resolved), all counts and times, never content (`metrics.test.ts`,
      `product-metrics.test.ts`, `insights.test.ts`, E2E). [ ] Needs You precision, time to find
      something, invite attribution: not recorded yet
- [ ] Calls (WebRTC 1:1 on web) ⛔ TURN relay needed for reliable production calls

## M7 — Ship

- [x] One image (API, realtime, web): built, pushed to `ghcr.io/h-khalid-h/caishy` and
      smoke-tested by CI on every push to `main` (readiness, the page, security headers)
- [x] CI: lint, typecheck, tests on Postgres 16, build, web budget (434.3 KB gzip against 450 KB),
      Playwright E2E against the production bundle
- [x] Security review: `docs/SECURITY.md` lists each control with the test proving it, and the
      gaps. [ ] Third-party penetration test
- [ ] EAS config and store builds ⛔ Apple and Google developer accounts, `EXPO_ACCESS_TOKEN`
- [ ] Deploy to EasyPanel ⛔ needs the app created there from the image (`docs/DEPLOY.md`) and the
      `EASYPANEL_DEPLOY_WEBHOOK` repository secret, or `EASYPANEL_URL` and
      `EASYPANEL_API_TOKEN` in the environment settings

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
