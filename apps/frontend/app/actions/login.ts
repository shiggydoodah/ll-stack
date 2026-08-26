'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { FormSubmitResult } from '@repo/ui';
import { login } from '@/lib/gateway/auth';
import {
  setSessionCookieFromUpstream,
  getSession,
  clearSessionCookie,
} from '@/lib/authentication/session-cookie';
import { ROTATE_IMMEDIATELY, setBindingCookies } from '@/lib/auth/binding-cookies';
import {
  SESSION_ID_COOKIE,
  SESSION_ID_COOKIE_MAX_AGE,
  generateCorrelationId,
} from '@/lib/logging/correlation';
import { pageRoutes } from '@/lib/routes';
import { ERROR_MESSAGES } from '@/lib/constants';
import { actionWrapper } from '@/lib/actions/action-wrapper';
import { serverLogger } from '@/lib/logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';
import { loginSchemaAction } from '../(public)/(guest)/login/loginSchema';
import type { LoginFormValues } from '../(public)/(guest)/login/loginSchema';

const API_ERROR = { ok: false, error: { api: ERROR_MESSAGES.GENERIC_ERROR_MESSAGE } } as const;

export const loginAction = actionWrapper(
  'loginAction',
  (_auth, values: LoginFormValues) => runLoginAction(values),
  { auth: 'none', details: (values) => ({ hasEmail: !!values.email }) },
);

async function runLoginAction(
  values: LoginFormValues,
): Promise<FormSubmitResult<LoginFormValues> | undefined> {
  const parsed = loginSchemaAction.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: { api: 'Invalid email or password.' } };
  }

  const { email, password } = parsed.data;

  const result = await login({ body: { email, password } });

  if (!result.ok) {
    if (result.response?.status === 429) {
      return { ok: false, error: { api: ERROR_MESSAGES.TOO_MANY_ATTEMPTS_MESSAGE } };
    }
    if (result.response && result.response.status >= 500) {
      return API_ERROR;
    }
    // Deliberately generic — never disclose whether the account exists.
    return { ok: false, error: { api: 'Invalid email or password.' } };
  }

  const setCookie = result.response?.headers.get('set-cookie');
  if (!setCookie) {
    serverLogger.error(FRONTEND_LOG_EVENTS['auth.login.session_missing'], {
      reason: 'missing_set_cookie',
    });
    return API_ERROR;
  }
  await setSessionCookieFromUpstream(setCookie);

  const sessionToken = await getSession();
  if (!sessionToken) {
    await clearSessionCookie();
    serverLogger.error(FRONTEND_LOG_EVENTS['auth.login.session_missing'], {
      reason: 'missing_session_token',
    });
    return API_ERROR;
  }

  const jar = await cookies();
  // No rotation deadline yet — the backend owns the interval and hands the next
  // one back the first time the proxy asks.
  setBindingCookies(jar, sessionToken, ROTATE_IMMEDIATELY);

  // Rotate the session/visitor id: an authenticated session is a new chapter, so
  // its logs group separately from the prior anonymous activity.
  jar.set(SESSION_ID_COOKIE, generateCorrelationId(), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_ID_COOKIE_MAX_AGE,
  });

  redirect(pageRoutes.members.dashboard);
}
