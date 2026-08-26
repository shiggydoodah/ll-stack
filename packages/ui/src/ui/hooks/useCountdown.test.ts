// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useCountdown } from './useCountdown';

// MOCKS FOR requestAnimationFrame & performance.now
let mockNow = 0;
let lastframeRequestCallback: FrameRequestCallback | null = null;
let requestAnimationFrameId = 0;

const installFrameRequestMocks = () => {
  mockNow = 0;
  lastframeRequestCallback = null;
  requestAnimationFrameId = 0;

  vi.spyOn(performance, 'now').mockImplementation(() => mockNow);

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    lastframeRequestCallback = cb;
    return ++requestAnimationFrameId;
  });

  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
    lastframeRequestCallback = null;
  });
};

const advance = (ms: number) => {
  mockNow += ms;
  const cb = lastframeRequestCallback;
  lastframeRequestCallback = null; // consumed — hook must re-register for next tick
  if (cb) {
    act(() => {
      cb(mockNow);
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  installFrameRequestMocks();
});

afterEach(() => {
  vi.restoreAllMocks(); // restores performance.now spy
  vi.unstubAllGlobals(); // removes stubbed RAF/cancelRAF
  vi.useRealTimers();
});

describe('useCountdown', () => {
  test('ticks down over time and formats mm:ss correctly', () => {
    const { result, rerender } = renderHook(
      (props: { initialRemainingMs: number; durationMs: number }) => useCountdown(props),
      { initialProps: { initialRemainingMs: 60000, durationMs: 60000 } },
    );

    // Initial
    expect(result.current.mmss).toBe('01:00');
    expect(result.current.hasExpired).toBe(false);
    expect(result.current.percentElapsed).toBeCloseTo(0, 1);
    expect(result.current.remainingMs).toBeCloseTo(60_000, -1);

    // +30s
    advance(30000);
    expect(result.current.mmss).toBe('00:30');
    expect(result.current.minutes).toBe(0);
    expect(result.current.seconds).toBe(30);
    expect(result.current.percentElapsed).toBeCloseTo(50, 1);
    expect(result.current.remainingMs).toBeGreaterThanOrEqual(29_900);
    expect(result.current.remainingMs).toBeLessThanOrEqual(30_100);

    // +30s (expire)
    advance(30000);
    expect(result.current.mmss).toBe('00:00');
    expect(result.current.hasExpired).toBe(true);
    expect(result.current.percentElapsed).toBeCloseTo(100, 1);
    expect(result.current.remainingMs).toBe(0);

    // Changing duration only (no reset)
    rerender({ initialRemainingMs: 0, durationMs: 120_000 });
    expect(result.current.hasExpired).toBe(true);
    expect(result.current.percentElapsed).toBeCloseTo(100, 1);
  });

  test('clamps to zero if already expired', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 200, durationMs: 5000 }),
    );

    // Advance way beyond remaining time
    advance(10000);
    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.mmss).toBe('00:00');
    expect(result.current.percentElapsed).toBeCloseTo(100, 1);
  });

  test('resets baseline when initialRemainingMs changes', () => {
    const { result, rerender } = renderHook(
      (props: { initialRemainingMs: number; durationMs: number }) => useCountdown(props),
      { initialProps: { initialRemainingMs: 20000, durationMs: 60000 } },
    );

    // Let 5s pass
    advance(5000);
    expect(result.current.remainingMs).toBeGreaterThanOrEqual(14900);
    expect(result.current.remainingMs).toBeLessThanOrEqual(15100);

    // Server updates remaining to 30s
    rerender({ initialRemainingMs: 30000, durationMs: 60000 });
    expect(result.current.remainingMs).toBeCloseTo(30000, -1);
    expect(result.current.mmss).toBe('00:30');
    expect(result.current.hasExpired).toBe(false);

    // Keep ticking from the new baseline
    advance(10000);
    expect(result.current.mmss).toBe('00:20');
    expect(result.current.remainingMs).toBeGreaterThanOrEqual(19900);
    expect(result.current.remainingMs).toBeLessThanOrEqual(20100);
  });

  test('starts already expired when initialRemainingMs is 0', () => {
    const { result } = renderHook(() => useCountdown({ initialRemainingMs: 0, durationMs: 60000 }));

    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.mmss).toBe('00:00');
    expect(result.current.percentElapsed).toBeCloseTo(100, 1);
    expect(lastframeRequestCallback).toBeNull();
  });

  test('percentElapsed is 100 when durationMs is 0', () => {
    const { result } = renderHook(() => useCountdown({ initialRemainingMs: 5000, durationMs: 0 }));

    expect(result.current.percentElapsed).toBe(100);
  });

  test('negative initialRemainingMs clamps to 0', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: -5000, durationMs: 60000 }),
    );

    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.mmss).toBe('00:00');
    expect(lastframeRequestCallback).toBeNull();
  });

  test('state stays frozen after expiry', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 2000, durationMs: 5000 }),
    );

    advance(2000);
    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(lastframeRequestCallback).toBeNull();

    // Further advances should have no effect
    advance(5000);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.mmss).toBe('00:00');
    expect(result.current.hasExpired).toBe(true);
  });

  test('sub-second advances do not change displayed values', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 10000, durationMs: 10000 }),
    );

    expect(result.current.mmss).toBe('00:10');

    advance(400);
    expect(result.current.mmss).toBe('00:10');
    expect(result.current.minutes).toBe(0);
    expect(result.current.seconds).toBe(10);
    // The default mode commits state only at second boundaries — no re-render
    // between them, so remainingMs holds its last committed value too.
    expect(result.current.remainingMs).toBe(10000);

    advance(400);
    expect(result.current.mmss).toBe('00:10');
  });

  test("tick: 'frame' commits sub-second progress for continuous consumers", () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 10000, durationMs: 10000, tick: 'frame' }),
    );

    advance(400);
    expect(result.current.remainingMs).toBeCloseTo(9600, -1);
    expect(result.current.percentElapsed).toBeCloseTo(4, 1);
    // The display string still cannot change faster than 1Hz.
    expect(result.current.mmss).toBe('00:10');

    advance(350);
    expect(result.current.percentElapsed).toBeCloseTo(7.5, 1);

    // Expiry still clamps to zero and stops scheduling frames.
    advance(10000);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.hasExpired).toBe(true);
    expect(lastframeRequestCallback).toBeNull();
  });

  test('expires via the paired timeout while rAF is suspended (hidden tab)', () => {
    // Simulate a backgrounded tab: the clock advances and timers fire, but no
    // animation frame is ever delivered.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 3000, durationMs: 3000 }),
    );

    expect(result.current.hasExpired).toBe(false);

    act(() => {
      mockNow += 3000;
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.mmss).toBe('00:00');
  });

  test('re-aims the expiry timeout when the browser wakes it early (clock drift)', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 3000, durationMs: 3000 }),
    );

    // The timer fires on schedule but the monotonic clock says only 2.5s have
    // really passed — the countdown must not expire early.
    act(() => {
      mockNow += 2500;
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.hasExpired).toBe(false);

    // The rescheduled residue timer picks up the real expiry.
    act(() => {
      mockNow += 500;
      vi.advanceTimersByTime(500);
    });
    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
  });

  test('clamps long expiry timeouts to the 32-bit setTimeout ceiling', () => {
    // setTimeout truncates its delay to a signed 32-bit int. An unclamped
    // 30-day countdown would overflow, fire immediately, recompute the same
    // oversized delay and overflow again — a ~1ms busy loop for the lifetime
    // of the component, invisible because `tick: 'second'` suppresses renders.
    const MAX_TIMEOUT_DELAY = 2_147_483_647;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    // Only the hook schedules multi-second timers; React's internals do not.
    const longDelays = () =>
      setTimeoutSpy.mock.calls.map(([, ms]) => Number(ms)).filter((ms) => ms > 1000);

    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: thirtyDays, durationMs: thirtyDays }),
    );

    expect(longDelays()).toEqual([MAX_TIMEOUT_DELAY]);

    // The first hop lands well short of expiry — it must re-aim at the residue
    // rather than expiring or re-arming with another oversized delay.
    act(() => {
      mockNow += MAX_TIMEOUT_DELAY;
      vi.advanceTimersByTime(MAX_TIMEOUT_DELAY);
    });

    expect(result.current.hasExpired).toBe(false);
    expect(longDelays()).toEqual([MAX_TIMEOUT_DELAY, thirtyDays - MAX_TIMEOUT_DELAY]);

    // The residue hop carries the countdown to zero.
    act(() => {
      mockNow += thirtyDays - MAX_TIMEOUT_DELAY;
      vi.advanceTimersByTime(thirtyDays - MAX_TIMEOUT_DELAY);
    });

    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
  });

  test('visibilitychange re-syncs the display without waiting for a frame', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 10000, durationMs: 10000 }),
    );

    expect(result.current.mmss).toBe('00:10');

    // Background time passes with no frames; foregrounding fires visibilitychange.
    act(() => {
      mockNow += 4000;
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.mmss).toBe('00:06');
    expect(result.current.hasExpired).toBe(false);
  });

  test('visibilitychange after the deadline flips hasExpired immediately', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialRemainingMs: 2000, durationMs: 2000 }),
    );

    act(() => {
      mockNow += 5000;
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.hasExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
  });

  test("switching tick 'second' → 'frame' mid-count keeps elapsed time", () => {
    const { result, rerender } = renderHook(
      (props: { initialRemainingMs: number; durationMs: number; tick: 'second' | 'frame' }) =>
        useCountdown(props),
      { initialProps: { initialRemainingMs: 20000, durationMs: 20000, tick: 'second' } },
    );

    // 5s elapse in second mode.
    advance(5000);
    expect(result.current.mmss).toBe('00:15');

    // A continuous consumer mounts and asks for frame ticks — the countdown
    // must resume from ~15s, not reset to 20s.
    rerender({ initialRemainingMs: 20000, durationMs: 20000, tick: 'frame' });
    advance(400);
    expect(result.current.remainingMs).toBeGreaterThanOrEqual(14500);
    expect(result.current.remainingMs).toBeLessThanOrEqual(14700);
    expect(result.current.percentElapsed).toBeCloseTo(27, 0);
  });

  test('changing durationMs updates percent but does not reset ticking baseline', () => {
    const { result, rerender } = renderHook(
      (props: { initialRemainingMs: number; durationMs: number }) => useCountdown(props),
      { initialProps: { initialRemainingMs: 40000, durationMs: 80000 } },
    );

    // +20s → ~20s left; elapsed ~60/80 → 75%
    advance(20000);
    expect(result.current.mmss).toBe('00:20');
    expect(result.current.percentElapsed).toBeCloseTo(75, 1);

    // Change only total duration to 40s → elapsed still ~20s → now 50%
    rerender({ initialRemainingMs: 40000, durationMs: 40000 });
    expect(result.current.mmss).toBe('00:20');
    expect(result.current.percentElapsed).toBeCloseTo(50, 1);
  });
});
