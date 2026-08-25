import { assertTestDatabaseUrl, disconnectPrisma, getPrisma } from './src/prisma';

/**
 * Runs once after the suite: delete every account the harness minted (matched
 * by the `@llstack.test` address pattern every test uses).
 *
 * The Prisma client is hard-guarded to `llstack_test` via
 * {@link assertTestDatabaseUrl}, so this destructive delete can never hit a
 * real DB.
 */
async function globalTeardown(): Promise<void> {
  assertTestDatabaseUrl();

  try {
    await getPrisma().user.deleteMany({
      where: { email: { endsWith: '@llstack.test' } },
    });
  } finally {
    await disconnectPrisma();
  }
}

export default globalTeardown;
