import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMAIN_MANIFEST, IGNORED_TAGS, type DomainManifestEntry } from './domain-manifest';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const LOCAL_REF_PREFIX = '#/';
const SCHEMA_REF_PREFIX = '#/components/schemas/';

type OpenApiOperation = {
  tags?: string[];
  [key: string]: unknown;
};

type OpenApiPathItem = {
  [methodOrKey: string]: unknown;
};

export type OpenApiDocument = {
  openapi: string;
  paths?: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    [key: string]: unknown;
  };
  tags?: Array<{ name: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

export interface DomainSpec {
  domain: string;
  document: OpenApiDocument;
}

export function parseOpenApiDocument(raw: string): OpenApiDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OpenAPI document is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenAPI document must be a JSON object');
  }

  if (!('openapi' in parsed) || typeof (parsed as { openapi?: unknown }).openapi !== 'string') {
    throw new Error('OpenAPI document is missing a valid "openapi" field');
  }

  return parsed as OpenApiDocument;
}

/**
 * The backend-docs-extraction fallback: boots the backend's own
 * `openapi:extract` script (which builds the document via `buildOpenApiDocument`
 * with `OPENAPI_EXTRACT=true`, so `PrismaService` skips its eager connection —
 * no database, no network, no live provider) and reads the JSON it writes.
 *
 * The one document-acquisition path that is deterministic enough for both
 * `gen-client.ts` (as its fallback behind a live `BACKEND_URL` fetch) and
 * `check-client-drift.ts` (which must not depend on a running backend at all).
 * Shared here so neither script re-derives "what is the contract".
 */
export function extractSpecFromBackend(repoRoot: string): string {
  const tempOutputPath = join(tmpdir(), `llstack-openapi-${Date.now()}.json`);
  try {
    execFileSync('pnpm', ['--filter', '@repo/backend', 'openapi:extract', tempOutputPath], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return readFileSync(tempOutputPath, 'utf8');
  } finally {
    rmSync(tempOutputPath, { force: true });
  }
}

/**
 * OpenAPI 3.0 marks nullability with `nullable: true`, but `enum` is an
 * independent validation keyword: unless `null` is listed among the members, a
 * nullable enum schema still rejects null, so openapi-ts (correctly, per spec)
 * generates the member union WITHOUT `| null`. The backend deliberately accepts
 * an explicit null on these fields (`@IsOptional` + `@IsIn` — null clears the
 * value), so the generated TS contract would disagree with runtime behavior and
 * force casts at the call site. Normalize at the generator boundary: append
 * `null` to the enum list of every inline `nullable: true` enum schema so the
 * generated union carries `| null`. Enums referenced via `enumName`/`$ref`
 * compositions already generate `| null` and are untouched (no inline `enum`).
 */
export function normalizeNullableEnums(spec: OpenApiDocument): OpenApiDocument {
  return withNullableEnumNulls(spec) as OpenApiDocument;
}

function withNullableEnumNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withNullableEnumNulls);
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  const next = Object.fromEntries(
    Object.entries(record).map(([key, nestedValue]) => [key, withNullableEnumNulls(nestedValue)]),
  );

  if (next['nullable'] === true && Array.isArray(next['enum']) && !next['enum'].includes(null)) {
    next['enum'] = [...next['enum'], null];
  }

  return next;
}

export function computeSourceHash(
  spec: OpenApiDocument,
  manifest: DomainManifestEntry[] = DOMAIN_MANIFEST,
  ignoredTags: readonly string[] = IGNORED_TAGS,
): string {
  const payload = stableStringify({
    ignoredTags,
    manifest: manifest.map((entry) => ({ name: entry.name, tag: entry.tag })),
    spec,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function computeDomainSourceHash(
  domainSpec: DomainSpec,
  manifest: DomainManifestEntry[] = DOMAIN_MANIFEST,
  ignoredTags: readonly string[] = IGNORED_TAGS,
): string {
  const payload = stableStringify({
    domain: domainSpec.domain,
    ignoredTags,
    manifest: manifest.map((entry) => ({ name: entry.name, tag: entry.tag })),
    spec: domainSpec.document,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function shouldSkipGeneration(params: {
  existingHash: string | null;
  nextHash: string;
  force: boolean;
}): boolean {
  return !params.force && params.existingHash === params.nextHash;
}

export function shouldSkipDomainGeneration(params: {
  existingHash: string | null;
  nextHash: string;
  force: boolean;
  outputExists: boolean;
}): boolean {
  return params.outputExists && shouldSkipGeneration(params);
}

export function createDomainSpecs(
  spec: OpenApiDocument,
  manifest: DomainManifestEntry[] = DOMAIN_MANIFEST,
  ignoredTags: readonly string[] = IGNORED_TAGS,
): DomainSpec[] {
  validateKnownTags(spec, manifest, ignoredTags);

  return manifest.map((entry) => ({
    domain: entry.name,
    document: filterSpecByTag(spec, entry.tag),
  }));
}

export interface GenArgs {
  /** Requested domains; empty means "all domains in the manifest". */
  domains: string[];
  /** Write generated output to a git-ignored scratch dir instead of `src/`. */
  dryRun: boolean;
  /** Regenerate even when the per-domain source hash is unchanged. */
  force: boolean;
  /** Pick domains interactively from a multi-select list before generating. */
  list: boolean;
}

/**
 * Parses the `gen-client` CLI arguments: positional domain names plus the
 * `--list`, `--dry-run` and `--force` flags. Domain names are validated against
 * the manifest so an unknown name fails fast with the list of valid domains.
 */
export function parseGenArgs(
  argv: string[],
  manifest: DomainManifestEntry[] = DOMAIN_MANIFEST,
): GenArgs {
  let dryRun = false;
  let force = false;
  let list = false;
  const domains: string[] = [];

  for (const arg of argv) {
    if (arg === '--') {
      // Conventional end-of-options marker; pnpm can forward it through `--`.
      continue;
    } else if (arg === '--list') {
      list = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}. Supported flags: --list, --dry-run, --force.`);
    } else {
      domains.push(arg);
    }
  }

  const validNames = manifest.map((entry) => entry.name);
  const knownNames = new Set(validNames);
  const unknownDomains = [...new Set(domains.filter((domain) => !knownNames.has(domain)))].sort();
  if (unknownDomains.length > 0) {
    throw new Error(
      `Unknown domain(s): ${unknownDomains.join(', ')}. Valid domains: ${validNames.join(', ')}.`,
    );
  }

  return { domains, dryRun, force, list };
}

/** Narrows domain specs to the requested names; an empty request keeps them all. */
export function selectDomainSpecs(domainSpecs: DomainSpec[], domains: string[]): DomainSpec[] {
  if (domains.length === 0) {
    return domainSpecs;
  }
  const requested = new Set(domains);
  return domainSpecs.filter((domainSpec) => requested.has(domainSpec.domain));
}

/**
 * Domains whose currently-served spec hash disagrees with the committed
 * `.source-hash` — i.e. a `pnpm gen:client <domain>` that ran and was never
 * committed, or a contract change for which it never ran at all.
 *
 * `readExistingHash` is injected (rather than reading the filesystem here) so
 * this stays a pure comparison, testable the same way as
 * `shouldSkipDomainGeneration`.
 */
export function findDriftedDomains(
  domainSpecs: DomainSpec[],
  readExistingHash: (domain: string) => string | null,
): string[] {
  return domainSpecs
    .filter(
      (domainSpec) => readExistingHash(domainSpec.domain) !== computeDomainSourceHash(domainSpec),
    )
    .map((domainSpec) => domainSpec.domain);
}

export function validateKnownTags(
  spec: OpenApiDocument,
  manifest: DomainManifestEntry[] = DOMAIN_MANIFEST,
  ignoredTags: readonly string[] = IGNORED_TAGS,
): void {
  const knownTags = new Set(manifest.map((entry) => entry.tag));
  const ignoredTagSet = new Set(ignoredTags);
  const unknownTags = [...collectOpenApiTags(spec)]
    .filter((tag) => !knownTags.has(tag) && !ignoredTagSet.has(tag))
    .sort();

  if (unknownTags.length > 0) {
    throw new Error(
      `OpenAPI document contains unknown tag(s): ${unknownTags.join(
        ', ',
      )}. Add them to DOMAIN_MANIFEST or IGNORED_TAGS.`,
    );
  }
}

function filterSpecByTag(spec: OpenApiDocument, tag: string): OpenApiDocument {
  const nextPaths: Record<string, OpenApiPathItem> = {};
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const filteredPathItem: OpenApiPathItem = {};
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<HttpMethod, OpenApiOperation | undefined>)[method];
      if (!operation || !Array.isArray(operation.tags) || !operation.tags.includes(tag)) {
        continue;
      }
      filteredPathItem[method] = operation;
    }

    if (Object.keys(filteredPathItem).length > 0) {
      if ('parameters' in pathItem) {
        filteredPathItem['parameters'] = pathItem.parameters;
      }
      if ('$ref' in pathItem) {
        filteredPathItem['$ref'] = pathItem.$ref;
      }
      if ('summary' in pathItem) {
        filteredPathItem['summary'] = pathItem.summary;
      }
      if ('description' in pathItem) {
        filteredPathItem['description'] = pathItem.description;
      }
      if ('servers' in pathItem) {
        filteredPathItem['servers'] = pathItem.servers;
      }

      nextPaths[path] = filteredPathItem;
    }
  }

  const filteredSpec = {
    ...spec,
    paths: nextPaths,
    tags: (spec.tags ?? []).filter((entry) => entry.name === tag),
  };

  return pruneUnusedComponentSchemas(filteredSpec);
}

function collectOpenApiTags(spec: OpenApiDocument): Set<string> {
  const tags = new Set<string>();

  for (const tag of spec.tags ?? []) {
    tags.add(tag.name);
  }

  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<HttpMethod, OpenApiOperation | undefined>)[method];
      if (!operation || !Array.isArray(operation.tags)) {
        continue;
      }

      for (const tag of operation.tags) {
        tags.add(tag);
      }
    }
  }

  return tags;
}

function pruneUnusedComponentSchemas(spec: OpenApiDocument): OpenApiDocument {
  const schemas = spec.components?.schemas;
  if (!schemas) {
    return spec;
  }

  const schemaNames = collectReferencedSchemaNames(spec, spec.paths ?? {});
  const nextSchemas = Object.fromEntries(
    [...schemaNames].sort().flatMap((schemaName): Array<[string, unknown]> => {
      const schema = schemas[schemaName];
      return schema === undefined ? [] : [[schemaName, schema]];
    }),
  );

  return {
    ...spec,
    components: {
      ...spec.components,
      schemas: nextSchemas,
    },
  };
}

function collectReferencedSchemaNames(spec: OpenApiDocument, seed: unknown): Set<string> {
  const schemaNames = new Set<string>();
  const visitedRefs = new Set<string>();

  const visitRef = (ref: string): void => {
    if (!ref.startsWith(LOCAL_REF_PREFIX) || visitedRefs.has(ref)) {
      return;
    }
    visitedRefs.add(ref);

    if (ref.startsWith(SCHEMA_REF_PREFIX)) {
      const schemaName = decodePointerSegment(ref.slice(SCHEMA_REF_PREFIX.length));
      if (schemaNames.has(schemaName)) {
        return;
      }

      schemaNames.add(schemaName);
      walkRefs(spec.components?.schemas?.[schemaName], visitRef);
      return;
    }

    walkRefs(resolveLocalRef(spec, ref), visitRef);
  };

  walkRefs(seed, visitRef);

  return schemaNames;
}

function walkRefs(value: unknown, visitRef: (ref: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkRefs(item, visitRef);
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  const ref = record['$ref'];
  if (typeof ref === 'string') {
    visitRef(ref);
  }

  for (const nestedValue of Object.values(record)) {
    walkRefs(nestedValue, visitRef);
  }
}

function resolveLocalRef(spec: OpenApiDocument, ref: string): unknown {
  if (!ref.startsWith(LOCAL_REF_PREFIX)) {
    return undefined;
  }

  const segments = ref.slice(LOCAL_REF_PREFIX.length).split('/').map(decodePointerSegment);
  let current: unknown = spec;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    const record = asRecord(current);
    if (!record) {
      return undefined;
    }

    current = record[segment];
  }

  return current;
}

function decodePointerSegment(segment: string): string {
  return decodeURIComponent(segment).replaceAll('~1', '/').replaceAll('~0', '~');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(toStableValue(value));
}

function toStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableValue);
  }

  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, toStableValue(nestedValue)]),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
