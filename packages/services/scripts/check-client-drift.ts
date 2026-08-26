#!/usr/bin/env tsx
/**
 * Fails when a generated `@repo/services` client is behind the backend
 * contract it was generated from — the check for a `pnpm gen:client` that
 * should have run (a contract change) but never did.
 *
 * For every `DOMAIN_MANIFEST` entry, hashes the currently-served OpenAPI
 * document the same way `gen:client` does and compares it against the
 * committed `src/<domain>/generated/.source-hash`. `IGNORED_TAGS` domains
 * are never generated, so they are never compared.
 *
 * The document comes from `extractSpecFromBackend` — the same
 * backend-docs-extraction fallback `gen-client.ts` falls back to, which boots
 * the backend in-process with no database and no network — so this check and
 * the generator can never disagree about what the contract is.
 *
 * Usage: pnpm --filter @repo/services check:drift
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createDomainSpecs,
  extractSpecFromBackend,
  findDriftedDomains,
  normalizeNullableEnums,
  parseOpenApiDocument,
} from './gen-client-lib';

const ROOT = join(import.meta.dirname, '..');
const REPO_ROOT = join(ROOT, '..', '..');
const SERVICES_ROOT = join(ROOT, 'src');

function readExistingHash(domain: string): string | null {
  const hashFile = join(SERVICES_ROOT, domain, 'generated', '.source-hash');
  if (!existsSync(hashFile)) return null;
  return readFileSync(hashFile, 'utf8').trim();
}

function main(): void {
  console.log('Extracting the current backend OpenAPI document…');
  const rawSpecText = extractSpecFromBackend(REPO_ROOT);
  // Same normalize-before-hash order as gen-client.ts, for the same reason:
  // hashing has to see exactly what generation would generate from.
  const spec = normalizeNullableEnums(parseOpenApiDocument(rawSpecText));
  const domainSpecs = createDomainSpecs(spec);

  const drifted = findDriftedDomains(domainSpecs, readExistingHash);

  if (drifted.length > 0) {
    console.error(
      `${drifted.length} generated client(s) are behind the current backend contract:\n`,
    );
    for (const domain of drifted) {
      console.error(`  - ${domain}: run \`pnpm gen:client ${domain}\``);
    }
    console.error(
      '\nRegenerate and commit the output in its own PR — see docs/agents/backend.agents.md § "Client generation".',
    );
    process.exit(1);
  }

  console.log('Generated clients match the current backend contract.');
}

main();
