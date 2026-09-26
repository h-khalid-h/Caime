# Caishy apps: the API for organizations

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

An app answers customers; it never writes to someone first. A person on the team does, from the
Business inbox, and it reaches them as a message request (R14).

An organization can also turn on Caishy's own **AI agent** (the organization's page → AI agent),
which answers customers first from what the organization tells it. Its messages arrive like a
bot's, with `"automated": true` and `"aiAgent": true`, and it never takes a conversation, so an
app sees the same thread states whether or not the agent answered.

Responses are the same JSON the Caishy apps read (`packages/core/src/api.ts`). Errors are
`{ "error": { "code": "…", "message": "…" } }`.

## Webhooks

Caishy `POST`s JSON to the app's address (https only) for the events it listens to:

| Event | When | `data` |
| --- | --- | --- |
| `business.message` | A customer writes | `conversationId`, `message` (`id`, `seq`, `kind`, `body`, `createdAt`), `customer` (`id`, `displayName`, `handle`, `under18`: never market to them) |
| `business.thread` | Someone assigns, escalates, resolves or reopens a conversation, or the organization's AI agent hands it to the team (`handed_over`) or closes it (`resolved`) | `conversationId`, `change`, `state`, `assignee` |
| `ping` | You pressed "Send a test delivery" | `appId` |

Every body is `{ "id", "event", "orgId", "createdAt", "data" }`, with the headers
`Caishy-Event`, `Caishy-Delivery` (the delivery id, for de-duplicating) and
`Caishy-Signature: t=<unix seconds>,v1=<hex>`. Answer with any 2xx within 10 seconds, connecting
included; the body of your answer is ignored and redirects aren't followed. Anything else is
tried again, waiting longer each time, six times in all; the app's sheet shows the last
deliveries and why they failed. Addresses on private networks are refused, when you save them
and again each time one is looked up.

Deliveries can arrive out of order, and now and then more than once: de-duplicate with
`Caishy-Delivery`, and put messages in order by `message.seq`.

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
| `actions:write` | `POST /v1/tasks`, `PATCH /v1/tasks/:id` | Add, change and finish actions |

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

### 1. Send them to Caishy

```
https://<caishy>/oauth/authorize?response_type=code&client_id=app_…
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
they allowed; a message the app sends shows "via" its name. There is no CORS on these
endpoints, so an app that runs only in a browser trades the code on a server of its own.

### 3. Refresh

`grant_type=refresh_token&refresh_token=car_…&client_id=app_…` answers a new pair, and the
refresh token sent is spent. Sent again, it means a copy leaked: the grant ends, both tokens
stop, and the person has to let the app in again. A refresh token lasts 30 days.

### Errors

The token and revocation endpoints answer as RFC 6749 says, never with Caishy's own error shape,
and with `cache-control: no-store`:

| `error` | Status | When |
| --- | --- | --- |
| `invalid_client` | 401 | An unknown or removed app, or a confidential one without its secret |
| `invalid_grant` | 400 | A code or refresh token that isn't valid, was used or has expired; a `redirect_uri` or verifier that doesn't match. A code used twice ends what it gave |
| `unsupported_grant_type` | 400 | Anything but `authorization_code` and `refresh_token` |

Each comes with an `error_description` a developer can read.

### Ending it

- The app gives a token back with `POST /v1/oauth/revoke`, `token=…&client_id=…` (and its
  secret, if it has one), as RFC 7009 says: a refresh token ends the grant, an access token only
  itself. It answers `200` whatever the token was, and only ever ends the app's own.
- The person removes the app in **You → Connected apps**, where they see what it may do and
  when it last acted; its tokens stop at once.
- Removing the app in **Your apps** ends it for everyone who let it in.

## Not yet

Webhooks for anything outside the Business inbox.
