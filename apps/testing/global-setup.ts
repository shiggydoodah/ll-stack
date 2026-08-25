import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { assertTestDatabaseUrl, disconnectPrisma, getPrisma } from './src/prisma';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/**
 * Runs once before the suite:
 *   1. Guard + assert the `llstack_test` database is reachable.
 *   2. Apply pending migrations with the backend's `prisma migrate deploy`
 *      (same schema + Prisma version as the running backend).
 *
 * The webServer entries (playwright.config.ts) boot the apps; this only readies
 * the database they share. `docker compose up -d postgres` is the
 * developer's responsibility.
 */
async function globalSetup(): Promise<void> {
  const databaseUrl = assertTestDatabaseUrl();

  // Fail fast with a clear message if Postgres / llstack_test isn't up yet.
  try {
    await getPrisma().$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Could not reach the test database at ${databaseUrl}. ` +
        'Is Postgres running? Try `docker compose up -d postgres`.\n' +
        `Underlying error: ${(error as Error).message}`,
    );
  } finally {
    await disconnectPrisma();
  }

  execFileSync('pnpm', ['--filter', '@repo/backend', 'prisma:migrate:deploy'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export default globalSetup;
