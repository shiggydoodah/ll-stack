import { useSelector } from '@tanstack/react-form';

import { useFormContext } from './createAppForm';
import type { DeepKeys, DeepValue } from './types';

const pathSegmentPattern = /(^\[)|]|\[/g;
const integerSegmentPattern = /^\d+$/;

// Supports TanStack-style dot and numeric bracket paths: "user.email", "items[0].name".
// It intentionally does not parse quoted brackets, escaped characters, or keys containing dots.
export const toPathSegments = (path: string) =>
  path
    .replace(pathSegmentPattern, (match) => (match === '[' ? '.' : ''))
    .split('.')
    .filter(Boolean)
    .map((segment) => (integerSegmentPattern.test(segment) ? Number(segment) : segment));

const readProperty = (value: unknown, key: string | number): unknown => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== 'object' && typeof value !== 'function') {
    return undefined;
  }

  return Reflect.get(value, key);
};

const getByPath = <TValues, TPath extends DeepKeys<TValues>>(
  values: unknown,
  path: TPath,
): DeepValue<TValues, TPath> => {
  const value = toPathSegments(String(path)).reduce<unknown>(readProperty, values);

  return value as DeepValue<TValues, TPath>;
};

export const useFormValue = <TValues, TPath extends DeepKeys<TValues>>(
  path: TPath,
): DeepValue<TValues, TPath> => {
  const form = useFormContext();

  return useSelector(form.store, (state) => getByPath<TValues, TPath>(state.values, path));
};
