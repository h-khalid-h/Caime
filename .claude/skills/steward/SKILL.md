---
name: steward
description: How a pull request is driven to green and reviewed in this repository (Caime).
---

# Driving a pull request in Caime

This repository's conventions win over generic habits. Read `CONTRIBUTING.md` first.

- **The gate is CI** (`.github/workflows/ci.yml`): lint, `pnpm audit --prod --audit-level=high`,
  typecheck, every test (server tests need Postgres), the build, the web budget (450 KB gzip)
  and the Playwright E2E. Reproduce a failure locally before pushing a fix: `pnpm check`, then
  `pnpm build && pnpm budget`, then `pnpm e2e` (kill the stub ports first: 8787, 8795–8799,
  8825 and udp 8853, or stale state leaks between runs).
- **Never** skip, disable or loosen a test, push an empty commit, or close and reopen to re-run
  CI. A flaky E2E step is made robust (assert with `.filter({ visible: true })`, wait for the
  URL, scope to the sheet's `dialog`), never retried into green.
- **Budget red**: look at what moved into `__common` or the entry chunk before splitting
  anything; a module leaves the startup chunk only when every import of it is dynamic.
- **Review threads**: address every one; reply in one line on optional findings; re-request
  review after pushing. The reviewer (the lead session or the owner) decides; a disagreement is
  stated once in the thread.
- **Docs travel with code**: a pull request without its ROADMAP line, and without its DEPLOY row
  for a new environment variable, is sent back.
- **Merging** is the reviewer's, as a merge commit or a rebase onto `main`; a contributor never
  merges, approves or force-pushes a shared branch.
- **Check-ins**: while a pull request you drive is red or has open threads, keep a check-in
  scheduled about an hour out; stop once it's merged or closed.
