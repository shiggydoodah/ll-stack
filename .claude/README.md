# `.claude/`

Committed configuration for [Claude Code](https://claude.com/claude-code) working in
this repo. Everything here is shared with anyone who clones the repository, so it is
deliberately conservative.

## `settings.json`

`permissions.allow` covers reads inside the repository (`Read(./**)` — the working
tree only, not your home directory), read-only inspection commands (`ls`, `cat`,
`grep`, `rg`, `find`, read-only `git`), and this repo's own validation scripts
(`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, the `pnpm verify*` ladder).
Nothing here writes files, installs packages, reaches the network, or mutates git
history — those still prompt.

`permissions.deny` blocks reads of real `.env` files and `.secrets/`. The
`.env.example` files stay readable: they are committed and hold only local dev
placeholders.

Anything broader belongs in `.claude/settings.local.json`, which is gitignored and
per-machine. If you want to hand your own clone a longer leash, put it there rather
than widening the committed file — a permission committed here is a permission
granted on every other clone too.

## `skills/`

Repo-specific skills. `feature-review` audits a feature under `docs/features/<name>`
against its `PLAN.md` and step docs.

## Related

- `AGENTS.md` — the root instruction file for agents (non-negotiables, navigation,
  validation expectations)
- `CLAUDE.md` — the Claude Code entry point; defers to `AGENTS.md`
- `docs/agents/` — rule-shaped runbooks per area (backend, frontend, database,
  dependencies, feature docs)
