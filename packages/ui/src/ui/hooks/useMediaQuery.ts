'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Server (and hydration) snapshot: no `window`, so nothing can match. */
const getServerSnapshot = (): boolean => false;

/**
 * Subscribe to a CSS media query and track whether it currently matches.
 *
 * Built on `useSyncExternalStore` rather than `useState` + effect: the snapshot
 * is read synchronously during render, so a pure client render shows the
 * correct value on its very first frame instead of a guaranteed-wrong `false`
 * that only corrects after mount. The server snapshot is pinned to `false`
 * (there is no `window` to ask), which keeps SSR output and the hydration
 * render identical; the client then syncs to the real value immediately after
 * hydration and on every subsequent `change`.
 *
 * Environments without `matchMedia` fall back to `false` and never throw.
 *
 * @param query - A media query string, e.g. `'(hover: none), (pointer: coarse)'`.
 * @returns Whether the query currently matches.
 *
 * @example
 * ```tsx
 * const isCoarsePointer = useMediaQuery('(hover: none), (pointer: coarse)');
 * ```
 */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
