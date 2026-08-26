// Auth domain failures. Codes are a closed string-literal union (never a TS
// enum) and the controller maps them exhaustively to HTTP statuses — see
// `toAuthHttpException` in auth.controller.ts.

export const AUTH_ERROR_CODES = [
  // Registration was submitted without the required terms/privacy consent.
  'CONSENT_REQUIRED',
  // Login rejected. Deliberately covers BOTH unknown email and wrong password
  // so the response can never confirm whether an account exists.
  'INVALID_CREDENTIALS',
  // Registration email already belongs to a live account.
  'EMAIL_ALREADY_REGISTERED',
  // A server-side composition referenced a user that no longer resolves.
  'ACCOUNT_NOT_FOUND',
  // The presented session cookie no longer resolves to an active session.
  'SESSION_INVALID',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * The single typed error every auth operation throws on a domain failure.
 * Carries a stable `code`; the message is for operators and must never embed
 * secrets, tokens, or full email addresses.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
    this.code = code;
  }
}
