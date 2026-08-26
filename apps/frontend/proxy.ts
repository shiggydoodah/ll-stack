import { NextResponse, type NextRequest } from 'next/server';
import { readBindingState, setBindingCookies } from './lib/auth/binding-cookies';
import { getIdleTimeoutSeconds, getRotationRetrySeconds } from './lib/auth/constants';
import { logoutRedirectPath } from './lib/auth/logout-token';
import { requestSessionRotation } from './lib/auth/session-rotation';
import type { ParsedSetCookie } from './lib/authentication/set-cookie';
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

// Every member route and its descendants, read off the registry rather than
// spelled out here — a new signed-in page that this misses gets no rotation and
// no idle timeout, and nothing about it looks broken until a session outlives
// one of them. Presence check only: Server Components call validateSession()
// for the authoritative, validated check.
const isMemberRoute = (pathname: string): boolean =>
  Object.values(pageRoutes.members).some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

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

/**
 * Rewrites the session cookie inside a raw `Cookie` header, leaving every other
 * cookie byte-for-byte as it arrived.
 *
 * A rotation replaces the token mid-request, and the render this proxy is about
 * to hand off to reads the FORWARDED header, not the response's Set-Cookie. Left
 * alone it would spend the whole request on the token that was just retired —
 * which the backend still honours inside its grace window, so the page would
 * render and nothing would look wrong until the day the render outlasted the
 * window.
 *
 * IT ALSO DECIDES WHAT THE BACKEND'S `firstUsedAt` MEANS, so it is not a free
 * choice. Because the render spends the successor here, a successor this app
 * received is a successor the backend has seen used — which makes an unused one
 * proof that the rotation call itself never came back, and that is the signal
 * `recoverUndeliveredRotation` reads. The cost is that a response lost between
 * this app and the browser is indistinguishable from theft and raises
 * `auth.session.reuse_detected`; the alternative costs more, because leaving the
 * render on the retired token would reduce that signal to "the browser has not
 * come back yet". `SECURITY.md` states both.
 *
 * Re-encoding the jar from parsed values would be the obvious way to do this and
 * is the wrong one: it round-trips every unrelated cookie through a decode the
 * browser did not ask for.
 */
const rewriteSessionCookie = (rawCookieHeader: string, sessionToken: string): string =>
  rawCookieHeader
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      return trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)
        ? `${SESSION_COOKIE_NAME}=${sessionToken}`
        : trimmed;
    })
    .join('; ');

export const proxy = async (request: NextRequest): Promise<NextResponse> => {
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

  const forwardedHeaders = (rotatedSessionToken?: string): Headers => {
    const requestHeaders = new Headers(request.headers);
    if (rotatedSessionToken !== undefined) {
      requestHeaders.set(
        'cookie',
        rewriteSessionCookie(request.headers.get('cookie') ?? '', rotatedSessionToken),
      );
    }
    // Next extracts the render nonce from the REQUEST's Content-Security-Policy
    // header (the response header is never consulted during rendering), so the
    // forwarded request must carry the exact same CSP — without it, request-time
    // inline scripts are emitted un-nonced and blocked by the response policy.
    requestHeaders.set('content-security-policy', csp);
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

    // Session-binding cookies: an HMAC over the session token, held in a strict
    // cookie and a lax companion (lib/auth/constants.ts). A CSRF and
    // session-fixation defence the lax session cookie alone does not give.
    //
    // The lax cookie is accepted on safe methods only, so arriving from an
    // external link still counts as bound — under the strict cookie alone that
    // navigation carried no binding and cost the visitor their session.
    const sessionToken = sessionCookie.value;
    const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';

    // A lapsed binding is the idle timeout firing, and it signs the visitor out
    // rather than dropping them at /login: the browser is still holding a live
    // session cookie, and only /logout revokes it backend-side and clears it.
    const binding = readBindingState(request.cookies, sessionToken, {
      allowEntryCookie: isSafeMethod,
    });
    if (binding === null) {
      // 303 on a state-changing method: the default 307 replays the method and
      // body against /logout, which only exports GET and answers 405 — the
      // sign-out this redirect exists to deliver would never land. Safe methods
      // keep the default.
      const logoutUrl = new URL(logoutRedirectPath(sessionToken), request.url);
      return finalize(
        isSafeMethod ? NextResponse.redirect(logoutUrl) : NextResponse.redirect(logoutUrl, 303),
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    let token = sessionToken;
    let rotateAt = binding.rotateAt;
    let rotatedCookie: ParsedSetCookie | null = null;
    let mustWriteCookies = false;

    // ROTATION IS ASKED FOR ON SAFE METHODS ONLY, and only once the deadline
    // inside the binding token has passed — so this is roughly one extra backend
    // call per rotation interval, not one per request. A navigation's response
    // is the one the browser is certain to process; a rotation landing on
    // anything else risks the new token never reaching the jar, and a browser
    // still holding the retired one is what the reuse alarm is looking for.
    if (isSafeMethod && nowSeconds >= rotateAt) {
      const outcome = await requestSessionRotation(sessionToken);

      if (outcome.status === 'signed_out') {
        return finalize(
          NextResponse.redirect(new URL(logoutRedirectPath(sessionToken), request.url)),
        );
      }

      if (outcome.status === 'superseded') {
        // Another request rotated this token while this one was in flight, and
        // it holds the successor. WRITE NOTHING: a binding minted here would be
        // over the retired token, and arriving after the winner's response it
        // would leave the jar holding a session cookie and a binding that no
        // longer agree — which is a forced sign-out on the next request.
        //
        // That takes the idle roll below with it, deliberately. The roll writes
        // the same binding pair, so it cannot be done over a retired token
        // either. The binding ages by one request's worth for the length of the
        // window, which is nothing against `AUTH_IDLE_TIMEOUT_SECONDS`, and the
        // winner's response rolls it anyway.
        return finalize(NextResponse.next({ request: { headers: forwardedHeaders() } }));
      }

      mustWriteCookies = true;
      if (outcome.status === 'rotated') {
        rotatedCookie = outcome.cookie;
        token = outcome.cookie.value;
        rotateAt = nowSeconds + outcome.rotateInSeconds;
      } else if (outcome.status === 'not_due') {
        rotateAt = nowSeconds + outcome.rotateInSeconds;
      } else {
        // Unavailable. The session is untouched and still good; back off rather
        // than asking again on the very next request.
        rotateAt = nowSeconds + getRotationRetrySeconds();
      }
    }

    const response = NextResponse.next({
      request: { headers: forwardedHeaders(rotatedCookie === null ? undefined : token) },
    });

    if (rotatedCookie !== null) {
      response.cookies.set(SESSION_COOKIE_NAME, rotatedCookie.value, {
        httpOnly: true,
        secure: isProduction,
        sameSite: rotatedCookie.sameSite,
        path: rotatedCookie.path,
        maxAge: rotatedCookie.maxAge,
        expires: rotatedCookie.expires,
      });
    }

    // The binding roll is what makes the TTL an idle timeout rather than a fixed
    // session length, and it happens on every method — rolling on GET/HEAD alone
    // meant a long form aged out mid-edit and signed the user out on submit.
    //
    // It does NOT happen on every request. A write is worth making when there is
    // something new to record, or when the binding is far enough through its
    // life that not rolling it would start to matter. Writing on every request
    // bought nothing and widened the window in which a slow response could land
    // after a rotation and overwrite the fresh binding with a stale one.
    const idleRollDue = binding.expiresAt - nowSeconds <= getIdleTimeoutSeconds() / 2;
    if (mustWriteCookies || idleRollDue) {
      setBindingCookies(response.cookies, token, rotateAt);
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
