// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './useMediaQuery';

type ChangeListener = (event: MediaQueryListEvent) => void;

/** A controllable `MediaQueryList` mock whose `matches` value can be toggled at runtime. */
const createMatchMedia = (initial: boolean) => {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: (_: 'change', listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_: 'change', listener: ChangeListener) => listeners.delete(listener),
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
    dispatchEvent: () => true,
  };
  const setMatches = (next: boolean) => {
    mql.matches = next;
    listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
  };
  return { mql, setMatches };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('returns false when matchMedia is unavailable (SSR-safe default)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery('(hover: none)'));
    expect(result.current).toBe(false);
  });

  it('reflects the current match on mount', () => {
    const { mql } = createMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    const { result } = renderHook(() => useMediaQuery('(pointer: coarse)'));
    expect(result.current).toBe(true);
  });

  it('returns the correct value on the very first render (no wrong first frame)', () => {
    const { mql } = createMatchMedia(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

    // Record what every render observed — the old useState(false) + effect
    // implementation rendered [false, true]; the store-backed one must never
    // paint the wrong initial value.
    const observed: boolean[] = [];
    renderHook(() => {
      const matches = useMediaQuery('(pointer: coarse)');
      observed.push(matches);
      return matches;
    });

    expect(observed).toEqual([true]);
  });

  it('updates when the media query changes', () => {
    const { mql, setMatches } = createMatchMedia(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    const { result } = renderHook(() => useMediaQuery('(pointer: coarse)'));

    expect(result.current).toBe(false);
    act(() => setMatches(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const removeEventListener = vi.fn();
    const mql = {
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true,
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

    const { unmount } = renderHook(() => useMediaQuery('(pointer: coarse)'));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
