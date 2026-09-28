# Goal

The condition this project works toward, kept under 4,000 characters so it can be pasted into
`/goal`. Everything else lives in `docs/PRD.md`, `docs/PRODUCT-REVIEW.md` and `docs/ROADMAP.md`.

---

Build and ship Caime (formerly Caishy, and CONNIQT), a relationship-aware communication platform,
in github.com/h-khalid-h/Caime: production-grade on iOS, Android and Web, deployed on EasyPanel
with HTTPS, at cai.me once the owner has the domain (R34–R36).

Sources of truth: docs/PRD.md (product), docs/PRODUCT-REVIEW.md (refinements that override it),
CLAUDE.md (architecture, conventions, commands), docs/ROADMAP.md (status). Read them first;
update ROADMAP and CLAUDE.md at the end of every work block so any later session resumes without
re-deriving decisions.

Core rule: Connection (person to person) is the primary domain object, not Chat. Relationships
are directional, owned by their definer, private unless shared, versioned and never overwritten.
Suggestions are never silently facts. Caime is a communication product, not a super-app: it never
holds or moves money, runs no third-party code and has no feeds (R38–R40).

Done means each layer works end to end against the real server and is tested:
1. Identity: accounts, handles, personal/professional/org identities, web + native sessions,
   trust levels, recovery.
2. Connections: search, requests with context, the 1-3 tap "How do you know X?" flow,
   signal-based suggestions, history (change/add/end/archive/restore/merge), complementary roles,
   dedup.
3. Communication: 1:1, groups, topic conversations per connection; text, media, files, voice,
   location, links, polls, structured requests; replies, reactions, edits, deletes, read state;
   realtime, ordered, idempotent; offline outbox showing Pending.
4. Attention: Needs You / Important / Waiting / Recent / Quiet / Archived, explainable and user
   overridable; relationship-aware notifications with schedules, burst consolidation,
   activity/attention/urgency; web and mobile push.
5. Memory and action: message intelligence (commitments, dates, amounts, questions, decisions,
   tasks) as approvable suggestions; tasks, waiting, reminders, decisions with provenance;
   contexts; asset index; conversation memory; search over people, relationships, orgs, messages,
   assets, actions, contexts, including natural-language queries.
6. Organizations with verification, Business inbox (assignment, statuses, org relationships),
   Spaces, Connect Kits chosen by relationship.
7. Privacy by sphere; block, report, rate limits, link safety; export, delete, retention; AI
   assist (rewrite, summarize, translate, extract) behind a provider, labelled inference, with a
   no-AI fallback; API, scoped tokens, webhooks, bots and agents labelled non-human;
   observability; plan entitlements.
8. UX: attention-first mobile tabs (Chats, People, Spaces, Actions, You); three-column desktop
   web with a collapsible context panel; minimal composer; light and dark; accessible; RTL-safe;
   polished.

Quality bar: typecheck, lint, unit and API integration tests on real Postgres, Playwright E2E with
screenshots of key flows, native bundles export, Docker image builds, security review before
deploy. Commit and push small verified steps.

Honesty rule: whatever needs credentials not available (EasyPanel API, APNs/FCM, store accounts,
SMTP, OAuth apps, payments, TURN, speech-to-text) is built to a documented integration point and
listed as blocked, never claimed done.
