---
name: feature-review
description: Review a documented feature under docs/features/<name> against its PLAN.md and step docs — verify the code matches the plan, decide whether it is incomplete (missing whole steps → stop and report) or mostly done (full review), produce a feedback report, recommend whether to archive, and write follow-ups to the feature's own docs/features/<name>/follow-ups.md. Use when the user invokes /feature-review, asks to review a feature's completeness, check whether a feature is done or ready to archive, or audit a docs/features epic against its plan.
---

# Feature Review

Reviews one feature epic under `docs/features/<feature-name>/`: does the
implementation match its plan, is anything missing, are there new issues, and is
it ready to archive.

## Paths (use these exact ones)

- Features live under `docs/features/` (plural).
- Archive dir is `docs/features/.archive/` (not `.archived`).
- Follow-ups go to the feature's own `docs/features/<feature-name>/follow-ups.md`
  (co-located, not a central bucket).

## Input

A feature name = a directory under `docs/features/`. If none was given, list the
directories under `docs/features/` (excluding `.archive/`, `.backlog/`, `.tasks/`,
`.tech-debt/`, `.bugs/`, `.plans/`) and ask which one to review.

## Workflow

### 1. Load the feature

- Read `docs/agents/feature-docs.agents.md` — the rules a complete feature must
  satisfy.
- Read the feature's `PLAN.md` and any track plans (`backend/PLAN.md`,
  `frontend/PLAN.md`, …), plus `PRD.md` / `TECH_SPEC.md` if present, and every
  `NN-*.md` step doc (and `NN-name/implementation.md` step folders).
- From the plan's implementation-steps table + acceptance criteria, build an
  inventory of intended deliverables and the **real file paths** each step names.

### 2. Completeness gate (triage — BEFORE any deep review)

- For each planned step/deliverable, check the codebase for evidence it exists
  (the named files / modules / endpoints / migrations). Use `CONTEXT-MAP.md` to
  navigate when paths are vague.
- Classify the feature:
  - **Incomplete** — one or more whole steps/deliverables are absent or clearly
    unstarted.
  - **Mostly done** — every planned step is implemented (quality/loose-ends
    aside).
- **If Incomplete: STOP — do not run the full review.** Report which planned
  steps/features are missing or unstarted (name each one), tell the user the
  feature isn't ready for a completeness review yet, and end here.

### 3. Full review (only when Mostly done)

- Read the binding runbooks for the code paths touched, as applicable:
  `docs/agents/backend.agents.md`, `docs/agents/frontend.agents.md`,
  `docs/agents/database-standards.agents.md`.
- For each step: verify the code actually delivers what the step/plan describes
  and that each acceptance criterion is met.
- Hunt for **new issues**: bugs, regressions, missing error handling, gaps vs the
  plan, runbook/convention violations, untested paths, gating/auth/security gaps.
- If the plan lists verification commands (`pnpm verify`, etc.), **offer** to run
  them for build-level confirmation (they can be slow) — don't run unprompted.

### 4. Feedback report (inline to the user)

- **Verdict** — Mostly done / Complete & clean.
- **Per-step findings** — each planned step: ✅ done / ⚠️ issues / ❌ gap, with
  specifics and `file:line` references.
- **Issues** — grouped by severity (blocker / should-fix / nice-to-have), each
  with where and why.
- **Missing vs plan** — anything the plan promised that isn't there.

### 5. Decisions & artifacts

- **Archive recommendation.** If the feature is genuinely done with no blockers,
  recommend archiving and restate the procedure from `feature-docs.agents.md`:
  the user copies the directory OUT of the repo first (user-owned step), then it
  moves into `docs/features/.archive/`. **Do not move, archive, or delete
  anything yourself — recommend only.** Blockers ⇒ NOT ready to archive; say so.
- **Follow-ups.** If non-blocking loose ends remain, write them to the feature's
  own `docs/features/<feature-name>/follow-ups.md` as a checklist using the
  template below. If that file already exists, merge new items in — don't
  overwrite. Capture any blockers here too. **Exception:** if you're recommending
  the feature be archived, a `follow-ups.md` would be lost once archived
  (`.archive/` isn't auto-read) — triage each loose end by nature into
  `docs/features/.tech-debt/`, `.bugs/`, or `.tasks/` instead.

## Follow-up file template

```md
# Follow-ups: <feature-name>

Remaining work for the `<feature-name>` feature after its completeness review on <YYYY-MM-DD>.
Source: docs/features/<feature-name>/PLAN.md
Resolve or triage into `.tech-debt/` / `.bugs/` / `.tasks/` before this feature is archived.

## Backend

- [ ] <task> — <why / where (file:line)>

## Frontend

- [ ] <task> — <why / where (file:line)>
```

## Boundaries

- Review and report; the **only** files you write are the feature's
  `follow-ups.md` (or, when recommending archive, the triaged `.tech-debt/` /
  `.bugs/` / `.tasks/` items). Never move/archive/delete feature directories, and
  never edit the feature's `PLAN.md` / step docs or source code as part of the
  review.
- This is documentation/review work — no `pnpm verify` required for the review
  itself.
