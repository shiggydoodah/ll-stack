# PR Writing Charter

## Purpose

A pull request is part of the project's permanent engineering history, not just
a merge mechanism. A good PR serves reviewers (so they review the right areas),
future maintainers (so they can recover the reasoning months later), and the
author (so the work is scoped and verified before it ships).

The aim is not long PRs. The aim is **high-signal** PRs: detail proportional to
risk, scope, and long-term impact. A docs-only PR can be five lines. A backend
architecture PR should not be.

**The structure lives in `.github/PULL_REQUEST_TEMPLATE.md`** — that file is the
source of truth for section order and boilerplate, and GitHub pre-fills it for
you. This charter covers the judgement the template cannot encode: what belongs
in each section, and what makes it worth reading.

---

## Core Principles

### 1. The PR title is the canonical work title

The GitHub PR title is the source of truth for the work being reviewed. Do not
repeat it as an H1 in the body.

```text
[FEAT-034]: Add request ID middleware to backend logs
[BUG]: Fix session cookie expiry
[CHORE]: Add backend verification matrix to PR template
```

Not `[FEAT-034]: Updates`, `[BUG]: Fix stuff`, or `[CHORE]: Misc changes`. The
title has to still make sense in GitHub history, release notes, and project
boards long after the branch is gone.

### 2. Keep the PR high signal

Delete sections that do not apply rather than filling them with `N/A`.

Worth including: why the change exists, what behaviour changed, where to start
reviewing, what is risky, what was verified, what was deliberately left out,
what follow-up is expected.

Not worth including: generic filler, a restated ticket description, vague claims
like "improves things", and sections kept alive with `N/A`.

### 3. Explain the problem, not just the diff

The diff already shows what changed. `Summary` explains why, in enough detail
that a reviewer understands the intent before reading code. Answer: what problem
this solves, what changed in behaviour or design, why this approach, what the
impact is, and what is explicitly out of scope.

```md
## Summary

- Problem / intent:
  - Backend logs have no stable request identifier, so frontend-reported errors
    cannot be correlated with backend request handling.

- What changed in behavior or system design:
  - Added request ID middleware that reads `x-request-id` when supplied,
    generates one when missing, and echoes it in the response header.

- Why this approach:
  - Middleware gives request-level coverage before controllers, filters, and
    services run.

- Notable impact:
  - User / product:
    - No user-facing change.
  - Operational:
    - Improves log correlation and production debugging.

- Out of scope:
  - OpenTelemetry tracing and external log sink delivery.
```

The template's `Executive Summary` sits above this and does a different job:
1–3 paragraphs for someone who wants the shape of the change without the
implementation detail. Keep code-level walkthroughs out of it.

### 4. Guide the reviewer

Reviewers should not have to guess where to start. `Reviewer Guide` names the
key files, the highest-risk areas, and the decisions genuinely worth
challenging — the last one matters most, because it invites the feedback you
actually want.

### 5. Be explicit about scope

The `Scope` checklist tells reviewers what kind of review is required. Check
only what is materially affected — a typo fix in a backend README is docs, not
backend.

If backend scope is checked, the Backend Change-Impact Checklist and Backend
Verification Matrix are required.

### 6. Make risk visible

Every meaningful PR carries risk. The goal is to name it, not to pretend it is
absent. Keep this short for low-risk PRs; expand for anything touching auth,
data, contracts, infra, or production behaviour — API/contract changes, access
control, data shape, concurrency and idempotency, observability, performance,
and rollout/rollback notes.

State the rollback path explicitly. "Safe to roll back by removing the
middleware registration" is worth more at 3am than a paragraph of reassurance.

---

## GitHub Labels

Labels make history filterable — which PRs changed backend behaviour, which were
bug fixes, which were docs-only. Apply them before requesting review.

| Label      | Use for                                                             |
| ---------- | ------------------------------------------------------------------- |
| `bug`      | Fixes broken, incorrect, or unintended behaviour                    |
| `frontend` | Frontend code, UI, client behaviour, styling, routes, or its tests  |
| `backend`  | Backend code, API, services, DB access, auth, logging, or its tests |
| `tooling`  | Developer tooling, scripts, generators, CI helpers, local workflow  |
| `config`   | Configuration, env handling, lint rules, TS config, build config    |
| `docs`     | Documentation, charters, READMEs, guides, templates                 |
| `infra`    | Deployment, hosting, cloud resources, Docker, CI/CD, runtime infra  |
| `refactor` | Restructures existing code without intended behaviour change        |

Multiple labels are expected — a backend bug fix is `bug` + `backend`; a Docker
deployment fix is `bug` + `infra`. Prefer accuracy over minimalism, but do not
label areas that are only incidentally touched.

---

## Backend Change-Impact Standard

Backend changes get extra discipline because they can affect API contracts, data
integrity, access control, observability, and production stability.

When backend scope is checked, complete the Backend Change-Impact Checklist from
the PR template:

```md
- [ ] Tier selected and justified (`Tier 1` only or `Tier 1 + Tier 2`)
- [ ] API contract impact reviewed (DTOs, Swagger, compatibility notes)
- [ ] Auth/authz impact reviewed (guards, roles, resource-level checks)
- [ ] DB impact reviewed (constraints, indexes, query shape, data minimization)
- [ ] Race-condition and idempotency impact reviewed
- [ ] Security impact reviewed (validation, secret handling, sensitive logging)
- [ ] Observability impact reviewed (logs, metrics, correlation/traces)
- [ ] Performance impact reviewed (bounded queries, heavy-query evidence when needed)
```

These are prompts to think, not boxes to tick. An item that turns out not to
apply can still be checked once it has actually been considered, but anything
material belongs in the body:

```md
- Auth/permissions impact reviewed:
  - Uses the existing session guard.
  - Resource-level ownership is enforced in the service before mutation.
```

If the PR changes the API contract, regenerate clients with `pnpm gen:client`
and commit the output in the same PR.

---

## Testing and Verification Standard

A PR is not ready for review until the author can say how it was verified.

Record automated coverage added or updated, important scenarios deliberately
left uncovered (with the reason), and the outcome of each check using one of:

```text
pass
fail -> fixed -> pass
blocked
skipped (docs-only; low risk)
```

Run the verify command matching the scope you touched:

```bash
pnpm verify            # full repo, covers all scopes
pnpm verify:backend    # @repo/backend
pnpm verify:frontend   # @repo/frontend
pnpm verify:ui         # @repo/ui (+ frontend)
```

Docs-only PRs that change nothing outside `**/*.{md,txt}` may replace this with
`skipped (docs-only; low risk)`.

Never claim a command passed unless it was actually run. If something failed and
you fixed it, say `fail -> fixed -> pass` — that is useful history, not an
admission.

### Backend Verification Matrix

When backend scope is checked, fill in the Backend Verification Matrix in the PR
template. Every command in it is bundled into `pnpm verify:backend`, so one
command produces the whole matrix.

The matrix includes a boot smoke check because lint, typecheck, and tests can all
pass while the app fails to start — dependency injection, module wiring, env
config, and provider registration break at runtime, not at compile time.

---

## Focused Regression / Manual Checks

One to three checks that prove the most important behaviour, each with a flow, an
expected outcome, and a result:

```md
- Flow/check:
  - Send a request without `x-request-id`.
- Expected outcome:
  - API generates a request ID and returns it in the response header.
- Result:
  - pass
```

"Clicked around and it seemed fine" is not a check.

---

## Notes for Reviewers and Links

`Notes for Reviewers` is for what does not fit elsewhere: tradeoffs, known rough
edges, deferred scope, follow-up TODOs with ticket references.

`Links` stays lightweight and last — tickets, related PRs, design docs,
dashboards. Remove the section when there is nothing to link.

---

## Example: a small docs PR

Proportionality in practice. Most sections are deleted, not filled with `N/A`:

```md
## Summary

- Problem / intent:
  - The repo had no human-facing standard for writing PRs.
- What changed:
  - Added a PR writing charter covering how PRs should be written and why.
- Notable impact:
  - No product impact. Improves consistency of future PRs.

## Reviewer Guide

- Start review here:
  - `docs/charters/pr-writing.md`
- Highest-risk areas to scrutinize:
  - Whether the guidance is practical and not too heavy for small PRs.

## Scope

- [x] Documentation / non-code

## Risk, Security, and Operational Notes

- Tier / risk:
  - Low. Documentation-only.

## Testing and Verification

- Verification outcome summary:
  - skipped (docs-only; low risk)
```

---

## What Good Looks Like

A good PR makes these easy to answer:

1. What problem does this solve?
2. What changed?
3. Why this approach?
4. What should reviewers focus on?
5. What is the risk?
6. How was it verified?
7. What was intentionally left out?
8. What should future maintainers know?

Write the PR as if someone will need to understand the decision six months from
now without being able to ask you. Getting the code merged is the smaller half of
the job; preserving the reasoning is the rest.
