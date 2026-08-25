import { v7 as uuidv7 } from 'uuid';

// Client-supplied ids (request id, session id) are echoed back and written into
// every log line, so constrain them to a safe, bounded token (UUID/trace-id
// shaped). Anything outside this — overlong values, control chars, header- or
// log-injection payloads — is rejected.
export const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const REQUEST_ID_HEADER = 'x-request-id';
// Cross-stack correlation key. The frontend will later mint and forward this on
// a dedicated header; the backend accepts/validates/logs it and falls back to
// requestId when absent. Validated with the same acceptId bounds as request id.
export const CORRELATION_ID_HEADER = 'x-correlation-id';

export function generateRequestId(): string {
  return uuidv7();
}

// Returns the trimmed value when it is a well-formed id, otherwise undefined.
export function acceptId(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && VALID_REQUEST_ID.test(trimmed) ? trimmed : undefined;
}
