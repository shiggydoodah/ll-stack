---
applyTo: 'apps/testing/**/*.{ts,tsx}'
---

# PR Review E2E Rules (Playwright)

Use these checks for E2E changes in `apps/testing`.

## Source of truth

- Read `apps/testing/CONTEXT.md` before reviewing E2E test changes.
- Review E2E changes against `AGENTS.md`, `CONTEXT.md`, `apps/testing/CONTEXT.md`, and `docs/charters/testing.md`. If one of these files is not populated, skip that file entirely and continue with the remaining sources.
- Remember this workspace does not start the frontend or backend itself. Tests run against `FRONTEND_BASE_URL`.

## Reliability and determinism

- Reject brittle waits (`waitForTimeout`) when a stable web-first assertion can be used.
- Prefer robust locators (`getByRole`, `getByLabel`, test ids) over fragile CSS/text selectors when stability is at risk.
- Ensure tests do not depend on execution order or leaked shared state.
- Verify retries/timeouts are configured intentionally and not masking flaky behavior.
- Preserve page-error and console-error failure checks unless a specific noisy third-party case is narrowly justified.
- Ensure tests remain deterministic across local and CI runs, including seeded or isolated test data where relevant.

## Coverage quality

- Ensure critical user flows and high-risk regressions are covered by meaningful scenarios.
- Check both success and failure paths where behavior changed.
- Validate auth-sensitive and permission-sensitive user journeys when relevant.
- For frontend route or server-function changes, check whether E2E coverage should exercise the real browser-visible flow rather than only lower-level tests.

## Performance and maintainability

- Flag redundant setup/teardown patterns that slow suites without adding isolation value.
- Prefer reusable fixtures/helpers over copy-pasted test logic.
- Ensure assertions are specific enough to catch regressions, not overly broad.
- Avoid excessive network-idle waits when UI assertions can prove readiness more directly.

## Security and data hygiene

- Ensure secrets/tokens are never hardcoded in tests.
- Verify test data setup avoids exposing sensitive production-like data.
- Confirm network mocking (if used) does not hide critical integration behavior unintentionally.
- Ensure captured traces, logs, screenshots, and error output do not intentionally expose secrets or sensitive session data.

## E2E testing expectations

- Require updates to E2E tests when user-facing behavior changes materially.
- Call out missing regression coverage as a review finding.

## E2E validation expectations

- Prefer `pnpm --filter @repo/testing test:e2e` when the app target is available.
- If E2E cannot be run because frontend/backend services are unavailable, require reviewers to call that out and rely on the highest-confidence targeted checks that were run.
