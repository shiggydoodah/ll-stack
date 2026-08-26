# Dependency Management

This guide explains how humans should update npm dependencies in this pnpm and
Turborepo monorepo.

Dependency updates should be routine, small, and verified. They should not be
done on autopilot: package changes can break builds, types, tests, runtime
behavior, generated clients, or CI.

## When to Update Dependencies

Update dependencies when there is a clear maintenance or security reason:

- routine patch and minor maintenance
- security advisories from `pnpm audit`, Dependabot, or GitHub
- framework or tooling compatibility work
- package updates needed for a planned feature or bug fix

Treat major framework, runtime, build, auth, database, and generated-client
tooling upgrades as planned work. Do not hide them inside routine maintenance.

## Before You Begin

Check the repo state and current package-manager version:

```bash
git status --short
node --version
pnpm --version
```

The root `package.json` declares the pinned pnpm version in `packageManager`.
Follow repo-current pnpm behavior, not future pnpm release behavior.

Do not manually edit generated files in `packages/services`. If an API contract
or generated client needs to change, update the source contract or generator
configuration and regenerate through the repo scripts.

The root `pnpm-workspace.yaml` declares `allowBuilds` for packages that are
allowed to run dependency build scripts. If a dependency update changes
install-script behavior, review the package and update that list only with a
clear reason.

## Inspect Outdated Packages

List outdated dependencies across the workspace:

```bash
pnpm outdated -r
```

Useful variants:

```bash
pnpm outdated -r --long
pnpm outdated -r --format json
pnpm outdated -r --dev
pnpm outdated -r --prod
```

Understand why a package exists before changing it:

```bash
pnpm why -r <package-name>
```

## Choose a Small Batch

Group updates by risk and relationship.

Good batches:

- patch and minor updates for low-risk dev tooling
- related linting or formatting packages
- related test tooling packages
- one framework or library family at a time
- one security fix and its required parent updates

Avoid mixing unrelated high-risk updates. Runtime dependencies need more care
than dev-only dependencies because they can affect production behavior.

Handle major updates separately, especially for core tools and frameworks such
as React, TanStack, Vite, TypeScript, ESLint, Tailwind, Playwright, Vitest,
Turborepo, pnpm, Prisma, NestJS, and OpenAPI/client generation tools.

For `0.x` packages, treat minor updates with extra caution because they may
include breaking changes.

## Update Workflow

1. Inspect outdated packages:

```bash
pnpm outdated -r
```

2. Choose a small, coherent batch.

```bash
pnpm update --latest --interactive --recursive
```

3. Review important package changes:

- changelog or release notes
- breaking changes and migration notes
- peer dependency changes
- Node.js, pnpm, and TypeScript compatibility
- framework compatibility notes
- install-script or binary-package changes

4. Update selected packages:

```bash
pnpm up -r <package-name>@latest
```

For multiple related packages:

```bash
pnpm up -r <package-one>@latest <package-two>@latest
```

Use interactive updates only when you will review each selected package:

```bash
pnpm up -L -i -r
```

`--latest` can move packages outside the existing version range, including major
versions. Use it intentionally.

5. Install and verify:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm audit
```

Run targeted checks as extra feedback when useful, but do not treat them as a
replacement for `pnpm verify` after dependency changes.

6. Record risks and follow-ups in the PR or commit message.

## Vulnerability Fixes

Start with:

```bash
pnpm audit
pnpm why -r <package-name>
```

Prefer fixes in this order:

1. Update the direct dependency.
2. Update the parent package that brings in the vulnerable transitive package.
3. Use `pnpm.overrides` only when needed and only with a documented reason.
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

5. Ignore an advisory only when the risk is reviewed and explicitly justified.

Good reasons to document an ignored advisory include:

- the vulnerable package is dev-only
- the vulnerable code path is not used
- the exploit requires unavailable runtime conditions
- no fix exists yet and there is a mitigation

## Dependabot Noise Policy

Dependabot is intentionally configured as a low-noise monitor. The root
`.github/dependabot.yml` keeps `open-pull-requests-limit: 0` for npm, so
Dependabot should not create routine version-update PRs for patch, minor, or
major releases.

Use GitHub repository settings for security alert notification and
severity-scoped triage:

1. Enable Dependabot alerts for the repository.
2. Configure Dependabot notifications so high and critical alerts produce
   immediate web or email notifications.
3. Enable a weekly digest for lower-priority Dependabot alert review.
4. Do not enable global Dependabot security updates unless the repo is ready to
   receive PRs for every patchable alert. When enabled, security updates try to
   open PRs for all open Dependabot alerts with an available patch.
5. If GitHub Dependabot rules are available for the repo, add a custom rule to
   open a PR only for npm alerts that match all of these conditions: runtime
   dependency scope, high or critical severity, and patch available.

GitHub does not express this full policy in `dependabot.yml` alone. In
particular, creating PRs only for high/critical runtime vulnerabilities while
suppressing lower-severity security PRs requires Dependabot rules or separate
workflow automation. Custom Dependabot rules may not be available for every
repository or account plan.

## PR Checklist

Use this compact checklist for dependency update PRs:

```md
## Dependency Update Summary

- Updated packages:
- Update type: patch / minor / major / security / tooling / runtime
- Changelogs or release notes checked:
- Peer dependency and compatibility notes checked:
- Install-script or binary-package changes checked:
- Vulnerability notes:

## Verification

- `pnpm install --frozen-lockfile`:
- `pnpm verify`:
- `pnpm audit`:
- Manual smoke test, if needed:

## Risks / Follow-ups

-
```
