import { resolve } from 'node:path';

/**
 * `apps/backend/.env` FOR THE OPERATOR SCRIPTS, AND WHY THEY HAVE TO LOAD IT
 * THEMSELVES.
 *
 * `ConfigModule` normally loads the local `.env` when the Nest app boots, and
 * `src/main.ts` mirrors that load explicitly because it validates env BEFORE
 * Nest starts. The operator scripts are in the same position — each parses
 * `process.env` against a schema before `NestFactory`, and hands the result
 * straight to `ConfigModule` as `validate: () => env` — so without this the
 * file could not take effect later either. Worse, both scripts then apply
 * `??=` defaults, so a hardcoded `localhost:5433/llstack_dev` silently won over
 * a `DATABASE_URL` an operator had put in `.env`: every downstream refusal was
 * correct but pointed at the wrong database, which reads as a rail bug at
 * exactly the wrong moment.
 *
 * CALL THIS BEFORE THE `??=` DEFAULTS. Node's loader leaves an
 * already-set variable alone, so precedence stays shell > `.env` > script
 * default: a deploy shell and a port-forward session are both unaffected.
 *
 * `src/main.ts` keeps its own copy of this rather than importing it —
 * `tsconfig.build.json` excludes `scripts`, so nothing that ships in the image
 * may reach in here.
 */

/**
 * Resolved from THIS FILE, never from `process.cwd()`.
 *
 * The repo root has a `.env` of its own (docker-compose's), and these scripts
 * are reachable both through `pnpm --filter @repo/backend …`, which runs them
 * from `apps/backend`, and directly by path from the root, which does not.
 * A cwd-relative load would quietly read a different file in the second case.
 */
export const BACKEND_ENV_FILE = resolve(__dirname, '..', '..', '.env');

/**
 * Loads the backend's `.env` into `process.env`, tolerating its absence.
 *
 * Absent is the normal case in a deployed environment, where env is injected by
 * the orchestrator — so ENOENT is ignored and anything else (an unreadable
 * file, a directory in its place) still throws rather than being swallowed into
 * a confusing config failure further down.
 */
export function loadLocalEnvFile(envFilePath: string = BACKEND_ENV_FILE): void {
  try {
    process.loadEnvFile(envFilePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // No local `.env` (e.g. staging/production) — env comes from the environment.
  }
}
