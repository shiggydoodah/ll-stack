# Dependency Management for Agents

This runbook defines how agents must update npm dependencies in this pnpm and
Turborepo monorepo.

Dependency updates are not complete until the repo verifies. Do not make
install-only commits.

## Required Preflight

Before selecting packages, inspect the repo and package-manager state:

```bash
git status --short
node --version
pnpm --version
pnpm outdated -r
```

Use repo-current behavior. Root `package.json` pins the pnpm version via its
`packageManager` field; do not apply newer-pnpm-only policy unless the repo has
actually upgraded.

Check each selected package before installing it:

- identify direct or transitive usage with `pnpm why -r <package-name>`
- identify whether it is runtime, dev, test, build, lint, format, or generated-client tooling
- check changelog, release notes, or migration notes for important packages
- check peer dependency, Node.js, pnpm, and TypeScript compatibility where relevant
- check whether the package runs install scripts or ships platform binaries

The root `pnpm-workspace.yaml` contains `allowBuilds`. If an update requires
changing that list, verify why the package needs build scripts and document the
reason in the wave commit or PR notes.

## Wave Rules

Update dependencies in waves. A wave is one coherent group of packages that can
be reviewed, verified, and reverted together.

Valid waves:

- one package family
- one framework or toolchain group
- one security fix and required parent updates
- a small batch of low-risk patch or minor dev-tooling updates

Invalid waves:

- unrelated runtime and tooling updates mixed together
- multiple major upgrades in one batch
- broad dependency churn without a reviewable theme
- update plus unrelated refactor or feature work

Major upgrades get their own wave unless explicitly approved otherwise.

## Wave Workflow

1. Record the intended wave and selected packages.

2. Verify every selected package before install:

```bash
pnpm why -r <package-name>
```

For important packages, read changelogs or release notes before running the
update command.

3. Update only the selected wave:

```bash
pnpm up -r <package-name>@latest
```

For related packages:

```bash
pnpm up -r <package-one>@latest <package-two>@latest
```

Use interactive updates only when each selected package has been reviewed:

```bash
pnpm up -L -i -r
```

4. Inspect changed files:

```bash
git diff -- package.json pnpm-workspace.yaml pnpm-lock.yaml
```

Also inspect any workspace `package.json` files touched by the wave. Generated
service output must not be edited by hand.

5. Fix required code, config, or test issues caused by the wave. Follow the
   non-negotiables in `AGENTS.md` — do not weaken validation to make the update
   pass.

6. Validate the completed wave:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm audit
```

Targeted checks are useful during the wave, but they are not a replacement for
`pnpm verify`.

## Completion and Commit Rules

A wave is complete only when all of these are true:

- selected dependency updates are installed
- `package.json`, `pnpm-workspace.yaml`, and lockfile changes are understood
- required fixes are included
- `pnpm install --frozen-lockfile` passes
- `pnpm verify` passes
- `pnpm audit` has been reviewed
- risks and follow-ups are known

Commit after each completed wave, and only after `pnpm verify` passes. Make
exactly one commit for the completed wave. Do not commit immediately after
installing packages, and do not create a commit for a failing wave.

Suggested commit message:

```text
chore(deps): update <package family>

Updates <packages> as one dependency-maintenance wave.

Verification:
- pnpm install --frozen-lockfile
- pnpm verify
- pnpm audit

Risks / notes:
- <notable compatibility, security, or follow-up notes>
```

If `pnpm verify` fails, fix the wave or revert only that wave before committing.
If required validation cannot run, do not claim the dependency update is
complete.

## Vulnerability Handling

For vulnerabilities:

```bash
pnpm audit
pnpm why -r <package-name>
```

Fix in this order:

1. Update the direct dependency.
2. Update the parent package that brings in the vulnerable transitive package.
3. Use `pnpm.overrides` only when necessary and only with a documented reason.
4. If the patched version hasn't cleared the `minimumReleaseAge` threshold,
   `pnpm install` will refuse to resolve it. Add the **exact version** to
   `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`:

   ```yaml
   minimumReleaseAgeExclude:
     - '@package-name@x.y.z'
   ```

   Use the versioned form (`@package@version`), not the bare package name. The
   bare form permanently exempts all future releases from the age check — the
   versioned form limits the exemption to the specific release needed to fix the
   CVE.

5. Ignore an advisory only with explicit justification.

Ignored advisories must explain why the vulnerability does not affect this repo
or why no safe fix exists yet.
