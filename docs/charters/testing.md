# Testing Charter

**Placeholder — not yet written.** This file exists so the charter set has a home
for the reasoning behind the testing strategy. It is not policy, and nothing should
cite it as such.

Until it is written, the testing conventions are visible in the suites themselves
and in the tooling:

- `apps/backend/test/` — Jest integration tests against per-worker real databases,
  plus the route-inventory pin that fails when an endpoint appears unnoticed.
- `apps/frontend` and `packages/*` — Vitest, co-located with the code under test.
- `apps/testing/` — the Playwright end-to-end workspace and its `CONTEXT.md`.
- `pnpm verify` — the ladder that decides whether the repo passes.
