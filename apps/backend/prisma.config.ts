import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  // datasource.url is only required for migrate/introspect commands.
  // It is omitted here so that `prisma generate` (run during postinstall
  // without a live database) does not fail when DATABASE_URL is not set.
  // When running migrations, pass DATABASE_URL in the environment as normal.
  ...(process.env['DATABASE_URL'] ? { datasource: { url: process.env['DATABASE_URL'] } } : {}),
  migrations: {
    // Prisma 7 reads the seed command from here — the `package.json` `prisma.seed`
    // key it used to use is gone in v7.
    //
    // This is invoked by `prisma db seed`. Note that in Prisma 7.8 `prisma migrate
    // reset` does NOT run it (there is no `--skip-seed` flag either — it simply
    // never seeds), so the `db:reset` script chains `prisma db seed` explicitly.
    // Nothing here runs on `prisma migrate deploy`, the path CI uses — CI must
    // never seed. The script itself also fails closed against any non-local database.
    seed: 'node --enable-source-maps -r ts-node/register -r ./scripts/ts-node-resolve-js-ext.cjs scripts/seed.ts',
  },
});
