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

Responses are the same JSON the Caishy apps read (`packages/core/src/api.ts`). Errors are
`{ "error": { "code": "…", "message": "…" } }`.

## Webhooks

Caishy `POST`s JSON to the app's address (https only) for the events it listens to:

| Event | When | `data` |
| --- | --- | --- |
| `business.message` | A customer writes | `conversationId`, `message` (`id`, `seq`, `kind`, `body`, `createdAt`), `customer` (`id`, `displayName`, `handle`) |
| `business.thread` | Someone assigns, escalates, resolves or reopens a conversation | `conversationId`, `change`, `state`, `assignee` |
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

## Not yet

Personal access tokens (acting as a person, not an organization's bot), OAuth for third-party
apps, and webhooks for anything outside the Business inbox.
