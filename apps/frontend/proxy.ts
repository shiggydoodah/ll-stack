import { NextResponse, type NextRequest } from 'next/server';
import { createBindingToken, verifyBindingToken } from './lib/auth/binding';
import { COOKIE_NAME, COOKIE_TTL_SECONDS } from './lib/auth/constants';
import { SESSION_COOKIE_NAME } from './lib/authentication/session-constants';
import {
  CORRELATION_ID_HEADER,
  SESSION_ID_COOKIE,
  SESSION_ID_COOKIE_MAX_AGE,
  SESSION_ID_HEADER,
  generateCorrelationId,
  isValidCorrelationId,
  normalizeCorrelationId,
} from './lib/logging/correlation';
import { pageRoutes } from './lib/routes';

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

// Member pages live under /dashboard. Presence check only — Server Components
// call validateSession() for the authoritative, validated check.
const isMemberRoute = (pathname: string): boolean =>
  pathname === pageRoutes.members.dashboard ||
  pathname.startsWith(`${pageRoutes.members.dashboard}/`);

// Guest-only pages: home, login, and create-account serve signed-out visitors.
// With cacheComponents their prerendered static shells are sent before the
// (public)/(guest) layout's dynamic hole resolves, so a layout redirect always
// paints guest UI first and then visibly hops to the dashboard. The proxy
// therefore bounces a session-cookie holder BEFORE any HTML is served.
// Presence check only (mirroring isMemberRoute): the (guest) layout stays the
// authoritative, validated guard, and a stale cookie self-heals — the
// (members) layout kills the session via /logout, which clears the cookie and
// lands back on /login.
const isGuestRoute = (pathname: string): boolean =>
  pathname === pageRoutes.home ||
  pathname === pageRoutes.public.login ||
  pathname === pageRoutes.public.createAccount;

export const proxy = (request: NextRequest): NextResponse => {
  const { pathname } = request.nextUrl;

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

  // Finalize any outgoing response: persist the freshly minted session id
  // cookie and apply the security headers.
  const finalize = (response: NextResponse): NextResponse => {
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

  const forwardedHeaders = (): Headers => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set(CORRELATION_ID_HEADER, correlationId);
    requestHeaders.set(SESSION_ID_HEADER, sessionId);
    return requestHeaders;
  };

  // Navigations only: a server-action POST to a guest page (the login form
  // itself, e.g. right after another tab signed in) must still reach its
  // action — a 307 would replay the POST against the dashboard instead.
  if ((request.method === 'GET' || request.method === 'HEAD') && isGuestRoute(pathname)) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (sessionCookie && sessionCookie.value.length > 0) {
      const dashboardUrl = new URL(pageRoutes.members.dashboard, request.url);
      return finalize(NextResponse.redirect(dashboardUrl));
    }
  }

  if (isMemberRoute(pathname)) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (!sessionCookie || sessionCookie.value.length === 0) {
      const loginUrl = new URL(pageRoutes.public.login, request.url);
      return finalize(NextResponse.redirect(loginUrl));
    }

    // Session-binding cookie: a SameSite=Strict HMAC over the session token
    // (lib/auth/binding.ts), rolled on every member navigation — a CSRF /
    // session-fixation defence the lax session cookie alone does not give.
    // Invalid or missing binding forces a full revoke via /logout.
    const sessionToken = sessionCookie.value;
    const bindingCookie = request.cookies.get(COOKIE_NAME);
    if (!bindingCookie || !verifyBindingToken(sessionToken, bindingCookie.value)) {
      const logoutUrl = new URL(pageRoutes.public.logout, request.url);
      return finalize(NextResponse.redirect(logoutUrl));
    }

    const response = NextResponse.next({ request: { headers: forwardedHeaders() } });
    // Only roll the binding cookie on navigations; POST/server-action bodies
    // don't set cookies.
    if (request.method === 'GET' || request.method === 'HEAD') {
      response.cookies.set(COOKIE_NAME, createBindingToken(sessionToken), {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        path: '/',
        maxAge: COOKIE_TTL_SECONDS,
      });
    }
    return finalize(response);
  }

  return finalize(NextResponse.next({ request: { headers: forwardedHeaders() } }));
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
