import { Client } from 'pg';

import { assertTestDatabaseUrl, getTestDatabaseUrl } from './helpers/test-database-url';

/**
 * Provision one clone of the base test database per extra jest worker.
 *
 * Runs once in the coordinator process, before any worker starts. Worker 1
 * keeps the base database (`llstack_test` by default); workers 2..N get
 * `<base>_wN`, dropped and recreated from the base as a template every run so
 * schema changes flow automatically from `prisma:migrate:both`. A copy takes
 * ~0.15s (measured in docs/spikes/verify-performance-and-test-speed.md), so
 * this adds well under a second to a full run.
 *
 * Failure posture is deliberately split:
 * - Postgres unreachable, or the base database missing → warn and continue.
 *   Unit-only invocations (e.g. `jest test/configure-app.spec.ts`) must keep
 *   working with no database at all, exactly as they did when the suite was
 *   serial; integration specs will then fail with the familiar
 *   connection-error signature instead of a new one.
 * - Postgres reachable but cloning fails → throw. The likely cause is a live
 *   connection holding the template (`CREATE DATABASE ... TEMPLATE` requires
 *   zero connections on the template), and a half-provisioned parallel run
 *   would otherwise die with confusing per-worker "database does not exist"
 *   errors dozens of suites in.
 */
export default async function provisionWorkerDatabases(globalConfig: {
  maxWorkers: number;
}): Promise<void> {
  const workerCount = globalConfig.maxWorkers;

  if (workerCount <= 1) {
    return;
  }

  const baseUrl = new URL(assertTestDatabaseUrl(getTestDatabaseUrl()));
  const templateName = decodeURIComponent(baseUrl.pathname.replace(/^\/+/, ''));

  // CREATE/DROP DATABASE cannot run against the database being copied, so the
  // admin connection targets the maintenance database with the same credentials.
  const adminUrl = new URL(baseUrl.toString());
  adminUrl.pathname = '/postgres';

  const client = new Client({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 3_000,
  });

  try {
    await client.connect();
  } catch (error) {
    // Connection timeouts surface as AggregateErrors with an empty message.
    const reason = error instanceof Error ? error.message || error.constructor.name : String(error);
    process.stderr.write(
      `\n[test/global-setup] Postgres is unreachable (${reason}); skipping per-worker test database provisioning. ` +
        'Unit specs are unaffected; integration specs need the database up (docker compose up -d postgres).\n',
    );
    return;
  }

  try {
    const template = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      templateName,
    ]);

    if (template.rowCount === 0) {
      process.stderr.write(
        `\n[test/global-setup] Base test database "${templateName}" does not exist; skipping per-worker provisioning. ` +
          'Create and migrate it (pnpm migrate) before running integration specs.\n',
      );
      return;
    }

    for (let workerId = 2; workerId <= workerCount; workerId += 1) {
      const workerDatabaseName = `${templateName}_w${workerId}`;
      await client.query(`DROP DATABASE IF EXISTS "${workerDatabaseName}" WITH (FORCE)`);
      await client.query(`CREATE DATABASE "${workerDatabaseName}" TEMPLATE "${templateName}"`);
    }
  } catch (error) {
    throw new Error(
      `Failed to provision per-worker test databases from template "${templateName}": ${(error as Error).message}. ` +
        'CREATE DATABASE ... TEMPLATE requires zero live connections on the template — close anything attached to it ' +
        '(an overlapping test run, psql, Prisma Studio, a dev server pointed at the test database) and re-run.',
    );
  } finally {
    await client.end();
  }
}
