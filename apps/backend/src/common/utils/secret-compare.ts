import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time secret comparison, shared by every place this service checks
 * credential material against a configured value (`ApiSecretGuard`,
 * `AdminApiKeyGuard`, the OpenAPI docs gate).
 *
 * Both inputs are hashed to a fixed 32-byte digest first so `timingSafeEqual`
 * never sees mismatched lengths (it throws on those) and the comparison leaks
 * neither the secret's length nor how many leading characters matched.
 *
 * It lives here rather than in one guard because the backend runbook's
 * "secret comparisons MUST be constant-time; MUST NOT compare secret material
 * with `===`" rule is only enforceable if there is one obvious function to
 * reach for — the second copy of this idea was written as `providedKey !==
 * expectedKey`.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
