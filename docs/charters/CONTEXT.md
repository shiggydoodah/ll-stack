# Context: docs/charters

## Purpose

- The durable, human-facing engineering standards and the reasoning behind them.
  The agent-facing enforcement versions live in `docs/agents/`.

## Architecture

| File                       | Covers                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `backend.md`               | Conventions for planning/building features in `apps/backend`        |
| `frontend.md`              | Conventions for building features in `apps/frontend`                |
| `database-standards.md`    | Every Prisma model, migration, and database access path             |
| `dependency-management.md` | How humans update npm dependencies in this pnpm + catalog workspace |
| `commit-writting.md`       | Commit message conventions                                          |
| `pr-writting.md`           | Pull request conventions                                            |
| `general.md`               | Stub (`# TBD`)                                                      |
| `testing.md`               | Stub (`# TBD`)                                                      |

## Key Flows

- Charter states the intent and rationale → `docs/agents/<same>.agents.md`
  turns it into a checklist an agent must follow → lint/test/CI enforce the
  mechanically checkable parts (`.prismalintrc.yml`, `eslint.config.mjs`,
  `pnpm verify`).

## Gotchas

- `general.md` and `testing.md` are placeholders; do not cite them as policy.
- The filenames `commit-writting.md` / `pr-writting.md` carry a typo that is
  referenced elsewhere — do not rename them casually.
- A charter is not the operational source of truth for agents; when both exist,
  the runbook wins for agent behaviour.

## Agent Notes

- Read a charter when you need the _why_ behind a rule, or when the runbook is
  silent on a judgement call.
- Changing a standard means changing the charter and its runbook together.
