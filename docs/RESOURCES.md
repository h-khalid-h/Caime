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
| The job loop | rests until the soonest job or periodic task is due (30 s at most) and wakes at once on `enqueue` (a NOTIFY on `caime_jobs`), so an idle instance asks the queue as often as its soonest sweep (the call sweeps, every 5 s) instead of every second; `FOR UPDATE SKIP LOCKED`; the reminder and held-notification sweeps take 200 at a time (`SWEEP_BATCH`) and run beside the loop (`background`), so a backlog after a pause never holds the jobs | New periodic work joins `periodic` with an `everyMs` of minutes, never its own timer; a job for now is enqueued, never polled for |
| Realtime | one ping every 25 s per connection, fan-out across instances through `LISTEN/NOTIFY` | A live event carries ids and small views, never message bodies for everyone in a space; membership is cached per socket |
| People and organizations listed | Connections, requests, a people search and the organizations' lists draw everyone through `personViewsFor` and their standing through `betweenMany`, a team's size and the viewer's seat in one query each: 10 queries for 3 connections and for 30 (from 31 and 274, then 12 until one face per person, R99), requests 8 (from 29 and 272), a search 13 (from 52 and 364), the organizations' list 3 (from 5 and 32), their search 4, the Business inboxes 3, held equal for 3 and 30 under a ceiling of 14 (`people-scale.test.ts`, 2026-10-18, this container). The inbox is 15 queries for 301 conversations (17 until R99), one of them 5,000 messages long that I never wrote in: where I last wrote is my participant row's (`last_sent_seq`), never a walk back through a conversation (`inbox-scale.test.ts`, ceiling 16). No read ships a person's or an organization's catalog, or a message's search vectors, unless it's the point (`select-all.test.ts`) | A new list of people draws them through `personViewsFor`, never a query per row; a new path that inserts a message writes its sender's `last_sent_seq` |
| Work after a response, the bus, deletions | What runs after a response (a message's effects, a mail, a suggestion) runs eight at a time on an instance and the rest wait in order (`DEFER_CONCURRENCY`, `caime_deferred{state}`), so a burst never takes the pool the requests share. A bus message to a crowd is split across NOTIFYs that fit: 500 recipients of a typing tick are three messages of at most 7,000 bytes and no row (`bus.test.ts`), where one row was written and every instance read it back. Every foreign key leads an index (`fk-indexes.test.ts`), so deleting an account, a conversation or a message reads only the rows that point at it | A new foreign key brings its index; work that must survive a restart is a job, never a defer |
| A message to a group | Telling every member is one set of reads for them all (their settings, rules, relationships with the sender, the conversation's title, their open notification of it and their languages: six queries, `prepareFor` and `readersOf`), each one's notification decided and worded in memory, then written at once (M16 D2b): one insert for the new, one update for what a burst adds to, one event per set of the same words, the devices to push to found once: a group of 80 cost 32 queries (0.4 per member) and 160 ms on 2026-10-18 (34 until one face per person, R99), from 267 (3.4 per member) on 2026-10-05 and 813 (10.3 per member, all at once on the pool) before that; a crowd of 153 and one of 303 cost 31 each (`fanout-scale.test.ts`, ceiling 45 at any size; `large-group.test.ts`, equal at both). Past a hundred people (`LARGE_GROUP`) a group is a crowd: no delivered acks from any device (a request and five queries each, per message, per device), no typing ticks, no inbox read again by every device after each message, and a stranger's word to everyone waits in each inbox instead of alerting hundreds of phones. An ack (delivered or read) goes to whoever sent what it newly covers and the reader's own devices, never the whole group (18 queries for two acks in a group of 80, from one query bounded by the ack), and whether each may see the read position is one check for them all (`readReceiptsVisibleTo`, five queries), the same check the conversation view now runs once for a whole group (`personViewsFor` beside it) | A new thing told to every member joins `prepareFor`, never a query of its own per member; a new live event about a conversation asks whom it changes anything for before it publishes |
| Discover (R74) | `GET /v1/directory`: one query a page (20, 50 at most) over the partial index of listed apps by `(connected_count desc, id desc)`, the trigram index for a search, and one bounded query for the built-ins' state on the first page; `app-directory.test.ts` pages 46 listed apps in three with no row twice | The count is kept on the row by the grant's own transaction, never counted on read; a new built-in adds one bounded query, never one per app |
| Bridges, a contacts file and the API document (R79) | A bridge costs the server a token's worth of calls when a recipe polls, rate-limited as any token's (600 a minute); Discover's first page reads the bridges' state in the same two bounded queries as the calendar's (the viewer's live bridge tokens, and the counts per platform cached a minute with the feeds' count, `builtinCounts`). A contacts file is parsed on the device (`@caime/core/contacts`, up to 5,000 contacts, a 20 MB cap) and asks the server one query per 500 addresses (`POST /v1/people/match`, thirty calls an hour) plus the batched person views; nothing is stored. The OpenAPI document is built once per process from the zod schemas and served with `public, max-age=600`, so a platform's repeated fetches cost the proxy, not the server | The bridges' words (`@caime/core/bridges`) sit in the Apps route's chunk, not the startup chunk: `app-directory.ts`, which the startup chunk carries, holds only the category; the contacts sheet loads lazily from the Connect screen |
| Contacts from every source (R89) | The server's part is the same match, now three queries for any number of matches (the connection states batched: `betweenMany`, held equal for 2 and 12 matches by `contacts.test.ts`), plus, for an account, one consent link (a sealed state, no row) and one token exchange with the provider (one outbound request, ten seconds at most); nothing is stored. The device reads an account's contacts itself, a page of up to a thousand per request, at most six pages a list and two lists an account, so a full account is about a dozen requests to the provider and up to ten match calls | The sheet, its readers and the sealing (`@noble/ciphers`' AES-GCM) load with the sheet, from the Connect screen; the Connect route carries only the return's reader (`contact-return.ts`). No AI |
| Provider health, the audit chain and an agent's tools (R78) | A probe is one small read per configured provider an hour (nine at most, in parallel, ten seconds each; none for a provider that isn't configured); the chain costs each audit row one hash in the database as it commits (a few hundred rows a day) and the daily check one query over the newest 10,000; `@caime/mcp` costs the server one token's calls, rate-limited as any token's, and answers an agent with a bounded projection (a conversation's people and lines, never every field of a view), so the agent's own tokens stay small | Nothing on devices: the MCP server runs on the person's own machine |
| The marketplace (R80) | A page is one query over the partial index of listed apps (48 a page by keyset, as Discover pages), Caime's own from a constant, served `public, max-age=600` so a crawler's or a visitor's repeat costs the proxy, not the server; an app's page is one indexed lookup by its address; the sitemap adds one bounded query (10,000 apps at most) inside its ten-minute cache, forgotten when a listing is reviewed, changed or removed. Screenshots are served from the preview rendition made at upload (R70), nothing resized on request | Nothing on devices: the pages carry no script; Discover's sheet draws the screenshots at 256 × 160 points from the preview |
| Uploads | 100 MB a file, 10 a request; photos resized to fit 4096 px, thumbnails to 480 px, metadata stripped; storage counted against the plan (`storageBytes`) | Uploads under way count at full size; one that doesn't fit is deleted, not kept |
| Logs | `info` in development, `warn` in production (`LOG_LEVEL`); never a message, a name or a token | Log once per request, at the end; count the rest with `ctx.metrics` |
| Retention | security records 365 days, ended sign-ins 30, activity 30, app deliveries 30, spent invites 30, held handles 365, a passkey ceremony's challenge five minutes (swept daily), done and dead jobs 7, notifications 180 (`lib/retention.ts`; the privacy page says the last) | New records that grow with use get a row here and a sweep |

## AI

Each call is paid for by the token, so what is sent is bounded and what is repeated is cached.

| Feature | Model | Effort | Input bound | Output bound |
| --- | --- | --- | --- | --- |
| Rewrite, translate | `ANTHROPIC_MODEL_LIGHT` (Haiku 5.5 unless set, M16 H7) | low | a draft of 4,000 characters, a message's first 4,000 | 8,192 tokens |
| Catch me up | the light model | low | 200 messages, 60,000 characters, 1,500 a message | 4,096 tokens |
| Find follow-ups | `ANTHROPIC_MODEL` on a paid plan, the light model on Personal (core `aiModel`) | medium | the same transcript, structured output | 8,192 tokens |
| A question about a conversation (R67) | the light model | low | the same transcript and the question (300 characters) | 4,096 tokens |
| An organization's agent | `ANTHROPIC_MODEL` on Business and Enterprise, the light model on Free (core `agentModel`) | low | its knowledge (8,000 characters, sent as a cached system block) and the last 20 messages | 2,048 tokens, clipped to 1,500 characters |

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
- **What is recorded**: model, input and output tokens, what of the input was read from the
  model's cache and what was written to it, and latency per call (`ai_runs`), in the person's
  export; `caime_ai_calls_total` and `caime_ai_call_duration_seconds` by feature and outcome, and
  `caime_ai_tokens_total` by feature and direction (`input`, `output`, `cache_read`,
  `cache_creation`: the cached part is billed at a tenth), so the operator sees what AI costs as
  it's spent (a rate over it is the bill). Never the prompt or the answer.
- **Heuristics first** (R17): dates, amounts, questions and follow-ups are found in core without
  a model; AI is asked only when a person asks, or an organization turned its agent on.

## People's devices

| Budget | Now | How it's held |
| --- | --- | --- |
| What a person's row costs | Every read of a person or an organization on a hot path (presence, a sender, the people of a view) selects the columns without the five catalog jsonb columns (`USER_COLUMNS`, `ORG_COLUMNS`, 2026-10-11): a clinic's whole catalog no longer rides each presence change. A window over cards (the calendar, the slots, the briefs, search) is an index read on `card_start_at`, never a scan of every payload in the conversations asked for | `columns.test.ts` holds the lists and the rule; a test that inserts a card by hand writes `card_start_at` |
| The job loop | Eight slots over a queue a slot refills when it runs dry, four batches of fifty at most before the periodic tasks get their turn; a job due within the longest rest (30 s) wakes the loop as it's queued (Cai's reply 800 ms out ran at the next look before, up to 5 s late); morning briefs sit at the person's hour plus their own place in five minutes (2026-10-11) | Nothing polls; the sitemap is built once in ten minutes |
| Initial web JavaScript | 449.1 KB gzip; 355.1 KB over the wire as Brotli; the chunks loaded later are each held under 100 KB by `pnpm budget`, the largest the Arabic catalog (92.8 KB), the conversation screen, French and Turkish (2026-10-14, after R36 and DPA §12: the passkey button, the passkey and closed-organization endpoints, while the WebAuthn code itself loads only when a passkey is added or used; 448.1 KB on 2026-10-12, after R80: core's marketplace module, read by the listing editor's chunk and the Apps route, sits in the shared chunk, 0.4 KB; 447.6 KB on 2026-10-11, after R79 layer 1: the people picker and the time zone field, shared by several screens and needed by none at first, now load lazily where they're shown, 2.7 KB out of the shared chunk, which R75 and R81 had taken to 449.4 KB and the bridges' icon, endpoints and category to 451.3 KB; the contacts sheet's chunk read 104.9 KB while one constant came from core's schemas module, which carries zod, until the constant moved into the pure contacts module; 446.6 KB after the review's block 4: the publisher line shared by the Apps, Developer and consent routes, and a card's state labels in `kit-states.ts`, 1.3 KB; the Orders view's import of `kit-cards` had carried every kit definition into `__common`, 451.3 KB, until the states moved into their own light module; 445.3 KB after block 3, whose counts through `trn` cost 0.3 KB; 445.0 KB after block 2; 445.1 KB after R74: the app icon and the directory's categories are shared by the Apps and Developer routes, 1.2 KB in `__common`; 443.8 KB after R73; 447.4 KB on 2026-10-06, with each icon imported where it's used: 449.8 KB when all 127 came through one re-exporting module into the startup chunk; 448.5 KB on 2026-10-05, after the query cache's own persister; 448.8 KB after the organization's setup screen, R57: 450.4 KB when `OrgPlan.tsx` was shared by two route chunks and moved into `__common`, 448.8 KB with its one shared line in `planLine.ts`; 448.3 KB after the intelligence's leftovers; 447.5 KB after the relationship chip, the recovery-codes card, whose sheet loads when opened, the reduce-motion hook and the new-message live region: 446.1 KB before them; the tab bar's height lives in `ui/tabBarHeight.ts` so the toasts' host doesn't pull the bar into the shared chunk, which cost 1.6 KB when it did; entry 278.4 KB and the shared chunk 166.1 KB then: the Arabic wrapping, voice notes, M11's rules and the review's fixes since 2026-09-30's 436.3 KB; 447.9 KB before the export ran with Metro's tree shaking); `pnpm budget` fails CI above 450 KB gzip | Screens, panes and sheets load lazily (`lazyPart`); core and brand imported by subpath; icons one file each; a module leaves the startup chunk only when every import of it is dynamic (CLAUDE.md). The build compresses every hashed file once at the highest quality (`scripts/precompress.mjs`: 1,068 KB gzip, 872 KB Brotli for the whole export on 2026-10-09) and the server sends that variant, so the proxy's on-the-fly compression (3.6% under gzip, measured on production) is bypassed |
| Opening the app | Signed in, on Chats, a phone viewport (`e2e/launch-cost.spec.ts`, `LAUNCH_COST=1`, 2026-10-05 after the day's review blocks, this container): 9 API requests and one socket on a warm launch (the session, the inbox once, requests, tasks, notifications, updates, the business summary, what's live in calls once, my devices), 563 KB received (the same on 2026-10-04; 560 KB earlier that day, 543 KB on 2026-09-30: the interface's words wrapped for Arabic, then M11's rules), the first message on screen between 1.10 and 1.32 s over three runs (1.14 s on 2026-10-04, 1.07 s earlier that day, about 1.1 s before: the spread is the container's, nothing new is on the path). A cold launch in a new browser adds registering it as a device (and listing again after) and the worker's first fill | Each screen reads what it shows and nothing more; a part that's rarely needed (a device waiting for approval) loads its code only when there is one; a listing asked for twice within a moment is asked once (`listDevices`) |
| Web fonts | 23 WOFF2 cuts, 627 KB in all: 16 Latin (362 KB) and 7 Arabic (265 KB, R73), each fetched only for the letters a page draws (87 KB on the landing page; the Arabic cuts only once Arabic is on screen). Phones bundle the Arabic faces as 7 TTFs (1.3 MB in the binary, read from the device, never the network) | Served for a year, kept offline by the worker |
| An organization's data | An export reads the organization's threads once and each conversation's messages in one query (files in one more per conversation), builds the JSON in memory and refuses above 200,000 messages (`413 export_too_large`), three times an hour per organization; an erasure is one statement over the conversation's messages, as a sweep lot is, then one `message.deleted` per message to open apps, two hundred at most; a retention change is one update over the organization's messages | Nothing per message in the request path: the expiry is stamped as the message is sent, and the daily sweep takes what's due |
| An organization's door | The QR code is encoded on the server on request (`toqr`: 0.5 ms for the 43-character door link, measured 2026-10-03 under tsx; version 4 at level M, 33 modules a side) and sent as one path string of 3.9 KB (about 1 KB gzip), cached an hour in the browser (`private, max-age=3600`), so the app carries no encoder and a team's page costs one small request. The public page's door is a query on a link that already existed: nothing new to serve | A code is drawn from a path the server computed, never encoded on a phone; a printable file is made in the browser from the same path |
| The interface in Arabic and French | Each catalog is its own chunk, fetched once and only when the language is chosen: Arabic (`locales/ar.ts`, 2,543 strings) 70.9 KB gzip, 55.4 KB Brotli; French (`locales/fr.ts`, R55) 59.0 KB gzip, 49.8 KB Brotli (2026-10-05; the budget stayed at 445.9 KB); the wrapping of every string cost the startup bundle 2.8 KB gzip, and the second layer (roles, kits and the language header) 0.5 KB more (441.3 KB). On the server, a request's language is a header (about 20 bytes, no lookup), and a notification's reader costs one indexed read of two columns per person per five minutes, whatever the fan-out | A new language is a new chunk, never a line in the entry; strings stay English in the code so nothing is looked up at import time; the server never asks the database a language a request can tell it |
| What only the server says | Server only: the public site's pages, a notification's words and every refusal are the server's own catalogs, `apps/server/src/locales/ar-server.ts` (625 strings, 85 KB on disk, 25.3 KB gzip) and `fr-server.ts` (625 strings, 78 KB, 24.1 KB gzip), merged into the server's translators at start; a page, a push or a 404 in Arabic costs the same as in English (one map lookup per string, no query), and `Vary: Accept-Language` means a cache keeps one copy of a page per language (2026-10-05). The app's chunks carry none of it: translating the 336 error messages put nothing on a device, and the 74 notification strings the app never showed left its chunks (Arabic 70.9 KB gzip, 55.4 KB Brotli; French 59.0 KB gzip, 49.8 KB Brotli, measured after) | A string only the server says never joins the app's catalog (`isServerKey` in `scripts/i18n-keys.mjs`, by the files that say it), so what the server writes costs no device anything |
| Natural-language search | Only a query the rules understood nothing of, that reads like a sentence (three words or a question word), from a person with AI assist on and within their plan's daily allowance; the model sees the words typed and nothing else (about 500 input tokens with the instructions, under 100 out, on the light model, `effort: low`), and one reading is kept ten minutes per person and query, so retyping and refetching cost nothing. A term, a name or a shape the rules read never reaches the model (2026-10-04) | Search answers whatever the model does: AI off, out of allowance, busy or declining all fall back to the text match. The model widens what's understood, never what's searched: every value it returns is checked against the taxonomy and the lists before a query runs |
| What you take (M11) | Read when a suggestion is made, not when shown: one read of the person's preferences and two indexed reads of their last decisions on the kind (ten at most, six for the same person; `suggestions_resolved`, migration 0047), so a message that drafts a suggestion costs three small queries more and a conversation costs nothing to open (2026-10-04) | No background job, no model, nothing recomputed on read: the lean and its counts travel on the suggestion's own payload |
| How sure, and what's remembered (M11) | Nothing new on the server for the sureness line: the confidence every suggestion already carried is put into words on the device (`surenessLine`, core). A profile opened reads two more bounded queries (five decisions, five promises each way, by the same conditions its counts use), once per open, cached with the profile; nothing when it's your own (2026-10-04) | The line is words, never a percentage; what's remembered is the viewer's own rows, so there is no fan-out and nothing to recompute when the other side changes theirs |
| Voice notes into words (PRD §46) | One provider call per note, only for a sender with AI assist on and counted as one of their day's assists (Personal 10, Pro 200), so the allowance is the budget: at about $0.006 an audio minute, a thousand half-minute notes a day cost about $3. The note's audio is read once from storage (25 MB and ten minutes at most) and sent; nothing is kept of the exchange but the words, on the message. A recipient's device gets one `message.updated` (2026-10-04) | Never a note from a private conversation, never a sender's with AI assist off, never a minor's; a busy provider is retried by the job (three attempts), silence or a refusal leaves the note as it is; the provider is a sub-processor named on the privacy page and in the DPA when configured |
| Lighthouse, mobile preset | landing page 100/100/100 accessibility, best practices, SEO; a visitor's organization page complete at 0.7 s | A visitor's page carries no script: the landing page too, since 2026-09-30 (its spec sheet and layer explorer are HTML and CSS; sign-up and sign-in open the app) |
| The app's first screen (welcome, sign-in, sign-up) | Painted by the server before the app runs (R44, `entryBody` in `lib/public-pages.ts`: the screen's words and shape in HTML, in the browser's language), and the app's scripts asked for only after that paint (`bootstrapScripts`). Lighthouse, mobile preset, this container, 2026-10-04, two runs each: LCP 1.1–1.4 s (was 4.6 s the same day, 4.2 s on 2026-10-01), FCP 0.8 s, TBT 690–800 ms, interactive 4.4–4.6 s (was 4.2 s: the scripts start about 0.3 s later), CLS 0.01–0.04. Unthrottled, the words paint at about 125 ms | The first paint never waits for 440 KB of script, nor shares the line with it; what the visitor reads is the screen itself, replaced in place when the app mounts. The app's own weight (entry 278 KB + common 162 KB gzip: the router, React, the web renderer, the app and core) is unchanged and is where interactivity still waits |
| Network | one WebSocket, a ping every 25 s, reconnect with backoff; a phone put away lets it go after 30 s (pushes cover what arrives; coming back reconnects and catches up), unless a call or a live location share is on; a query is fresh for 30 s and kept 7 days (`queryClient.ts`); live changes are patched into the cache, never refetched whole | New screens read from the cache and subscribe to events; polling only where an event can't exist (a webhook's tries, every 3 s while that sheet is open); anything new that must hear the socket in the background joins the checks in `rest()` (`realtime/client.ts`) |
| Notifications on a phone | the server sends one request to Expo per push per phone, as to a browser's push service (one deadline, 10 s), and drops a token at the first ticket saying the app is gone, so no push is ever sent twice to a dead phone; the app registers its token once a launch while signed in (one upsert), nothing more; with `EXPO_ACCESS_TOKEN` set, one receipts read an hour (R78). No timer and no background task on the phone: what's shown is cleared while the app is open, and checked by one request each time Caime comes to the front while the phone shows any of its notifications (none otherwise) | A new kind of push rides `notify`; nothing polls Expo's receipts |
| Battery | no timer runs while nothing is on screen: call beats, typing ticks and the live location sharer stop with their screen | A new interval is cleared on unmount and skipped in the background |
| Images | a photo is shrunk on the device before it's uploaded (3,072 px on the long edge, JPEG 0.9, PNG kept as PNG; 1,024 for a profile photo or a logo; `lib/photoSize.ts`): 2.25 times the pixels of 2026-10-05's 2,048, so a zoomed or full-screen photo stays sharp on a QHD screen, still under a 12-megapixel original's 4,032. The server keeps two renditions (R70): the thumbnail (480 px, WebP 80) for what's drawn up to 160 points (tiles, faces, logos) and the preview (1,280 px, WebP 82, made only for an image bigger than the thumbnail) for what's drawn larger (a photo in a message, an item's sheet and page, a link's card); the stored photo (4,096 px at most) only when opened. A 1200 x 630 card (63 KB PNG) is what a shared link to Caime shows | Never a full-size image in a row, nor a small one stretched (core `imageFor`); one more resize per photo at upload, and older images get their preview from a backfill (`files.previews`, 25 at a time, once); the server still caps and strips metadata, so nothing trusts the device's shrink |
| Storage on the device | the query cache (7 days, trimmed to what makes the next launch instant and written at most every 1.5 s, serialised only once the screen is idle), drafts, the outbox, keys for private conversations; on the web, the worker keeps the whole build (788 KB of scripts as Brotli, the fonts, the images) so the app opens with no network | A deploy costs a device only the files whose content changed (they're named by hash; `sw.js` keeps what it has and drops what the new build no longer lists); nothing else is written to disk without a reason in its pull request |

Heavy work is bounded (review 2026-10-17): an instance decodes two images at a time and none
over 50 megapixels; a job runs ten minutes at most and renews its lock every minute; a periodic
task runs on one instance per interval, so a second worker adds no provider calls; a backup's copy
off the host streams from disk. None of this costs a device anything.

A message's effects are an outbox (A3): one more update per message (its due time cleared once
the effects ran) and a partial index over what is due, a handful of rows at any time; the
`message.effects` sweep reads that index once a minute, on one instance, and does nothing when it
is empty; a replay costs what the send's effects would have. The migrations lint costs CI a few
seconds; the published image a layer set in the registry per green commit (the layers are shared
across commits); a staging service a second container and database, the owner's choice.

Booking before an account (R97 (1)) costs the server, per view of a bookable item's page, the
week's slots (`openSlotsFor` over the host's bookings in the window, no calendar read under a
visitor's view: `fresh: false`) and nothing kept; per booking, one code mail and the same rows a
customer's own booking writes. A visitor's device gets a page with no script, as every public
page. The limits (thirty starts an hour from an address, three codes an hour to one email) bound
what a stranger's form can cost. Telling a provisional booker costs one mail per confirm or
cancel (with a calendar part a few hundred bytes long), sent after the response; a customer with
an account costs nothing more than before. The door's numbers in product metrics read only the
handful of people who were or are provisional, and their messages by the sender index. The day
before a confirmed one (C1c) costs one job row and one mail, and only for a booker without an
account whose booking was confirmed a day and a half or more ahead; the job reads the card and
two rows again when it runs. A person's page books the same way, at the same cost, with one more
row read for the person behind the handle. Writing before an account (C1d) costs a page view
nothing beyond the page (the form is markup; a step's claim is opened in memory), a message one
code mail and the rows any customer's first message writes, and the team's answer one mail out
through the provider, as any answer to someone reached by mail; the first one reads the
customer's last words once for its subject. The daily sweep's added day costs nothing (one more
condition on the same delete). Closed days (C2a) cost nothing new: the slots skip
them in the same walk. The door is asked again each time it's shown (one row read and a code of
a short link, milliseconds), since its Book link follows the catalog. A team invite (C3a) is one
row, and one mail when it's sent to an address; opening and accepting it are a handful of
indexed reads and the seat's own transaction, the same one adding someone always ran (now under
the organization's row, so the plan's room is read once inside it); nothing polls, no job runs,
and spent ones go with the retention sweep's existing pass. On the device, the invite panel loads
with the team's Add sheet and the accept screen is its own route, neither in the first download. A join link (C3e) is one row; its
visitor page reads 7 queries and a join 40, in one transaction under the place's row, the same
with two people in the group or twenty-three (`join-links.test.ts` counts them), once per person;
nothing polls, no job runs, and spent ones go with the same retention pass. A link stops at 256
people; past a hundred a group is a crowd (M16 D2b: no acks, no typing, the inbox patched), so a
group a link fills that far costs each message what a group of eighty does. On the device,
the link panel loads with a group's or a space's Add sheet (or the sheet a group just made opens
on), and the accept screen is its own route, neither in the first download. Joining a team by domain (C3b)
is one boolean on the organization and a timestamp on a seat; the organization's page reads up to
three indexed rows more for someone not on its team, and only where its domain takes people; a
join is the seat's own transaction; proving an address looks the organization up once by its
domain's unique index, after the response. Nothing polls, and nothing fans out to everyone at a
domain when the switch is turned on. Keeping a meeting (C3f) stores nothing new: a guest by link's
claim is sealed by the server and kept by no one (one read of the guest's row to hand it, one more
when sign-up takes it), the account is the guest's own row updated in sign-up's transaction, and
ending the guest's sessions is one update; the guest page's block is in its route's chunk, the
sign-up screen reads what it's handed through a dynamic import only when `?keep=1` says so, and the
startup chunk grew 0.1 KB (448.8 KB: the conversation-link reader onboarding uses). A WhatsApp
group brought over (C3g) costs the server what a one-to-one's does (an insert per 500 lines in one
transaction, under the topic's row lock) and one indexed read more, of who in the group its names
are taken as; nothing is notified or read for meaning, and no AI is asked. On the device, an
iPhone's `.zip` is unzipped there: the unzipper is a 12.3 KB gzip chunk fetched only when a zip is
picked, and it inflates the export's text alone, never its photos. The startup chunk is unchanged
(448.8 KB); the conversation route's chunk grew 1.2 KB (84.3 KB: the group's "who's who" rows).
A link that asks (C3h) keeps one row per ask (indexed by place and person, swept once answered as
a spent link is); an ask is one insert, its owner and admins told by one notification each (a few
people, four at a time) and one `join.asked` event; answering it is the one way in it always was,
plus one update. The asks list is one indexed read, made only by whoever runs the place when its
people are shown, and loads as its own 1.4 KB gzip chunk; nothing polls. The startup chunk grew
0.1 KB (448.9 KB: the endpoints and keys), the conversation route's 0.1 KB (84.4 KB).

### Files read as pages and links to files (M16 H6)

A Word document, a workbook, a deck or words read as a page costs the server once per file, per
reader's language, per ten minutes on an instance (`viewBodyOf`'s cache, sixteen pages at most):
up to `VIEW_MAX_BYTES` (20 MB) read into memory, each part inflated on the thread pool under 16 MB
(48 MB a file), two files at a time (`views`), the page cut at a megabyte of HTML; a list of values
or words reads its first 2 MB. A link to a file costs its bytes each time it's fetched: three
hundred fetches an hour a link and a hundred and twenty an address, at most, with a picture sent as
its preview rendition rather than the original. The files place costs two queries a page (the page
and its counts) over the asset index, whatever the scope. A link's bytes leave from the instance
(no `FILES_S3_*` on production), so they cost what its traffic costs, under the instance's own bill
("What a person costs", below).

## What a person costs (M16 H7)

AI is the cost that grows with each person; the rest is the instance's own bill, shared. What a
call costs is `lib/ai-costs.ts` (the server's one price list: Anthropic's page and the speech
providers' read on the day it names, US dollars, the ECB's euro rate of that week), and the
operator reads what the window's calls actually cost in the product metrics (`ai.cost`: in euros,
per person active over thirty days, by plan, by feature, and how many it couldn't price), so the
assumption below gives way to a measurement as soon as there are people.

Production ran every AI feature on Claude Opus 5.5 until this change: it sets
`ANTHROPIC_API_KEY` and neither model, so the light features fell back to the top one. Haiku 5.5 is
forty times cheaper in and out, so the light model is now Haiku 5.5 unless the operator sets
another, and the two features that ask the most (finding follow-ups, an organization's agent)
run on the top model only where someone pays (`aiModel` and `agentModel` in core's plans, said on
the pricing page for the agent).

Produced by `COST_TABLE=<file> pnpm vitest run test/ai-costs.test.ts` in `apps/server`
(2026-10-19): each feature's request at the bounds the code sets, measured from what the real
prompt builders send to a stand-in (system and message characters; output at its `max_tokens`),
read at a token a character, a ceiling no language's words reach; a voice note at ten minutes,
its longest.

Prices: https://platform.claude.com/docs/en/about-claude/pricing, read 2026-10-19; 1.1253 US dollars to the euro (ECB, 2026-10-16).

| Feature | Sends at most (characters) | Answers at most (tokens) | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- | --- | --- |
| rewrite | 4,579 | 8,192 | €0.0040 | €0.08 | €0.16 |
| translate | 4,294 | 8,192 | €0.0040 | €0.08 | €0.16 |
| catch-up | 60,825 | 4,096 | €0.0072 | €0.14 | €0.29 |
| ask | 61,192 | 4,096 | €0.0073 | €0.15 | €0.29 |
| actions | 61,206 | 8,192 | €0.0091 | €0.18 | €0.36 |
| brief | 16,825 | 4,096 | €0.0033 | €0.07 | €0.13 |
| cai | 11,322 | 1,024 | €0.0015 | €0.03 | €0.06 |
| friend | 11,685 | 512 | €0.0013 | €0.03 | €0.05 |
| search | 1,929 | 512 | €0.0004 | €0.0080 | €0.02 |
| search-answer | 15,766 | 4,096 | €0.0032 | €0.06 | €0.13 |
| agent | 55,692 | 2,048 | €0.0059 | €0.12 | €0.23 |
| transcribe | ten minutes of audio | — | €0.05 (OpenAI's estimate) | | |

| Plan | Model for the heavy work | Allowance | Dearest call | A month at every allowance | An assumed month |
| --- | --- | --- | --- | --- | --- |
| personal | light | 10 assists a day | €0.05 | €16.00 | €0.11 |
| pro | top | 200 assists a day | €0.36 | €2,178.96 | €0.52 |
| business | top | 200 assists a day | €0.36 | €2,178.96 | €0.52 |
| enterprise | top | 1,000 assists a day | €0.36 | €10,894.80 | €0.52 |
| organization free | light | 50 answers a day | €0.0059 | €8.79 | €0.27 |
| organization business | top | 2,000 answers a day | €0.23 | €14,061.74 | €10.93 |
| organization enterprise | top | 20,000 answers a day | €0.23 | €140,617.44 | €10.93 |

On Sonnet 5.5 a Business agent's month at its allowance is €7,030.87; a free organization's on the top model, as before M16 H7, €351.54. Business's €29 covers its agent up to 79 answers a day of the assumed size on Opus 5.5, 159 on Sonnet 5.5 and 3,183 on Haiku 5.5.

The assumed month (in `typicalMonth`: a rewrite, a catch-up, two questions to Cai, half a minute
of a voice note and one search for follow-ups a day, read at about 2.7 characters a token from
Anthropic's figures; an agent's 30 answers a day, nothing read from the cache) is an assumption,
said as one: the operator's `ai.cost.byPlan` replaces it. What the tables say:

- **The free plans are held.** A Personal account at the edge of every allowance costs €16 a
  month, ten 10-minute voice notes a day being the dearest; a free organization's agent at 50
  answers a day, €8.79. `ai-costs.test.ts` fails if either passes €20 or €15, so a change to an
  allowance or a free plan's model is a decision, never a drift. Before this change a free
  organization's agent could cost €351.54 a month, three of them per owner.
- **A paid plan's typical use is far under its price**, and its edge is not bounded by it: Pro's
  200 assists a day are €0.52 a month as assumed and €2,178.96 at the edge (follow-ups on Opus
  5.5 at 60,000 characters, 200 times a day); a Business agent's 2,000 answers a day reach
  €14,061.74. A count of calls a day doesn't bound what they cost: an allowance by cost (G) does.
- **Business's €29 covers its agent up to about 79 answers a day on Opus 5.5** at the assumed
  size, 159 on Sonnet 5.5 and 3,183 on Haiku 5.5. A clinic busier than that costs more than it
  pays until the allowance is by cost; setting `ANTHROPIC_MODEL` to Sonnet 5.5 halves it (⛔ the
  owner's choice: price and model).
- **A voice note's length is the device's word.** The server sends a recording only with a stated
  length of ten minutes at most and 25 MB, so a note that lies about its length at a low bitrate
  is billed for what it holds; reading the length from the file before it's sent is G's.
- **The instance** (the server and its database, one container on EasyPanel) is a fixed monthly
  bill whatever the use; its price is the owner's (⛔), and per person it's that bill divided by
  those on it. Storage is its volume (no `FILES_S3_*`), mail is Postmark's plan, push is Expo's
  (free), and calls relay through Cloudflare only when they can't connect directly.

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
answer; the card itself is sent by the server, not written by the model. Where an organization
takes orders, its menu adds a line per thing a customer may order (50 at most, the catalog's
ceiling) and one query for the counts, read once per reply; an order the model asks for is
checked and written by the server as anyone's is.

Stock (R60) costs a view that lists a catalog with something sold by the piece one indexed
query for the host's counts (`stockFor`; none without such an item), an order three statements
inside the transaction it already runs (the counts read under their row locks, one update for
every line, one insert of what it took), and a give-back one statement (a cancel's or a
removal's, or two more CTEs in the erasure's own). A count that changes tells the host's devices
once (`booking.changed`, two small queries to find whose), never a poll.

Connected calendars in step (R96). Offering or taking a slot costs one indexed query on the
host's (or the providers') connections; a calendar last read more than a minute ago is read again
then, one provider call per calendar (Google's list and one free/busy question for up to 50
calendars; Microsoft a page per calendar), so a host's calendar is asked at most once a minute
however many people look, and a slot waits four seconds at most for it. Writing plans costs
nothing on a change but one query to find who has Plans on and one queued job per connection
per ten-second bucket (a burst is one run); a run reads the person's cards ahead (the calendar's
own two queries) and the events written, and calls the provider only for what differs (a hash
per event), at most 100 writes a run, four at a time. The hourly sweep takes 200 connections a
run, background, and for most of them calls no provider at all. No model, no device work.

## Cai and the Caime Friends (R67, R71, R72)

Nothing runs until someone writes to one. A message to one queues one job (deduplicated by
message, answered once for a burst) and skips everything else a message costs (notifications,
suggestions, topics, follow-ups, automations). What's written is read by the rules first (core
`chatIntent`, a few regular expressions, no query): a greeting, "how can you help", thanks or a
sticker is answered from the account's own lines with one or two inserts; the four questions
about one's own open things read what's open in three queries (tasks with a filtered count, and
the week's agreed cards), no model, from Cai or any friend. A friend without the model tells a
tip: one count and one insert. Anything else goes to the model only for an adult with AI assist
on, inside their daily allowance: the light model at low effort, Cai at most 1,024 tokens out and
a friend 512, reading at most 12 messages (each clipped to 600 characters) and at most 20 lines
of open items; a friend reads only its own part of them (Panda, Momo, Zuzu), and the four others
read none and run no query for it (R71). The accounts are eight rows seeded once by a migration;
their ids are constants, so nothing looks them up. On devices the avatar's id check and the two
marks cost 0.4 KB of the first download (449.6 KB gzip, measured 2026-10-05); the friends' lines
and characters are the server's, never downloaded. Speaking someone's Arabic (R72) adds no query:
the reader cache that already held their language holds their choice and country too (the same
row, one more column), what they write is read for a dialect by a word list in memory, and the
Egyptian, Gulf and Levantine lines are three overlays of 71 entries made into translators once at
start. The model is told it in one sentence of 173 characters at most (variety and country), so
a model answer costs what it did.

## Cai keeps going (R68)

A follow-up costs nothing until its time: the reminders sweep that already runs every half
minute picks it up with the same query, and the offer is two or three queries and one message,
no model. Sending it is one message, as any send. The brief is one job a day per person who asked
for it (each run queues the next; nothing polls), three queries and one message, no model.
Settings · Cai is two queries (the follow-ups, and the last decisions per kind in one windowed
query). Forgetting writes one field. The settings screen and the offer's buttons load with
their own routes; what the first download gained (Attention's "Write to", the brief's preference,
three endpoints) is 0.2 KB: 449.8 KB gzip, measured 2026-10-06.

## Recording (R52, not built)

When it comes, each recorded minute costs the speech-to-text provider's price per minute, paid
once per call, plus one short model turn per summary or action list asked for. The plans carry
monthly minute allowances for it (Pro and Business; none free), set from the provider's price
once a provider has passed the test in R52; until then the line stays unpriced here rather than
guessed.

## Meetings with guests (R84)

An invitation is one mail (the transactional sender, with its calendar part), one token row and,
the first time for a meeting, one group, one card and one row joining them; at most eight people a
meeting, thirty invitations an hour a person. Nothing runs on a timer for it.

## Mail (R75)

A mail in is a message: parsed by the provider, stored and read by the rules as a sent message
is (one send, its effects after the response), its attachments through the files pipeline under
the sender's own storage cap, and nothing more while a request waits (held, told once). A reply
out is one job and one provider call (a fraction of a cent at Postmark's rates), the message's
files attached up to 10 MB, one row per message; a delivery event is one webhook and one update.
No model call unless assist asks about the message as it would about any other. The provisional
people a domain gathers are rows, swept daily when silent a year (`mail.sweep`, one statement).
A conversation with someone reached by mail costs its view one more query (the thread's
subject, `mailSubject`); every other conversation's view is as it was.

Checking who sent a mail in (`lib/mail-auth.ts`) costs the server 1.0 to 1.1 ms of CPU a mail
with DNS answered at once (a 2.8 KB signed mail, two runs of 500 on the dev container,
2026-10-13: the RSA verification and the parse), plus its lookups: one key per DKIM signature, the From domain's
DMARC record and SPF's (at most ten, as SPF allows), each at most 4 s twice. The raw message
travels beside the parsed one, so a mail's webhook is about twice its size (the 60 MB limit
holds Postmark's 35 MB mail). Nothing is kept of it.

What the provider costs (Postmark's prices, read 2026-10-13, postmarkapp.com/pricing): every mail
sent and every mail received counts once, and each Cc'd or Bcc'd address at the domain once more.
Free carries 100 a month (the closed beta: sign-up codes, resets, invitations). Pro is $16.50 a
month for 10,000 and $60.50 for 50,000, then $1.30 per 1,000; Basic ($15) has no inbound, so it
can't carry Caime Mail. The staff addresses cost nothing while Cloudflare Email Routing holds
them, and DMARC reports nothing (Postmark's free weekly digest). Google Cloud credits don't pay
for Postmark (startup credits exclude third-party and Marketplace services); they pay for what
runs on Google Cloud. Weighed and left: Amazon SES (about $1 for 10,000, but a second adapter,
raw MIME through S3 and a sandbox to leave, worth it only past a few hundred thousand a month),
Resend (its inbound webhook carries no content), Mailgun (inbound routing from its $35 plan),
SendGrid (no free plan since 2025), Cloudflare's own sending (beta, transactional only), and a
mail server on a Compute Engine machine (outbound port 25 is blocked there, and deliverability
would be Caime's to earn).

## The public site

Each page of the site (`/business`, `/pricing`, `/security`, `/developers`, `/about`) is written
into the app's shell on request from constants and the plans, with no query (a person's or an
organization's page queries once), and is sent with `public, max-age=600`. The pricing page asks
Stripe for its prices through billing's ten-minute cache, so at most one request to Stripe every
ten minutes for every visitor together, and none when billing isn't connected. A visitor
downloads the shell's HTML and CSS and no script. Its fonts are the app's own files, declared once
in the shell (Inter 400, 600 and 700 and Nunito 800 on the landing page: 87 KB in their Latin
cuts), cached for a year and the very files the app loads once someone signs up. The theme's
variables cost the landing page 0.3 KB gzip (7.4 to 7.7 KB). An entry screen's twin carries the
app's brand panel, wordmark and characters as inline SVG so nothing moves when the app takes
over: 3.5 KB gzip more each (`/welcome` 5.4 to 8.9 KB, `/sign-in` 5.2 to 8.7 KB, measured against
the live pages on 2026-10-06).
