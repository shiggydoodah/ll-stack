'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Discriminated async state: narrowing on `status` narrows the payload, so
 * `state.status === 'success'` gives `data: T` (not `T | undefined`) and
 * `'error'` is the only arm carrying `error`.
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: unknown };

export type AsyncStatus = AsyncState<unknown>['status'];

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
  /** Schedule `fn(arg, signal)` to run after the debounce delay. */
  run: (arg: TArg) => void;
  /** Cancel any pending run, abort any in-flight one, and reset back to idle. */
  reset: () => void;
}

/**
 * Generic debounced async runner for type-ahead style lookups (username
 * availability, remote search, etc.). Not tied to any specific endpoint.
 *
 * Guards against out-of-order responses two ways:
 * - every `run` increments a request id and only the latest in-flight request
 *   is allowed to update state, so a slow earlier response can never overwrite
 *   a faster later one;
 * - each run gets an `AbortSignal` (passed as `fn`'s second argument) that is
 *   aborted when a newer `run` supersedes it, on `reset`, and on unmount — wire
 *   it into `fetch` so superseded requests stop costing network, not just
 *   state.
 *
 * @example
 * ```tsx
 * const { state, run, reset } = useDebouncedAsync(
 *   (username: string, signal) => fetch(`/check?u=${username}`, { signal }),
 *   { delay: 350 },
 * );
 * run(value);
 * ```
 */
export const useDebouncedAsync = <TArg, TResult>(
  fn: (arg: TArg, signal: AbortSignal) => Promise<TResult>,
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
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestId.current += 1;
    setState({ status: 'idle' });
  }, []);

  const run = useCallback(
    (arg: TArg) => {
      clearTimeout(timer.current);
      // Abort the superseded run before its id goes stale, so an in-flight
      // fetch stops rather than resolving into the id guard's discard path.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const id = ++requestId.current;
      setState({ status: 'loading' });
      timer.current = setTimeout(() => {
        void (async () => {
          try {
            const data = await fnRef.current(arg, controller.signal);
            if (id === requestId.current) setState({ status: 'success', data });
          } catch (error) {
            if (id === requestId.current) setState({ status: 'error', error });
          }
        })();
      }, delay);
    },
    [delay],
  );

  // On unmount, clear any pending timer, abort any in-flight run, and bump the
  // request id so an already in-flight async resolution (which checks
  // id === requestId.current) no-ops instead of calling setState after unmount.
  // useLayoutEffect so the cleanup runs synchronously at unmount, before any
  // pending promise can resolve.
  useLayoutEffect(
    () => () => {
      clearTimeout(timer.current);
      controllerRef.current?.abort();
      requestId.current += 1;
    },
    [],
  );

  return { state, run, reset };
};
