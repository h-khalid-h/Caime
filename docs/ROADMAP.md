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
- [~] Notifications: levels, burst consolidation, schedules, and Web Push: a service worker
      (`apps/app/public/sw.js`) shows what the server pushes when Caishy isn't open in front (a
      call rings until it's answered) and a tap opens it in the open tab without a reload; each
      browser is asked once, from Settings → Notifications or Chats, and every later sign-in there
      gets its pushes (`sw.test.ts`, `webPush.test.ts`, E2E registers the worker under the app's
      CSP; a real push service isn't reachable from the E2E). Expo push implemented but ⛔ needs
      EAS credentials for production builds; not yet exercised end to end
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
- [x] Organizations' updates (PRD §59, §15 broadcast): an organization's owner and admins (or its
      app, with `updates`) post to whoever follows it; anyone reads them on its page, as the
      organization's. People follow from the page (and choose whether each update notifies
      them); Updates is one row at the top of Chats and a screen of its own, never among their
      conversations or what needs them. Nobody sees who follows; the team sees how many
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
- [x] CI: lint, typecheck, tests on Postgres 16, build, web budget (434.3 KB gzip against 450 KB),
      Playwright E2E against the production bundle
- [x] Security review: `docs/SECURITY.md` lists each control with the test proving it, and the
      gaps. [ ] Third-party penetration test
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
