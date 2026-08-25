import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  checkboxButtonLayoutClass,
  checkboxButtonSelectedClass,
  checkboxButtonUnselectedClass,
} from './checkbox-button.styles';
import type { CheckboxButtonSize } from './checkbox-button.styles';

export type { CheckboxButtonSize };

/**
 * Props for {@link CheckboxButton}.
 *
 * A checkbox rendered as a compact toggle button. Extends every standard
 * `button` attribute with a `selected` state and a size token. Selection is
 * exposed to assistive tech via `role="checkbox"` + `aria-checked`.
 */
export interface CheckboxButtonProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'color'
> {
  /**
   * Whether the checkbox is currently selected.
   *
   * @defaultValue `false`
   */
  selected?: boolean;

  /**
   * Size token.
   *
   * @defaultValue `'medium'`
   */
  size?: CheckboxButtonSize;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Checkbox styled as a toggle button, for multi-select option groups.
 *
 * @example
 * ```tsx
 * <CheckboxButton selected={values.includes('foo')} onClick={() => toggle('foo')}>
 *   Foo
 * </CheckboxButton>
 * ```
 */
export const CheckboxButton = ({
  type = 'button',
  selected = false,
  size = 'medium',
  className,
  children,
  ref,
  ...props
}: CheckboxButtonProps) => (
  <button
    ref={ref}
    type={type}
    role="checkbox"
    aria-checked={selected}
    className={cn(
      checkboxButtonLayoutClass({ size }),
      selected ? checkboxButtonSelectedClass : checkboxButtonUnselectedClass,
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
