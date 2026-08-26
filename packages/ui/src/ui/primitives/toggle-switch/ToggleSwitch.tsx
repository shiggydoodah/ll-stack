'use client';

import { useRef } from 'react';
import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode, Ref } from 'react';

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

  ref?: Ref<HTMLDivElement>;
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
  ref,
  ...props
}: ToggleSwitchProps) => {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // APG radio-group keyboard support: arrows move selection (wrapping) and
  // focus follows, so only the active option needs to be a tab stop.
  const activeIndex = options.findIndex((option) => option.value === value);
  const tabStopIndex = activeIndex === -1 ? 0 : activeIndex;

  const moveSelection = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onValueChange?.(option.value);
    optionRefs.current[next]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(index, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(index, -1);
    }
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-disabled={disabled || undefined}
      className={cn(
        toggleSwitchRootClass({ size, fullWidth }),
        disabled && 'opacity-60',
        className,
      )}
      {...props}
    >
      {options.map((option, index) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            tabIndex={index === tabStopIndex ? 0 : -1}
            className={toggleSwitchOptionClass({ size, active, fullWidth })}
            onClick={() => onValueChange?.(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
