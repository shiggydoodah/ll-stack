'use client';

import type { ComponentPropsWithoutRef } from 'react';

import { useFieldContext } from '../../../components/fields';

export interface FieldGroupProps extends ComponentPropsWithoutRef<'div'> {
  /** Group semantics for the options container. */
  role: 'group' | 'radiogroup';
}

/**
 * Options container for group-style fields (`role="radiogroup"` / `role="group"`).
 * Single controls get their ARIA wiring cloned on by `FieldControl`, but a group's
 * semantics live on the wrapping element — which `FieldControl` can't target — so
 * this reads the field context and wires `aria-describedby` (the hint/error ids
 * registered by `FieldHint`/`FieldError`), `aria-invalid` and `aria-required` onto
 * the group itself.
 */
export const FieldGroup = ({ children, ...props }: FieldGroupProps) => {
  const { describedBy, invalid, required } = useFieldContext();

  return (
    <div
      aria-describedby={describedBy.length > 0 ? describedBy : undefined}
      aria-invalid={invalid ? true : undefined}
      aria-required={required ? true : undefined}
      {...props}
    >
      {children}
    </div>
  );
};
