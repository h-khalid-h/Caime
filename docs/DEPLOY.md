# Deploying Caime

Caime ships as **one image**, built from the `Dockerfile`: the API, realtime (WebSocket) and the
web app on one origin, so the session cookie is first-party (ARCHITECTURE.md ADR-7). It needs
PostgreSQL 16 and a volume for uploads. Everything else is optional. CI builds the image and
tries it on every push to `main`, but publishes it nowhere: EasyPanel builds it from source.

## Live deployment

Deployed 2026-09-26 on EasyPanel.

| | |
| --- | --- |
| Public URL | https://caime.datac.com (`PUBLIC_URL`, a Cloudflare-proxied record); also served at EasyPanel's default service domain, https://caishy-caishy.0hqwb7.easypanel.host |
| Domain to come | `cai.me` (R35), once it's bought: point it here (an A or CNAME record to EasyPanel, and the domain added to the `caime` service), then set `PUBLIC_URL=https://cai.me`, and share links read `cai.me/@handle` |
| Project | `caishy` |
| Services | `caime` (app, port 8787, volume `data` at `/data`) and `db` (Postgres 16) |
| Source | **GitHub** `h-khalid-h/Caime`, branch `production`, which CI advances only after every check passes; built by EasyPanel from the `Dockerfile` (image `easypanel/caime/caime:latest`) |
| Auto deploy | On, from `production`: every move of `production` rebuilds and redeploys `caime`, and only a green CI run moves it (below). The old container serves until the new one passes its `/v1/readyz` health check. |
| Environment | `DATABASE_URL`, `PUBLIC_URL`, `TRUST_PROXY`, `LOG_LEVEL`, `ADMIN_TOKEN`, `METRICS_TOKEN`, `ANTHROPIC_API_KEY` (so AI assist is available), `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` and `STRIPE_PORTAL_CONFIGURATION`, `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` (calls' relay, since 2026-09-28), all set in EasyPanel only |
| Panel | https://host.datac.com |

Verified after the deploy (first on the published image, then again on the GitHub build):
`/v1/readyz` answers `{"ok":true}`, `/` serves the web app with its Content-Security-Policy
(`connect-src` allows `wss://` on the public origin) and `x-content-type-options: nosniff`, and a
throwaway account signed up and deleted itself through the API.

Switched to `production` on 2026-09-26 and redeployed with `ANTHROPIC_API_KEY`: the source reads
back as branch `production` with auto deploy on, `/v1/readyz` answers 200, and a throwaway
account's `GET /v1/ai` answered `"available": true` before it deleted itself.

Billing went live on 2026-09-27 on the live Stripe account, with the webhook at
`https://caime.datac.com/v1/billing/webhook` and a portal configuration of its own. On both
domains an unsigned delivery is refused as `bad_signature` (the secret is loaded), and a
throwaway account's `GET /v1/billing` offered Pro at €6.00 a month and €60.00 a year before it
deleted itself. Business is priced per organization and shows on an organization's plan page.
Since 2026-09-28 the products, the webhook and the portal are named Caime.
The first real delivery is the one that proves the signing secret matches the endpoint.

Only what passed CI is deployed. A push to `main` runs every check (lint, typecheck, the tests on
real Postgres, the web budget, the end-to-end suite, then the image's smoke test); the last step
of a green run fast-forwards `production` to that commit (`.github/workflows/ci.yml`, "Release to
production"), and EasyPanel builds from `production`. A red run moves nothing, so production keeps
the last commit that passed. `EASYPANEL_DEPLOY_WEBHOOK` stays unset for this service: with it,
CI's deploy step would only trigger a second, redundant rebuild.

## EasyPanel

### 1. Database

In your EasyPanel project, **+ Service → Postgres**. Name it `db`, version 16. Copy its
**internal connection URL** (it looks like `postgres://postgres:…@<project>_db:5432/<project>`).

### 2. The app

**+ Service → App**, name it `caime`, then:

| Tab | Setting |
| --- | --- |
| Source | **GitHub** `h-khalid-h/Caime`, branch `production` (or `main`), **Build → Dockerfile**. The web export needs about 4 GB of RAM while it builds. |
| Environment | See below. |
| Domains | Your domain → port **8787**, HTTPS on. |
| Mounts | **Volume** named `data` mounted at `/data` (uploads and thumbnails live here). |
| Deploy | Deploy. The health check waits for `/v1/readyz` (database reachable, migrations applied). |

To run an image instead, build it (`docker build -t caime .`) and push it to a registry of
your own; none is published.

### 3. Environment

Required:

```
DATABASE_URL=postgres://…            # the internal URL from step 1
PUBLIC_URL=https://caime.example.com   # the exact public origin, no trailing slash
```

`PUBLIC_URL` matters: it decides secure cookies, the WebSocket origin allowed by the
Content-Security-Policy, and links in notifications. Everything below is optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `MINIMUM_AGE` | `13` | Minimum age at sign-up; set `16` where local law requires. |
| `SESSION_DAYS` | `90` | How long a signed-in device stays signed in without use. |
| `METRICS_TOKEN` | — | Enables `GET /metrics` (below) behind this bearer token. |
| `DNS_SERVERS` | the system's | Resolvers for checking organizations' domains, comma-separated (`1.1.1.1,8.8.8.8`). Set it if the host's resolver caches a new record too long. |
| `ADMIN_TOKEN` | — | The operator's token for `/v1/admin`: setting plans, giving out reserved and held handles and reading product metrics (below). At least 24 characters; without it those routes don't exist. |
| `PLANS_URL` | — | Where people see plans and upgrade (a pricing page or a payment link). The app links to it from a plan's limits when billing isn't set up; without either, it says upgrades can't be bought yet. |
| `LEGAL_NAME` | `DATA C OÜ` | Who runs this Caime, as its privacy policy, terms and help say. |
| `CONTACT_EMAIL` | `hello@cai.me` | Where those pages tell people to write (data requests, security reports, help). |
| `PRIVACY_URL`, `TERMS_URL`, `HELP_URL` | Caime's own pages | Caime serves its own privacy policy, terms and help at `/privacy`, `/terms` and `/help` on `PUBLIC_URL`, for anyone, signed in or not (link app store listings there). Set one of these (a full http(s) address) to publish that page somewhere else instead: You → About links there, and Caime's own page redirects there, so there's only ever one of each. The app reads them from the server (`GET /v1/about`), so no domain is built into it. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | — | Billing (below): Stripe's secret or restricted key, and the signing secret of the webhook endpoint at `/v1/billing/webhook`. With both, Pro and Business are bought in the app through Stripe Checkout and managed in Stripe's customer portal. |
| `STRIPE_PORTAL_CONFIGURATION` | the account's default | The customer portal configuration (`bpc_…`) to open. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | generated | Web Push keys. Generated and stored in the database on first boot; set them only to reuse existing keys. |
| `VAPID_SUBJECT` | `mailto:hello@cai.me` | Contact for push services. |
| `EXPO_ACCESS_TOKEN` | — | Mobile push through Expo (needs the store builds). |
| `ANTHROPIC_API_KEY` | — | AI assist (rewrite, translate, catch me up, find follow-ups). Without it the AI settings don't appear and Caime uses its heuristics (R17). Each person still turns it on for themselves. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | The Claude model AI assist uses. |
| `ANTHROPIC_BASE_URL` | — | Another Messages API endpoint, such as a gateway. |
| `STUN_URLS` | `stun:stun.l.google.com:19302` | Calls: STUN servers that tell each device its public address, comma-separated. Set it empty for none (calls then connect only on the same network). |
| `TURN_URLS`, `TURN_SECRET` | — | Calls: a TURN relay (such as coturn, with `use-auth-secret` and `static-auth-secret` set to `TURN_SECRET`), comma-separated `turn:` and `turns:` addresses. Each person gets credentials that expire after 12 hours. Without a relay, calls between people on strict networks (some offices, some mobile carriers) won't connect. |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | — | Calls: Cloudflare's TURN relay instead of running one. In the Cloudflare dashboard, **Realtime → TURN Server → Create**, then set the key's id and its API token here. Each person gets credentials for 12 hours when a call starts; if Cloudflare doesn't answer in 4 seconds the call goes on with STUN only (`caime_turn_credentials_total{outcome}` counts both). The privacy page then says calls may go through a relay Cloudflare runs. |
| `DATABASE_POOL_MAX` | `20` | Connections per instance. |
| `LOG_LEVEL` | `info` | `warn` in quiet production. |
| `TRUST_PROXY` | `true` | EasyPanel's proxy sets `X-Forwarded-*`; keep it on behind it. |

### Billing (Stripe)

Plans are bought in the app once Stripe is set up; until then, an operator sets them
(`/v1/admin`). In Stripe (the same steps in test mode first, if the account has it):

1. **Products and prices.** A product for Pro and one for Business, each with a monthly and a
   yearly recurring price whose **lookup keys** are `caishy_pro_month`, `caishy_pro_year`,
   `caishy_business_month` and `caishy_business_year` (named before the rename to Caime, and
   kept: the live prices are found by them). The app shows whatever those prices are,
   found by their keys; to change a price, make a new one and move the key to it
   (`transfer_lookup_key`), and people already paying keep theirs.
2. **Webhook.** An endpoint at `https://<PUBLIC_URL>/v1/billing/webhook` for
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated` and `customer.subscription.deleted`, on API version
   `2024-06-20` (what the server pins). Its signing secret is `STRIPE_WEBHOOK_SECRET`.
3. **Customer portal.** Turn on cancelling, updating the payment method and invoice history
   (or make a configuration through the API and set `STRIPE_PORTAL_CONFIGURATION`).
4. Set `STRIPE_SECRET_KEY` (a restricted key needs write access to Customers, Checkout
   Sessions, Customer portal and Subscriptions, and read access to Prices) and
   `STRIPE_WEBHOOK_SECRET` on the service, and redeploy.

Whatever a webhook says, the server asks Stripe how that subscription stands now, one delivery
at a time for each subscription, so events that come late, out of order or two at once change
nothing wrongly. Each event is handled once; one that failed is handled when Stripe sends it
again. A subscription is Caime's by its price's lookup key, or, once the key has moved to a new
price, by what the server already knew of it and by whom its Checkout was for (the
`caishy_payer` metadata), so people on an old price are followed to the end.

- **The plan follows what's paid.** It's on while a subscription is active, in a trial, or
  retrying a failed payment (`past_due`), and goes back to Personal or Free when it ends. A lower
  plan never takes anything away. The plan page shows what the subscription itself costs, even
  after the list price changes.
- **An operator's plan stays.** Billing changes only a plan it set. A plan the operator set
  (Enterprise, or a free year of Pro) stays whatever Stripe says, and there's nothing to buy over
  it. The operator can't move someone who is paying back to Personal or Free: cancel the
  subscription in Stripe instead, and the plan follows.
- **Never sold twice.** Before each Checkout the server asks Stripe what the payer already has,
  so a payment whose webhook hasn't come yet isn't sold again. Any older Checkout still open
  closes, and a payer's Checkouts are made one at a time.
- **Nothing is charged to someone gone.** Deleting an account, or an organization closing (its
  last person leaving, or deleting their account), deletes its Stripe customer. That ends every
  subscription it has at once, whether or not the server had heard of them. An organization that
  passes to someone else keeps its Business plan, and the card it's paid with: the terms tell
  whoever pays to cancel it first. If Stripe
  can't be reached then, a job and the six-hourly check keep trying; deleting never waits on it.
- **Checked every six hours.** Every customer's subscriptions are asked of Stripe, so a webhook
  that never came can't leave a plan on or off wrongly.
- **Test and live stay apart.** Customers are kept per mode. Moving from a test key to a live
  key starts afresh, and what test mode paid for turns off. A customer deleted in Stripe's
  dashboard is forgotten, and a new one is made when needed.
- **An organization's receipts go to its owner.** They go to the owner's email, whichever admin
  pays, and it's brought up to date whenever its billing is opened.

### 4. Continuous deployment

Every push to `main` runs CI (lint, typecheck, 230+ tests on real Postgres, the web budget, the
end-to-end suite), then builds and publishes the image and smoke-tests it. To have EasyPanel
redeploy automatically after that:

1. In the `caime` service, copy the **Deploy Webhook** URL.
2. In GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**,
   name `EASYPANEL_DEPLOY_WEBHOOK`, value the URL.

The CI job calls it only after the new image passed its smoke test.

## Expo Go (the phone app, before store builds)

Until the store builds exist (⛔), the phone app runs in Expo Go, from either of these:

- **The `caime-go` service** (project `caishy`, EasyPanel): Expo's own server with the app's
  production JavaScript, built from `Dockerfile.expo-go` on `production` like `caime`, so it
  moves only with a green CI run. `EXPO_PACKAGER_PROXY_URL` on the service is its own https
  address (`https://caishy-caime-go.0hqwb7.easypanel.host`), which the manifest hands the
  phone; the app talks to `https://caime.datac.com`. On an iPhone, open
  `exps://caishy-caime-go.0hqwb7.easypanel.host` (the Camera app reads it from a QR code, or
  type it into Safari) and Expo Go opens it. The first open after a deploy bundles the app,
  about 20 seconds. Its image holds the app and the packages it's built from, never the
  server's code: Expo's server serves any source file it can see. Stop or delete the service
  when the store builds replace it.
- **Your own computer**: `pnpm dev:phone` (`scripts/dev-phone.mjs`) starts Expo's server
  against the live Caime (`CAIME_API_URL` to change it); scan its QR code with the iPhone on
  the same Wi-Fi.

Calls aren't in Expo Go: they need react-native-webrtc's native code, so only a development
build (`npx expo run:ios`, or an EAS build) or a store build has them. Expo Go doesn't offer
them, and nothing of them loads. Everything else is there, private conversations included.

## Plans

What each plan includes is in `packages/core/src/plans.ts` (PRD §84, R23). Personal is free
forever and nothing that makes Caime useful is ever limited: plans count only AI assists
(10 a day on Personal, 200 on Pro), file storage (5 GB, 100 GB), and for organizations the team
(3 people on Free, 100 on Business) and connected apps (1, 25). A lower plan never removes
anything; it only stops additions until they fit.

Plans are bought through Stripe (Billing, above). The operator can also set one with
`ADMIN_TOKEN`: a deal, a free year, Enterprise. Billing then leaves it alone, and setting
Personal or Free hands it back to billing. Each change is written to the audit log:

```sh
curl -X PUT https://caime.example.com/v1/admin/people/noor/plan \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"plan":"pro"}'                     # personal, pro, business, enterprise
curl -X PUT https://caime.example.com/v1/admin/orgs/nile.dental/plan \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"plan":"business"}'                # free, business, enterprise
```

## Reserved handles

Nobody can sign up as, change their handle to, or make an organization with @caime, @support
and the other reserved handles (`RESERVED_HANDLES` in `packages/core/src/schemas.ts`; what and
why in `docs/SECURITY.md`). They're told the handle isn't available, as for one that's taken.
The operator gives one to the product's own account or organization, found by the handle it has
now: make the organization (or the account) with any free handle, then move it. Only a reserved
handle is given this way, only while nobody else has it (`409 handle_taken` says someone does),
and each is written to the audit log:

```sh
curl -X PUT https://caime.example.com/v1/admin/orgs/our.company/handle \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"handle":"caime"}'                 # the organization made as @our.company is @caime
curl -X PUT https://caime.example.com/v1/admin/people/noor/handle \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"handle":"support"}'
```

Anyone who took a handle before it was reserved keeps it; the operator can't give it out while
they do. Move an organization before it posts updates: a notification already sent links to the
handle it had then, as a link someone shared does.

A handle someone lets go of (a new one in Profile, a deleted account, or one the operator moved
them from) is held from everyone for a year, whoever had it included, so an old link can't open
someone else (`docs/SECURITY.md`, Handles let go of). The same route gives a held handle back,
once the person asking has shown the operator it was theirs; Caime keeps no record of whose it
was to check that against. Only a reserved or held handle is given this way, and it's held no
more once someone has it. An organization keeps its handle for good, closed or not.

## Metrics

**Operations** (PRD §81). With `METRICS_TOKEN` set, `GET /metrics` answers in Prometheus's text
format, per instance: requests and their duration by route (as declared, `/v1/conversations/:id`,
never the path as requested) and status, open realtime connections, messages sent by kind,
background jobs, webhook deliveries, AI assist calls and push notifications by outcome, the
database pool, memory, uptime and event-loop delay. Counts and timings only: never a message, a
name, an id or a query. A scrape job:

```yaml
scrape_configs:
  - job_name: caime
    scheme: https
    authorization: { credentials: <METRICS_TOKEN> }
    static_configs: [{ targets: ['caime.example.com'] }]
```

**The product** (PRD §82–83). With `ADMIN_TOKEN`, `GET /v1/admin/metrics?days=28` answers with
activation (signed up, connected, messaged, classified, activated within a day), engagement,
the core rates (connection completion, relationship completion, waiting and attention
resolution, notification efficiency, week-1 and week-4 retention), AI use and how fast Business
inboxes answer. Aggregates only, never about anyone in particular; what it can't measure yet
is listed in `notMeasured`.

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://caime.example.com/v1/admin/metrics?days=28'
```

**Organizations** on Business see their own inbox's insights on their page: customers who
wrote, how fast the team first answered, who's waiting and what's resolved, for the whole team.

## Scaling

Instances are stateless apart from `/data`: realtime fans out across instances through Postgres
`LISTEN/NOTIFY`, jobs are claimed with `FOR UPDATE SKIP LOCKED`, and migrations run under an
advisory lock, so several instances can boot together. With more than one instance, put uploads
on shared storage (the same volume, or S3 when that adapter lands) and set `WORKERS=false` on all
but the instances that should run background jobs.

## Running the image anywhere else

```sh
docker network create caime
docker run -d --name db --network caime -e POSTGRES_PASSWORD=change-me postgres:16
docker run -d --name caime --network caime -p 8787:8787 -v caime-data:/data \
  -e DATABASE_URL=postgres://postgres:change-me@db:5432/postgres \
  -e PUBLIC_URL=http://localhost:8787 \
  caime   # built with: docker build -t caime .
```

## Checks after a deploy

```sh
curl -fsS https://caime.example.com/v1/readyz         # {"ok":true}
curl -fsSI https://caime.example.com/ | grep -i content-security-policy
```

Then sign up at the domain, and from a second browser connect and send a message: it should
arrive without a reload.
