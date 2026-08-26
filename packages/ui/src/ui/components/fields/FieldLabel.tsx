import type { ComponentPropsWithRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { useFieldContext } from './FieldContext';
import { fieldLabelBaseClass } from './fieldLabel.styles';
import { FieldRequiredIndicator } from './FieldRequiredIndicator';

export interface FieldLabelProps extends Omit<
  ComponentPropsWithRef<'label'>,
  'children' | 'htmlFor' | 'id'
> {
  children: ReactNode;
  htmlFor?: string;
  /**
   * Overrides the label's `id`. Applies to native-control labels (`labelAssociation="for"`)
   * only. In `labelAssociation="labelledby"` mode the label is pinned to the field's
   * `labelId` — the control's `aria-labelledby` target — so this prop is ignored there to
   * avoid disconnecting the control from its visible label.
   */
  id?: string;
}

export const FieldLabel = ({
  children,
  className,
  htmlFor,
  id,
  ref,
  ...props
}: FieldLabelProps) => {
  const { id: controlId, labelId, labelAssociation, invalid, required } = useFieldContext();

  const labelClassName = cn(fieldLabelBaseClass, invalid && 'text-(--ui-text-invalid)', className);
  const content = (
    <>
      {children}
      {required && <FieldRequiredIndicator />}
    </>
  );

  // Composite controls (combobox, slider) have no labelable element and name
  // themselves via `aria-labelledby={labelId}` (injected by `FieldControl`), so render
  // a plain `<span>` pinned to `labelId`: a `<label>` with no matching `for`/nested
  // control trips the "label isn't associated with a form field" audit, and a caller
  // `id` override here would point the control's `aria-labelledby` at a missing element.
  if (labelAssociation === 'labelledby') {
    return (
      <span ref={ref as Ref<HTMLSpanElement>} id={labelId} className={labelClassName} {...props}>
        {content}
      </span>
    );
  }

  // Native controls associate via a real `<label htmlFor>`, so the label's own id is not
  // the association target — a caller `id` override is safe here.
  return (
    <label
      ref={ref}
      htmlFor={htmlFor ?? controlId}
      id={id ?? labelId}
      className={labelClassName}
      {...props}
    >
      {content}
    </label>
  );
};
