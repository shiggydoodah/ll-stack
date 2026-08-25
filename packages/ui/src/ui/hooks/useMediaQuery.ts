'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and track whether it currently matches.
 *
 * SSR-safe: returns `false` during server render and the first client paint (no
 * access to `window`/`matchMedia` while rendering, so it never throws under
 * `renderToStaticMarkup` or in environments without `matchMedia`), then syncs to
 * the real value on mount and on every subsequent `change`.
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
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);

    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
};
