'use client';

import { useEffect, useRef, useState } from 'react';

type UseCountdownProps = {
  /**
   * How many milliseconds are left at render time
   */
  initialRemainingMs: number;
  /**
   * Total window length in ms (used for percent/progress)
   */
  durationMs: number;
  /**
   * How often state commits. `'second'` (the default) only updates at second
   * boundaries — right for `mm:ss` displays, which cannot change faster.
   * `'frame'` commits every animation frame, for continuous consumers such as
   * progress fills, where second-stepping reads as a choppy animation.
   */
  tick?: 'second' | 'frame';
};

type UseCountdownResult = {
  mmss: string;
  minutes: number;
  seconds: number;
  hasExpired: boolean;
  percentElapsed: number;
  remainingMs: number;
};

/**
 * useCountdown
 * -----------------------------------------------------------------------------
 * A hook for rendering a countdown timer from a provided "time left" value.
 * The timer will tick down in real time, using requestAnimationFrame for smooth
 * animations.
 *
 * Best practice (avoid client clock issues):
 * - Calculate `initialRemainingMs` on the **server** and pass it to the client
 * - This prevents problems if a user's device clock is wrong or changes mid-session
 *
 * Returns:
 * - `mmss`: Display string like "06:42".
 * - `hasExpired`: Has the countdown expired?
 * - `percentElapsed`: Percentage of time elapsed (0-100).
 *
 * How to use:
 * ```tsx
 * const { mmss, hasExpired, percentElapsed } = useCountdown({
 *   initialRemainingMs: 45000,
 *   durationMs: 60000,
 * });
 * ```
 */
export const useCountdown = ({
  initialRemainingMs,
  durationMs,
  tick = 'second',
}: UseCountdownProps): UseCountdownResult => {
  const clampedInitial = Math.max(0, Math.round(initialRemainingMs));
  const totalDuration = Math.max(0, Math.round(durationMs));

  const [remainingMs, setRemainingMs] = useState(clampedInitial);

  // Reset state immediately during render when the prop changes — avoids a
  // stale display gap between prop update and the next rAF tick.
  // Pattern: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevClampedInitial, setPrevClampedInitial] = useState(clampedInitial);
  if (prevClampedInitial !== clampedInitial) {
    setPrevClampedInitial(clampedInitial);
    setRemainingMs(clampedInitial);
  }

  const basePerf = useRef<number>(0);
  const baseRemaining = useRef<number>(clampedInitial);
  const lastSecondRef = useRef<number>(Math.ceil(clampedInitial / 1000));

  useEffect(() => {
    basePerf.current = performance.now();
    baseRemaining.current = clampedInitial;
    lastSecondRef.current = Math.ceil(clampedInitial / 1000);

    if (clampedInitial === 0) return;

    let raf = 0;
    const step = () => {
      const delta = performance.now() - basePerf.current;
      const next = Math.max(0, baseRemaining.current - delta);

      if (tick === 'frame') {
        setRemainingMs(next);
      } else {
        // Only update state at second boundaries — display doesn't change faster.
        const nextSecond = Math.ceil(next / 1000);
        if (nextSecond !== lastSecondRef.current || next === 0) {
          lastSecondRef.current = nextSecond;
          setRemainingMs(next);
        }
      }

      // Stop scheduling once expired — nothing left to animate.
      if (next > 0) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [clampedInitial, tick]);

  const hasExpired = remainingMs <= 0;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmss = `${mm}:${ss}`;

  const percentElapsed =
    totalDuration === 0
      ? 100
      : Math.min(100, Math.max(0, ((totalDuration - remainingMs) / totalDuration) * 100));

  return { mmss, minutes, seconds, hasExpired, percentElapsed, remainingMs };
};
