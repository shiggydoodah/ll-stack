import { assertTestDatabaseUrl, getTestDatabaseUrl } from './test-database-url';

/**
 * The minimum env `AppModule` needs to be CONSTRUCTED.
 *
 * `src/config/env.schema.ts` is validated at module construction, so any spec
 * building the real module graph has to satisfy it before importing
 * `app.module.js` — including a unit spec that never `init()`s the app and so
 * never opens a connection.
 *
 * ONE COPY, SHARED. Specs that build the real module graph used to carry
 * their own verbatim copies of this block. A new required variable in the
 * schema then broke several files with no compile-time link between them, and
 * the second failure was only discovered after fixing the first.
 *
 * `port` stays a parameter because it is the one value the callers deliberately
 * disagree on. Neither actually listens, but distinct ports keep that an
 * accident of the two specs rather than a shared value one could come to rely
 * on.
 *
 * DELIBERATELY NOT EXHAUSTIVE: only variables the schema REQUIRES belong here.
 * Anything the schema defaults is left unset on purpose, so specs exercise the
 * defaults. Restoring `process.env` afterwards is the caller's job.
 */
export function applyAppModuleTestEnv(port: number): void {
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = String(port);
  process.env['DATABASE_URL'] = assertTestDatabaseUrl(getTestDatabaseUrl());
  process.env['BACKEND_API_SECRET'] = 'test-api-secret';
  process.env['ADMIN_API_KEY'] = 'test-admin-api-key';
  process.env['FRONTEND_PUBLIC_URL'] = 'http://localhost:4100';
  process.env['APPLICATION_NAME'] = 'backend';
  process.env['LOG_SINK'] = 'stdout';
  process.env['LOG_LEVEL'] = 'fatal';
}
