# Caime — operating manual

Caime (formerly CONNIQT) is a relationship-aware communication platform for iOS, Android and Web:
**messaging that understands your relationships.** The primary domain object is the
**connection** between two people, not the chat. This file is how any session picks up the work
without re-deriving decisions.

## Start of every session

1. Read `docs/ROADMAP.md` (what is done, in progress, blocked) and `docs/GOAL.md` (the target).
2. Skim `docs/PRODUCT-REVIEW.md` (refinements R1–R98 override the PRD) and `docs/ARCHITECTURE.md`
   (ADRs). Open `docs/PRD.md` (cited as `PRD §n`) and `docs/BRAND.md` when a task touches them.
   A slice of product work names the unfair advantage it sharpens and the number that shows it
   (`docs/REVIEW-2026-10-17.md` §14); adoption and friction are optimised in its service.
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
| `scripts/` | `bundle-budget.mjs` (the web JS budget), `migrations-lint.mjs` (what a release's migrations keep to, against `origin/production`), `i18n-keys.mjs` (missing, stale and bare strings), `web-fonts.mjs` (`pnpm fonts`), `precompress.mjs`, `geo.mjs`, `speech-bakeoff.mjs` and the rest of the build's helpers. |
| `docs/` | PRD, product review, brand, competitive strategy, architecture, roadmap, goal, deploy, security, the developer guide for organizations' apps (`API.md`), the draft data processing agreement for the owner's lawyer (`DPA-DRAFT.md`, facts held to the code by `dpa-draft.test.ts`; never published as it is) and the legal review of it, the privacy policy and the terms (`LEGAL-REVIEW-2026-10.md`). |

## Commands

```sh
pnpm install                 # once; hoisted node_modules (ADR-1)
pnpm check                   # lint + migrations lint + typecheck + all tests: run before every commit
pnpm migrations:lint         # this release's migrations against origin/production (git fetch origin production first)
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
   A migration runs in a transaction with no statement timeout and a 15 s `lock_timeout` (a
   held table fails the deploy fast while the old container serves); one that builds an index
   `concurrently` starts with `-- no-transaction`, holds that one statement (the runner sends
   the file whole) and is written to run again (`if not exists`). `pnpm migrations:lint` (in
   `check` and CI) holds a release to this against `origin/production`: a committed migration
   changed or gone fails; a contraction (a column or table dropped, renamed or retyped) carries
   `-- contracts after <sha>`, the commit already in production that stopped reading it; a
   backfill of a big table (`BIG_TABLES` in the script) is a procedure that updates a batch and
   commits it in a loop, called from a `-- no-transaction` file, never a bare `update` over the
   table; an index on a big table is built `concurrently`.
8. **Never assume gender or age.** Copy uses names, not pronouns; gender is never inferred (R27).
   A person may say it (R81: `users.gender`, null by default, its own privacy field), and then
   the words take its form where the language has one: what's said *to* them through `tr`
   (`ReaderForms` in the catalog, the reader's gender on the translator) and what's said *of*
   them through `trFor(gender, key)` (`GenderForms`; `tr` reads such a word for anyone, so a
   category never takes the reader's gender). Nothing else reads it. Under-18 protections are
   rules in code, with tests (R29).
9. **Brand on two intensities.** Characters in expressive moments (welcome, empty states,
   stickers), never on security or money surfaces (BRAND.md B2). Colours come from the theme,
   which reads contrast-checked tokens; no raw hex in components beyond white text on fills.
10. **The web bundle is a budget.** The app imports core and brand by subpath
    (`@caime/core/format`), never the package root (it would pull in zod), and icons one file
    each where they're used (`lucide-react-native/icons/<name>`), never the package root and
    never through a module that re-exports them: a barrel put all 127 in the startup chunk
    (`iconImports.test.ts`). `pnpm budget` fails CI above 450 KB.
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
16. **Sharp at every size** (R70). An image is drawn from the rendition made for its size on a 3x
    screen, through core's `imageFor` (`renditions.ts`: the 480-px thumbnail up to 160 points,
    the 1280-px preview above it, the cleaned original for a viewer that zooms), never a smaller
    one stretched; a new place that draws an image passes the points it draws at. Brand images
    are made by `pnpm --filter @caime/brand assets` at the size they're shown (the icons, the
    1200 x 630 social card), never scaled up, and a page names only the fonts the shell
    declares.
17. **Intelligence in every interface language** (R70, R71). Whatever Caime understands of
    people's words (promises, requests, decisions, questions, dates, amounts, what's asked of Cai
    and the friends) it understands in every language of `INTERFACE_LANGUAGES`, by rules first,
    measured per language by the golden set (`intelligence-golden.test.ts`: floors per label and
    language, only ever raised, with lines written apart from the rules), and it answers in the
    language it was written in. The model is asked only for what the rules don't answer, for
    whoever may use it, on the latest model by default. A new language brings its readers and
    their golden lines with its catalog.

## Vocabulary

One word per concept in what people read (docs/REVIEW-2026-10-17.md §10); the code may keep its
older name. **Organization** (never "business" for the thing itself; "Business" is the plan, the
inbox tab and "Verified business"). **Action** in the interface, `tasks` in code; never "task" in a
key. **Promise** in the interface, `commitment` in code. **Card** in the interface, `kit` only in
code and the developer API; never "kit" in a refusal. The **Customer** sphere (how you know
someone) is not the **Client** role (who they are to an organization): a label that joins them
names both. **Account** is your Caime account; an email or phone you add is an **address**; a
Google or Microsoft account you connect is a **connected account**. A business **thread** is the
Business inbox's; a mail thread is a **topic**. **Space**, **group** and **topic** as PRD §56 has
them; **meeting** (proposed, accepted), **appointment** (requested, confirmed), **booking** (an
appointment from a catalog).

## Working notes

- The container's health check is `/v1/healthz` (the process answers); `/v1/readyz` is for the
  uptime check and says the database answers *and* this instance hears the bus (`lib/bus.ts`
  listens again with backoff for as long as it's open, destroys the lost client, and tells the
  hub, which sends every socket a `resync` so the client catches up). Every connection starts
  with `statement_timeout` 30 s and `idle_in_transaction_session_timeout` 60 s (`db/pool.ts`):
  anything longer is a job, never a request. Every answer carries `x-request-id`, and a 500's
  `details.requestId` is the line to find in the log. A gauge a periodic task fills (the last
  backup, the audit check, the probes) is written to `server_settings` through `lib/settings.ts`
  and read back by `syncGauges` on every scrape, so an instance without workers reports it too.
  A test that waits for something uses `until` from `test/helpers.ts`. `/v1/healthz` and
  `/v1/readyz` say `version`, the image's `CAIME_VERSION` (CI builds it with the sha it tests and
  publishes it to `ghcr.io/h-khalid-h/caime:<sha>`; a build made without it says `unknown`): a
  deploy is verified by what answers, never by a panel's status.
- A message's effects are an outbox (A3): `sendMessage` writes `messages.effects_at` a grace
  ahead (`EFFECTS_GRACE_MS`) unless `opts.effects === false` (a series' next time, a space's copy
  of a card, a request card whose route tells its assignee itself); `afterMessage` clears it once
  `effectsOf` is done; the `message.effects` sweep (`replayEffects`, a minute, in the background,
  one instance) claims what's still due by moving its time on, reads the words again at the
  message's own time and runs `afterMessage`, ten minutes on after a failure, let go after a day
  (`caime_message_effects_total`, outcome `replayed`, `failed`, `dropped`). At least once, so
  anything new in `effectsOf` is idempotent (a dedupe key, an `on conflict`), and a new path that
  sends a message either runs `afterMessage` after its response or passes `effects: false`,
  never neither.
- Booking before an account (R97 (1), `lib/public-booking.ts`, `modules/public-booking.ts`): a
  bookable public item's page, an organization's or a person's (`VisitorHost`; a person only while
  `visitorMayBook`: an adult on Caime who takes message requests from everyone, the rule a stranger
  on Caime meets), carries the week's open times and a script-free form (`PublicItemPage.booking`,
  from `visitorBookingState(ctx, host, itemId, search)`; `publicPageFor` takes `ctx` for it);
  `POST /v1/public/book` and `/confirm` take forms in their own plugin (as OAuth's two do:
  anonymous, no session read or made) and answer only with a redirect back to the page (`?code=`,
  `?booked=`, `?book-error=<VisitorRefusal>`), so the page renders every step and a refresh repeats
  nothing. The choice between the steps is a sealed claim (`sealClaim`, `serverKey('public.book')`,
  `CLAIM_MS`), never a row; the address is proven by `lib/email-codes.ts` (`sendEmailCode`,
  `spendEmailCode`, shared with sign-up's confirmation); the booking is `startCustomerConversation`
  (a person's: `ensureDirectConversation` as a message request, an unanswered one refused `waiting`)
  and `sendMessage` as the provisional person, so `bookingFor` checks the time under the host's lock
  as for anyone; agreeing to a card that came as a message request answers it (the kit move route),
  as a reply does. A known account's address is refused as `account` and never mailed (R93); without
  `ctx.mail` the page offers no form at all (`visitorBookingState` is null) and a direct post is
  refused `no_mail`. A provisional booker has no device to be told on, so `afterCardMove` mails them
  when the team confirms or cancels (`mailProvisionalBooker`, `lib/booking-mail.ts`: the time on the
  host's clock, an ICS invitation or cancellation under the appointment's `meetingUid`, the sign-up
  link that claims the address), and a confirmed one is recalled the day before (`booking.remind`,
  queued only when that is at least `REMIND_FRESH_MS` after the confirmation, its payload ids alone,
  the card read again when it runs: moved, cancelled or claimed since, it says nothing); a customer
  with an account hears in Caime only. Each step is counted on
  `caime_public_bookings_total{outcome}` (`code_sent`, `booked`, `reminded`, or a `VisitorRefusal`),
  and product metrics' `growth.door` reads bookings made this way (their client id is
  `public-book:…`) and, of the people who first booked 30 to 60 days ago, those who joined within
  thirty days (`users.claimed_at`). Anything new a visitor may do from a page follows this shape: a
  page state, a form, a redirect, a sealed claim. Writing to an organization before an account
  (C1d, `lib/public-write.ts`, `modules/public-write.ts`) is that shape on its own page:
  `PublicOrg.write` from `visitorWriteState` (the form leads the page on `?write`, the door's
  link and QR), `POST /v1/public/write` and `/confirm` answering at `#write` with `?write-code=`,
  `?write-again=` (a code spent by tries hands the words back), `?written=` or `?write-error=`,
  the words in a sealed claim (`serverKey('public.write')`), the message posted as the
  provisional person through `startCustomerConversation` and `sendMessage` (client id
  `public-write:…`, counted in `growth.door.written`); the team's answer reaches them by Caime
  Mail's mail out (`repliesByMail`; the page says which), whose first mail in a business thread
  takes the customer's own first line as its subject. A code's mail says what it's for
  (`sendEmailCode(…, 'visitor')`), the forms on a visitor's page share the `formcard` style, and
  the daily sweep leaves a provisional person in no conversation alone for its first day.
- Jobs (`lib/jobs.ts`): a job that fails its last attempt is dead (`dead_at`), out of the due
  index, counted on `caime_jobs_dead`, listed with its last error and never its payload at
  `GET /v1/admin/jobs`, and given its attempts back by `retryJob` (`POST …/retry`); never delete
  or hand-edit a job row to "fix" one. A running job renews `locked_at` every `HEARTBEAT_MS`, so
  a lock older than `STALE_LOCK_MS` is a dead worker's; a job has `JOB_TIMEOUT_MS` unless
  `registerJob(kind, handler, { timeoutMs })` says otherwise, and work that may run longer is cut
  into jobs. A periodic task runs on one instance per interval (`claimPeriodic`, `periodic_runs`);
  `runPeriodic` (the tests' direct runner) claims nothing. Anything that decodes an image goes
  through `images.run` (`lib/renditions.ts`, two at a time, never nested) with
  `limitInputPixels: IMAGE_PIXELS_MAX`; a backup's copy is streamed (`s3PutStream`), and nothing
  reads a whole file into memory to send it.
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
- Fonts: on the web the faces are WOFF2 in `apps/app/public/fonts`, written there with the
  shell's `caime-fonts` block in `index.html` by `pnpm fonts` (`scripts/web-fonts.mjs`, from
  Fontsource's cuts; OFL beside them), never by hand: the brand's two families by weight, `Inter`
  and `Nunito`, Latin and its extension (Turkish, œ), and Arabic (R73) under the same two names
  by `unicode-range`, Noto Sans Arabic for Inter's styles and Baloo Bhaijaan 2 for Nunito's, so
  the browser draws Arabic letters with the paired face and only an Arabic reader downloads it.
  The app on the web asks for the family and the weight (`theme/fonts.web.ts`, `fontFace`), and
  the server's pages name the same families (a page written outside the shell, the privacy
  policy or the operator's reports, takes the shell's own block through `shellFaces`). Phones
  load a file per weight through expo-font (`theme/fonts.ts`, `fontFiles.ts`: `LATIN_FONT_FILES`
  gate every splash, `ARABIC_FONT_FILES` an Arabic reader's, `FONT_FILES` is both), the Arabic
  faces too, and `fontFace(family, weight, 'arabic')` picks the paired one, since a phone can't pick
  by the letters: the `Text` primitive passes it for any text holding Arabic. A new weight or
  face is a line in `FACES` there and a TTF for phones (`fonts.test.ts` holds every style of
  the type scale to a Latin, a Latin-extended and an Arabic face), and `fonts` is a reserved
  handle. Arabic takes no tracking and a taller line (`arabicType` in brand's tokens: ×1.18),
  applied by `Text` and, on the server's pages, by `type()` through `--line` and `--track`,
  which `THEME_VARS` sets under `[dir=rtl]`.
- The server's own pages draw from the tokens, as the app does (R69): `lib/page-style.ts` writes
  the theme as CSS variables for both schemes (`THEME_VARS`, `--text-secondary` and friends),
  a style of the type scale as declarations (`type('mono')`), and radii, control heights, the
  touch size and the desktop breakpoint (`px`). A page's CSS names those for every colour, type
  style, radius and control height, never a colour of its own (`public-pages.test.ts` fails on
  one that isn't a token); its layout's own widths and gaps are its own; a value both
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
  a business message. `eraseMessagesWhere` is also what a delete for everyone runs
  (`removeForEveryone`, M16 B2), and it names the files its messages pointed at: every caller
  hands them to `dropErasedFiles` in its transaction and `removeStored` after it commits, so
  nothing erased leaves bytes behind; a removal or an erasure in a customer conversation calls
  `forgetDeliveries` (`lib/apps.ts`, by the payload's `conversationId` through its index) so the
  apps' delivery log keeps none of the words, and the retention sweep keeps no delivery past
  the organization's own retention. Who processes data is `packages/core/src/processors.ts` plus
  `processorsFor(config)` on the server (`HOSTING_PROVIDER` names the host, `EDGE_PROVIDER` the
  network in front of it, `SMTP_HOST_PROVIDERS` the company behind a mail host): a new provider
  joins the list, and the privacy page renders it; never prose about a company anywhere else.
  Closing (DPA §12) records `organizations.last_owner_id` (`closeOrg`'s last argument; null when
  that account is going) and ends every seat at the moment it closes, roles kept; the export
  stays open to that owner alone for `KEPT_DAYS.closedOrgExport` days (`closedExportOpenTo`,
  `GET /me/closed-orgs`, Settings · Security), then the daily `closed-orgs` task runs
  `clearClosedOrg`, which deletes what was its alone and sets `cleared_at`. A new thing an
  organization keeps of its own joins `buildOrgExport` and `clearClosedOrg` both; a file it
  points at goes through `dropUnusedFiles` (`lib/files.ts`), whose one query lists every column
  that points at a file: a new one joins it, with an index.
- An organization's door (R53): its public page's call to action is `doorPath(handle)`
  (`/o/<handle>?write`, `lib/public-pages.ts`), which `appPath` admits, `handleIn` reads as the
  handle and `doorIn` (`lib/paths.ts`) tells from the plain page. Onboarding names it, the
  organization route passes `write` to `OrgScreen`, which starts (or opens) the customer's
  conversation once through `endpoints.messageOrg` and replaces the route. The team reads
  `GET /orgs/:id/door` (`OrgDoorView`: the link on `PUBLIC_URL`, the QR as one SVG path from
  `lib/door.ts`, and beside it `book`, the way to book (C2a): the one item a visitor may book
  from a page, or the organization's page listing several, null while there's none; asked again
  each time, since it follows the catalog, and refreshed by `booking.changed`), drawn by
  `features/orgs/OrgDoor.tsx`. Anything else printed for a clinic (a receipt line, a bio) reuses
  those links and paths, never another encoder or a second link shape. The page for
  organizations' "Start free" is `BUSINESS_START` (`/sign-up?link=/orgs/new`), which onboarding
  treats as a linked arrival ("Start your organization").
- An organization's setup (R57) is `/o/[handle]/setup` (`features/orgs/OrgSetup.tsx`, owner and
  admins only; others get a line saying so): the door, `OrgVerification`, `OrgData`, `OrgBooking`,
  `OrgCheckout`, `OrgAgent`, `OrgApps` and `OrgPlan`, in a clinic's order. The page (`OrgScreen`)
  is the daily work (inbox, updates, spaces, team, insights) and offers the setup in one row
  (`org-setup`) whose subtitle is `setupNextLine(org)`: the first of `setupSteps` (`setupSteps.ts`:
  hours, the team, the domain, an AI agent, in the order that lets customers in soonest, so DNS
  never blocks the rest) not done, which the setup screen lists at its top. A new step joins that
  list with its done test, never a line of its own. A new
  thing an organization configures goes on the setup screen, never on the page; a line both need
  lives in a small module of its own (`planLine.ts`), since a module two route chunks share moves
  into `__common` (`nextOrgPlanLine` cost 2.1 KB there).
- Ending a session (sign-out, "sign out that device", a password change, a recovery, a
  suspension, removing a device for private conversations) goes through `endSessions`
  (`lib/sessions.ts`), never an update of `sessions` by hand: it publishes `session.ended` on
  the bus and the realtime hub on every instance closes that session's sockets (4401). A frame
  a device sends is read through the `Frame` schema in `modules/realtime.ts` (a uuid where a
  uuid is queried) and anything else is dropped; the message handler and `attach` catch, so a
  failure closes that socket alone, and `index.ts` logs an unhandled rejection rather than
  exiting. A new frame type joins the schema.
- Passkeys (R36, `lib/passkeys.ts`, `modules/passkeys.ts`): WebAuthn through
  `@simplewebauthn/server` (pinned exact; the pnpm override keeps one `@peculiar/asn1-schema`,
  since two copies fail every signature with "Cannot get schema for 'ECDSASigValue'"), for the
  relying party `relyingParty(config)` reads from `PUBLIC_URL` (a new address strands every
  passkey). Adding one keeps its challenge (`keepChallenge` then `takeChallenge`, deleted as it's
  read, five minutes); signing in keeps nothing for asking (`signinChallenge`: a nonce and a
  deadline signed with `signingKey`, read back from the answer's client data by
  `readSigninChallenge`) and writes the nonce only once a passkey has answered
  (`spendSigninChallenge`), so an anonymous route never stores a row per request. Every way in makes its session through `createSession` (`lib/sessions.ts`) and
  its cookie through `lib/session-cookie.ts`, never its own insert; `endAllAccess` removes
  passkeys with the sessions and tokens, so a new way in joins it there. Tests use
  `test/soft-authenticator.ts`, the E2E Chromium's virtual authenticator over CDP; the browser's
  side is `features/auth/passkeys.ts`, loaded on press.
- App links (R35): the paths a link opens in the installed app are core `APP_LINK_PREFIXES`,
  the phone apps' ids `APP_IDS` (held to `app.json`); the server writes Apple's and Android's
  files from `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` (`lib/app-links.ts`,
  `modules/app-links.ts`, 404 without them), and `app.config.ts` claims the https domain a build
  talks to (`APP_LINK_PATHS`, held equal by `appLinks.test.ts`). Nothing under `/.well-known/`
  is ever the web app's page (`plugins/static.ts`); a new path that should open the app joins
  both lists, and a new file there is a route of its own.
- Invite links (R1): `lib/invites.ts` makes, opens and accepts them; accepting goes through
  `acceptRequest(…, { viaInvite: true })` on a request the invite stands for (never a second path
  to a connection), so blocks, suggestions and notifications behave as for a request. The token
  is the only key to one (`/i/<token>`: `publicInvite` renders the visitor's page, `inviteIn` in
  `lib/paths.ts` recognizes it, the `i/[token]` route accepts). A person's export lists their
  links; the privacy page says so. Under 18 (R29): an adult the inviter doesn't know through
  someone gets `status: 'requested'` (a request the inviter decides on), never a connection; the
  other way, someone under 18 who opens an adult's link and doesn't know them through someone is
  refused in words that say why (`acceptInvite`, M16 B1), never connected and never a request.
- Someone under 18 (R29, M16 B1): their privacy is core's `clampForMinor` over whatever is
  stored, read by `privacyOf` every time and saved so by `PUT /me/privacy` (nothing to everyone,
  never found by an address, message requests from shared connections at most; the audience
  sheet offers them no Everyone). A profile (`GET /people/:id`) reads as nobody to anyone new
  where finding them would (the handle route's rules): a suspended account, someone found no way
  they allowed (a provisional person by nobody), someone under 18 to an adult; whoever is in
  touch keeps it (a connection, a request either way, a block of theirs to undo, a conversation
  they're both in: `inAConversationTogether`, `lib/relations.ts`). A new audience that could
  reach everyone joins the clamp, and a new path that shows someone's profile keeps both rules.
- Team invites (M16 C3a, `lib/team-invites.ts`, `modules/team-invites.ts`): an owner or admin
  makes a link (or sends one to an address, mailed after the response) from the team's Add sheet
  (`features/orgs/TeamInvites.tsx`); its token (`t_…`) is shown once and kept as its hash, masked
  in the log, open for core `TEAM_INVITE_DAYS`. `/t/<token>` is a visitor's page
  (`publicTeamInvite`), `teamInviteIn` (`lib/paths.ts`) reads it, the `t/[token]` route asks before
  joining, and onboarding joins someone who came through it in one tap. One sent to an address is
  for whoever proves it (`addressedTo`: the sign-in address once confirmed, or a proven one) and is
  spent by its use. Anyone joins a team only through `seatOnTeam` (`lib/orgs.ts`: under the
  organization's row, the plan's room checked in that transaction, threads joined, the team told
  with a `business.updated` that names no thread, which the app reads as "the team changed");
  the members route, an invite and an address at its verified domain (M16 C3b,
  `lib/domain-join.ts`, `modules/domain-join.ts`: `organizations.domain_join`, turned on from
  `OrgVerification`; `domainStanding` says whether a proven address lets someone in, offered on
  the organization's page and told by `offerTeamByDomain` when an address is proven; someone the
  team removed, `org_members.removed_at`, comes back only by a manager or an invite, which
  `seatOnTeam` clears) all call it, and anything new that puts someone on a team does too. `managerSeat` lives beside it. Invites are in `buildOrgExport`, deleted by
  `clearClosedOrg`, and swept after `KEPT_DAYS.spentInvites` as invite links are.
- Join links (M16 C3e, `lib/join-links.ts`, `modules/join-links.ts`): a group's or a space's
  owner or admins make a link (`g_…`, shown once, kept as its hash, masked in the log, open core
  `JOIN_LINK_DAYS`, `JOIN_LINKS_OPEN` at most) from its Add sheet (`features/join/JoinLinks.tsx`,
  lazy everywhere) or from a group just made with nobody (`/new-group` opens `/c/<id>?invite=link`
  on it). `/g/<token>` is a visitor's page (`publicJoinLink`: the place, its kind, how many, who
  asks; never who is in it), `joinLinkIn` (`lib/paths.ts`) reads it, the `g/[token]` route asks
  before joining, and onboarding joins someone who came through it in one tap (`joinPlaceVia`). A
  link leads only where core `joinLinkFits` allows (a standard group of its own) or into an open
  space, stops at `JOIN_LINK_ROOM`, and dies when its maker stops running the place
  (`liveJoinLink`). Anyone joins a group only through `addToGroup` (`lib/group-members.ts`) and a
  space through `addToSpace`, each under the place's row with a `vouch` (the members route's seat
  check, or `claimJoinLink`); while a link is open nobody under 18 is added by either
  (`assertNoMinorWhileLinkOpen`), only adults make or use one, none where anyone is under 18, and
  every refusal reads the same whatever its reason (R29). A new way into a group or a space goes
  through those two. An account made for a link counts as its maker's to have brought
  (`invited_by`; `growth.joinLinks`). Links are in their maker's export and swept after
  `KEPT_DAYS.spentInvites` as invite links are. A link may ask (C3h, `join_links.approval`,
  `lib/join-requests.ts`): accepting it makes an ask (`askToJoin`, one pending per person and
  place, a declined one never asked again by that link), the owner and admins are told and list
  asks at `…/join-requests` (`features/join/JoinRequests.tsx`, lazy everywhere: a group's people,
  a space's people, the link panel), and letting someone in goes through `addToGroup` or
  `addToSpace` with `claimJoinRequest` as the vouch; `join.asked` refreshes the lists. A link that
  asks lets nobody in by itself, so it's the only kind where someone under 18 is (the panel's
  `asksOnly`), `assertNoMinorWhileLinkOpen` counts open links alone, someone under 18 asks only
  where `minorMayAsk` (a verified organization's space, or an owner who is an adult connection of
  theirs), and whoever answers is an adult who runs it.
- Reserved handles (R35) are `RESERVED_HANDLES` and `isReservedHandle` beside `Handle` in
  `packages/core/src/schemas.ts`: the product's names (also inside other handles), its
  characters, staff words, and the names of its pages, top-level screens and web-root files. A
  new route, page or character needs its name there (`paths.test.ts` and brand's
  `characters.test.ts` fail otherwise). Anything that lets someone take a handle checks it with
  `assertHandleAvailable` (`lib/handles.ts`), which answers a reserved handle exactly as a taken
  one; only the operator's `/v1/admin/{people,orgs}/:handle/handle` gives one out.
- Handles are made by one engine (R94, `docs/HANDLES.md`, core `handle-engine.ts`, policy
  `HANDLE_POLICY_VERSION`): `personCandidates` and `orgCandidates` rank what a name could have,
  `GET /v1/handles/candidates` returns the free ones (then the best with 2, 3… never at random),
  and sign-up and a new organization offer them. `isReservedHandle` also refuses generic words
  alone (`GENERIC_WORDS`), and `assertHandleAvailable`/`unavailableAmong` refuse a lookalike of
  anyone's handle by `handleSkeleton`, which the database keeps as `handle_skeleton` (migration
  0088; a change to one is a change to the other, held by `handle-engine.test.ts`). A name with
  no Latin letters is never transliterated: the form asks for its Latin spelling. A test
  person's default handle is `p<n>x<hex>` (`test/helpers.ts`), never a generic word.
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
  invite, a handle, a door, an app's consent, `/orgs/new` from the page for organizations)
  starts at the last; the recovery codes are a card
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
- A place (Chats, People, Spaces, Actions) keeps its `PageHeader` above its list, outside it,
  with `scrolled` from `useScrolled` for the hairline (R88); the list starts with the place's
  `PlaceSearch` (`features/shell/PlaceSearch.tsx`), which filters what the place already holds
  with core `finds` (`fold.ts`: no case, no accents, Arabic folded) and hands the words to Search
  or to Cai (`/search?q=…&ask=1`). A new list of places joins the same way, never a search of its
  own or a request per keystroke.
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
  (`person-profile`), Welcome's three lines, a space's head (`space-spec`) and About
  (`about-spec`); the auth screens' `kicker` (`AuthLayout`) is one line in the same `mono`
  style through `sentence`, not a row. A new screen that lists facts uses `Spec` rather than a
  card of captions. Anything that starts a
  conversation, a group or a space is offered from the Chats "+" sheet (`NewChatSheet`) as well
  as its own tab: one place to start, and the screens it opens stay the only ones.
- Whose tasks a person sees is one rule, `visibleTasksSql(me)` (`lib/task-visibility.ts`): their
  own, and what's asked of them that was shared with them. Every reader of `tasks` for a person
  (Actions, the inbox's counts, Cai and the friends, the briefs, the calendar) puts it in its
  `where`; a new reader does the same, never `owner_id = me or assignee_id = me` by hand.
- A Pay card's checkout (R65): `openCheckout` and `settleCheckout` run under the card's row lock
  and ask Stripe about the card's session (`askSession`) before anything is written; one session
  is ever payable (the payer's own is reused, another's or an old one is expired first, a paid
  one is settled rather than replaced), and the kit move route calls `expireCheckout` when
  `stillPayableAfter(fields, to)` says the card is over for paying by card. A listing's
  `listing_rev` counts up with every change to what Discover shows, and a review carries the
  `revision` it looked at; `closeOrg` and a seat ending clear `business_threads.customer_org_id`
  and `oauth_clients.org_id`, and whoever closes calls `disconnect` after the transaction.
- The calendar (R51) reads what the feed reads: `lib/calendar.ts` (`calendarItems` for a person,
  with `overdueTasks` shared with `modules/calendar.ts`'s feed and `cardsAhead`; `orgBookings`
  for an organization's team) behind `GET /v1/calendar?from&to` and `GET /v1/orgs/:id/calendar`
  (a window of up to a year). On an organization's team, someone's own calendar carries only
  the bookings they do (`providerId`) or, for a card with no booking, the threads assigned to
  them (`cardsAhead` reads both from the business thread), so the feed, Attention's coming up,
  Cai, `busyNow` and the brief all answer for them alone. Nothing on it changes a date: a card
  is moved in its
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
- A meeting that repeats (R58): `fields.repeat` (core `repeat.ts`: `REPEAT_CHOICES`, `isRepeat`,
  `repeatsIn` (a chat or a group), the light part the form, the card and the calendar read, so
  the series' arithmetic, which the calendar would share with the conversation, stays out of
  `__common`) and `payload.series`
  (core `series.ts`: `seriesOf`, `occurrenceAt` on the proposer's wall clock, `nextOccurrence`,
  `seriesAgreed`; a workday series keeps its proposer's week as `series.days`, and
  `fields.repeatUntil`, the last day on the series' clock, bounds `nextOccurrence` and
  `occurrencesBetween`, read by every caller; `timesAYear` caps what's looked ahead).
  `sendMessage` starts a series on the first card
  and takes `occurrence` for a later time; `lib/meeting-series.ts` queues `meeting.next`
  (`queueNextTime`: from `afterCardMove`, each time posted and a space's copy) a minute after a
  time ends, posts the next through `sendMessage` with no effects (nobody is told), queues its
  brief, start and next, and runs the `onOccurrencePosted` hooks (`registerGuestsAgain` asks a
  space's guests again). "Stop repeating" is `POST /messages/:id/repeat/stop` (`stopRepeating`,
  under the card's lock, only before the time ends). `cardsAhead(…, { series: { now } })` looks
  ahead from each series' latest card for the calendar, the feed and the slots (never a list of
  what's next); a time ahead's id is `<series>:<n>`, and a meeting's calendar event is
  `meetingUid`, the feed's and an invitation's alike. An appointment repeats too (`repeatsIn(kind,
  'appointment')`: a chat or a business conversation), on the catalog host's zone and open days
  when booked from one; each time is booked by `bookingFor(…, { series })` as it's posted (no
  lead, the horizon stretched, its own series' times not held against it: `exceptSeries`),
  `slot_taken` skips a time with a notice, any other refusal ends it with one, and
  `orgBookings(…, { ahead })` and `heldBy` hold the times ahead (`OrgBookingView.id` is
  `<series>:<n>` for one); an occurrence never runs `recordBusinessMessage`. Nothing keeps a row per time: a new reader
  of what's ahead decides whether it looks ahead.
- Bookings (R51, R58): a host is an organization or a person (`BookingHost`, `lib/booking.ts`:
  `orgHost`, `personHost`), each with hours (`booking`, core `BookingHours`) and a catalog
  (`booking_items`, core `BookingItem`: a price or none, minutes or days, capacity, how many in
  one booking, an audience, providers for an organization, `askTopic`), set by
  `PUT /orgs/:id/booking` (owner or admins) and `PUT /me/booking` with one body (`BookingBody`;
  the hours' `closed` days, holidays on the host's clock, are skipped by core `openSlots` at every
  branch: `closedOn`)
  and one app component (`features/booking/BookingSetup.tsx`, used by `OrgBooking` and
  Settings · Bookings). Slots are never kept: `openSlotsFor(ctx, host, window, { item, quantity })`
  cuts the hours with core `openSlots` (the item's length on the grid, full at its capacity,
  a stay checked a night at a time, a named provider free, a shared resource with room: the
  hours' `resources` and an item's `resourceId`, read by `busyFor` from every booking of every
  item that uses it, kept by `catalogFrom` only when the hours keep it) and takes out what
  holds a slot: an
  organization's appointment cards (`orgBookings`), a person's own cards (`cardsAhead`, less an
  organization's unless they do them): every card overlapping the window (`heldBy`, up to
  `HELD_MAX`, never a page of the earliest; the look-back is a day, 31 for a stay), since a
  card left out reads as an open slot. A booking from the catalog arrives as `payload.booking
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
  `bookItem`. Where the organization takes orders it gets a `<menu>` too (`menuLines`, from the
  items as that customer sees them, `withStock(…, false)`), and `order` carries `orderLines` and
  `orderWay`, posted as an Order card through `postAs` and `sendMessage` like anyone's order;
  anything the server refuses, or a way not chosen where there are two, hands over. The E2E
  stand-in and `agentSays` answer `bookItem`, `orderLines` and `orderWay` as null.
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
  `?book` does. An item's `options` (core `ItemOption`) make an order's line an item and its
  choices: `lineKey` names a line, `piecePrice` prices one piece, `chosenOf` checks the choices
  against the options, and `placeOrder` counts the item's most and stock over all its lines, as
  `takeStock` does; the picker's cart is keyed by `lineKey`, and anything new that reads an
  order's lines reads `choices` with them. Stock (`lib/stock.ts`) is `item_stock`, apart from the catalog: an item's
  `stock` on a view is `withStock`'s (every count for the host, a count that limits an order for
  anyone else), a save keeps a count it leaves out (the setup's `send` sends only one changed
  there, `BookingSaveBody`), an order takes in `sendMessage`'s transaction (`takeStock`) and
  holds it in `order_stock` while it's open; whatever ends an open order (a cancel in the move
  route, `removeForEveryone`, `eraseMessagesWhere`) gives it back by deleting those rows
  (`giveBackStock`, `stockBackCtes`), never by adding to a count by hand, and calls
  `tellStockChanged` after. Anything new that lists a host's items for someone reads them through
  `itemsWithStock`; anything new that ends an open order gives its stock back the same way.
- Collections and item pages (R61): a host's `collections` (core `CatalogCollection`) group its
  one catalog; an item carries `slug`, `description` and `collectionId`, and is seen only where
  both its audience and its collection's allow (`bookableItems` with `collections`). Read a
  catalog through `catalogOf` (`lib/booking.ts`), which gives every older item its address
  (`withSlugs`), and save through `catalogFrom`; one address space per host, never a
  `RESERVED_SLUGS` word (a new screen under `/o/<handle>/` adds its name there). The order is the
  host's: collections, the items among each collection's and the ways to be paid are listed as
  their arrays are, moved one place at a time by core `moveOne` and `moveItem` from each sheet,
  and every list of them (the setup, the picker through `grouped`, the public page) keeps it. Public pages are
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
  `tr`, as `KitCard` and `KitForm` do. Who pays a card and who is paid, as people, is core
  `paySides` (`kit-cards.ts`); a paid card's receipt is `lib/receipts.ts` behind
  `GET /messages/:id/receipt`, for those two sides alone (to a customer the team is its
  organization), its lines and shared words from core `receipts.ts` (`receiptNumber` from the
  card's id), drawn by the lazy `ReceiptSheet`; anything new a receipt says joins `ReceiptView`
  and `receiptLines`.
- The brief before a meeting (R58, `lib/briefs.ts`): an agreed meeting or appointment queues
  `card.brief` (`queueBrief`, from the kit move route; one per card and start, so a moved card
  finds its old job pointless) an hour before, for the people whose own relationship to the
  other side is in `BRIEF_SPHERES` (a business conversation: the customer and whoever does or
  has it; a group: by its space's kind, else each one's label for whoever called it,
  `groupReaders`); `briefFor(ctx, userId, messageId, { withModel })` is the reader's own view (decisions,
  open promises either way, their questions since the reader's last words, files, a count,
  since the previous agreed card or a fortnight), `GET /messages/:id/brief` adds the summary
  through `runAi('brief')` only with assist on, an adult, an allowance and a standard
  conversation, cached ten minutes; the app opens it from the card ("Before it",
  `features/calendar/BriefSheet.tsx`, lazy). Anything new to say before a meeting joins the
  brief, never a notification of its own.
- The interface's words (R54, ADR-16): every string the app or core shows is written in English
  where it's used, wrapped in `tr('…')` (variables as `{name}`), `trn(n, 'one thing', '{n}
  things')` for a count, or `msg('…')` in a table of options that's translated where it's shown
  (`tr(item.label)`, or `trAll(items)`); the English is the key into `locales/ar.ts` (two halves the app
  fetches side by side, `ar-a.ts` and `ar-b.ts`, so no download is a chunk over 100 KB; `ar.ts`
  merges them for the tests and the server, and a new Arabic key goes at the end of `ar-b.ts`) and
  `locales/fr.ts` (R55: French is the third language, for the Maghreb and Lebanon) and
  `locales/tr.ts` (R59: Turkish, exported as `turkish` since `tr` is the function; the server's
  is `turkishServer`), and
  `i18n-catalog.test.ts` fails, for every language in `INTERFACE_LANGUAGES`, for a string
  without its translation or an entry nothing says (`node scripts/i18n-keys.mjs missing <lang>`
  lists them), and `i18n-literals.test.ts` fails for English shown outside `tr` (`node
  scripts/i18n-keys.mjs bare`: a template literal with prose in its own text, a template handed
  to `tr` as its key, JSX text, a string of words as a JSX child or in a field a person reads;
  the lines of data it allows, a header, an id, a rule's own French, are listed in the
  test, and nothing joins that list that someone reads as the interface's words). A table of
  labels (`ORG_ROLE_LABELS`, `SECTION_LABELS`, the scopes') is `msg()` on every entry, single
  words included, so the collector sees them. Who an automation is for is named as the person
  labelled them, "someone you call “Customer”" (`whoSends`, core `automations.ts`): no article
  to agree with a noun, no gender to guess, in every language. A number a schema's message
  states is written out (`msg('Use at least 10 characters.')`) and `rules.test.ts` holds the
  constant to it. A new language is a code in `INTERFACE_LANGUAGES` and the preference's enum, a
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
  name in every language. Arabic is written for a reader of either gender (and, once they
  said it, in their form: R81, the `toWoman` of a `ReaderForms` entry; a new short imperative
  gets its three forms, a long sentence waits for the reviewer): the masculine imperative is the neutral
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
- Direction (R73): the web's layout runs right to left through `ui/Direction` (a View with
  `dir`, which is what react-native-web turns `start` and `end` by; the document's `dir` only
  mirrors rows and text), at the root and inside a `Sheet` (its Modal mounts outside the root);
  a phone's is `I18nManager`'s, applied at the next launch. Anything with a side asks `useRtl()`
  (`lib/direction.ts`), never the language or `I18nManager` itself: a back arrow is `Back` and a
  row's chevron `Chevron` from `ui/directional`, mirrored (`scaleX: -1`), never the lucide arrow;
  a trailing alignment is `align={rtl ? 'left' : 'right'}`; something hidden for a screen reader
  is clipped to a point, never moved off a side (a side is scrollable the other way). `Text`
  aligns the interface's words to the layout's start whatever letters they're in ("English" in
  the languages list sits at the right in Arabic) and user-written text (`auto`) by its own
  direction; `TextField` starts what's typed where its label is. Styles name `start`/`end`,
  `paddingStart`, `marginEnd`, `borderStartWidth`; a physical side is only for a fill
  (`left: 0, right: 0`) or a pair of equals.
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
- A visitor's page (a person, an organization, an item, a collection, an invite, the 404; R95)
  is built of `lib/page-parts.ts` (`topBar`, `avatar` with initials, `verifiedMark`, `chips`,
  `offerCard`, `section`, `crumbs`, `pageFoot`, `icon` from lucide's paths, `SHEET_STYLE`):
  a new visitor page uses those parts, never markup of its own, and an item's way in is
  `actionBar` (price, Book or Order, what happens next). Handles in running text sit in `<bdi>`.
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
- Server tests make a database each (`caime_t_<hex>`), and `test/global-setup.ts` drops every
  `caime_t_*` with force when a run starts: never start a one-off `vitest run` while another
  run (or `pnpm check`) is going, or the other run's files fail with "database … does not exist"
  and 500s from sign-up. The E2E server is `apps/server/dist/server.js`: a server change needs
  `pnpm --filter @caime/server build` before the E2E sees it, not only the web export. A run
  stopped midway leaves its server on :8787 and the stubs on theirs, which the next local run
  reuses (`reuseExistingServer`) with the old bundle's shell in memory, so every screen stays
  blank: kill them by port before running again.
- Links to Caime are built from `WEB_URL` in the app (`lib/config.ts`, from the API's address) and
  `PUBLIC_URL` on the server, never a hardcoded domain. Pages answer on `PUBLIC_URL`'s name alone
  (`lib/canonical-host.ts`, an `onRequest` hook first in `app.ts`): a page on any other name the
  service has goes there with a 301; `/v1`, `/metrics` and `/.well-known/` answer on every name
  (a new path machines call joins `MACHINE_PATHS`), and loopback names and addresses are left be. A path
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
  A report keeps what its reporter saw (M16 B3, `keepEvidence` in the report's transaction:
  never a sealed message or one hidden for them), and the daily sweep deletes a closed one after
  `KEPT_DAYS.closedReports` (`childSafetyReports` for a child's safety). An organization the
  operator suspended (`organizations.suspended_at`, `setOrgSuspended`) answers as nobody's to
  anyone new (`hiddenBySuspension` on the routes that show it, `orgRowByHandle` for every
  visitor's page, the search and the sitemap), vouches for nobody (`verifiedOrgNames`,
  `orgsOf`), and nothing is written as it or to it (`sendMessage` and
  `startCustomerConversation` answer `409 org_suspended`, the agent stays quiet, no update is
  posted or told, `resolveApiToken` refuses its apps): a new way to show an organization or to
  write as one checks it too.
- Anything that writes into a conversation (send, edit, react, vote, move a card, type) calls
  `assertCanWrite` (`apps/server/src/lib/blocks.ts`) first: blocks between people and a
  customer's block of an organization both stop at it. New write routes do the same, with a
  case in `blocking.test.ts`.
- React Native Web drops `accessibilityState`; the app's `Pressable` (`src/ui/Pressable.tsx`)
  turns it into ARIA on the web (a selected link is `aria-current="page"`, a tab or option
  `aria-selected`, a button `aria-pressed`). Use that `Pressable`, and assert state in E2E with
  `toBeChecked()` and friends rather than by styling. `e2e/a11y.spec.ts` runs axe (WCAG 2.1 AA)
  over the primary screens in all four interface languages and every visitor page, and fails on
  a serious or critical violation: a name for a screen reader goes on a `View` with a role (`accessible`,
  `accessibilityRole="image"` for a mark, a dot or an icon's meaning, `text` for a line read as
  one, `radiogroup` or `toolbar` for a row of chips, `summary` for a card), never on an `Svg`,
  an icon or a bare `View`, where the web puts it on an element with no role; and a state said
  by colour (presence) says it in words through `tr` too. A new primary screen joins the spec's
  list.
- A kit's field checks (`prepareKitFields`) run in the app before sending and again on the
  server over what was sent, so they must be idempotent: a checked value checks the same.
- A Split card (R38) is a record, never a transfer: `shareOut` (core `kit-cards.ts`) gives
  everyone else in the conversation an equal share of what the sender paid, worked out once in
  `sendMessage` from the human participants (rounding stays with the payer), and
  `POST /messages/:id/split` marks a share settled or not by `applySplitOp` under the card's
  row lock. Nothing in Caime holds a balance, and any new card about money is `adultsOnly`.
  A share is paid with the Pay card (R62, `lib/splits.ts`): `payload.share = { splitId }` makes
  `sendMessage` fix the card from `shareToPay` (they pay, the split's payer is paid, the share's
  amount, a reply to the split; one open card a share, checked again under the split's lock),
  and the kit move route's `shareMoved` settles the share in the move's transaction when its
  payee says it arrived. Such a card names its sides (`PaysShare`), so in a group everyone else
  `standsAside` (core `payments.ts`: no moves, not told of them) and its `payTo` shows only the
  ways for everyone; a new card between two named people in a group uses the same rule.
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
- Apps (R74): Settings · Apps is `app/(app)/settings/apps.tsx` (Connected and Discover in
  `features/apps/`), never a screen per kind. Connected is `GET /me/connected-apps`
  (`ConnectedAppView`, `kind`: an OAuth grant, or a built-in that's on); Discover is
  `GET /directory` (`lib/app-directory.ts`: listed `oauth_clients` by `(connected_count, id)`
  keyset, 20 a page, the trigram index for `q`, a category) with core's `BUILTIN_APPS` first on
  the first page, and `GET /directory/:id`. A developer's listing is `PATCH /me/oauth-apps/:id`
  (`ListOAuthAppBody`: tagline, description, category, `loginUrl` at an origin the app returns
  to or its website's, an icon that's the owner's own image, an organization they manage,
  `listed`); asking sets `listed_at`, the operator's `POST /admin/listings/:id` sets
  `reviewed_at` (with `declined_reason` when declined), and a change to what's shown asks again.
  `connected_count` moves only inside the grant's transaction (`countConnected` on a first
  grant, in `revokeGrant`, and `revokeGrantsOf` before an account is deleted), never counted on
  read. A new built-in is a row in `BUILTIN_APPS` and a case in `builtinApps` (whether it's on
  for the viewer, how many have it on); its icon is `/directory/:id/icon` (a listed app's to
  anyone signed in, else its owner's).
- Bridges (R79): Zapier, Make, n8n, Pipedream and IFTTT are `BRIDGES` in `@caime/core/bridges`
  (apart from `app-directory.ts`, which the startup chunk carries: only the sheet and the server
  read their words; a name is the platform's own, never `tr`'d), rows of Discover's `automation`
  category with `kind: 'bridge'`, connected in Caime by `POST /me/bridges/:id` in
  `modules/tokens.ts`: a personal token named after the platform with `personal_tokens.bridge`,
  no expiry, one live per platform and person (a new one revokes the old in the same
  transaction), scoped to what was ticked (`BRIDGE_DEFAULT_SCOPES` reads only). `builtinApps`
  reads the viewer's live bridge tokens with the calendar feed and counts both per platform in
  `builtinCounts` (a minute); Connected lists a bridge as `kind: 'bridge'` (never as a `token`
  row too: the token list says `bridge is null`), and `features/apps/BridgeSheet.tsx` is the
  one sheet, opened from Discover's `AppSheet` and from the Connected row. A new platform is a
  row in `BRIDGES` with its page and its `how` line, nothing else. The OpenAPI document is
  `lib/openapi.ts` (`GET /v1/openapi.json`, `modules/openapi.ts`, public, cached ten minutes),
  built once from `API_ROUTES` and `PERSON_ROUTES` with `z.toJSONSchema` over the very schemas
  the routes parse with: a token-reachable route's query and body schemas live in core
  (`TasksQuery`, `InboxQuery`, `MessagesPageQuery`, `SearchQuery`, `DeliveriesQuery`,
  `UpdatesPageQuery`, `BusinessInboxQuery`, `CalendarWindowQuery`, `KitMoveBody`,
  `KitFieldsBody`), never inline in the module, and a new token-reachable route adds its `DOCS`
  entry there (`openapi.test.ts` fails on one left out).
- Contacts (R79, R89) are one sheet, `features/people/ContactsImport.tsx` (lazy, from the Connect
  screen, first on it and on onboarding's last step through `/connect?contacts=1`), over every
  source, each read on the device into core's one list (`contact-sources.ts`: `contactListOf`,
  a mapper per source, `readAccount` for an account's pages): the phone's book
  (`contacts/local.native.ts`, expo-contacts, READ_CONTACTS alone: `blockedPermissions` drops
  the plugin's WRITE), the browser's picker (`contacts/local.ts`), a Google or Microsoft account
  (`contacts/accounts*.ts`) and a file (`@caime/core/contacts`, dropped on a desktop:
  `contacts/drop.ts`). Only addresses and numbers reach `POST /people/match` (a number made
  international on the device by the person's country, `toInternational`, and found only as
  proven, `provenPhoneHolders`, behind the privacy switch `discoverByPhone`, off where it was
  never saved; a number typed in People search finds the same way) (`modules/people.ts`: the
  search route's rules, `personViewsFor(…, { sharesConversation: false })`, one `betweenMany`
  for every match's state), a page at a time. An account's consent is `lib/contact-accounts.ts`
  behind `modules/contacts.ts`: the server writes the provider's link with its state sealed by
  `serverKey(ctx, 'contacts.state')` (`lib/server-keys.ts`, which the passkeys' key is too),
  trades the code for an access that renews nothing, seals it to the device's key (core
  `contact-seal.ts`, the account's name bound in) and returns to one of two fixed places
  (`CONTACT_RETURN_PATH` on `PUBLIC_URL`, or `APP_SCHEME`), the access in the fragment
  (`contact-return.ts`); nothing is kept and the device reads the provider itself, which the
  web's `connect-src` allows only for a configured account (`contactApiOrigins`). On the web the
  return is read once a page load and kept until the sheet is done with it
  (`contacts/returned.ts`), since the root remounts after the language loads. Whoever isn't here
  is invited by the person, from their own apps (`contact-invites.ts`: `toInternational` by the
  inviter's country, `inviteWays`; `contacts/send*.ts`, expo-sms on a phone), with their general
  invite link (`generalInviteUrl`, `features/people/generalInvite.ts`, loaded apart: one made
  only if they have none), which onboarding's "Share your link" sends too, never the bare
  `/@handle`; where the browser reads no contacts (`localSource` null: a desktop, an iPhone) the
  sheet opens with `openInviteWays` (WhatsApp, and a text on a phone) above the accounts. A new source is a mapper in core and a row in
  the sheet; a new provider joins `CONTACT_ACCOUNTS`, its scopes and lists, `contactClient`, the
  E2E stand-in (`e2e/accounts-stub.mjs`) and the privacy page.
- Connected accounts (R90, `lib/connected-accounts.ts`, `modules/accounts.ts`, core
  `accounts.ts`): one row per person, provider and the provider's own id, used for what
  `ACCOUNT_USES` lists, asking `accountScopes` (identity plus each use's narrowest). The consent
  returns a claim sealed with `serverKey('accounts.state')` naming who asked, redeemed signed in
  (`POST /me/accounts/:provider/claim`, another person's claim is 403); the refresh token is
  sealed with `serverKey('accounts.vault')` (`lib/vault.ts`) and an access lives in memory only
  (`accessFor`, which marks `reconnect` on `invalid_grant`). The calendar use keeps
  `external_busy` (start and end, nothing else), read by `syncAccountCalendar`
  (`lib/external-busy.ts`: on connect, on "Read now", the `accounts.calendar` sweep, and
  `freshenBusy` before a slot is offered or taken when the last read is older than
  `ACCOUNT_FRESH_SECONDS`, which `openSlotsFor` and `pickProvider` call) from every calendar the
  person owns (R96: Google's list through the optional `GOOGLE_CALENDAR_LIST_SCOPE`, else the main
  one, `mainCalendarOnly` on the view; a calendar Google answers with an error is a failed read,
  never an empty one), less what Caime wrote there (`withoutOwn`), and read for holding time only
  through `busyElsewhere`: a person's `heldBy`, an organization's providers in `openSlotsFor`,
  `pickProvider`. The Plans use (R96, `lib/calendar-push.ts`) writes what `cardsAhead` gives the
  person into that calendar by reconciling (`pushAccountPlans` against `calendar_pushes`, a hash
  per event; Google's event id is derived, Microsoft's kept), never by replaying events: anything
  that changes a meeting or an appointment calls `queueCalendarPush` for its people (a card sent,
  `afterCardMove`, `stopRepeating`, a meeting moved to a space, `removeForEveryone`, a booking's
  provider reassigned), the
  `accounts.plans` sweep catches the rest hourly, and `disconnectAccount` runs `withdrawPlans`
  first. A booking from a person's own catalog (`AppointmentBooking.hostId`, written only by
  `bookingFor`) is in `visibleCards` for them while the booker's request waits; nothing else from
  a pending request is. A change that shows (connected, ended, state moved, first
  read) publishes `apps.changed` through `accountsChanged`; a routine read says nothing.
  Disconnecting, `endAllAccess` and deleting an account go through `disconnectAccount`. A new
  use joins `ACCOUNT_USES`, `USE_SCOPES` (an optional permission in `USE_EXTRAS`),
  `ACCOUNT_USE_LABELS`, `usesOffered`, the privacy page and DEPLOY's list of scopes; the app's section is `features/apps/Accounts.tsx`, its return `connect.ts`
  (web: the fragment read once) and `connect.native.ts` (the sign-in sheet). Files
  (`lib/cloud-files.ts`): `usesOffered` says what each provider offers here (Google's files need
  `GOOGLE_PICKER_API_KEY` and `GOOGLE_PICKER_APP_ID`); OneDrive is listed by `listAccountFiles`
  (a next page followed only when it's Graph's own); Google's picker is `googlePickerPage`, the
  one page that loads a third party's script, under its own policy, opened by a sealed five-minute
  `pickerTicket` (no session, so a phone's sheet can open it); a picked file is copied by
  `importAccountFile` as the person's upload (streamed, hashed, capped at
  `ACCOUNT_FILE_MAX_BYTES`, a redirect followed by hand without the access). The composer's Share
  sheet offers each drive, `features/cloud/DriveSheet.tsx` (lazy) browses OneDrive and
  `features/cloud/googlePicker*.ts` open Google's. A new drive provider joins all three.
- Provider health (R78, `lib/provider-health.ts`): every provider Caime talks to has its cheapest
  authenticated read as a `ping` on its own interface (`AiAssist.ping`, `SpeechToText.ping`,
  `MailProvider.ping`, `Mailer.verify`; Stripe's balance through `stripe(ctx)`, Cloudflare
  through `cloudflareIceRequest`, a bucket through `s3Head`), and `providerProbes(ctx)` lists
  the configured ones by a fixed id (`PROVIDERS`): the hourly `provider.health` task and
  `POST /v1/admin/providers/check` run them in parallel, ten seconds each, into `providerState`
  (gauges `caime_provider_up` and `caime_provider_latency_seconds` by `provider`). A new provider
  adds its `ping` to its interface and its probe to `providerProbes`, never a fetch of its own
  elsewhere; tests run with `PROVIDER_HEALTH_ENABLED=false` unless they're about it, and the
  E2E stand-ins answer the reads.
- The audit log is a chain (R78, migration 0072): `audit()` inserts as before and the database
  seals the row at commit (`audit_log_seal`, a deferred constraint trigger under
  `pg_advisory_xact_lock(hashtext('audit_log'))` for that moment alone: never take that lock
  elsewhere, and never insert into `audit_log` past `audit()` outside a test). `seq` is the
  chain's order, not `id`; `verifyAuditChain` (`GET /v1/admin/audit`, the daily `audit.verify`
  task) recomputes the newest rows with the database's own `audit_hash`, and retention deletes
  the chain's start by `seq`, never a row from the middle. A change to the canonical form is a
  new function and a backfill in a new migration.
- `@caime/mcp` (`packages/mcp`): the tools are `TOOLS` in `src/tools.ts`, one per SDK person
  method, each a JSON Schema `checkArguments` reads and a bounded projection; the protocol is
  `src/server.ts` (hand-written JSON-RPC, `PROTOCOL_VERSIONS`), the framing `src/stdio.ts`, the
  binary `src/bin.ts` (`pnpm --filter @caime/mcp build`). A new person route gets its SDK method
  first, then a tool here with a case in `server.test.ts`; the package imports core as types only.
- What an app gives Caime is `APP_PROVIDES` (core `app-directory.ts`, labels through `tr`), on
  `AppListingView.provides` and `DirectoryAppView.provides` (built-ins and bridges carry `[]`),
  saved by the listing route (a change asks the operator again) and picked with `ChoiceChips
  multiple` in `AppListing.tsx`; a new kind of thing an app provides joins the list, and whatever
  finds such apps (R75 phase 3) reads it, never a category.
- The marketplace (R80) is `lib/marketplace-pages.ts`: `/marketplace` is in `MARKETING_PAGES`
  (reserved, in the nav and the sitemap) but routed by `publicPageFor` before the site's pages
  and rendered from rows (`marketplacePageFor`, `renderMarketplace`), never by `renderSite`
  (whose pages are `SiteOnlyPage`). What it lists is `listed(directoryQuery({ db }, NO_VIEWER))`
  and `OWN_APPS` (the built-ins and bridges), the same as Discover; a new thing a listing says
  joins `AppListingView`, `DirectoryAppView`, the listing route's `next`, the export and the
  app's page there. An app's address is `slug`, given only by `giveSlug` when the operator first
  lets it through and never changed or freed (`isReservedSlug` keeps the categories and Caime's
  own ids out); a new category or built-in is a reserved address at once. Its words are the
  developer's, shown as theirs ("It says…"); its links are only https or mailto and drawn
  `noopener nofollow`. Screenshots are checked by `assertScreenshots` (`modules/oauth.ts`: own,
  re-encoded, 8:5 within core's slack, `SCREENSHOT_MIN_WIDTH`) and addressed only by core's
  `appScreenshotPath`. Listing needs `LISTING_CHECKS` from the operator; `delist` needs a
  reason and no revision. Anything that changes what the marketplace shows calls
  `forgetSitemaps()`. Links to the site's pages, the marketplace's included, open as pages in
  the app: `appPath` treats `SITE_PAGES` and `MARKETING_PAGES` as not its screens.
- Who made an app is one shape, `AppPublisher` (`publisherOf` in `lib/app-directory.ts`: the
  organization it's published under, else its developer, or Caime; `CAIME_PUBLISHER` for the
  built-ins): consent (`OAuthConsentView.app`), Connected, Discover and an organization's
  listings all carry it, and the app draws it only with `features/apps/PublisherLine.tsx` (a tap
  opens the publisher's page). Connected lists a person's live personal tokens as `kind: 'token'`
  rows beside the grants and the built-ins; `DELETE /me/connected-apps/:id` ends a grant or,
  failing one, the person's token (`revokePersonalToken`), so Developer and Connected are one
  list. Under 18 Discover's `connectUrl` is null (`withoutConnectForMinors`) and the sheet says
  why; a suspended developer's apps leave Discover (`directoryQuery`). How many have a built-in
  on is cached on the instance for a minute (`feedsOn`): anything that turns one on or off calls
  `builtinCountsChanged(ctx)`. The operator's review notifies the developer (`kind: 'app'`,
  opened on Developer), and `OAuthAppView.connectedCount` shows them their usage. An
  organization's owner and admins see what's published under it on its setup screen
  (`GET /orgs/:id/listings`, `orgListings`, under `qk.orgListings`); its own apps are under
  `qk.orgApps`, and their deliveries list is polled only while a delivery is pending.
- What follows a card's move is `afterCardMove` (`lib/card-moves.ts`): the kit move route and
  `settleCheckout` (a Pay card paid through Checkout moves to `paid` the same way) both call it,
  so a new way a card moves calls it too, never its own notify, publish or event. `tellCardApp`
  (`lib/kits.ts`) tells an app's own card to that app alone and one of Caime's cards in a
  customer conversation to every app of the organization that listens (`kit.posted` for any
  card the team sends, `kit.moved` for any move, never what an app did itself); `cardData` is
  the one shape of a card in a webhook, and `business.message` carries the customer's card as
  `card`. The Business inbox's Orders view (`features/business/OrgOrders.tsx`, lazy; a card's state
  label and tone come from core's light `kit-states.ts`, never `kit-cards`, which carried every
  kit definition into `__common` once, 6 KB) and an
  app's `orders(orgId)` read `GET /orgs/:id/orders` (`lib/orders.ts`, newest 200), and an app's
  `calendar(orgId, from, to)` reads the team's `GET /orgs/:id/calendar`, both `inbox:read`;
  `realtime/apply.ts` invalidates `['org-orders']` with the calendars on a kit event. The SDK's
  person methods (`person`, `myInbox`, `search`, `tasks`, `addTask`, `updateTask`) are the
  `PERSON_ROUTES`, for a `cap_` or `cao_` token on the same client.
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
  and the inbox never lets that chat need you. What's written to one is read by core `chatIntent` (`chat-intent.ts`: a greeting, a
  greeting of peace answered in kind, "how can you help", thanks, and the four questions about
  one's own open things, which Cai and every friend answer from three queries) and answered in the
  language it was written in (`writtenIn`, else the account's, through `inLanguage`); the rest goes
  through `runAi('cai')`, or for a friend `runAi('friend')` in its own character (R71: `FRIENDS`
  in `lib/system-accounts.ts` holds its lines, tips, sticker, persona for the model and `reads`,
  the parts of what's open that are its to know), for adults with assist on, within the
  allowance, nothing from a private conversation. Without the model a friend tells its tips in
  turn (`tipFor`), never a sticker alone; every message of theirs counts as AI (`aiAgent`). Posting as
  one of them, or as an organization's agent, is `postAs` (`lib/post-as.ts`). What picks people
  (`kind = 'human'`) already leaves them out; a new path that could give one a task, a call, a
  card or a connection refuses it with `systemAccountOf`. Model output reads "Suggested by Cai".
- How Cai and the friends speak Arabic (R72) is core `arabicVariety` (`arabic-variety.ts`): what
  the person chose (`preferences.arabicVariety`, Settings · Cai), else what they write in
  (`writtenVariety`: words only one variety says; a shared or Standard word is in no list), else
  where they live (`varietyOfCountry`), else Standard Arabic. The interface stays in Standard
  Arabic; their rule lines are overlays (`locales/ar-egyptian.ts`, `ar-gulf.ts`,
  `ar-levantine.ts`, `VOICES` in `lib/i18n.ts`) that `asReader` and `inLanguage(…, variety)`
  apply, and `voices.test.ts` holds each to every line `system-accounts.ts` and `cai.ts` say: a
  new line joins each overlay, a refusal or a name joins its `NOT_SPOKEN`. The model is told the
  variety and the country (`voiceLines` in `lib/ai.ts`) for the person's own Cai and friends
  only; an organization's agent mirrors the Arabic a customer writes and is never told where
  they live. A brief or a catch-up is for reading and stays standard.
- Cai keeps going (R68, `lib/cai.ts`, `modules/cai.ts`): a wait handed to Cai is
  `tasks.cai_follow_up`, offered by `offerFollowUp` from the reminders sweep in place of a bare
  reminder (the offer is Cai's text message with `payload.followUp`, drawn by
  `features/cai/FollowUpOffer.tsx` under it), and sent only by `sendFollowUp` on its owner's tap
  (client id `follow-up:<offer id>`, so twice is once). The morning brief is
  `preferences.caiBrief` (HH:MM or null): `PATCH /me` queues the next `cai.brief` job when it
  changes, each run queues the next, and a job whose hour no longer matches does nothing. The
  weekly digest is `preferences.caiDigest` (`cai.digest`, the same shape: queued by `PATCH /me`
  when it's turned on or the brief's hour moves, at the first day of the person's week at that
  hour or nine, with the organizations they run through `teamWeeks`, R87): `digestText` reads one
  round of queries, a one-to-one's activity from
  `conversations.last_message_at` (never a scan of its messages), tasks through
  `visibleTasksSql`, the week ahead through `cardsAhead`, and says names, counts and titles,
  never anyone's words. What
  Cai learned is forgotten through `users.learning_reset` (a kind, or '*'), which `leanFor` and
  `caiSettings` both honour: anything new that learns from choices reads it too. Settings · Cai
  (`settings/cai.tsx`) is the one place for what Cai keeps or knows; the learning switch lives
  there. A conversation opened with `?say=` puts the words in the composer once.
- Own addresses (R91, `lib/addresses.ts`, `modules/addresses.ts`): an email or phone number
  someone adds is a row of `own_addresses` that counts for nothing until its code comes back
  (`verifyAddress`: hashed, `ADDRESS_CODE_MINUTES`, `ADDRESS_CODE_TRIES` counted in the
  database); proven, it's one person's alone (the partial unique index), and who an email is goes
  through `personByAddress` (the sign-in, else a proven one), read by Caime Mail's `senderOf`,
  and by `provenEmailHolders` for the contacts match and search's `own_addresses` clause. A new
  reader of "who is this address" uses them, never `users.email` alone. A phone's code goes over
  WhatsApp (`lib/whatsapp.ts`, Meta's Cloud API, its template, a provider-health probe), the
  email's by `ctx.mail` after the response. Mail from one's own address to one's own Caime
  address lands in one's Cai chat and is never answered (`effectsOf` skips a `mail` message
  there). The app's rows are `features/apps/Addresses.tsx`, inside the one "Your accounts" list.
- Places (R92, core `places.ts`, `lib/places.ts`, `modules/places.ts`): a person's or an
  organization's named addresses, saved as a whole list (`savePlaces`, kept by id), a person's
  shown only through `placeVisible` (its `Audience`, the limited preset, blocks) clamped by
  `placeAudienceFor` under 18, an organization's by `orgPlaceVisible` (anyone, customers, team).
  A place is used by copying `placeLine` (a card's "Where" through `PlaceChips`, an order's
  `deliverTo`), never by pointing at a row; a point is taken only where its owner stands, never
  looked up. The one editor is `features/places/PlacesSetup.tsx`; facts are `PlacesSpec`. A new
  reader of someone's places goes through `personPlacesFor` or `orgPlacesFor`. An
  organization's branches are its booking hosts (R92): an item's `placeId` is one of its places
  for customers or everyone (`assertPlacesFit`, `bookablePlaceIds`), the hours' `placeHours` give
  a branch its own days, read only through core `hoursFor` (which `openSlots` calls), and
  `bookingFor` copies the branch's line as `AppointmentBooking.where` into the card's "Where";
  `savePlaces` lets go of any pointer at a place gone or kept for the team. One item is done at
  one branch: the same service at two is two items, each with its own capacity and providers.
  A branch's people are `PlaceHours.staff` (team members only, `assertBranchStaff`; a branch
  may keep people without days of its own), and who may do an item is core `providersFor` (the
  item's people, else its branch's, else anyone): the slots, `pickProvider` and the reassign
  route all ask it, never `item.providers` by hand. Hours that differ by day are edited in one
  place, `features/booking/WeekHours.tsx`, for the host and for a branch. A booking keeps its
  branch as `AppointmentBooking.placeId`; the form asks where first when items are at two or
  more branches, and Bookings filters by it. The Location kit fits every conversation.
- One address is one person (R93, `lib/provisional.ts`): `personForAddress` answers whoever an
  email is (`personByAddress`, else the provisional person made once); inbound mail, a meeting's
  guests and `openMailConversation` (writing to an address from Search or Connect, a message
  request from one's own Caime address) all ask it, never an insert of their own. An address that
  is someone's on Caime is refused as taken, never mailed behind them; `openMailConversation`
  counts every new address against the day before it says anything of it, and its refusal names
  nobody (review §2 H2; what still differs is in SECURITY). Signing up with an address
  that has a provisional person claims it (the same row, its history theirs) only with the code
  sent to that address (review 2026-10-17 §2 H1): `POST /auth/signup` answers 409
  `email_code_needed` and sends it (three an hour to one address), the form shows the code field
  and sends `emailCode`, `spendEmailCode` checks it, and the claim sets `email_verified_at` and
  `claimed_at`; without `ctx.mail` it's 409 `email_unprovable`, never a claim. A new way to become
  a provisional person's account goes through the same proof.
- An organization's AI agent is `lib/agent.ts`: a customer's message reaches it through
  `onCustomerMessage` (registered by `registerAgentJob`, so `lib/business.ts` never imports it),
  which queues the `agent.reply` job three seconds out. The job checks the thread is still its
  to answer, asks `ctx.ai.supportAgent`, and claims the message (`agent_seq`) before posting, so
  it answers once. Its user is kind `agent`: `automated` and `aiAgent` on its messages. Its first
  message in a conversation opens with `introduction` (R87: its name, that it's an AI, the
  organization, the customer's first name), written by the rules in the language the customer
  wrote in (`writtenIn`, else theirs) and flagged `payload.introduction`, and `transcriptFor`
  drops that line so no customer's name reaches the model; anything new where an AI speaks for
  someone to someone else opens the same way (Cai's invitation mail: `caiIntroduction`). The E2E
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
  media that arrives applies what was pressed meanwhile (`asPressed`). Leaving says goodbye on
  each connection (`BYE` on its control channel), stops what it sends at once and closes its
  connections only once the leave has landed (`LEAVE_MS` at most), so the others hear it from the
  server before their connection fails; a goodbye heard lets that device go, never retried
  (closed first, a device still in it restarted ICE against a call that had ended: 409s). A
  signal already on its way when its sender or the one it's for left is late, as one to an ended
  call is: `409 call_ended`; between devices that were never in it, 403.
- A meeting's guests (R83, R84): invited by address from an accepted meeting card held here
  (`features/kits/MeetingGuests.tsx`: Invite a guest, the sheet lazy; the card that moved says
  so and opens the space), or by a link the inviter sends themselves (H6, `inviteGuestByLink`: a
  provisional person of their own at `LINK_GUEST_DOMAIN`, no address, the link shown once; the
  same name asked again in the space gets a new link; nothing mails that domain and
  `personForAddress` answers nobody for it, so a link someone was handed never stands for an
  address's history: anything new that hands out a guest's link keeps to that), they arrive at `/j/<token>` (`features/meetings/JoinMeeting.tsx`, a
  root route outside the groups, open to anyone): the meeting, the name, "I'm 18 or over",
  Join, which signs them in as their provisional self; one who doesn't say it joins (R85 (3)) and
  counts as under 18 from then on in `anyMinor` (`meeting_guests.adult`), so no more guests come
  and no join link opens there. A guest's session never mounts the app
  (`RootStack`: `(app)` is for a signed-in person who isn't provisional); the same address is
  their meeting (`JoinView.space`, only to that guest: when, who, Join the call while it's on,
  else Start), and any other address goes to `(guest)/meeting`, which takes them back to the
  link this device kept (`state/guestLink.ts`, loaded only by those two). The call is drawn by
  the root layout for anyone signed in (`CallLayer`), and a guest's socket opens like anyone's
  (`GET /v1/realtime` is a guest route; their typing is dropped). Anything a guest's page calls
  must be in `GUEST_ROUTES`; the E2E fails on a refused request. A guest keeps the meeting as
  their own account (C3f, `lib/guest-keep.ts`) only through sign-up, the account being the guest's
  own row: by address, as any address is claimed, by its code; by link, with the claim
  `POST /guest/keep` hands their page (sealed with `serverKey('guest.keep')`, thirty minutes,
  spent once the row is a person), which the page keeps beside the guest's link
  (`keepMeeting`) and sign-up reads only on `?keep=1`; onboarding then opens the meeting, since a
  pending `/c/<id>` (`conversationIn`) is a linked arrival. Whatever turns a provisional row into
  an account ends every session it had first (`endSessions`), and an update that finds it
  claimed already makes no session: anything new that does so keeps both.
- Live location: the server sets `live.until` and refuses moves after it (`liveNow` in
  `packages/core/src/location.ts`, no zod, so the app can import it). The app's
  `LiveLocationSharer` (mounted in the signed-in layout) moves this device's shares from
  `state/liveShares.ts` and shows the "Sharing your location live" pill.
- What's connected or listed for someone changes on every device at once (M15): a grant made or
  ended, the calendar feed made or stopped, a listing changed by its developer or reviewed by
  the operator publishes `apps.changed` (to the developer and, for a listing under an
  organization, its owner and admins: `listingWatchers` in `lib/oauth.ts`), and a host's offer
  saved publishes `booking.changed` (`{ orgId }` to the team, `{ orgId: null }` to the person);
  `realtime/apply.ts` invalidates Connected, Developer, Discover, the feed and the listings for
  the one, the offer and the slots for the other. A new thing shown about apps or an offer rides
  those, never an event of its own. The three calendar entrances bridge each other (M17): the
  Actions calendar (`/actions?view=calendar`, which the tab reads) lists each team's Bookings
  and the feed below the days, and the Bookings view (`/o/<handle>/inbox?view=bookings`) opens
  on a link and offers the person's own calendar at its top.
- The icons that point go through `ui/directional` (R73): `Back`, `Chevron`, `Send`, `Reply`,
  `ReplyArrow` (the action), `Forward`, `Panel` (the details pane) and `Leave`, each one lucide
  icon mirrored by the layout's direction; a new pointing icon is added there, never imported
  bare where it's used. Radii come from the tokens (`t.radii.sm`, `md`, `lg`; a screen
  without the theme, the call layer, takes `radii` from `@caime/brand/tokens`), never a number
  of their own; a section's label is `SectionTitle` (`ui/ListRow.tsx`, with `count` and
  `testID`), Attention's included. A security screen (reset, recover, forgot) passes
  `security` to `AuthLayout`, so the brand panel beside it carries no characters (B2).
  `e2e/a11y.spec.ts` runs axe over the phone screens in all four interface languages (Arabic on
  every one), and a new primary screen joins its list.
- What a country sets is one module, `@caime/core/countries` (R76): `countryFacts(code)` gives the
  currency, the calendar's first day (`weekStart`), the weekend, the week worked (the week less
  its weekend, in week order, with `WORKWEEK_OVERRIDES` where a country works otherwise), whether
  the clock counts to 12, the Arabic variety, the ways people are paid there (`PAY_KINDS`,
  brands as `msg` keys) and the age its law asks (`MINIMUM_AGE_BY_LAW`, counsel's: 18 in Egypt and
  Saudi Arabia), which sign-up and a change of country read through `oldEnoughIn` and `tooYoung`
  (`lib/users.ts`) and the privacy page and the terms name. Its data is CLDR's, written by `scripts/geo.mjs` (`countries-data.ts`,
  deviations from the world's defaults only; `currency-data.ts`, the one decimals table
  `minorUnits` reads; `calling-codes.ts` from the ITU list kept in the script; the server's
  `geo-data.ts` with each country's zones): run it again from a fresh `cldr-core` when a source
  changes, never edit the generated files. Nothing else names a country's facts: `defaultWorkweek`
  and `varietyOfCountry` live there, `time.firstWorkday(workweek)` is the first day worked ("next
  week" starts there) and is not the calendar's week start, and `time.weekOrder(weekStart)` is the
  week's days from its first (pure, in `time.ts`: `booking.ts` and the day pickers sit in the
  startup chunk, and the country table must not: 2.5 KB gzip). The server derives `weekStart`,
  `weekend`, `hour12` and `payKinds` onto `MeView` and `OrgSummaryView` (`countryDerived` in
  `lib/users.ts`); an organization's `timeZone` and `workweek` are its own columns (migration
  0068), null for its country's (`defaultZoneOf` from zone.tab's first zone), and a country change
  moves one that was the old country's own. Readers take the facts from the views, never the
  module: the amounts reader settles a shared sign or word by the writer's currency
  (`extractAmounts(text, { currency })`; `analyseText` passes the sender's); a booking host's
  hours start on `host.workweek` in `host.timeZone`; `describeHours(hours, weekStart)` runs the
  days in the host's week; `DayPicker` orders the week by `useUserClock().weekStart` and names
  days with Intl; `useUserClock().locale` carries the country when the locale has no region
  (`withRegion`), so Intl writes the clock and digits as the country does; the agent's and Cai's
  system prompts get `placeLines`; `nextBriefAt` skips days not worked; sign-up's country
  suggestion takes the device's `regionCode` first (`/countries?region=`), and each country in
  that list names its main `zone`, which Language and region offers after a country change.
- Pickers are one family (R77), every one in `ui/` and `pickers.test.ts` fails on a screen's own
  (a `Chip` that selects, a radio, checkbox, tab or switch written by hand, a field's 48-px shell
  drawn again; what a screen may still write is listed there with its reason). `ChoiceChips`
  (`ui/Chip.tsx`) is one choice among up to eight (a radio group; `onClear` where none is a
  choice), or several with `multiple` (a checkbox group; `atLeastOne`), with `count` for a
  filter, `wrap` for a form or a desktop (else the row scrolls sideways), `flush` inside a card,
  `trailing` for a "More…" button, and each chip `${testID}-${value}` unless the option names
  its own; `SpherePicker` is it over the spheres (`plural` for who sees something, `tinted` for
  how someone is known); `DayPicker` is it over a week. `Segmented` switches a view only
  (tabs: the Actions lists, a history's kinds, an insights period), never a form's value, and
  scrolls sideways when its segments don't fit (never shorten its words, never more than a
  screen's worth). A setting in a panel is one `ChoiceSheet` row (the value shown, a sheet of
  radio rows, a finding sheet above fifteen; `shown` and `detail` for what the row says), never
  a list of radios laid out in the panel; a radio list inside a sheet of its own is `ChoiceList`
  (icons, `detail`, the chosen row filled), and a long list is `PickerField` + `SearchSheet`
  (country, time zone, language, year, a catalogue's items above eight, `CurrencyField`'s chip).
  Every field sits in `FieldShell` (`fieldBox` for a pressable, `fieldInputStyle` for a browser
  input, which carries the account's `lang`); a count is a `Stepper` (`-less`, `-more`); a
  switch is `SwitchRow` (`inset` and `divider` in a settings group, `onOpen` when the words open
  the thing); a `ListRow` that's `checked` draws its own mark. Every group is one stop for the
  keyboard: Tab lands on the one chosen (`rovingTabIndex`), the arrows walk the rest and choose
  (`arrowKeyMoves`, Home and End too), on a radio group, a tablist and a swatch row alike. Who a
  rule is for is picked with `features/settings/RuleFor` (reminders under Automations, quiet
  hours under Notifications and priorities: "Add quiet hours" beside "Add a rule"); everything
  about who reaches you, and when, lives on that one screen.
- The phone's bar of places (R72, `features/shell/TabBar.tsx`) is the signed-in layout's, under
  the stack, not the tabs' (they draw none): it stays on every screen opened from a place (a
  person, a space, an organization, settings) with the place someone came from lit, and a tab
  goes to its place's root from anywhere (`dismissAll`, then navigate). It steps aside where
  `phoneBarShown` (`phoneBar.ts`) says (a conversation, a creation flow, onboarding, an app's
  consent, an invite) and, on Android only, while the keyboard is up (`lib/keyboard.ts`): a new
  screen with its own end or a composer at the bottom adds its path to `HIDDEN` with a case in
  `phoneBar.test.ts`. What stands off it reads `usePhoneBar` (`Screen` drops its bottom edge,
  `ScreenToasts` sits above it, `tabBarRoom`). Nothing moves the layout on focus or blur on the
  web: the bar did once, and the press on the button under the field that lost the focus was lost.
- A `Sheet` is a modal: a layer above the app on the web, its own window on phones. Toasts show in
  the topmost open sheet (`ToastHost layer`), since one drawn on the screen beneath it is hidden
  and its Undo can't be pressed. Anything else that must show over a sheet goes inside it (a
  photo opened from a sheet: its own `PhotoViewerHost host="…"` inside it). What a sheet hands on
  to (a picker, the camera, a card's form, another sheet) runs through `afterSheet` (R88): on iOS
  once the sheet has gone, since UIKit presents nothing from a screen still dismissing one,
  elsewhere at once inside the tap (a browser opens a file chooser only for a tap); such a sheet
  closes by `open` turning false, never by unmounting, or it never says it has gone
  (`MessageActions` keeps its last message while it closes). Toasts
  sit at the bottom, where a thumb reaches Undo: the screen's host is `ScreenToasts`, which
  stands them off the phone's bar (`tabBarRoom` while it's shown); nothing draws a toast at the
  top.
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
  of these, never `me.role` by hand; outside core a role is compared only to label it. Anyone
  comes into a group only through `addToGroup` (`lib/group-members.ts`: the members route and a
  join link), which mirrors its topics and tells them (`tellTopics`). The app's panel is
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
  and `features/push/push.web.ts`. Every push shows something in Safari (it takes pushes away
  from a site whose pushes show nothing), briefly and silently while Caime is in front; other
  browsers show nothing then. A push that replaces one that's over (a ring answered) is sent with
  `replaceShown` (`quiet`), never as a push that shows nothing. The worker opens a tapped one by
  messaging the open tab (`caime.open`), never by reloading it: a call may be on. Anything new
  pushed with a `data` field it can open belongs in `pathOf` there and in its phone twin,
  `notificationPath` (`sw.test.ts` holds them to the same answers). Turn off is remembered in the
  browser (`caime.push-off`); sign-out drops the subscription and closes what's shown. An
  iPhone's or iPad's tab has no push at all (Safari pushes only to the Home Screen): Attention
  tells it how (`HomeScreenCard`, loaded only on an Apple device's tab without `PushManager`,
  drawn by `homeScreenHint`), never a prompt that can't work. Phones
  (`features/push/push.native.ts`, the same shape; `support.native.ts`) register an Expo token
  after the phone's own permission, make Android's two channels first (core `PUSH_CHANNELS`, which
  the server names on each push), show nothing while Caime is in front, clear a read one, and
  each time Caime comes to the front clear what's over (`watchShown`: one
  `POST /notifications/shown` for the set, a shown body that no longer matches is cleared);
  Expo Go on Android offers none (`isRunningInExpoGo`). The server's side is `lib/expo-push.ts`:
  one deadline, a sound and the alerting channel unless the level is activity, each ticket read
  (`DeviceNotRegistered` drops the token), never a `quiet` replacement (Expo can't swap what a
  phone shows), `EXPO_PUSH_URL` only for the tests' stand-in.
- Plans: what each includes is in `packages/core/src/plans.ts`, and it's checked only in
  `apps/server/src/lib/plans.ts`, where something is added. Never count the wedge (R23). Pro
  sells its depth (R47): relationship insights (`lib/insights.ts` `personInsights`, the
  viewer's own one-to-ones only, names through `personViewsFor`) and automations by plan
  (`assertAutomationRoom`, under the person's lock, `AUTOMATIONS_MAX` the ceiling). A test
  that needs a bigger team or more apps puts its organization on Business in its setup;
  `plans.test.ts` is where limits are tested.
- Caime Mail (R75): a handle is an address at `MAIL_DOMAIN` once `MAIL_PROVIDER` is set
  (`mailOn`, `mailAddressOf` in `lib/mail-address.ts`; on `MeView` for adults, on `OrgView` for
  the team). The provider is one interface (`lib/mail-provider.ts`: `inbound`, `send`, `events`;
  Postmark first, named in `MAIL_PROVIDER_NAMES` for the processors list), reached through
  `POST /v1/mail/in/:provider` and `/events/:provider` (`modules/mail.ts`, the secret compared
  in constant time). The rules are `lib/mail-in.ts` (`receiveMail`: the sender by the
  authenticated From alone, `senderVerified` over what `authenticateMail` (`lib/mail-auth.ts`,
  mailauth pinned, imported by its DKIM, SPF and DMARC files alone: its root loads BIMI, whose
  undici replaces the dispatcher every `fetch` in the server uses, and a test holds that) checks in the provider's raw message itself: DKIM through `ctx.dns`, SPF only
  for the address in the top `Received` lines a host of the provider's `receivingHosts` wrote
  (past its own private hops), DMARC; never
  a header the payload carries, and no raw message vouches for nothing. Tests sign real mail
  with `test/mail-fixtures.ts` (`rawMail`, `mailDns`; the E2E publishes `DKIM_TXT`); the staff
  addresses (`STAFF_ADDRESSES`, each reserved) land at `MAIL_STAFF_HANDLE`; a provisional person is `users.kind =
  'provisional'` with a `mail:<id>` handle, found by nobody since every lookup of people takes
  `kind = 'human'`, and claimed by signing up with the address; a stranger's mail is a request
  that keeps coming, held; threads are topics by References, else by `bareSubject`; attachments
  go through `storeBytes` in `lib/files.ts`, where the upload routes' finaliser lives too) and
  `lib/mail-out.ts` (`queueMailOut` from `effectsOf`: a person's words and files to each
  provisional member, and in a customer thread the agent's and apps' words too, as the
  organization's (`speaksForOrg`; `mail-agent.test.ts`); a notice, core `isNoticeMail` on the
  mail's own list, precedence and auto-submitted headers or a no-reply sender, lands through
  `noticeFor` in one muted conversation per sender (`conversations.notice`, the inbox's
  `notices` section) whose effects are skipped and which `sendMessage` closes to anything but
  its own mail (`notice_only`), and only a conversation that starts as a notice is one, the `mail.send` job from the person's or the organization's address in
  the thread, `sent` then `delivered` or `bounced` by `applyMailEvents`; `mail.sweep` daily). A
  message that came or went as mail has `messages.channel = 'mail'` and a `mail_messages` row
  (`MessageView.mail`); erasure clears its subject, sender address, HTML and signature. A mail
  in's words go through core `mailText` (emphasis marks out, the signature apart into
  `mail_messages.signature`); a mail out is seen when they reply (`seenByReply`) or follow its
  "Open in Caime" link (`seenByLink`), and opened only by the provider's pixel where its sender
  left `preferences.mailOpens` on (`track_opens`, disclosed at the mail's end): the app says
  "Seen" or "Opened, probably", never read. A mail's HTML
  (`mail_messages.html`) is never selected with a view (`hasHtml` says it's there) and is served
  only by `GET /messages/:id/mail.html` under a CSP `sandbox` that loads nothing but `data:`. A provisional sender is
  a person where a bot isn't (a thread's moves, the `automated` flag) and is never notified
  (reached by mail instead). A customer's thread starts through `startCustomerConversation`
  (`lib/business-threads.ts`), for the route and for mail alike. A subject's rules are core's
  `mail.ts` (`bareSubject`, `subjectFromText`), read by the server and by the composer: in a
  one-to-one with someone reached by mail (`mailBound` in `features/conversation/topics.ts`,
  where `topicsFor` lives too) the general conversation's composer shows the subject a mail from
  here carries (`composer-subject`: `ConversationView.mailSubject`, the thread's as an answer,
  `replySubject`, else the first line) and a subject written over it starts the topic it names
  through `endpoints.startTopic` before sending there; a reply, and a topic, carry the
  thread's. The E2E provider stand-in is `e2e/mail-stub.mjs` (`MAIL_STUB`, port 8798; the DNS
  stub's control port is 8797), and `e2e/mail.spec.ts` posts its webhooks.
- Mail (R48) goes out only through `ctx.mail` (`lib/email.ts`, null without `SMTP_URL`, so a
  route that needs it throws `mailUnavailable()`), after the response with `ctx.defer`, never
  through the job queue with a secret in it (a reset link is one): a job that mails later (a
  booking's reminder) carries ids alone and reads the rest when it runs. Texts stay ASCII so they travel as plain
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
- An environment is checked before it's deployed with `pnpm --filter @caime/server check-env
  <file>` (`src/check-env.ts`: the server's own `loadConfig`, names only, duplicates said): a
  container with an invalid configuration exits at start while EasyPanel still reports the
  deployment done and the old container answers. After a deployment, verify a page the release
  changed, never the host's status alone.
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
  whoever sent what it newly covers and the reader's own devices, never a whole group; someone
  withheld hears nothing at a read's moment (an event only for what newly arrived), and a
  request pending or declined tells its sender nothing: no receipt (only the reader's own
  devices hear), no position in `conversationView`, no event when it's declined (M16 B1). A view
  that lists a conversation's people takes them from `personViewsFor`. `createTestApp` counts
  the server's queries (`t.queries()`): a scale test says what a path costs, with a ceiling.
- A person or an organization is read with `.select(USER_COLUMNS)` or `.select(ORG_COLUMNS)`
  (`db/schema.ts`; `UserRow`, `OrgRow`), never `selectAll()`, which carried the five catalog
  jsonb columns (`CATALOG_COLUMNS`) with every presence change, sender and person in a view:
  `columns.test.ts` holds the lists to the tables and allows `selectAll()` only where the
  catalog is the point (the public pages, an export, the organization's own view and summary, a
  profile, an item's photo). When a card is for is `messages.card_start_at` (migration 0066 and
  0067, `cardStartAt` in `lib/kits.ts`, written on send; a test that inserts a card by hand
  writes it too): a meeting's or an appointment's start, a Pay card's or an invoice's due day
  (M14, midnight UTC of the date). The calendar, the slots, the briefs and search read cards by
  it, never `payload->'fields'->'start'`; `lib/upcoming.ts` is the one reader of a person's
  cards (`visibleCards`: `cardsAhead` for what's planned, `dueCards` for what's owed, the same
  visibility and the team member's "theirs to do"), and `calendarItems`, the ICS and Cai's
  coming-up list all take both, so a new dated card joins there once. A card that asks (core
  `ASKING_STATES`, `cardAsks` in `kit-states.ts`: a proposal, a request, an invoice sent, an order
  placed) is `is_request` on send and `afterCardMove` clears or sets it with each move, so the
  inbox says "Asked you to do something" until the move that answers it. A booking from the catalog is checked once before the
  transaction (fast refusals) and again inside it under `pg_advisory_xact_lock` on the host
  (`slotAsk` in `sendMessage`): two bookings of the last place at once leave one refused.
- A route module imports no other module and `lib/` never imports a module (`modules.test.ts`
  fails on either): what two modules share lives in `lib/` (`lib/tasks.ts` `taskViews`,
  `lib/relationships.ts` `createRelationship` and `mayClassify`, `lib/space-members.ts`
  `addToSpace`, `removeFromSpace`, `orgSpaceViews` and `summaries`, `lib/connections.ts`
  `acceptRequest`, `lib/suggest.ts` `suggestionView`). A value kept for a while is a
  `TtlCache` (`lib/ttl-cache.ts`: a ceiling, a lifetime, the oldest out first), never a `Map`
  of its own: the business masks, the readers' languages, the relay credentials, a brief's
  summaries and the sitemap (`lib/sitemap-cache.ts`, ten minutes, forgotten by an offer saved,
  a domain verified or let go and an organization closed; a test that changes those past the
  routes calls `forgetSitemaps()`). Two things three modules each wrote their own of are
  `lib/text.ts` (`clip`, `escapeLike`), and a card's agreed state is core's `AGREED_STATES`.
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
  listening connection), sent for any job due within the longest rest (`IDLE_MAX_MS`), so
  Cai's reply 800 ms out runs then, not at the next look; it never polls by the second.
  `runDueJobs` runs `CONCURRENCY` slots over a queue that a slot refills when it runs dry
  (one claim at a time, `BATCHES_PER_RUN` at most before the periodic tasks get their turn):
  a slow webhook holds its slot alone. A periodic task's `everyMs` is the idle floor, so
  nothing new sweeps more often than it must. The morning brief is queued at the person's hour
  plus their own place in the five minutes after it (`briefJitterMs`), the same every day.
- Renditions (R70): `lib/renditions.ts` makes an image's thumbnail and preview at upload
  (`makeRenditions`; a picture no bigger than the thumbnail is its own preview), and the
  `files.previews` job gives older images theirs a batch at a time, through a `tmp/` copy, queued
  once at start when any is missing (`files_preview_missing`, a partial index). `/files/:id/preview`
  and an item's photo route send the preview, else the cleaned original. A new rendition joins
  `RENDITION_EDGES` in core and the backfill.
- A photo in a message, an album, the shared panel or Saved opens with `showPhotos(files, i,
  host)` (`features/media/viewer.ts`; the viewer loads on first use), only what `drawable` says a
  screen can draw (renditions, or a kind every browser draws: a HEIC that stayed one is a file);
  any other file opens with `openFile` (`lib/openFile.ts`: on a phone fetched with the session
  into the cache, once, and handed to the system's sheet; a tab on the web), never `openLink` on a
  `/v1/` address, which a phone's browser opens without a session (R88). A long press on anything
  pressable inside a bubble passes the bubble's (`onHold`), so a phone reaches the actions.
- A picked photo goes through `photoToUpload` (`lib/photos.ts`, `photos.web.ts`) before
  `uploadFile`: shrunk on the device to `PHOTO_MAX_EDGE` (`lib/photoSize.ts`, pure and
  tested), or `AVATAR_MAX_EDGE` for a face or a logo; videos and GIFs go as they are, a HEIC
  becomes a JPEG where the device reads one (`needsJpeg`; an iPhone's picker hands over JPEG,
  `Compatible`), and a shrink that fails sends the original. A HEIC that reaches the server has
  its Exif and XMP items zeroed in place (`stripHeifDetails`, `lib/heif.ts`: the server reads no
  HEVC; an unreadable container is refused), so no photo keeps where it was taken. The shrinking itself (`photoShrink.ts`,
  `photoShrink.web.ts`) loads when there's a photo to shrink; the picker stays static, since a
  browser opens a file chooser only inside the tap. The server's own cap and metadata strip stay.
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
- French and Turkish are read by their own modules (`intelligence-fr.ts`, `intelligence-tr.ts`,
  their dates in `when.ts`) for a sentence `latinLanguage` (`latin-language.ts`) says is theirs;
  anything unclear is read as English. A new phrase joins its language's list with a golden line
  and the near-miss it must not catch. Amounts are `amounts.ts` (re-exported by `intelligence.ts`).
  The app reads typed dates and amounts only through `lib/useReaders` (`readers.test.ts` fails on
  a static import): imported by two routes they sat in `__common`, and every language's dates
  took the startup chunk 2.9 KB over budget.
- On a phone, the realtime socket rests 30 s after the app goes to the background (`rest()` in
  `realtime/client.ts`) and comes back with a catch-up on `active`; a call or a live location
  share keeps it. Anything new that must hear the socket while the app is put away adds its
  check there, or arrives by push instead. A socket that hasn't said hello within `HELLO_MS`
  is given up and tried again (a network can take the upgrade and hold it), and after
  `DELAYED_AFTER_TRIES` tries without one the client catches up over HTTP every 20 to 60 s
  while the app is in front (`catchUpMeanwhile`, state `delayed`, said by `ConnectionBanner`),
  until a hello stops it: nothing new polls beside it.
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
- What the first screen never needs loads apart, each by its one dynamic import, and
  `panes.test.ts` fails on a static import of it: the live events' applier (`realtime/apply.ts`,
  imported by `realtime/client.ts` as it runs; `leftConversation` is reached through the
  client), the keyboard shortcuts (the signed-in layout; their sheet's store is
  `shortcutsSheet.ts`), the You sheet's body (`YouSheetBody.tsx`; its store `youSheet.ts`) and
  an organization's details editor (`OrgDetails`, from `OrgScreen`), and two parts several
  screens render but none at first, each `lazyPart`ed wherever it's shown (`LAZY_EVERYWHERE` in
  that test): `PeoplePicker` (its Set toggle is `lib/toggled.ts`, so a screen that only toggles
  imports nothing of the picker) and `TimeZoneField`. A new thing shared by several routes but
  needed by none at first joins that list rather than the startup chunk.
- A module leaves the startup chunk only when every import of it is dynamic. Splitting a part
  out of a route's own chunk (a sheet inside the conversation screen) makes it worse: whatever
  it shares with that route moves into `__common`, which loads first (it cost 4.5 KB once). The
  desktop panes and the tabs that show them take them lazily from `features/shell/panes.ts`, so
  none is in the first download (Chats too since R88: a visit starts on Attention) (`panes.test.ts` fails on a static import of one). Measure with
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
  `upsertMessage` is for `message.created` and the app's own answers to a change it made; the
  answer to a send is `addSentMessage`: the echo and whatever happened to the message since (its
  words heard) come through the socket, and the answer, written before them and read after them
  under load, adds the message where the socket hasn't and never replaces what it brought.
- A chat brought over from WhatsApp (R45) is read on the device by `@caime/core/whatsapp`
  (pure: no zod, so the app takes it by subpath; every export shape gets a case in
  `whatsapp.test.ts`) and lands through `POST /conversations/import` (`modules/imports.ts`),
  which inserts rows itself, past `sendMessage`, so nothing is notified, suggested or moved by
  the past: every imported message carries `payload.imported = {source, by}`, and anything that
  reads message bodies for meaning (effects, AI, attention) may leave those alone. The app shows
  "Imported ·" from that field and offers the sheet (`features/import/`, imported statically by
  the conversation route: split out, it cost 0.8 KB of `__common`) only where topics are. A
  group's export (M16 C3g) lands through `POST /conversations/:id/import` in a group its owner or
  an admin runs (never private, a topic or a space's): each name is one of its people now, or the
  importer's line with `payload.imported.author`, which `rows.ts` (`importedAuthor`) draws and
  reads out as that name's, never as theirs. A topic made for an import is
  `createTopicConversation(…, { forImport: true })`: always new (a group's topic of the same name
  is refused, never reused) and without its opening line; `land` writes after the topic's
  `last_seq` under its row lock. An iPhone's `.zip` is unzipped on the device by `chatFile.ts`
  (fflate, pinned, loaded only for a zip, the text alone inflated), and iOS's own lines (a mark
  after the name's colon) are WhatsApp's, never a message.
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
  `splitPeriod` and filtered on the server, never read as a person; a bare month is the nearest
  one, `nearestYearOf`: "November" in September is the one ahead, since a card is found by when
  it's for; a year is 1900 to 2099, any other four digits a number to find) and, only when they
  understood nothing of a query that `looksLikeSentence` and the app said the typing is done
  (`understand=1`: a second's pause or Enter in `search.tsx`; the rules answer every keystroke
  without it), asks the model to fill the same
  structure (`understandWithAi` in `modules/search.ts`, `ai.understandSearch`), for a person with
  AI assist on and allowance left; `fromUnderstanding` (core) checks every value the model
  returns against the taxonomy and the lists, the reading is kept ten minutes per person and
  query, and any failure falls back to the rules without an error. The response says who read it
  (`understoodBy`, `label`). Ask Cai in Search is `POST /search/answer` (`answerFromSearch`):
  the same reading, `runSearch`'s own rows (so whatever search leaves out, the model never
  sees), numbered passages to `ai.answerFromFound`, the cited rows back as `sources`; no rows,
  no model. Who may use AI assist is `aiGate` (`lib/ai-gate.ts`), for every route that asks a
  model for a person. Every model call anywhere goes through `runAi` (`lib/ai-run.ts`),
  which records the `ai_runs` row and the metrics: a new AI feature uses it, never its own
  bookkeeping. A new field the model may fill joins `SearchUnderstanding`, `fromUnderstanding`'s
  checks, the prompt in `lib/ai.ts` and both stand-ins (`test/ai.test.ts` queues a reply;
  `e2e/anthropic-stub.mjs` answers the "search someone typed" prompt from the words).
  Words are matched against `messages.search_all` (migration 0065: the body with a card's
  title, reference, summary and what was booked, the joiners the parser keeps inside a token
  cut to spaces, so "INV-7731" and "7731" both find the invoice; `prefixQuery` splits what's
  typed the same way), a period matches when a message was written or, for a card, when it's
  for (`CARD_START`), a card's snippet is its title and reference, and an organization is found
  through the business threads the searcher writes in (`handle`, `conversationId`; the app
  opens the conversation). A new thing a card says of itself joins the index's expression.
  The rules read every interface language: `RULES` and `PERIOD_RULES` in `search.ts` hold each
  language's shapes (written for Arabic as it's folded: `tolerant` accepts any alef, "ى" or "ة"),
  a relationship word matches its label in the reader's language too (`relationshipFromWord`:
  "عملائي", "mes clients", "müşterilerim"), and every interpretation is a key through `tr`. A new
  shape gets its line in each language, with cases in `search-languages.test.ts`.
- What Cai does unasked (R66) is `preferences.caiInitiative` (core `initiative.ts`: `less`,
  `usual` by default, `more`), read through `initiativeOf`: `createSuggestion` (and the bulk
  place offers) offers a suggestion only when `offersSuggestion` allows (pass `asked: true` for
  one the person asked for), the Attention ask waits `quietWaitAfterMs`, and the meeting brief's
  notice needs `tellsBeforeMeetings`. Anything new Cai does without being asked reads it there,
  and nothing the person asked for does.
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
conventions 1–17 and the product review. Verify every number and every "verified" claim against
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
It runs on EasyPanel at https://cai.me (the old address, https://caime.datac.com, kept on the
service for webhooks and feeds, and its default domain, https://caishy-caishy.0hqwb7.easypanel.host;
`docs/DEPLOY.md`, "Going live on cai.me"), billing included, on the live
Stripe account (tell its owner before changing anything there: it's live), and mail through
Postmark both ways (codes, resets and invitations by SMTP; Caime Mail's addresses received and
answered). Caime has not
launched: that instance is the owner's own, with no public users yet, so a release is judged by
the code's rules (CI green, migrations expand first), never by a launch's stakes; sessions in this
environment have `EASYPANEL_URL` and `EASYPANEL_API_TOKEN` (never print them). Calls go through Cloudflare's TURN relay when they can't connect directly
(`CLOUDFLARE_TURN_*`, set in EasyPanel). Remaining: trying calls and private conversations on a phone (a development build: Expo Go
has no WebRTC), ringing a closed app (VoIP push), a third-party penetration test, and store builds. Production is only what passed CI: a green run
on `main` fast-forwards `production`, which EasyPanel builds from (`docs/DEPLOY.md`).
