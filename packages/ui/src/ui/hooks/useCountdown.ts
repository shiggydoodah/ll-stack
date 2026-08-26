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

// setTimeout stores its delay as a signed 32-bit int. Anything larger wraps
// and fires almost immediately, so long waits are split into hops of at most
// this length and re-aimed at the residue on each wake.
const MAX_TIMEOUT_DELAY = 2_147_483_647;

/**
 * useCountdown
 * -----------------------------------------------------------------------------
 * A hook for rendering a countdown timer from a provided "time left" value.
 * The timer will tick down in real time, using requestAnimationFrame for smooth
 * animations. Because browsers suspend rAF in hidden tabs, the frame loop is
 * paired with a coarse timeout aimed at the expiry instant plus a
 * `visibilitychange` re-sync, so expiry is still detected while backgrounded
 * and the display catches up the moment the tab is foregrounded.
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

  // Re-seed the ticking baseline ONLY when the countdown itself restarts. Kept
  // separate from the ticking effect below so that changing `tick` mid-count
  // (e.g. `'second'` → `'frame'` when a progress fill mounts) re-subscribes the
  // loop without resetting elapsed time back to `initialRemainingMs`.
  useEffect(() => {
    basePerf.current = performance.now();
    baseRemaining.current = clampedInitial;
    lastSecondRef.current = Math.ceil(clampedInitial / 1000);
  }, [clampedInitial]);

  useEffect(() => {
    const remainingNow = () =>
      Math.max(0, baseRemaining.current - (performance.now() - basePerf.current));

    // Seeds from the committed baseline, not the prop — a `tick` change mid-count
    // resumes from the elapsed position instead of restarting.
    if (remainingNow() === 0) return;

    let raf = 0;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const commit = (next: number) => {
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
    };

    const step = () => {
      const next = remainingNow();
      commit(next);
      // Stop scheduling once expired — nothing left to animate.
      if (next > 0) {
        raf = requestAnimationFrame(step);
      }
    };

    // rAF is suspended in hidden tabs, so on its own `hasExpired` would never
    // flip while backgrounded. A coarse timeout aimed at the expiry instant is
    // throttled in the background but still fires; if the browser wakes it
    // early, re-aim at the residue.
    const onExpiryTimer = () => {
      const next = remainingNow();
      commit(next);
      if (next > 0) {
        expiryTimer = setTimeout(onExpiryTimer, Math.min(next, MAX_TIMEOUT_DELAY));
      }
    };

    // Visibility flips are another chance to catch up without waiting for a
    // frame: re-sync immediately so a tab foregrounded after the deadline
    // shows expiry at once.
    const onVisibilityChange = () => {
      commit(remainingNow());
    };

    raf = requestAnimationFrame(step);
    expiryTimer = setTimeout(onExpiryTimer, Math.min(remainingNow(), MAX_TIMEOUT_DELAY));
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
