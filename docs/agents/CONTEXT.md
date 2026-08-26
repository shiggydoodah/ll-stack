# Context: docs/agents

## Purpose

- The authoritative rule sets agents must read **before** working in a given
  area. Each file is the enforcement counterpart of a charter in
  `docs/charters/`.

## Architecture

| File                              | Read before                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `backend.agents.md`               | Any change in `apps/backend` — endpoints, modules, services, guards, DTOs, gating, throttling, config, observability |
| `database-standards.agents.md`    | Any change under `apps/backend/prisma/**` or any service that calls Prisma                                           |
| `frontend.agents.md`              | Any change in `apps/frontend` — UI, pages, server actions, gateways, forms, auth, logging, env                       |
| `feature-docs.agents.md`          | Creating or restructuring anything under `docs/features/`                                                            |
| `dependency-management.agents.md` | Only when explicitly asked to update npm dependencies                                                                |

## Key Flows

- The triggers are declared in `AGENTS.md` / `CLAUDE.md`; these files carry the
  actual checklists, and each names the validation command that closes the work
  (`pnpm verify:backend`, `pnpm verify:frontend`, `pnpm prisma:lint` + `pnpm
verify`).

## Gotchas

- `dependency-management.agents.md` is explicitly **not** to be auto-read for
  unrelated tasks.
- These runbooks apply to code review too — the `docs/**` review exclusion
  covers the files themselves, not the rules they contain.
- A rule change here should usually land with the matching charter edit so the
  _why_ and the _what_ stay together.

## Agent Notes

- Read the one file for the area you are touching. Do not read the whole
  directory speculatively — they are long and mostly irrelevant to any single
  task.
- Written for agents: see `skills:writing-for-agents` conventions when editing.
