import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { Check } from 'lucide-react';

import { cn } from '../../../lib/cn';
import {
  radioCardBaseClass,
  radioCardIndicatorBaseClass,
  radioCardIndicatorSelectedClass,
  radioCardIndicatorShapeClasses,
  radioCardIndicatorUnselectedClass,
  radioCardSelectedClass,
  radioCardUnselectedClass,
} from './radio-card.styles';
import type { RadioCardIndicator } from './radio-card.styles';

export type { RadioCardIndicator };

/**
 * Props for {@link RadioCard}.
 *
 * A selectable option presented as a bordered box with a leading content slot
 * and a trailing selection indicator. Renders as a `button`.
 */
export interface RadioCardProps extends Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'color'
> {
  /** Whether this option is currently selected. */
  selected: boolean;

  /**
   * Selection indicator shape. Defaults to `radio` for single-select groups;
   * use `checkbox` for multi-select groups.
   *
   * @defaultValue `'radio'`
   */
  indicator?: RadioCardIndicator;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const Indicator = ({
  indicator,
  selected,
}: {
  indicator: RadioCardIndicator;
  selected: boolean;
}) => (
  <span
    aria-hidden="true"
    className={cn(
      radioCardIndicatorBaseClass,
      radioCardIndicatorShapeClasses[indicator],
      selected ? radioCardIndicatorSelectedClass : radioCardIndicatorUnselectedClass,
    )}
  >
    {selected &&
      (indicator === 'radio' ? (
        <span className="size-2 rounded-full bg-(--ui-background)" />
      ) : (
        <Check className="size-3.5" strokeWidth={3} />
      ))}
  </span>
);

/**
 * Boxed selectable option for single-select (radio) groups.
 *
 * Presentational and controlled: `selected` drives styling only, and the ARIA
 * semantics are the consumer's to declare. Radio semantics are opt-in because
 * `role="radio"` obliges the group to behave like an APG radiogroup — one tab
 * stop with arrow-key traversal — which this card cannot provide on its own,
 * and because `indicator="checkbox"` is a multi-select shape that wants
 * `role="checkbox"` instead.
 *
 * For single-select, wrap the cards in a `role="radiogroup"` container, set
 * `role="radio"`/`aria-checked` per card, manage selection in the parent, and
 * add roving `tabIndex` plus arrow-key handling there — see `ToggleSwitch` for
 * a worked example of that keyboard pattern.
 *
 * @example
 * ```tsx
 * <div role="radiogroup" aria-label="Profile visibility">
 *   <RadioCard
 *     selected={mode === 'public'}
 *     role="radio"
 *     aria-checked={mode === 'public'}
 *     tabIndex={mode === 'public' ? 0 : -1}
 *     onClick={() => setMode('public')}
 *   >
 *     <div>Public — anyone can see your profile</div>
 *   </RadioCard>
 * </div>
 * ```
 */
export const RadioCard = ({
  type = 'button',
  selected,
  indicator = 'radio',
  className,
  children,
  ref,
  ...props
}: RadioCardProps) => (
  <button
    ref={ref}
    type={type}
    data-selected={selected || undefined}
    className={cn(
      radioCardBaseClass,
      selected ? radioCardSelectedClass : radioCardUnselectedClass,
      className,
    )}
    {...props}
  >
    <span className="min-w-0 flex-1">{children}</span>
    <Indicator indicator={indicator} selected={selected} />
  </button>
);
