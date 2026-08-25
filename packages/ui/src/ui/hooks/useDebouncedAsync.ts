'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  data?: T;
  error?: unknown;
}

export interface UseDebouncedAsyncOptions {
  /**
   * Debounce delay in milliseconds applied before `fn` runs.
   *
   * @defaultValue `400`
   */
  delay?: number;
}

export interface UseDebouncedAsyncResult<TArg, TResult> {
  /** Current async state of the most recent settled run. */
  state: AsyncState<TResult>;
  /** Schedule `fn(arg)` to run after the debounce delay. */
  run: (arg: TArg) => void;
  /** Cancel any pending run and reset back to idle. */
  reset: () => void;
}

/**
 * Generic debounced async runner for type-ahead style lookups (username
 * availability, remote search, etc.). Not tied to any specific endpoint.
 *
 * Guards against out-of-order responses: every `run` increments a request id and
 * only the latest in-flight request is allowed to update state, so a slow earlier
 * response can never overwrite a faster later one.
 *
 * @example
 * ```tsx
 * const { state, run, reset } = useDebouncedAsync(checkUsername, { delay: 350 });
 * run(value);
 * ```
 */
export const useDebouncedAsync = <TArg, TResult>(
  fn: (arg: TArg) => Promise<TResult>,
  { delay = 400 }: UseDebouncedAsyncOptions = {},
): UseDebouncedAsyncResult<TArg, TResult> => {
  const [state, setState] = useState<AsyncState<TResult>>({ status: 'idle' });

  // Latest-ref pattern so a changing `fn` identity doesn't reset timers.
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestId = useRef(0);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    requestId.current += 1;
    setState({ status: 'idle' });
  }, []);

  const run = useCallback(
    (arg: TArg) => {
      clearTimeout(timer.current);
      const id = ++requestId.current;
      setState({ status: 'loading' });
      timer.current = setTimeout(() => {
        void (async () => {
          try {
            const data = await fnRef.current(arg);
            if (id === requestId.current) setState({ status: 'success', data });
          } catch (error) {
            if (id === requestId.current) setState({ status: 'error', error });
          }
        })();
      }, delay);
    },
    [delay],
  );

  // On unmount, clear any pending timer and bump the request id so an already
  // in-flight async resolution (which checks id === requestId.current) no-ops
  // instead of calling setState after unmount. useLayoutEffect so the cleanup
  // runs synchronously at unmount, before any pending promise can resolve.
  useLayoutEffect(
    () => () => {
      clearTimeout(timer.current);
      requestId.current += 1;
    },
    [],
  );

  return { state, run, reset };
};
