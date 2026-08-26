import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { getCurrentUser as getCurrentUserGenerated } from '@repo/services/users';
import type { AccountDto, GetCurrentUserData, Options } from '@repo/services/users';
import { getSession } from '../authentication/session-cookie';
import { buildSessionCookieHeader, gatewayWrapper } from './gateway-wrapper';
import { errorCode } from './error-code';
import { cacheLifeProfiles } from '../cache/life';
import { cacheTags } from '../cache/tags';
import { withSessionCache } from '../cache/utils';
import { serverLogger } from '../logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '../logging/log-events';

type ThrowOnError = false;
type HeadersOption = { headers?: Record<string, string> };
type GetCurrentUserOptions = Options<GetCurrentUserData, ThrowOnError> & HeadersOption;
type SessionCurrentUserOptions = Omit<GetCurrentUserOptions, 'headers'>;

const SERVICE_NAME = 'users gateway';

// Shared result handler for both the live and cached fetch paths.
const parseCurrentUser = (
  result: Awaited<ReturnType<typeof gatewayWrapper<{ account?: AccountDto }, unknown>>>,
): AccountDto | null => {
  // ONLY the backend's own refusal of the session reads as "signed out" — the
  // same rule `session-rotation.ts` holds, because callers turn null into a
  // `/logout` redirect that clears the jar and revokes the family. A 5xx, a
  // 429, or a bare 401 (a wrong `x-api-secret` answers that way) is thrown
  // instead: the render fails to the error boundary and the session survives
  // the outage.
  if (!result.ok) {
    if (result.status === 401 && errorCode(result.error) === 'SESSION_INVALID') return null;
    throw new Error(`[${SERVICE_NAME}] current user unavailable (status ${result.status})`);
  }
  if (!result.data?.account) {
    serverLogger.warn(FRONTEND_LOG_EVENTS['user.current.account_missing'], {
      operation: SERVICE_NAME,
    });
    return null;
  }
  return result.data.account;
};

// Fetches the current user with an explicit session — safe to call from a
// `'use cache'` context because withAuth:false avoids request-scoped APIs.
// Correlation headers are forwarded when available (non-cached path).
const getCurrentUserForSessionValue = async (
  session: string,
  options?: SessionCurrentUserOptions,
): Promise<AccountDto | null> => {
  const sessionHeaders = buildSessionCookieHeader(session);
  const result = await gatewayWrapper(
    (correlationHeaders) =>
      getCurrentUserGenerated({
        ...options,
        headers: { ...sessionHeaders, ...(correlationHeaders ?? {}) },
      }),
    `[${SERVICE_NAME}] get current user`,
    { withAuth: false },
  );
  return parseCurrentUser(result);
};

export const getCurrentUserForSession = async (
  options?: SessionCurrentUserOptions,
): Promise<AccountDto | null> => {
  const session = await getSession();
  if (!session) return null;
  return getCurrentUserForSessionValue(session, options);
};

// The *display* read: cached per user with a medium TTL. Auth checks never
// come from here — validateSession uses the uncached read with `no-store`.
const fetchCurrentUser = async (
  userId: string,
  session: string,
): Promise<Awaited<ReturnType<typeof getCurrentUserForSessionValue>>> => {
  'use cache';
  cacheLife(cacheLifeProfiles.medium);
  cacheTag(cacheTags.currentUser(userId));

  return getCurrentUserForSessionValue(session);
};

export const getCurrentUserCached = withSessionCache(fetchCurrentUser);
