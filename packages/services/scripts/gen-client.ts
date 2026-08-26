#!/usr/bin/env tsx
/**
 * Generates per-domain API clients from the backend OpenAPI document.
 * The pipeline prefers a running backend, and falls back to backend docs
 * extraction when needed.
 *
 * Usage (from the repo root):
 *   pnpm gen:client                      # all domains
 *   pnpm gen:client users                # one or more domains
 *   pnpm gen:client --list               # pick domains from an interactive list
 *   pnpm gen:client --dry-run users      # smoke test, git-ignored output
 *
 * Arguments:
 *   <domain>...        Positional domain name(s) from the manifest; omit for all
 *   --list             Pick domains interactively from a multi-select list
 *   --dry-run          Write output to a git-ignored scratch dir; never touches src/
 *   --force            Regenerate even when the per-domain source hash is unchanged
 *
 * Environment variables:
 *   OPENAPI_SPEC_PATH  Optional path to an OpenAPI JSON file
 *   BACKEND_URL        Base URL of the running backend (default: http://localhost:3100)
 *   FORCE              Set to "1" to skip hash check and always regenerate (alias for --force)
 */

import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  computeDomainSourceHash,
  computeSourceHash,
  createDomainSpecs,
  extractSpecFromBackend,
  normalizeNullableEnums,
  parseGenArgs,
  parseOpenApiDocument,
  selectDomainSpecs,
  shouldSkipDomainGeneration,
  type GenArgs,
  type OpenApiDocument,
} from './gen-client-lib';
import { DOMAIN_MANIFEST } from './domain-manifest';
import { multiSelect } from './prompt-multiselect';

const ROOT = join(import.meta.dirname, '..');
const REPO_ROOT = join(ROOT, '..', '..');
const SERVICES_ROOT = join(ROOT, 'src');
const DRY_RUN_ROOT = join(REPO_ROOT, '.temp', 'services-gen');
const BACKEND_URL = process.env['BACKEND_URL'] ?? 'http://localhost:3100';
const SPEC_URL = `${BACKEND_URL}/docs-json`;
const SPEC_PATH = process.env['OPENAPI_SPEC_PATH'];
const FORCE_ENV = process.env['FORCE'] === '1';
const OPENAPI_CONFIG_PATH = join(ROOT, 'openapi-ts.config.ts');

async function readSpecText(): Promise<string> {
  if (SPEC_PATH) {
    const resolvedPath = resolve(SPEC_PATH);
    console.log(`Reading OpenAPI spec from ${resolvedPath}…`);
    return readFileSync(resolvedPath, 'utf8');
  }

  try {
    return await fetchSpecFromBackend();
  } catch (error) {
    console.warn(
      `Failed to fetch ${SPEC_URL}. Falling back to docs extraction. Reason: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return extractSpecFromBackend(REPO_ROOT);
  }
}

async function fetchSpecFromBackend(): Promise<string> {
  console.log(`Fetching OpenAPI spec from ${SPEC_URL}…`);
  const res = await fetch(SPEC_URL, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function readExistingHash(hashFile: string): string | null {
  if (!existsSync(hashFile)) return null;
  return readFileSync(hashFile, 'utf8').trim();
}

function generateDomainClients(spec: OpenApiDocument, args: GenArgs): void {
  const force = args.force || FORCE_ENV;
  const domainSpecs = selectDomainSpecs(createDomainSpecs(spec), args.domains);
  // Dry-run output goes to a git-ignored scratch dir so it can never reach a PR;
  // the real src/ tree is left untouched (no clean, no .source-hash writes).
  const outputBaseRoot = args.dryRun ? DRY_RUN_ROOT : SERVICES_ROOT;
  const tempDir = mkdtempSync(join(tmpdir(), 'llstack-services-'));

  try {
    if (args.dryRun) {
      mkdirSync(outputBaseRoot, { recursive: true });
    }

    for (const domainSpec of domainSpecs) {
      const domainSpecPath = join(tempDir, `${domainSpec.domain}.json`);
      const domainRoot = join(outputBaseRoot, domainSpec.domain);
      const outputPath = join(domainRoot, 'generated');
      const hashFile = join(outputPath, '.source-hash');
      const newHash = computeDomainSourceHash(domainSpec);

      if (
        !args.dryRun &&
        shouldSkipDomainGeneration({
          existingHash: readExistingHash(hashFile),
          nextHash: newHash,
          force,
          outputExists: existsSync(outputPath),
        })
      ) {
        console.log(`${domainSpec.domain}: spec unchanged (hash match). Skipping generation.`);
        continue;
      }

      mkdirSync(domainRoot, { recursive: true });
      writeFileSync(domainSpecPath, JSON.stringify(domainSpec.document, null, 2), 'utf8');
      rmSync(outputPath, { recursive: true, force: true });

      execFileSync(
        'pnpm',
        ['exec', 'openapi-ts', '--file', OPENAPI_CONFIG_PATH, '--silent', '--no-log-file'],
        {
          cwd: ROOT,
          stdio: 'inherit',
          env: {
            ...process.env,
            OPENAPI_SPEC_PATH: domainSpecPath,
            OPENAPI_OUTPUT_PATH: outputPath,
            // Always resolve the hand-written runtime config in the real src/ tree so
            // generated imports point at a committed file, even during a dry-run.
            OPENAPI_RUNTIME_CONFIG_PATH: join(SERVICES_ROOT, domainSpec.domain, 'hey-api'),
          },
        },
      );

      // The committed .source-hash is the cache key for real generation only; a
      // dry-run must not write it (the scratch tree is throwaway and git-ignored).
      if (!args.dryRun) {
        mkdirSync(dirname(hashFile), { recursive: true });
        writeFileSync(hashFile, newHash, 'utf8');
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function resolveDomains(args: GenArgs): Promise<string[] | null> {
  if (!args.list) return args.domains;

  const preselected = new Set(args.domains);
  const selected = await multiSelect(
    'Select domains to generate:',
    DOMAIN_MANIFEST.map((entry) => ({ value: entry.name, checked: preselected.has(entry.name) })),
  );

  if (selected.length === 0) {
    console.log('No domains selected — nothing to generate.');
    return null;
  }
  return selected;
}

async function main() {
  const args = parseGenArgs(process.argv.slice(2));
  const domains = await resolveDomains(args);
  if (domains === null) return;

  const rawSpecText = await readSpecText();
  // Normalized BEFORE hashing, so a domain whose spec gains `| null` unions
  // sees a hash change and regenerates; untouched domains keep their cache.
  const spec = normalizeNullableEnums(parseOpenApiDocument(rawSpecText));
  const newHash = computeSourceHash(spec);

  const scope = domains.length > 0 ? domains.join(', ') : 'all domains';
  console.log(`Resolved OpenAPI source hash: ${newHash}`);
  console.log(`Regenerating per-domain clients (${scope})${args.dryRun ? ' — dry run' : ''}…`);
  generateDomainClients(spec, { ...args, domains });

  if (args.dryRun) {
    console.log(`Dry run complete. Output written to ${DRY_RUN_ROOT} (git-ignored).`);
    console.log('Inspect it locally — do NOT commit it. Generated clients ship in a separate PR.');
  } else {
    console.log('Client generated successfully.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
