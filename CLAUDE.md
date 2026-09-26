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
4. At the end of a work block: update `docs/ROADMAP.md` (tick only what is verified, add a log
   line), update this file if a convention or command changed, commit and push.

## Layout

| Path | What |
| --- | --- |
| `packages/core` | Pure TypeScript shared by server and app: taxonomy, zod schemas, attention engine, policy engine, message intelligence, privacy evaluator, search parser, Connect Kits, formatting. No platform APIs. |
| `apps/server` | Fastify 5 API (`/v1`), WebSocket realtime, Postgres (Kysely + SQL migrations), jobs, push, files, AI provider; serves the exported web app. |
| `apps/app` | Expo SDK 57 universal app (Expo Router, routes in `src/app/`). iOS, Android and Web. Has its own `CLAUDE.md` with Expo rules. |
| `deploy/` | EasyPanel deployment script and notes. |
| `docs/` | PRD, product review, brand, competitive strategy, architecture, roadmap, goal. |

## Commands

```sh
pnpm install                 # once; hoisted node_modules (ADR-1)
pnpm check                   # lint + typecheck + all tests — run before every commit
pnpm test                    # all packages
pnpm --filter @caishy/core test
pnpm --filter @caishy/server test    # starts a throwaway Postgres cluster (needs initdb on PATH or PG_BIN)
pnpm dev:server              # API on :8787 (needs DATABASE_URL; see apps/server/.env.example)
pnpm dev:app                 # Expo dev server; press w for web
pnpm build                   # web export + server bundle (what the Docker image runs)
```

## Conventions

These are rules, not preferences.

1. **Connection first.** New features attach to a relationship or a conversation context
   (PRODUCT-REVIEW R19). No global feature menus.
2. **Relationships are private.** Never serialize a relationship to anyone but its owner unless
   `shared` is true. Privacy of profile fields goes through the core privacy evaluator (ADR-10).
3. **Inference is a suggestion.** Anything inferred is stored as a suggestion with a rationale
   and becomes a fact only on explicit accept (R12). No silent writes by heuristics or models.
4. **Shared logic lives in core.** If client and server both need a rule (attention, policy,
   intelligence, privacy, search parsing), it goes in `packages/core` with unit tests.
5. **Writes are idempotent.** Retried client writes carry `clientId` (ADR-8); messages are ordered
   by `seq` (ADR-9).
6. **Migrations are append-only** once pushed. Never edit a committed migration; add a new one.
7. **Never assume gender or age.** Copy uses names, not pronouns; gender is never inferred (R27).
   Under-18 protections are rules in code, with tests (R29).
8. **Brand on two intensities.** Characters only in expressive moments, never on business,
   security or money surfaces (BRAND.md B2). Colours come from tokens that were contrast-checked;
   don't introduce raw hex values in components.
9. **Say what was not done.** ROADMAP ticks mean verified end to end. Anything needing external
   credentials is marked ⛔ with what is needed, never claimed done (R25).
10. **Run the claim.** A number in a doc (contrast, latency, bundle size) is produced by running
    something, not estimated.

## Credentials and environment

Nothing secret is committed. The server reads configuration from environment variables
(`apps/server/.env.example` lists them all). Deployment needs `EASYPANEL_URL` and
`EASYPANEL_API_TOKEN` set in the cloud environment settings, never pasted into chat. Optional
integrations turn on when their variables exist: `ANTHROPIC_API_KEY` (AI assist), SMTP settings
(email), S3 settings (object storage), Expo access token (mobile push).

## Current state

See `docs/ROADMAP.md`. In one line: docs and brand system are written; the code is being built
milestone by milestone, M0 → M7.
