'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { FormSubmitResult } from '@repo/ui';
import { register } from '@/lib/gateway/auth';
import {
  setSessionCookieFromUpstream,
  getSession,
  clearSessionCookie,
} from '@/lib/authentication/session-cookie';
import { ROTATE_IMMEDIATELY, setBindingCookies } from '@/lib/auth/binding-cookies';
import { pageRoutes } from '@/lib/routes';
import { ERROR_MESSAGES } from '@/lib/constants';
import { actionWrapper } from '@/lib/actions/action-wrapper';
import { serverLogger } from '@/lib/logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';
import { createAccountSchema } from '../(public)/(guest)/create-account/createAccountSchema';
import type { CreateAccountFormValues } from '../(public)/(guest)/create-account/createAccountSchema';

const API_ERROR = { ok: false, error: { api: ERROR_MESSAGES.GENERIC_ERROR_MESSAGE } } as const;

export const createUserAction = actionWrapper(
  'createUserAction',
  (_auth, values: CreateAccountFormValues) => runCreateUserAction(values),
  { auth: 'none', details: (values) => ({ hasEmail: !!values.email, consent: values.consent }) },
);

async function runCreateUserAction(
  values: CreateAccountFormValues,
): Promise<FormSubmitResult<CreateAccountFormValues> | undefined> {
  const parsed = createAccountSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: { api: 'Please check the details you entered.' } };
  }

  const { name, email, password, consent } = parsed.data;

  const result = await register({ body: { name, email, password, consent } });

  if (!result.ok) {
    if (result.status === 400) {
      return { ok: false, error: { api: 'Please check your details and try again.' } };
    }
    if (result.status === 409) {
      // Deliberately vague — a precise "email taken" message would confirm the
      // address holds an account to anyone who types it in.
      return {
        ok: false,
        error: { api: "We couldn't create your account with these details. Please try again." },
      };
    }
    if (result.status === 429) {
      return { ok: false, error: { api: ERROR_MESSAGES.TOO_MANY_ATTEMPTS_MESSAGE } };
    }
    return API_ERROR;
  }

  const setCookie = result.response.headers.get('set-cookie');
  if (!setCookie) {
    serverLogger.error(FRONTEND_LOG_EVENTS['auth.register.session_missing'], {
      reason: 'missing_set_cookie',
    });
    return API_ERROR;
  }
  await setSessionCookieFromUpstream(setCookie);

  const sessionToken = await getSession();
  if (!sessionToken) {
    await clearSessionCookie();
    serverLogger.error(FRONTEND_LOG_EVENTS['auth.register.session_missing'], {
      reason: 'missing_session_token',
    });
    return API_ERROR;
  }

  // A BINDING_SECRET misconfiguration must clear the session rather than leave
  // a half-authenticated browser (the proxy would bounce it to /logout on the
  // next member navigation anyway).
  try {
    const jar = await cookies();
    setBindingCookies(jar, sessionToken, ROTATE_IMMEDIATELY);
  } catch {
    await clearSessionCookie();
    serverLogger.error(FRONTEND_LOG_EVENTS['auth.register.session_missing'], {
      reason: 'binding_cookie_failed',
    });
    return API_ERROR;
  }

  redirect(pageRoutes.members.dashboard);
}
