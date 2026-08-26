/**
 * Development seed. Fails closed against any non-local database BEFORE a
 * client is constructed (see scripts/lib/assert-local-seed-target.ts).
 *
 * Nothing to seed yet: the schema ships `users` and `sessions`, and both are
 * populated by signing up rather than by a fixture. This script still runs the
 * guard and a connectivity check so `pnpm setup` proves the database path end to
 * end, and so the fail-closed posture is already in place when real seed data
 * arrives.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { loadLocalEnvFile } from './lib/load-local-env-file';
import { assertLocalSeedTarget, resolveSeedDatabaseUrl } from './lib/assert-local-seed-target';

async function main(): Promise<void> {
  loadLocalEnvFile();

  const databaseUrl = resolveSeedDatabaseUrl();
  assertLocalSeedTarget('development fixture data', databaseUrl);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    const users = await prisma.user.count();
    process.stdout.write(`Seed: connected. ${users} user(s) present; nothing to seed yet.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
