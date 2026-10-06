# Caime — operating manual

Caime (formerly CONNIQT) is a relationship-aware communication platform for iOS, Android and Web:
**messaging that understands your relationships.** The primary domain object is the
**connection** between two people, not the chat. This file is how any session picks up the work
without re-deriving decisions.

## Start of every session

1. Read `docs/ROADMAP.md` (what is done, in progress, blocked) and `docs/GOAL.md` (the target).
2. Skim `docs/PRODUCT-REVIEW.md` (refinements R1–R54 override the PRD) and `docs/ARCHITECTURE.md`
   (ADRs). Open `docs/PRD.md` (cited as `PRD §n`) and `docs/BRAND.md` when a task touches them.
3. Run `pnpm install` then `pnpm check`. If anything is red, fixing it comes first.
4. Check the latest CI run on GitHub (`h-khalid-h/Caime`, workflow `CI`). A red `main` is work now.
5. At the end of a work block: update `docs/ROADMAP.md` (tick only what is verified, add a log
   line), update this file if a convention or command changed, commit and push to `main`.

## Layout

| Path | What |
| --- | --- |
| `packages/core` | Pure TypeScript shared by server and app: the API contract (`api.ts`), taxonomy, field rules, zod schemas, attention and policy engines, message intelligence, privacy, search parser, Connect Kits, formatting, safe locales. No platform APIs. |
| `packages/brand` | Tokens (contrast-tested), the wordmark, the seven characters as SVG builders, and `pnpm --filter @caime/brand assets` to regenerate every icon, splash and favicon. |
| `packages/sdk` | `@caime/sdk` (R39): the typed client and webhook checks organizations' apps use. Types come from core by `import type` only; it must run without core. Tested in `apps/server/test/sdk.test.ts` against the real routes. |
| `apps/server` | Fastify 5 API (`/v1`), WebSocket realtime, Postgres (Kysely + SQL migrations), jobs, push, files; serves the exported web app from `WEB_DIR`. A route module (`modules/*.ts`) holds routes and nothing another module imports: what two modules share lives in `lib/` (a conversation's view and membership in `lib/conversation-views.ts`, topics in `lib/topics.ts`, a space's conversations in `lib/space-conversations.ts`). |
| `apps/app` | Expo SDK 57 universal app (Expo Router; routes in `src/app/`, screens in `src/features/`, primitives in `src/ui/`). iOS, Android and Web. |
| `e2e/` | Playwright tests against the production bundle (`playwright.config.ts` at the root). |
| `scripts/` | `bundle-budget.mjs` (the web JS budget). |
| `docs/` | PRD, product review, brand, competitive strategy, architecture, roadmap, goal, deploy, security, the developer guide for organizations' apps (`API.md`), the draft data processing agreement for the owner's lawyer (`DPA-DRAFT.md`, facts held to the code by `dpa-draft.test.ts`; never published as it is) and the legal review of it, the privacy policy and the terms (`LEGAL-REVIEW-2026-10.md`). |

## Commands

```sh
pnpm install                 # once; hoisted node_modules (ADR-1)
pnpm check                   # lint + typecheck + all tests: run before every commit
pnpm test                    # all packages, app logic included (server tests need Postgres: TEST_DATABASE_URL,
                             #   default postgres://caishy:caishy-dev@127.0.0.1:5432/postgres)
pnpm dev:server              # API on :8787 (DATABASE_URL; see apps/server/.env.example)
pnpm dev:app                 # Expo dev server; press w for web (talks to :8787)
pnpm dev:phone               # Expo Go on a phone against the live Caime (docs/DEPLOY.md, Expo Go)
pnpm build                   # web export (apps/app/dist) + server bundle (apps/server/dist)
pnpm budget                  # initial web JS, gzip, under 450 KB; every later chunk under 100 KB
pnpm e2e                     # Playwright against the bundle; set E2E_DATABASE_URL
                             #   (default .../caishy_e2e, create it first)
pnpm start                   # run the bundled server (what the Docker image runs)
docker build -t caime .     # the production image (docs/DEPLOY.md)
```

## Conventions

These are rules, not preferences.

1. **Connection first.** New features attach to a relationship or a conversation context
   (PRODUCT-REVIEW R19). No global feature menus.
2. **Relationships are private.** Never serialize a relationship to anyone but its owner unless
   `shared` is true. Every path that reveals a profile field or a read position goes through the
   core privacy evaluator (ADR-10), live events included (`readReceiptVisibleTo`).
3. **Inference is a suggestion.** Anything inferred is stored as a suggestion with a rationale
   and becomes a fact only on explicit accept (R12). No silent writes by heuristics or models.
4. **Shared logic lives in core.** If client and server both need a rule (attention, policy,
   intelligence, privacy, field validation, previews), it goes in `packages/core` with tests.
5. **One contract.** Response shapes live in `packages/core/src/api.ts`: a `…View` is a thing, a
   `…Response` is what a route answers with, every HTTP route is annotated `Promise<…Response>`
   and the app's endpoints read the same names (never an inline `<{ … }>`). A refusal's `code` is
   one of `ERROR_CODES` (`packages/core/src/errors.ts`), typed on `AppError` and `ApiError`: a
   new refusal adds its code there first. Change the contract, and both sides must compile.
6. **Writes are idempotent.** Retried client writes carry `clientId` (ADR-8); messages are ordered
   by `seq` (ADR-9). The sender's own echo carries its `clientId`; others get null.
7. **Migrations are append-only** once pushed. Never edit a committed migration; add a new one.
   Production deploys with the old container serving until the new one is ready, on the new
   schema, so a migration expands first (add a column or table, backfill) and contracts in a
   later release (drop or rename only once every instance runs code that no longer reads it).
8. **Never assume gender or age.** Copy uses names, not pronouns; gender is never inferred (R27).
   Under-18 protections are rules in code, with tests (R29).
9. **Brand on two intensities.** Characters in expressive moments (welcome, empty states,
   stickers), never on security or money surfaces (BRAND.md B2). Colours come from the theme,
   which reads contrast-checked tokens; no raw hex in components beyond white text on fills.
10. **The web bundle is a budget.** The app imports core and brand by subpath
    (`@caime/core/format`), never the package root (it would pull in zod), and icons one file
    each through `src/ui/icons.ts`. `pnpm budget` fails CI above 450 KB.
11. **Nothing trusts device input.** Locales go through `safeLocale`, time zones fall back to UTC,
    and formatting never throws: a bad value from one device must not break a screen.
12. **Say what was not done.** ROADMAP ticks mean verified end to end. Anything needing external
    credentials is marked ⛔ with what is needed, never claimed done (R25).
13. **Run the claim.** A number in a doc or commit (contrast, latency, bundle size) is produced by
    running something, not estimated.
14. **Resources are budgets.** The server, every AI token and people's devices are paid for
    (`docs/RESOURCES.md`): a change says what it costs on each, adds no timer, poll or per-row
    query where an event or one query would do, sends an AI only what's bounded and caches what
    repeats, and never widens a budget to fit.
15. **Changes come as pull requests.** Anyone else, person or AI agent, contributes through
    `CONTRIBUTING.md`: a pull request against `main`, CI green, reviewed against these
    conventions by the reviewer (this session, or the owner), who alone merges. Only the reviewer
    and the owner push to `main`.

## Working notes

- Kill a local server by port (`lsof -ti tcp:8787 | xargs kill`), never `pkill -f` with a
  pattern: it matches the shell running the command.
- Biome reformats files: after `biome check --write`, re-read before scripted edits, and run it
  twice (its formatter is not always idempotent in one pass).
- The inbox is one list: `GET /v1/inbox?view=all` carries every conversation with its `section`
  and `rank`, the app's `useInbox` and `useInboxAll` are `select`s over that one query (core
  `inboxSections` and `inboxAllList`, which the server uses too), and `patchItems` patches the
  raw list. `GET /v1/inbox` (sections) stays for tokens and the SDK. `inbox-scale.test.ts`
  measures a big inbox; anything per person listed must be a batched query or a map, and any
  date-in-a-zone goes through `zonedParts` (a cached formatter per zone), never a new
  `Intl.DateTimeFormat`.
- The persisted query cache is restored as-is; `invalidateQueries()` runs right after restore so
  a relaunch shows the cache instantly and then refreshes it. Its persister is Caime's own
  (`api/queryClient.ts`): a save is asked for on every change, taken at most every 1.5 s, and
  serialised only once the screen is idle (`whenIdle`: `requestIdleCallback`, else after a
  phone's interactions); `saveCacheNow` writes at once when the app is left and drops what was
  waiting. Nothing else writes `caime.cache.v1`.
- Playwright: text also appears in off-screen screens on phones (tabs stay mounted), so assert
  with `.filter({ visible: true })`. A failure that isn't an assertion (a `TypeError` reading
  `traceName`, `browserContext.close: Target page, context or browser has been closed` after
  every expectation passed) is the runner's tracing, not the app: traces are taken only on CI's
  retry (`trace: 'on-first-retry'`), and a local run passes `--trace off` if it ever shows up.
- E2E people: `apiSignUp` (`e2e/helpers.ts`) creates and onboards someone through the API.
  Production mode allows 10 sign-ups per address per hour, so a spec shares one pair of people
  across `test.describe.serial` tests rather than signing up per test.
- Network state comes from `src/lib/network.ts`: the browser's `online`/`offline` events on the
  web, NetInfo on native (`network.native.ts`). NetInfo's web build listens to
  `navigator.connection`, which Chromium doesn't fire when the network returns.
- AI assist is tested without a key: the server tests start a local stand-in for the Messages
  API and point `ANTHROPIC_BASE_URL` at it; E2E runs `e2e/anthropic-stub.mjs` as a second
  Playwright web server, whose `GET /requests` lists which features called it.
- On the web, a pressable inside another ends the outer one's hover (React Native Web's
  `contain`), so anything shown on hover belongs beside the thing hovered, not inside it, and
  it takes no room there (a bubble's Reply and React are `position: absolute` over the margin):
  React Native Web cancels a press whose pointer comes up on a different element than it went
  down on, so a layout that changes when the pointer arrives makes the first press on anything
  inside it miss (the voice note's play button found this; the fix is in `MessageBubble`).
- Hold the socket in E2E with `page.routeWebSocket` to test what happens before it connects.
- Write live changes into the query cache with `patchCache` (`state/cache.ts`), never a bare
  `setQueryData`: a bare write marks the data fresh, and a restored copy then never refetches.
  Every query key is `qk`'s (`api/keys.ts`; a prefix for a kind is `qk.allTasks` and friends),
  never an array written where it's used: `keys.test.ts` fails on one. Anything that floats
  over the page casts the theme's shadow through `lifted(t.c.shadow, y, blur)` (`ui/shadow.ts`),
  never a `shadowColor` of its own.
- A sheet whose content depends on the state that closes it should keep the last content while
  it fades (see the member sheet in `SpaceScreen`), or it fades out empty.
- Web fonts: on the web the faces are WOFF2 in `apps/app/public/fonts` (Fontsource's Latin
  cuts, copied from `@fontsource/inter` and `@fontsource/nunito`; OFL beside them), declared
  once in `index.html` (`caime-fonts`) as the brand's two families by weight, `Inter` and
  `Nunito`: the app on the web asks for the family and the weight (`theme/fonts.web.ts`,
  `fontFace`), phones a file per weight through expo-font (`theme/fonts.ts`, `fontFiles.ts`), and
  the server's pages name the same families (a page written outside the shell, the privacy
  policy or the operator's reports, takes the shell's own block through `shellFaces`). A new
  weight needs a face in `index.html` and a TTF for phones (`fonts.test.ts` holds the type scale
  to the declared faces), and `fonts` is a reserved handle.
- The server's own pages draw from the tokens, as the app does (R69): `lib/page-style.ts` writes
  the theme as CSS variables for both schemes (`THEME_VARS`, `--text-secondary` and friends),
  a style of the type scale as declarations (`type('mono')`), and radii, control heights, the
  touch size and the desktop breakpoint (`px`). A page's CSS names those, never a colour or a
  size of its own (`public-pages.test.ts` fails on a colour that isn't a token); a value both
  sides need is a token in brand (`controlHeight`, `wordmarkColour`). A label (`dt`) is written
  by `label()` (`site-pages.ts`) through core's `sentence`, the same capital the app's `Spec`
  gives it; a key that starts with an acronym is written as it reads (`'AI assist'`). A sentence
  with a link in it is one key with the link's words tagged (`<terms>terms</terms>`), cut by
  core's `tagged` for the app's links and the server's anchors (`linked`), and a translation
  keeps its tags (`i18n-catalog.test.ts`).
- The web page's head is `apps/app/public/index.html` (Expo's template, with Caime's icon links);
  the icons beside it are made by `pnpm --filter @caime/brand assets`, never by hand, and any new
  file at the web root is also a reserved handle (`paths.test.ts` checks).
- Handles have dots, so a page path can look like a file (`/o/nile.dental`). The server serves
  the app to anything that asks for HTML (`plugins/static.ts`); test new link shapes with a
  reload, not only by navigating inside the app. The shell it serves carries the page's head and
  a plain body (R44, `lib/public-pages.ts`: `publicPageFor` decides, `renderPublic` writes,
  `injectPublic` puts it in the template; `#root:empty` shows it, the app hides it). A new public
  page renders only what the privacy evaluator shows `NOBODY`; a visitor (no session cookie)
  gets a person's or an organization's page without the app's scripts, and on the web the root
  layout mounts nothing on such a page (`handleIn`, the head's `caime-page`) until they're
  signed in, so the page stays; a new app route that must not be
  indexed needs nothing (the default is `noindex`), and a new web-root file (`robots.txt`,
  `sitemap.xml`) is a reserved handle.
- An organization's data (R54, `lib/org-data.ts`): an export is `buildOrgExport` (the
  controller's data alone: never a team member's own account or conversations), an erasure is
  `eraseBusinessConversation`, and both the disappearing sweep (`workers.ts`, `retention`) and an
  erasure run `eraseMessagesWhere`: a new thing kept of a message (a copy of its words anywhere)
  is dropped there, once. Retention is `organizations.retention_days`, applied by
  `applyOrgRetention` to what's there and by `retentionFor` (`lib/messages.ts`) to each new
  message as the shorter of it and the conversation's own; nothing else writes `expires_at` for
  a business message. Who processes data is `packages/core/src/processors.ts` plus
  `processorsFor(config)` on the server (`HOSTING_PROVIDER` names the host): a new provider
  joins the list, and the privacy page renders it; never prose about a company anywhere else.
- An organization's door (R53): its public page's call to action is `doorPath(handle)`
  (`/o/<handle>?write`, `lib/public-pages.ts`), which `appPath` admits, `handleIn` reads as the
  handle and `doorIn` (`lib/paths.ts`) tells from the plain page. Onboarding names it, the
  organization route passes `write` to `OrgScreen`, which starts (or opens) the customer's
  conversation once through `endpoints.messageOrg` and replaces the route. The team reads
  `GET /orgs/:id/door` (`OrgDoorView`: the link on `PUBLIC_URL`, the QR as one SVG path from
  `lib/door.ts`, cached an hour in the browser), drawn by `features/orgs/OrgDoor.tsx`. Anything
  else printed for a clinic (a receipt line, a bio) reuses that link and path, never another
  encoder or a second link shape.
- An organization's setup (R57) is `/o/[handle]/setup` (`features/orgs/OrgSetup.tsx`, owner and
  admins only; others get a line saying so): the door, `OrgVerification`, `OrgData`, `OrgBooking`,
  `OrgAgent`, `OrgApps` and `OrgPlan`, in a clinic's order. The page (`OrgScreen`) is the daily
  work (inbox, updates, spaces, team, insights) and offers the setup in one row (`org-setup`)
  whose subtitle is `setupNextLine(org)` (`setupSteps.ts`: what's next). A new thing an
  organization configures goes on the setup screen, never on the page; a line both need lives in
  a small module of its own (`planLine.ts`), since a module two route chunks share moves into
  `__common` (`nextOrgPlanLine` cost 2.1 KB there).
- Ending a session (sign-out, "sign out that device", a password change, a recovery, a
  suspension, removing a device for private conversations) goes through `endSessions`
  (`lib/sessions.ts`), never an update of `sessions` by hand: it publishes `session.ended` on
  the bus and the realtime hub on every instance closes that session's sockets (4401). A frame
  a device sends is read through the `Frame` schema in `modules/realtime.ts` (a uuid where a
  uuid is queried) and anything else is dropped; the message handler and `attach` catch, so a
  failure closes that socket alone, and `index.ts` logs an unhandled rejection rather than
  exiting. A new frame type joins the schema.
- Invite links (R1): `lib/invites.ts` makes, opens and accepts them; accepting goes through
  `acceptRequest(…, { viaInvite: true })` on a request the invite stands for (never a second path
  to a connection), so blocks, suggestions and notifications behave as for a request. The token
  is the only key to one (`/i/<token>`: `publicInvite` renders the visitor's page, `inviteIn` in
  `lib/paths.ts` recognizes it, the `i/[token]` route accepts). A person's export lists their
  links; the privacy page says so. Under 18 (R29): an adult the inviter doesn't know through
  someone gets `status: 'requested'` (a request the inviter decides on), never a connection.
- Reserved handles (R35) are `RESERVED_HANDLES` and `isReservedHandle` beside `Handle` in
  `packages/core/src/schemas.ts`: the product's names (also inside other handles), its
  characters, staff words, and the names of its pages, top-level screens and web-root files. A
  new route, page or character needs its name there (`paths.test.ts` and brand's
  `characters.test.ts` fail otherwise). Anything that lets someone take a handle checks it with
  `assertHandleAvailable` (`lib/handles.ts`), which answers a reserved handle exactly as a taken
  one; only the operator's `/v1/admin/{people,orgs}/:handle/handle` gives one out.
- A handle someone lets go of (a new one, a deleted account, the operator moving them) is held
  from everyone for a year: anything new that frees a handle calls `releaseHandle` in the same
  transaction, so there's no moment it's anyone's. `released_handles` keeps only the handle and
  two days, never whose it was (the privacy page says so); `assertHandleAvailable` refuses a held
  one as a taken one, looking for a holder before a hold (keep that order: a test commits a
  change between the two), and the operator's route gives one back. An organization that closes
  unverified lets its go the same way (`closeOrg`, `lib/orgs.ts`); one that closes verified keeps
  it for whoever proves its domain again (R42: `closedOrgHolding`, `409 handle_closed_org` with
  the organization's name and domain, `POST /orgs/:id/reclaim` then `/reclaim/check`, which makes
  a new organization with the same handle and points the old one at it with `succeeded_by`).
  Anything that looks an organization up by id for its team uses `orgById` (open ones only);
  `closedOrgById` is for taking one back. A closed organization's conversations refuse every
  write with `409 org_closed` (`sendMessage`), and the app says so in the composer's place.
- Onboarding (R56) is two steps, how Caime works and your people, and a linked arrival (an
  invite, a handle, a door, an app's consent) starts at the last; the recovery codes are a card
  on Attention, the first screen (`features/account/RecoveryCodesCard.tsx`, its sheet loaded when opened) while
  `me.recoveryCodesSeen` is false:
  the fresh codes come from `useSession().freshRecoveryCodes` (memory only) and Done sets
  `recoveryCodesSeen` through `PATCH /me` (a literal `true`, never cleared). Nothing else gates
  the first screen; a new thing to ask of a new person joins that card's place on Attention,
  never onboarding.
- A connection never labelled is asked for in the conversation's intro (R3): one chip,
  `label-relationship`, opens `RelationshipPicker` (lazily) from `ConversationScreen`; the
  person screen's "Change" and the panel's line stay. A new place that offers to label someone
  opens that same picker, never a form of its own.
- Starting a space is one screen, `/new-space`: it asks whose the space is only when the person
  is on an organization's team (`useOrgs`, `canManageOrg` decides which are offered; the rest
  are named, not offered), and an organization's page opens it with `?org=handle` chosen. A new
  way to start a space goes there, never to a screen of its own.
- Spaces list whose they are: the Spaces tab offers "All · Mine · <each organization>"
  (`spaces-owner`, radio chips derived from the one spaces query, shown only once the spaces
  span owners), so a new kind of owner joins that row, never a list of its own.
- Someone on several teams: the Business inbox carries a row of its teams (`inbox-teams`, a
  radio chip each, in `BusinessInbox`) when there's more than one, and the rail's Business goes
  to the inbox opened last (`state/business.ts`, in memory), else the first. On a phone the
  Chats list's `TeamInboxes` rows are the same step. Nothing about an organization's inbox is
  ever reached only through one organization's page.
- The interface is Inter, set tight at size (R69: `typeScale` in `@caime/brand/tokens`);
  Nunito is for brand moments only (`display`: welcome, empty states, the auth screens' heading)
  and the wordmark. The `mono` text variant keeps its name but is Inter now: a spec sheet's
  label, quiet beside its value, never running text, never uppercase; nothing in the interface
  is set in a monospace any more (the system monospace is for codes and keys only). `overline`
  is a section's label ("Needs you", "Coming up", a settings group) in sentence case, semibold;
  a badge's digits use `captionStrong`, never `overline`. Spacing and shape come from the tokens
  and the primitives (`ListRow` 56 tall, `PageHeader`, `SettingsPage`, `radii`), never from a
  screen's own numbers where a primitive has them. A fact's label may be a lowercase key
  (`tr('handle')`): `Spec` sentence-cases it as it draws it, in the reader's language, and the
  public pages' `dt.mono` does the same in CSS. Facts are stated with `Spec` (`src/ui/Spec.tsx`: mono label, value, hairlines; a
  null row is left out): an organization's page (`org-spec`), a person's "and you" block
  (`person-profile`), Welcome's three lines, a space's head (`space-spec`), About
  (`about-spec`), and the auth screens' `kicker` (`AuthLayout`): a new screen that lists facts
  uses it rather than a card of captions. Anything that starts a
  conversation, a group or a space is offered from the Chats "+" sheet (`NewChatSheet`) as well
  as its own tab: one place to start, and the screens it opens stay the only ones.
- The calendar (R51) reads what the feed reads: `lib/calendar.ts` (`calendarItems` for a person,
  with `overdueTasks` shared with `modules/calendar.ts`'s feed and `cardsAhead`; `orgBookings`
  for an organization's team) behind `GET /v1/calendar?from&to` and `GET /v1/orgs/:id/calendar`
  (a window of up to a year). Nothing on it changes a date: a card is moved in its
  conversation. The app shows it as the Actions tab's Calendar segment and the Business inbox's
  Bookings view (both loaded when shown), keyed by an hourly window so the query is one an hour,
  and `realtime/apply.ts` invalidates `['calendar']` and `['org-calendar']` on a kit message
  event. A new dated thing (a booking slot, an event) joins `calendarItems`, never a list of
  its own. Being in one is `busyUntilFor` (the agreed cards that haven't ended), looked up in
  `message-effects.ts` only for someone whose `preferences.holdWhileBusy` is on, and
  `decideNotification` holds the `HELD_WHILE_BUSY_SPHERES` until it with `busyUntil` and the
  sender's `sphere` in its context: anything new that should wait for a meeting goes through
  that context, never a check of its own. What someone is in is shown to others only through
  the privacy fields `busy` and `busyDetails` (core `privacy.ts`), on the profile
  (`PersonProfileView.busy`, `busyNow` run only when `canSee` allows): never on a `PersonView`
  (every list would pay a query per person) and never anyone's calendar.
- Bookings (R51, R58): a host is an organization or a person (`BookingHost`, `lib/booking.ts`:
  `orgHost`, `personHost`), each with hours (`booking`, core `BookingHours`) and a catalog
  (`booking_items`, core `BookingItem`: a price or none, minutes or days, capacity, how many in
  one booking, an audience, providers for an organization, `askTopic`), set by
  `PUT /orgs/:id/booking` (owner or admins) and `PUT /me/booking` with one body (`BookingBody`)
  and one app component (`features/booking/BookingSetup.tsx`, used by `OrgBooking` and
  Settings · Bookings). Slots are never kept: `openSlotsFor(ctx, host, window, { item, quantity })`
  cuts the hours with core `openSlots` (the item's length on the grid, full at its capacity,
  a stay checked a night at a time, a named provider free) and takes out what holds a slot: an
  organization's appointment cards (`orgBookings`), a person's own cards (`cardsAhead`, less an
  organization's unless they do them). A booking from the catalog arrives as `payload.booking
  = { itemId, quantity }` and `sendMessage` fixes it through `bookingFor` (the audience with core
  `canBook`, adults for a paid item, the quantity, the slot open now: `not_bookable` 403,
  `slot_taken` 409) as `AppointmentBooking` (name, length, quantity, price then, `endAt`,
  `providerId`); nothing else writes it. Who does it: `pickProvider` when the team confirms, the
  reassign route `POST /messages/:id/booking/provider`, masked for the customer in
  `maskPayload`, shown on `OrgBookingView.booking`. `GET /orgs/:id/slots` and
  `GET /people/:id/slots` take `item` and `quantity`; the app's `useSlots(host, …)` feeds the
  appointment form, whose host is the organization, the other person if their profile's
  `booking` offers items, else the sender (`useMyBooking`). Public items (`audience: 'public'`)
  are spec rows on the public pages with "Book" first (`bookPath`, `/…?book`; `bookIn` in
  `lib/paths.ts`), which lands in the conversation on the card's form (`?book=1` →
  `Composer.openKit`); the profile's and the organization's Book buttons do the same. The agent
  gets `<catalog>` lines (`catalogLines`) and its slots are the first item's; `book` carries
  `bookItem`. The E2E stand-in and `agentSays` answer `bookItem: null`.
- Orders (R60) are the same catalog: an item with `unit: 'each'` is ordered by the piece (no
  slots, no providers), and a host's `ordering` (core `OrderingSettings`: `fulfilment`, `note`;
  null is off) is set with the hours through the same body (`ordering` left out keeps it). The
  Order card is the existing `order_status` kit, never a second one: `payload.order = { lines,
  fulfilment }` is fixed by `sendMessage` through `orderFor` (core `placeOrder`) as `PlacedOrder`
  and fills the card's own `summary`, `amount` and `reference` (`orderNumber`), so it reads as
  any order; without a catalog the card needs its number. `catalogHostFor` in `lib/messages.ts`
  finds whose catalog a booking or an order is from, once, for both. The app's form
  (`KitForm`) finds the host as for appointments and shows `order-picker`; `isBooked` and
  `isOrdered` split the catalog everywhere (setup, profile `booking` vs `ordering`, the agent's
  catalog lines, public pages' Book and Order). `?order` links (`orderIn`) land on the form as
  `?book` does.
- Collections and item pages (R61): a host's `collections` (core `CatalogCollection`) group its
  one catalog; an item carries `slug`, `description` and `collectionId`, and is seen only where
  both its audience and its collection's allow (`bookableItems` with `collections`). Read a
  catalog through `catalogOf` (`lib/booking.ts`), which gives every older item its address
  (`withSlugs`), and save through `catalogFrom`; one address space per host, never a
  `RESERVED_SLUGS` word (a new screen under `/o/<handle>/` adds its name there). Public pages are
  `kind: 'item' | 'collection'` from `shelfPage` (`lib/public-pages.ts`), with JSON-LD
  (`itemLd`, `OfferCatalog`) and sitemap lines for verified organizations. In the app the
  address routes (`o/[handle]/[slug]`, `[at]/[slug]`) redirect to the host's route with `?item`,
  which opens `features/booking/ItemSheet.tsx` (lazy); never render a screen from a second
  route (it moves into `__common`). Book or Order from it lands on `/c/<id>?book=1&item=<id>`,
  read into `KitStart` for `KitForm`. The whole offer is saved as one `BookingResponse`. An
  item's photo (R63) is `photoFileId`, checked by `assertItemPhotos` (a new one must be the
  saver's own image), served by the items' photo route by the item's own visibility, and
  addressed only through core `itemPhotoPath` (`ItemPhoto` draws it in the app).
- Pay (R62): Caime never holds or moves money. A host's `payments` (core `PaymentSettings`:
  ways with audiences) are saved in the one offer body (`BookingBody.payments`, left out keeps
  them) and checked by `assertPaymentsFit`; only whoever sets them reads them as set
  (`OrgView.payments` for managers, `/me/booking`), everyone else gets `payable`. The Pay card is
  the `payment_request` kit with `fields.direction` (`ask` | `send`): moves name `payer` or
  `payee`, so `kitMoves` takes the card's fields everywhere, and a new card starts at
  `initialKitState`. `payTo` is written only by `payToFor` (`lib/messages.ts`) from the payee's
  ways the payer may see; a priced order or booking keeps its `payee` for the app's Pay, which
  asks the composer through `useCardAction` (`features/conversation/cardActions.ts`) with a
  `KitStart` (direction, amount, note, `replyToId`). A public page shows only `pays` (kinds),
  never details. A card's button label, a choice and a field label are keys: show them through
  `tr`, as `KitCard` and `KitForm` do.
- The brief before a meeting (R58, `lib/briefs.ts`): an agreed meeting or appointment queues
  `card.brief` (`queueBrief`, from the kit move route; one per card and start, so a moved card
  finds its old job pointless) an hour before, for the people whose own relationship to the
  other side is in `BRIEF_SPHERES` (a business conversation: the customer and whoever does or
  has it); `briefFor(ctx, userId, messageId, { withModel })` is the reader's own view (decisions,
  open promises either way, their questions since the reader's last words, files, a count,
  since the previous agreed card or a fortnight), `GET /messages/:id/brief` adds the summary
  through `runAi('brief')` only with assist on, an adult, an allowance and a standard
  conversation, cached ten minutes; the app opens it from the card ("Before it",
  `features/calendar/BriefSheet.tsx`, lazy). Anything new to say before a meeting joins the
  brief, never a notification of its own.
- The interface's words (R54, ADR-16): every string the app or core shows is written in English
  where it's used, wrapped in `tr('…')` (variables as `{name}`), `trn(n, 'one thing', '{n}
  things')` for a count, or `msg('…')` in a table of options that's translated where it's shown
  (`tr(item.label)`, or `trAll(items)`); the English is the key into `locales/ar.ts` and
  `locales/fr.ts` (R55: French is the third language, for the Maghreb and Lebanon) and
  `locales/tr.ts` (R59: Turkish, exported as `turkish` since `tr` is the function; the server's
  is `turkishServer`), and
  `i18n-catalog.test.ts` fails, for every language in `INTERFACE_LANGUAGES`, for a string
  without its translation or an entry nothing says (`node scripts/i18n-keys.mjs missing <lang>`
  lists them). A new language is a code in `INTERFACE_LANGUAGES` and the preference's enum, a
  catalog in core and one for the site on the server, a line in the app's `catalogFor` and
  `LANGUAGE_NAMES`, and a translator in `apps/server/src/lib/i18n.ts`; nothing else names a
  language (the setting, the site's switch, the `hreflang` alternates and the Open Graph locale
  read the list). Never `tr()` a value that's data (a
  header, a protocol line, an id): English in, English out, but the catalog test will ask for
  its Arabic. The language is `prefs.language` (`auto` or a code in `INTERFACE_LANGUAGES`), loaded by `lib/i18n.ts`
  before the first screen and on every change (the root remounts on `useLanguage.generation`);
  the catalog is a dynamic import, so it never joins the startup chunk. The server writes for
  whoever reads (`apps/server/src/lib/i18n.ts`): core's `tr` asks a provider, and the server's
  answers from AsyncLocalStorage, so a request runs in its `X-Caime-Language` header (the app
  sends the language it shows; a token's request is English) and anything written to someone
  else runs in `asReader(ctx, userId, …)`, their account's language (`preferences.language`,
  else `interfaceLanguage`, what their app last showed, else the account's locale; cached five
  minutes, `forgetLanguageOf` on a change). `notify` and `replaceShown` take `title` and `body`
  as functions (`title: () => tr('{name} is calling', { name })`) and call them inside the
  reader's scope: a string built before the call is in the sender's language, so never build
  one. A suggestion is a row for one person too: `createSuggestion` takes `title` and
  `rationale` as strings or functions and runs a function in the reader's scope, and the
  message effects draft each person's suggestions (`suggestFromAnalysis`) inside
  `asReader(ctx, userId, …)`, so anything new that stores words for one person does the same;
  a fan-out that writes rows for many looks their languages up at once (`languagesOf`) and
  writes each inside `inLanguage`. Anything else the server writes for a particular person
  (a fan-out's line, a job's) goes through `asReader` the same way; the key collector reads
  `apps/server/src` too. A refusal is written in the request's language as well: every
  `AppError` message is `tr('…')` where it's thrown (`badRequest(tr('…'))`, `notFound(tr('That
  message'))`, which reads "{what} wasn't found."), built inside the request and never kept in a
  module constant (a constant is a function, `TOPIC_PEOPLE()`), and a sentence assembled from
  parts translates each part; the app shows `err.message` as it came. A schema's own field
  message is `msg('…')` in core's `schemas.ts` (collected into the catalogs) and `validate.ts`
  runs `tr` over every issue's message, so a refused field reads in the app's language; zod's
  own words (a developer's) pass through as they are. A
  table's labels (roles, kit states, kit names) are English keys: show them through `tr`.
  A string the server writes into a view for a screen (a rule's `describePolicy` summary, a
  schedule's day names) is in the request's language already, so it goes through `tr` in core
  like the app's own. On the web every React Native text is `dir="auto"` (its first strong
  letter decides), so the `Text` primitive runs any text holding an Arabic letter right to left
  (an Arabic sentence may open with "Caime") and leaves one without (a handle, a date, a
  number) to the browser; user-written text passes `auto` and keeps its own direction. Never
  read `I18nManager.isRTL` on the web: React Native Web's is always false. Look at the Arabic
  screenshots (`e2e/screenshots/*arabic*`) after a change to a shared primitive.
  A sentence is a whole key: never build one from fragments (`tr(' describes you as ')`) or put
  an English word into it as a variable (`{value}` = 's', `{who}` = 'You answer'); a count is
  `trn`, and a line that names who did something passes `by` already translated (`tr('You')`)
  and is written in each catalog as "what happened: who", which reads right for "You" and for a
  name in every language. Arabic is written for a reader of either gender: the masculine imperative is the neutral
  default ("اختر", "ابدأ"), but nothing describes the reader or a third person by a gendered
  participle or pronoun where a nominal phrase works ("لا اتصال", "حين يعود الاتصال", "على
  الخط", "بينك وبين {name} تواصل", "تعيين مشرفًا", "تم التوثيق"); a count's adjective agrees
  with the counted thing ("{n} متأخرة"); an organization is feminine ("موثّقة", "أثبتت أنها");
  an admin is "مشرف", a manager (the relationship) "مدير". The English is British ("colour",
  "recognise", "labelled", "any more") with "organization" as the product's own term; a new key
  is spell-checked by `cspell` with `en-GB` before it's committed if in doubt.
  Mail stays English (7-bit, R48). The device's shown language reaches the account only inside
  `savePrefs`' one debounced snapshot (`interfaceLanguage`): a request of its own raced a choice
  being saved and its echo (`me.updated`, or read back) undid it. `savePrefs` flushes on
  `pagehide` with `keepalive`, so a change just before a reload isn't lost; a new preference
  joins its snapshot and `adoptPreferences`, nowhere else. While a save is pending or in flight
  (`state/prefsPending.ts`), `adoptPreferences` adopts nothing: every save echoes back as
  `me.updated`, whose refresh would otherwise put the account's older choice back on the device
  before the newer one was sent (it did, once in a few runs).
- The public site (`lib/site-pages.ts`, R50): `/business`, `/pricing`, `/security`,
  `/developers` and `/about` (`MARKETING_PAGES` in core `api.ts`, each a reserved handle) are
  rendered in the app's shell like the landing page (`renderLanding`, in the same file), for
  everyone, signed in or not, and never boot the app (`plugins/static.ts` strips the scripts;
  `public, max-age=600`). Every page shares `masthead(path, facts)` (wordmark, kicker, nav with
  `aria-current`, the other language by its own name), `spec(rows)` and `footer(facts)`; an
  explorer is `explorer(group, title, items)` with its group in `EXPLORERS`, which writes the CSS
  that picks a panel. Every number on a page is read from the code (plans, `e2ee.ts`,
  `KEPT_DAYS`, `BUSINESS_VIEWS`), never typed; prices come from Stripe through `publicPrices`
  (billing's ten-minute cache) and read "price shown in the app" without it. The site reads in
  each interface language (R54): every string goes through `tr` (a sample's text too; an
  `ExplorerItem.sample` is a function, drawn in the request's language), `siteLanguage(query.lang,
  accept-language)` picks the language (`?lang=` wins, else the browser's first language) and
  says whether to carry it on the site's own links (`facts.linkLang`, `siteHref`: only when it
  isn't the browser's own, so a reader who switched stays switched; the sign-up and sign-in
  links carry it too, the entry screens honour it, and the app on the web takes `?lang=` as
  the device's choice when none was made, `languageInSearch` in core), `langAttrs()` goes on
  `<main>` and `Rendered.lang` on the shell's `<html>`, `meta({ alternates: true })` writes the
  hreflang links (the English is canonical) and `og:locale`, and the response says
  `Vary: Accept-Language`. A string only the server says (a site page's, a notification's, a
  refusal's) is the server's: its Arabic, French and Turkish live in `apps/server/src/locales/ar-server.ts`
  `fr-server.ts` and `tr-server.ts` (merged into the server's translator in `lib/i18n.ts`), never in core's
  `locales/ar.ts` or `fr.ts`, which the app downloads; `scripts/i18n-keys.mjs` tells them apart
  by file (`isServerKey`: every file of the key is under `apps/server/src`; every page but the
  app follows the language in `plugins/static.ts`), `server-i18n.test.ts` fails for a missing or
  stale one (`node scripts/i18n-keys.mjs missing ar server`), and a string the app shows too
  belongs to core's catalog. Styles that have a side use logical properties (`margin-inline-start`,
  `border-end-end-radius`), never left or right. A new page joins `MARKETING_PAGES`, `SITE_NAV`,
  `renderSite`, `SITE_PATHS` and `public-pages.test.ts`.
- The app's entry screens (welcome, sign-in, sign-up) are painted by the server for a visitor
  before the app runs (`kind: 'entry'`, `entryBody` in `lib/public-pages.ts`): the same words
  through `tr` in the browser's `Accept-Language`, the same shape in `.pub-entry` CSS, links that
  work and a form that waits (`aria-busy`), hidden by `#root:not(:empty)~#static` when the app
  mounts. Their scripts are appended by one fixed inline bootstrap after the first frame
  (`bootstrapScripts`), allowed by its sha256 in the policy for those pages alone (`webCsp`'s
  second argument): change the bootstrap's text and the hash follows, since it's computed from
  the served inline. A twin is its screen on a phone and on a desktop (the `BrandPanel` beside
  it; the welcome's two layouts switched at the app's breakpoint), with brand's own wordmark and
  characters (`characterSvg`): `e2e/entry-twins.spec.ts` measures where each line sits in the
  twin and in the app and fails on any that moved, so a change to an entry screen changes its
  twin. Signed in, these paths serve the bare app (they only send the person on).
  Measure with Lighthouse's mobile preset against the local production bundle (docs/RESOURCES.md).
- The public pages (`lib/public-pages.ts`; the invite and the 404 too) are Caime's own: sentence case, quiet labels
  (`.mono`, Inter semibold since R69, no monospace), spec-sheet rows (`.spec`) and the landing
  page's layer explorer (`LAYERS`: radio inputs and CSS, no script, so a visitor's page stays a
  page). New public copy follows BRAND.md's voice; a new layer adds its id to the explorer's
  CSS list too.
- An organization's spaces (R43): `spaces.org_id`; only its owner or admins start one
  (`POST /spaces` with `orgId`), its team may be added without a connection (`assertConnected`
  in `modules/spaces.ts` takes the organization), a seat on the team ending calls
  `removeFromSpace` for each of its spaces, `closeOrg` sets `org_id` to null so they stay
  with their people, and its owner or admins join any of them as an admin (`addToSpace`,
  `POST /orgs/:id/spaces/:spaceId/join`). A profile's `organizations` (`orgsOf`) follows the
  `identityDetails` privacy field, as "Verified at" does. `OrgRef` and `OrgSummaryView` carry `avatarUrl` (`orgAvatarUrl`,
  `lib/business.ts`); a query that builds an `orgRef` from chosen columns selects
  `avatar_file_id` too. The app draws an organization only through `OrgMark` (its logo, else
  its kind's icon), and picks the year it began with `YearField`, never a text field.
- DNS in server tests: set `t.ctx.dns` to a stub resolver (see `orgs.test.ts`).
- Links to Caime are built from `WEB_URL` (`lib/config.ts`), never a hardcoded domain. A path
  from outside the app goes through `appPath` (`lib/paths.ts`) before anything navigates to it.
- The first screen is Attention (R66, `features/attention/AttentionHome.tsx`, the `/` route;
  Chats is `/chats`): the greeting and summary (core `home.ts`: `greetingKey`, `homeSummary`,
  `homeEntries`, which folds a space's conversations into one line once two need you), the
  inbox's own `needs_you` rows (`ConversationRow`, the same query as Chats), and
  `GET /v1/attention` (`AttentionHomeResponse`: waiting on others oldest first, coming up for
  three days without the waits, and `ask`, the one wait gone quiet for three days that Cai asks
  about; "Still waiting" sets the task's `remindAt` three days on, which is also what keeps it
  from being asked again). The recovery codes card is on it, not on Chats. It's cached under
  `qk.attentionHome`, refreshed by task events and calendar changes, never a key under
  `['tasks']` (the task lists' optimistic writes would read it as a task list). Cai speaks in
  the first person, only on a surface marked "Cai" (R66). A conversation's open line (above the
  composer) is `ConversationView.open`, one count on the tasks' conversation index, and task
  events refresh open conversation views (`qk.allConversationViews`). What a relationship
  changes is `policyEffects` (core `policy.ts`), read from the person's effective rule, on
  `PersonRule`.
- An organization's own checkout (R65, `lib/checkout.ts`, `modules/checkout.ts`): Stripe Connect
  with the platform's key and `Stripe-Account` (`stripe(ctx, account)`), never a second Stripe
  client. Its owner connects through `connectUrl` (a one-time `checkout_states` token) and the
  return route `finishConnect`; whether an organization takes cards is `checkoutAccountOf`
  (`lib/checkout-account.ts`, apart so the message path needn't import the checkout), which
  `payToFor` reads to put `orgId` and `checkout: true` on `PayTo`. A card is paid only through
  `settleCheckout`, which asks Stripe about the card's own session; the webhook and the payer's
  return (`/c/<id>?checkout=<messageId>`) both call it, and nothing reads an event's copy.
  Amounts go to Stripe through core `chargeUnits`. Tests run `test/stripe-connect-stub.ts`; the
  E2E stand-in (`e2e/stripe-stub.mjs`) is Connect too. A provider page is left for in the same
  tab on the web (`leaveFor`, `lib/links.ts`), so its return lands where it was asked from.
- Organizations to organizations (R64): a business thread's `customer_org_id` is the
  organization its customer writes for (set at the start, `asOrgId`, its owner or admins only;
  one thread per organization, person and writing-as, null for themselves), carried on
  `CustomerMask.customerOrgId`. The team reads `BusinessThreadView.customerOrg` (named first:
  "Acme · Karim"), the writer `ConversationBusinessView.asOrg`. Anything that pays or bills the
  customer side of a business conversation (`payToFor`, a receipt, a checkout) pays that
  organization when it's set, never the person.
- Business conversations (R15): anything a customer is sent about one goes through the mask in
  `apps/server/src/lib/business.ts`. New endpoints that return user ids or names for a
  conversation must apply `maskFor`; `business.test.ts` checks the customer's responses for
  any team id or name, so extend it with the new endpoint.
- Webhook events are `WEBHOOK_EVENTS` in core (`apps.ts`, labels through `tr`), typed in
  `packages/sdk/src/webhooks.ts`, listed in `docs/API.md` and emitted with `emitWebhook`;
  anything that removes or erases a customer conversation's words emits `message.deleted` or
  `conversation.erased`, so an organization's app drops its copies (R54). A replaced webhook
  secret signs beside the new one for `SECRET_OVERLAP_MS` (a day: `previous_webhook_secret`,
  `previous_secret_until`; the header's second `v1`), and core's `parseSignature` and the SDK's
  verifier take any `v1`; nothing else signs or checks a delivery. A delivery is tried
  six times over about a quarter of an hour (`WEBHOOK_ATTEMPTS`, the job loop's backoff);
  nothing is replayed on its own, but an app lists its own deliveries and retries a failed one
  (`GET /v1/apps/me/deliveries`, `POST …/:id/retry`, `requeueDelivery`), which the doc says.
- Apps' bots are users of kind `'bot'` on an organization's team. Anything that picks or
  counts people (assignees, heirs, who is notified, the team's size, search, connections)
  takes `kind = 'human'` only; a bot's messages are `automated` and never move a thread. An
  app's token reaches only the routes in `API_ROUTES` (`apps/server/src/lib/apps.ts`): add a
  route there, with its scope, before an app can use it, document it in `docs/API.md`, and give
  it a method in `packages/sdk/src/client.ts` with a case in `sdk.test.ts`. A new webhook event
  gets its type in `packages/sdk/src/webhooks.ts`.
- Outbound requests to addresses someone else chose (webhooks) go through `postWebhook`: https,
  no private addresses (checked on the URL and on every DNS answer), one deadline for the whole
  exchange. Test them with `WEBHOOKS_ALLOW_PRIVATE=true` and a local server.
- Taking a message down for everyone or an update back goes through `lib/moderation.ts`
  (`removeForEveryone`, `takeBackUpdate`): the sender's delete, the poster's take-back and the
  operator's review (R49, `/admin/reports`, `modules/admin.ts`) all run the same code, so a
  new consequence of a removal (something else that keeps a message's words) goes there once.
- Anything that writes into a conversation (send, edit, react, vote, move a card, type) calls
  `assertCanWrite` (`apps/server/src/lib/blocks.ts`) first: blocks between people and a
  customer's block of an organization both stop at it. New write routes do the same, with a
  case in `blocking.test.ts`.
- React Native Web drops `accessibilityState`; the app's `Pressable` (`src/ui/Pressable.tsx`)
  turns it into ARIA on the web (a selected link is `aria-current="page"`, a tab or option
  `aria-selected`, a button `aria-pressed`). Use that `Pressable`, and assert state in E2E with
  `toBeChecked()` and friends rather than by styling. `e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA)
  over the primary screens in both languages and every visitor page, and fails on a serious or
  critical violation: a name for a screen reader goes on a `View` with a role (`accessible`,
  `accessibilityRole="image"` for a mark, a dot or an icon's meaning), never on an `Svg`, an
  icon or a bare `View`, where the web puts it on an element with no role; and a state said by
  colour (presence) says it in words through `tr` too. A new primary screen joins the spec's
  list.
- A kit's field checks (`prepareKitFields`) run in the app before sending and again on the
  server over what was sent, so they must be idempotent: a checked value checks the same.
- A Split card (R38) is a record, never a transfer: `shareOut` (core `kit-cards.ts`) gives
  everyone else in the conversation an equal share of what the sender paid, worked out once in
  `sendMessage` from the human participants (rounding stays with the payer), and
  `POST /messages/:id/split` marks a share settled or not by `applySplitOp` under the card's
  row lock. Nothing in Caime holds a balance, and any new card about money is `adultsOnly`.
- Message requests live on the recipient's `participants.request_state` (pending, accepted,
  declined), for a stranger's direct message and an organization's first message alike.
  `sendMessage` (`apps/server/src/lib/messages.ts`) owns the rules: one message until answered,
  declined reads to the sender as unanswered, replying accepts. The team writes first through
  `POST /orgs/:id/threads`, which sends through `sendMessage` too.
- In a business conversation, anything filed for the customer (suggestions, tasks, AI
  follow-ups) names the organization and points at nobody on its team: no team member's id as a
  subject or `decidedBy`. `suggestBusiness` (`apps/server/src/lib/message-effects.ts`) and the
  mask in `ai.ts` are where that's decided.
- E2E verifies organizations' domains for real: `e2e/dns-stub.mjs` answers the server's TXT
  lookups (`DNS_SERVERS`), and `publishTxt()` (`e2e/helpers.ts`) publishes a record. A verified
  domain belongs to one organization, so a test uses a domain of its own each run.
- Tokens that act as a person reach only `PERSON_ROUTES` (`apps/server/src/lib/access.ts`),
  checked in the auth plugin before the route runs, as app tokens reach only `API_ROUTES`. A
  route joins the list on purpose, with its permission and a case in `personal-tokens.test.ts`;
  nothing about the account itself ever does. `req.auth.grant` says a token made the request.
- OAuth apps' tokens (`cao_`) go through the same `PERSON_ROUTES`; `resolveOAuthAccess`
  (`apps/server/src/lib/oauth.ts`) checks the token, its grant, its app and its person are all
  live. `/v1/oauth/token` and `/v1/oauth/revoke` answer RFC 6749/7009 errors
  (`{error, error_description}`), not Caime's shape, and take forms. The consent screen is
  `apps/app/src/app/(app)/oauth/authorize.tsx`; a signed-out visitor's authorize link survives
  sign-in through `state/pendingLink.ts` (`appPath` allows 1,000 characters and colons in the
  query for it).
- Caime's own accounts (R67): Cai (kind `assistant`) and the seven Caime Friends (`character`)
  are users with fixed ids (core `system-ids.ts`, the light module the app's `Avatar` reads to
  draw the heart mark or the friend; their words in `system-accounts.ts`; seeded by migration
  0059). A conversation with one opens through `POST /conversations` like anyone's
  (`openSystemConversation`, greeted once); `effectsOf` sends what's written to one to the
  `system.reply` job and does nothing else (no notification, suggestion, topic or follow-up),
  and the inbox never lets that chat need you. Cai answers `caiIntent`'s four questions from
  three queries, and the rest through `runAi('cai')` (adults with assist on, the allowance,
  nothing from a private conversation); the friends say `SCRIPTS` (server strings). Posting as
  one of them, or as an organization's agent, is `postAs` (`lib/post-as.ts`). What picks people
  (`kind = 'human'`) already leaves them out; a new path that could give one a task, a call, a
  card or a connection refuses it with `systemAccountOf`. Model output reads "Suggested by Cai".
- Cai keeps going (R68, `lib/cai.ts`, `modules/cai.ts`): a wait handed to Cai is
  `tasks.cai_follow_up`, offered by `offerFollowUp` from the reminders sweep in place of a bare
  reminder (the offer is Cai's text message with `payload.followUp`, drawn by
  `features/cai/FollowUpOffer.tsx` under it), and sent only by `sendFollowUp` on its owner's tap
  (client id `follow-up:<offer id>`, so twice is once). The morning brief is
  `preferences.caiBrief` (HH:MM or null): `PATCH /me` queues the next `cai.brief` job when it
  changes, each run queues the next, and a job whose hour no longer matches does nothing. What
  Cai learned is forgotten through `users.learning_reset` (a kind, or '*'), which `leanFor` and
  `caiSettings` both honour: anything new that learns from choices reads it too. Settings · Cai
  (`settings/cai.tsx`) is the one place for what Cai keeps or knows; the learning switch lives
  there. A conversation opened with `?say=` puts the words in the composer once.
- An organization's AI agent is `lib/agent.ts`: a customer's message reaches it through
  `onCustomerMessage` (registered by `registerAgentJob`, so `lib/business.ts` never imports it),
  which queues the `agent.reply` job three seconds out. The job checks the thread is still its
  to answer, asks `ctx.ai.supportAgent`, and claims the message (`agent_seq`) before posting, so
  it answers once. Its user is kind `agent`: `automated` and `aiAgent` on its messages. The E2E
  Messages stand-in answers as it from the sentence of its knowledge nearest the question.
- Calls: `apps/server/src/lib/calls.ts` and `modules/calls.ts` ring, relay and record;
  `apps/app/src/features/calls/engine.ts` holds the RTCPeerConnection and `CallScreens.tsx`
  draws the call over everything, on the web and the phones alike. What a phone does differently
  is in `.native` files only: WebRTC from react-native-webrtc (`rtc.native.ts`, which puts it
  where the browser keeps its own; `rtc.ts` is the web's and the tests'), the camera's view
  (`Media.native.tsx`, `RTCView`) and the call's audio (`callAudio.native.ts`, incall-manager).
  Those are native code, in a development or store build only: `calls.ts` loads nothing of calls
  where `callsAvailable` is false (Expo Go, a browser without WebRTC), since the screens import
  them. The engines use nothing a phone lacks (no `DOMException`: `errorName` in `media.ts`;
  window listeners behind a check). Each tab's `DEVICE_ID` (`state/calls.ts`) is how a call
  runs on the one device that answered. E2E runs Chromium with a fake camera and microphone and
  the server with `STUN_URLS=''`. What's live is asked once: `GET /calls/live` answers both the
  one-to-one call and the group call, `checkLiveCalls` (engine.ts) hands each engine its part,
  and the socket calls that on every connect; `/group-calls/live` still answers the group call
  alone for an engine looking on its own.
- Group calls: `lib/group-calls.ts` and `modules/group-calls.ts` keep `call_members` (one row per
  person rung or in it) and bump `calls.rev` with every change to who's in it, so a device
  ignores a view older than the one it holds. `features/calls/group.ts` holds a connection
  per other joined device (the later joiner offers; a tie goes by device id),
  `GroupCallLayer.tsx` draws the grid, and `GroupCallBanner.tsx` offers to join a call that's
  on. Every 1:1 query in `lib/calls.ts` says `is_group = false`; keep it that way. Change who's
  in a group call only through `settleGroupCall(ctx, id, change)`, which runs `change` under the
  call's row lock (the one a join takes) and tells nobody when it changed nothing; and put
  anyone in a call (placing, answering, starting, joining) only under `lockCallEntry`. A call's
  view shows others only while they're joined (`groupCallView`): never who was rung or declined,
  and devices only to someone in the call. A change others can't see (a ring declined, run out
  or stopped) passes `unseen` to settle: no revision, told only to whoever it was for. An
  unanswered call ends only at its ring time or when its starter leaves. Peers are keyed by
  person and device (`keyOf`), and signals carry `fromUser` / `toUser`; hooks that take someone
  out (blocks, removals, disconnects) run under `whileNoneEnter`. On the web, whether a call
  rings is the server's to say (the person's own member state), never the device's clock; an
  engine that lets go of a call or a ring looks for both engines' rings (`lookForRings`); and
  media that arrives applies what was pressed meanwhile (`asPressed`).
- Live location: the server sets `live.until` and refuses moves after it (`liveNow` in
  `packages/core/src/location.ts`, no zod, so the app can import it). The app's
  `LiveLocationSharer` (mounted in the signed-in layout) moves this device's shares from
  `state/liveShares.ts` and shows the "Sharing your location live" pill.
- A `Segmented` control scrolls sideways when its segments don't fit (a 390-px phone with five):
  never shorten its words to fit, and never give it more than a screen's worth of segments. A
  setting in a panel is one row that opens its choice in a `Sheet` (disappearing messages,
  `disappearing-row`), never a list of radios laid out in the panel. Who a rule is for is picked
  with `features/settings/RuleFor` (reminders under Automations, quiet hours under Notifications
  and priorities: "Add quiet hours" beside "Add a rule"); everything about who reaches you, and
  when, lives on that one screen.
- A `Sheet` is a modal: a layer above the app on the web, its own window on phones. Toasts show in
  the topmost open sheet (`ToastHost layer`), since one drawn on the screen beneath it is hidden
  and its Undo can't be pressed. Anything else that must show over a sheet goes inside it. Toasts
  sit at the bottom, where a thumb reaches Undo: the screen's host is `ScreenToasts`, which
  stands them off the phone's tab bar (`TAB_BAR_HEIGHT`); nothing draws a toast at the top.
  Anything that moves for effect asks `useReduceMotion()` (`lib/motion.ts`: the person's setting
  or the device's) before it animates; a `Sheet` and the skeletons do. The `mono` text variant
  drops its letter-spacing when the text holds Arabic (joins break otherwise). A message that
  arrives in an open conversation is announced to a screen reader through the live region in
  `ConversationScreen` (`new-message-announcer`), never by focus or a toast.
- E2E: a phone sheet slides up, so wait with `toBeInViewport({ ratio: 1 })` and screenshot with
  `animations: 'disabled'`. Photos to upload come from `photo()` in `e2e/helpers.ts`, through
  `page.waitForEvent('filechooser')`.
- Billing: `lib/billing.ts` and `modules/billing.ts` (Stripe, with fetch in `lib/stripe.ts`, API
  version pinned). Prices are found by lookup key (`caime_<plan>_<interval>`), never by id. The
  webhook takes the raw body (its own content-type parser), checks the signature, and applies
  what `GET /v1/subscriptions/:id` says, never the event's copy, in `syncSubscription` under an
  advisory lock per subscription (a listing's copy is used only once it has ended). A plan's
  `plan_source` says who set it (`default`, `operator`, `billing`): billing changes only its own
  and the default. Ending a payer deletes its Stripe customer (`endBillingOf`, a
  `billing.close` job if Stripe is away, and `reconcileBilling` every six hours). Tests talk to
  `test/stripe-stub.ts` (`hold()` stages a race, `outage()` takes Stripe away); the E2E to
  `e2e/stripe-stub.mjs`, whose Checkout and portal pages send the signed webhooks.
- Private conversations (R18): the design is in `packages/core/src/e2ee.ts`'s header and the Web
  Crypto in `e2ee-crypto.ts`; the server never imports the latter and never sees a key or a
  word. The server's side is `lib/e2ee.ts` (live devices, `assertSealedForEveryone`) and
  `modules/e2ee.ts`; a private conversation takes only sealed text, so any new path that reads,
  copies or derives from message bodies (search, memory, AI, previews, forwards, exports, kits)
  must leave `m.sealed` messages alone. The app's side is `features/e2ee/` (`private.ts` holds no
  React). It imports its crypto from `./crypto`: the browser's Web Crypto on the web
  (`crypto.web.ts`, keys unexportable in IndexedDB, `keystore.web.ts`) and, on phones, pure
  JavaScript byte for byte the same (`@caime/core/e2ee-noble`, `crypto.ts`, which takes turns so
  the screen stays responsive; keys in the Keychain or Keystore, `keystore.ts`). A change to the
  envelope goes into both, with a case in `e2ee-noble.test.ts`, which checks every pairing. It's
  loaded only when used (`support.ts`, `hooks.ts`, and a dynamic import in the signed-in layout). Trust is the device's, never the
  server's (`trust.ts`): a device counts only if pinned with the same keys, or its chain of
  introductions (`chainRoot`) holds up to a first device accepted for that person; anything
  sealed, sent or shown goes through `judge`, and a sender's device is judged with the rest of
  its person's devices (`senderOf`), never alone. Open with the conversation on screen
  (`openMessage(m, conversationId)`), never `m.conversationId`. A new device registers with a
  client-chosen id and its own signature, and waits (`approved: false`) until another of the
  person's approves it, or restores with the recovery key (R41, `e2ee-recovery.ts`: the key
  derives a recovery device, `kind = 'recovery'` on the server, no session, sealed for like any
  device, introduced by an approved device and introducing the restoring one; `openMessage`
  falls back to its keys, `keystore.loadRecovery`). A phone keeps its keys across sign-out and
  registers with `resume: true` to take its device up again; a browser forgets them. Anything
  that lists a person's devices to seal for includes the recovery device; anything that picks a
  sender excludes it.
- Possible duplicates (PRD §51): `lib/duplicates.ts` offers them, from what the viewer sees only
  (`sameness`: a two-word name alone is 0.6, under `OFFER_AT`; a place or a nickname they share
  makes the offer);
  `connection_sides.merged_into` always names a group's root (accepting a `duplicate` suggestion
  unions two groups), and `GET /connections` folds each group into its root's `also`. The app's
  card and section load only when there's one (`features/duplicates/`).
- Groups (PRD §56): who may change a conversation (name, purpose, context, disappearing
  messages), remove someone else's message or set disappearing messages is core's
  (`packages/core/src/permissions.ts`: `canEditConversation`, `canRemoveOthersMessages`,
  `canChangeDisappearing`, and `minorMayWriteToOrg` for R29), read by the server before it
  acts and by the app before it offers; `lib/contexts.ts` re-exports the first, with
  `contextVisible` and `contextEditable` for contexts; who adds people, posts in a broadcast,
  removes or promotes whom is `canAddToGroup`, `canPostTo`, `canRemoveFromGroup` and
  `canChangeGroupRole` there too (the last two are the space rules in
  `packages/core/src/spaces.ts`, `canRemoveFromSpace` and `canChangeSpaceRole`, under their
  group names), an owner's leaving is `handsOverOnLeaving` (then `nextOwner`, and
  `handOverGroup`/`handOverGroups` in `lib/conversations.ts`), a query that wants the people who
  run something takes `MANAGING_ROLES`, and what only an organization's owner does (closing it,
  retention, making admins) is `ownsOrg` (`orgs.ts`). Anything new that checks a role calls one
  of these, never `me.role` by hand; outside core a role is compared only to label it. The app's panel is
  `features/conversation/GroupPeople.tsx` (loaded with the details).
- Organizations' updates (PRD §59): `lib/updates.ts` and `modules/updates.ts`, in tables of their
  own (`org_updates`, `org_follows`), never conversations: nothing about following may reach the
  inbox, attention, search, AI or anyone's connections. Only the team sees `postedBy` and the
  follower count; nothing anywhere lists who follows. Followers are told by the `updates.fanout`
  job (a batch at a time, the update read again each batch, one notification per person by a
  unique index), never in the request: anything more that tells followers belongs there. A step
  tells its batch of 1,000 with one insert (`on conflict do nothing` on that index), one
  `notification.created` to them all (`id: null`) and one `withLivePush` lookup, then pushes
  only to those with a device; `updates-scale.test.ts` measures it (`FANOUT_FOLLOWERS`). The
  app's section is `features/updates/OrgUpdates.tsx` (in the organization page's chunk) and the
  Chats row `UpdatesRow.tsx`.
- Web push: `apps/app/public/sw.js` (copied to the web root by the export; plain JS, no build)
  and `features/push/webPush.web.ts`. Every push shows something in Safari (it takes pushes away
  from a site whose pushes show nothing), briefly and silently while Caime is in front; other
  browsers show nothing then. A push that replaces one that's over (a ring answered) is sent with
  `replaceShown` (`quiet`), never as a push that shows nothing. The worker opens a tapped one by
  messaging the open tab (`caime.open`), never by reloading it: a call may be on. Anything new
  pushed with a `data` field it can open belongs in `pathOf` there. Turn off is remembered in the
  browser (`caime.push-off`); sign-out drops the subscription and closes what's shown.
- Plans: what each includes is in `packages/core/src/plans.ts`, and it's checked only in
  `apps/server/src/lib/plans.ts`, where something is added. Never count the wedge (R23). Pro
  sells its depth (R47): relationship insights (`lib/insights.ts` `personInsights`, the
  viewer's own one-to-ones only, names through `personViewsFor`) and automations by plan
  (`assertAutomationRoom`, under the person's lock, `AUTOMATIONS_MAX` the ceiling). A test
  that needs a bigger team or more apps puts its organization on Business in its setup;
  `plans.test.ts` is where limits are tested.
- Mail (R48) goes out only through `ctx.mail` (`lib/email.ts`, null without `SMTP_URL`, so a
  route that needs it throws `mailUnavailable()`), after the response with `ctx.defer`, never
  through the job queue (a reset link is a secret). Texts stay ASCII so they travel as plain
  7-bit text and `e2e/smtp-stub.mjs` can read them; tests pass `memoryMailer()` to
  `createTestApp({}, { mail })` and read its outbox after `t.ctx.flush()`. A new auth screen is
  a reserved handle (`forgot`, `reset`).
- Backups (`lib/backup.ts`): a periodic task dumps the database with `pg_dump` (the image has
  client 16; tests need `pg_dump`/`pg_restore` on the PATH), checks it with `pg_restore --list`,
  and keeps the last in `server_settings` (`backup.last`) for the `caime_backup_*` gauges; tests
  run with `BACKUP_ENABLED=false` unless they're about it. With `BACKUP_S3_*` set, `copyOffHost`
  puts each checked dump in the bucket through `lib/s3.ts` (Signature Version 4 by hand over
  fetch: put and delete, nothing else; a new use of S3 extends it rather than adding an SDK),
  and `backup-copy.test.ts` runs a signing stand-in. Caime never deletes in the bucket.
- Files live where `storageFor(config)` says (`lib/storage.ts`): `DATA_DIR`, or with `FILES_S3_*`
  a bucket (`s3Storage`) for every durable key, with `tmp/` keys on the instance's disk. Anything
  that reads a file by path (sniffing, sharp) works on a `tmp/` key and moves the result with
  `moveFrom`; nothing calls `path()` on a durable key. `files-s3.test.ts` runs the stand-in.
- The operator's routes take `ADMIN_TOKEN` or a named token from `OPERATOR_TOKENS`
  (`requireOperator` in `lib/operator.ts` answers who: `operator`, or the name). A new admin
  route that writes puts that name in its audit entry's `metadata.operator` (a lib function it
  calls takes it as its last argument), and `lib/export.ts` keeps the name out of people's data.
  Someone locked out is helped by `GET /v1/admin/people/:handle` (facts, never content or an
  ip), `DELETE …/sessions` (`endAllAccess`) and `POST …/reset`, which mails the sign-in
  screen's own reset link through `sendResetLink` (`lib/reset.ts`): a new way to send one goes
  through it, never a second token or a link to any other address. A route that needs mail
  throws `mailUnavailable()` from `lib/errors.ts`.
- The request log line is `requestForLog` (`lib/log.ts`): the method and path alone, and a
  secret that is part of a path (a calendar feed's address, an invite's token) is masked there;
  a new route with a secret in its path adds its mask with a case in `log.test.ts`. A sign-in
  limit keyed by what someone typed is keyed by their address too (`login:id:<id>:<ip>`), so
  nobody locks a handle from outside. A resumable upload's chunk is appended under the file's
  row lock (`PATCH /uploads/:id`); anything else that appends to a file does the same.
- Count what the server does with `ctx.metrics` (`apps/server/src/lib/metrics.ts`). Label values
  come from fixed sets only (a route as declared, a kind, an outcome), never ids, handles or
  text; `metrics.test.ts` scrapes after real traffic and checks for them.
- Telling a conversation's people about a message goes through `notifyRecipients`
  (`lib/message-effects.ts`): `prepareFor` reads what the whole set needs (settings, rules,
  relationships with the sender, `identitiesShownTo`, `loadPoliciesFor`, `activeConnectionIds`,
  the open notifications) in six queries, then each recipient is written in their language four
  at a time (`eachLimit`, `lib/batch.ts`); one conversation's `afterMessage` runs after its
  previous message's (`inOrder`), so a burst consolidates. A new thing told to every member joins `prepareFor`,
  never a query of its own per member; anything else that writes to many (a sweep, a fan-out)
  goes through `eachLimit`, never a bare `Promise.all` over people. Whether people may see a read
  position is `readReceiptsVisibleTo` for them all at once (the conversation view, the receipts
  route; `readReceiptVisibleTo` is the one-person form of it), and a receipts event goes to
  whoever sent what it newly covers and the reader's own devices, never a whole group. A view
  that lists a conversation's people takes them from `personViewsFor`. `createTestApp` counts
  the server's queries (`t.queries()`): a scale test says what a path costs, with a ceiling.
- A message is selected with `.select(MESSAGE_COLUMNS)` (`db/schema.ts`), never `selectAll()`,
  which shipped its tsvector with every row: `messaging.test.ts` holds the list to the table's
  columns and the source to the rule, so a new column joins the list. A sweep over due rows
  (reminders, held notifications) takes `SWEEP_BATCH` at a time and runs `background: true`,
  so nothing holds the job loop; a check per item in a loop (the AI actions route) is a query
  for the set first. Every model call's usage carries `cacheReadTokens` and
  `cacheCreationTokens` (from the reply's `cache_read_input_tokens` and
  `cache_creation_input_tokens`), kept on `ai_runs` and counted on `caime_ai_tokens_total`.
- Many inserts take the database's clock (`created_at default now()`), not `ctx.now()`. A test
  that depends on those timestamps sets its clock to real time and stamps what it needs (see
  `product-metrics.test.ts`); new inserts whose time matters set it from `ctx.now()`.
- The worker loop (`startWorkers`, `lib/jobs.ts`) rests until the soonest job or periodic task
  is due and wakes on `enqueue`'s NOTIFY (`ctx.bus.onNotify`, any plain channel on the one
  listening connection); it never polls by the second. A periodic task's `everyMs` is the
  idle floor, so nothing new sweeps more often than it must.
- A picked photo goes through `photoToUpload` (`lib/photos.ts`, `photos.web.ts`) before
  `uploadFile`: shrunk on the device to `PHOTO_MAX_EDGE` (`lib/photoSize.ts`, pure and
  tested), or `AVATAR_MAX_EDGE` for a face or a logo; videos, GIFs and HEIC go as they are, and
  a shrink that fails sends the original. The server's own cap and metadata strip stay.
- The characters' vector builders (`@caime/brand/characters`) load the first time a `Character`
  draws (a dynamic import in `src/brand/Character.tsx`); nothing else imports them as values,
  only their types. Before lazy-loading a module to take it out of the startup chunk, check the
  source map for what else in `__common` imports it statically: `@caime/core/when` looked like
  two sheets' alone, but `intelligence.ts` needs it, so it stays.
- A suggestion's confidence is said in words, never a number: `surenessLine(confidence,
  rationale)` (`packages/core/src/sureness.ts`) is the one line under every suggestion card
  (`suggestion-sure`), so a new place that shows a suggestion uses it rather than the bare
  rationale, and a new source of suggestions picks its confidence knowing 0.85 reads "Quite
  sure", 0.7 "Fairly sure" and less "A guess". A person's profile remembers the two of you
  (`PersonProfileView.memory`, `MEMORY_EACH` in `modules/people.ts`): only the viewer's own rows
  (their decisions' conversations, their waiting items, what was asked of them), so a new thing
  remembered there follows the same two conditions the `actions` counts use, never a wider one.
- The message intelligence is measured, not only exampled: `intelligence-golden.test.ts` reads
  every line of `fixtures/intelligence-golden.ts` (labelled by hand, half negatives) and fails
  below the precision and recall floors per label and language, printing each wrong line. A
  new rule, trigger or list entry adds its lines there (a positive and the near-miss it must
  not catch), and a floor only ever moves up. Quoted words (`maskQuoted`) and forwarded
  messages are nobody's promise; a sentence ends at punctuation followed by a space.
- Dates are `parseWhen` (`packages/core/src/when.ts`): a piece carries a `date`, a `time`, or a
  `softTime` (what "tonight" or "tomorrow evening" suggests, which a written hour beside it
  replaces, read as that part of the day), and the recent past ("last Friday", "yesterday")
  comes out `past: true`, which `firstFutureWhen` skips, so nothing in the past is a due date.
  A new phrase joins its scanner there with a case in `when.test.ts` and a golden line. A
  message's words are read by `analyseText` (`lib/messages.ts`) when sent and again when edited
  (`afterEdit` in `message-effects.ts` offers what they now say, once per kind by fingerprint). A
  vague promise ("I'll do it Thursday") re-dates an open suggestion only when it answers it
  (`absorbVague`: the one it replies to, or the only one open within two days), else it's its own.
- The message intelligence reads Arabic by lists in `packages/core/src/intelligence.ts`
  (`AR_COMMIT`, `AR_REQUEST_VERBS_LIST`, `AR_REQUEST`, `AR_DECISION`, `AR_CONFIRM`, `AR_PAY`,
  `AR_QUESTION_START` with `AR_NOT_A_QUESTION` for "ما" as a negation): a trigger is a whole
  word, a promise's object skips the trigger's words and the particles (`AR_PARTICLES`), and a
  negation right before a promise (`AR_NEGATIVE_BEFORE`) takes it back. A new dialect form joins
  its list with a case in `intelligence.test.ts`, never a regex of its own in the loop. Amounts:
  digits of any script go through `asciiDigits` (the matched text stays the writer's), and a
  currency word with its country goes in `AR_CURRENCY_OF`; a bare word that names several
  currencies ("دينار", "ليرة") says `null`, never a guess.
- On a phone, the realtime socket rests 30 s after the app goes to the background (`rest()` in
  `realtime/client.ts`) and comes back with a catch-up on `active`; a call or a live location
  share keeps it. Anything new that must hear the socket while the app is put away adds its
  check there, or arrives by push instead.
- The build compresses every hashed file under `_expo/static` once (`scripts/precompress.mjs`,
  Brotli 11 and gzip 9 siblings) and `@fastify/static` serves the variant the browser accepts
  (`preCompressed`); `pnpm budget` reports gzip (the budget) and the Brotli wire size. The web
  export runs with Metro's tree shaking (`EXPO_UNSTABLE_TREE_SHAKING` and
  `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` in `build:web`), which drops what Expo Router re-exports
  but nothing imports (11.6 KB gzip); a module whose exports vanish in the export is one those
  flags shook out, so check the E2E before blaming the code. A new
  kind of built file that browsers download belongs under `_expo/static`, or it isn't
  precompressed.
- What a launch costs a device is measured by `e2e/launch-cost.spec.ts` (`LAUNCH_COST=1 pnpm exec
  playwright test e2e/launch-cost.spec.ts`; skipped otherwise): every API request with its time,
  the chunks fetched, bytes received, cold and warm. Run it after a change to the signed-in layout
  or the first screen, and put the numbers in `docs/RESOURCES.md`.
- Watch the web budget when a screen is used by a second route: shared modules move into the
  startup chunk. Open it through its own route instead (the desktop Business inbox is a list
  pane beside `/c/[id]`, not a screen that embeds the conversation).
- A module leaves the startup chunk only when every import of it is dynamic. Splitting a part
  out of a route's own chunk (a sheet inside the conversation screen) makes it worse: whatever
  it shares with that route moves into `__common`, which loads first (it cost 4.5 KB once). The
  desktop panes and the tabs that show them take them lazily from `features/shell/panes.ts`, so
  none is in the first download (`panes.test.ts` fails on a static import of one). Measure with
  `node scripts/bundle-budget.mjs <dist>` after an `expo export --source-maps`, which also lists
  the largest chunks loaded later and fails for any over 100 KB gzip (a language's catalog, the
  conversation screen), and look at what's in `__common` before splitting anything.
  A part that is a whole tab or pane takes a failure screen (`lazyPart(load, ScreenError)`).
- A group's topics (`isGroupTopic`: a group with a `parent_id`) have its people in its roles.
  Any change to a group's participants or roles calls `mirrorTopics(trx, groupId, ctx.now())`
  under the group's lock, and tells what changed with `tellTopics`; a topic's own member routes
  refuse. A new path that changes who's in a group, or who runs it, does the same.
- A `message.updated` event is the message as whoever changed it sees it (their poll votes,
  their reactions). The app applies it with `updateMessage` (`state/cache.ts`): only to a
  message it already shows, never adding one, and with the viewer's own parts worked out again.
  `upsertMessage` is for `message.created` and the app's own answers.
- A chat brought over from WhatsApp (R45) is read on the device by `@caime/core/whatsapp`
  (pure: no zod, so the app takes it by subpath; every export shape gets a case in
  `whatsapp.test.ts`) and lands through `POST /conversations/import` (`modules/imports.ts`),
  which inserts rows itself, past `sendMessage`, so nothing is notified, suggested or moved by
  the past: every imported message carries `payload.imported = {source, by}`, and anything that
  reads message bodies for meaning (effects, AI, attention) may leave those alone. The app shows
  "Imported ·" from that field and offers the sheet (`features/import/`, imported statically by
  the conversation route: split out, it cost 0.8 KB of `__common`) only where topics are.
- Speech to text (PRD §46, docs/SPEECH.md): one interface in `lib/speech.ts` (`SpeechToText`,
  `speechFor(config)`), a provider chosen by `SPEECH_PROVIDER` with its key, each adapter one
  multipart call over fetch (never an SDK). `lib/transcribe.ts` owns the rules: `afterMessage`
  queues a voice note (`speech.transcribe`, deduped by message), the job sends it only when the
  sender has AI assist on, is an adult and has an assist left today, the note isn't sealed and
  is under ten minutes, runs it through `runAi(…, provider)` so the `ai_runs` row names the
  provider, and keeps the words as the message's `body` (so search, previews, exports and
  erasure treat them as written words) with `payload.transcript = { language, by, at }`. A new
  provider is an adapter in `speech.ts`, a name in `SPEECH_PROVIDER_NAMES` (the processors list
  reads it) and a candidate in `scripts/speech-bakeoff.mjs`. The app records with expo-audio in
  `features/voice/Recorder.tsx` and plays in `VoiceNote.tsx`, both loaded lazily (the audio
  module stays out of the startup chunk); the E2E stand-in answers `/v1/audio/transcriptions`
  with fixed words. Recording a call (R52) uses this interface when it comes, never a second one.
- Natural-language search (R17): `GET /search` runs the rules (`parseSearchQuery`; a time at the
  end, "last week", "in March", "2025", is `query.period`, the days to search, split off first by
  `splitPeriod` and filtered on the server, never read as a person) and, only when they
  understood nothing of a query that `looksLikeSentence` and the app said the typing is done
  (`understand=1`: a second's pause or Enter in `search.tsx`; the rules answer every keystroke
  without it), asks the model to fill the same
  structure (`understandWithAi` in `modules/search.ts`, `ai.understandSearch`), for a person with
  AI assist on and allowance left; `fromUnderstanding` (core) checks every value the model
  returns against the taxonomy and the lists, the reading is kept ten minutes per person and
  query, and any failure falls back to the rules without an error. The response says who read it
  (`understoodBy`, `label`). Every model call anywhere goes through `runAi` (`lib/ai-run.ts`),
  which records the `ai_runs` row and the metrics: a new AI feature uses it, never its own
  bookkeeping. A new field the model may fill joins `SearchUnderstanding`, `fromUnderstanding`'s
  checks, the prompt in `lib/ai.ts` and both stand-ins (`test/ai.test.ts` queues a reply;
  `e2e/anthropic-stub.mjs` answers the "search someone typed" prompt from the words).
- What a person's choices teach (M11, core `learning.ts`): `createSuggestion` reads their last
  decisions on the kind (`leanFor`, the same person's first, the kind at large with more) and
  keeps the lean with its counts on `payload.learned`; the app places by it (`placeByLean`:
  favoured first, quiet ones in one line, never hidden) and says the count. Rules, never a
  model; `learnFromChoices` (an account preference, on by default) turns it off, and then
  nothing is learned or kept. A new kind of suggestion needs nothing; a new way to decide one
  (beyond accept and dismiss) joins the counts in `leanFor`.
- Suggestions are accepted through `acceptSuggestion` (`modules/suggestions.ts`), the one path
  the single route, "Do all" (`POST /suggestions/accept`, each id on its own) and tests use; it
  claims the row under its lock inside the transaction, so two accepts at once make one thing. A
  task-like step is undone by `POST /suggestions/:id/undo` only while the task is still exactly
  as made (`result_ref.title`, status open); a new kind that should be undoable records what it
  made in `result_ref` and adds its case there. Decisions stay, as ones recorded by hand do.
- What's saved (`saved_items`, PRD §69) points at messages and copies nothing. Any new path
  that deletes a message for everyone, hides it for someone or lets it disappear drops what
  was saved of it (`dropSaved`, then `tellSaved`; the retention job does it in its own SQL),
  as it drops the message's assets and pin. A group's topic changes its disappearing messages
  only through its group, which passes them on.

## Reviewing a contribution

Read the whole diff before running anything. Check the refusals in `CONTRIBUTING.md` first (they
end a review), then run `pnpm check`, the budget and the E2E on the branch, then read it against
conventions 1–14 and the product review. Verify every number and every "verified" claim against
output, not the description. Accept with small fixes named, request changes naming file and rule,
or refuse with one reason and a roadmap line if the idea is worth keeping. Never merge on a red
check, a contributor's own approval or a bot's.

## Credentials and environment

Nothing secret is committed. The server reads configuration from environment variables
(`apps/server/.env.example`, `docs/DEPLOY.md`). Deployment automation needs `EASYPANEL_URL` and
`EASYPANEL_API_TOKEN` in the cloud environment settings, never pasted into chat; CI redeploys
through the `EASYPANEL_DEPLOY_WEBHOOK` repository secret. Optional integrations turn on when their
variables exist: `ANTHROPIC_API_KEY` (AI assist, Claude through `@anthropic-ai/sdk` with
server-side refusal fallbacks), `EXPO_ACCESS_TOKEN` (mobile push).

## Current state

See `docs/ROADMAP.md`. In one line: core, server, the universal app (web verified end to end,
native bundles export), Connect Kits (including location, live location, checklists and shared
albums), AI assist, Spaces, Organizations with DNS verification, the Business inbox (with
organizations writing first as requests), apps for organizations (scoped tokens, bots, signed
webhooks), personal access tokens, OAuth for third-party apps, plan entitlements, metrics
(operations, product, organizations' insights), share links, your-data controls, the image and
CI are built and verified, and so are an organization's AI support agent, web calls (1:1 and in
groups of up to eight; phones built, not yet tried on one) with their history, private conversations (end to end encrypted, web; phones built, not yet tried on one),
billing with Stripe, possible duplicates in People, and organizations' updates.
It's live on EasyPanel at https://caime.datac.com (also its default domain,
https://caishy-caishy.0hqwb7.easypanel.host; `docs/DEPLOY.md`), billing included, on the live
Stripe account (tell its owner before changing anything there: it's live); sessions in this
environment have `EASYPANEL_URL` and `EASYPANEL_API_TOKEN` (never print them). Calls go through Cloudflare's TURN relay when they can't connect directly
(`CLOUDFLARE_TURN_*`, set in EasyPanel). Remaining: trying calls and private conversations on a phone (a development build: Expo Go
has no WebRTC), ringing a closed app (VoIP push), a third-party penetration test, and store builds. Production is only what passed CI: a green run
on `main` fast-forwards `production`, which EasyPanel builds from (`docs/DEPLOY.md`).
