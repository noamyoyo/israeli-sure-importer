# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS builder

WORKDIR /build

# npm ci (not install): the lockfile — incl. israeli-bank-scrapers' integrity hash — is authoritative.
COPY package.json package-lock.json ./
COPY patches/ ./patches/
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

RUN npm prune --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_ENV=production \
    TZ=Asia/Jerusalem

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder --chown=node:node /build/dist/ ./dist/
COPY --from=builder --chown=node:node /build/node_modules/ ./node_modules/

RUN mkdir -p /app/logs /app/browser-data && chown node:node /app/logs /app/browser-data

# Recorded in every raw-archive manifest so a drifting build is visible (spec §2, pin item 4).
# Placed after the apt layer on purpose: a new git sha must not invalidate the Chromium layer,
# or every code rebuild would silently pull a newer Chromium.
ARG IMPORTER_GIT_SHA=unknown
ENV IMPORTER_GIT_SHA=$IMPORTER_GIT_SHA

USER node

CMD ["node", "dist/index.js"]
