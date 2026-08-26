/**
 * Resolves the DOM `id` a `Field`'s control renders with: an explicit `id` when
 * one is given, otherwise the deterministic, name-derived default (`input-email`).
 *
 * Shared so components that render their own control alongside `Field` (rather
 * than relying on `FieldControl` to inject the id) stay in step with `Field`'s
 * default instead of re-deriving it — a mismatch silently breaks the
 * `<label htmlFor>` association.
 */
export const resolveFieldControlId = (name: string, id?: string): string => id ?? `input-${name}`;
