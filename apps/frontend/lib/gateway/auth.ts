import 'server-only';
import {
  loginUser as loginUserGenerated,
  logoutSession as logoutSessionGenerated,
  registerUser as registerUserGenerated,
} from '@repo/services/auth';
import type {
  LoginUserData,
  LogoutSessionData,
  Options,
  RegisterUserData,
} from '@repo/services/auth';
import { gatewayWrapper } from './gateway-wrapper';

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

export const logout = (options?: Options<LogoutSessionData, ThrowOnError>) =>
  gatewayWrapper(
    (headers) =>
      logoutSessionGenerated(
        headers ? { ...options, headers: { ...(options?.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] logout`,
  );
