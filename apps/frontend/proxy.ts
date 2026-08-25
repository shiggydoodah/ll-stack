import { NextResponse, type NextRequest } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  SESSION_ID_COOKIE,
  SESSION_ID_COOKIE_MAX_AGE,
  SESSION_ID_HEADER,
  generateCorrelationId,
  isValidCorrelationId,
  normalizeCorrelationId,
} from './lib/logging/correlation';

// React's Fizz runtime emits one BUILD-TIME inline script into every
// cacheComponents static shell — the paint-timing bookkeeping snippet
// `requestAnimationFrame(function(){$RT=performance.now()});`. Emitted at
// prerender time, it can never carry the per-request nonce, so it is admitted
// by content hash instead. If a React/Next upgrade changes the snippet the
// hash stops matching; the only effect is a benign CSP violation report for
// this one script ($RT is re-set by the nonced $RV reveal script), so drift
// is safe — re-derive the hash from a production page when it happens.
const REACT_PAINT_TIMING_SNIPPET_HASH = 'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs=';

const buildContentSecurityPolicy = (nonce: string, isProduction: boolean): string => {
  // PRODUCTION (the red line — never loosened): same-origin script files plus
  // the per-request nonce for inline scripts (and the hash above for the one
  // build-time inline snippet). No 'unsafe-inline', no 'unsafe-eval', no host
  // beyond 'self' — an injected inline script or a third-party src still has
  // no path to execute. This production value is UNCHANGED by the dev branch
  // below and is asserted byte-for-byte in proxy.test.ts.
  //
  // 'strict-dynamic' is deliberately ABSENT, and must never be added while
  // cacheComponents is on: the prerendered static shell embeds parser-inserted
  // <script src="/_next/static/…"> bootstrap tags at BUILD time, so they cannot
  // carry the per-request nonce, and 'strict-dynamic' makes browsers ignore the
  // 'self' that admits them. With it, every production page load blocked the
  // entire framework bootstrap (script-src-elem violations) — the app never
  // hydrated, and any RSC render error left the visitor on a permanently blank
  // shell because the client-side boundary recovery could not run. Verified
  // against a production build and a minimal two-variant repro.
  //
  // DEV additionally cannot nonce at all: Turbopack streams route-segment
  // chunks (e.g. loading.tsx Suspense boundaries) as parser-inserted
  // <script src> tags it does not nonce. Dev therefore mirrors style-src's
  // existing dev relaxation ('unsafe-inline' instead of the nonce) and keeps
  // 'unsafe-eval' for HMR. Dev-only; never shipped to production.
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' '${REACT_PAINT_TIMING_SNIPPET_HASH}'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    // `data:` covers inlined images (e.g. generated favicons); `blob:` covers
    // in-browser object URLs the page creates itself for image previews.
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    // Dev only: HMR injects inline styles; production requires the nonce.
    isProduction ? `style-src 'self' 'nonce-${nonce}'` : "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "form-action 'self'",
    // Production only: dev serves plain http, and Chrome exempts loopback from
    // upgrade-insecure-requests on the initial request but NOT when following
    // a redirect — so any proxy 307 had its Location upgraded to
    // https://localhost, the TLS handshake failed, and the router's RSC fetch
    // threw "Failed to fetch" before falling back to a hard navigation.
    // Production is https end-to-end, where the directive belongs.
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
};

const applySecurityHeaders = (response: NextResponse, csp: string): NextResponse => {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Everything denied: no surface uses the camera, microphone, or geolocation.
  // Loosen to `(self)` deliberately — and per capability — if a feature ever
  // needs one. The app cannot be framed (frame-ancestors 'none'), so nothing
  // here is exposed to third-party embeds either way.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
};

// Session-gated route guards (guest fast-path, member presence check, binding
// cookie verification) land here with the auth feature; until then the proxy's
// job is the security headers and the correlation/session-id plumbing.
export const proxy = (request: NextRequest): NextResponse => {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const isProduction = process.env.NODE_ENV === 'production';
  const csp = buildContentSecurityPolicy(nonce, isProduction);

  // Accept a trusted inbound correlation id (sent by client fetches) or mint a
  // fresh one for navigations/server-action POSTs, then propagate it so server
  // boundaries can read it and the gateway can forward it to the backend.
  const correlationId = normalizeCorrelationId(request.headers.get(CORRELATION_ID_HEADER));

  // Stable session/visitor id: minted once per visitor (anonymous included) and
  // shared with the browser via a client-readable cookie. Set here so it rides on
  // every subsequent request — navigations and server actions alike — without any
  // per-action threading. Rotated on login, cleared on logout.
  const existingSessionId = request.cookies.get(SESSION_ID_COOKIE)?.value;
  const sessionId = isValidCorrelationId(existingSessionId)
    ? existingSessionId
    : generateCorrelationId();
  const needsSessionCookie = sessionId !== existingSessionId;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
  requestHeaders.set(SESSION_ID_HEADER, sessionId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (needsSessionCookie) {
    response.cookies.set(SESSION_ID_COOKIE, sessionId, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_ID_COOKIE_MAX_AGE,
    });
  }

  return applySecurityHeaders(response, csp);
};

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
