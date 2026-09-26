# Deploying Caishy

Caishy ships as **one image**: the API, realtime (WebSocket) and the web app on one origin, so the
session cookie is first-party (ARCHITECTURE.md ADR-7). It needs PostgreSQL 16 and a volume for
uploads. Everything else is optional.

```
ghcr.io/h-khalid-h/caishy:latest     # published by CI on every green push to main
ghcr.io/h-khalid-h/caishy:<sha>      # the same build, pinned
```

## EasyPanel

### 1. Database

In your EasyPanel project, **+ Service → Postgres**. Name it `db`, version 16. Copy its
**internal connection URL** (it looks like `postgres://postgres:…@<project>_db:5432/<project>`).

### 2. The app

**+ Service → App**, name it `caishy`, then:

| Tab | Setting |
| --- | --- |
| Source | **Docker Image** `ghcr.io/h-khalid-h/caishy:latest`. If the package is private, add registry credentials: your GitHub username and a token with `read:packages` (or make the package public under the repository's Packages). |
| Environment | See below. |
| Domains | Your domain → port **8787**, HTTPS on. |
| Mounts | **Volume** named `data` mounted at `/data` (uploads and thumbnails live here). |
| Deploy | Deploy. The health check waits for `/v1/readyz` (database reachable, migrations applied). |

Alternatively, choose **Source → GitHub** (`h-khalid-h/Caishy`, branch `main`) with **Build →
Dockerfile** and EasyPanel builds the image itself. The web export needs about 4 GB of RAM during
the build; the published image avoids that.

### 3. Environment

Required:

```
DATABASE_URL=postgres://…            # the internal URL from step 1
PUBLIC_URL=https://caishy.example.com   # the exact public origin, no trailing slash
```

`PUBLIC_URL` matters: it decides secure cookies, the WebSocket origin allowed by the
Content-Security-Policy, and links in notifications. Everything below is optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `MINIMUM_AGE` | `13` | Minimum age at sign-up; set `16` where local law requires. |
| `SESSION_DAYS` | `90` | How long a signed-in device stays signed in without use. |
| `METRICS_TOKEN` | — | Enables `GET /metrics` behind this bearer token. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | generated | Web Push keys. Generated and stored in the database on first boot; set them only to reuse existing keys. |
| `VAPID_SUBJECT` | `mailto:hello@caishy.com` | Contact for push services. |
| `EXPO_ACCESS_TOKEN` | — | Mobile push through Expo (needs the store builds). |
| `ANTHROPIC_API_KEY` | — | AI assist. Without it Caishy uses its on-device heuristics (R17). |
| `DATABASE_POOL_MAX` | `20` | Connections per instance. |
| `LOG_LEVEL` | `info` | `warn` in quiet production. |
| `TRUST_PROXY` | `true` | EasyPanel's proxy sets `X-Forwarded-*`; keep it on behind it. |

### 4. Continuous deployment

Every push to `main` runs CI (lint, typecheck, 230+ tests on real Postgres, the web budget, the
end-to-end suite), then builds and publishes the image and smoke-tests it. To have EasyPanel
redeploy automatically after that:

1. In the `caishy` service, copy the **Deploy Webhook** URL.
2. In GitHub: repository **Settings → Secrets and variables → Actions → New repository secret**,
   name `EASYPANEL_DEPLOY_WEBHOOK`, value the URL.

The CI job calls it only after the new image passed its smoke test.

## Scaling

Instances are stateless apart from `/data`: realtime fans out across instances through Postgres
`LISTEN/NOTIFY`, jobs are claimed with `FOR UPDATE SKIP LOCKED`, and migrations run under an
advisory lock, so several instances can boot together. With more than one instance, put uploads
on shared storage (the same volume, or S3 when that adapter lands) and set `WORKERS=false` on all
but the instances that should run background jobs.

## Running the image anywhere else

```sh
docker network create caishy
docker run -d --name db --network caishy -e POSTGRES_PASSWORD=change-me postgres:16
docker run -d --name caishy --network caishy -p 8787:8787 -v caishy-data:/data \
  -e DATABASE_URL=postgres://postgres:change-me@db:5432/postgres \
  -e PUBLIC_URL=http://localhost:8787 \
  ghcr.io/h-khalid-h/caishy:latest
```

## Checks after a deploy

```sh
curl -fsS https://caishy.example.com/v1/readyz         # {"ok":true}
curl -fsSI https://caishy.example.com/ | grep -i content-security-policy
```

Then sign up at the domain, and from a second browser connect and send a message: it should
arrive without a reload.
