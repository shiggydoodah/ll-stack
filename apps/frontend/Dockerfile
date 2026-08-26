# ---- builder ----
FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

# COPY . . reveals the full workspace (backend, testing, the remaining
# packages), so reconcile node_modules with it explicitly before any
# `pnpm run` — the deps check that guards run commands refuses a node_modules
# installed for the manifest-subset workspace above.
RUN pnpm install --frozen-lockfile

# Placeholder values scoped to this one RUN: packages/services core/client-env
# fails fast when its env is absent at import time during `next build`. Nothing
# is baked into the output — the standalone server re-reads process.env at
# runtime, and the runner stage below starts from a fresh base image.
RUN BACKEND_INTERNAL_URL=http://backend:3100 \
    BACKEND_API_SECRET=docker-build-placeholder \
    pnpm --filter @repo/frontend build

# ---- runner ----
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4100
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone output (outputFileTracingRoot = repo root)
COPY --from=builder /workspace/apps/frontend/.next/standalone ./
COPY --from=builder /workspace/apps/frontend/.next/static ./apps/frontend/.next/static

RUN chown -R nextjs:nodejs /app

EXPOSE 4100

USER nextjs
CMD ["node", "apps/frontend/server.js"]
