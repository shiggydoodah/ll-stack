/**
 * Shared fail-closed guard for the local seed scripts. Every one of them writes
 * data that must never reach a shared, staging, or production database —
 * today the known-credential accounts of `seed-users`, plus whatever fixture
 * scripts later phases add (demo fixture data).
 *
 * The guard refuses BEFORE a Prisma client is constructed or any connection is
 * opened, so a misconfigured `DATABASE_URL` never reaches the wire. Extracted
 * here (rather than inlined per script) so every seed script shares one
 * definition of "local".
 */

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);
const NON_LOCAL_NODE_ENVS = new Set(['production', 'staging']);

export const DEFAULT_DEV_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/llstack_dev';

/** `DATABASE_URL`, falling back to the local dev database the repo ships with. */
export function resolveSeedDatabaseUrl(): string {
  return process.env['DATABASE_URL'] ?? DEFAULT_DEV_DATABASE_URL;
}

/**
 * Host and database name only — never credentials — so an operator running with
 * a non-default `DATABASE_URL` can see which database is about to change before
 * it does.
 */
export function describeTargetDatabase(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return 'unparseable DATABASE_URL';
  }
}

/**
 * Throws unless the target database is local and `NODE_ENV` is not a deployed
 * environment.
 *
 * @param writes What the calling script creates, e.g. `'known-credential
 *   accounts (including a loginable ADMIN)'`. Interpolated into the refusal so
 *   the operator learns why this script in particular is refusing.
 * @param databaseUrl Defaults to {@link resolveSeedDatabaseUrl}. Injectable so
 *   the guard is unit-testable without mutating `process.env`.
 */
export function assertLocalSeedTarget(
  writes: string,
  databaseUrl: string = resolveSeedDatabaseUrl(),
): void {
  const because = `This script creates ${writes} and must only run against a local development database.`;

  const nodeEnv = process.env['NODE_ENV'];
  if (nodeEnv !== undefined && NON_LOCAL_NODE_ENVS.has(nodeEnv)) {
    throw new Error(`Refusing to seed with NODE_ENV="${nodeEnv}". ${because}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`Refusing to seed: DATABASE_URL is not a valid URL. ${because}`);
  }

  if (!LOCAL_DB_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to seed against non-local database host "${parsed.hostname || '(none)'}". ` +
        `${because} DATABASE_URL must point at localhost or 127.0.0.1.`,
    );
  }
}
