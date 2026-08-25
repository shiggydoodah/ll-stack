import { z } from 'zod';

/**
 * Character length of the unpadded base64url encoding of `byteLength` random
 * bytes — what `randomBytes(byteLength).toString('base64url')` emits.
 */
export const base64TokenLength = (byteLength: number): number => Math.ceil((byteLength * 4) / 3);

const tokenError = 'Enter a valid token';

/**
 * Validator for an opaque base64url token of a fixed byte length.
 *
 * The byte length is a parameter rather than a constant because it belongs to
 * whichever feature issues the token — an email verification token and a
 * password reset token need not agree on it, and only the issuer knows what it
 * generates. This package owns the encoding rules; the caller owns the size.
 */
export const createBase64TokenSchema = (byteLength: number) =>
  z.base64url(tokenError).length(base64TokenLength(byteLength), tokenError);

export type Base64Token = z.infer<ReturnType<typeof createBase64TokenSchema>>;
