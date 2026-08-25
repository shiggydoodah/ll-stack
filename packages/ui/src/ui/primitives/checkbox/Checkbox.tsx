import type { ChangeEvent, ChangeEventHandler, ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { checkboxBaseClass } from './checkbox.styles';

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'checked' | 'color' | 'defaultChecked' | 'onChange' | 'type'
> {
  checked: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onCheckedChange?: (checked: boolean) => void;
  ref?: Ref<HTMLInputElement>;
}

export const Checkbox = ({
  checked,
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
      checked={checked}
      className={cn(checkboxBaseClass, className)}
      onChange={handleChange}
      {...props}
    />
  );
};
