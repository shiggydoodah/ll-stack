import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Direct Prisma client for the e2e harness, pointed at `llstack_test`.
 *
 * The client is generated from the backend schema (`@prisma/client` resolves to
 * the workspace-wide generated client), so the model surface matches the running
 * backend exactly. Used by seed helpers and global-teardown to plant/clean rows.
 *
 * Every entry point first runs {@link assertTestDatabaseUrl}: the harness issues
 * destructive `deleteMany` calls in teardown, so it must be physically incapable
 * of pointing at a non-test database.
 */

const TEST_DATABASE_NAME = 'llstack_test';
const TEST_DATABASE_SUFFIX = '_test';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/llstack_test';

export function getTestDatabaseUrl(): string {
  return process.env['DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;
}

/**
 * Mirror of `apps/backend/test/helpers/test-database-url.ts`. Refuses any URL
 * whose database name is not `llstack_test` or does not end in `_test`, so the
 * harness can never run destructive cleanup against a real database.
 */
export function assertTestDatabaseUrl(url = getTestDatabaseUrl()): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'Invalid DATABASE_URL for the e2e harness. Expected a PostgreSQL test database URL because the harness runs destructive Prisma cleanup.',
    );
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `Invalid DATABASE_URL protocol "${parsed.protocol || '(none)'}" for the e2e harness. Expected a PostgreSQL test database URL because the harness runs destructive Prisma cleanup.`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  const isTestDatabase =
    databaseName === TEST_DATABASE_NAME || databaseName.endsWith(TEST_DATABASE_SUFFIX);

  if (!isTestDatabase) {
    throw new Error(
      `Refusing to run the e2e harness against database "${databaseName || '(none)'}". The harness runs destructive Prisma cleanup; DATABASE_URL must target "${TEST_DATABASE_NAME}" or a database ending in "${TEST_DATABASE_SUFFIX}".`,
    );
  }

  return url;
}

let client: PrismaClient | undefined;

/** Lazily-constructed singleton Prisma client, guarded to `llstack_test`. */
export function getPrisma(): PrismaClient {
  if (client) return client;
  const url = assertTestDatabaseUrl();
  // Prisma 7 drives all connections through a driver adapter (same pattern as
  // the backend's PrismaService), so the connection string is passed here.
  const adapter = new PrismaPg({ connectionString: url });
  client = new PrismaClient({ adapter });
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
