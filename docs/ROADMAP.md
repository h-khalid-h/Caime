# Roadmap and status

The live status of the build. Update this file at the end of every work block: tick what is
done **and verified**, add what was discovered, and keep "Blocked" honest. A box is ticked only
when the thing works end to end and has a test; partial work stays unticked with a note.

Legend: `[x]` done and verified · `[~]` in progress or partial (note says what is missing) ·
`[ ]` not started · `⛔` blocked on something outside the repository.

## M0 — Foundation

- [ ] Monorepo (pnpm, hoisted), TypeScript, Biome, shared configs
- [x] Docs: PRD, product review, brand, competitive strategy, architecture, roadmap, goal
- [ ] CLAUDE.md operating manual
- [ ] GitHub repository `h-khalid-h/caishy` ⛔ the GitHub integration cannot create repositories;
      the owner creates an empty repo and grants the Claude GitHub App access

## M1 — Core domain (`packages/core`)

- [ ] Sphere and role taxonomy (inclusive, R28), complementary roles (PRD §53)
- [ ] Zod schemas for every API payload
- [ ] Attention engine (PRD §19–20, R7–R8)
- [ ] Relationship policy engine: notifications, attention, privacy, workweek (R9–R11, R31)
- [ ] Message intelligence: questions, requests, commitments, decisions, dates, amounts, links
      (PRD §23, R12)
- [ ] Search query parser (PRD §25)
- [ ] Privacy evaluator (PRD §34, §62)
- [ ] Connect Kits registry (PRD §41, R19)
- [ ] Formatting and ids

## M2 — Server foundation

- [ ] Config, logging, errors, health, migrations under advisory lock
- [ ] Auth: sign-up, sign-in, sessions (cookie + bearer), CSRF header, recovery codes, age gate
- [ ] Profiles and identities, people search with privacy and age rules
- [ ] Connections, requests with context, relationships (versioned, private, shared), history
- [ ] Suggestions (relationship signals), custom roles, policies

## M3 — Messaging

- [ ] Direct, group, topic conversations; participants; drafts
- [ ] Messages: ordered, idempotent; replies, reactions, edit, delete; read state
- [ ] Realtime hub (WebSocket + pg NOTIFY), typing, presence
- [ ] Attention inbox API
- [ ] Message requests from non-connections (R14)

## M4 — Memory, action, notification

- [ ] Tasks, waiting, requests, reminders (R13); decisions; contexts
- [ ] Suggestions from message intelligence
- [ ] Conversation memory and asset index
- [ ] Search across people, relationships, orgs, messages, assets, actions, contexts
- [ ] Notifications: levels, burst consolidation, schedules; Web Push; Expo push ⛔ needs EAS
      credentials for production builds
- [ ] Jobs: reminders, digests, retention

## M5 — App (iOS, Android, Web)

- [ ] Design system from `BRAND.md`, light and dark, Playful and Minimal
- [ ] Auth and onboarding (relationship defaults in one tap)
- [ ] Chats (Attention), conversation, composer, suggestions inline
- [ ] Connect flow (≤ 3 taps), relationship profile, People
- [ ] Actions, Search, Spaces, You/Settings
- [ ] Desktop web three-column layout with collapsible context panel, keyboard shortcuts
- [ ] Offline outbox and cache; realtime client
- [ ] Stickers (Caishy Friends)

## M6 — Expansion

- [ ] Files, images, resumable uploads, voice notes (transcription ⛔ needs a speech-to-text
      provider)
- [ ] Organizations and DNS verification; Business inbox; org accounts
- [ ] Spaces
- [ ] Connect Kits (approval, meeting, order, delivery, invoice, payment request)
- [ ] AI assist with Anthropic provider and heuristic fallback
- [ ] Export, account deletion, retention
- [ ] Block, report, rate limits, link safety
- [ ] API tokens, webhooks, bots and agents
- [ ] Metrics and plan entitlements
- [ ] Calls (WebRTC 1:1 on web) ⛔ TURN relay needed for reliable production calls

## M7 — Ship

- [ ] Dockerfile (single image) and CI workflow
- [ ] Playwright E2E with screenshots; performance budgets
- [ ] Security review
- [ ] Native bundles export (iOS, Android); EAS config ⛔ store accounts
- [ ] Deploy to EasyPanel ⛔ needs `EASYPANEL_URL` and `EASYPANEL_API_TOKEN` in the environment

## Log

- 2026-09-26 — Session 1: docs written; brand system adopted from the owner's board (vector
  recreation pending); monorepo scaffolding started.
