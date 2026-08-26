import 'server-only';
import { rotateSession } from '../gateway/auth';
import { errorCode } from '../gateway/error-code';
import { readSessionSetCookie, type ParsedSetCookie } from '../authentication/set-cookie';
import { serverLogger } from '../logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '../logging/log-events';

/**
 * What the proxy should do with the result. The three the backend can answer
 * with, plus the two the call itself can produce.
 *
 * `superseded` is the one worth reading twice: the presented token has already
 * been rotated away by a request that overlapped this one, and the browser
 * either holds the successor or is about to. Writing any cookie on this outcome
 * would overwrite the winner's with a value the session no longer answers to,
 * so it carries nothing to write.
 */
export type RotationOutcome =
  | {
      readonly status: 'rotated';
      readonly cookie: ParsedSetCookie;
      readonly rotateInSeconds: number;
    }
  | { readonly status: 'not_due'; readonly rotateInSeconds: number }
  | { readonly status: 'superseded' }
  | { readonly status: 'signed_out' }
  | { readonly status: 'unavailable' };

/**
 * The backend's `SESSION_INVALID` code, as it appears in the `error` field of an
 * `ApiErrorResponseDto`. The one answer that means the session is over.
 */
const SESSION_INVALID_CODE = 'SESSION_INVALID';

/**
 * Asks the backend to rotate the token behind `sessionToken`.
 *
 * FAILS OPEN, DELIBERATELY. Only the backend saying this session is finished
 * signs anyone out: a rotation that could not happen is a missed improvement,
 * while a rotation that signs people out on a network blip is worse than never
 * having rotated at all.
 *
 * A BARE 401 IS NOT THAT ANSWER ON THIS ROUTE. `/auth/session/rotate` sits
 * behind the global `ApiSecretGuard` as well as its own cookie check, so a
 * `BACKEND_API_SECRET` that is present but wrong answers 401 to every call.
 * Read as a sign-out, that marches every signed-in visitor through `/logout`,
 * revoking their sessions on the way, and fixing the secret brings none of them
 * back. The error code separates the two: the guard's refusal carries
 * `Unauthorized`, a refused session carries `SESSION_INVALID`.
 *
 * A call that hangs counts as unavailable too, which is why the gateway caps
 * this one at `ROTATE_SESSION_TIMEOUT_MS`. It runs in middleware, ahead of the
 * render, so an unbounded wait would hold the navigation open instead of failing
 * open.
 */
export async function requestSessionRotation(sessionToken: string): Promise<RotationOutcome> {
  let result: Awaited<ReturnType<typeof rotateSession>>;
  try {
    result = await rotateSession(sessionToken);
  } catch (error) {
    serverLogger.warn(FRONTEND_LOG_EVENTS['auth.session.rotation_failed'], {
      reason: 'request_failed',
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: 'unavailable' };
  }

  if (!result.ok) {
    // 401 + SESSION_INVALID is the backend refusing the session itself: expired,
    // revoked, or a retired token presented late enough that its whole family
    // has just been revoked.
    if (result.status === 401 && errorCode(result.error) === SESSION_INVALID_CODE) {
      return { status: 'signed_out' };
    }
    serverLogger.warn(FRONTEND_LOG_EVENTS['auth.session.rotation_failed'], {
      reason: 'unexpected_status',
      status: result.status,
      // `Unauthorized` on a guard refusal against `SESSION_INVALID` on a real
      // one, so a mis-set BACKEND_API_SECRET is one grep away rather than an
      // unexplained 401.
      errorCode: errorCode(result.error) ?? 'none',
    });
    return { status: 'unavailable' };
  }

  const body = result.data;
  if (body === undefined) {
    serverLogger.warn(FRONTEND_LOG_EVENTS['auth.session.rotation_failed'], {
      reason: 'missing_body',
    });
    return { status: 'unavailable' };
  }

  if (body.status === 'superseded') {
    return { status: 'superseded' };
  }

  if (body.status === 'not_due') {
    return { status: 'not_due', rotateInSeconds: body.nextRotationInSeconds };
  }

  const cookie = readSessionSetCookie(result.response?.headers.get('set-cookie') ?? undefined);
  if (cookie === null) {
    // A rotation whose token never arrived: the backend has retired the old one
    // and this app cannot store the new one. Treat it as unavailable so the
    // session survives on the grace window rather than being signed out here.
    serverLogger.error(FRONTEND_LOG_EVENTS['auth.session.rotation_failed'], {
      reason: 'missing_set_cookie',
    });
    return { status: 'unavailable' };
  }

  serverLogger.info(FRONTEND_LOG_EVENTS['auth.session.rotated'], {
    rotateInSeconds: body.nextRotationInSeconds,
  });

  return { status: 'rotated', cookie, rotateInSeconds: body.nextRotationInSeconds };
}
