#!/usr/bin/env node

// Guards the repo's Node version pin against drift.
//
// Six places state the Node version this repo runs, and no single tool reads
// more than one of them:
//
//   .nvmrc                     nvm, and `actions/setup-node` in .github/workflows/ci.yml
//   .tool-versions             asdf/mise, and the jest guard's OOM preflight
//   package.json engines.node  pnpm, at install time
//   apps/*/Dockerfile          the built images
//   pnpm-workspace.yaml        the catalog + overrides pins for @types/node
//
// Nothing else compares them, so one can fall behind silently. The classic
// failure is a bump that lands in .tool-versions but not .nvmrc: the author's
// machine runs the new Node, every local gate passes, then CI installs the old
// one from .nvmrc and dies inside `setup-node` or `pnpm install` — before a
// single repo command runs, with an error that names a package rather than the
// file that is actually wrong. @types/node drifting ahead of the runtime is the
// quieter variant: tsc accepts APIs that do not exist at run time and the
// failure surfaces in production (see the note on that catalog entry in
// pnpm-workspace.yaml).
//
// This is a file-consistency check, not a runtime check: it says nothing about
// the Node the current process is running on — scripts/jest-open-handle-guard.mjs
// already warns (non-fatally) about that. Note also that by the time this runs
// in CI, .nvmrc has already selected the Node in use, so a stale .nvmrc has
// broken the job long before we get here. The value of this gate is local:
// catching the mismatch before the push, next to the edit that caused it.

import { readFileSync } from 'node:fs';
import process from 'node:process';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const problems = [];
const fail = (message) => problems.push(message);

function read(relativePath) {
  try {
    return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  } catch {
    fail(
      `${relativePath} — missing or unreadable. It is one of the Node version pins and must exist.`,
    );
    return null;
  }
}

function majorOf(range) {
  const match = /(\d+)/.exec(range);
  return match ? match[1] : null;
}

// Ordinary precedence compare over [major, minor, patch]: the first component
// that differs decides. Comparing componentwise instead ("is any part lower?")
// wrongly reports 24.20.1 as below a 24.19.5 floor.
function compare(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }

  return 0;
}

// -- .nvmrc is the authoritative pin --------------------------------------
// Everything else is compared against it, so an unusable value here is fatal
// on its own: there is nothing left to compare to.
const nvmrcRaw = read('.nvmrc');
const pinned = (nvmrcRaw ?? '').trim();
const pinnedParts = SEMVER.exec(pinned);

if (!pinnedParts) {
  if (nvmrcRaw !== null) {
    fail(`.nvmrc — expected an exact version like "24.19.0", found "${pinned}".`);
  }
  report();
}

const [, pinnedMajor] = pinnedParts;
const pinnedNumbers = pinnedParts.slice(1).map(Number);

// -- .tool-versions must match exactly, not just on the major -------------
// Patch floors are real here: jsdom 30 requires ^24.15.0 (see the catalog note
// in pnpm-workspace.yaml), so two pins agreeing only on the major can still put
// CI and local dev on different sides of a dependency's supported range.
const toolVersions = read('.tool-versions');

if (toolVersions !== null) {
  const nodeLine = toolVersions
    .split('\n')
    .find((line) => line.trim().split(/\s+/)[0] === 'nodejs');
  const toolVersionsPin = nodeLine ? nodeLine.trim().split(/\s+/)[1] : null;

  if (!toolVersionsPin) {
    fail('.tool-versions — no `nodejs` entry found.');
  } else if (toolVersionsPin !== pinned) {
    fail(
      `.tool-versions — pins nodejs ${toolVersionsPin}, but .nvmrc pins ${pinned}. These must be identical.`,
    );
  }
}

// -- package.json engines.node --------------------------------------------
// Only the `>=X.Y.Z` form is understood on purpose. A range this script cannot
// parse is reported rather than skipped: a gate that silently passes on input
// it does not understand is worse than no gate.
const packageJsonRaw = read('package.json');

if (packageJsonRaw !== null) {
  let enginesNode = null;
  let parsed = true;

  try {
    enginesNode = JSON.parse(packageJsonRaw).engines?.node ?? null;
  } catch {
    parsed = false;
    fail('package.json — could not be parsed as JSON.');
  }

  // Only claim the field is missing if the file actually parsed; otherwise the
  // unparseable-JSON failure above already says everything useful.
  if (parsed && enginesNode === null) {
    fail('package.json — no `engines.node` field found.');
  } else if (enginesNode !== null) {
    const floor = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(enginesNode.trim());

    if (!floor) {
      fail(
        `package.json — engines.node is "${enginesNode}", which this check cannot compare. Use the ">=X.Y.Z" form, or update this script.`,
      );
    } else {
      const floorNumbers = floor.slice(1).map(Number);

      if (floor[1] !== pinnedMajor) {
        fail(
          `package.json — engines.node "${enginesNode}" is on major ${floor[1]}, but .nvmrc pins ${pinned}.`,
        );
      } else if (compare(pinnedNumbers, floorNumbers) < 0) {
        fail(
          `package.json — engines.node requires ${enginesNode}, which the pinned Node ${pinned} does not satisfy.`,
        );
      }
    }
  }
}

// -- Dockerfiles ------------------------------------------------------------
// The image tags carry a major only (`node:24-bookworm-slim`), so the major is
// all there is to compare. Both the builder and runner stages are checked.
for (const dockerfile of ['apps/backend/Dockerfile', 'apps/frontend/Dockerfile']) {
  const contents = read(dockerfile);

  if (contents === null) {
    continue;
  }

  const tags = [...contents.matchAll(/^FROM\s+node:(\d+)/gm)].map((match) => match[1]);

  if (tags.length === 0) {
    fail(`${dockerfile} — no \`FROM node:<major>\` line found.`);
    continue;
  }

  for (const tag of new Set(tags)) {
    if (tag !== pinnedMajor) {
      fail(`${dockerfile} — builds on node:${tag}, but .nvmrc pins ${pinned}.`);
    }
  }
}

// -- pnpm-workspace.yaml: @types/node ---------------------------------------
// Typings ahead of the runtime let tsc accept APIs that do not exist when the
// code runs. The overrides entry is a blanket selector that outranks every
// workspace's own declaration, so it has to stay byte-identical to the catalog
// entry — both rules are already written as comments beside those entries; this
// enforces them.
const workspaceYaml = read('pnpm-workspace.yaml');

if (workspaceYaml !== null) {
  const lines = workspaceYaml.split('\n');
  const overridesIndex = lines.findIndex((line) => /^overrides:/.test(line));

  const findTypesNode = (from, to) =>
    lines
      .slice(from, to)
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => /^\s*['"]?@types\/node['"]?\s*:\s*['"]?([^'"\s]+)['"]?/.exec(line))
      .find(Boolean)?.[1] ?? null;

  const catalogTypes = findTypesNode(0, overridesIndex === -1 ? lines.length : overridesIndex);
  const overrideTypes = overridesIndex === -1 ? null : findTypesNode(overridesIndex, lines.length);

  if (overridesIndex === -1) {
    fail('pnpm-workspace.yaml — no `overrides:` section found.');
  }

  for (const [label, value] of [
    ['catalog', catalogTypes],
    ['overrides', overrideTypes],
  ]) {
    if (value === null) {
      if (label === 'catalog' || overridesIndex !== -1) {
        fail(`pnpm-workspace.yaml — no @types/node entry under \`${label}:\`.`);
      }
      continue;
    }

    if (majorOf(value) !== pinnedMajor) {
      fail(
        `pnpm-workspace.yaml — ${label} @types/node is "${value}", but .nvmrc pins Node ${pinned}.`,
      );
    }
  }

  if (catalogTypes !== null && overrideTypes !== null && catalogTypes !== overrideTypes) {
    fail(
      `pnpm-workspace.yaml — catalog @types/node is "${catalogTypes}" but the overrides entry is "${overrideTypes}". These must be identical.`,
    );
  }
}

report();

function report() {
  if (problems.length === 0) {
    process.stdout.write(`[check-node-pin] Node ${pinned} stated consistently across all pins.\n`);
    process.exit(0);
  }

  process.stderr.write(
    '\n[check-node-pin] The repo states its Node version in more than one place, and they disagree:\n\n',
  );

  for (const problem of problems) {
    process.stderr.write(`  - ${problem}\n`);
  }

  process.stderr.write(
    '\nEvery one of these moves together — .nvmrc, .tool-versions, package.json engines.node,\n' +
      'apps/backend/Dockerfile, apps/frontend/Dockerfile, and both @types/node entries in\n' +
      'pnpm-workspace.yaml (catalog + overrides). Fix them in one edit, then re-run.\n\n',
  );

  process.exit(1);
}
