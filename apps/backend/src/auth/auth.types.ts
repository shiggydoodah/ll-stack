import type { UserRole } from '@prisma/client';

declare const userIdBrand: unique symbol;
declare const sessionTokenBrand: unique symbol;

/** Opaque user identifier (backed by the `User` model). */
export type UserId = string & { readonly [userIdBrand]: true };

/** Opaque session bearer token. Never logged; never the raw DB row id. */
export type SessionToken = string & { readonly [sessionTokenBrand]: true };

/** Public account projection returned by auth operations. Excludes hashes. */
export interface Account {
  readonly userId: UserId;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly createdAt: Date;
}

/**
 * Opaque, revocable session metadata (backed by the `Session` model, which
 * persists only a `tokenHash`). Does not carry the raw bearer token.
 */
export interface Session {
  readonly sessionId: string;
  readonly userId: UserId;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

/**
 * One-time issuance result of `login`/`register`. `token` is the raw bearer
 * token, surfaced exactly once here; thereafter only its hash is persisted and
 * only `Session` metadata is returned by `getSession`.
 */
export interface SessionIssued {
  readonly session: Session;
  readonly token: SessionToken;
}

/**
 * Why a family of session tokens was revoked in one go. Logged as a facet on
 * `auth.session.family_revoked`, so it stays a closed set rather than free text.
 */
export type SessionRevocationReason = 'logout' | 'token_reuse';

/**
 * One live sign-in, as the account UI sees it.
 *
 * `sessionId` IS THE FAMILY KEY, NOT A ROW ID. A `sessions` row is one token,
 * so a browser signed in for a week holds a hundred-odd of them; the thing a
 * person recognises and wants to end is the whole lineage. It stays stable for
 * the life of the sign-in, which a row id would not.
 *
 * `lastSeenAt` is when the sign-in's CURRENT token was first presented, so it
 * is accurate to within one `AUTH_SESSION_ROTATE_AFTER_SECONDS`: an active
 * browser shows a time inside the last interval rather than seconds ago. Null
 * means the token has been minted and never used, which is a rotation whose
 * answer is still in flight.
 *
 * There is no device, location, or user-agent field. Storing them is a product
 * decision with a privacy cost attached, and this template does not make it for
 * you.
 */
export interface ActiveSession {
  readonly sessionId: string;
  readonly startedAt: Date;
  readonly lastSeenAt: Date | null;
  readonly expiresAt: Date;
  /** Whether this is the sign-in that made the request. */
  readonly current: boolean;
}

/**
 * A page of {@link ActiveSession}s. `truncated` says the account holds more live
 * sign-ins than the listing returns, so a caller never presents a partial list
 * as a complete one.
 */
export interface ActiveSessionList {
  readonly sessions: readonly ActiveSession[];
  readonly truncated: boolean;
}

/**
 * Outcome of asking the backend to rotate the token behind a session cookie.
 *
 * - `rotated` — a successor was issued. `issued.token` is the new bearer token,
 *   surfaced exactly once, and the caller MUST write it back to the browser.
 * - `not_due` — the token is still current and has not reached its rotation
 *   interval. Nothing changed.
 * - `superseded` — the presented token has already been retired, and it is
 *   still inside the grace window. Another request won the rotation and holds
 *   the successor, so the caller MUST NOT write any cookie: doing so would
 *   overwrite the winner's with a value that no longer matches the session.
 *   A session revoked mid-rotation is NOT this — it is `invalid`, because a
 *   caller told to carry on renders a page whose every backend call then 401s.
 * - `invalid` — the token resolves to nothing usable: expired, revoked (here or
 *   in another tab), or owned by a deleted account. It also covers a retired
 *   token presented outside the grace window while a successor was in use,
 *   which has revoked the whole family by the time this is returned.
 *
 * `nextRotationInSeconds` is how long until this session is next eligible, so a
 * caller can schedule its next ask instead of polling.
 */
export type SessionRotation =
  | {
      readonly status: 'rotated';
      readonly issued: SessionIssued;
      readonly nextRotationInSeconds: number;
    }
  | { readonly status: 'not_due'; readonly nextRotationInSeconds: number }
  | { readonly status: 'superseded'; readonly nextRotationInSeconds: number }
  | { readonly status: 'invalid' };

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  /** Explicit terms/privacy consent — registration refuses anything but `true`. */
  readonly consent: boolean;
}

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}
