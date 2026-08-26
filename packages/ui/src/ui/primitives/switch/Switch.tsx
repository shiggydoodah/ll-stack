import type { ComponentPropsWithoutRef, MouseEvent, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { switchThumbClass, switchTrackClass } from './switch.styles';
import type { SwitchSize } from './switch.styles';

export type { SwitchSize };

/**
 * Props for {@link Switch}.
 */
export interface SwitchProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'color' | 'onChange' | 'role' | 'type'
> {
  /** Controlled on/off state. */
  checked: boolean;
  /** Called with the next state when the switch is toggled. */
  onCheckedChange?: (checked: boolean) => void;

  /**
   * Control size token.
   *
   * @defaultValue `'medium'`
   */
  size?: SwitchSize;

  /** Accessible name — required unless `aria-labelledby` references a visible label. */
  'aria-label'?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * iOS-style on/off switch rendered as a native `button[role="switch"]`.
 *
 * Presentational and controlled; the on-state track always uses `--ui-accent`.
 * For form-bound boolean state use the form integration's `CheckboxField`.
 *
 * @example
 * ```tsx
 * <Switch aria-label="Show online status" checked={online} onCheckedChange={setOnline} />
 * ```
 */
export const Switch = ({
  checked,
  className,
  onCheckedChange,
  onClick,
  ref,
  size = 'medium',
  ...props
}: SwitchProps) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);

    if (!event.defaultPrevented) {
      onCheckedChange?.(!checked);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(switchTrackClass({ size, checked }), className)}
      onClick={handleClick}
      {...props}
    >
      <span aria-hidden="true" className={switchThumbClass({ size, checked })} />
    </button>
  );
};
