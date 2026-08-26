export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/llstack_test';

const TEST_DATABASE_NAME = 'llstack_test';
const TEST_DATABASE_SUFFIX = '_test';
// Parallel jest workers must not share one database: every integration suite
// resets shared tables with `deleteMany` in `beforeEach`, so a second worker's
// cleanup would wipe the first worker's fixtures mid-test. `test/global-setup.ts`
// clones the base test database once per run (`CREATE DATABASE ... TEMPLATE`),
// and this helper routes worker N > 1 to its clone by appending `_wN` to the
// database name. Worker 1 (and any single-process run: `--runInBand`, a single
// spec, ts-node scripts) keeps the base database, identical to the serial era.
const WORKER_DATABASE_SUFFIX_PATTERN = /_w\d+$/;

export function getTestDatabaseUrl(): string {
  // An explicit DATABASE_URL (CI sets one at job level) is the *base*, not the
  // final answer — workers still need their own clone of it.
  const baseUrl = process.env['DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;
  const workerId = Number.parseInt(process.env['JEST_WORKER_ID'] ?? '1', 10);

  if (!Number.isInteger(workerId) || workerId <= 1) {
    return baseUrl;
  }

  return withWorkerDatabase(baseUrl, workerId);
}

function withWorkerDatabase(url: string, workerId: number): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    // Leave malformed URLs untouched so assertTestDatabaseUrl reports them.
    return url;
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));

  // Idempotent: specs write the resolved URL back to process.env['DATABASE_URL']
  // before building the app, and later suites in the same worker re-derive from
  // it — an already worker-scoped name must not be suffixed again.
  if (databaseName === '' || WORKER_DATABASE_SUFFIX_PATTERN.test(databaseName)) {
    return url;
  }

  parsed.pathname = `/${databaseName}_w${workerId}`;
  return parsed.toString();
}

export function assertTestDatabaseUrl(url = getTestDatabaseUrl()): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'Invalid DATABASE_URL for backend integration tests. Expected a PostgreSQL test database URL because these tests run destructive Prisma cleanup.',
    );
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `Invalid DATABASE_URL protocol "${parsed.protocol || '(none)'}" for backend integration tests. Expected a PostgreSQL test database URL because these tests run destructive Prisma cleanup.`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  // A per-worker clone (`<base>_wN`) is as much a test database as its base, so
  // the safety check applies to the name with any worker suffix stripped.
  const baseDatabaseName = databaseName.replace(WORKER_DATABASE_SUFFIX_PATTERN, '');
  const isTestDatabase =
    baseDatabaseName === TEST_DATABASE_NAME || baseDatabaseName.endsWith(TEST_DATABASE_SUFFIX);

  if (!isTestDatabase) {
    throw new Error(
      `Refusing to run backend integration tests against database "${databaseName || '(none)'}". These tests run destructive Prisma cleanup; DATABASE_URL must target "${TEST_DATABASE_NAME}", a database ending in "${TEST_DATABASE_SUFFIX}", or a per-worker clone of one ("_wN" suffix).`,
    );
  }

  return url;
}
