# Security and privacy

What Caishy protects, how, and what is not done yet. Each control names the test that proves it;
a control without a test is listed as a gap, not a control. Reviewed 2026-09-26.

## What matters most

1. **How you label someone is yours.** A relationship ("Manager · DATA C") is only ever sent to
   its owner unless they share it (ADR-10). Other code gets spheres to evaluate the owner's own
   privacy rules and never forwards them.
2. **Profile fields and read positions follow the owner's rules**, reciprocally for read
   receipts (R25), on every path: API views and live events.
3. **Strangers can't intrude.** Messages from people you're not connected with, or from an
   organization you haven't written to, are requests; they never notify, never create work, their
   links are inert until accepted, reading one never tells the sender, and a declined one stays
   shut while reading to its sender as unanswered (R14).
4. **Younger people are protected by rules in code** (R29): adults can't find under-18 accounts
   they don't know, email discovery is off, message requests are limited.

## Controls

| Area | Control | Proven by |
| --- | --- | --- |
| Passwords | scrypt with per-user salt. Unknown accounts and wrong passwords get the same error (tested), and a decoy hash keeps their timing alike (code, not measured) | `auth.test.ts` |
| Sessions | Opaque random tokens, stored as SHA-256; revocable per device; password change and recovery revoke the others | `auth.test.ts` |
| Web sessions | httpOnly, `SameSite=Lax`, `Secure` under HTTPS; no token in JavaScript | `auth.test.ts` (cookie flags) |
| CSRF | Cookie-authenticated writes need the `X-Caishy-Client` header, which a cross-site form can't send | `auth.test.ts` |
| Realtime | A cookie session opens a WebSocket only from the app's own origin (cross-site WebSocket hijacking); native clients authenticate in the first frame; 64 KB frames; typing rate-limited | `messaging.test.ts` |
| Read receipts | One check, `readReceiptVisibleTo`, for the conversation view and the live event | `messaging.test.ts` |
| Relationships | Owner-only reads and writes; `mutualFit` only when both sides shared | `connections.test.ts` |
| Blocking | Blocked people can't message or find you; a profile of someone who blocked you looks like it doesn't exist. A block stops every way of reaching the other side in your conversation, not only sending: editing, reacting, voting, moving a card and typing all ask one check first (`lib/blocks.ts`), both ways. A customer can block an organization: its team and its apps' bots can no longer write to them, the conversation closes (resolved for the team, "Closed by the customer"; archived for the customer), and they can't be written to again until they unblock it; nobody on a team can block their own organization | `connections.test.ts`, `actions.test.ts`, `blocking.test.ts`, `e2e/around-the-conversation.spec.ts` |
| Minors | Discoverability, email and message-request rules. With organizations: they write only to verified ones, which never write to them first; its team is told they're under 18, and no card about money reaches them | `privacy-safety.test.ts`, `auth.test.ts`, `connections.test.ts`, `business-start.test.ts`, `business-minors.test.ts` |
| Kit cards | The server decides what a card says and where it starts; a client's `state` or extra fields are dropped. A card moves only along its kit's flow, by the person each move belongs to, and only if nobody moved it first. Money cards (invoice, purchase order, payment request) never involve anyone under 18. A checklist changes one step at a time under a row lock, so simultaneous ticks never undo each other; anyone in the conversation ticks and adds, only whoever added an item or made the list removes it. With an organization, only the cards a customer relationship offers are accepted. Locations are shared on purpose: once, or live for a time the sharer chose (15 minutes to 8 hours, kept by the server), moved only by the sharer, keeping only the latest point, and ended by them at any time; never by anyone under 18 (R29, refused by the server), and never live with an organization. An album takes only photos and videos the person adding them uploaded, never a file they were merely shown; whoever added a photo, or made the album, takes it out; nobody adds to a closed album | `kits.test.ts`, `checklists.test.ts`, `business.test.ts`, `albums.test.ts`, `live-location.test.ts` |
| Organizations writing first | Only a verified organization, and only a person on its team (never an app), writes to someone first, found by a handle they can be found by. It reaches them as a message request: silent, in Requests, links inert, one message until they answer or accept; they can decline (it stays shut, and the team isn't told) or block the organization. Never to anyone under 18, anyone who blocked it or the writer, or anyone who only takes messages from people they know; any of those reads the same as nobody by that handle. A plan's starts a day limit it, and a customer writing first is never counted | `business-start.test.ts`, `messaging.test.ts`, E2E |
| Uploads | Type from the bytes, not the name; non-media downloads as attachments with `CSP: sandbox`; photo EXIF and GPS stripped; 100 MB cap; per-user rate limit | `files.test.ts` |
| Files | Readable only by participants of a conversation they were shared in, or whose album holds them; a photo taken out of an album, or in an album that was deleted, is its owner's alone again; avatars follow the owner's photo privacy | `files.test.ts`, `albums.test.ts` |
| Links | Suspicious links (IP hosts, lookalikes) are flagged; the app asks before opening them | `privacy-safety.test.ts`, `messaging.test.ts` |
| Input | Every body and query validated with zod; 1 MB JSON limit | route tests |
| Abuse | Sliding-window limits on sign-up, sign-in (per address and per account), sends, uploads, connection requests and handle checks. The limiter is unit-tested; the per-route limits are raised in tests and set in code | `rate-limit.test.ts` |
| Web app | Strict CSP (`script-src 'self'`, no inline script), `frame-ancestors 'none'`, helmet headers, no-cache HTML. A missing file is a 404, never the app served as a script or an image | `web.test.ts`, `curl -I /` in CI's image smoke test |
| Logs | Authorization, cookies and passwords redacted; query strings (search terms, handles) not logged | — (code: `app.ts`) |
| Device input | Locales and time zones sanitised; formatting never throws on bad values | `locale.test.ts` |
| Spaces | Someone joins a space only when a person inside who manages it adds them, and only from their connections. Outside a space it doesn't exist (404). Its conversations are read only by the people in them; the rest see their titles and can join. Leaving or being removed takes you out of all of them. Admins remove members, never the owner; only the owner makes admins; an owner's departure or deleted account hands the space on | `spaces.test.ts` |
| Links | `/@handle` resolves exactly as people search does: nobody by that handle and somebody you can't find (they blocked you, they turned off being found by handle, or they're under 18 and you aren't) give the same 404. A link kept for after sign-in is only ever an in-app path (no other origin, no `//`, never the sign-in screens), so it can't be used to send someone elsewhere | `handles.test.ts`, `paths.test.ts`, `e2e/around-the-conversation.spec.ts` |
| Business conversations | A customer and an organization share one conversation, which only the customer and the organization's current team can open; everyone else gets the same 404 as for nothing. The customer never learns who on the team wrote: every id but theirs reads as the organization's, applied where message views are built and as the realtime bus's last step (so no call site can forget), and in search, memory, shared links, cards, notifications, the AI transcript and suggestions: what the organization asks of a customer is offered as the organization's, and points at nobody on its team. A search for messages "from" someone the customer knows skips it. Members can't be added to it or leave it; it follows the team: joining brings its conversations, leaving takes them away and hands back the ones you had. The team's own notes on it (who has it, escalations, resolutions) never reach the customer. Under-18s write only to a verified organization (Minors, above) | `business.test.ts`, `business-suggestions.test.ts`, `ai.test.ts`, `e2e/around-the-conversation.spec.ts` |
| Organizations | An organization's handle is in the same namespace as people's, checked at sign-up, on a handle change and on creation, so neither can pose as the other. It is verified only when a TXT record at `_caishy-verify.<domain>` carries its own random token, checked by the server's resolver; a verified domain belongs to one organization (unique index), changing the domain issues a new token and unverifies it, and only then do its members show as "Verified at <name>". Anyone can see its profile; only its team sees the team, and only owners and admins see the domain token. Its team is adult connections of an owner or admin; admins manage the team, never the owner; only the owner makes admins; an owner's departure or deleted account hands it on | `orgs.test.ts`, `e2e/around-the-conversation.spec.ts` |
| Apps | Only an organization's owner or admins add, change or remove its apps. A token is shown once and stored as SHA-256; it reaches a fixed list of routes (anything else is `403 token_route`), each needing a named permission (`403 token_scope`), acts only as the app's bot and so only in the organization's own conversations, and stops the moment the app is removed, its token replaced or the organization archived. 600 requests a minute per token. A bot can't sign in, be found, be asked to connect or be messaged, be given a conversation, or inherit the organization (with no person left, it closes and its apps stop), and its messages always say "Automated". Webhooks go only to https addresses outside private networks, checked when saved and at every lookup (so a public name can't later point inside), in every IPv6 form that carries an IPv4 address; they follow no redirects, get 10 seconds in all, and are signed with HMAC-SHA256 over the timestamp and body. Every change is in the audit log | `apps.test.ts`, `jobs.test.ts`, `e2e/around-the-conversation.spec.ts` |
| Plans | What a plan includes is checked on the server where something is added (an AI assist, a file, a person on a team, an app), never only in the app; uploads under way count at their full size, and a file that doesn't fit is deleted, not kept. The operator's routes need `ADMIN_TOKEN`, compared as SHA-256 digests in constant time; without it they answer the same 404 as a route that doesn't exist. 30 tries a minute per address, and every plan change is in the audit log | `plans.test.ts`, `ai.test.ts` |
| Metrics | `GET /metrics` exists only with `METRICS_TOKEN`, and product metrics only with `ADMIN_TOKEN` (the same constant-time check). Both are counts and timings: labels come from fixed sets (a route as declared, never the path as requested; kinds; outcomes), so no request can mint a series or carry text into one, and a scrape after real traffic contains no message, id, handle or email. Product metrics are aggregates, never about anyone in particular: what they record as it happens (an answer to Needs you, a "doesn't need me", how a search ended) is stored without anyone's id, and a search outcome carries a time and whether something was opened, never the query. Whose link brought someone is kept on their account for the count, and nobody is told. An organization's insights are for its owner and admins, count the whole team (nobody is singled out, PRD §71) and never an app's bot | `metrics.test.ts`, `product-metrics.test.ts`, `insights.test.ts` |
| AI assist | Off unless the operator set a key and the person, an adult, turned it on; never on a private conversation; checked on every call. Only what the action needs is sent: the draft, the one message, or what the person can see of the conversation as names and text (no ids, handles or emails). Prompts treat that content as text, not instructions. Message text is never logged or stored: each call is recorded as its feature, model, tokens, time and outcome only, is in the person's export, and stays in the counts, unnamed, after the account is deleted. Everything it writes is labelled and changes nothing until tapped; follow-ups arrive as suggestions to accept. Refusals and busy periods say so plainly. 60 calls an hour per person | `ai.test.ts`, `e2e/around-the-conversation.spec.ts` |
| Your data | Export downloads what is yours as JSON: your messages and not other people's, no password or session secrets. Deletion needs the password, is rate-limited and immediate; it ends the account's sessions, removes files nobody else can see from the database and the disk, and leaves others their conversations (your messages, unnamed), the files you shared with them (photos in their albums too), and the actions they were waiting on you for | `account.test.ts`, `albums.test.ts`, `e2e/core-flow.spec.ts` |
| Dependencies | `pnpm audit --prod` clean. Two advisories in the app toolchain are closed with overrides in `pnpm-workspace.yaml`: `decode-uri-component` (vendored linear-time drop-in, `vendor/`) and `xcode>uuid` | `pnpm audit --prod` |

## Gaps

These are known and tracked in `docs/ROADMAP.md`. None is hidden behind a feature flag.

- **Message encryption at rest.** Messages are protected by access control and the database's
  disk encryption, not end-to-end encryption. "Private" conversations (`privacy_class`) exist in
  the model; their end-to-end encryption is not built.
- **AI assist reads other people's messages** when someone asks it to catch up or find
  follow-ups in a standard conversation; they aren't asked first. Private conversations (R18)
  are the answer and aren't built yet. A message can also try to steer what the model writes;
  what it writes only ever reaches the person who asked, as a suggestion.
- **Moderation tooling.** Reports are stored; there is no reviewer interface yet.
- **Rate limits are per instance** (in memory). With several instances behind a load balancer,
  limits multiply by the instance count until a shared store is added.
- **Email verification and password reset by email** need an email provider; recovery codes are
  the only reset path today, by design and documented to users.
- **`TRUST_PROXY` is on by default** for EasyPanel's proxy. Run without a proxy and clients can
  choose the address rate limits see; set `TRUST_PROXY=false` there.
- **No penetration test** by a third party yet.
- **Webhooks carry what customers write** to the organization's own endpoint, which is the
  point of them, and the organization then holds that copy under its own policies. Customers
  see that the organization answers through an app ("Automated"), not where its webhooks go.
- **Plans are set by hand.** Until billing is connected (⛔ Stripe), the operator changes plans
  with one shared token; whoever holds it can change anyone's plan. Keep it in the environment
  settings, never in chat, and rotate it by changing the variable.
- **Apps act only as a bot.** There are no personal access tokens or OAuth yet, so nothing
  can act on a person's behalf through the API.
- **Webhook deliveries share each instance's job queue.** An endpoint that is slow to answer
  holds one of eight slots for up to 10 seconds per attempt, so a very busy organization with a
  slow endpoint can delay other organizations' deliveries until its attempts run out.

## Reporting

Security issues: open a private advisory on the GitHub repository (Security → Report a
vulnerability). Please don't file public issues for them.
