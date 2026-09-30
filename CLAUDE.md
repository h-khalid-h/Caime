# Caime — operating manual

Caime (formerly CONNIQT) is a relationship-aware communication platform for iOS, Android and Web:
**messaging that understands your relationships.** The primary domain object is the
**connection** between two people, not the chat. This file is how any session picks up the work
without re-deriving decisions.

## Start of every session

1. Read `docs/ROADMAP.md` (what is done, in progress, blocked) and `docs/GOAL.md` (the target).
2. Skim `docs/PRODUCT-REVIEW.md` (refinements R1–R33 override the PRD) and `docs/ARCHITECTURE.md`
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
| `apps/server` | Fastify 5 API (`/v1`), WebSocket realtime, Postgres (Kysely + SQL migrations), jobs, push, files; serves the exported web app from `WEB_DIR`. |
| `apps/app` | Expo SDK 57 universal app (Expo Router; routes in `src/app/`, screens in `src/features/`, primitives in `src/ui/`). iOS, Android and Web. |
| `e2e/` | Playwright tests against the production bundle (`playwright.config.ts` at the root). |
| `scripts/` | `bundle-budget.mjs` (the web JS budget). |
| `docs/` | PRD, product review, brand, competitive strategy, architecture, roadmap, goal, deploy, security, and the developer guide for organizations' apps (`API.md`). |

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
pnpm budget                  # initial web JS, gzip, must stay under 450 KB
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
5. **One contract.** Response shapes live in `packages/core/src/api.ts`; server views are
   annotated with them and the app reads them. Change the contract, and both sides must compile.
6. **Writes are idempotent.** Retried client writes carry `clientId` (ADR-8); messages are ordered
   by `seq` (ADR-9). The sender's own echo carries its `clientId`; others get null.
7. **Migrations are append-only** once pushed. Never edit a committed migration; add a new one.
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
- The persisted query cache is restored as-is; `invalidateQueries()` runs right after restore so
  a relaunch shows the cache instantly and then refreshes it.
- Playwright: text also appears in off-screen screens on phones (tabs stay mounted), so assert
  with `.filter({ visible: true })`.
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
  `contain`), so anything shown on hover belongs beside the thing hovered, not inside it.
- Hold the socket in E2E with `page.routeWebSocket` to test what happens before it connects.
- Write live changes into the query cache with `patchCache` (`state/cache.ts`), never a bare
  `setQueryData`: a bare write marks the data fresh, and a restored copy then never refetches.
- A sheet whose content depends on the state that closes it should keep the last content while
  it fades (see the member sheet in `SpaceScreen`), or it fades out empty.
- Web fonts: on the web the faces are WOFF2 in `apps/app/public/fonts` (Fontsource's Latin
  cuts, copied from `@fontsource/inter` and `@fontsource/nunito`; OFL beside them), declared in
  `index.html` under the very names `theme/fonts.ts` uses, so `fontFiles.web.ts` gives expo-font
  nothing to load; phones load the TTFs from `fontFiles.ts`. A new weight needs both, and
  `fonts` is a reserved handle.
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
- Invite links (R1): `lib/invites.ts` makes, opens and accepts them; accepting goes through
  `acceptRequest(…, { viaInvite: true })` on a request the invite stands for (never a second path
  to a connection), so blocks, suggestions and notifications behave as for a request. The token
  is the only key to one (`/i/<token>`: `publicInvite` renders the visitor's page, `inviteIn` in
  `lib/paths.ts` recognizes it, the `i/[token]` route accepts). A person's export lists their
  links; the privacy page says so.
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
- Business conversations (R15): anything a customer is sent about one goes through the mask in
  `apps/server/src/lib/business.ts`. New endpoints that return user ids or names for a
  conversation must apply `maskFor`; `business.test.ts` checks the customer's responses for
  any team id or name, so extend it with the new endpoint.
- Apps' bots are users of kind `'bot'` on an organization's team. Anything that picks or
  counts people (assignees, heirs, who is notified, the team's size, search, connections)
  takes `kind = 'human'` only; a bot's messages are `automated` and never move a thread. An
  app's token reaches only the routes in `API_ROUTES` (`apps/server/src/lib/apps.ts`): add a
  route there, with its scope, before an app can use it, and document it in `docs/API.md`.
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
  turns it into ARIA on the web. Use that `Pressable`, and assert state in E2E with
  `toBeChecked()` and friends rather than by styling.
- A kit's field checks (`prepareKitFields`) run in the app before sending and again on the
  server over what was sent, so they must be idempotent: a checked value checks the same.
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
  the server with `STUN_URLS=''`.
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
- A `Sheet` is a modal: a layer above the app on the web, its own window on phones. Toasts show in
  the topmost open sheet (`ToastHost layer`), since one drawn on the screen beneath it is hidden
  and its Undo can't be pressed. Anything else that must show over a sheet goes inside it.
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
  sealed, sent or shown goes through `judge`. Open with the conversation on screen
  (`openMessage(m, conversationId)`), never `m.conversationId`. A new device registers with a
  client-chosen id and its own signature, and waits (`approved: false`) until another of the
  person's approves it, or restores with the recovery key (R41, `e2ee-recovery.ts`: the key
  derives a recovery device, `kind = 'recovery'` on the server, no session, sealed for like any
  device, introduced by an approved device and introducing the restoring one; `openMessage`
  falls back to its keys, `keystore.loadRecovery`). A phone keeps its keys across sign-out and
  registers with `resume: true` to take its device up again; a browser forgets them. Anything
  that lists a person's devices to seal for includes the recovery device; anything that picks a
  sender excludes it.
- Possible duplicates (PRD §51): `lib/duplicates.ts` offers them, from what the viewer sees only;
  `connection_sides.merged_into` always names a group's root (accepting a `duplicate` suggestion
  unions two groups), and `GET /connections` folds each group into its root's `also`. The app's
  card and section load only when there's one (`features/duplicates/`).
- Groups (PRD §56): who may change a conversation (name, purpose, context, disappearing
  messages) is `canEditConversation` in `lib/contexts.ts`, with `contextVisible` and
  `contextEditable` for contexts; roles follow the space rules in `packages/core/src/spaces.ts`
  (`canRemoveFromSpace`, `canChangeSpaceRole`, `nextOwner`), and an owner who goes hands on
  through `handOverGroup`/`handOverGroups` (`lib/conversations.ts`). Anything new that changes a
  group checks one of these, never `me.role` by hand. The app's panel is
  `features/conversation/GroupPeople.tsx` (loaded with the details).
- Organizations' updates (PRD §59): `lib/updates.ts` and `modules/updates.ts`, in tables of their
  own (`org_updates`, `org_follows`), never conversations: nothing about following may reach the
  inbox, attention, search, AI or anyone's connections. Only the team sees `postedBy` and the
  follower count; nothing anywhere lists who follows. Followers are told by the `updates.fanout`
  job (a batch at a time, the update read again each batch, one notification per person by a
  unique index), never in the request: anything more that tells followers belongs there. The
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
  run with `BACKUP_ENABLED=false` unless they're about it.
- The operator's routes take `ADMIN_TOKEN` or a named token from `OPERATOR_TOKENS`
  (`requireOperator` in `lib/operator.ts` answers who: `operator`, or the name). A new admin
  route that writes puts that name in its audit entry's `metadata.operator` (a lib function it
  calls takes it as its last argument), and `lib/export.ts` keeps the name out of people's data.
- Count what the server does with `ctx.metrics` (`apps/server/src/lib/metrics.ts`). Label values
  come from fixed sets only (a route as declared, a kind, an outcome), never ids, handles or
  text; `metrics.test.ts` scrapes after real traffic and checks for them.
- Many inserts take the database's clock (`created_at default now()`), not `ctx.now()`. A test
  that depends on those timestamps sets its clock to real time and stamps what it needs (see
  `product-metrics.test.ts`); new inserts whose time matters set it from `ctx.now()`.
- A picked photo goes through `photoToUpload` (`lib/photos.ts`, `photos.web.ts`) before
  `uploadFile`: shrunk on the device to `PHOTO_MAX_EDGE` (`lib/photoSize.ts`, pure and
  tested), or `AVATAR_MAX_EDGE` for a face or a logo; videos, GIFs and HEIC go as they are, and
  a shrink that fails sends the original. The server's own cap and metadata strip stay.
- The characters' vector builders (`@caime/brand/characters`) load the first time a `Character`
  draws (a dynamic import in `src/brand/Character.tsx`); nothing else imports them as values,
  only their types. Before lazy-loading a module to take it out of the startup chunk, check the
  source map for what else in `__common` imports it statically: `@caime/core/when` looked like
  two sheets' alone, but `intelligence.ts` needs it, so it stays.
- On a phone, the realtime socket rests 30 s after the app goes to the background (`rest()` in
  `realtime/client.ts`) and comes back with a catch-up on `active`; a call or a live location
  share keeps it. Anything new that must hear the socket while the app is put away adds its
  check there, or arrives by push instead.
- The build compresses every hashed file under `_expo/static` once (`scripts/precompress.mjs`,
  Brotli 11 and gzip 9 siblings) and `@fastify/static` serves the variant the browser accepts
  (`preCompressed`); `pnpm budget` reports gzip (the budget) and the Brotli wire size. A new
  kind of built file that browsers download belongs under `_expo/static`, or it isn't
  precompressed.
- Watch the web budget when a screen is used by a second route: shared modules move into the
  startup chunk. Open it through its own route instead (the desktop Business inbox is a list
  pane beside `/c/[id]`, not a screen that embeds the conversation).
- A module leaves the startup chunk only when every import of it is dynamic. Splitting a part
  out of a route's own chunk (a sheet inside the conversation screen) makes it worse: whatever
  it shares with that route moves into `__common`, which loads first (it cost 4.5 KB once). The
  desktop panes and the tabs that show them take them lazily from `features/shell/panes.ts`, so
  none is in the first download. Measure with `node scripts/bundle-budget.mjs <dist>` after an
  `expo export --source-maps`, and look at what's in `__common` before splitting anything.
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
