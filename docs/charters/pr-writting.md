# PR Writing Charter

## Purpose

Pull requests are not just a way to merge code. They are part of the project's permanent engineering history.

A good PR should help three groups of people:

1. **Reviewers** — so they can understand the change quickly and review the right areas.
2. **Future maintainers** — so they can understand why a decision was made months later.
3. **The author** — so the work is clearly scoped, verified, and ready to merge.

The aim is not to make every PR long. The aim is to make every PR **high signal**.

A small docs-only PR can be short. A backend architecture PR should be detailed. The level of detail should match the level of risk, scope, and long-term impact.

---

## Core Principles

### 1. The PR title is the canonical work title

The GitHub PR title is the source of truth for the work being reviewed.

Use the project title format:

```text
[FEAT-001]: PR_TITLE_HERE
[CHORE]: PR_TITLE_HERE
[BUG]: PR_TITLE_HERE
```

Do not repeat the title as an H1 inside the PR body.

Good PR titles are clear, specific, and searchable.

Good examples:

```text
[FEAT-034]: Add request ID middleware to backend logs
[BUG]: Fix session cookie expiry
[CHORE]: Add backend verification matrix to PR template
```

Weak examples:

```text
[FEAT-034]: Updates
[BUG]: Fix stuff
[CHORE]: Misc changes
```

The title should make sense when seen later in GitHub history, release notes, project boards, or linked issues.

---

### 2. Keep the PR high signal

The PR body should contain information that materially helps review or future understanding.

Remove sections that are not relevant instead of filling them with `N/A`.

A good PR does not need to be huge. It needs to be useful.

High-signal information includes:

- why the change exists
- what behavior changed
- which files reviewers should start with
- what areas are risky
- what verification was run
- what was deliberately left out
- what follow-up work is expected

Low-signal information includes:

- generic filler
- repeated ticket descriptions
- vague claims like "improves things"
- unchecked or unexplained assumptions
- sections left in place with `N/A`

The PR should make the review easier, not noisier.

---

### 3. Explain the problem, not just the diff

The diff shows what changed. The PR should explain why it changed.

The `Summary` section should give enough context for someone to understand the intent without reading every line of code first.

Use the summary to answer:

- What problem are we solving?
- What changed in behavior or system design?
- Why was this approach chosen?
- What is the expected impact?
- What is explicitly out of scope?

Example:

```md
## Summary

- Problem / intent:
  - Backend logs currently do not expose a stable request identifier, which makes it difficult to correlate frontend-reported errors with backend request handling.

- What changed in behavior or system design:
  - Added request ID middleware that reads `x-request-id` when provided, generates one when missing, and echoes it back in the response header.

- Why this approach:
  - Middleware gives us request-level coverage before requests reach controllers, filters, or service logic.

- Notable impact:
  - User / product:
    - No direct user-facing behavior change.
  - Operational:
    - Improves log correlation and production debugging.

- Out of scope:
  - Full OpenTelemetry tracing and external log sink delivery are not included in this PR.
```

This gives reviewers context before they inspect implementation details.

---

### 4. Guide the reviewer

Reviewers should not have to guess where to start.

The `Reviewer Guide` section should point them toward the most important files and decisions.

Use it to say:

- where review should begin
- which areas are highest risk
- which decisions are worth challenging

Example:

```md
## Reviewer Guide

- Start review here (key files/paths):
  - `apps/backend/src/logging/request-id.middleware.ts`
  - `apps/backend/src/app.module.ts`
  - `apps/backend/test/logging/request-id.middleware.spec.ts`

- Highest-risk areas to scrutinize:
  - Whether request IDs are consistently attached and returned.
  - Whether existing request headers are preserved safely.

- Decisions worth challenging:
  - Whether request ID generation belongs in middleware or a global interceptor.
```

This makes review faster and improves the quality of feedback.

---

### 5. Be explicit about scope

Every PR should clearly state what areas it touches.

The scope checklist helps reviewers understand what kind of review is required.

```md
## Scope

- [ ] Backend (`apps/backend`)
- [ ] Frontend (`apps/frontend`)
- [ ] E2E/tests (`apps/testing`)
- [ ] Packages (`/packages`)
- [ ] Dev tooling / repo config
- [ ] Documentation / non-code
- [ ] Other (describe):
```

Check only the areas that are materially affected.

If backend scope is checked, the backend checklist and backend verification matrix are required.

## GitHub Labels and Tags

GitHub labels are part of the project's review and traceability system.

Every PR should use appropriate labels so that the work can be understood, filtered, and reviewed at a glance. Labels help reviewers quickly identify the type of change, the area of the codebase affected, and the kind of attention the PR may need.

Labels are also useful later when looking back through GitHub history. They make it easier to answer questions like:

- Which PRs changed backend behavior?
- Which PRs were bug fixes?
- Which PRs were documentation-only?
- Which PRs touched infrastructure or repo tooling?
- Which PRs were refactors rather than product changes?

Labels should be applied based on the material scope of the PR.

### Available Labels

Use the following labels where relevant:

- `bug` — fixes broken, incorrect, or unintended behavior
- `frontend` — changes frontend application code, UI, client-side behavior, styling, routes, or frontend tests
- `backend` — changes backend application code, API behavior, services, controllers, database access, auth, logging, or backend tests
- `tooling` — changes developer tooling, scripts, generators, CI helpers, package management, or local workflow setup
- `config` — changes configuration files, environment handling, linting rules, TypeScript config, framework config, or build config
- `docs` — changes documentation, charters, READMEs, guides, templates, or other non-code project notes
- `infra` — changes deployment, hosting, cloud resources, Docker, CI/CD infrastructure, runtime infrastructure, or operational setup
- `refactor` — restructures existing code without intentionally changing behavior

### Multiple Labels Are Encouraged

A PR may and often should have more than one label.

Examples:

- A backend bug fix should use:
  - `bug`
  - `backend`

- A frontend refactor should use:
  - `frontend`
  - `refactor`

- A CI configuration change should use:
  - `tooling`
  - `config`

- A Docker deployment fix should use:
  - `bug`
  - `infra`

- A documentation update to the PR template should use:
  - `docs`
  - `tooling`

- A backend refactor that also updates TypeScript config should use:
  - `backend`
  - `refactor`
  - `config`

### Labeling Standard

Labels should be added before requesting review.

When choosing labels, prefer accuracy over minimalism. If a PR materially affects multiple areas, apply multiple labels.

Do not add labels for areas that are only incidentally touched. For example, fixing a typo in a backend README should usually be `docs`, not `backend`.

The goal is to make GitHub history easier to scan, filter, and understand.

---

### 6. Make risk visible

Every meaningful PR has some level of risk.

The goal is not to pretend risk does not exist. The goal is to name it clearly.

Use the `Risk, Security, and Operational Notes` section to highlight anything reviewers should think about.

For small, low-risk PRs, this section can be concise.

For backend, auth, data, infra, or production behavior changes, this section should be more detailed.

Include details such as:

- API or contract changes
- auth or access control changes
- database or data-shape impact
- concurrency and idempotency concerns
- logging, metrics, tracing, and observability impact
- performance implications
- rollout, migration, or rollback notes
- post-deploy checks

Example:

```md
## Risk, Security, and Operational Notes

- Tier / risk:
  - Low-to-medium. Request handling is touched globally, but behavior is additive and covered by tests.

- API / contract impact:
  - Response headers now include `x-request-id`.

- Auth / access impact:
  - No auth behavior changed.

- Data / concurrency impact:
  - No database impact.

- Observability / performance:
  - Improves log correlation. Minimal runtime overhead.

- Rollout / migration / rollback:
  - Safe to rollback by removing the middleware registration.

- Post-deploy checks:
  - Confirm backend responses include `x-request-id`.
  - Confirm logs include the same request ID.
```

---

## Backend Change-Impact Standard

Backend changes need extra discipline because they can affect API contracts, data integrity, access control, observability, and production stability.

When the backend scope is checked, include this checklist:

```md
### Backend Change-Impact Checklist

- [ ] Tier selected and justified (`Tier 1` only or `Tier 1 + Tier 2`)
- [ ] API contract impact reviewed (DTOs, Swagger, compatibility notes)
- [ ] Auth/permissions impact reviewed (guards, roles, resource-level checks)
- [ ] DB impact reviewed (constraints, indexes, query shape, data minimization)
- [ ] Race-condition and idempotency impact reviewed
- [ ] Security impact reviewed (validation, secret handling, sensitive logging)
- [ ] Observability impact reviewed (logs, metrics, correlation/traces)
- [ ] Performance impact reviewed (bounded queries, heavy-query evidence when needed)
```

This checklist should not be treated as box-ticking. Each item is a prompt to think carefully about the change.

If an item is not relevant, it can still be checked once reviewed, but the PR should explain anything material.

For example:

```md
- DB impact reviewed:
  - No schema changes.
  - Query shape is unchanged.
```

or:

```md
- Auth/permissions impact reviewed:
  - Uses the existing session guard.
  - Resource-level ownership is enforced in the service before mutation.
```

---

## Testing and Verification Standard

A PR is not ready for review unless the author can explain how it was verified.

The PR should include:

- automated coverage added or updated
- important scenarios not covered yet
- verification outcome summary
- commands that were run
- manual checks where relevant

The verification outcome should use one of these statuses:

```text
pass
fail -> fixed -> pass
blocked
skipped (docs-only; low risk)
```

Example:

```md
## Testing and Verification

- Automated coverage added/updated:
  - Added unit tests for request ID middleware.
  - Added integration coverage for response header propagation.

- Important scenarios intentionally not covered yet (with reason/risk):
  - External trace propagation is not covered because OpenTelemetry integration is out of scope.

- Verification outcome summary:
  - Lint: pass
  - Typecheck: pass
  - Test: fail -> fixed -> pass
  - Additional checks: backend boot smoke pass
```

---

### Verification Commands

Include the commands that were actually run.

Default project-level commands:

```bash
pnpm -r run lint
pnpm -r run typecheck
pnpm -r run test
```

For docs-only PRs that only change files such as `**/*.md` or `**/*.txt`, this block may be omitted or replaced with a short explanation:

```text
skipped (docs-only; low risk)
```

Do not claim commands passed unless they were actually run.

If a command failed and was fixed, say so.

Example:

````md
### Verification Commands Run

```bash
pnpm -r run lint
pnpm -r run typecheck
pnpm -r run test
```
````

Outcome:

- `pnpm -r run lint`: pass
- `pnpm -r run typecheck`: pass
- `pnpm -r run test`: fail -> fixed -> pass

````

---

## Backend Verification Matrix

When backend scope is checked, include the backend verification matrix.

```md
### Backend Verification Matrix

| Command                                                                         | Required | Result      |
| ------------------------------------------------------------------------------- | -------- | ----------- |
| `pnpm --filter @repo/backend run lint`                                            | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend run typecheck`                                       | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend run test`                                            | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend run dev` (startup smoke; stop after successful boot) | Yes      | `pass/fail` |
````

This matrix exists because backend changes need minimum confidence before review and merge.

The startup smoke check is important because lint, typecheck, and tests can pass while runtime boot still fails because of dependency injection, module wiring, environment config, or provider registration issues.

---

## Manual and Focused Regression Checks

Manual checks should be meaningful and limited.

Use one to three focused checks that prove the most important behavior.

Example:

```md
## Focused Regression / Manual Checks

- Flow/check:
  - Send a request without `x-request-id`.

- Expected outcome:
  - API generates a request ID and returns it in the response header.

- Result:
  - pass

- Flow/check:
  - Send a request with an existing `x-request-id`.

- Expected outcome:
  - API preserves and returns the supplied request ID.

- Result:
  - pass
```

Avoid vague checks like:

```text
Clicked around and it seemed fine.
```

Prefer concrete checks with expected outcomes.

---

## Notes for Reviewers

Use the reviewer notes section for information that does not fit cleanly elsewhere but is useful for review.

Good things to include:

- tradeoffs
- limitations
- deferred scope
- known rough edges
- follow-up TODOs
- relevant ticket references

Example:

```md
## Notes for Reviewers

- Known tradeoffs / limitations:
  - Request ID is currently stored on the request object. We may move this into async context when broader tracing work starts.

- Deferred scope:
  - OpenTelemetry trace and span IDs are not added in this PR.

- Follow-up TODOs:
  - APP-038: Add async external log sink with retry/backoff.
```

---

## Links

Keep links lightweight and near the end.

Include links when they materially help review or traceability:

- Jira tickets
- GitHub issues
- Linear tickets
- related PRs
- design docs
- API docs
- logs or dashboards
- product context

Example:

```md
## Links

- Jira: APP-034
- Related PR: #128
- Design notes: request logging proposal
```

Remove the section if there are no relevant links.

---

## Recommended PR Body Structure

Use the project PR template as the default structure:

````md
## Summary

- Problem / intent:
- What changed in behavior or system design:
- Why this approach:
- Notable impact:
  - User / product:
  - Operational:
- Out of scope (if any):

## Reviewer Guide

- Start review here (key files/paths):
- Highest-risk areas to scrutinize:
- Decisions worth challenging:

## Scope

- [ ] Backend (`apps/backend`)
- [ ] Frontend (`apps/frontend`)
- [ ] E2E/tests (`apps/testing`)
- [ ] Packages (`/packages`)
- [ ] Dev tooling / repo config
- [ ] Documentation / non-code
- [ ] Other (describe):

## Risk, Security, and Operational Notes

- Tier / risk:
- API / contract impact:
- Auth / access impact:
- Data / concurrency impact:
- Observability / performance:
- Rollout / migration / rollback:
- Post-deploy checks (if applicable):

### Backend Change-Impact Checklist

- [ ] Tier selected and justified (`Tier 1` only or `Tier 1 + Tier 2`)
- [ ] API contract impact reviewed (DTOs, Swagger, compatibility notes)
- [ ] Auth/permissions impact reviewed (guards, roles, resource-level checks)
- [ ] DB impact reviewed (constraints, indexes, query shape, data minimization)
- [ ] Race-condition and idempotency impact reviewed
- [ ] Security impact reviewed (validation, secret handling, sensitive logging)
- [ ] Observability impact reviewed (logs, metrics, correlation/traces)
- [ ] Performance impact reviewed (bounded queries, heavy-query evidence when needed)

## Testing and Verification

- Automated coverage added/updated:
- Important scenarios intentionally not covered yet (with reason/risk):
- Verification outcome summary (`pass`, `fail -> fixed -> pass`, `blocked`, or `skipped (docs-only; low risk)`):
  - Lint:
  - Typecheck:
  - Test:
  - Additional checks:

### Verification Commands Run

```bash
pnpm -r run lint
pnpm -r run typecheck
pnpm -r run test
```
````

### Backend Verification Matrix

| Command                                                                           | Required | Result      |
| --------------------------------------------------------------------------------- | -------- | ----------- |
| `pnpm --filter @repo/backend run lint`                                            | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend run typecheck`                                       | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend run test`                                            | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend run dev` (startup smoke; stop after successful boot) | Yes      | `pass/fail` |

## Focused Regression / Manual Checks

- Flow/check:
- Expected outcome:
- Result (`pass/fail`):

## Notes for Reviewers

- Known tradeoffs / limitations:
- Deferred scope:
- Follow-up TODOs (include ticket refs):

## Links

- : [Link to ](...)

````

Remove irrelevant sections for small PRs.

Keep required backend sections when backend scope is checked.

---

## Examples

### Example: Small documentation PR

```md
## Summary

- Problem / intent:
  - The repo did not have a clear human-facing standard for writing PRs.

- What changed in behavior or system design:
  - Added a PR writing charter describing how PRs should be written and why.

- Why this approach:
  - A charter gives humans and agents a shared standard for review quality and project history.

- Notable impact:
  - User / product:
    - No product impact.
  - Operational:
    - Improves consistency of future PRs.

## Reviewer Guide

- Start review here:
  - `docs/charters/pr-writting.md`

- Highest-risk areas to scrutinize:
  - Whether the guidance is clear, practical, and not too heavy for small PRs.

## Scope

- [ ] Documentation / non-code

## Risk, Security, and Operational Notes

- Tier / risk:
  - Low. Documentation-only change.

## Testing and Verification

- Verification outcome summary:
  - skipped (docs-only; low risk)
````

---

### Example: Backend feature PR

````md
## Summary

- Problem / intent:
  - Backend logs currently lack stable request correlation, which makes production debugging harder.

- What changed in behavior or system design:
  - Added request ID middleware.
  - Request IDs are read from `x-request-id` when supplied, generated when missing, and echoed back in the response header.

- Why this approach:
  - Middleware ensures request IDs are available early in the request lifecycle before controllers, filters, and services run.

- Notable impact:
  - User / product:
    - No direct user-facing change.
  - Operational:
    - Improves ability to correlate request logs and frontend-reported failures.

- Out of scope:
  - OpenTelemetry trace propagation.
  - External log sink delivery.

## Reviewer Guide

- Start review here:
  - `apps/backend/src/logging/request-id.middleware.ts`
  - `apps/backend/src/app.module.ts`

- Highest-risk areas to scrutinize:
  - Global middleware registration.
  - Header preservation and generation behavior.

- Decisions worth challenging:
  - Whether middleware is the right place for request ID handling long term.

## Scope

- [x] Backend (`apps/backend`)
- [x] E2E/tests (`apps/testing`)

## Risk, Security, and Operational Notes

- Tier / risk:
  - Tier 1. Global request middleware, but additive and low complexity.

- API / contract impact:
  - Adds `x-request-id` response header.

- Auth / access impact:
  - No auth behavior changed.

- Data / concurrency impact:
  - No database impact.

- Observability / performance:
  - Improves log correlation.
  - Minimal per-request overhead.

- Rollout / migration / rollback:
  - Safe to rollback by removing middleware registration.

- Post-deploy checks:
  - Confirm responses include `x-request-id`.
  - Confirm backend logs include matching request IDs.

### Backend Change-Impact Checklist

- [x] Tier selected and justified (`Tier 1`)
- [x] API contract impact reviewed
- [x] Auth/permissions impact reviewed
- [x] DB impact reviewed
- [x] Race-condition and idempotency impact reviewed
- [x] Security impact reviewed
- [x] Observability impact reviewed
- [x] Performance impact reviewed

## Testing and Verification

- Automated coverage added/updated:
  - Added middleware unit tests.
  - Added request header propagation test.

- Important scenarios intentionally not covered yet:
  - Trace/span propagation is not covered because OpenTelemetry is out of scope.

- Verification outcome summary:
  - Lint: pass
  - Typecheck: pass
  - Test: pass
  - Additional checks: backend startup smoke pass

### Verification Commands Run

```bash
pnpm --filter @repo/backend run lint
pnpm --filter @repo/backend run typecheck
pnpm --filter @repo/backend run test
pnpm --filter @repo/backend run dev
```
````

### Backend Verification Matrix

| Command                                                                           | Required | Result |
| --------------------------------------------------------------------------------- | -------- | ------ |
| `pnpm --filter @repo/backend run lint`                                            | Yes      | pass   |
| `pnpm --filter @repo/backend run typecheck`                                       | Yes      | pass   |
| `pnpm --filter @repo/backend run test`                                            | Yes      | pass   |
| `pnpm --filter @repo/backend run dev` (startup smoke; stop after successful boot) | Yes      | pass   |

## Focused Regression / Manual Checks

- Flow/check:
  - Send request without `x-request-id`.
- Expected outcome:
  - Backend generates and returns a request ID.
- Result:
  - pass

- Flow/check:
  - Send request with existing `x-request-id`.
- Expected outcome:
  - Backend preserves and returns supplied request ID.
- Result:
  - pass

## Notes for Reviewers

- Deferred scope:
  - OpenTelemetry correlation will be handled in a follow-up PR.

## Links

- Jira: APP-034

```

---

## What Good Looks Like

A good PR should make these questions easy to answer:

1. What problem does this solve?
2. What changed?
3. Why was this approach chosen?
4. What should reviewers focus on?
5. What is the risk?
6. How was this verified?
7. What was intentionally left out?
8. What should future maintainers know?

If the PR answers those questions clearly, it is doing its job.

---

## Final Standard

Write PRs as if someone will need to understand the decision six months from now without asking you.

The PR should not only help the code get merged. It should preserve the reasoning behind the change.
```
