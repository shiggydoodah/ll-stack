# Context: docs

## Purpose

- The repo's knowledge layer: durable engineering standards (`charters/`), the
  agent-facing enforcement runbooks for those standards (`agents/`), and — once
  work begins — per-feature epics under `features/`.
- Documentation only. Nothing here runs, and changes here need no `pnpm verify`.

## Architecture

```
docs/
  charters/   human-facing standards + rationale (backend, frontend, database,
              dependency-management, commit-writting, pr-writting, general,
              testing)
  agents/     the enforceable runbook per charter — read these before coding
  templates/  reusable prompt templates (referenced by AGENTS.md; may not exist yet)
  features/   per-feature epics: PLAN.md (+ PRD/TECH_SPEC), numbered steps,
              follow-ups.md, and the .tasks/.tech-debt/.bugs/.backlog/.archive
              trays (created as you build)
```

Charters explain _why_; `agents/*.agents.md` state _what an agent must do_.
Where they disagree, the runbook is authoritative for agent behaviour.

## Key Flows

- Backend change → read `agents/backend.agents.md`.
- Schema/migration change → `agents/database-standards.agents.md`.
- Frontend change → `agents/frontend.agents.md`.
- Dependency update → `agents/dependency-management.agents.md` (only when asked
  to update dependencies).
- Writing or restructuring a feature epic → `agents/feature-docs.agents.md`.

## Integrations

- `AGENTS.md` and `CLAUDE.md` at the repo root point here and define when each
  runbook must be read.
- `.github/instructions/*` carry the same rules into PR review.

## Gotchas

- `charters/general.md` and `charters/testing.md` are currently stubs (`# TBD`)
  — do not treat them as authoritative.
- `docs/features/` does not exist yet; it is created with the first epic.
- `docs/features/.backlog/` is a **do-not-auto-read** path (see `AGENTS.md`).
- Review agents are told to ignore changed files under `docs/**` — the rules
  _inside_ `agents/*.agents.md` still govern how code elsewhere is reviewed.

## Agent Notes

- Read the specific runbook you need, not the whole tree — these files are long.
- Every feature directory MUST have a `PLAN.md` with a non-technical Executive
  Summary first, written to be consumed cold in a fresh agent window.
- Unplanned loose ends go in a co-located `follow-ups.md` _after_ implementation
  starts, never at planning time.
