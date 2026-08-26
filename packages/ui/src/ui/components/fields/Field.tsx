'use client';

import {
  useCallback,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from 'react';

import { cn } from '../../../lib/cn';
import {
  FieldContextProvider,
  type FieldContextValue,
  type FieldLabelAssociation,
} from './FieldContext';
import { resolveFieldControlId } from './fieldControlId';

// One shared rhythm for every field shell — wrappers must not re-space children
// with their own gap/space utilities (that is how per-field drift crept in).
const fieldSpacingClass = 'space-y-2';

export interface FieldProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'id'> {
  children: ReactNode;
  disabled?: boolean;
  /**
   * Overrides the control id. Defaults to `input-${name}` so a label and its
   * control are always associated and the id is debuggable.
   *
   * Because the default id is deterministic, `name` must be unique across the whole
   * page — not just within one form. Two `Field`s sharing a `name` on the same page
   * (a modal form over a page form, a repeated create/edit pair) would emit duplicate
   * DOM ids, so `<label htmlFor>` would focus the wrong control and
   * `aria-labelledby`/`aria-describedby` would resolve to the first match. Pass an
   * explicit `id` to disambiguate wherever a field `name` can repeat on a page.
   */
  id?: string;
  invalid?: boolean;
  /**
   * How the label associates with the control. `'for'` (default) wires
   * `<label htmlFor>` to the control's `id` — correct for native labelable
   * elements (input/select/textarea). `'labelledby'` wires the control's
   * `aria-labelledby` to the label instead — use it for composite widgets
   * (combobox, slider) whose focusable element is not a labelable element, where
   * a `<label for>` would be invalid.
   */
  labelAssociation?: FieldLabelAssociation;
  name: string;
  ref?: Ref<HTMLDivElement>;
  required?: boolean;
}

const addRegisteredId = (ids: string[], id: string) => {
  if (ids.includes(id)) {
    return ids;
  }

  return [...ids, id];
};

const removeRegisteredId = (ids: string[], id: string) =>
  ids.filter((registeredId) => registeredId !== id);

export const Field = ({
  children,
  className,
  disabled = false,
  id,
  invalid = false,
  labelAssociation = 'for',
  name,
  ref,
  required = false,
  ...props
}: FieldProps) => {
  // Default to a deterministic, name-derived id (e.g. `input-email`) so the label
  // and control are always associated and the id is debuggable; an explicit `id`
  // overrides it. This assumes `name` is unique across the page (not just the form)
  // so these ids stay unique — see the `id` prop doc; pass an explicit `id` wherever
  // a field name can repeat on a page.
  const fieldId = resolveFieldControlId(name, id);
  const labelId = `${fieldId}-label`;
  const [hintIds, setHintIds] = useState<string[]>([]);
  const [errorIds, setErrorIds] = useState<string[]>([]);

  const registerHintId = useCallback((registeredId: string) => {
    setHintIds((ids) => addRegisteredId(ids, registeredId));

    return () => {
      setHintIds((ids) => removeRegisteredId(ids, registeredId));
    };
  }, []);

  const registerErrorId = useCallback((registeredId: string) => {
    setErrorIds((ids) => addRegisteredId(ids, registeredId));

    return () => {
      setErrorIds((ids) => removeRegisteredId(ids, registeredId));
    };
  }, []);

  const describedBy = useMemo(() => [...hintIds, ...errorIds].join(' '), [errorIds, hintIds]);

  const contextValue = useMemo<FieldContextValue>(
    () => ({
      id: fieldId,
      labelId,
      labelAssociation,
      name,
      invalid,
      required,
      disabled,
      describedBy,
      registerHintId,
      registerErrorId,
    }),
    [
      describedBy,
      disabled,
      fieldId,
      invalid,
      labelAssociation,
      labelId,
      name,
      registerErrorId,
      registerHintId,
      required,
    ],
  );

  return (
    <div ref={ref} className={cn(fieldSpacingClass, className)} {...props}>
      <FieldContextProvider value={contextValue}>{children}</FieldContextProvider>
    </div>
  );
};
