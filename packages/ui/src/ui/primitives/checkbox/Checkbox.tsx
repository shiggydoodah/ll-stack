import type { ChangeEvent, ChangeEventHandler, ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { checkboxBaseClass } from './checkbox.styles';

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'color' | 'onChange' | 'type'
> {
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Convenience callback with the next checked value; works controlled or uncontrolled. */
  onCheckedChange?: (checked: boolean) => void;
  ref?: Ref<HTMLInputElement>;
}

export const Checkbox = ({
  className,
  onChange,
  onCheckedChange,
  ref,
  ...props
}: CheckboxProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);

    if (!event.defaultPrevented) {
      onCheckedChange?.(event.currentTarget.checked);
    }
  };

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(checkboxBaseClass, className)}
      onChange={handleChange}
      {...props}
    />
  );
};
