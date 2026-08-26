// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useDebouncedAsync } from './useDebouncedAsync';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedAsync', () => {
  test('calls fn only after the debounce delay and resolves to success', async () => {
    const fn = vi.fn(async (arg: string) => `ok:${arg}`);
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 200 }));

    expect(result.current.state.status).toBe('idle');

    act(() => result.current.run('a'));
    // Loading immediately, but fn not yet invoked (still within debounce window).
    expect(result.current.state.status).toBe('loading');
    expect(fn).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(199));
    expect(fn).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledExactlyOnceWith('a', expect.any(AbortSignal));
    expect(result.current.state).toMatchObject({ status: 'success', data: 'ok:a' });
  });

  test('debounces rapid runs so fn fires once with the latest arg', async () => {
    const fn = vi.fn(async (arg: string) => `ok:${arg}`);
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 200 }));

    act(() => result.current.run('a'));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.run('b'));
    act(() => vi.advanceTimersByTime(100));
    act(() => result.current.run('c'));

    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledExactlyOnceWith('c', expect.any(AbortSignal));
    expect(result.current.state).toMatchObject({ status: 'success', data: 'ok:c' });
  });

  test('suppresses stale responses so only the latest run updates state', async () => {
    const resolvers: Array<(value: string) => void> = [];
    const fn = vi.fn(
      (_arg: string) =>
        new Promise<string>((resolve) => {
          resolvers.push((value) => resolve(value));
        }),
    );
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 0 }));

    // First request fires and is in-flight.
    act(() => result.current.run('first'));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    // Second request fires and is in-flight.
    act(() => result.current.run('second'));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledTimes(2);

    // Resolve the SECOND (latest) first, then the stale first.
    await act(async () => {
      resolvers[1]?.('second-result');
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]?.('first-result');
      await Promise.resolve();
    });

    // The stale first response must not overwrite the latest.
    expect(result.current.state).toMatchObject({ status: 'success', data: 'second-result' });
  });

  test('reset cancels a pending run and returns to idle', async () => {
    const fn = vi.fn(async (arg: string) => `ok:${arg}`);
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 200 }));

    act(() => result.current.run('a'));
    expect(result.current.state.status).toBe('loading');

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(fn).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  test('captures fn rejection as an error state', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 50 }));

    act(() => result.current.run('a'));
    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = result.current.state;
    expect(state.status).toBe('error');
    // Discriminated union: only the 'error' arm carries `error`.
    if (state.status === 'error') {
      expect(state.error).toBeInstanceOf(Error);
    }
  });

  test('does not invoke fn after unmount', async () => {
    const fn = vi.fn(async (arg: string) => `ok:${arg}`);
    const { result, unmount } = renderHook(() => useDebouncedAsync(fn, { delay: 200 }));

    act(() => result.current.run('a'));
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(fn).not.toHaveBeenCalled();
  });

  test('a promise resolving after unmount does not set state (and its signal is aborted)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveRun: ((value: string) => void) | undefined;
    const signals: AbortSignal[] = [];
    const fn = vi.fn((_arg: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string>((resolve) => {
        resolveRun = resolve;
      });
    });
    const { result, unmount } = renderHook(() => useDebouncedAsync(fn, { delay: 100 }));

    act(() => result.current.run('a'));
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(false);

    unmount();
    // Unmount aborts the in-flight run so callers wired into fetch cancel.
    expect(signals[0]?.aborted).toBe(true);

    // Resolving afterwards must be a silent no-op — no setState, no React
    // "update on unmounted component" noise.
    await act(async () => {
      resolveRun?.('late');
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('superseding a run aborts the previous signal; the latest wins', async () => {
    const signals: AbortSignal[] = [];
    const fn = vi.fn(async (arg: string, signal: AbortSignal) => {
      signals.push(signal);
      return `ok:${arg}`;
    });
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 0 }));

    // First run fires and is in-flight.
    act(() => result.current.run('first'));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(signals[0]?.aborted).toBe(false);

    // Superseding run aborts the first controller immediately.
    act(() => result.current.run('second'));
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(signals[1]?.aborted).toBe(false);
    expect(result.current.state).toMatchObject({ status: 'success', data: 'ok:second' });
  });

  test('reset aborts an in-flight run', async () => {
    const signals: AbortSignal[] = [];
    const fn = vi.fn(
      (_arg: string, signal: AbortSignal) =>
        new Promise<string>(() => {
          signals.push(signal);
        }),
    );
    const { result } = renderHook(() => useDebouncedAsync(fn, { delay: 0 }));

    act(() => result.current.run('a'));
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(signals[0]?.aborted).toBe(false);

    act(() => result.current.reset());
    expect(signals[0]?.aborted).toBe(true);
    expect(result.current.state.status).toBe('idle');
  });
});
