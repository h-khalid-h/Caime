# Security and privacy

What Caishy protects, how, and what is not done yet. Each control names the test that proves it;
a control without a test is listed as a gap, not a control. Reviewed 2026-09-26.

## What matters most

1. **How you label someone is yours.** A relationship ("Manager · DATA C") is only ever sent to
   its owner unless they share it (ADR-10). Other code gets spheres to evaluate the owner's own
   privacy rules and never forwards them.
2. **Profile fields and read positions follow the owner's rules**, reciprocally for read
   receipts (R25), on every path: API views and live events.
3. **Strangers can't intrude.** Messages from people you're not connected with are requests; they
   never notify, never create work, and reading one never tells the sender (R14).
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
| Blocking | Blocked people can't message or find you; a profile of someone who blocked you looks like it doesn't exist | `connections.test.ts`, `actions.test.ts` |
| Minors | Discoverability, email and message-request rules | `privacy-safety.test.ts`, `auth.test.ts`, `connections.test.ts` |
| Kit cards | The server decides what a card says and where it starts; a client's `state` or extra fields are dropped. A card moves only along its kit's flow, by the person each move belongs to, and only if nobody moved it first. Money cards (invoice, purchase order, payment request) never involve anyone under 18 | `kits.test.ts` |
| Uploads | Type from the bytes, not the name; non-media downloads as attachments with `CSP: sandbox`; photo EXIF and GPS stripped; 100 MB cap; per-user rate limit | `files.test.ts` |
| Files | Readable only by participants of a conversation they were shared in; avatars follow the owner's photo privacy | `files.test.ts` |
| Links | Suspicious links (IP hosts, lookalikes) are flagged; the app asks before opening them | `privacy-safety.test.ts`, `messaging.test.ts` |
| Input | Every body and query validated with zod; 1 MB JSON limit | route tests |
| Abuse | Sliding-window limits on sign-up, sign-in (per address and per account), sends, uploads, connection requests and handle checks. The limiter is unit-tested; the per-route limits are raised in tests and set in code | `rate-limit.test.ts` |
| Web app | Strict CSP (`script-src 'self'`, no inline script), `frame-ancestors 'none'`, helmet headers, no-cache HTML | `curl -I /` in CI's image smoke test |
| Logs | Authorization, cookies and passwords redacted; query strings (search terms, handles) not logged | — (code: `app.ts`) |
| Device input | Locales and time zones sanitised; formatting never throws on bad values | `locale.test.ts` |
| Your data | Export downloads what is yours as JSON: your messages and not other people's, no password or session secrets. Deletion needs the password, is rate-limited and immediate; it ends the account's sessions, removes files nobody else can see from the database and the disk, and leaves others their conversations (your messages, unnamed), the files you shared with them, and the actions they were waiting on you for | `account.test.ts`, `e2e/core-flow.spec.ts` |
| Dependencies | `pnpm audit --prod` clean. Two advisories in the app toolchain are closed with overrides in `pnpm-workspace.yaml`: `decode-uri-component` (vendored linear-time drop-in, `vendor/`) and `xcode>uuid` | `pnpm audit --prod` |

## Gaps

These are known and tracked in `docs/ROADMAP.md`. None is hidden behind a feature flag.

- **Message encryption at rest.** Messages are protected by access control and the database's
  disk encryption, not end-to-end encryption. "Private" conversations (`privacy_class`) exist in
  the model; their end-to-end encryption is not built.
- **Moderation tooling.** Reports are stored; there is no reviewer interface yet.
- **Rate limits are per instance** (in memory). With several instances behind a load balancer,
  limits multiply by the instance count until a shared store is added.
- **Email verification and password reset by email** need an email provider; recovery codes are
  the only reset path today, by design and documented to users.
- **`TRUST_PROXY` is on by default** for EasyPanel's proxy. Run without a proxy and clients can
  choose the address rate limits see; set `TRUST_PROXY=false` there.
- **No penetration test** by a third party yet.

## Reporting

Security issues: open a private advisory on the GitHub repository (Security → Report a
vulnerability). Please don't file public issues for them.
