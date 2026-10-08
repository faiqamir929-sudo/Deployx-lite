# syntax=docker/dockerfile:1.7

# ── Build stage ──────────────────────────────────────────────────────────────
# Keep the toolchain out of the runtime images. Node 24 matches the supported
# local/Replit runtime and the current Vite toolchain.
FROM node:24 AS workspace

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy every workspace manifest before installing so frozen-lockfile installs
# work even when Docker's layer cache is reused.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json       artifacts/api-server/
COPY artifacts/deployx-lite/package.json     artifacts/deployx-lite/
COPY artifacts/mockup-sandbox/package.json   artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json       lib/api-client-react/
COPY lib/api-spec/package.json               lib/api-spec/
COPY lib/api-zod/package.json                lib/api-zod/
COPY lib/db/package.json                     lib/db/
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/

RUN pnpm install --frozen-lockfile

COPY . .

FROM workspace AS builder

# The publishable Clerk key is intentionally the only frontend build argument.
# It is public by design; never pass a Clerk secret or AI key as a build arg.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PROXY_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_CLERK_PROXY_URL=${VITE_CLERK_PROXY_URL}

RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY" \
  || (echo "VITE_CLERK_PUBLISHABLE_KEY is required to build the frontend" >&2 && exit 1)
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/deployx-lite run build

# ── Frontend runtime stage ───────────────────────────────────────────────────
# nginxinc/nginx-unprivileged listens on 8080 and runs as a non-root user.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/artifacts/deployx-lite/dist/public /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

# ── Database migration stage ─────────────────────────────────────────────────
# This target contains the workspace tooling but does not build or serve the
# application. Compose runs the existing non-destructive Drizzle push once,
# then lets the API depend on its successful completion.
FROM workspace AS migrate

USER node

CMD ["node", "./lib/db/node_modules/drizzle-kit/bin.cjs", "push", "--config", "./lib/db/drizzle.config.ts"]

# ── API runtime stage (default target) ───────────────────────────────────────
FROM node:24-slim AS api

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# The API bundle is self-contained. Preserve the workspace depth so the
# existing Swagger setup resolves lib/api-spec/openapi.yaml without shipping
# source or secrets.
COPY --from=builder --chown=node:node /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder --chown=node:node /app/lib/api-spec/openapi.yaml ./lib/api-spec/openapi.yaml
COPY --from=builder --chown=node:node /app/docker/start-api.sh ./docker/start-api.sh
RUN chmod 0555 ./docker/start-api.sh

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/healthz').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["./docker/start-api.sh"]

# ── Background worker runtime stage ───────────────────────────────────────────
# The queue package owns the worker entry point. Keeping it in a separate
# runtime image means API replicas never need to execute background jobs.
FROM node:24-slim AS worker

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder --chown=node:node /app/docker/start-worker.sh ./docker/start-worker.sh
RUN chmod 0555 ./docker/start-worker.sh

USER node

CMD ["./docker/start-worker.sh"]
