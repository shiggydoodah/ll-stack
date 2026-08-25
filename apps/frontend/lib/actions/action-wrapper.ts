import 'server-only';
import { redirect, unstable_rethrow } from 'next/navigation';
import { withRequestContext } from './with-request-context';
import { getSession, clearSessionCookie } from '../authentication/session-cookie';
import { validateSession, type SessionResult } from '../authentication/get-server-session';
import { pageRoutes } from '../routes';
import { serverLogger } from '../logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '../logging/log-events';

/**
 * How deeply the wrapper checks authentication before running the action.
 *
 * - `'none'`  — public entry point; no check (login, register…).
 * - `'light'` — the session cookie must be present, but is NOT validated. Cheap
 *   (no network): every gateway call the action makes forwards the cookie and the
 *   backend re-validates it, so a full check here would be a redundant round trip.
 *   This is the default.
 * - `'full'`  — validate the session against the backend (`/users/me`) and expose
 *   the `userId`. Use when the action needs the user id for logs, or does work that
 *   does NOT go through a gateway (so there is no backend acting as the validator).
 *   Costs one request-cached round trip.
 */
export type AuthMode = 'none' | 'light' | 'full';

/** The auth outcome handed to the action body as its first argument. */
export type ActionAuth =
  | { readonly mode: 'none' }
  | { readonly mode: 'light' }
  | { readonly mode: 'full'; readonly session: SessionResult; readonly userId: string };

/**
 * Returns ONLY the safe, log-friendly subset of the action's arguments. The
 * wrapper never logs raw args — mirror `sanitizeGatewayError` and project to
 * booleans / enums / ids (e.g. `{ hasEmail: true }`), never raw PII such as
 * emails, names, or free text. `serverLogger` deep-redacts known sensitive keys
 * as a backstop. Return `undefined` to log no params.
 */
export type ActionDetails<TArgs extends unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | undefined;

export interface ActionWrapperOptions<TArgs extends unknown[]> {
  /** Auth depth. Defaults to `'light'`. */
  readonly auth?: AuthMode;
  /** Safe projection of args for the `action.request.details` trace line. */
  readonly details?: ActionDetails<TArgs>;
  /**
   * What to do when a `'light'`/`'full'` gate finds no session. Defaults to
   * `'redirect'` (clear any stale cookie on `'full'`, then redirect to login). Use
   * `'throw'` for AJAX/data actions that surface their own error shape and must
   * not hard-redirect mid-request.
   */
  readonly onAuthMissing?: 'redirect' | 'throw';
}

const UNAUTHENTICATED_ERROR = 'UNAUTHENTICATED';

// Mirror of gatewayWrapper's `sanitizeGatewayError`: action throws are JS Errors,
// so key off name/message. `error.stack` is deliberately never logged — it can
// embed file paths or interpolated values. The result still passes through the
// serverLogger key-name redaction.
const sanitizeActionError = (error: unknown): { errorName?: string; errorMessage?: string } => {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return { errorMessage: String((error as { message: unknown }).message) };
  }
  return {};
};

/**
 * Wraps a Next.js Server Action with request-context propagation, an optional auth
 * gate, structured lifecycle logging, duration timing, and correct re-throwing of
 * Next control-flow signals (`redirect()` / `notFound()` etc.).
 *
 * Composes `withRequestContext` internally, so wrapped actions do not import it.
 * The action body receives the auth outcome as its first argument; the returned
 * public action keeps the original `(...args) => Promise<TReturn>` signature, so
 * callers and tests are unaffected.
 *
 * @example
 * export const loginAction = actionWrapper(
 *   'loginAction',
 *   async (_auth, values: LoginFormValues) => {
 *     // ...; redirect(pageRoutes.members.dashboard);
 *   },
 *   { auth: 'none', details: (values) => ({ hasEmail: !!values.email }) },
 * );
 */
export function actionWrapper<TArgs extends unknown[], TReturn>(
  actionName: string,
  action: (auth: ActionAuth, ...args: TArgs) => Promise<TReturn>,
  options: ActionWrapperOptions<TArgs> = {},
): (...args: TArgs) => Promise<TReturn> {
  const authMode = options.auth ?? 'light';
  const onAuthMissing = options.onAuthMissing ?? 'redirect';

  const handleMissing = (): never => {
    if (onAuthMissing === 'redirect') redirect(pageRoutes.public.login);
    throw new Error(UNAUTHENTICATED_ERROR);
  };

  return async (...args: TArgs): Promise<TReturn> =>
    withRequestContext(async () => {
      const startedAt = performance.now();

      // (a) Auth gate. A missing session logs `action.auth.missing` then either
      // redirects to login or throws (per `onAuthMissing`) before the body runs.
      let auth: ActionAuth;
      if (authMode === 'none') {
        auth = { mode: 'none' };
      } else if (authMode === 'light') {
        const session = await getSession(); // cookie presence only — NO network
        if (!session) {
          serverLogger.warn(FRONTEND_LOG_EVENTS['action.auth.missing'], {
            operation: actionName,
            authMode,
          });
          return handleMissing();
        }
        auth = { mode: 'light' };
      } else {
        const session = await validateSession(); // request-cached /users/me
        if (!session) {
          serverLogger.warn(FRONTEND_LOG_EVENTS['action.auth.missing'], {
            operation: actionName,
            authMode,
          });
          await clearSessionCookie();
          return handleMissing();
        }
        auth = { mode: 'full', session, userId: session.account.userId };
      }

      const userContext = auth.mode === 'full' ? { userId: auth.userId } : {};

      // (b) Entry breadcrumb — the one info line per invocation.
      serverLogger.info(FRONTEND_LOG_EVENTS['action.request.called'], {
        operation: actionName,
        authMode,
        ...userContext,
      });

      // (c) Inbound detail (opt-in via `details`): a safe redacted projection
      // of the args plus the user id — never the raw arguments.
      if (options.details) {
        const safe = options.details(...args);
        serverLogger.trace(FRONTEND_LOG_EVENTS['action.request.details'], {
          operation: actionName,
          ...userContext,
          ...(safe && Object.keys(safe).length > 0 ? { params: safe } : {}),
        });
      }

      // (d) Run the body and bracket the outcome.
      try {
        const result = await action(auth, ...args);
        serverLogger.trace(FRONTEND_LOG_EVENTS['action.request.completed'], {
          operation: actionName,
          durationMs: Math.round(performance.now() - startedAt),
          ...userContext,
        });
        return result;
      } catch (error) {
        // CRITICAL: redirect()/notFound()/forbidden()/unauthorized() throw here on
        // the SUCCESS path. `unstable_rethrow` re-throws those control-flow signals
        // untouched so they are never logged as failures, and returns normally for
        // a genuine error — which we then log and re-throw to preserve behaviour.
        unstable_rethrow(error);

        serverLogger.error(FRONTEND_LOG_EVENTS['action.request.failed'], {
          operation: actionName,
          durationMs: Math.round(performance.now() - startedAt),
          ...userContext,
          ...sanitizeActionError(error),
        });
        throw error;
      }
    });
}
