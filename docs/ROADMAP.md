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
- [x] Message requests from non-connections (R14)

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
      verified in screenshots. [~] Minimal intensity implemented, not yet reviewed on screen
- [x] Auth and onboarding: sign-up with live handle checks, sign-in, recovery codes, relationship
      defaults, find people (E2E)
- [x] Attention inbox, conversation, composer, inline suggestions, typing, presence, reciprocal
      read ticks (E2E, phone and desktop)
- [x] Connect flow in ≤ 3 taps (sphere, role, done), accept with a label, People (E2E)
- [x] Person profile, relationship change and its history, one line per change (E2E)
- [x] Search: finds a message and opens its conversation scrolled to it, marked (E2E)
- [x] Settings: every page opens; the theme follows the account to a fresh device (E2E);
      download your data and delete your account (E2E)
- [x] Actions: add one in words ("by Friday" becomes its due date), finish it, undo; a request
      from someone lands in Asked me (E2E)
- [x] Alerts: requests and message bursts arrive, each with why it was held or sent (E2E)
- [ ] Spaces
- [x] Desktop web: rail, list, detail and context panel (E2E screenshots); keyboard shortcuts:
      Ctrl/⌘ K search, Alt ↑/↓ between conversations, ↑ edits your last message, ? lists them
      (E2E)
- [x] Realtime client with reconnect and catch-up; on-device cache with revalidation; offline
      outbox: a message written offline sends the moment the network returns (E2E)
- [x] Stickers (Caishy Friends, 16): sent, and arrive live (E2E)
- [~] Native: iOS and Android bundles export (Hermes); not yet run on a device or simulator

## M6 — Expansion

- [~] Files, images (metadata stripped, thumbnails), resumable uploads, ranges done; voice notes
      store and play; transcription ⛔ needs a speech-to-text provider
- [ ] Organizations and DNS verification; Business inbox; org accounts
- [ ] Spaces
- [x] Connect Kits as cards: approval, meeting, review, order, delivery, invoice, purchase
      order, payment request, support ticket, appointment, and polls; offered only where they fit
      the relationship, moved by the right person, live (`kits.test.ts`, E2E). [ ] Location,
      shared album and checklist kits
- [ ] AI assist with Anthropic provider and heuristic fallback
- [x] Export and account deletion (`account.test.ts`, E2E); others keep their conversations,
      shared files and the actions they were waiting on
- [~] Retention: per-conversation message retention in the API and a worker; no setting in the
      app yet
- [x] Block, report, rate limits, link safety
- [ ] API tokens, webhooks, bots and agents
- [ ] Metrics and plan entitlements
- [ ] Calls (WebRTC 1:1 on web) ⛔ TURN relay needed for reliable production calls

## M7 — Ship

- [x] One image (API, realtime, web): built, pushed to `ghcr.io/h-khalid-h/caishy` and
      smoke-tested by CI on every push to `main` (readiness, the page, security headers)
- [x] CI: lint, typecheck, tests on Postgres 16, build, web budget (414.4 KB gzip against 450 KB),
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
  verb and only a number is no longer a request. Tests: 124 core, 49 brand, 84 server, 11 E2E.
