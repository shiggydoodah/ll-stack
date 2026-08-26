---
applyTo: '**/*'
---

# PR Review Core Rules

Treat these as shared, required checks for PR reviews across backend, frontend, E2E, package, and automation changes.
Domain-specific checks are defined in companion instruction files.

Before exploring source files, read `CONTEXT-MAP.md` at the repo root and then load the relevant nearest `CONTEXT.md` files for the changed paths.
Use `AGENTS.md`, `CONTEXT.md`, app-level context files, and the relevant charters as the source of truth when review instructions are incomplete.
If required context files such as `CONTEXT-MAP.md`, `CONTEXT.md`, or relevant nested `CONTEXT.md` files are missing, stale, or incomplete, continue the review using the best available information and flag the missing context as a `Minor` finding when it materially limits review confidence.

## Review scope exclusions

- Ignore changed files under `apps/frontend/app/dev/**`. This route tree is local-only experimental and dev-test surface; do not review, summarize, or comment on files that live there.
- Ignore changed files under `docs/**`. These are human- and agent-facing reference documentation, not runnable app code; do not review, summarize, or raise findings on them. (The rules _inside_ `docs/agents/*.agents.md` still govern how you review code in other paths.)
- Do not review the contents of generated code (e.g. `packages/services` client output produced by `pnpm gen:client`). It is machine-generated from the backend OpenAPI contract, so a line-by-line review of its implementation is not meaningful; checking its shape or naming conventions (file/domain layout, exports, tag naming) is still fine and covered by `.github/instructions/pr-review.services.instructions.md`.
- If a PR touches excluded paths plus other paths, review the other paths normally. Do not mention `apps/frontend/app/dev/**`.

## Review output requirements

- Provide findings first, ordered by severity: `Critical`, `Major`, `Minor`, `Nit`.
- Use these severity definitions:
  - `Critical`: exploitable security issue, auth bypass, data corruption/loss risk, or outage-level reliability risk; block merge until fixed.
  - `Major`: high-impact correctness/performance/reliability issue likely to cause production problems; should be fixed before merge.
  - `Minor`: meaningful but lower-impact issue (maintainability, moderate perf, incomplete edge handling); fix in this PR when practical.
  - `Nit`: low-impact style/readability/consistency feedback with no material behavior or risk impact.
- Include file references and clear evidence for each finding.
- For each finding, include risk, impact, and a concrete remediation suggestion.
- If no material issues are found, explicitly state that and list residual risks/testing gaps.
- De-duplicate overlapping findings and keep one primary finding per root cause.

## Severity handling expectations

- `Critical`: must be fixed before merge.
- `Major`: should be fixed before merge unless explicitly deferred with owner + rationale.
- `Minor`: fix in this PR when practical, otherwise track a follow-up item.
- `Nit`: optional improvement and does not block merge.

## Baseline checks for all PRs

- Correctness and behavioral regression risk.
- Security impact and access-control boundary changes.
- Public contract changes, including DTOs, Swagger/OpenAPI metadata, generated clients, package exports, and docs.
- Performance impact on hot paths.
- Reliability and failure-mode handling (timeouts, retries, idempotency, fallback behavior).
- Test coverage quality and meaningfulness for changed behavior.
- Validation evidence for changed code, config, generated output, schema, CI, and scripts.
- Type safety, especially avoiding broad casts, weakened validation, or introduction of `any`.

## Repo-specific review gates

- Do not approve manual edits to generated files in `packages/services/src` or generated route trees. Require source-contract or generator changes instead.
- Do not approve direct browser-to-backend calls from frontend code. Backend-bound frontend work must go through server functions and generated `@repo/services` clients.
- Do not approve backend endpoints that bypass API-secret protection unless the endpoint is intentionally public and documented in code.
- Do not approve schema/API contract changes without the matching Prisma migration, DTO/Swagger updates, generated client regeneration, and relevant docs/tests.
- Treat missing validation as a material gap for non-documentation changes. The default full validation command is `pnpm verify`; targeted checks are acceptable when scoped and justified.

## Path-to-instruction map

Apply this core file to every PR. Apply every companion file that matches a changed path; overlapping rows are cumulative.

| Changed path               | Apply companion instruction files                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/**`          | `.github/instructions/pr-review.backend.instructions.md`                                                                |
| `apps/frontend/app/dev/**` | None; ignore for PR review.                                                                                             |
| `apps/frontend/**`         | `.github/instructions/pr-review.frontend.instructions.md`                                                               |
| `apps/testing/**`          | `.github/instructions/pr-review.e2e.instructions.md`                                                                    |
| `docs/**`                  | None; reference documentation, ignore for PR review.                                                                    |
| `packages/**`              | `.github/instructions/pr-review.packages.instructions.md`                                                               |
| `packages/services/**`     | `.github/instructions/pr-review.packages.instructions.md` and `.github/instructions/pr-review.services.instructions.md` |
| `packages/ui/**`           | `.github/instructions/pr-review.packages.instructions.md` and `.github/instructions/pr-review.ui.instructions.md`       |
| `.github/**`               | `.github/instructions/pr-review.github-actions.instructions.md`                                                         |

For root workspace or tooling files such as `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `eslint.config.mjs`, and `prettier.config.js`, apply the core rules plus any app or package instruction files for domains affected by the change. If the change alters CI, path filters, review automation, or GitHub configuration, also apply `.github/instructions/pr-review.github-actions.instructions.md`.

When a change crosses domains, apply all relevant files. For example, a backend DTO change that regenerates `packages/services` should use backend, packages, and services review rules.
