import type { ExpectedErrorCode } from './expected-error-codes';

// The typed rung-5 throw: "this page cannot render meaningfully" (see the
// error-handling ladder in docs/features/frontend-error-boundaries/PLAN.md).
//
// Production Next.js strips a server-thrown error's message before it reaches
// the client boundary — only `digest` survives (verified against Next 16.2.10
// in the step-01 stop-gate). So the code travels in a structured digest,
// `expected:<CODE>`, and the boundary maps it back to registered copy via
// parseBoundaryError. Setting the digest client-side too keeps one uniform
// parsing path for errors thrown from client components.
//
// This module must stay importable from BOTH server and client components:
// no 'server-only', no 'use client', no React, no logging imports.

export const EXPECTED_DIGEST_PREFIX = 'expected:';

export class ExpectedError extends Error {
  readonly digest: string;

  constructor(code: ExpectedErrorCode) {
    // The message is dev-terminal convenience only — production strips it, and
    // boundaries never render it. Copy lives in EXPECTED_ERROR_CODES alone.
    super(`Expected error: ${code}`);
    this.name = 'ExpectedError';
    this.digest = `${EXPECTED_DIGEST_PREFIX}${code}`;
  }
}
