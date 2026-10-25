# Agents building Caime

Caime is built by several coding agents at once, each in its own tool (Claude Code, Codex, Cursor,
Gemini CLI or another), led by one. This file is where any of them starts. `CLAUDE.md` is the
operating manual for every agent whatever its tool (the name is historical): its conventions are
rules, and its working notes say how each part of Caime is built. `CONTRIBUTING.md` is the process.

## Who's who

| Name | Role |
| --- | --- |
| **Cai Code** | The lead: the session that maintains this repository. Reviews and merges every pull request (`CLAUDE.md`, "Reviewing a contribution"), the only agent that pushes to `main`, keeps `docs/ROADMAP.md`, `CLAUDE.md` and this file, and settles what two agents disagree on. |
| **Caishy Code, Momo Code, Panda Code, Lumi Code, Pico Code, Niko Code, Zuzu Code** | Contributors, one name per agent, after the Caime Friends. The owner gives an agent its name when it starts; it keeps it, and says it in every pull request and commit. |

The owner (the account that owns `h-khalid-h/caime`) decides what Caime is; Cai Code decides what
reaches `main`.

## Read first

1. `CLAUDE.md`: the conventions (1 to 17), the vocabulary, the working notes for the part you touch.
2. `CONTRIBUTING.md`: what a pull request carries, what is refused on sight, how review goes.
3. `docs/ROADMAP.md` for the work, `docs/PRODUCT-REVIEW.md` for what was decided (R1 onward),
   `docs/RESOURCES.md` for the budgets a change is measured against.

## How work flows

- **Claim before you build.** Open a draft pull request first, titled
  `[<Name> Code] <roadmap id>: <what>` (`[Zuzu Code] M17 I14b: a photo to Cai, seen`), from a branch
  `<name>/<slug>` (`zuzu/i14b-photo`). A roadmap item with an open draft is taken: pick another.
  A claim with no push for two days may be given to someone else by Cai Code.
- **One change per pull request**, built on a fresh `main`. Bring `main` in by merging it into your
  branch; never rebase or force-push a branch once its review has started.
- **Green before review.** Run `pnpm check`, `pnpm build && pnpm budget` and `pnpm e2e` (for
  anything touching the app or the server's pages) and paste their last lines in the description.
  CI runs them again on every pull request, without secrets; a red one isn't reviewed.
- **Production is `main` after review.** Cai Code merges; CI's green run on `main` publishes the
  image and deploys it. Nothing else reaches production.

## Where parallel work collides

- **Migrations** (`apps/server/src/db/migrations`) are numbered. Take the next free number when you
  open the pull request; if `main` takes that number first, renumber yours in your branch (it isn't
  on `main` yet, so nothing committed changes). A migration on `main` is never edited.
- **Catalogs**: a new key goes at the end of its file's second half (`locales/*-b.ts`, the server's
  `*-server.ts`); a conflict there keeps both sides' keys.
- **Docs**: `docs/ROADMAP.md`, `CLAUDE.md` and `docs/PRODUCT-REVIEW.md` change in many pull
  requests. Touch only your item's lines and add your own log line; a conflict keeps both sides.
- **The web budget** (450 KB gzip for the first download) is shared: two changes each under it can
  be over it together. The later one to merge measures again on the merged `main`.

## Commits

Every commit ends with its agent's line, and names no model or vendor (in the message, a pull
request's title or body, or a code comment):

```
Co-Authored-By: Caime Intelligence (<Name> Code) <noreply@cai.me>
```

## Never

- Push to `main` or `production`; merge, approve or close a pull request; push to another agent's
  branch.
- Touch production's settings, EasyPanel, Stripe, DNS, the live database or any secret: those are
  the owner's.
- Skip, disable or weaken a test to get green, or claim a number nobody ran.
- Commit a secret, a token or anyone's personal data.
