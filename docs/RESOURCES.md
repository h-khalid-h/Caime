# Resource budgets

Caime runs on one small instance, pays for every AI token, and lives on people's phones. Every
change is measured against these budgets, and a change that spends more than it saves says so in
its pull request (CONTRIBUTING.md) and is refused unless the product needs it. Numbers here come
from running something (CLAUDE.md convention 13); the date says when.

## The server

| Budget | Now | How it's held |
| --- | --- | --- |
| `GET /v1/inbox` for a signed-in person | p50 54 ms, p99 98 ms at 871 req/s (2026-09-30, one 4-core instance with Postgres beside it); p50 65 ms, p99 126 ms at 725 req/s for a person with nothing in it yet (2026-10-04, this container, `autocannon -c 50 -d 10` against the bundled server) | The inbox is one query per list, never per row; anything new the inbox shows joins that query |
| A visitor's page (`/@handle`, `/o/handle`, `/i/token`) | p99 61 ms at 1,356 req/s (2026-09-30). 2026-10-04, this container: an organization's page p99 65 ms at 1,050 req/s (one read); a person's page p99 226 ms at 520 req/s, 2.9 ms alone on one connection (three reads: the person, then the headline and the organizations together, from four in a row before; the organization's miss is looked up with the person, not before) | Rendered from the template in memory, no script served, `cache-control: no-cache` so a change shows at once |
| `/v1/healthz` | p99 15 ms at 7,920 req/s (2026-09-30); p99 14 ms at 9,437 req/s (2026-10-04, this container) | No query |
| The inbox | `GET /v1/inbox?view=all` for one person in 300 conversations of 40 messages: p50 61 ms (from 127 ms); in 2,000: p50 377 ms (from 1,010 ms; the placing query counts what's unread and what mentions me in one pass over the messages past my mark, a lateral join, not two subqueries), the last messages 57 ms (`inbox-scale.test.ts`, `INBOX_CONVERSATIONS`, `INBOX_EXPLAIN=1` prints the plans; 2026-09-30, this container). One build serves both the Attention and the All view: the app sections the list itself (core `inboxSections`), so a launch costs one build, not two | Every person's view is one of a fixed number of batched queries (`personViewsFor`, maps, never a search per row); the day where someone is comes from one cached formatter per zone and one reading per instant (`zonedParts`), since the age check runs for every person listed |
| Boot and memory | The bundled server (1.1 MB, `apps/server/dist/server.js`) answers `/v1/healthz` 1.2 s after `node` starts, migrations checked, and holds 157 MB resident idle with workers off (2026-09-30, this container) | One process, one bundle, dependencies external to it; nothing is loaded at boot that a request could load (the Messages SDK, `pg_dump`, sharp's codecs come when used) |
| Database connections | 20 per instance by default (`DATABASE_POOL_MAX`), one of them the bus's listening connection, `caime_db_pool_connections` on `/metrics` | A request holds a connection for one query at a time; long work (backups, fan-out) goes through a job, in batches of 1,000 (`updates.fanout`: one insert, one realtime event and one device lookup per batch; measured at 500,000 followers in `updates-scale.test.ts`: 108.2 s on this container, from 954.6 s when it inserted, published and looked up devices one follower at a time) |
| The job loop | rests until the soonest job or periodic task is due (30 s at most) and wakes at once on `enqueue` (a NOTIFY on `caime_jobs`), so an idle instance asks the queue as often as its soonest sweep (the call sweeps, every 5 s) instead of every second; `FOR UPDATE SKIP LOCKED` | New periodic work joins `periodic` with an `everyMs` of minutes, never its own timer; a job for now is enqueued, never polled for |
| Realtime | one ping every 25 s per connection, fan-out across instances through `LISTEN/NOTIFY` | A live event carries ids and small views, never message bodies for everyone in a space; membership is cached per socket |
| Uploads | 100 MB a file, 10 a request; photos resized to fit 4096 px, thumbnails to 480 px, metadata stripped; storage counted against the plan (`storageBytes`) | Uploads under way count at full size; one that doesn't fit is deleted, not kept |
| Logs | `info` in development, `warn` in production (`LOG_LEVEL`); never a message, a name or a token | Log once per request, at the end; count the rest with `ctx.metrics` |
| Retention | security records 365 days, ended sign-ins 30, activity 30, app deliveries 30, spent invites 30, held handles 365, done and dead jobs 7, notifications 180 (`lib/retention.ts`; the privacy page says the last) | New records that grow with use get a row here and a sweep |

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
| Initial web JavaScript | 445.9 KB gzip; 354.2 KB over the wire as Brotli (2026-10-05, entry 278.4 KB and the shared chunk 165.9 KB: the Arabic wrapping, voice notes, M11's rules and the review's fixes since 2026-09-30's 436.3 KB; 447.9 KB before the export ran with Metro's tree shaking); `pnpm budget` fails CI above 450 KB gzip | Screens, panes and sheets load lazily (`lazyPart`); core and brand imported by subpath; icons one file each; a module leaves the startup chunk only when every import of it is dynamic (CLAUDE.md). The build compresses every hashed file once at the highest quality (`scripts/precompress.mjs`: 966 KB gzip, 788 KB Brotli for the whole export) and the server sends that variant, so the proxy's on-the-fly compression (3.6% under gzip, measured on production) is bypassed |
| Opening the app | Signed in, on Chats, a phone viewport (`e2e/launch-cost.spec.ts`, `LAUNCH_COST=1`, 2026-10-04, this container): 9 API requests and one socket on a warm launch (the session, the inbox once, requests, tasks, notifications, updates, the business summary, what's live in calls once, my devices), 563 KB received (560 KB earlier the same day, 543 KB on 2026-09-30: the interface's words wrapped for Arabic, then M11's rules), the first message on screen at 1.14 s (1.07 s earlier the same day, about 1.1 s before). A cold launch in a new browser adds registering it as a device (and listing again after) and the worker's first fill | Each screen reads what it shows and nothing more; a part that's rarely needed (a device waiting for approval) loads its code only when there is one; a listing asked for twice within a moment is asked once (`listDevices`) |
| Web fonts | 16 Latin WOFF2 cuts, 362 KB in all, a page fetches what it uses (82 KB on the landing page) | Served for a year, kept offline by the worker |
| An organization's data | An export reads the organization's threads once and each conversation's messages in one query (files in one more per conversation), builds the JSON in memory and refuses above 200,000 messages (`413 export_too_large`), three times an hour per organization; an erasure is one statement over the conversation's messages, as a sweep lot is, then one `message.deleted` per message to open apps, two hundred at most; a retention change is one update over the organization's messages | Nothing per message in the request path: the expiry is stamped as the message is sent, and the daily sweep takes what's due |
| An organization's door | The QR code is encoded on the server on request (`toqr`: 0.5 ms for the 43-character door link, measured 2026-10-03 under tsx; version 4 at level M, 33 modules a side) and sent as one path string of 3.9 KB (about 1 KB gzip), cached an hour in the browser (`private, max-age=3600`), so the app carries no encoder and a team's page costs one small request. The public page's door is a query on a link that already existed: nothing new to serve | A code is drawn from a path the server computed, never encoded on a phone; a printable file is made in the browser from the same path |
| The interface in Arabic and French | Each catalog is its own chunk, fetched once and only when the language is chosen: Arabic (`locales/ar.ts`, 2,543 strings) 70.9 KB gzip, 55.4 KB Brotli; French (`locales/fr.ts`, R55) 59.0 KB gzip, 49.8 KB Brotli (2026-10-05; the budget stayed at 445.9 KB); the wrapping of every string cost the startup bundle 2.8 KB gzip, and the second layer (roles, kits and the language header) 0.5 KB more (441.3 KB). On the server, a request's language is a header (about 20 bytes, no lookup), and a notification's reader costs one indexed read of two columns per person per five minutes, whatever the fan-out | A new language is a new chunk, never a line in the entry; strings stay English in the code so nothing is looked up at import time; the server never asks the database a language a request can tell it |
| The public site in Arabic | Server only: the site's 248 strings are `apps/server/src/locales/ar-site.ts` (13.5 KB gzip, 269 strings), merged into the server's Arabic translator at start; a page in Arabic costs the same render as in English (one map lookup per string, no query), and `Vary: Accept-Language` means a cache keeps one copy per language (2026-10-04). The app's Arabic chunk is unchanged at 65.4 KB gzip | A string the site alone says never joins the app's catalog (`scripts/i18n-keys.mjs` tells them apart), so a visitor's page costs no device anything |
| Natural-language search | Only a query the rules understood nothing of, that reads like a sentence (three words or a question word), from a person with AI assist on and within their plan's daily allowance; the model sees the words typed and nothing else (about 500 input tokens with the instructions, under 100 out, on the light model, `effort: low`), and one reading is kept ten minutes per person and query, so retyping and refetching cost nothing. A term, a name or a shape the rules read never reaches the model (2026-10-04) | Search answers whatever the model does: AI off, out of allowance, busy or declining all fall back to the text match. The model widens what's understood, never what's searched: every value it returns is checked against the taxonomy and the lists before a query runs |
| What you take (M11) | Read when a suggestion is made, not when shown: one read of the person's preferences and two indexed reads of their last decisions on the kind (ten at most, six for the same person; `suggestions_resolved`, migration 0047), so a message that drafts a suggestion costs three small queries more and a conversation costs nothing to open (2026-10-04) | No background job, no model, nothing recomputed on read: the lean and its counts travel on the suggestion's own payload |
| How sure, and what's remembered (M11) | Nothing new on the server for the sureness line: the confidence every suggestion already carried is put into words on the device (`surenessLine`, core). A profile opened reads two more bounded queries (five decisions, five promises each way, by the same conditions its counts use), once per open, cached with the profile; nothing when it's your own (2026-10-04) | The line is words, never a percentage; what's remembered is the viewer's own rows, so there is no fan-out and nothing to recompute when the other side changes theirs |
| Voice notes into words (PRD §46) | One provider call per note, only for a sender with AI assist on and counted as one of their day's assists (Personal 10, Pro 200), so the allowance is the budget: at about $0.006 an audio minute, a thousand half-minute notes a day cost about $3. The note's audio is read once from storage (25 MB and ten minutes at most) and sent; nothing is kept of the exchange but the words, on the message. A recipient's device gets one `message.updated` (2026-10-04) | Never a note from a private conversation, never a sender's with AI assist off, never a minor's; a busy provider is retried by the job (three attempts), silence or a refusal leaves the note as it is; the provider is a sub-processor named on the privacy page and in the DPA when configured |
| Lighthouse, mobile preset | landing page 100/100/100 accessibility, best practices, SEO; a visitor's organization page complete at 0.7 s | A visitor's page carries no script: the landing page too, since 2026-09-30 (its spec sheet and layer explorer are HTML and CSS; sign-up and sign-in open the app) |
| The app's first screen (welcome, sign-in, sign-up) | Painted by the server before the app runs (R44, `entryBody` in `lib/public-pages.ts`: the screen's words and shape in HTML, in the browser's language), and the app's scripts asked for only after that paint (`bootstrapScripts`). Lighthouse, mobile preset, this container, 2026-10-04, two runs each: LCP 1.1–1.4 s (was 4.6 s the same day, 4.2 s on 2026-10-01), FCP 0.8 s, TBT 690–800 ms, interactive 4.4–4.6 s (was 4.2 s: the scripts start about 0.3 s later), CLS 0.01–0.04. Unthrottled, the words paint at about 125 ms | The first paint never waits for 440 KB of script, nor shares the line with it; what the visitor reads is the screen itself, replaced in place when the app mounts. The app's own weight (entry 278 KB + common 162 KB gzip: the router, React, the web renderer, the app and core) is unchanged and is where interactivity still waits |
| Network | one WebSocket, a ping every 25 s, reconnect with backoff; a phone put away lets it go after 30 s (pushes cover what arrives; coming back reconnects and catches up), unless a call or a live location share is on; a query is fresh for 30 s and kept 7 days (`queryClient.ts`); live changes are patched into the cache, never refetched whole | New screens read from the cache and subscribe to events; polling only where an event can't exist (a webhook's tries, every 3 s while that sheet is open); anything new that must hear the socket in the background joins the checks in `rest()` (`realtime/client.ts`) |
| Battery | no timer runs while nothing is on screen: call beats, typing ticks and the live location sharer stop with their screen | A new interval is cleared on unmount and skipped in the background |
| Images | a photo is shrunk on the device before it's uploaded (2,048 px on the long edge, JPEG 0.85, PNG kept as PNG; 1,024 for a profile photo or a logo; `lib/photoSize.ts`), so a phone's 3 to 5 MB shot goes as a few hundred KB; thumbnails (480 px) in lists, the stored photo (4,096 px at most) only when opened | Never a full-size image in a row; the server still caps and strips metadata, so nothing trusts the device's shrink |
| Storage on the device | the query cache (7 days), drafts, the outbox, keys for private conversations; on the web, the worker keeps the whole build (788 KB of scripts as Brotli, the fonts, the images) so the app opens with no network | A deploy costs a device only the files whose content changed (they're named by hash; `sw.js` keeps what it has and drops what the new build no longer lists); nothing else is written to disk without a reason in its pull request |

## What a change says

A pull request states, under **Resources**, what the change costs on each of the three: queries
or jobs added, AI tokens per use and how often, bytes on the device or timers running. "Nothing
new" is a fine answer when it is true. A number claimed is a number measured: `pnpm budget`,
`autocannon`, Lighthouse, or a test that counts queries or requests.

## Bookings (R51)

The open slots are worked out on request, never kept: one query for the organization's
appointment cards in the window, then arithmetic (`openSlots`), at most 200 slots an answer. The
AI agent's prompt grows by at most eight lines of slots over fourteen days, read once per reply
with the same cached knowledge prefix, so a booking costs the model one short turn more than an
answer; the card itself is sent by the server, not written by the model.

## Recording (R52, not built)

When it comes, each recorded minute costs the speech-to-text provider's price per minute, paid
once per call, plus one short model turn per summary or action list asked for. The plans carry
monthly minute allowances for it (Pro and Business; none free), set from the provider's price
once a provider has passed the test in R52; until then the line stays unpriced here rather than
guessed.

## The public site

Each page of the site (`/business`, `/pricing`, `/security`, `/developers`, `/about`) is written
into the app's shell on request from constants and the plans, with no query (a person's or an
organization's page queries once), and is sent with `public, max-age=600`. The pricing page asks
Stripe for its prices through billing's ten-minute cache, so at most one request to Stripe every
ten minutes for every visitor together, and none when billing isn't connected. A visitor
downloads the shell's HTML and CSS only: no script, no font beyond the app's own.
