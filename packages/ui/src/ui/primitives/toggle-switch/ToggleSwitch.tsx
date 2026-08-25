import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import { toggleSwitchOptionClass, toggleSwitchRootClass } from './toggle-switch.styles';
import type { ToggleSwitchSize } from './toggle-switch.styles';

export type { ToggleSwitchSize };

export interface ToggleSwitchOption {
  /** Stable value used for selection comparison. */
  value: string;
  /** Visible label content. */
  label: ReactNode;
  /** Optional leading icon. */
  icon?: ReactNode;
}

/**
 * Props for {@link ToggleSwitch}.
 */
export interface ToggleSwitchProps extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> {
  /** Available options, rendered left-to-right. */
  options: ToggleSwitchOption[];
  /** Currently selected value. */
  value: string;
  /** Called with the next value when an option is chosen. */
  onValueChange?: (value: string) => void;

  /**
   * Control size token.
   *
   * @defaultValue `'small'`
   */
  size?: ToggleSwitchSize;

  /**
   * Stretch the control to fill its container, dividing the width equally
   * between the options.
   *
   * @defaultValue `false`
   */
  fullWidth?: boolean;

  /**
   * Disables the whole control: greys it out, blocks selection, and removes the
   * options from the tab order.
   *
   * @defaultValue `false`
   */
  disabled?: boolean;

  /** Accessible label for the group. */
  'aria-label'?: string;
}

/**
 * Mutually-exclusive option toggle rendered as a single connected control.
 *
 * Presentational and controlled; for form-bound single-select use the form
 * integration's `RadioButtonGroupField`.
 *
 * @example
 * ```tsx
 * <ToggleSwitch
 *   aria-label="Audience"
 *   value={audience}
 *   onValueChange={setAudience}
 *   options={[
 *     { value: 'anyone', label: 'Anyone', icon: <Globe size={12} /> },
 *     { value: 'followers', label: 'Followers', icon: <Users size={12} /> },
 *   ]}
 * />
 * ```
 */
export const ToggleSwitch = ({
  options,
  value,
  onValueChange,
  size = 'small',
  fullWidth = false,
  disabled = false,
  className,
  ...props
}: ToggleSwitchProps) => (
  <div
    role="radiogroup"
    aria-disabled={disabled || undefined}
    className={cn(toggleSwitchRootClass({ size, fullWidth }), disabled && 'opacity-60', className)}
    {...props}
  >
    {options.map((option) => {
      const active = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          disabled={disabled}
          className={toggleSwitchOptionClass({ size, active, fullWidth })}
          onClick={() => onValueChange?.(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      );
    })}
  </div>
);
