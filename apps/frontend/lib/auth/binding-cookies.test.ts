// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { createBindingToken } from './binding';
import {
  ROTATE_IMMEDIATELY,
  clearBindingCookies,
  readBindingState,
  setBindingCookies,
} from './binding-cookies';
import { COOKIE_NAME, DEFAULT_IDLE_TIMEOUT_SECONDS, ENTRY_COOKIE_NAME } from './constants';

const SESSION = 'some-session-token';
const ROTATE_AT = 1_800_000_000;

interface SetCall {
  name: string;
  value: string;
  options: { sameSite: string; httpOnly: boolean; secure: boolean; path: string; maxAge: number };
}

function makeWriter() {
  const calls: SetCall[] = [];
  return {
    calls,
    set: (name: string, value: string, options: SetCall['options']) => {
      calls.push({ name, value, options });
    },
  };
}

function makeReader(jar: Record<string, string>) {
  return { get: (name: string) => (name in jar ? { value: jar[name]! } : undefined) };
}

beforeEach(() => {
  vi.stubEnv('BINDING_SECRET', 'test-binding-secret-that-is-at-least-32-chars');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('setBindingCookies', () => {
  it('writes the same token to a strict cookie and a lax entry cookie', () => {
    const jar = makeWriter();

    setBindingCookies(jar, SESSION, ROTATE_AT);

    expect(jar.calls.map((c) => c.name)).toEqual([COOKIE_NAME, ENTRY_COOKIE_NAME]);
    expect(jar.calls[0]!.value).toBe(jar.calls[1]!.value);
    expect(jar.calls[0]!.options.sameSite).toBe('strict');
    expect(jar.calls[1]!.options.sameSite).toBe('lax');
  });

  it('keeps both cookies httpOnly and path-scoped to the whole app', () => {
    const jar = makeWriter();

    setBindingCookies(jar, SESSION, ROTATE_AT);

    for (const call of jar.calls) {
      expect(call.options.httpOnly).toBe(true);
      expect(call.options.path).toBe('/');
    }
  });

  it('defaults both maxAge values to the shipped idle timeout', () => {
    const jar = makeWriter();

    setBindingCookies(jar, SESSION, ROTATE_AT);

    for (const call of jar.calls) {
      expect(call.options.maxAge).toBe(DEFAULT_IDLE_TIMEOUT_SECONDS);
    }
  });

  it('honours AUTH_IDLE_TIMEOUT_SECONDS for the cookie maxAge and the token expiry', () => {
    vi.stubEnv('AUTH_IDLE_TIMEOUT_SECONDS', '900');
    const jar = makeWriter();
    const before = Math.floor(Date.now() / 1000);

    setBindingCookies(jar, SESSION, ROTATE_AT);

    expect(jar.calls[0]!.options.maxAge).toBe(900);
    // The cookie lifetime and the expiry inside the token are one decision —
    // a browser-side maxAge alone would be trivially outlived by an edited jar.
    const expiry = parseInt(jar.calls[0]!.value.split('.')[1]!, 10);
    expect(expiry).toBeGreaterThanOrEqual(before + 900);
    expect(expiry).toBeLessThanOrEqual(before + 901);
  });

  it('marks both cookies secure in production only', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const jar = makeWriter();

    setBindingCookies(jar, SESSION, ROTATE_AT);

    expect(jar.calls.every((c) => c.options.secure)).toBe(true);
  });

  it('throws rather than writing an unsigned cookie when BINDING_SECRET is missing', () => {
    vi.stubEnv('BINDING_SECRET', '');
    const jar = makeWriter();

    expect(() => setBindingCookies(jar, SESSION, ROTATE_AT)).toThrow(/BINDING_SECRET/);
    expect(jar.calls).toEqual([]);
  });
});

describe('clearBindingCookies', () => {
  it('deletes both cookies at the root path', () => {
    const deleted: { name: string; path: string }[] = [];

    clearBindingCookies({ delete: (options) => deleted.push(options) });

    expect(deleted).toEqual([
      { name: COOKIE_NAME, path: '/' },
      { name: ENTRY_COOKIE_NAME, path: '/' },
    ]);
  });
});

describe('readBindingState', () => {
  it('accepts a valid strict cookie on any method', () => {
    const jar = makeReader({ [COOKIE_NAME]: createBindingToken(SESSION, ROTATE_AT) });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: false })).not.toBeNull();
  });

  it('accepts the lax entry cookie alone when the entry cookie is allowed', () => {
    // Arriving from an external link: SameSite=Strict withholds the primary
    // cookie on a cross-site navigation, so only the lax companion is sent.
    const jar = makeReader({ [ENTRY_COOKIE_NAME]: createBindingToken(SESSION, ROTATE_AT) });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: true })).not.toBeNull();
  });

  it('refuses the lax entry cookie alone when the entry cookie is not allowed', () => {
    const jar = makeReader({ [ENTRY_COOKIE_NAME]: createBindingToken(SESSION, ROTATE_AT) });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: false })).toBeNull();
  });

  it('refuses a request carrying neither cookie', () => {
    expect(readBindingState(makeReader({}), SESSION, { allowEntryCookie: true })).toBeNull();
  });

  it('refuses a token minted for a different session', () => {
    const token = createBindingToken('another-session-token', ROTATE_AT);
    const jar = makeReader({ [COOKIE_NAME]: token, [ENTRY_COOKIE_NAME]: token });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: true })).toBeNull();
  });

  it('refuses a forged token', () => {
    const forged = `${'A'.repeat(43)}.${Math.floor(Date.now() / 1000) + 600}.${ROTATE_AT}`;
    const jar = makeReader({ [COOKIE_NAME]: forged, [ENTRY_COOKIE_NAME]: forged });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: true })).toBeNull();
  });

  it('falls through to the entry cookie when the strict cookie is present but bad', () => {
    const jar = makeReader({
      [COOKIE_NAME]: 'garbage',
      [ENTRY_COOKIE_NAME]: createBindingToken(SESSION, ROTATE_AT),
    });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: true })).not.toBeNull();
  });

  it('hands back the rotation deadline the token was minted with', () => {
    // The proxy schedules its next backend call against this, which is what
    // keeps rotation to roughly one extra call per interval.
    const jar = makeReader({ [COOKIE_NAME]: createBindingToken(SESSION, ROTATE_AT) });

    expect(readBindingState(jar, SESSION, { allowEntryCookie: false })?.rotateAt).toBe(ROTATE_AT);
  });

  it('reads ROTATE_IMMEDIATELY back as a deadline already passed', () => {
    // What a freshly signed-in browser carries: this app is never told the
    // backend's rotation interval, so the first member request asks.
    const jar = makeReader({ [COOKIE_NAME]: createBindingToken(SESSION, ROTATE_IMMEDIATELY) });

    const state = readBindingState(jar, SESSION, { allowEntryCookie: false });
    expect(state?.rotateAt).toBe(0);
    expect(Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(state!.rotateAt);
  });

  it('refuses both cookies once the idle timeout has elapsed', () => {
    vi.stubEnv('AUTH_IDLE_TIMEOUT_SECONDS', '1');
    const token = createBindingToken(SESSION, ROTATE_AT);
    const jar = makeReader({ [COOKIE_NAME]: token, [ENTRY_COOKIE_NAME]: token });

    // Both cookies carry one expiry, so the pair lapses together — the idle
    // timeout cannot be sidestepped by arriving on a navigation.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 5_000));
    try {
      expect(readBindingState(jar, SESSION, { allowEntryCookie: true })).toBeNull();
      expect(readBindingState(jar, SESSION, { allowEntryCookie: false })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
