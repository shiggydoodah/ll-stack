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
