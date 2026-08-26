import { EXPECTED_DIGEST_PREFIX } from './expected-error';
import { isExpectedErrorCode, type ExpectedErrorCode } from './expected-error-codes';

// The single classification path every error boundary uses. Keeping it in one
// helper means "expected vs unexpected" can never drift between boundaries.

export type BoundaryErrorClassification =
  | { readonly kind: 'expected'; readonly code: ExpectedErrorCode }
  | { readonly kind: 'unexpected'; readonly digest?: string };

/**
 * Classifies a boundary error by its digest:
 *
 * - `expected:<CODE>` with a registered code → `{ kind: 'expected', code }`.
 * - `expected:<CODE>` with an UNREGISTERED code → unexpected (fail-safe: an
 *   unknown code has no copy, so the generic screen is the honest render).
 * - Anything else → unexpected, carrying the raw digest (when present) so the
 *   screen can show it as a support reference code.
 */
export const parseBoundaryError = (
  error: Error & { digest?: string },
): BoundaryErrorClassification => {
  const digest =
    typeof error.digest === 'string' && error.digest.length > 0 ? error.digest : undefined;

  if (digest !== undefined && digest.startsWith(EXPECTED_DIGEST_PREFIX)) {
    const code = digest.slice(EXPECTED_DIGEST_PREFIX.length);
    if (isExpectedErrorCode(code)) {
      return { kind: 'expected', code };
    }
    return { kind: 'unexpected', digest };
  }

  return digest === undefined ? { kind: 'unexpected' } : { kind: 'unexpected', digest };
};
