// Extracts the backend's stable error code from a gateway failure payload
// (the uniform `{ statusCode, error, message, … }` envelope the
// HttpExceptionFilter emits). Promoted from ~10 identical inline copies
// (kill-switches epic frontend/01). Plain module — no 'server-only' — so both
// server actions/pages and vitest can import it.
export const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'error' in error
    ? String((error as { error: unknown }).error)
    : undefined;
