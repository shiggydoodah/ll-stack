# ---- builder ----
FROM node:24-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

# Prisma probes the libssl/openssl version to choose which schema engine to
# download, and `node:*-bookworm-slim` ships neither the openssl CLI nor libssl
# (node links its own copy statically). Without this it warns, falls back to
# `openssl-1.1.x`, and fetches an engine this image cannot load. The runner
# stage installs it too — that is where the engine actually runs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Manifests first, so the backend's dependency install lands in a layer that
# survives source-only changes. This is a cache optimisation, not a correctness
# requirement: the first pnpm command after `COPY . .` re-verifies the workspace
# and installs whatever the manifests it can see by then still need. A project
# missing here just moves its share of that work out of the cached layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/utils/package.json packages/utils/package.json

# `--ignore-scripts` because the root `postinstall` is `prisma generate`, and the
# schema it needs is deliberately not in this layer. pnpm defers skipped scripts
# rather than dropping them — the next pnpm command runs them, by which point
# `COPY . .` has put the schema (and everything else) in place.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @repo/backend prisma:generate
# Build the backend together with its workspace dependencies (`...` selects deps
# in topological order). The backend is CommonJS and resolves @repo/* via their
# `require` export condition, so their CJS build must exist before `node dist/main.js`.
RUN pnpm --filter "@repo/backend..." build

RUN pnpm --filter @repo/backend deploy --legacy /deploy
# `pnpm deploy --legacy` links workspace packages as symlinks back into the
# monorepo checkout (../../../workspace/packages/*), which the runner stage
# does not carry — the server then dies at boot with MODULE_NOT_FOUND on
# @repo/logging. Dereference them (and their dep links, -L) into real
# directories so /deploy is self-contained.
RUN set -eu; for link in /deploy/node_modules/@repo/*; do \
      target="$(readlink -f "$link")"; \
      rm "$link"; \
      cp -rL "$target" "$link"; \
    done
# Copy the generated Prisma client (written to the pnpm virtual store during generate)
# into the deploy directory so the runner doesn't need to re-run prisma generate.
RUN mkdir -p /deploy/node_modules/.prisma && \
    cp -r /workspace/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client \
          /deploy/node_modules/.prisma/client

# ---- runner ----
FROM node:24-bookworm-slim AS runner

WORKDIR /app

# Default the image to the guarded posture, matching apps/frontend/Dockerfile.
# `NODE_ENV: nodeEnvSchema.default('development')` in src/config/env.schema.ts means
# an image with no NODE_ENV boots into the mode where the committed dev credentials
# are accepted and FRONTEND_PUBLIC_URL is optional — the opposite of
# what a deployed container should default to. docker-compose.yml still overrides
# this back to development for local runs.
ENV NODE_ENV=production

# Pin the process timezone so nothing date-shaped ever resolves against a
# host-local zone. The API contract already refuses offset-less date-times at
# the boundary; this hardens the deployment side of the same fault.
ENV TZ=UTC

# `entrypoint.sh` runs `prisma migrate deploy`, and the schema engine binary is
# dynamically linked against libssl — which this base image does not carry.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root system user, matching apps/frontend/Dockerfile. Without
# this the API — the process that parses untrusted request bodies and shells
# out to `prisma migrate deploy` at boot — runs as uid 0, so any code execution
# inside the container starts as root, and a container escape starts from root
# on the host. `nodejs`/`nestjs` at 1001 mirrors the frontend image's
# `nodejs`/`nextjs` rather than reusing the base image's `node` user (uid 1000),
# so the two images agree on the uid an operator sees in `ps` and on volume
# ownership.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nestjs

COPY --from=builder /deploy ./
COPY --from=builder /workspace/apps/backend/dist ./dist
COPY --from=builder /workspace/apps/backend/prisma ./prisma
COPY apps/backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# After every COPY: the layers above land root-owned, and the entrypoint's
# migrate step needs to read the schema and execute the Prisma engine binaries
# it unpacked into node_modules.
RUN chown -R nestjs:nodejs /app

EXPOSE 3100

USER nestjs

ENTRYPOINT ["./entrypoint.sh"]
