# Caime apps: the API for organizations

An organization's owner or admin adds an **app** on the organization's setup screen (Setup → Apps). An app
is how a helpdesk, a CRM or your own bot works with the organization's Business inbox. Each app:

- acts as its own **bot** on the team. Customers see its replies as the organization's, always
  marked **Automated** (R16). Its replies never take a conversation, and never count as the
  team's answer: the customer is still waiting for a person until one answers or the app
  resolves it.
- has a **token**, shown once, that reaches only the routes below, only with the permissions it
  was given, and only the organization's own conversations.
- can have a **webhook** that hears what customers write and how conversations move, signed with
  a secret shown once.

Replace a token from the app's sheet and the old one stops at once. Replace the webhook secret
and the old one keeps signing deliveries beside the new one for 24 hours (a second `v1` in
`Caime-Signature`), so your app switches in its own time; the sheet says until when. Removing an
app stops its token and webhook and takes its bot off the team.

## Authentication

```
Authorization: Bearer cai_…
```

Requests are rate-limited to 600 a minute per token. A route the token can't use answers
`403 token_route`; a missing permission answers `403 token_scope`; a revoked or unknown token
answers `401`, and so does every token of an organization while Caime has suspended it (its team
sees why on its page). While it's suspended, nothing is written in its conversations, by anyone:
a write answers `409 org_suspended`.

## Permissions and routes

| Permission | Route | What it does |
| --- | --- | --- |
| any | `GET /v1/apps/me/deliveries?status=&after=&limit=` | The app's webhook deliveries (`id`, `event`, `status`, `attempts`, `lastStatus`, `lastError`, `createdAt`, `deliveredAt`), newest first, or with `after=<id>` the ones since that delivery, oldest first: an app that was down walks forward from the last id it handled. `status=failed` lists what gave up |
| any | `POST /v1/apps/me/deliveries/:id/retry` | A failed delivery queued afresh, with the whole schedule again (`{ "delivery": … }`; 404 unless it's this app's and failed) |
| any | `GET /v1/apps/me` | Who this token is: `{ "app": { "id", "name", "orgId", "orgHandle", "orgName", "botUserId", "scopes", "events" } }`. The `orgId` is what the routes below take, so the first call needs nothing but the token (`caime.me()` in the SDK) |
| `inbox:read` | `GET /v1/orgs/:orgId/inbox?view=` | The inbox, by view: `customer_waiting`, `new`, `mine`, `waiting`, `escalated`, `resolved` |
| `inbox:read` | `GET /v1/orgs/:orgId/calendar?from=&to=` | The organization's bookings in a window (ISO 8601, up to a year): the appointments its team confirmed or was asked (`items[]`: `messageId`, `conversationId`, `customer`, `customerOrg` (the organization the customer books for, R64, else null), `title`, `at`, `hasTime`, `place`, `state`, `booking` with what was booked and who does it), what the Business inbox's Bookings view shows |
| `inbox:read` | `GET /v1/orgs/:orgId/orders?limit=` | The orders in its customer conversations, newest first (`orders[]`: `messageId`, `conversationId`, `customer`, `reference`, `summary`, `amount`, `state`, `createdAt`), what its Orders view shows; the order itself is moved on in the conversation |
| `messages:read` | `GET /v1/conversations/:id` | One conversation, with its thread (state, who has it) |
| `messages:read` | `GET /v1/conversations/:id/messages?before=&after=&limit=` | Its messages, oldest first |
| `messages:read` | `GET /v1/files/:id`, `GET /v1/files/:id/thumb`, `GET /v1/files/:id/preview` | A file a message carries (`message.files[].id`), as its bytes, its thumbnail (WebP, 480 px at most) and its preview (1280 px at most, else the cleaned original) where the file is an image: the same files the team sees in that conversation, nothing else |
| `messages:write` | `POST /v1/conversations/:id/messages` | Reply as the bot: `{ "clientId": "<uuid>", "body": "…" }`. A retried `clientId` returns the first message, never a second |
| `threads:write` | `POST /v1/business/:id/assign` | `{ "userId": "<person on the team>" }`, or `null` for nobody |
| `threads:write` | `POST /v1/business/:id/resolve`, `…/reopen`, `…/escalate` | Escalate takes an optional `{ "note": "…" }` and tells the owner and admins |
| `threads:write` | `DELETE /v1/business/:id/escalation` | Stop escalating |
| `updates` | `GET /v1/orgs/:orgId/updates?before=&limit=` | The organization's updates, newest first, with who posted each (`postedBy`, `"automated": true` for an app's bot) and how many follow, never who |
| `updates` | `POST /v1/orgs/:orgId/updates` | Post one to everyone who follows it: `{ "body": "…", "clientId": "<uuid>" }` (up to 2,000 characters). It reads as the organization's. A retried `clientId` returns the first update (200), posted and told once. At most 30 an hour for each organization, its team and its apps together (then 429) |
| `updates` | `PATCH /v1/orgs/:orgId/updates/:id`, `DELETE …` | Change one (`{ "body": "…" }`) or take it back. Followers' notifications of it change with it, or go. At most 60 changes an hour for each organization (then 429); the same text again changes nothing |
| `kits` | `GET /v1/kits`, `PUT /v1/kits/:key`, `DELETE /v1/kits/:key` | The app's own kinds of card (below) |
| `kits` + `messages:write` | `POST /v1/conversations/:id/messages` | Send one: `{ "clientId", "kind": "kit", "payload": { "kit": "custom", "key", "fields" } }` |
| `kits` | `POST /v1/messages/:id/kit`, `PATCH /v1/messages/:id/kit` | Move one of its cards on (`{ "to": "<state>" }`), or change what it says (`{ "fields": { … } }`) |

An app answers customers; it never writes to someone first. A person on the team does, from the
Business inbox, and it reaches them as a message request (R14). An organization's updates go only
to people who chose to follow it; neither its apps nor its team learn who they are, only how many.

An organization can also turn on Caime's own **AI agent** (the organization's page → AI agent),
which answers customers first from what the organization tells it. Its messages arrive like a
bot's, with `"automated": true` and `"aiAgent": true`. It is never given a conversation and never
counts as the team's answer, but it can hand one to the team (`handed_over`) or close one the
customer is done with (`resolved`): `business.thread` says who moved the thread in `by`.

Responses are the same JSON the Caime apps read (`packages/core/src/api.ts`). Errors are
`{ "error": { "code": "…", "message": "…" } }`.

## From Node: `@caime/sdk`

The routes above and the webhook checks below, typed, in `packages/sdk` (Node 22 or later; the
client runs wherever `fetch` is). It's built from the repository for now (⛔ not on npm yet).

```ts
import { Caime, CaimeError, parseWebhook } from '@caime/sdk';

const caime = new Caime({ token: process.env.CAIME_TOKEN!, baseUrl: 'https://cai.me' });

const inbox = await caime.inbox(orgId, 'customer_waiting');
for (const thread of inbox.threads) {
  const { messages } = await caime.messages(thread.conversationId, { limit: 20 });
  await caime.send(thread.conversationId, 'Thanks, someone will be with you shortly.');
  await caime.assign(thread.conversationId, null);
}

// In your webhook handler: the raw body as received, and the request's headers.
try {
  const event = parseWebhook(process.env.CAIME_WEBHOOK_SECRET!, req.headers, rawBody);
  if (event.event === 'business.message' && !event.data.customer.under18) {
    // event.data.message.body, event.data.conversationId; de-duplicate on event.id
  }
} catch (e) {
  // A WebhookError: its `reason` is 'signature', 'timestamp' or 'body'. Answer 400.
}
```

| Method | Route | Permission |
| --- | --- | --- |
| `inbox(orgId, view)`, `calendar(orgId, from, to)`, `orders(orgId, { limit })` | `GET /v1/orgs/:orgId/inbox`, `…/calendar`, `…/orders` | `inbox:read` |
| `file(id)`, `thumbnail(id)`, `preview(id)` | `GET /v1/files/:id`, `…/thumb`, `…/preview` | `messages:read` (a `Response` whose body is the file) |
| `deliveries({ status, after, limit })`, `retryDelivery(id)` | `GET /v1/apps/me/deliveries`, `POST …/:id/retry` | any |
| `conversation(id)`, `messages(id, { before, after, limit })` | `GET /v1/conversations/:id`, `…/messages` | `messages:read` |
| `send(id, body, { clientId })`, `sendCard(id, key, fields, { clientId })` | `POST /v1/conversations/:id/messages` | `messages:write` (+ `kits`) |
| `assign(id, userId \| null)`, `resolve(id)`, `reopen(id)`, `escalate(id, note)`, `stopEscalating(id)` | `POST /v1/business/:id/…`, `DELETE …/escalation` | `threads:write` |
| `updates(orgId, { before, limit })`, `postUpdate(orgId, body)`, `editUpdate(orgId, id, body)`, `removeUpdate(orgId, id)` | `/v1/orgs/:orgId/updates` | `updates` |
| `kits()`, `putKit(key, definition)`, `removeKit(key)`, `moveCard(messageId, to)`, `changeCard(messageId, fields)` | `/v1/kits`, `/v1/messages/:id/kit` | `kits` |
| `person()`, `myInbox()`, `search(q, { understand })`, `tasks(view)`, `addTask(task)`, `updateTask(id, change)` | `GET /v1/me`, `GET /v1/inbox`, `GET /v1/search`, `/v1/tasks` | A personal (`cap_`) or OAuth (`cao_`) token's routes (below); `conversation`, `messages` and `send` work for a person too |

A refusal throws a `CaimeError` with the server's `status`, `code` and `message` (and
`retryAfter`, in seconds, on a 429). `send` and `postUpdate` make up a `clientId` when none is
given; pass your own to retry safely. `verifyWebhookSignature(secret, header, rawBody)` answers
yes or no where `parseWebhook` throws; both refuse deliveries older than five minutes
(`toleranceSeconds`). Personal (`cap_`) and OAuth (`cao_`) tokens work with the same client, on
the routes they reach.

## Webhooks

Caime `POST`s JSON to the app's address (https only) for the events it listens to:

| Event | When | `data` |
| --- | --- | --- |
| `business.message` | A customer writes | `conversationId`, `message` (`id`, `seq`, `kind`, `body`, `createdAt`), `card` (what a card they sent says: `kit` with `key`, `name` and `custom`, `fields`, `state`, `booking`, `order`; `null` for words), `customer` (`id`, `displayName`, `handle`, `under18`: never market to them) |
| `business.thread` | Someone assigns, escalates, resolves or reopens a conversation, or the organization's AI agent hands it to the team (`handed_over`) or closes it (`resolved`) | `conversationId`, `change`, `state`, `assignee`, `by` (`person`, `app` or `ai_agent`) |
| `kit.posted` | Someone on the team sends a card: one of the app's own kinds (that app alone hears), or one of Caime's (an appointment, an order, a Pay card: every app of the organization that listens hears, so the one that keeps the books sees the order placed) | `conversationId`, `message` (`id`, `seq`, `createdAt`), `kit` (`key`, `name`, `custom`), `fields`, `state`, `booking`, `order`, `by` (`person`), `customer` |
| `kit.moved` | A card moves on: the team's move, the customer's, or a Pay card paid through Checkout (`to: "paid"`); the app's own card to that app alone, one of Caime's to every app that listens, never a move the app made itself. A Form card the customer answers moves from `sent` to `answered` | as `kit.posted`, with `from` and `to`, and `by`: `person` (the team) or `customer`. A Form card carries `form` (`id`, `name`, `questions`: each an `id`, a `label` and a `kind`) and `answers` (the customer's answers by question id, `null` until they answer) |
| `message.deleted` | A message in a customer conversation is removed for everyone (its sender's delete, or the operator's review): drop any copy of its words you kept | `conversationId`, `messageId` |
| `conversation.erased` | A customer conversation is erased at the customer's request (every message in it is gone): drop whatever you kept of them | `conversationId`, `erased` (how many messages) |
| `ping` | You pressed "Send a test delivery" | `appId` |

Every body is `{ "id", "event", "orgId", "createdAt", "data" }`, with the headers
`Caime-Event`, `Caime-Delivery` (the delivery id, for de-duplicating) and
`Caime-Signature: t=<unix seconds>,v1=<hex>`. Answer with any 2xx within 10 seconds, connecting
included; the body of your answer is ignored and redirects aren't followed. Anything else is
tried again after 30 seconds, then 1, 2, 4 and 8 minutes: six attempts in all, over about a
quarter of an hour, after which the delivery is marked failed and stays in the app's sheet with
why. Nothing is replayed on its own: an app that was down longer lists its deliveries
(`GET /v1/apps/me/deliveries?status=failed`, or `after=` the last id it handled) and retries each
(`POST /v1/apps/me/deliveries/:id/retry`), or reads what it missed through the API (the inbox,
and a conversation's messages `after=` the last `seq` it saw) when it comes back. Addresses on private networks are refused, when you save them and again each time one is
looked up.

Deliveries can arrive out of order, and now and then more than once: de-duplicate with
`Caime-Delivery`, and put messages in order by `message.seq`.

### Checking the signature

`v1` is the HMAC-SHA256 of `"<t>.<raw body>"` with the webhook secret. For a day after the secret
was replaced the header carries two (`t=…,v1=<new>,v1=<old>`); accept the delivery if any matches.
Compare in constant time and refuse old timestamps, so a captured delivery can't be replayed:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(secret, header, rawBody, toleranceSeconds = 300) {
  const parts = header.split(',').map((kv) => kv.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return parts
    .filter(([k]) => k === 'v1')
    .map(([, v]) => Buffer.from(v ?? '', 'hex'))
    .some((given) => given.length === expected.length && timingSafeEqual(given, expected));
}
```

## Acting as yourself: personal access tokens

A person can make tokens for their own scripts in **You → Developer**: a name, what it may do,
and how long it lasts (30 days, 90 days, a year, or until revoked). A token is shown once and
starts `cap_`. Send it as `Authorization: Bearer cap_…`; it acts as that person, and a message
it sends shows "via" the token's name. A live token is also a row under **You → Apps →
Connected**, beside the apps let in, and can be ended there as well. From Node, the same
`Caime` client: `person()`, `myInbox()`, `search(q)`, `tasks(view)`, `addTask(task)`,
`updateTask(id, change)`, with `conversation`, `messages` and `send` as for an app.

| Permission | Route | What it does |
| --- | --- | --- |
| `profile:read` | `GET /v1/me` | Who it acts for: id, handle, name, avatar, time zone, locale (no email, privacy or plan) |
| `messages:read` | `GET /v1/inbox`, `GET /v1/conversations/:id`, `GET /v1/conversations/:id/messages`, `GET /v1/search?q=` | Their inbox, conversations and search. A search's response says who read the query (`understoodBy`: `rules`, or `ai` when the person has AI assist on, the words needed a model and the request said the typing was done, `understand=1`, with `label` to show beside the interpretation). A time at the end ("photos from last week", "decisions in March") is the days to search (`query.period`), never a person |
| `messages:write` | `POST /v1/conversations/:id/messages` | Send as them: `{ "clientId": "<uuid>", "body": "…" }` |
| `actions:read` | `GET /v1/tasks` | Their actions and what they wait for |
| `actions:write` | `POST /v1/tasks`, `PATCH /v1/tasks/:id` | Add, change and finish actions. Send a `clientId` of your own (8 to 64 characters) with a new one and sending it again returns the same action |

Anything else answers `403` with `token_route` (or `token_scope` without the permission): a
token never changes a password, privacy or sessions, makes tokens, exports or deletes an
account. Revoked or expired, it answers `401`.

An organization decides whether its team's own tokens reach its conversations (off unless its
owner or an admin turns on **Team members' own apps** in its setup). Until then a token acting
for someone on its team who doesn't run it answers `403 org_apps_closed` for the team's side of
its customer threads, its spaces' conversations and a thread written as it, and `GET /v1/inbox`,
`GET /v1/search` and `GET /v1/tasks` leave those out rather than refusing; the person's own
conversations, their side as anyone's customer and the owner's and admins' own tokens are never
kept out. The same holds for an OAuth app's tokens and a bridge's.

### Bridges: Zapier, Make, n8n, Pipedream and IFTTT

The same token, made in one tap (**You → Apps → Discover → Automation**): each platform is a
row there, and its sheet makes a token named after it, scoped to what the person ticks (reading
by default), with no expiry, shown once with where to paste it on the platform (the platform's
own web-request step, a header `Authorization: Bearer cap_…`: Webhooks by Zapier's Retrieve
Poll and Custom Request, Make's HTTP module, n8n's HTTP Request node with a Header Auth
credential, Pipedream's HTTP Request step, IFTTT's Make a web request with Additional headers).
One token lives per platform and person: a new one ends the old, **Stop** ends it, and the row
under Connected shows when it was last used. A recipe polls the person's routes above (the
inbox, the actions) and calls them; nothing is pushed to the platform yet (personal webhooks
follow once the polling bridges are in use).

## The API as a document

`GET /v1/openapi.json` is an OpenAPI 3.1 document of every route above, an app's and a
person's, written from the same schemas the routes parse their query and body with (so it
can't drift from them), with each route's permission as a security requirement (`appToken`,
`personalToken`) and the contract's name for each answer. It needs no token and is cached for
ten minutes. Import it into an automation platform, an agent framework or a client generator
rather than hand-writing the routes; the responses' shapes are the ones in
`packages/core/src/api.ts`, as described here.

## Caime as tools for an AI agent: `@caime/mcp`

`packages/mcp` is a Model Context Protocol server over the person methods above, for an agent
someone runs themselves (Claude Desktop, Claude Code, any MCP client): JSON-RPC over stdio and
nine tools, `me`, `inbox`, `search`, `tasks`, `add_task`, `update_task`, `conversation`,
`messages` and `send_message`, each a bounded projection of its route's answer (who a
conversation is with and its last line, never every field of a view) and each naming the
permission its token needs. It acts as the personal token it's given and nothing more: a
refusal comes back as the tool's error with the server's code (`token_scope`, `token_route`),
every call is the token's and shows as such, and a private conversation's words never reach it.
Build it from the repository (`pnpm --filter @caime/mcp build` writes
`packages/mcp/dist/caime-mcp.mjs`; it isn't published to npm yet) and point the client at it:

```json
{
  "mcpServers": {
    "caime": {
      "command": "node",
      "args": ["/path/to/caime/packages/mcp/dist/caime-mcp.mjs"],
      "env": { "CAIME_TOKEN": "cap_…" }
    }
  }
}
```

`CAIME_BASE_URL` points it at another Caime. The server writes nothing to stdout but protocol
messages and nothing to disk; end the token under Connected and the agent's access ends with it.

## Acting for other people: OAuth

An app other people use (a digest, a planner, an assistant) asks each of them to let it in, with
the authorization code flow and PKCE. Register it in **You → Developer → Your apps**: its name,
its website, the addresses people return to, and where it runs.

- **Phones and browsers** (a public app): no secret, since it couldn't keep one. It proves
  itself with PKCE every time.
- **Its own server** (a confidential app): a secret, `cas_…`, shown once. It sends it as HTTP
  Basic (`client_id:client_secret`) or as `client_secret` in the form, and uses PKCE as well.
  Replace it from the app's sheet in Settings · Developer: the new one is shown once, and the old
  one is still taken for 24 hours (the sheet says until when), so your server switches in its
  own time.

Return addresses are exact: https, plain http only on `localhost`, or the app's own scheme
(`myapp://callback`). Everything below is also at `/.well-known/oauth-authorization-server`
(RFC 8414), so most OAuth libraries need only that address and the client ID.

### 1. Send them to Caime

```
https://<caime>/oauth/authorize?response_type=code&client_id=app_…
  &redirect_uri=https%3A%2F%2Fyour.app%2Fcallback&scope=messages%3Aread%20messages%3Awrite
  &state=<random>&code_challenge=<base64url SHA-256 of the verifier>&code_challenge_method=S256
```

`scope` is the permissions from the table above, separated by spaces; `code_challenge_method` is
only `S256`, and the verifier is 43 to 128 characters the app keeps until step 2. They sign in if
they need to, see the app's name, who made it, its website and what it asks for, and choose.
Either way they go back to the return address, with `state` as it was sent:

- Allowed: `?code=…&state=…`. The code works once, for ten minutes.
- Declined: `?error=access_denied&state=…`.

A request that isn't right (an unknown app, a return address it didn't register, a permission
that doesn't exist) is shown to them as such and sends them nowhere. Nobody under 18 lets an app
in.

### 2. Trade the code for tokens

```
POST /v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=…&redirect_uri=…&client_id=app_…&code_verifier=…
```

```json
{
  "access_token": "cao_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "car_…",
  "scope": "messages:read messages:write"
}
```

Call the routes in the table above with `Authorization: Bearer cao_…`, within the permissions
they allowed. Sending someone back to consent only ever adds: asking for something new adds it,
asking for less keeps what the app had, and a token has the scopes its request asked for (a
refreshed pair keeps them). The person takes it all back by removing the app. A message the app
sends shows "via" its name (to a
business customer, "via an app"). The token and revocation endpoints and the discovery document
answer any origin (CORS, without credentials), so an app that runs only in a browser can trade
its code itself.

### 3. Refresh

`grant_type=refresh_token&refresh_token=car_…&client_id=app_…` answers a new pair, and the
refresh token sent is spent. Sent again, it means a copy leaked: the grant ends, both tokens
stop, and the person has to let the app in again. A refresh token lasts 30 days.

### Errors

The token and revocation endpoints answer as RFC 6749 says, never with Caime's own error shape,
and with `cache-control: no-store`:

| `error` | Status | When |
| --- | --- | --- |
| `invalid_client` | 401 | An unknown or removed app, or a confidential one without its secret |
| `invalid_grant` | 400 | A code or refresh token that isn't valid, was used or has expired; a `redirect_uri` or verifier that doesn't match. A code used twice within its ten minutes ends what it gave; one turning up after it expired only is refused |
| `unsupported_grant_type` | 400 | Anything but `authorization_code` and `refresh_token` |
| `invalid_request` | 400, 413, 415 | A body that isn't a form (or JSON) the endpoint can read |
| `temporarily_unavailable` | 429 | Too many requests from one address (600 a minute); `retry-after` says when to try again |

Each comes with an `error_description` a developer can read.

### Ending it

- The app gives a token back with `POST /v1/oauth/revoke`, `token=…&client_id=…` (and its
  secret, if it has one), as RFC 7009 says: a refresh token ends the grant, an access token only
  itself. It answers `200` whatever the token was, and only ever ends the app's own.
- The person removes the app in **You → Apps**, where they see what it may do and
  when it last acted; its tokens stop at once.
- Removing the app in **Your apps** ends it for everyone who let it in.
- Recovering an account with a recovery code ends every app it let in, as it ends its sessions
  and personal tokens: whoever lost it may not be the one who allowed them.

### Listing it in Discover

People find apps under **You → Apps → Discover**. To list yours, open it under **You →
Developer → Your apps** and fill in the listing: a tagline (80 characters), a description, a
category, an icon (an image you upload), what it gives Caime (**Gives Caime**: calendar sync,
mail; a closed list, so a calendar sync or a mail connector is found by what it does for Caime,
not by its name), how it's paid for (free; free and paid plans; paid, with a free trial; paid,
with no free plan; included with a subscription: Caime never takes the money), which of Caime's
languages it works in, **where to get help** (a page, or `mailto:` and an address) and its
**privacy policy** (https), both required, up to five screenshots (8:5, at least 1280 pixels
wide, images you upload), what it does with a model if it puts people's words through one
(which model, what it keeps, for how many days, where it runs: shown as Caime shows its own
processors), and **where Connect goes**: your app's own sign-in, an
https address at a site among your return addresses or your website, which starts step 1 above.
Optionally the organization it's published under, if you're its owner or admin: a verified one
shows as such. Turn on **Listed in Discover** and save. Caime looks at it once, then it shows,
ordered by how many people connected it; declined, you see why, and changing it asks again, as
any change to what's shown does. Caime tells you (a notification, opened on Developer) when it's
listed or why it wasn't, and your list under Developer says how many people have it connected
now, never who. Whoever is asked to let it in sees the same publisher and icon Discover shows:
the organization it's published under (its owner and admins see it on their setup screen, with
where the listing stands), else you, with a tap to that page. Signed in as yourself,
`PATCH /v1/me/oauth-apps/:id` takes the same fields (`tagline`, `description`, `category`,
`provides`, `pricing`, `languages`, `supportUrl`, `privacyUrl`, `aiUse` as
`{ model, keeps, days, where }` or null, `screenshotIds`, `loginUrl`, `iconFileId`, `orgId`,
`listed`); no token reaches it.

### The marketplace

Every listed app also has a page on the web, `/marketplace/<slug>`, which anyone can open and
search engines index: its address is its name's (`weekly-digest`), given the first time it's
listed and kept for good, even if the app is removed, so a link to it never comes to mean another
app. `/marketplace` lists Caime's own and the bridges first, then the listed apps by how many
connected them and then the newest, a category at `/marketplace/<category>`; each page reads in
every language Caime does, and its **Connect in Caime** opens your app's sheet in Discover
(through sign-in for a visitor). A listed app's icon and screenshots are public with its page;
before it's let through, they're yours and the operator's alone.

**The bar.** Caime looks at every listing against the same points before it shows, written on
`/developers#bar` and checked by the operator one by one: a permission is asked for because the
app uses it today (never for a feature to come; reading everything is looked at closer); Connect
works to the end; the support address and privacy policy open (one that stops working takes the
app out); and none of exporting or backing up conversations wholesale, deleting in bulk,
copying Caime's own app, taking payments through Caime, training a model on what it reads, or one
account shared by several people. Apps act for people over 18. A change to what's shown asks
again; an app taken out (left broken, or no longer keeping to the bar) says why in a notification
to you, keeps its address, and comes back when you change it and Caime lets it through. There
are no ratings and no paid placement.

## Your own cards

An app can make its own kinds of card (PRD §74): a pharmacy's prescription that's being prepared,
then ready to collect; a school's permission slip; a workshop's repair. A card of one reads
like Caime's own, in the organization's conversations with its customers: what it is, its
main line, its details, where it stands and the moves each side may make. A kind of card is
data, never code or markup: whatever it and its cards say is shown as text.

```json
PUT /v1/kits/prescription
{
  "name": "Prescription",
  "description": "A prescription, and when it's ready",
  "icon": "clipboard-list",
  "fields": [
    { "key": "medicine", "label": "Medicine", "type": "text", "required": true },
    { "key": "readyBy", "label": "Ready by", "type": "datetime" }
  ],
  "states": [
    { "id": "preparing", "label": "Being prepared" },
    { "id": "ready", "label": "Ready to collect", "tone": "positive" },
    { "id": "collected", "label": "Collected", "tone": "positive" }
  ],
  "moves": [
    { "from": "preparing", "to": "ready", "label": "Mark ready", "who": "organization" },
    { "from": "ready", "to": "collected", "label": "I collected it", "who": "customer" }
  ]
}
```

| Part | Rules |
| --- | --- |
| key (in the address) | 2 to 40 lowercase letters, digits or `_`, from a letter. `PUT` makes it (201) or replaces it whole (200) |
| `name`, `description` | Up to 40 and 120 characters |
| `icon` | One of `clipboard-list` (the default), `package`, `truck`, `receipt`, `hand-coins`, `life-buoy`, `calendar-check`, `calendar-clock`, `badge-check`, `file-check`, `list-checks`, `images`, `chart-bar`, `map-pin` |
| `fields` | 1 to 12, each a `key`, a `label` and a `type`: `text`, `longtext`, `date` (`"2026-10-02"`), `datetime` (`{ "at": "<ISO time>", "hasTime": true }`), `amount` (`{ "value": 12.5, "currency": "EGP" }`) or `options` (with 2 to 12 `choices`, each a `value` and a `label`); `required` and `placeholder` if you like. The card's main line is its first required text field |
| `states` | 1 to 8, each an `id` and a `label`, and a `tone` (`positive`, `negative` or `neutral`). A card starts in the first |
| `moves` | Up to 24, each `from` one state `to` another, with the button's `label` and `who` makes it: `organization` (its team and its apps), `customer`, or `anyone` |
| `adultsOnly` | Never offered or sent in a conversation with anyone under 18. Any kind of card with an amount is |

Labels are plain text: control characters and the marks that reorder text are refused. An app
has up to 20 kinds of card. Its owners see them on the app's sheet, and its team can send them
from a customer's conversation (**Share → Cards**), which the app hears as `kit.posted`.

A card keeps the kind it was sent with: changing a kind or removing it (`DELETE /v1/kits/:key`),
or removing the app, never changes a card already sent, and it still moves as it did. An app
moves and changes only its own cards (and Caime's own cards its bot sent), and only as their
moves say: `PATCH` takes the fields to change (`null` removes one that isn't required) and
never where the card stands. Customers never send an organization's cards; they make the
customer's moves.

## Your calendar

Anyone over 18 can have Google Calendar, Outlook or Apple Calendar show their actions with a
due date and the meetings and appointments they agreed in Caime: **You → Apps → Your
calendar → Get a calendar address**. The address is shown once, starts
`https://…/v1/calendar/cal_` and is the only credential: a calendar app reads it with no
sign-in. Caime keeps only its hash (and never writes the address to its log), so it can't be
shown again; getting a new one ends the old one at once, **Stop** ends it, and so does
recovering the account. It answers `text/calendar` (RFC 5545), read at most 120 times
an hour, and nothing in a calendar changes anything in Caime.

| What | In the calendar |
| --- | --- |
| An open action of yours, or one you were asked, with a due date | On its day, or at its time for half an hour, never busy. What you're waiting on reads "Waiting on Sarah: …" |
| A meeting accepted, an appointment confirmed | At its time and for its length (an hour when it has none), busy, with where |
| Done, cancelled, declined, deleted, or in a conversation you've left | Gone at the next read |

Private conversations, message requests you haven't accepted and messages you deleted for
yourself are never in it. On an organization's team that keeps its conversations from its
members' own apps, what's from its conversations reads as its kind and the organization's name at
its time ("Meeting · Nile Dental", "Action · Nile Dental"), never the customer, the card's words,
its place or an amount; the plans Caime writes into a connected Google or Outlook calendar do the
same. Managing it (`GET`, `POST`, `DELETE /v1/calendar/feed`) needs you signed in: no token
reaches it.

## Not yet

Webhooks for anything outside the Business inbox and the app's own cards. An app's own cards
in conversations other than with its organization's customers.
