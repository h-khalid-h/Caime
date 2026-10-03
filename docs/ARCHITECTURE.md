# Architecture

How Caime is built and why. Decisions are numbered (`ADR-n`) and are only ever superseded, never
silently edited: when one changes, add a new entry that says what it replaces.

## Shape

```
apps/app        Expo universal app: iOS, Android and Web from one codebase (Expo Router)
apps/server     Fastify API + WebSocket realtime + job workers + serves the web build
packages/core   Pure TypeScript domain logic shared by both: taxonomy, schemas, engines
deploy/         Deployment scripts (EasyPanel)
docs/           PRD, review, brand, competitive, architecture, roadmap
```

```
 iOS / Android / Web (one Expo codebase)
        │  HTTPS (REST /v1)        │  WSS (/v1/realtime)
        ▼                          ▼
 ┌──────────────────── apps/server (Node 22) ─────────────────────┐
 │ Fastify routes → services → Kysely → PostgreSQL 16             │
 │ @caime/core engines (attention, policy, intelligence, search) │
 │ Realtime hub ← Postgres LISTEN/NOTIFY → other instances        │
 │ Job workers (reminders, digests, webhooks, retention, exports) │
 │ Static web app (SPA) · uploads on a volume or S3-compatible    │
 └────────────────────────────────────────────────────────────────┘
```

## Decisions

- **ADR-1 — pnpm monorepo, hoisted linker.** One repository, one lockfile, one version of React
  and React Native. `nodeLinker: hoisted` because some React Native libraries still break under
  isolated installs.
- **ADR-2 — One universal Expo app.** iOS, Android and Web share screens, state and logic through
  Expo Router and react-native-web (the approach Bluesky ships at scale). Web is exported as a
  single-page app and served by the API server from the same origin, which keeps cookies
  first-party and avoids CORS.
- **ADR-3 — Shared domain core.** `@caime/core` is dependency-light TypeScript consumed as source
  by the server (bundled by esbuild) and the app (Metro). The attention engine, relationship
  policy engine, message intelligence, privacy evaluator and search parser run identically on
  client and server, so offline and optimistic behaviour always matches what the server will do.
- **ADR-4 — Fastify, PostgreSQL, Kysely, SQL migrations.** Typed SQL rather than an ORM, because
  messaging needs precise control over indexes, locking and ordering. Migrations are plain SQL
  files applied in order at boot under an advisory lock; they are append-only once deployed.
- **ADR-5 — Realtime over WebSocket with Postgres fan-out.** Each client holds one socket. The
  hub publishes through `pg_notify` so any number of server instances deliver to their own
  sockets. No Redis in the base topology.
- **ADR-6 — Jobs in Postgres.** A `jobs` table claimed with `FOR UPDATE SKIP LOCKED` runs
  reminders, notification digests, webhook deliveries, retention and exports, with retries and
  backoff. Survives restarts; works with multiple instances.
- **ADR-7 — Sessions, not JWTs.** Opaque random tokens stored as SHA-256 hashes, revocable per
  device. Web uses an `httpOnly`, `Secure`, `SameSite=Lax` cookie plus a required
  `X-Caime-Client` header on state-changing requests (a cross-site form cannot set it). Native
  uses a Bearer token kept in the platform keychain (SecureStore). Passwords use scrypt. Recovery
  codes allow account recovery without email.
- **ADR-8 — IDs and idempotency.** Server IDs are UUIDv7 (time-ordered, index-friendly). Every
  client write that can be retried carries a client-generated `clientId`; `(sender_id,
  client_id)` is unique, so a retried send returns the original message instead of a duplicate.
- **ADR-9 — Ordering.** Each conversation has a monotonically increasing `seq` assigned inside
  the insert transaction. Clients sync by asking for messages after the last `seq` they hold and
  track read position as a `seq`.
- **ADR-10 — Privacy is enforced where data leaves the server.** Serializers for another person's
  profile pass through the privacy evaluator in `@caime/core` using *the owner's* relationship to
  the viewer. A relationship record is never serialized to anyone but its owner unless shared.
- **ADR-11 — Suggestions, not writes.** Everything inferred (by heuristics or a model) is stored
  as a suggestion with a rationale and becomes a fact only through an explicit accept
  (PRODUCT-REVIEW R12).
- **ADR-12 — AI behind a provider interface.** The heuristic provider is always available; the
  Anthropic provider is used when `ANTHROPIC_API_KEY` is set and the account has AI enabled. AI
  usage is logged without content (feature, model, tokens, latency, outcome).
- **ADR-13 — Files.** Stored on a mounted volume by default, S3-compatible storage when
  configured. Served only through an authorizing endpoint. Large files use chunked, resumable
  uploads. Images get dimensions and a thumbnail at upload.
- **ADR-14 — Push.** Web Push with VAPID keys the server generates and persists on first boot (no
  third party needed); Expo push for iOS and Android once EAS credentials exist. Whether a
  notification is delivered, silent or held is decided server-side by the policy engine.
- **ADR-15 — One application container.** API, realtime, workers and the web app run in one image
  beside a PostgreSQL service. Horizontal scale is more instances of the same image.

- **ADR-16 — The interface is written in English in the code; other languages are catalogs
  keyed by it.** Every string the interface shows is wrapped where it's written (`tr('…')`,
  `trn(n, one, other)` for a count, `msg('…')` for a table of options translated where it's
  shown, in `packages/core/src/i18n.ts`), and the English text is the key into the language's
  catalog (`locales/ar.ts`), so the code stays readable, a missing entry falls back to the
  English, and `i18n-catalog.test.ts` fails CI for a string without its Arabic or an entry
  nothing says any more. The translator is one module-level value set at boot (the app loads
  the catalog before the first screen and remounts on a change); the server keeps English until
  it translates per person (its copy in notifications and inbox reasons is the next step). The
  catalog is its own lazy chunk, never in the startup bundle. Rejected: translation ids
  (`settings.language.title`), which hide the words from the code and make every string a
  lookup to read; and a React hook per string, which the app's components, many of them plain
  functions, would not fit.
## Domain model

The primary object is the **connection**, not the chat (PRD §4).

| Table | Meaning |
| --- | --- |
| `users` | Accounts: email, handle, password hash, locale, timezone, workweek, date of birth (every person has one: ages are exact, on the day where they live), country (ISO 3166-1: their defaults, such as the work week and currency), plan, kind (`human`, `bot`, `agent`) |
| `identities` | How a user appears: personal, professional, organization identities (PRD §35) |
| `sessions` | Device sessions (web cookie or native bearer), revocable |
| `connections` | The symmetric link between two users |
| `connection_sides` | One per participant: the identity shown, nickname, note, attention override, mute, archive |
| `connection_requests` | Directional requests with optional context ("Work · DATA C") |
| `relationships` | Directional, owner-private classification: sphere, role, organization, context; versioned (`status`, `superseded_by`), `shared` flag |
| `relationship_events` | History: created, changed, ended, archived, restored, merged, shared |
| `custom_roles` | User-defined roles per sphere |
| `relationship_policies` | Notification, attention, privacy, tone and follow-up defaults by sphere, role, organization or connection (R11) |
| `suggestions` | Inferences awaiting a decision, with rationale (R12) |
| `conversations` | Direct, group, business, community, broadcast; topic conversations point to a parent; context, space and org links; `privacy_class` standard/private; `last_seq` |
| `participants` | Membership plus per-user state: read `seq`, draft, attention override, mute, archive, pin |
| `messages` | Ordered by `seq`; `kind`, `body`, `payload`, `mode`, reply/forward links, extracted `entities`, full-text vector |
| `reactions` | One row per (message, user, emoji) |
| `files`, `message_files`, `assets` | Uploaded files, attachments, and the per-conversation asset index (PRD §26) |
| `contexts` | Project, order, trip, appointment, contract, issue, … shared by the conversations linked to it |
| `tasks` | The unified action record: owner, assignee, shared flag, status, due, reminder, source conversation and message, relationship snapshot (R13) |
| `decisions` | Recorded decisions with source message and context |
| `notifications` | In-app notifications with level (activity, attention, urgency) and burst grouping |
| `push_subscriptions` | Web Push and Expo push endpoints per session |
| `organizations`, `org_members`, `org_accounts` | Organizations with DNS verification, membership, customer and vendor accounts (PRD §36–39); each has a country (its defaults, such as its cards' currency) and may say the year it began |
| `business_threads` | Business inbox state per conversation: status, assignee, account |
| `spaces`, `space_members` | Spaces around an organization, family or community (PRD §40) |
| `blocks`, `reports` | Safety |
| `api_tokens`, `webhooks`, `webhook_deliveries` | Developer platform (PRD §73–74) |
| `domain_events` | The outbox: every state change emits an event (PRD §78) |
| `jobs` | Background work queue |
| `audit_log` | Security-relevant actions |
| `ai_runs` | AI usage without content |

## API conventions

- REST under `/v1`, JSON bodies validated with zod schemas from `@caime/core`.
- Errors are `{ "error": { "code", "message", "details"? } }` with a stable `code`.
- Lists use opaque cursors; message history pages by `seq`.
- Every retried write carries `clientId`.
- Rate limits per IP and per account on authentication, requests, messages and search.

## Realtime protocol

`GET /v1/realtime` upgrades to a WebSocket (cookie on web; `{"type":"auth","token"}` as the first
frame on native). The server sends `hello`, then `event` frames `{ id, type, data }` for message,
reaction, read, typing, presence, conversation, connection, task, decision and notification
changes. The client sends `typing`, `presence` and `ping`. On reconnect the client refetches the
inbox and each open conversation after its last `seq`, so a missed frame is never a lost message.

## Security

Helmet headers with a strict Content-Security-Policy for the web app, cookie and CSRF rules
above, rate limits, request size limits, file type sniffing, authorization on every file read,
SSRF-safe outbound fetches, audit log for sign-in, sessions, tokens, exports and deletion.

## Observability

Structured JSON logs with request ids, `GET /healthz` and `/readyz`, and Prometheus metrics at
`/metrics` (token-protected): HTTP latency, message send latency, realtime connections, delivery
failures, job failures, notification delivery, AI failures, search latency. No message content in
logs or metrics. What each part may cost, on the server, in AI tokens and on people's devices,
is `docs/RESOURCES.md`.
