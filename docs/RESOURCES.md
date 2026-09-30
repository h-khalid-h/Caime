# Resource budgets

Caime runs on one small instance, pays for every AI token, and lives on people's phones. Every
change is measured against these budgets, and a change that spends more than it saves says so in
its pull request (CONTRIBUTING.md) and is refused unless the product needs it. Numbers here come
from running something (CLAUDE.md convention 13); the date says when.

## The server

| Budget | Now | How it's held |
| --- | --- | --- |
| `GET /v1/inbox` for a signed-in person | p50 54 ms, p99 98 ms at 871 req/s (2026-09-30, one 4-core instance with Postgres beside it) | The inbox is one query per list, never per row; anything new the inbox shows joins that query or comes from the cache |
| A visitor's page (`/@handle`, `/o/handle`, `/i/token`) | p99 61 ms at 1,356 req/s | Rendered from the template in memory, no script served, `cache-control: no-cache` so a change shows at once |
| `/v1/healthz` | p99 15 ms at 7,920 req/s | No query |
| The inbox | `GET /v1/inbox?view=all` for one person in 300 conversations of 40 messages: p50 61 ms (from 127 ms); in 2,000: p50 377 ms (from 1,010 ms; the placing query counts what's unread and what mentions me in one pass over the messages past my mark, a lateral join, not two subqueries), the last messages 57 ms (`inbox-scale.test.ts`, `INBOX_CONVERSATIONS`, `INBOX_EXPLAIN=1` prints the plans; 2026-09-30, this container). One build serves both the Attention and the All view: the app sections the list itself (core `inboxSections`), so a launch costs one build, not two | Every person's view is one of a fixed number of batched queries (`personViewsFor`, maps, never a search per row); the day where someone is comes from one cached formatter per zone and one reading per instant (`zonedParts`), since the age check runs for every person listed |
| Database connections | the pool's default (10) per instance, `caime_db_pool_connections` on `/metrics` | A request holds a connection for one query at a time; long work (backups, fan-out) goes through a job, in batches of 1,000 (`updates.fanout`: one insert, one realtime event and one device lookup per batch; measured at 500,000 followers in `updates-scale.test.ts`: 108.2 s on this container, from 954.6 s when it inserted, published and looked up devices one follower at a time) |
| The job loop | rests until the soonest job or periodic task is due (30 s at most) and wakes at once on `enqueue` (a NOTIFY on `caime_jobs`), so an idle instance asks the queue as often as its soonest sweep (the call sweeps, every 5 s) instead of every second; `FOR UPDATE SKIP LOCKED` | New periodic work joins `periodic` with an `everyMs` of minutes, never its own timer; a job for now is enqueued, never polled for |
| Realtime | one ping every 25 s per connection, fan-out across instances through `LISTEN/NOTIFY` | A live event carries ids and small views, never message bodies for everyone in a space; membership is cached per socket |
| Uploads | 100 MB a file, 10 a request; photos resized to fit 4096 px, thumbnails to 480 px, metadata stripped; storage counted against the plan (`storageBytes`) | Uploads under way count at full size; one that doesn't fit is deleted, not kept |
| Logs | `info` in development, `warn` in production (`LOG_LEVEL`); never a message, a name or a token | Log once per request, at the end; count the rest with `ctx.metrics` |
| Retention | security records 365 days, ended sign-ins 30, activity 30, app deliveries 30, spent invites 30, held handles 365 (`lib/retention.ts`) | New records that grow with use get a row here and a sweep |

## AI

Each call is paid for by the token, so what is sent is bounded and what is repeated is cached.

| Feature | Model | Effort | Input bound | Output bound |
| --- | --- | --- | --- | --- |
| Rewrite, translate | `ANTHROPIC_MODEL_LIGHT` when set, else `ANTHROPIC_MODEL` | low | one message (1,500 characters) | 8,192 tokens |
| Catch me up | the light model | low | 200 messages, 60,000 characters, 1,500 a message | 4,096 tokens |
| Find follow-ups | `ANTHROPIC_MODEL` | medium | the same transcript, structured output | 8,192 tokens |
| An organization's agent | `ANTHROPIC_MODEL` | low | its knowledge (8,000 characters, sent as a cached system block) and the last 20 messages | 2,048 tokens, clipped to 1,500 characters |

- **Allowances** (`packages/core/src/plans.ts`): 10 AI calls a day on Personal, 200 on Pro and
  Business, 1,000 on Enterprise; an agent answers each customer message once (`agent_seq`) and
  waits three seconds so a person on the team can answer first.
- **Caching**: the agent's rules and knowledge are the same for every question its customers
  ask, so they are one system prefix marked `cache_control: ephemeral`; only the conversation is
  new. Anything else that repeats a long prefix (a transcript asked about twice within minutes)
  does the same. Short prompts are below the cache's minimum and cost nothing to mark.
- **Server-side fallback** (`server-side-fallback-2026-07-01`): a declined request is re-run
  once on Anthropic's recommended fallback, never retried by Caime in a loop; two SDK retries
  on transport errors, a 45 s deadline.
- **What is recorded**: model, input and output tokens and latency per call (`ai_runs`), in the
  person's export; `caime_ai_calls_total` and `caime_ai_call_duration_seconds` by feature and
  outcome, and `caime_ai_tokens_total` by feature and direction, so the operator sees what AI
  costs as it's spent (a rate over it is the bill). Never the prompt or the answer.
- **Heuristics first** (R17): dates, amounts, questions and follow-ups are found in core without
  a model; AI is asked only when a person asks, or an organization turned its agent on.

## People's devices

| Budget | Now | How it's held |
| --- | --- | --- |
| Initial web JavaScript | 436.3 KB gzip; 347.5 KB over the wire as Brotli (2026-09-30, entry 219.9 KB and the shared chunk 126.2 KB; 447.9 KB and 355.7 KB before the export ran with Metro's tree shaking); `pnpm budget` fails CI above 450 KB gzip | Screens, panes and sheets load lazily (`lazyPart`); core and brand imported by subpath; icons one file each; a module leaves the startup chunk only when every import of it is dynamic (CLAUDE.md). The build compresses every hashed file once at the highest quality (`scripts/precompress.mjs`: 966 KB gzip, 788 KB Brotli for the whole export) and the server sends that variant, so the proxy's on-the-fly compression (3.6% under gzip, measured on production) is bypassed |
| Opening the app | Signed in, on Chats, a phone viewport (`e2e/launch-cost.spec.ts`, `LAUNCH_COST=1`, 2026-09-30, this container): 9 API requests and one socket on a warm launch (the session, the inbox once, requests, tasks, notifications, updates, the business summary, what's live in calls once, my devices), 543 KB received; the first message on screen at about 1.1 s. A cold launch in a new browser adds registering it as a device (and listing again after) and the worker's first fill | Each screen reads what it shows and nothing more; a part that's rarely needed (a device waiting for approval) loads its code only when there is one; a listing asked for twice within a moment is asked once (`listDevices`) |
| Web fonts | 16 Latin WOFF2 cuts, 362 KB in all, a page fetches what it uses (82 KB on the landing page) | Served for a year, kept offline by the worker |
| Lighthouse, mobile preset | landing page 100/100/100 accessibility, best practices, SEO; a visitor's organization page complete at 0.7 s | A visitor's page carries no script |
| Network | one WebSocket, a ping every 25 s, reconnect with backoff; a phone put away lets it go after 30 s (pushes cover what arrives; coming back reconnects and catches up), unless a call or a live location share is on; a query is fresh for 30 s and kept 7 days (`queryClient.ts`); live changes are patched into the cache, never refetched whole | New screens read from the cache and subscribe to events; polling only where an event can't exist (a webhook's tries, every 3 s while that sheet is open); anything new that must hear the socket in the background joins the checks in `rest()` (`realtime/client.ts`) |
| Battery | no timer runs while nothing is on screen: call beats, typing ticks and the live location sharer stop with their screen | A new interval is cleared on unmount and skipped in the background |
| Images | a photo is shrunk on the device before it's uploaded (2,048 px on the long edge, JPEG 0.85, PNG kept as PNG; 1,024 for a profile photo or a logo; `lib/photoSize.ts`), so a phone's 3 to 5 MB shot goes as a few hundred KB; thumbnails (480 px) in lists, the stored photo (4,096 px at most) only when opened | Never a full-size image in a row; the server still caps and strips metadata, so nothing trusts the device's shrink |
| Storage on the device | the query cache (7 days), drafts, the outbox, keys for private conversations; on the web, the worker keeps the whole build (788 KB of scripts as Brotli, the fonts, the images) so the app opens with no network | A deploy costs a device only the files whose content changed (they're named by hash; `sw.js` keeps what it has and drops what the new build no longer lists); nothing else is written to disk without a reason in its pull request |

## What a change says

A pull request states, under **Resources**, what the change costs on each of the three: queries
or jobs added, AI tokens per use and how often, bytes on the device or timers running. "Nothing
new" is a fine answer when it is true. A number claimed is a number measured: `pnpm budget`,
`autocannon`, Lighthouse, or a test that counts queries or requests.
