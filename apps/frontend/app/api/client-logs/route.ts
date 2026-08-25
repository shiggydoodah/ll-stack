import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeLogRecord } from '@repo/logging/shared';
import { writeServerLogRecord } from '@/lib/logging/log-emitter';
import {
  CORRELATION_ID_HEADER,
  isValidCorrelationId,
  normalizeCorrelationId,
} from '@/lib/logging/correlation';

// Browser logs land here (same-origin — CSP connect-src 'self') and are
// re-emitted through the same @repo/logging sink as backend logs. Route handlers
// run on the Node.js runtime by default (required by the sinks, which use
// process.stdout / node:stream); the runtime segment config is intentionally
// omitted because it is incompatible with `cacheComponents`.

const MAX_RECORDS = 100;
const MAX_BODY_BYTES = 64 * 1024;
const SOURCE = 'frontend-client';
const MIN_LEVEL = 10;
const MAX_LEVEL = 60;
const DEFAULT_LEVEL = 30;

const clampLevel = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(value)));
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  // Reject oversized payloads up front when the client declares a length.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const headerCorrelationId = normalizeCorrelationId(request.headers.get(CORRELATION_ID_HEADER));

  let payload: unknown;
  try {
    const raw = await request.text();
    // Re-check using byte length (not UTF-16 code units) so the cap holds for
    // multi-byte payloads and for clients that omit/spoof content-length.
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const records =
    isPlainObject(payload) && Array.isArray(payload.records) ? payload.records : undefined;
  if (!records) {
    return new NextResponse(null, { status: 400 });
  }

  for (const candidate of records.slice(0, MAX_RECORDS)) {
    if (!isPlainObject(candidate)) continue;

    // Re-run redaction server-side — never trust client-side sanitisation.
    const sanitized = sanitizeLogRecord(candidate);

    // A valid per-record correlationId links back to the browser session; fall
    // back to the request header (set by proxy.ts) otherwise.
    const correlationId = isValidCorrelationId(sanitized.correlationId as string | undefined)
      ? (sanitized.correlationId as string)
      : headerCorrelationId;

    writeServerLogRecord({
      ...sanitized,
      level: clampLevel(sanitized.level),
      // Server-authoritative fields override anything the client supplied.
      source: SOURCE,
      ingestedAt: new Date().toISOString(),
      correlationId,
      requestId: correlationId,
    });
  }

  return new NextResponse(null, { status: 204 });
};
