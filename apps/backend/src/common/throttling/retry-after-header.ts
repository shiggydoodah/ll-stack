/**
 * The `Retry-After` header as OpenAPI describes it on a 429 — the documentation
 * half of what `AppThrottlerGuard` and every named guard extending it actually
 * set (`common/guards/app-throttler.guard.ts`, `res.setHeader('Retry-After', …)`).
 *
 * It lives here rather than beside one of its callers so the wording cannot
 * drift into byte-identical private copies. Any route whose throttler stamps
 * the header documents it from this constant.
 */
export const RETRY_AFTER_HEADER = {
  'Retry-After': {
    description: 'Seconds to wait before retrying.',
    schema: { type: 'integer' },
  },
} as const;
