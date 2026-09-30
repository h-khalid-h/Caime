# syntax=docker/dockerfile:1.7
# Caime in one image: the API, realtime and the web app on one origin (docs/DEPLOY.md).

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Dependencies first, so source changes don't reinstall them.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/app/package.json apps/app/
COPY packages/core/package.json packages/core/
COPY packages/brand/package.json packages/brand/
# Security overrides in pnpm-workspace.yaml point into vendor/ (docs/SECURITY.md).
COPY vendor vendor
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# The web app is exported without an API URL: it talks to the server that serves it.
RUN pnpm --filter @caime/app build:web \
 && node scripts/precompress.mjs apps/app/dist \
 && pnpm --filter @caime/server build \
 && pnpm --filter @caime/server deploy --prod --legacy /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# pg_dump and pg_restore for the database backups (docs/DEPLOY.md, "Backups"), at the database's
# major version (16), from PostgreSQL's own apt repository: Debian's client is 15.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg postgresql-common \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    WEB_DIR=/app/web
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/server/dist ./dist
COPY --from=build --chown=node:node /repo/apps/app/dist ./web
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/v1/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
