# Caime

**Messaging that understands your relationships.**

Caime (formerly CONNIQT) is a relationship-aware communication platform for iOS, Android and the
web. Messaging apps know who you're talking to; Caime understands who that person is to you —
family, a manager, a customer, a vendor — and uses it to organize attention, notifications,
follow-ups, search and privacy.

- Product: [`docs/PRD.md`](docs/PRD.md), refined by [`docs/PRODUCT-REVIEW.md`](docs/PRODUCT-REVIEW.md)
- Brand: [`docs/BRAND.md`](docs/BRAND.md)
- Strategy: [`docs/COMPETITIVE.md`](docs/COMPETITIVE.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Status: [`docs/ROADMAP.md`](docs/ROADMAP.md)

- Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## What's here

| | |
| --- | --- |
| `apps/app` | The app for iOS, Android and the web (Expo). |
| `apps/server` | API, realtime and background jobs (Fastify, PostgreSQL); serves the web app. |
| `packages/core` | Domain logic and the API contract, shared by both. |
| `packages/brand` | Tokens, wordmark and the Caishy Friends characters, as code. |

## Develop

Requires Node 22+, pnpm 10 and PostgreSQL 16.

```sh
pnpm install
pnpm check        # lint, typecheck, tests
pnpm dev:server   # API on :8787
pnpm dev:app      # the app; press w for web
pnpm build && pnpm e2e
```

See [`CLAUDE.md`](CLAUDE.md) for commands and conventions.
