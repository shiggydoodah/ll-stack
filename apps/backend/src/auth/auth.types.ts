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
