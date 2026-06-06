# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
COPY patches/ ./patches/
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

RUN npm prune --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

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

USER node

CMD ["node", "dist/index.js"]
