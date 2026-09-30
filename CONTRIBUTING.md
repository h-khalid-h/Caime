# Contributing to Caime

Caime takes changes from people and from AI agents alike, through one process: a pull request
against `main`, checked by CI and reviewed against the standards below by Caime's reviewer (the
lead session that maintains this repository, or the owner). Nothing reaches `main` any other way.
`main` is what production runs once CI is green (`docs/DEPLOY.md`), so the bar is production's.

## Before you start

1. Read `CLAUDE.md` (the operating manual: conventions, commands, working notes), then
   `docs/ROADMAP.md` (what is done, in progress, blocked), `docs/PRODUCT-REVIEW.md` (R1 onward
   override the PRD) and `docs/RESOURCES.md` (the budgets your change is measured against).
2. Pick work from the roadmap, or say in the pull request which PRD section or refinement it
   serves. A change that serves none is refused: Caime is a product, not a codebase to grow.
3. Run `pnpm install` and `pnpm check` on a clean checkout. If it is red before your change,
   fixing that comes first, in its own pull request.

## What a pull request carries

- **One change**, on a branch named for it (`invite-links`, `fix/inbox-n-plus-one`), against
  `main`, with the template filled in (`.github/pull_request_template.md`).
- **Tests** for every rule it adds: in `packages/core` for shared logic, `apps/server/test` for
  routes and jobs, `apps/app` for app logic, and an E2E step when a screen or a link changes.
  A bug fix carries the test that failed before it.
- **Green checks** run locally before pushing: `pnpm check` (lint, typecheck, every test),
  `pnpm build && pnpm budget`, and `pnpm e2e` for anything touching the app or the server's
  pages. CI runs them all again; a pull request whose CI is red is not reviewed.
- **Docs in the same change**: `docs/ROADMAP.md` (tick only what is verified end to end, add a
  log line), `CLAUDE.md` when a convention or command changes, `docs/SECURITY.md` for anything
  touching trust, `docs/DEPLOY.md` for a new environment variable, `docs/API.md` for a route
  apps may call, and the privacy page (`lib/pages.ts`) and the export (`lib/export.ts`) for any
  new record about a person.
- **Numbers that were run** (CLAUDE.md convention 13): a claimed latency, size or count comes
  from a command in the pull request, never an estimate.
- **What was not done**, said plainly, with what it needs (credentials, a device, a decision).

## What is refused

These are checked first, and any one of them sends a pull request back without further review.

- A relationship, read position or profile field shown to anyone the privacy evaluator doesn't
  allow (CLAUDE.md convention 2), or a suggestion written as a fact (convention 3).
- A committed migration edited (convention 7), a secret or a token committed, a dependency added
  that a hundred lines could replace, a new outbound request to an address someone else chose
  that bypasses `postWebhook`.
- Copy that assumes gender or age, characters on a security or money surface, raw colours in
  components (conventions 8 and 9).
- The web budget exceeded, a test skipped, disabled or made to pass by widening what it accepts,
  or CI made green by anything but fixing the cause.
- A change that spends server, AI or device resources without saying so, or beyond what
  `docs/RESOURCES.md` allows, or that adds a timer, a poll or a query per row where an event or
  one query would do.
- A feature outside a relationship or a conversation context (convention 1), or one the product
  review declined (`docs/PRODUCT-REVIEW.md` says which, and why).
- A pull request that rewrites history on a shared branch, or that touches production settings,
  Stripe, EasyPanel or the live database: those are the owner's, never a contributor's.

## Review

The reviewer reads the whole diff, runs `pnpm check` and the E2E on it, and checks it against the
conventions, the budgets and the product review. The outcome is one of:

- **Accepted**: merged as it is, or with small fixes the reviewer makes and names (a wording, a
  missing test case, a doc line). Merging is a merge commit or a rebase onto `main`, never a
  force-push of the contributor's branch.
- **Changes requested**: each request names the file and the rule, and says what would satisfy
  it. Address every thread, push, and re-request review; don't resolve a thread you didn't
  address. A reviewer's small ask is done in the same pull request; a large one may become a
  follow-up the reviewer files on the roadmap.
- **Refused**: the pull request is closed with the reason in one comment, and the roadmap gains
  a line if the idea is worth keeping. A refused change may come back as a new pull request that
  answers the reason.

Review comments and replies are short and specific. A finding marked optional never blocks; a
finding that names a convention, a test or a budget always does. Approval is the reviewer's
alone: a contributor's own approval, a bot's approval or a green CI is not one.

## For AI agents in particular

- Read `.claude/skills/steward/SKILL.md` before driving a pull request: it says how CI, review
  threads and check-ins are handled in this repository.
- Say in the description that an agent made the change, and which session or run, so the
  reviewer knows what to verify most carefully: an agent's claim to have run something is
  checked by its output, so paste the last lines of `pnpm check`, the budget and the E2E.
- Never push to `main`, `production` or anyone else's branch; never open a second pull request
  for a change while the first is under review; never merge, approve or close a pull request.
- Keep to the scope asked. A problem found on the way is a line in the pull request's "Not done"
  or a new issue, not a second change in the same diff.
- The reviewer's word is final for the repository. A disagreement is put in the thread once, with
  the reason; it is not re-litigated by re-opening or re-pushing the same change.

## Owner-side setup (⛔ needs the repository's owner)

- Branch protection on `main`: require a pull request and the `CI` check, restrict pushes to the
  reviewer and the owner, forbid force-pushes. Until then, this document is the rule and the
  reviewer enforces it by reading `main`'s history.
- An automatic first review by Claude Code on every pull request needs `ANTHROPIC_API_KEY` in
  the repository's secrets (a workflow can then run `anthropics/claude-code-action`); the
  reviewer's own review is still the one that decides.
