# Deploying Caime

Caime ships as **one image**, built from the `Dockerfile`: the API, realtime (WebSocket) and the
web app on one origin, so the session cookie is first-party (ARCHITECTURE.md ADR-7). It needs
PostgreSQL 16 and a volume for uploads. Everything else is optional. CI builds the image on every
push to `main`, tries it, and publishes it to the GitHub Container Registry by its sha
(`ghcr.io/h-khalid-h/caime:<sha>`; `production` names the one the branch moved to, `staging` the one
staging tries first); the live service still builds from source until it is switched to the image
("Running the tested image", below).

## Live deployment

Deployed 2026-09-26 on EasyPanel.

| | |
| --- | --- |
| Public URL | https://cai.me (`PUBLIC_URL`; Cloudflare-proxied A record to the server); also served at EasyPanel's default service domain, https://caishy-caishy.0hqwb7.easypanel.host |
| Old address | https://caime.datac.com, kept on the `caime` service as a second domain: Stripe's and Postmark's webhooks, calendar feeds already subscribed, and phone builds made before the move all reach it. It answers as `cai.me` does (the canonical address is `PUBLIC_URL`) and is never redirected for the API (a redirect turns a webhook's POST into a GET) |
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
`https://caime.datac.com/v1/billing/webhook` (moved to `https://cai.me/v1/billing/webhook` with
the domain, by editing the endpoint so its signing secret stays) and a portal configuration of its own. On both
domains an unsigned delivery is refused as `bad_signature` (the secret is loaded), and a
throwaway account's `GET /v1/billing` offered Pro at €6.00 a month and €60.00 a year before it
deleted itself. Business is priced per organization and shows on an organization's plan page.
Since 2026-09-28 the products, the webhook and the portal are named Caime.
The first real delivery is the one that proves the signing secret matches the endpoint.

Only what passed CI is deployed. A push to `main` runs every check (lint, typecheck, the tests on
real Postgres in one job; beside it, the web budget and the end-to-end suite in two halves at once,
`E2E_HALF` in `playwright.config.ts`; then the image's smoke test); the last step
of a green run fast-forwards `production` to that commit (`.github/workflows/ci.yml`, "Release to
production"), and EasyPanel builds from `production`. A red run moves nothing, so production keeps
the last commit that passed. `EASYPANEL_DEPLOY_WEBHOOK` stays unset for this service: with it,
CI's deploy step would only trigger a second, redundant rebuild.

## Going live on cai.me (checked 2026-10-13)

The order matters: every step leaves Caime working. What each costs is in `docs/RESOURCES.md`.

1. **The service's names** (done, checked 2026-10-13): EasyPanel, service `caime`, Domains
   `cai.me`, `www.cai.me`, `caime.datac.com` and EasyPanel's own default; `caime-go` has
   `go.cai.me`. Caime answers pages on `PUBLIC_URL`'s name alone and sends a page asked for on
   any other to the same path there, for good (`lib/canonical-host.ts`): one site, one session
   cookie, one origin for push. The API (`/v1`, Stripe's webhook among it), `/metrics` and
   `/.well-known/` answer on every name, so nothing posting to the old address breaks.
2. **DNS at Cloudflare (zone `cai.me`).** `A @ <server IP>` proxied, `CNAME www → cai.me` and
   `CNAME go → cai.me` proxied (all there, 2026-10-14; no Redirect Rule is needed, Caime
   redirects). Then delete the wildcard `A *`: nothing else is served under a subdomain, and a
   wildcard makes any name (`login.cai.me`) resolve.
   SSL/TLS mode **Full (strict)** (EasyPanel holds a real certificate), Always Use HTTPS on.
3. **The service's environment** (`PUBLIC_URL=https://cai.me` is set; checked 2026-10-13: the
   landing page's canonical is `https://cai.me/`). `SMTP_URL` from step 5, then redeploy. The
   sender, the contact and the push subject are Caime's own defaults (`Caime <hello@cai.me>`,
   `hello@cai.me`, `mailto:hello@cai.me`): a reply to a code reaches the staff address, so
   `EMAIL_FROM` isn't needed (the owner has set it anyway: checked by name on 2026-10-18).
   Caime Mail's variables came after this step (below). Check:
   `/.well-known/oauth-authorization-server` says `"issuer":"https://cai.me"`.
4. **Stripe (live: the owner's).** Webhooks: *edit* the existing endpoint's URL to
   `https://cai.me/v1/billing/webhook` (a new endpoint would get a new signing secret; done by
   the owner, 2026-10-14), then send a test event: 200. Connect, when an organization's own
   checkout is turned on (R65, below): its redirect is `https://cai.me/v1/checkout/stripe/return`.
5. **Postmark, sending only for now.** One account and one server, "Caime". Sender signatures,
   add the domain `cai.me`: a DKIM `TXT` at the host Postmark names (`…pm._domainkey`) and the
   Return-Path `CNAME pm-bounces → pm.mtasv.net`, both **DNS only** (grey cloud) at Cloudflare,
   or Postmark can't verify them. No SPF include is needed for Postmark (the Return-Path does
   it). Ask for account approval (until then it sends only to its own domains). `SMTP_URL=
   smtp://<server token>:<server token>@smtp.postmarkapp.com:587` (the token is the username and
   the password). The free plan (100 a month) carries the closed beta; at launch, Pro (Basic has
   no inbound, which Caime Mail needs).
6. **Staff addresses, free, until Caime Mail is on.** Cloudflare Email Routing on `cai.me`
   (it adds its own MX and SPF records; on 2026-10-14 the MX pointed at Postmark inbound with
   Caime Mail off, so these addresses reached nobody): `hello@`, `support@`, `privacy@`, `security@`,
   `abuse@` and `postmaster@` forwarded to the owner's mailbox, catch-all off. Mail providers
   expect `postmaster@` and `abuse@` to take mail.
7. **DMARC**: one `TXT _dmarc` record, never two (with two, receivers apply neither):
   `v=DMARC1; p=none; adkim=r; aspf=r; rua=mailto:<the address Postmark's free DMARC digest
   gives, dmarc.postmarkapp.com>`; move to `p=quarantine` once a few weekly digests show only
   Postmark and Cloudflare sending for `cai.me`. (2026-10-14: two were published, one with
   `p=reject` and strict alignment, the other the digest's; merge them into one.)
8. **Check**: `https://cai.me/v1/readyz` is `{"ok":true}`; signing up mails a code from
   `hello@cai.me` that arrives in the inbox with DKIM passing (`d=cai.me`); a reset link opens
   on `cai.me`; `https://www.cai.me/x?y=1` lands on `https://cai.me/x?y=1`; mail to
   `postmaster@cai.me` reaches the owner; Stripe's test event answers 200.

   **A deployment EasyPanel calls done may not be running.** EasyPanel marks a deployment
   "Success" once the image is built. A container whose configuration is invalid exits at start,
   and with zero-downtime deploys the old container keeps answering, so nothing new runs and
   nothing says so (2026-10-14: `MINIMUM_AGE=10`, and a second `SMTP_URL` that wasn't an address,
   held production on an older build for every deployment after). Before saving the service's
   environment, paste it into a local file and run `pnpm --filter @caime/server check-env
   <file>`: it names any variable that fails and any set twice (the last wins), never a value.
   After a deployment, check a page the release changed.

9. **Watch it** (minutes, on the Google Cloud credits). Cloud Monitoring, Uptime checks: HTTPS
   GET `https://cai.me/v1/readyz` every minute from three regions, expecting `"ok":true`, with an
   alert policy that emails the owner after three failed minutes. The bare `/readyz` answers
   404 on purpose (Metrics, below), so a check on it reads down. The Prometheus scrape and the
   alerts below come when there's a scraper.
10. **The origin only through Cloudflare.** The server answers on its own address too
    (34.18.125.16, checked 2026-10-14), past Cloudflare's protections. In the Google Cloud
    firewall, allow tcp 80 and 443 only from Cloudflare's published ranges
    (`cloudflare.com/ips`). The panel (`host.datac.com`) points straight at the same address, so
    either proxy it through Cloudflare as well or allow it from the owner's own address first,
    or the panel and its API lock themselves out. SSH stays restricted to the owner. The origin's
    certificate for `cai.me` verifies (checked 2026-10-14), so SSL Full (strict) works now.
11. **Hosting in the EU** (counsel's decision, LEGAL-REVIEW-2026-10.md): a VM in a Google Cloud EU
    region (`europe-west3` Frankfurt or `europe-west1` Belgium, the same machine type), EasyPanel
    installed, the services recreated from this page, the database restored from the latest
    backup (Backups, below, with `caime_feed_forget()` run since the server is new) and `/data`
    copied across, then the `A @` record moved and
    `HOSTING_PROVIDER` set to the new region. Before launch, while there's nothing to migrate
    but the owner's own test data, it's an afternoon; after, a maintenance window.

Caime Mail (below) came after it, and is on in production by 2026-10-18: it took Postmark Pro
and moved `cai.me`'s MX from Cloudflare to Postmark, so the staff addresses are routed by Caime
itself (`MAIL_STAFF_HANDLE`).

### The service's environment, in full (2026-10-14)

What `caime` carries in EasyPanel, in this order, read through EasyPanel's API (names, and
whether a value is still a placeholder; the values are EasyPanel's alone). A commented line is a
setting not yet in use, with what its value is: uncomment it once it's real, never with a
placeholder, since a variable's presence is what turns its feature on (a first paste on
2026-10-14 left thirteen uncommented, and the new container would have refused
`SPEECH_PROVIDER`'s). The four `BACKUP_S3_*` lines go in together, or none.

```
# --- The service (NODE_ENV, PORT, HOST, DATA_DIR and WEB_DIR come from the image)
DATABASE_URL=…                      # set
DATABASE_POOL_MAX=20
PUBLIC_URL=https://cai.me
TRUST_PROXY=true
LOG_LEVEL=info
WORKERS=true
SESSION_DAYS=90
MINIMUM_AGE=13

# --- Who runs Caime (the privacy page, the terms, the DPA)
LEGAL_NAME=DATA C OÜ
LEGAL_ADDRESS=…                     # set: the registered address
LEGAL_REGISTRATION=…                # set: the Commercial Register code
GOVERNING_LAW=Estonia               # counsel's decision, 2026-10-14
CONTACT_EMAIL=hello@cai.me
HOSTING_PROVIDER=Google Cloud, Doha, Qatar
EDGE_PROVIDER=Cloudflare, Inc.

# --- The operator's tokens
ADMIN_TOKEN=…                       # set
METRICS_TOKEN=…                     # set
# OPERATOR_TOKENS=<name:token, one per person who operates Caime>

# --- AI assist, Cai and organizations' agents (the model follows the code)
ANTHROPIC_API_KEY=…                 # set

# --- Billing (Stripe, live)
STRIPE_SECRET_KEY=…                 # set
STRIPE_WEBHOOK_SECRET=…             # set
STRIPE_PORTAL_CONFIGURATION=…       # set
# STRIPE_CONNECT_CLIENT_ID=<ca_… when organizations' own checkout is turned on>
# STRIPE_CONNECT_WEBHOOK_SECRET=<whsec_… of https://cai.me/v1/checkout/stripe/webhook>

# --- Calls (Cloudflare TURN)
CLOUDFLARE_TURN_KEY_ID=…            # set
CLOUDFLARE_TURN_API_TOKEN=…         # set

# --- Web push (keys generated in the database on first boot) and phone push
VAPID_SUBJECT=mailto:hello@cai.me
EXPO_ACCESS_TOKEN=…                 # set

# --- Mail out (Postmark): codes and reset links (step 5)
EMAIL_FROM=Caime <hello@cai.me>
SMTP_URL=…                          # set: smtp.postmarkapp.com, the server token. Also what booking
                                    #   before an account needs (R97 (1)): without it an item's page
                                    #   offers no form, a provisional booker hears nothing, and an
                                    #   address with history waiting can't be claimed at sign-up

# --- Caime Mail (R75), after Postmark Pro and the MX move (below)
# MAIL_DOMAIN=cai.me
# MAIL_PROVIDER=postmark
# MAIL_PROVIDER_TOKEN=<postmark server token>
# MAIL_WEBHOOK_SECRET=<openssl rand -hex 24>
# MAIL_STAFF_HANDLE=<the handle that takes postmaster@, abuse@, support@, hello@ …>

# --- Contacts from Google and Microsoft accounts (R89, below): uncomment each pair once its client is made
# GOOGLE_CLIENT_ID=<the web client's id, …apps.googleusercontent.com>
# GOOGLE_CLIENT_SECRET=<its secret>
# MICROSOFT_CLIENT_ID=<the Entra app's application (client) id>
# MICROSOFT_CLIENT_SECRET=<a client secret's value>

# --- Backups: a checked dump a day on /data, kept 30 days; a copy off this machine (Backups, below)
BACKUP_ENABLED=true
BACKUP_EVERY_HOURS=24
BACKUP_KEEP_DAYS=30
# BACKUP_S3_ENDPOINT=https://storage.googleapis.com
# BACKUP_S3_BUCKET=<a bucket in an EU region>
# BACKUP_S3_ACCESS_KEY_ID=<HMAC access id>
# BACKUP_S3_SECRET_ACCESS_KEY=<HMAC secret>
# BACKUP_KEY=<openssl rand -base64 32, kept in a password manager too: restoring needs it>

# --- Keys apart from the data (M16 B5, "Keys apart from the data", below): set once, never removed
# VAULT_KEY=<openssl rand -base64 32, kept in a password manager too>

# --- Health of the providers, hourly (R78); webhooks only to public https addresses
PROVIDER_HEALTH_ENABLED=true
# The agent's nightly evaluation (M16 G6c), where AI assist is on
AGENT_EVAL_ENABLED=true
WEBHOOKS_ALLOW_PRIVATE=false
# Link previews (M16 E4c), on unless set false; never LINK_PREVIEWS_ALLOW_PRIVATE in production
LINK_PREVIEWS=true

# --- Voice notes into words, after the owner's bake-off (docs/SPEECH.md)
# SPEECH_PROVIDER=<openai or elevenlabs>
# SPEECH_API_KEY=<the provider's key>
# --- Cai's voice in a call (R114, "Answer, Cai joins in"), once the notes' provider is chosen
# TTS_PROVIDER=elevenlabs
# TTS_VOICE_ID=<the voice Cai speaks with>
```

Checked live on 2026-10-14 after the 03:03 deploy: no placeholder left, the privacy page names
the operator with its register entry, Cloudflare in front and Postmark sending, the terms are
under Estonian law, and every provider probe is up (`caime_provider_up`: dns, stripe,
cloudflare, anthropic, smtp).

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

To run the tested image instead, pull `ghcr.io/h-khalid-h/caime:<sha>` (every green commit of
`main` is published; `production` names the one production runs), or build it yourself
(`docker build -t caime .`). The image says which commit it is: `/v1/healthz` answers
`{"ok":true,"version":"<sha>"}`, and `unknown` for a build made without `CAIME_VERSION`.

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
| `ADMIN_TOKEN` | — | The operator's token for `/v1/admin`: setting plans, giving out reserved and held handles, reviewing reports and reading product metrics (below). At least 24 characters; without it (and without `OPERATOR_TOKENS`) those routes don't exist. Its holder is `operator` in the audit log. |
| `OPERATOR_TOKENS` | — | A token for each person on the operator's side, `mona:<token>,ali:<token>` (names of lowercase letters, digits, dots, dashes or underscores; tokens of 24 characters or more, each different). They open the same routes, and every plan change, handle given, report settled, removal and suspension names who did it (`metadata.operator` in the audit log; never in anyone's data export). Take one back by removing it, without touching the others. |
| `PLANS_URL` | — | Where people see plans and upgrade (a pricing page or a payment link). The app links to it from a plan's limits when billing isn't set up; without either, it says upgrades can't be bought yet. |
| `LEGAL_NAME` | `DATA C OÜ` | Who runs this Caime, as its privacy policy, terms and help say. |
| `CONTACT_EMAIL` | `hello@cai.me` | Where those pages tell people to write (data requests, security reports, help). |
| `LEGAL_ADDRESS` | — | The operator's postal address, as the privacy page's controller and the terms' contact (docs/LEGAL-REVIEW-2026-10.md). Unset, the pages leave it out. |
| `GOVERNING_LAW` | — | The law and courts the terms are under ("Estonia"); the terms carry the clause only when it's set. |
| `LEGAL_REGISTRATION` | — | The register the operator is in and its number ("Estonian Commercial Register 12345678"), as the EU's e-Commerce Directive (Art. 5) asks an online service to show where anyone can find it: in the opening and the contact line of the privacy page and the terms. Unset, they leave it out. ⛔ The owner's to set in EasyPanel, from the Commercial Register. |
| `PRIVACY_URL`, `TERMS_URL`, `HELP_URL` | Caime's own pages | Caime serves its own privacy policy, terms and help at `/privacy`, `/terms` and `/help` on `PUBLIC_URL`, for anyone, signed in or not (link app store listings there). Set one of these (a full http(s) address) to publish that page somewhere else instead: You → About links there, and Caime's own page redirects there, so there's only ever one of each. The app reads them from the server (`GET /v1/about`), so no domain is built into it. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | — | Billing (below): Stripe's secret or restricted key, and the signing secret of the webhook endpoint at `/v1/billing/webhook`. With both, Pro and Business are bought in the app through Stripe Checkout and managed in Stripe's customer portal. |
| `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_CONNECT_WEBHOOK_SECRET` | — | An organization's own checkout (R65, above): Connect's client id and the signing secret of the Connect endpoint at `/v1/checkout/stripe/webhook`. With them and `STRIPE_SECRET_KEY`, an organization's owner can connect its own Stripe account and its Pay cards are paid by card. |
| `STRIPE_PORTAL_CONFIGURATION` | the account's default | The customer portal configuration (`bpc_…`) to open. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | generated | Web Push keys. Generated and stored in the database on first boot; set them only to reuse existing keys. |
| `VAPID_SUBJECT` | `mailto:hello@cai.me` | Contact for push services. |
| `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256` | — | The phone apps' claim on the domain (R35): with them, `/.well-known/apple-app-site-association` and `assetlinks.json` say that `cai.me/@handle`, an organization's page, a conversation, an invite, a space and a profile open the installed app, and that the app may use the passkeys made on the web. The team id is Apple Developer → Membership; each fingerprint is Play Console → App integrity → App signing (the upload key's too, for a development build), comma separated. Set them with the first store or development build. |
| `EXPO_ACCESS_TOKEN` | — | Phone push through Expo, signed as the account that owns the Expo project (required once that project turns on Expo's enhanced push security); with it, Expo is probed hourly (`caime_provider_up{provider="expo"}`). |
| `SMTP_URL` | — | Where mail goes out (`smtps://user:pass@host:465`, or `smtp://` with STARTTLS): the code that confirms an address and the link that resets a password (R48). Without it nothing is sent, and the app says to use a recovery code. |
| `EMAIL_FROM` | `Caime <hello@cai.me>` | The sender. |
| `ANTHROPIC_API_KEY` | — | AI assist (rewrite, translate, catch me up, find follow-ups). Without it the AI settings don't appear and Caime uses its heuristics (R17). Each person still turns it on for themselves. |
| `SPEECH_BASE_URL` | — | Another speech-to-text endpoint (a gateway, or the stand-in the tests run), as `ANTHROPIC_BASE_URL` is for the model. |
| `SPEECH_PROVIDER`, `SPEECH_API_KEY`, `SPEECH_MODEL` | — | Voice notes into words (PRD §46, docs/SPEECH.md): `openai` or `elevenlabs`, its key, and the model (the provider's default when unset). Off without the first two; each person's AI assist switch still decides for their own notes. ⛔ Set after the owner's bake-off on real clips. |
| `TTS_PROVIDER`, `TTS_API_KEY`, `TTS_VOICE_ID`, `TTS_MODEL`, `TTS_BASE_URL` | — | Cai's voice in a call (PRODUCT-REVIEW R114, M17 I13g, "Answer, Cai joins in"): `elevenlabs`, its key (the speech-to-text key when that's ElevenLabs too), the voice it speaks with, the model (`eleven_flash_v2_5` when unset) and another endpoint for the stand-in. Off without the provider and a voice: the mode isn't offered. ⛔ Set with the speech provider. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | The top model: finding follow-ups on a paid plan and the agents of organizations on Business or Enterprise (M16 H7). Sonnet 5.5 halves what they cost (`docs/RESOURCES.md`, "What a person costs"). |
| `ANTHROPIC_MODEL_LIGHT` | `claude-haiku-5-5` | Everything else, and those two on a free plan: rewrite, translate, catch-up, Cai and the friends, search, the brief (short, frequent, forgiving). Set it to `ANTHROPIC_MODEL`'s value to run everything on one model. |
| `ANTHROPIC_BASE_URL` | — | Another Messages API endpoint, such as a gateway. |
| `STUN_URLS` | `stun:stun.l.google.com:19302` | Calls: STUN servers that tell each device its public address, comma-separated. Set it empty for none (calls then connect only on the same network). |
| `TURN_URLS`, `TURN_SECRET` | — | Calls: a TURN relay (such as coturn, with `use-auth-secret` and `static-auth-secret` set to `TURN_SECRET`), comma-separated `turn:` and `turns:` addresses. Each person gets credentials that expire after 12 hours. Without a relay, calls between people on strict networks (some offices, some mobile carriers) won't connect. |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | — | Calls: Cloudflare's TURN relay instead of running one. In the Cloudflare dashboard, **Realtime → TURN Server → Create**, then set the key's id and its API token here. Each person gets credentials for 12 hours when a call starts; if Cloudflare doesn't answer in 4 seconds the call goes on with STUN only (`caime_turn_credentials_total{outcome}` counts both). The privacy page then says calls may go through a relay Cloudflare runs. |
| `DATABASE_POOL_MAX` | `20` | Connections per instance. |
| `LOG_LEVEL` | `info` | `warn` in quiet production. |
| `BACKUP_ENABLED`, `BACKUP_DIR`, `BACKUP_EVERY_HOURS`, `BACKUP_KEEP_DAYS` | `true`, `DATA_DIR/backups`, `24`, `30` | Database backups (below). |
| `HOSTING_PROVIDER` | — | Who hosts this Caime and where, as the privacy page's list of processors names it (R54): "Hetzner Online GmbH, Germany". Unset, the page says "our hosting provider". Set in production to `Google Cloud, Doha, Qatar` (the owner, 2026-10-14; checked 2026-10-13: the server, 34.18.125.16, is in Google's published range for `me-central1`; the entity on the contract, Google Cloud EMEA Limited or Google LLC, may replace "Google Cloud"), a transfer outside the EEA that the DPA's section 13 names. |
| `EDGE_PROVIDER` | — | Whose network carries every request in front of the servers (a CDN or proxy that ends HTTPS: "Cloudflare, Inc." while `cai.me` is proxied), named on the privacy page's list of processors right after the host. Unset, none is named, so set it whenever the domain is proxied. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | — | A copy of each backup off the host, to an S3-compatible bucket (Backups, below); all four, or none. `BACKUP_S3_REGION` (`auto`), `BACKUP_S3_PREFIX` (`caime/backups/`) and `BACKUP_S3_PATH_STYLE` (`true`) beside them. |
| `FILES_S3_ENDPOINT`, `FILES_S3_BUCKET`, `FILES_S3_ACCESS_KEY_ID`, `FILES_S3_SECRET_ACCESS_KEY` | — | Files in an S3-compatible bucket rather than on `DATA_DIR` (Scaling, below); all four, or none. `FILES_S3_REGION` (`auto`), `FILES_S3_PREFIX` (`caime/files/`) and `FILES_S3_PATH_STYLE` (`true`) beside them. The bucket stays private: Caime reads it, nobody else. |
| `TRUST_PROXY` | `true` | EasyPanel's proxy sets `X-Forwarded-*`; keep it on behind it. |

### Billing (Stripe)

Plans are bought in the app once Stripe is set up; until then, an operator sets them
(`/v1/admin`). In Stripe (the same steps in test mode first, if the account has it):

1. **Products and prices.** A product for Pro and one for Business, each with a monthly and a
   yearly recurring price whose **lookup keys** are `caime_pro_month`, `caime_pro_year`,
   `caime_business_month` and `caime_business_year`. Prices made before the product took its
   one name (2026-10-25) carry `caishy_…` keys, which are still read (a price under the new key
   first): move each to its `caime_…` key with `transfer_lookup_key` when convenient, and
   nothing else changes. The app shows whatever those prices are,
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
`caime_payer` metadata; `caishy_payer` on one begun before 2026-10-25), so people on an old price are followed to the end.

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

### An organization's own checkout (Stripe Connect, R65) ⛔ not turned on in production

An organization's owner can connect the organization's **own** Stripe account, and its Pay cards
can then be paid by card straight into it. Caime takes no fee and never sees a card. It's off
until the operator turns it on, which needs the owner of Caime's live Stripe account (tell them
first: it's live):

1. **Connect.** In the Stripe dashboard, turn on Connect for the platform (Standard accounts,
   OAuth) and add `https://<PUBLIC_URL>/v1/checkout/stripe/return` as a redirect URI. Its client
   id (`ca_…`) is `STRIPE_CONNECT_CLIENT_ID`.
2. **Connect webhook.** An endpoint at `https://<PUBLIC_URL>/v1/checkout/stripe/webhook`
   listening to **connected accounts**, for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.expired` and
   `account.updated`, on API version `2024-06-20`. Its signing secret is
   `STRIPE_CONNECT_WEBHOOK_SECRET`.
3. Set both on the service and redeploy. `STRIPE_SECRET_KEY` is the same key billing uses; a
   restricted key also needs write access to Checkout Sessions on connected accounts and read
   access to Accounts.

**Branding.** Stripe shows its own branding on Checkout, the Connect consent page and receipts.
Upload these under Settings → Branding: icon `docs/brand/stripe/stripe-icon.png` (the heart
mark: no character on a money surface, BRAND.md B2); logo `docs/brand/stripe/stripe-logo.png`
(white wordmark) with brand colour `#3B2E5B` and accent colour `#FF8FB1`, or
`stripe-logo-dark.png` for a light brand colour. They're made by
`pnpm --filter @caime/brand assets`, never by hand.

A card is marked paid only from what Stripe says when the server asks it (the payer's return,
or the webhook naming the card), never from an event's own copy. Disconnecting asks Stripe to
forget Caime's access (`/oauth/deauthorize`).

### Caime Mail (R75), on in production

On by 2026-10-18, checked from a session without a credential: `MAIL_DOMAIN`, `MAIL_PROVIDER`,
`MAIL_PROVIDER_TOKEN`, `MAIL_WEBHOOK_SECRET` and `MAIL_STAFF_HANDLE` on the service, the privacy
page naming Postmark as the receiver of mail to Caime addresses (it does only while
`MAIL_DOMAIN` and `MAIL_PROVIDER` are both set), and `cai.me`'s MX at `inbound.postmarkapp.com`.
What only the owner sees: the inbound and events webhooks in Postmark (steps 2 and 4 below) and
`POST /v1/admin/providers/check` showing `smtp` and `mail-in` up.

Every handle is an address at `MAIL_DOMAIN` (`noor@cai.me`), and Cai's is `assistant@cai.me`
(R86: it sends meetings' invitations and reads only the answers to them), received and sent
through the provider (`MAIL_PROVIDER=postmark`, `MAIL_PROVIDER_TOKEN`), whose webhooks carry
`MAIL_WEBHOOK_SECRET` (16 characters at least, `openssl rand -hex 24`). Off until the operator
sets them all. Who sent a mail in is Caime's own check of the raw message (`lib/mail-auth.ts`:
DKIM against DNS, SPF for the address Postmark's server saw connect, DMARC), never a header in
the payload, which is the sender's to write; so the raw message must come with it, or every
mail in is dropped as unverified (provider health then shows `mail` down, naming the setting).

1. **The plan**: Postmark Pro (inbound isn't on Basic). Each mail in counts as one, and each
   Cc'd or Bcc'd address at the domain as one more.
2. **Receiving.** On the server's inbound stream: the inbound domain `cai.me`, "Include raw email
   content" on, and the webhook `https://caime:<MAIL_WEBHOOK_SECRET>@cai.me/v1/mail/in/postmark`
   (basic auth carries the secret; `?secret=` does too). Then, in one change at Cloudflare,
   Email Routing off and `MX @ 10 inbound.postmarkapp.com`: from that moment every address at
   `cai.me` is Caime's, the staff ones included: `postmaster@`, `abuse@`, `hello@`, `support@`,
   `help@`, `contact@`, `info@`, `privacy@`, `security@`, `legal@` and `billing@` reach the
   handle `MAIL_STAFF_HANDLE` names (Caime's own organization's, or the owner's), and without
   it nobody. Set it before the MX moves.
3. **Sending** is already set up (going live, step 5): the same domain, DKIM and Return-Path.
4. **Delivery events.** A webhook on the outbound stream for Delivery, Bounce and Open at
   `https://caime:<MAIL_WEBHOOK_SECRET>@cai.me/v1/mail/events/postmark`. Open is what says
   "Opened, probably" (R75); Caime asks for the pixel per mail (`TrackOpens`), so leave the
   stream's own open tracking off. Without Open ticked, mail says Seen only when answered or
   opened in Caime.
5. Set `MAIL_DOMAIN=cai.me`, `MAIL_PROVIDER=postmark`, `MAIL_PROVIDER_TOKEN`,
   `MAIL_WEBHOOK_SECRET` and `MAIL_STAFF_HANDLE` on the service and redeploy; the privacy page
   then names the provider. Check: `POST /v1/admin/providers/check` shows `mail` up; a mail
   from an outside mailbox to your own handle arrives in Caime as from that address; one to
   `postmaster@cai.me` arrives for the staff handle.

### Contacts from Google and Microsoft (R89) ⛔ not turned on in production

"From your contacts" offers a Google and an Outlook account once their clients are set; the
phone's address book, the browser's picker and a file need nothing. Neither client ever gives
Caime anything that renews: the server trades a one-time code for an hour's access and hands it,
sealed, to the device that asked, which reads the contacts itself (PRODUCT-REVIEW R89). The
browser reads `people.googleapis.com` and `graph.microsoft.com` only once their client is set
(the pages' `connect-src` follows the configured accounts).

1. **Google.** In a Google Cloud project: enable the **People API**; on the OAuth consent screen
   (External), add the scopes `…/auth/contacts.readonly` and `…/auth/contacts.other.readonly`,
   the privacy policy `https://cai.me/privacy` and the terms `https://cai.me/terms`; create an
   OAuth client of type **Web application** with the authorised redirect URI
   `https://cai.me/v1/contacts/accounts/google/back`. Its id and secret are `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET`. Both scopes are sensitive: until Google has verified the app
   (a demonstration video of the sheet, the privacy page's Limited Use statement, a few days to
   weeks), it shows "unverified" and lets a hundred people in, which is enough to try it.
2. **Microsoft.** In Microsoft Entra, App registrations: a new registration for **accounts in
   any organizational directory and personal Microsoft accounts**, a **Web** redirect URI
   `https://cai.me/v1/contacts/accounts/microsoft/back`, the delegated Graph permissions
   `Contacts.Read` and `People.Read` (no admin consent needed), and a client secret (note when it
   expires: a new one is a new `MICROSOFT_CLIENT_SECRET`). The application (client) id is
   `MICROSOFT_CLIENT_ID`. Publisher verification (a Microsoft Partner Network id) lets people in
   organizations that only allow verified publishers say yes. `MICROSOFT_TENANT` stays `common`
   unless only one organization's people should use it.
3. Set each pair on the service and redeploy. Check: on the web, Connect, "From your contacts"
   lists Google and Outlook; reading one lands back on the sheet with who's on Caime, and
   nothing about it is in the server's log but the method and the path.

#### Connected accounts (R90)

The same two clients connect a person's account for their calendar under Settings · Apps. The
server keeps that connection (a refresh token, sealed with its own key) and reads busy times
alone (PRODUCT-REVIEW R90). Add to each client:

1. **Google.** Enable the **Google Calendar API**; on the consent screen add the scopes `openid`,
   `…/auth/userinfo.email` and `…/auth/calendar.freebusy` (sensitive: Google verifies it, with a
   video of Settings · Apps connecting a calendar); add the redirect URI
   `https://cai.me/v1/accounts/google/back`.
2. **Microsoft.** Add the delegated Graph permissions `User.Read`, `offline_access` and
   `Calendars.ReadBasic`, and the **Web** redirect URI `https://cai.me/v1/accounts/microsoft/back`.
3. No new variable. Check: Settings · Apps shows "Your accounts" with Connect Google and Connect
   Microsoft; connecting one comes back to the same screen, the row says "read just now" a moment
   later, and a bookable slot over a meeting in that calendar is no longer offered.
4. **Files (phase 2).** Microsoft: add the delegated Graph permission `Files.Read`; nothing else.
   Google: enable the **Google Picker API** and the **Google Drive API**, add the scope
   `…/auth/drive.file` to the consent screen (not restricted), and create an **API key** under
   Credentials restricted to the Picker API and the website `https://cai.me/*`. Set
   `GOOGLE_PICKER_API_KEY` to that key and `GOOGLE_PICKER_APP_ID` to the project's number (the
   digits on the project's dashboard), then redeploy. Without them, Files is offered for Microsoft
   alone. Check: Settings · Apps shows "Add Files" on each account; in a conversation the Share
   sheet lists Google Drive and OneDrive; a picked file arrives as an attachment.
5. **Every calendar, and Plans (R96).** Google: add the scopes
   `…/auth/calendar.calendarlist.readonly` (which calendars are the person's own, so each is read,
   not only the main one) and `…/auth/calendar.events.owned` (Caime writes the person's meetings
   and appointments into the calendars they own; sensitive, verified with the rest) to the consent
   screen. Microsoft: add the delegated Graph permission `Calendars.ReadWrite`. No new variable.
   A calendar connected before this reads its main calendar alone and writes nothing: its row says
   "main calendar only" with **Read every calendar**, and offers **Add Plans**; either asks the
   provider again and keeps the rest. Check: book one of your own items from another account; the
   booking appears in that Google or Outlook calendar as tentative within half a minute, turns
   firm when you confirm it, and leaves it when you cancel it.

#### Phone numbers proven over WhatsApp (R91)

A person adds a phone number under Settings · Apps and proves it with a code Caime sends over
WhatsApp, through Meta's WhatsApp Business Platform (the Cloud API). Caime sends nothing else
that way and reads nothing back.

1. In Meta Business Suite, verify the business, then in a Meta app with the **WhatsApp** product
   add a phone number that is not on a personal WhatsApp (the sender).
2. Under WhatsApp Manager, Message templates, create an **Authentication** template named
   `caime_code` in English (`en_US`): the code in its body and a **Copy code** button. Wait for
   its approval.
3. Make a **System user** with the app and the WhatsApp account assigned, and generate a
   permanent token with `whatsapp_business_messaging`.
4. In EasyPanel set `WHATSAPP_TOKEN` (that token) and `WHATSAPP_PHONE_NUMBER_ID` (the sender's
   id, digits, from the app's WhatsApp, API setup page); `WHATSAPP_TEMPLATE` and
   `WHATSAPP_TEMPLATE_LANGUAGE` only if the template's name or language differ. Redeploy.
5. Check: `POST /v1/admin/providers/check` lists `whatsapp` up; Settings · Apps offers "Add a
   phone number", and the code arrives on that number's WhatsApp within seconds. Each code is a
   paid authentication conversation (Meta's price for the number's country).

### 4. Continuous deployment

Every push to `main` runs CI (lint, typecheck, 230+ tests on real Postgres, the web budget, the
end-to-end suite), then builds and publishes the image and smoke-tests it. To have EasyPanel
redeploy automatically after that:

1. In the `caime` service, copy the **Deploy Webhook** URL.
2. In GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**,
   name `EASYPANEL_DEPLOY_WEBHOOK`, value the URL.

The CI job calls it only after the new image passed its smoke test.

#### Running the tested image ⛔ the owner's switch

What runs today is EasyPanel's own build of `production`: the same Dockerfile, but another
builder at another moment, so not byte for byte the image CI tried. To run exactly what passed,
in the `caime` service set **Source → Docker image** `ghcr.io/h-khalid-h/caime:production` (the
repository is public, so the package is: no registry credential), keep the environment and the
mount, and set `EASYPANEL_DEPLOY_WEBHOOK` as above, since nothing watches a registry tag: on a
green run CI moves the `production` tag to the tested sha and then calls the webhook, and
EasyPanel pulls it. Rolling back is pointing the service at the sha tag of the release before.
Verify by `curl -fsS https://cai.me/v1/healthz`: `"version"` is the commit (a source build says
`unknown`).

#### Staging ⛔ the owner's service

A second service, `caime-staging`, with its own database, volume and domain (say
`staging.cai.me`; `PUBLIC_URL` to match, Stripe's test keys or none, mail and the connected
accounts off), **Source → Docker image** `ghcr.io/h-khalid-h/caime:staging`. In GitHub set the
secret `EASYPANEL_STAGING_DEPLOY_WEBHOOK` (its deploy webhook) and the repository variable
`STAGING_URL` (`https://staging.cai.me`). From then on a green commit goes to staging first: CI
moves the `staging` tag, calls its webhook and waits up to ten minutes for `/v1/healthz` there to
answer as that commit and `/v1/readyz` with 200; only then do the `production` tag and the
branch move. Staging that never comes up on the commit is a red run, and production stays.
Without the secret and the variable the step is skipped and nothing changes.

#### Migrations

`pnpm migrations:lint` runs in CI against `production` (and in `pnpm check` against
`origin/production` as fetched: `git fetch origin production` first). A release's new migrations
must keep to CLAUDE.md's convention 7: a migration production has run is never changed; a
contraction (a column or table dropped, renamed or retyped) names the commit, already in
production, that stopped reading it (`-- contracts after <sha>`), so the old container never
reads a column the new schema dropped; a backfill of a big table (messages, participants,
notifications and the rest the script lists) is a procedure that updates a batch and commits it
in a loop, called from a `-- no-transaction` file; an index on a big table is built
`concurrently`, in a `-- no-transaction` file of its own, which holds one statement.

## Expo Go (the phone app, before store builds)

Until the store builds exist (⛔), the phone app runs in Expo Go, from either of these:

- **The `caime-go` service** (project `caishy`, EasyPanel): Expo's own server with the app's
  production JavaScript, built from `Dockerfile.expo-go` on `production` like `caime`, so it
  moves only with a green CI run. `EXPO_PACKAGER_PROXY_URL` on the service is its own https
  address (`https://caishy-caime-go.0hqwb7.easypanel.host`), which the manifest hands the
  phone; the app talks to `https://cai.me`. On an iPhone, open
  `exps://caishy-caime-go.0hqwb7.easypanel.host` (the Camera app reads it from a QR code, or
  type it into Safari) and Expo Go opens it. Expo Go opens a project it doesn't reach on the
  same Wi-Fi only when Expo's server signs it as an Expo account ("You need to be signed in to
  Expo Go and Expo CLI"), so the service needs, set in EasyPanel only: `EXPO_TOKEN` (an access
  token of that account, expo.dev → Account settings → Access tokens) and `EXPO_PROJECT_ID` (a
  project of that account, expo.dev → Projects → Create, named caime; `app.config.ts` adds it).
  Expo Go is then signed in to that same account. The first open after a deploy bundles the app,
  about 20 seconds. Its image holds the app and the packages it's built from, never the
  server's code: Expo's server serves any source file it can see. Stop or delete the service
  when the store builds replace it.
- **Your own computer**: `pnpm dev:phone` (`scripts/dev-phone.mjs`) starts Expo's server
  against the live Caime (`CAIME_API_URL` to change it); scan its QR code with the iPhone on
  the same Wi-Fi.

Calls aren't in Expo Go: they need react-native-webrtc's native code, so only a development
build (`npx expo run:ios`, or an EAS build) or a store build has them. Expo Go doesn't offer
them, and nothing of them loads. Everything else is there, private conversations included.

Notifications reach an iPhone in Expo Go: Chats offers to turn them on (or Settings ·
Notifications, "On this phone"), iOS asks once, and the app registers the phone's Expo token for
the project `caime-go` carries (`EXPO_PROJECT_ID`), so a message written from another device
then rings while Caime is closed. Expo Go on Android has had no remote notifications since SDK
53, so there the app offers none; the development build has them on both.

## Development and store builds (EAS)

`apps/app/eas.json` has three profiles, each pointing the app at `https://cai.me`
(`EXPO_PUBLIC_API_URL`): **development** (a development client for the owner's own phone, with
calls and private conversations, which Expo Go can't run), **preview** (TestFlight and an
Android APK for testers) and **production** (the stores, build numbers counted by EAS). What
they need, once, and none of it in the repository:

1. An Expo account with a project named `caime`: `EXPO_PROJECT_ID` (the same one `caime-go`
   uses) and an access token, `EXPO_TOKEN`, in the shell that runs the builds.
2. An Apple Developer account (the team's, for `me.cai.app`) and a Google Play Console account;
   EAS asks for their credentials the first time and keeps the signing keys.
3. On the phone: for a development build, open the link EAS prints when it's done (an internal
   distribution); for preview, TestFlight (iOS) or the APK (Android).

```sh
cd apps/app
pnpm build:dev        # eas build --profile development --platform ios
pnpm build:preview    # TestFlight and an APK
pnpm build:store      # the stores; then: eas submit --profile production --platform all
```

The first development build is where calls, private conversations and push are tried on a
phone (ROADMAP M9); Expo Go stays for everything else until then.

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
The product's own organization takes @caime itself (2026-10-25): make it with any free handle,
verify the product's domain on its setup screen (`cai.me`, `PUBLIC_URL`'s name; the usual TXT
record), and its owner or an admin presses **Take @caime** there (`POST /v1/orgs/:id/handle/claim`,
audited with who did it). Nothing else is given that way: for any other reserved handle, or a
person, the operator gives one to the product's own account or organization, found by the handle
it has now: make the organization (or the account) with any free handle, then move it. Only a reserved
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
database pool, memory, uptime and event-loop delay, each configured provider's health
(`caime_provider_up{provider}`, `caime_provider_latency_seconds{provider}`, probed hourly, R78)
and the audit chain's state (`caime_audit_chain_ok`, `caime_audit_chain_seq`, checked daily).
Counts and timings only: never a message, a name, an id or a query. A scrape job:

```yaml
scrape_configs:
  - job_name: caime
    scheme: https
    authorization: { credentials: <METRICS_TOKEN> }
    static_configs: [{ targets: ['caime.example.com'] }]
```

**Alerts** worth having, in Prometheus's terms (any scraper's equivalent will do); the uptime
check is a GET of `/v1/readyz` every minute from outside (the path has the `/v1` prefix: the bare `/readyz` and `/healthz` answer 404 with a line saying so, never a page, so a monitor pointed at the wrong path reads down):

```yaml
groups:
  - name: caime
    rules:
      - alert: CaimeDown
        expr: up{job="caime"} == 0
        for: 3m
      - alert: CaimeErrors
        expr: sum(rate(caime_http_requests_total{status=~"5.."}[5m])) / sum(rate(caime_http_requests_total[5m])) > 0.02
        for: 10m
      - alert: CaimeJobsStuck
        expr: caime_jobs_oldest_seconds > 600
        for: 10m
      - alert: CaimeBackupOld
        expr: time() - caime_backup_last_success_timestamp_seconds > 129600
      # A provider's cheapest read failing for two hours in a row (R78): drift, a key gone, an outage.
      # Google's and Microsoft's sign-in are among them once their clients are set (M16 G2).
      - alert: CaimeProviderDown
        expr: caime_provider_up == 0
        for: 2h
      # Connected calendars whose read or plans keep failing (M16 G2): the person sees why on
      # their account's row; many at once is the provider's or Caime's, not theirs.
      - alert: CaimeAccountsFailing
        expr: sum(caime_connected_accounts{health="failing"}) > 5
        for: 2h
      # Plans a connected calendar refused at every try (M16 G4): one is the person's own odd
      # event; many is something Caime sends that the providers no longer take.
      - alert: CaimePlansStuck
        expr: caime_calendar_plans_stuck > 10
        for: 6h
      # The audit log's chain broken at its daily check (R78): a row changed, removed or put in.
      - alert: CaimeAuditChainBroken
        expr: caime_audit_chain_ok == 0
      # Someone waits on the operator (R49, M16 B6): a report or an appeal unread for a day, and a
      # report about a child's safety at once.
      - alert: CaimeModerationWaiting
        expr: caime_moderation_oldest_seconds > 86400
      - alert: CaimeChildSafetyReport
        expr: caime_moderation_waiting{kind="child_safety"} > 0
      # Work after a response backing up on an instance (M16 D2a): eight run at once and the rest
      # wait in order, so a queue that stays long means effects and mails running late.
      - alert: CaimeDeferredBacklog
        expr: caime_deferred{state="waiting"} > 200
        for: 5m
      # AI spend (docs/RESOURCES.md): tokens an hour across every feature; set the line where
      # the bill would surprise you (input and output priced apart, so watch both directions).
      - alert: CaimeAiSpend
        expr: sum(rate(caime_ai_tokens_total[1h])) * 3600 > 2000000
        for: 30m
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

## Production checklist: what the app service sets

Everything the server reads is in the table above; on EasyPanel the `caime` service sets only
what it must (2026-09-30: `DATABASE_URL`, `PUBLIC_URL`, `TRUST_PROXY`, `LOG_LEVEL`,
`ADMIN_TOKEN`, `METRICS_TOKEN`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION`, `CLOUDFLARE_TURN_KEY_ID`,
`CLOUDFLARE_TURN_API_TOKEN`) and leaves the rest to the image (`NODE_ENV`, `PORT`, `HOST`,
`DATA_DIR`, `WEB_DIR`) and to the code's defaults. Setting the defaults explicitly makes the
panel say what production runs on; these lines are safe to paste as they are:

```
NODE_ENV=production
PORT=8787
HOST=0.0.0.0
DATA_DIR=/data
WEB_DIR=/app/web
WORKERS=true
LOG_LEVEL=warn
DATABASE_POOL_MAX=20
SESSION_DAYS=90
MINIMUM_AGE=13
BACKUP_ENABLED=true
BACKUP_DIR=/data/backups
BACKUP_EVERY_HOURS=24
BACKUP_KEEP_DAYS=30
# BACKUP_S3_ENDPOINT=              # a copy of each backup off the host: all four, or none
# BACKUP_S3_BUCKET=
# BACKUP_S3_ACCESS_KEY_ID=
# BACKUP_S3_SECRET_ACCESS_KEY=
# FILES_S3_ENDPOINT=               # files in a bucket rather than on /data: all four, or none
# FILES_S3_BUCKET=
# FILES_S3_ACCESS_KEY_ID=
# FILES_S3_SECRET_ACCESS_KEY=
LEGAL_NAME=DATA C OÜ
CONTACT_EMAIL=hello@cai.me          # on a domain you hold, until cai.me is yours (REVIEW-2026-10, P0)
VAPID_SUBJECT=mailto:hello@cai.me   # the same address
ANTHROPIC_MODEL=claude-opus-5-5
# ANTHROPIC_MODEL_LIGHT=claude-haiku-5-5   # the default: everything but a payer's follow-ups and agent
ANTHROPIC_BASE_URL=https://api.anthropic.com
STRIPE_API_BASE=https://api.stripe.com
CLOUDFLARE_TURN_API_BASE=https://rtc.live.cloudflare.com
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=
CORS_ORIGINS=
WEBHOOKS_ALLOW_PRIVATE=false
DNS_SERVERS=1.1.1.1,8.8.8.8
```

Set since this list was written (checked by name on 2026-10-18): `SMTP_URL` and `EMAIL_FROM`
(Postmark's SMTP, from 2026-10-14), `EXPO_ACCESS_TOKEN`, and Caime Mail's five (below). Still
unset on purpose, each waiting on something only the operator has: `TURN_SECRET` and `TURN_URLS` (a
TURN server of Caime's own; Cloudflare's relay is in use), `PLANS_URL` (billing is live, so the
app sells plans itself), `PRIVACY_URL`, `TERMS_URL` and `HELP_URL` (Caime's own pages follow
`PUBLIC_URL`, so leaving them unset survives a change of domain), and the VAPID keys (generated
and kept in the database on first boot). A redeploy applies a change to the environment.

## Moderation

What people report lands in `reports`; the operator reviews them at `/admin/reports` (R49):
open the page, paste your operator token (`ADMIN_TOKEN` or your own from `OPERATOR_TOKENS`; it
stays in that tab), and load a status. A report can be
marked reviewing, dismissed or actioned; a reported message can be removed for everyone and a
reported update taken back, each exactly as its owner would do it, and the reported person
suspended (every way in closes; `PUT /v1/admin/people/:handle/suspension` with
`{"suspended": false}` lifts it), each written to the audit log. The same is available as JSON (`GET /v1/admin/reports?status=open`, `PATCH
/v1/admin/reports/:id`, `POST /v1/admin/reports/:id/remove-message`, `…/remove-update`).

Each report shows what its reporter saw when they made it (M16 B3): the reported message and up
to four before it, as they stood then, beside the message as it is now, so a report holds up after
its sender deletes it; a report about a child's safety is listed first. A closed report (actioned
or dismissed) is deleted with what it held after 180 days, a child's safety after a year.

Anyone may report a person's or an organization's page, an item or a collection without an
account (M16 B6): the form folded at the page's end posts to `POST /v1/public/report` and lands
in the same list with the visitor's name, address and page beside it (`visitor`); Caime mails
them a receipt, and the decision once the report is closed. A suspension says why: the page asks
for the reason (left blank, it's what the report was for), and the JSON routes take `reason`, ten
characters at least. Someone suspended who signs in sees that reason, may send one appeal at a
time and may download their data; appeals are on the same page (Appeals), or as JSON. Lifting one
lifts the suspension in the same step, upholding keeps it; either way the person is mailed, with
the note if there is one. `/metrics` says what waits (`caime_moderation_waiting{kind}` and
`caime_moderation_oldest_seconds{kind}`, kinds `report`, `child_safety` and `appeal`) and counts
reports and appeals as they come (`caime_reports_total{from,reason}`,
`caime_appeals_total{outcome}`).

```sh
# An organization suspended from its report (POST …/reports/:id/suspend-org), or by its handle:
# nobody writes as it or to it, its page and handle answer as nobody's to anyone new, its apps'
# tokens are refused; its team sees the reason. {"suspended": false} lifts it.
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"suspended": true, "reason": "Selling counterfeit goods"}' \
  https://caime.example.com/v1/admin/orgs/nile.dental/suspension
# A date of birth corrected at its owner's request (from their account's own address) where they
# can't do it themselves in Settings · Profile: a real day, never under the age Caime asks where
# they live (suspend instead); the audit log names the operator, never the date.
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"birthDate": "2009-04-02"}' https://caime.example.com/v1/admin/people/noor/birth-date
# A person suspended with the reason they'll read when they next sign in.
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"suspended": true, "reason": "Sent the same advert to dozens of strangers."}' \
  https://caime.example.com/v1/admin/people/noor/suspension
# Appeals waiting (waiting=0 lists decided ones too), then one decided: lift or uphold, with an
# optional note the person reads. 409 `appeal_decided` if it already was.
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://caime.example.com/v1/admin/appeals?waiting=1'
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"decision": "uphold", "note": "Three of the people you wrote to reported it."}' \
  https://caime.example.com/v1/admin/appeals/<id>
```

## Someone locked out

A person who writes in with no password, no device and no recovery code is helped with the same
token, and only at their account's own address (R48): nothing the operator does moves an account
to another address or hands over a word anyone wrote.

```sh
# Their account's facts: suspended or not, plan, each session's device (never its ip), how many
# private devices, personal tokens, app grants and recovery codes are left, the teams they're on.
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/people/noor
# Every way in ended at once (sessions, personal tokens, app grants), for an account that may
# be in the wrong hands. Their password still works.
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/people/noor/sessions
# A reset link mailed to the account's address (the one the sign-in screen's "Forgot" sends),
# good for an hour. 503 `email_unavailable` without SMTP_URL.
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/people/noor/reset
```

Each is in the audit log with who did it (`admin.person_viewed`, `admin.access_ended`,
`admin.reset_sent`; `metadata.operator`), and none in anyone's data export.

## Backups

A worker instance dumps the database once a day (`pg_dump`, custom format, compressed, no owners
or grants) into `BACKUP_DIR` (`/data/backups` on the volume unless set), checks each dump reads
back (`pg_restore --list`), keeps `BACKUP_KEEP_DAYS` (30) of them, and remembers the last one in
the database, so every instance's `/metrics` says when it was
(`caime_backup_last_success_timestamp_seconds`, `caime_backup_bytes`). The image carries
`postgresql-client-16`, the database's major version. Two instances never dump at once (an
advisory lock). Turn it off with `BACKUP_ENABLED=false` only where something else backs up.

The operator sees and makes them with the admin token:

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/backups
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/backups
```

**Alert** when the last success is older than a day and a half:
`time() - caime_backup_last_success_timestamp_seconds > 129600`.

**Providers and the audit log** (R78). Each configured provider is probed hourly with its
cheapest read; the operator reads the last answers, or asks for a probe now, and verifies the
audit log's chain (its newest 10,000 rows unless `?limit=` says otherwise; note the `head` the
answer gives, and the daily task writes it to the log, `audit chain verified`):

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/providers
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/providers/check
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/audit
```

`PROVIDER_HEALTH_ENABLED=false` turns the hourly probe off (the operator's check still runs).

**The agent's nightly evaluation** (M16 G6c). Where AI assist is on, Caime puts its own set of a
clinic's questions to each model a plan gives an organization's agent once a day, and keeps what
it found: `GET /v1/admin/agent-eval` reads it, `POST /v1/admin/agent-eval/run` runs it now (a job;
it takes minutes), and /metrics carries `caime_agent_eval_cases` and
`caime_agent_eval_findings` by tier. `AGENT_EVAL_ENABLED=false` turns the nightly run off (the
operator's still works).

**Connected accounts** (M16 G4). How every connected Google or Microsoft account's read and plans
last went, how many plans wait for their card to change after the provider refused them at every
try, and the connections not working (at most a hundred, the latest failure first) by whose they
are: the handle to look up with `/v1/admin/people/:handle`, never an address or anything read or
written. Reading it is audited with your name:

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://caime.example.com/v1/admin/connections
```

**Listings** (R74, R80). `GET /v1/admin/listings` is the queue of apps asking to be listed, each
with its screenshots (`/v1/admin/listings/:id/screenshots/:n`) and the points to check
(`checks`: `permissions`, each asked for because the app uses it today; `connect`, followed to
the end; `pages`, its help and privacy policy open; `conduct`, none of what the bar on
`/developers#bar` rules out). To list one, send every point back with the revision you looked
at; to decline, a reason; to take a listed app out, `delist` with a reason (any version):

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"decision":"list","revision":3,"checks":["permissions","connect","pages","conduct"]}' \
  https://caime.example.com/v1/admin/listings/<id>
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"decision":"delist","revision":0,"reason":"Its help page no longer opens."}' \
  https://caime.example.com/v1/admin/listings/<id>
```

The developer is told either way, in their language; the decision and the points checked are in
the audit log with the operator's name.

**Restore drill** (do it once now, and after any change to the database's version): from the
`caime` service's console in EasyPanel, or any host with the dump and `pg_restore` 16,

```sh
pg_restore --list /data/backups/caime-<date>.dump | head          # it reads
createdb -h db -U postgres caime_restore                          # a scratch database
pg_restore --no-owner --no-privileges -d postgres://postgres:<pw>@db:5432/caime_restore \
  /data/backups/caime-<date>.dump
psql postgres://postgres:<pw>@db:5432/caime_restore -c 'select count(*) from users'
dropdb -h db -U postgres caime_restore
```

To restore for real: stop the `caime` service, restore into a fresh database the same way, point
`DATABASE_URL` at it, start the service (its migrations run forward as needed). When the database
server itself is new (the `db` service recreated, its volume lost), run
`psql "$DATABASE_URL" -c 'call caime_feed_forget()'` once after the restore and before the
service starts: a new server counts transactions from the start, and without it the restored
messages would reach people's feeds (M16 G5) again as news once its count passed theirs. A
restore into a fresh database on the same server needs nothing.

**Off the host.** With `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID` and
`BACKUP_S3_SECRET_ACCESS_KEY` set (any S3-compatible store: AWS, Cloudflare R2, Backblaze B2,
Hetzner, MinIO; `BACKUP_S3_REGION` where the store wants one, `BACKUP_S3_PREFIX`, default
`caime/backups/`, `BACKUP_S3_PATH_STYLE=true` unless the store wants virtual hosts), each dump
is put in the bucket the moment it has been checked, signed per request (Signature Version 4)
with keys that may only write that prefix. The record says where (`copy`), `/metrics` says when
(`caime_backup_last_copy_timestamp_seconds`), and a copy that failed (the store away) is tried
again by the hourly task while the file is still on the volume. The bucket's own lifecycle rule
expires old copies (thirty days matches `BACKUP_KEEP_DAYS`); Caime never deletes there. To
restore from the bucket, download the object and follow the drill above. ⛔ Until the owner sets
those four, the dumps sit on the same volume as uploads: take one by hand after anything you'd
hate to lose.

**Alert** when no copy has gone for a day and a half, once a bucket is set:
`time() - caime_backup_last_copy_timestamp_seconds > 129600`.

**Encrypted** (M16 B5). With `BACKUP_KEY` set (32 random bytes, `openssl rand -base64 32`), each
checked dump is encrypted before it's kept or copied (AES-256-GCM, streamed; the file is
`caime-<date>.dump.enc`, beginning `CAIMEBK1` and the key's id), decrypted through once to check
it, and only then put in place; the plain dump never stays on the volume, and the bucket gets the
encrypted file. `/metrics` says whether the last one was (`caime_backup_encrypted`), and
`GET /v1/admin/backups` says whether new ones will be (`encrypts`). Keep the key where the
backups aren't (a password manager, never the bucket): without it a backup is noise. To restore,
turn the file back first, with the key in the environment, never on the command line:

```sh
BACKUP_KEY=… node dist/decrypt-backup.js caime-<date>.dump.enc /tmp/caime-<date>.dump
# from a checkout instead: BACKUP_KEY=… pnpm --filter @caime/server decrypt-backup <in> <out>
```

then follow the drill above with the `.dump`. A file made with another key says so, with both
keys' ids; one changed or cut decrypts to nothing and leaves nothing behind. To replace the key,
set the new one: later backups use it, and earlier ones still need the one they were made with
(their id says which). ⛔ The owner sets `BACKUP_KEY` in EasyPanel; until then dumps are plain.

**Alert** when backups stop being encrypted once the key is set: `caime_backup_encrypted == 0`.

## Keys apart from the data

The refresh tokens of the Google and Microsoft accounts people connect (R90) are sealed with
AES-256-GCM. Until `VAULT_KEY` is set, the key that seals them is the database's own
(`accounts.vault` in `server_settings`), so a dump carries the key beside what it seals (review
2026-10-17 §5 H1). With `VAULT_KEY` (32 random bytes, `openssl rand -base64 32`) in the
environment:

- new tokens are sealed with it, each naming it by an id (a fingerprint, never the key);
- one sealed with the database's key opens with that key and is sealed again with `VAULT_KEY` the
  next time it's used, by a pass queued at start, and by the daily `vault.reseal` pass;
- once nothing that key opens is left, the database's key is deleted, so no later dump holds it.

`/metrics` says where it stands: `caime_vault_key_external` (1 once the instance has the key),
`caime_vault_database_key` (0 once the database's is gone) and `caime_vault_sealed` by `key`
(`sealing`, `older`: sealed with a key still here, `unopenable`: sealed with a key that's gone,
whose connection asks to be connected again). Dumps made before the move still hold the old key:
they age out after `BACKUP_KEEP_DAYS`, and the bucket's copies by its lifecycle rule.

Set it once and keep it: without it every connection must be connected again. To replace it, put
the new key in `VAULT_KEY` and the old one in `VAULT_KEY_PREVIOUS`, deploy, and remove
`VAULT_KEY_PREVIOUS` once `caime_vault_sealed{key="older"}` reads 0 (the next day's pass at the
latest). `VAULT_KEY_PREVIOUS` alone is refused at start. ⛔ The owner sets `VAULT_KEY` in EasyPanel
(and keeps a copy in a password manager); check the file first with `check-env`.

**Alert** when the key is set but the database still holds its own two days on, or when
anything is sealed with a key that's gone:

```yaml
      - alert: CaimeVaultKeyInDatabase
        expr: caime_vault_key_external == 1 and caime_vault_database_key == 1
        for: 2d
      - alert: CaimeVaultUnopenable
        expr: caime_vault_sealed{key="unopenable"} > 0
```

## Age checks

Caime can ask someone to check their age before something whose risk calls for it (M16 B7,
REVIEW 2026-10-17 §3): starting an organization (`org`), selling something for a price or taking
cards (`paid`), and writing first to someone they're not connected with (`stranger`). The check
happens on the provider's own page (a selfie, or a document); Caime keeps whether it found them
18 or over, how, how sure the provider was and when, never a picture. Under 18 by a check, the
account is under 18 for a year whatever date of birth it gave, unless a document says otherwise;
someone under 18 by their own date of birth is never asked. Nothing changes until it's set:

```sh
AGE_PROVIDER=agemin
AGEMIN_ASSET_ID=ast_...           # the asset's public key, from Agemin's dashboard
AGEMIN_SECRET_KEY=age_sk_live_... # its private key: the lookup by reference
AGEMIN_WEBHOOK_PUBLIC_KEY=...     # optional: the PEM its notices are signed with (\n for line breaks)
AGE_CHECK_TRIGGERS=org,paid,stranger
```

In Agemin's dashboard, add the webhook `https://cai.me/v1/age/webhook/agemin` for
`age.verification.approved` and `age.verification.rejected`: the notice says what every attempt
found (a retry that reads older never lifts an under-18), and the person's return
(`/v1/age/return`) asks Agemin by reference too, so either alone is enough to apply the answer
once. `pnpm --filter @caime/server check-env` refuses `AGE_PROVIDER` without its two keys, and a
trigger it doesn't know. `/metrics` counts checks begun and answered
(`caime_age_checks_total{provider,outcome}`), and the hourly provider probe reads a reference
nobody made (`caime_provider_up{provider="age"}`). ⛔ Before setting it, the owner signs Agemin's
terms and DPA and confirms where it processes and that it deletes each picture after the check
(the DPA draft names the provider; the privacy page names it once it's set).

## What the proxy needn't do

The server sends the web app's hashed scripts precompressed (Brotli 11 or gzip 9, made at build
time by `scripts/precompress.mjs`, `docs/RESOURCES.md`), with `Vary: Accept-Encoding`; a proxy
that compresses on the fly leaves a response that already carries `Content-Encoding` alone, so
nothing needs turning off. TLS, the certificate and the redirect from http are the proxy's.

## Scaling

Instances are stateless apart from `/data`: realtime fans out across instances through Postgres
`LISTEN/NOTIFY`, jobs are claimed with `FOR UPDATE SKIP LOCKED`, and migrations run under an
advisory lock, so several instances can boot together. With more than one instance:

- Put files in a bucket: with `FILES_S3_*` set (any S3-compatible store, as for backups) every
  file and thumbnail is kept there and read from there, signed request by signed request
  (`files-s3.test.ts`), and `/data` holds only uploads in progress. Set it before the second
  instance, on an empty store: files already on the volume aren't moved (copy `DATA_DIR/files`
  and `DATA_DIR/thumbs` under the prefix first, keys as they are).
- Uploads in progress stay on the instance that took them until they're done (they're sniffed,
  cleaned and thumbnailed there). A single-request upload (`POST /v1/files`, what the apps use)
  needs nothing; a resumable one (`POST /v1/uploads`, then `PATCH /v1/uploads/:id` part by part)
  must reach the same instance each time, so pin `/v1/uploads/` to one instance at the proxy.
- Set `WORKERS=false` on all but the instances that should run background jobs.
- Rate limits count per instance (`lib/rate-limit.ts`), so each bounds its own share: with N
  instances a key may make up to N times the limit in all, which still bounds abuse. What's
  cached in memory is short-lived (a business conversation's mask for a minute) or fixed.

## Running the image anywhere else

```sh
docker network create caime
docker run -d --name db --network caime -e POSTGRES_PASSWORD=change-me postgres:16
docker run -d --name caime --network caime -p 8787:8787 -v caime-data:/data \
  -e DATABASE_URL=postgres://postgres:change-me@db:5432/postgres \
  -e PUBLIC_URL=http://localhost:8787 \
  caime   # built with: docker build -t caime .
```

## Search engines and link cards

The server answers every page with head tags and a plain body for whoever isn't running the app
(R44): the landing page at `/`, public pages at `/@handle` and `/o/handle`, `/robots.txt` and
`/sitemap.xml` (organizations only). Behind Cloudflare, its managed `robots.txt` content signals
are prepended to Caime's. Check after a deploy:

```sh
curl -s https://caime.example.com/ | grep -o '<meta property="og:title"[^>]*>'
curl -s https://caime.example.com/sitemap.xml | head -5
```

## Checks after a deploy

```sh
curl -fsS https://caime.example.com/v1/readyz         # {"ok":true,"version":"<commit>"}
curl -fsS https://caime.example.com/v1/healthz        # the same; "unknown" for a source build
curl -fsSI https://caime.example.com/ | grep -i content-security-policy
```

The `version` is the commit CI tested when the service runs the published image; a build from
source cannot say, so until the switch verify a page the release changed.

Then sign up at the domain, and from a second browser connect and send a message: it should
arrive without a reload.

The container's own health check is `/v1/healthz` (liveness: the process answers, with a ten-minute
start period for a long migration); the uptime check and the proxy read `/v1/readyz`, which answers
503 while the database doesn't answer or the instance doesn't hear the bus, and never restarts a
container by itself.

The dead-letter: a job that failed its last attempt stays as `caime_jobs_dead` on /metrics (alert
when above 0 for an hour) and is listed by `GET /v1/admin/jobs` (kind, attempts, when, its last
error; never its payload) with the operator's token; `POST /v1/admin/jobs/:id/retry` gives it its
attempts back. Retention lets a dead job go after the same days as a done one.

A message's effects (who is told, the push, the suggestions, the webhooks, the mail out) are an
outbox: the `message.effects` sweep replays what an instance that died between the send and them
never finished, within about five minutes. `caime_message_effects_total{outcome="replayed"}`
counts those (a few after a restart is normal); `outcome="dropped"` rising means effects failed
for a day running, and the log line `message effects given up on` names the message.
