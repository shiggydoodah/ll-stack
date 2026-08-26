---
applyTo: '.github/**/*'
---

# PR Review GitHub Automation Rules

Use these checks for GitHub workflows, actions, Dependabot, Copilot, PR templates, and review-policy files.

## Source of truth

- Read `.github/CONTEXT.md` before reviewing repository automation changes.
- Review instruction and policy changes against `AGENTS.md`, `.github/CONTEXT.md`, `.github/copilot-instructions.md`, and `.github/instructions/*`. If one of these files is not populated, skip that file entirely and continue with the remaining sources.
- Keep cross-agent review instructions aligned when changing review policy.

## Workflow and action safety

- Check workflow triggers and path filters so relevant app, package, lockfile, config, and workflow changes run the expected CI.
- Verify `permissions` are least-privilege and avoid broad write scopes unless clearly required.
- Verify secrets are only used where needed and are not echoed, logged, or passed to untrusted code.
- Prefer pinned or trusted marketplace actions and current supported Node/pnpm versions.
- Check concurrency, timeout, cache, and install settings for reliable and bounded CI execution.

## CI coverage and correctness

- Ensure backend workflow changes still cover backend app and backend-impacting shared config changes.
- Ensure frontend workflow changes still cover frontend app, UI package, services package, and frontend-impacting shared config changes.
- For new workspaces or shared packages, verify workflows and path-scoped review instructions are updated together.
- Check that docs/design-only exclusions do not accidentally skip runnable code, config, generated output, or tests.

## Review-policy automation

- Keep `.github/copilot-instructions.md`, `.github/instructions/*`, and `.github/CONTEXT.md` consistent.
- Check that review instruction files point to existing files and use repo-specific paths.
- Preserve concise, actionable review output rules and avoid duplicating large policy text across wrappers.

## GitHub automation validation

- For YAML/config-only changes, expect formatting checks and careful path/trigger review.
- For workflow command changes, expect the affected package scripts to exist and match package names.
- For review-policy changes, expect touched Markdown/YAML files to pass Prettier and `git diff --check`.
