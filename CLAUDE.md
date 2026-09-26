# Caishy — operating manual

Caishy (formerly CONNIQT) is a relationship-aware communication platform for iOS, Android and Web:
**messaging that understands your relationships.** The primary domain object is the
**connection** between two people, not the chat. This file is how any session picks up the work
without re-deriving decisions.

## Start of every session

1. Read `docs/ROADMAP.md` (what is done, in progress, blocked) and `docs/GOAL.md` (the target).
2. Skim `docs/PRODUCT-REVIEW.md` (refinements R1–R33 override the PRD) and `docs/ARCHITECTURE.md`
   (ADRs). Open `docs/PRD.md` (cited as `PRD §n`) and `docs/BRAND.md` when a task touches them.
3. Run `pnpm install` then `pnpm check`. If anything is red, fixing it comes first.
4. Check the latest CI run on GitHub (`h-khalid-h/Caishy`, workflow `CI`). A red `main` is work now.
5. At the end of a work block: update `docs/ROADMAP.md` (tick only what is verified, add a log
   line), update this file if a convention or command changed, commit and push to `main`.

## Layout

| Path | What |
| --- | --- |
| `packages/core` | Pure TypeScript shared by server and app: the API contract (`api.ts`), taxonomy, field rules, zod schemas, attention and policy engines, message intelligence, privacy, search parser, Connect Kits, formatting, safe locales. No platform APIs. |
| `packages/brand` | Tokens (contrast-tested), the wordmark, the seven characters as SVG builders, and `pnpm --filter @caishy/brand assets` to regenerate every icon, splash and favicon. |
| `apps/server` | Fastify 5 API (`/v1`), WebSocket realtime, Postgres (Kysely + SQL migrations), jobs, push, files; serves the exported web app from `WEB_DIR`. |
| `apps/app` | Expo SDK 57 universal app (Expo Router; routes in `src/app/`, screens in `src/features/`, primitives in `src/ui/`). iOS, Android and Web. |
| `e2e/` | Playwright tests against the production bundle (`playwright.config.ts` at the root). |
| `scripts/` | `bundle-budget.mjs` (the web JS budget). |
| `docs/` | PRD, product review, brand, competitive strategy, architecture, roadmap, goal, deploy. |

## Commands

```sh
pnpm install                 # once; hoisted node_modules (ADR-1)
pnpm check                   # lint + typecheck + all tests: run before every commit
pnpm test                    # all packages, app logic included (server tests need Postgres: TEST_DATABASE_URL,
                             #   default postgres://caishy:caishy-dev@127.0.0.1:5432/postgres)
pnpm dev:server              # API on :8787 (DATABASE_URL; see apps/server/.env.example)
pnpm dev:app                 # Expo dev server; press w for web (talks to :8787)
pnpm build                   # web export (apps/app/dist) + server bundle (apps/server/dist)
pnpm budget                  # initial web JS, gzip, must stay under 450 KB
pnpm e2e                     # Playwright against the bundle; set E2E_DATABASE_URL
                             #   (default .../caishy_e2e, create it first)
pnpm start                   # run the bundled server (what the Docker image runs)
docker build -t caishy .     # the production image (docs/DEPLOY.md)
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
    (`@caishy/core/format`), never the package root (it would pull in zod), and icons one file
    each through `src/ui/icons.ts`. `pnpm budget` fails CI above 450 KB.
11. **Nothing trusts device input.** Locales go through `safeLocale`, time zones fall back to UTC,
    and formatting never throws: a bad value from one device must not break a screen.
12. **Say what was not done.** ROADMAP ticks mean verified end to end. Anything needing external
    credentials is marked ⛔ with what is needed, never claimed done (R25).
13. **Run the claim.** A number in a doc or commit (contrast, latency, bundle size) is produced by
    running something, not estimated.

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
- Handles have dots, so a page path can look like a file (`/o/nile.dental`). The server serves
  the app to anything that asks for HTML (`plugins/static.ts`); test new link shapes with a
  reload, not only by navigating inside the app.
- DNS in server tests: set `t.ctx.dns` to a stub resolver (see `orgs.test.ts`).
- Links to Caishy are built from `WEB_URL` (`lib/config.ts`), never a hardcoded domain. A path
  from outside the app goes through `appPath` (`lib/paths.ts`) before anything navigates to it.
- Business conversations (R15): anything a customer is sent about one goes through the mask in
  `apps/server/src/lib/business.ts`. New endpoints that return user ids or names for a
  conversation must apply `maskFor`; `business.test.ts` checks the customer's responses for
  any team id or name, so extend it with the new endpoint.
- Watch the web budget when a screen is used by a second route: shared modules move into the
  startup chunk. Open it through its own route instead (the desktop Business inbox is a list
  pane beside `/c/[id]`, not a screen that embeds the conversation).

## Credentials and environment

Nothing secret is committed. The server reads configuration from environment variables
(`apps/server/.env.example`, `docs/DEPLOY.md`). Deployment automation needs `EASYPANEL_URL` and
`EASYPANEL_API_TOKEN` in the cloud environment settings, never pasted into chat; CI redeploys
through the `EASYPANEL_DEPLOY_WEBHOOK` repository secret. Optional integrations turn on when their
variables exist: `ANTHROPIC_API_KEY` (AI assist, Claude through `@anthropic-ai/sdk` with
server-side refusal fallbacks), `EXPO_ACCESS_TOKEN` (mobile push).

## Current state

See `docs/ROADMAP.md`. In one line: core, server, the universal app (web verified end to end,
native bundles export), Connect Kits, AI assist, Spaces, Organizations with DNS verification,
the Business inbox, share links, your-data controls, the image and CI are built and verified.
Remaining: the platform API, metrics and plan entitlements, store builds, and the EasyPanel
deploy (⛔ needs EasyPanel access, `docs/DEPLOY.md`).
