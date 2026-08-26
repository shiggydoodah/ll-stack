import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import type { IconSize } from '../icon/Icon';

type SpinnerBaseProps = Omit<
  ComponentPropsWithoutRef<'svg'>,
  'aria-label' | 'children' | 'color'
> & {
  /**
   * Shared icon size token.
   *
   * @defaultValue `'md'`
   */
  size?: IconSize;
  ref?: Ref<SVGSVGElement>;
};

type DecorativeSpinnerProps = SpinnerBaseProps & {
  /**
   * Whether the spinner is purely visual and should be hidden from assistive tech.
   *
   * @defaultValue `true`
   */
  decorative?: true;
  label?: never;
};

type LabeledSpinnerProps = SpinnerBaseProps & {
  /**
   * Set to false when the spinner itself communicates a loading state.
   */
  decorative: false;

  /**
   * Accessible name for non-decorative spinners.
   */
  label: string;
};

export type SpinnerProps = DecorativeSpinnerProps | LabeledSpinnerProps;

const spinnerSizeClasses = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
} satisfies Record<IconSize, string>;

/**
 * Shared loading spinner with consistent icon sizing and accessibility defaults.
 *
 * Spinners are decorative by default. Use `decorative={false}` with `label`
 * when the spinner itself is the only loading-state announcement.
 *
 * @example
 * ```tsx
 * <Spinner size="sm" />
 * <Spinner decorative={false} label="Loading results" />
 * ```
 */
export const Spinner = ({ size = 'md', decorative = true, className, ...props }: SpinnerProps) => {
  const accessibilityProps = decorative
    ? { 'aria-hidden': true }
    : { 'aria-label': props.label, role: 'status' };

  const { label: _label, ...svgProps } = props;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block shrink-0 animate-spin', spinnerSizeClasses[size], className)}
      focusable="false"
      {...accessibilityProps}
      {...svgProps}
    >
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" />
    </svg>
  );
};
