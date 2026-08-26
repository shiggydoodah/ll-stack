import 'server-only';
import {
  listSessions as listSessionsGenerated,
  loginUser as loginUserGenerated,
  logoutSession as logoutSessionGenerated,
  registerUser as registerUserGenerated,
  revokeAllSessions as revokeAllSessionsGenerated,
  rotateSession as rotateSessionGenerated,
} from '@repo/services/auth';
import type {
  ActiveSessionsResponseDto,
  ListSessionsData,
  LoginUserData,
  LogoutSessionData,
  Options,
  RegisterUserData,
  RevokeSessionsResponseDto,
} from '@repo/services/auth';
import type { ServiceResult } from '@repo/services/core';
import { buildSessionCookieHeader, gatewayWrapper } from './gateway-wrapper';

type ThrowOnError = false;

const SERVICE_NAME = 'auth gateway';

export const register = async (options: Options<RegisterUserData, ThrowOnError>) =>
  gatewayWrapper(
    (headers) =>
      registerUserGenerated(
        headers ? { ...options, headers: { ...(options.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] register`,
    { withAuth: false },
  );

// Keep generic — never reveal whether the account exists or which factor failed.
export const login = async (options: Options<LoginUserData, ThrowOnError>) =>
  gatewayWrapper(
    (headers) =>
      loginUserGenerated(
        headers ? { ...options, headers: { ...(options.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] login`,
    { withAuth: false },
  );

/**
 * How long to wait for a rotation answer before abandoning the call.
 *
 * This is the only gateway call made from middleware, which puts it ahead of
 * every render on a member navigation. `session-rotation.ts` fails open on
 * anything short of a 401, but that only covers a call that finishes: a backend
 * that accepts the connection and never answers would hang the navigation
 * itself. The abort surfaces as a 503, which is a route the caller already
 * treats as unavailable.
 *
 * Two seconds is far longer than a healthy rotation (one indexed read and one
 * small transaction) and shorter than a visitor will sit through.
 */
export const ROTATE_SESSION_TIMEOUT_MS = 2_000;

/**
 * Asks the backend whether the session behind `sessionToken` is due for
 * rotation, and takes the new token if it is.
 *
 * The session is passed in rather than read from the jar, because the only
 * caller is `proxy.ts` and middleware has no `next/headers`. That is the same
 * reason `getCurrentUserForSession` builds its own cookie header, and it is why
 * `withAuth` is false here — the cookie is already attached.
 */
export const rotateSession = async (sessionToken: string) =>
  gatewayWrapper(
    (headers) =>
      rotateSessionGenerated({
        headers: { ...buildSessionCookieHeader(sessionToken), ...(headers ?? {}) },
        signal: AbortSignal.timeout(ROTATE_SESSION_TIMEOUT_MS),
      }),
    `[${SERVICE_NAME}] rotate session`,
    { withAuth: false },
  );

/**
 * The account's live sign-ins. Uncached deliberately: the page exists to answer
 * "where am I signed in right now", and a cached answer is the one thing it must
 * not give.
 */
export const listSessions = (
  options?: Options<ListSessionsData, ThrowOnError>,
): Promise<ServiceResult<ActiveSessionsResponseDto, unknown>> =>
  gatewayWrapper(
    (headers) =>
      listSessionsGenerated(
        headers ? { ...options, headers: { ...(options?.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] list sessions`,
  );

/**
 * Ends the account's sign-ins. `keepCurrent` is explicit at every call site
 * because the backend defaults it to false — a "sign out everywhere else"
 * control that forgets it signs the visitor out too.
 */
export const revokeAllSessions = (
  keepCurrent: boolean,
): Promise<ServiceResult<RevokeSessionsResponseDto, unknown>> =>
  gatewayWrapper(
    (headers) =>
      revokeAllSessionsGenerated({ body: { keepCurrent }, ...(headers ? { headers } : {}) }),
    `[${SERVICE_NAME}] revoke sessions`,
  );

export const logout = (options?: Options<LogoutSessionData, ThrowOnError>) =>
  gatewayWrapper(
    (headers) =>
      logoutSessionGenerated(
        headers ? { ...options, headers: { ...(options?.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] logout`,
  );
