# Caime apps: the API for organizations

An organization's owner or admin adds an **app** on the organization's page (Apps → Add). An app
is how a helpdesk, a CRM or your own bot works with the organization's Business inbox. Each app:

- acts as its own **bot** on the team. Customers see its replies as the organization's, always
  marked **Automated** (R16). Its replies never take a conversation, and never count as the
  team's answer: the customer is still waiting for a person until one answers or the app
  resolves it.
- has a **token**, shown once, that reaches only the routes below, only with the permissions it
  was given, and only the organization's own conversations.
- can have a **webhook** that hears what customers write and how conversations move, signed with
  a secret shown once.

Replace a token or a secret from the app's sheet; the old one stops at once. Removing an app
stops its token and webhook and takes its bot off the team.

## Authentication

```
Authorization: Bearer cai_…
```

Requests are rate-limited to 600 a minute per token. A route the token can't use answers
`403 token_route`; a missing permission answers `403 token_scope`; a revoked or unknown token
answers `401`.

## Permissions and routes

| Permission | Route | What it does |
| --- | --- | --- |
| `inbox:read` | `GET /v1/orgs/:orgId/inbox?view=` | The inbox, by view: `customer_waiting`, `new`, `mine`, `waiting`, `escalated`, `resolved` |
| `messages:read` | `GET /v1/conversations/:id` | One conversation, with its thread (state, who has it) |
| `messages:read` | `GET /v1/conversations/:id/messages?before=&after=&limit=` | Its messages, oldest first |
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

## Webhooks

Caime `POST`s JSON to the app's address (https only) for the events it listens to:

| Event | When | `data` |
| --- | --- | --- |
| `business.message` | A customer writes | `conversationId`, `message` (`id`, `seq`, `kind`, `body`, `createdAt`), `customer` (`id`, `displayName`, `handle`, `under18`: never market to them) |
| `business.thread` | Someone assigns, escalates, resolves or reopens a conversation, or the organization's AI agent hands it to the team (`handed_over`) or closes it (`resolved`) | `conversationId`, `change`, `state`, `assignee`, `by` (`person`, `app` or `ai_agent`) |
| `kit.posted` | Someone on the team sends one of the app's kinds of card | `conversationId`, `message` (`id`, `seq`, `createdAt`), `kit` (`key`, `name`, `custom`), `fields`, `state`, `by` (`person`), `customer` |
| `kit.moved` | Someone moves one of its cards on (or a card of Caime's own its bot sent), never when the app did | as `kit.posted`, with `from` and `to`, and `by`: `person` (the team) or `customer` |
| `ping` | You pressed "Send a test delivery" | `appId` |

Every body is `{ "id", "event", "orgId", "createdAt", "data" }`, with the headers
`Caime-Event`, `Caime-Delivery` (the delivery id, for de-duplicating) and
`Caime-Signature: t=<unix seconds>,v1=<hex>`. Answer with any 2xx within 10 seconds, connecting
included; the body of your answer is ignored and redirects aren't followed. Anything else is
tried again, waiting longer each time, six times in all; the app's sheet shows the last
deliveries and why they failed. Addresses on private networks are refused, when you save them
and again each time one is looked up.

Deliveries can arrive out of order, and now and then more than once: de-duplicate with
`Caime-Delivery`, and put messages in order by `message.seq`.

### Checking the signature

`v1` is the HMAC-SHA256 of `"<t>.<raw body>"` with the webhook secret. Compare in constant time
and refuse old timestamps, so a captured delivery can't be replayed:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(secret, header, rawBody, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=')));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 ?? '', 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

## Acting as yourself: personal access tokens

A person can make tokens for their own scripts in **You → Developer**: a name, what it may do,
and how long it lasts (30 days, 90 days, a year, or until revoked). A token is shown once and
starts `cap_`. Send it as `Authorization: Bearer cap_…`; it acts as that person, and a message
it sends shows "via" the token's name.

| Permission | Route | What it does |
| --- | --- | --- |
| `profile:read` | `GET /v1/me` | Who it acts for: id, handle, name, avatar, time zone, locale (no email, privacy or plan) |
| `messages:read` | `GET /v1/inbox`, `GET /v1/conversations/:id`, `GET /v1/conversations/:id/messages`, `GET /v1/search?q=` | Their inbox, conversations and search |
| `messages:write` | `POST /v1/conversations/:id/messages` | Send as them: `{ "clientId": "<uuid>", "body": "…" }` |
| `actions:read` | `GET /v1/tasks` | Their actions and what they wait for |
| `actions:write` | `POST /v1/tasks`, `PATCH /v1/tasks/:id` | Add, change and finish actions. Send a `clientId` of your own (8 to 64 characters) with a new one and sending it again returns the same action |

Anything else answers `403` with `token_route` (or `token_scope` without the permission): a
token never changes a password, privacy or sessions, makes tokens, exports or deletes an
account. Revoked or expired, it answers `401`.

## Acting for other people: OAuth

An app other people use (a digest, a planner, an assistant) asks each of them to let it in, with
the authorization code flow and PKCE. Register it in **You → Developer → Your apps**: its name,
its website, the addresses people return to, and where it runs.

- **Phones and browsers** (a public app): no secret, since it couldn't keep one. It proves
  itself with PKCE every time.
- **Its own server** (a confidential app): a secret, `cas_…`, shown once. It sends it as HTTP
  Basic (`client_id:client_secret`) or as `client_secret` in the form, and uses PKCE as well.

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
- The person removes the app in **You → Connected apps**, where they see what it may do and
  when it last acted; its tokens stop at once.
- Removing the app in **Your apps** ends it for everyone who let it in.
- Recovering an account with a recovery code ends every app it let in, as it ends its sessions
  and personal tokens: whoever lost it may not be the one who allowed them.

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
due date and the meetings and appointments they agreed in Caime: **You → Connected apps → Your
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
yourself are never in it. Managing it (`GET`, `POST`, `DELETE /v1/calendar/feed`) needs you
signed in: no token reaches it.

## Not yet

Webhooks for anything outside the Business inbox and the app's own cards. An app's own cards
in conversations other than with its organization's customers.
