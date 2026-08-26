<!--
PR title format: [FEAT-001]: PR_TITLE_HERE or [CHORE]: PR_TITLE_HERE.

Use the GitHub PR title as the canonical work title.
Do not repeat the title as an H1 in this PR body.

Keep this PR high signal:
- Remove sections that are not materially relevant instead of filling with N/A.
- Keep claims concrete and testable.
- If Backend scope is checked, include the backend checklist and backend verification matrix.
- Add Links Jira/Issues/Related PRs/Linear/etc at the end when applicable.
-->

## Executive Summary

<!--
Explain the work in 1-3 short paragraphs for readers who do not need every implementation detail.
Cover what changed, why it matters, and the practical product/system impact.
This can be lightly technical, but avoid code-level walkthroughs, exhaustive file lists, or implementation minutiae.
-->

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

<!-- Keep concise for low-risk PRs. Expand only when relevant. -->

- Tier / risk:
- API / contract impact:
- Auth / access impact:
- Data / concurrency impact:
- Observability / performance:
- Rollout / migration / rollback:
- Post-deploy checks (if applicable):

### Backend Change-Impact Checklist (Required when Backend scope is checked)

<!-- Remove this subsection if Backend scope is not checked. -->

- [ ] Tier selected and justified (`Tier 1` only or `Tier 1 + Tier 2`)
- [ ] API contract impact reviewed (DTOs, Swagger, compatibility notes)
- [ ] Auth/authz impact reviewed (guards, roles, resource-level checks)
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

<!--
Run the verify command(s) matching the changed scope. `pnpm verify` runs everything
(prisma:lint -> lint -> build -> typecheck -> test); the scoped variants are faster
when a PR only touches one app.

For docs-only PRs that change only files matching `**/*.{md,txt}`, this command block may be omitted
or replaced with: `skipped (docs-only; reason)` plus a low-risk rationale.
-->

```bash
# Full repo (covers all scopes)
pnpm verify

# Or run only the scopes you touched:
pnpm verify:backend         # @repo/backend
pnpm verify:frontend        # @repo/frontend
pnpm verify:ui              # @repo/ui (+ frontend)
```

### Backend Verification Matrix (Required when Backend scope is checked)

<!-- Remove this subsection if Backend scope is not checked. -->

| Command                                   | Required | Result      |
| ----------------------------------------- | -------- | ----------- |
| `pnpm --filter @repo/backend prisma:lint` | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend lint`        | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend build`       | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend typecheck`   | Yes      | `pass/fail` |
| `pnpm --filter @repo/backend test`        | Yes      | `pass/fail` |

<!-- All five are bundled in `pnpm verify:backend`. -->
<!-- If you changed the API contract, regenerate clients with `pnpm gen:client` and commit the output in this PR. -->

## Focused Regression / Manual Checks

<!-- Use one to three meaningful checks. Remove unused placeholders. -->

- Flow/check:
- Expected outcome:
- Result (`pass/fail`):

- Flow/check:
- Expected outcome:
- Result (`pass/fail`):

## Notes for Reviewers

- Known tradeoffs / limitations:
- Deferred scope:
- Follow-up TODOs (include ticket refs):

## Links

<!-- Keep this section lightweight and near the end. Remove if no relevant links. -->

- : [Link to ](...)
