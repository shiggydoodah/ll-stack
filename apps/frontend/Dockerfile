# ---- builder ----
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @repo/frontend build

# ---- runner ----
FROM node:22-bookworm-slim AS runner

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
