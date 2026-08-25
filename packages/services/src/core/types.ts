// ThrowOnError = false: errors are returned in the response, never thrown
export type ThrowOnError = false;

// ServiceFunction<T> marks a function as a manually-written service layer wrapper
export type ServiceFunction<T extends (...args: never[]) => unknown> = T;

// WithRequiredParameters<Fn, K> makes K required in the options of a service function.
// Use when a generated function has optional params that the service layer must require.
export type WithRequiredParameters<
  Fn extends (options: Record<string, unknown>) => unknown,
  K extends keyof NonNullable<Parameters<Fn>[0]>,
> = (
  options: Omit<NonNullable<Parameters<Fn>[0]>, K> &
    Required<Pick<NonNullable<Parameters<Fn>[0]>, K>>,
) => ReturnType<Fn>;
