// Registered catalog of expected-error codes → user-safe boundary copy.
//
// Same governance as FRONTEND_LOG_EVENTS (lib/logging/log-events.ts): a new
// code MUST be registered here in the same change that throws it. Copy follows
// the data-action-failure.ts conventions — friendly, specific enough to act
// on, and leak-free (no backend codes, endpoints, statuses, or internals) —
// because in production the thrown error's message never reaches the browser;
// this catalog is the ONLY copy source a boundary has (see
// docs/features/frontend-error-boundaries/PLAN.md).
//
// Grow it one code per genuine "the page cannot render without this" case
// (rung 5 of the error-handling ladder) — never speculatively.

export interface ExpectedErrorCopy {
  /** Boundary headline. */
  readonly title: string;
  /** Guidance body — what happened and what the member can do. */
  readonly body: string;
  /** Label for the boundary's retry button. */
  readonly recovery: string;
}

export const EXPECTED_ERROR_CODES = {
  // A page's required data could not load — the whole page is that data.
  // Currently thrown only by the dev error lab (app/dev/error-lab); the first
  // real rung-5 surface should reuse it or register its own specific code.
  PAGE_DATA_UNAVAILABLE: {
    title: "We couldn't load this page",
    body: 'This page didn’t load this time. Nothing is lost — give it another try in a moment.',
    recovery: 'Try again',
  },
} as const satisfies Record<string, ExpectedErrorCopy>;

export type ExpectedErrorCode = keyof typeof EXPECTED_ERROR_CODES;

export const isExpectedErrorCode = (value: string): value is ExpectedErrorCode =>
  Object.prototype.hasOwnProperty.call(EXPECTED_ERROR_CODES, value);
