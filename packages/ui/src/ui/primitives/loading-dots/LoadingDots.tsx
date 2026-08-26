import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import type { IconSize } from '../icon/Icon';

type LoadingDotsBaseProps = Omit<
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

type DecorativeLoadingDotsProps = LoadingDotsBaseProps & {
  /**
   * Whether the loading dots are purely visual and should be hidden from assistive tech.
   *
   * @defaultValue `true`
   */
  decorative?: true;
  label?: never;
};

type LabeledLoadingDotsProps = LoadingDotsBaseProps & {
  /**
   * Set to false when the loading dots communicate a loading state.
   */
  decorative: false;

  /**
   * Accessible name for non-decorative loading dots.
   */
  label: string;
};

export type LoadingDotsProps = DecorativeLoadingDotsProps | LabeledLoadingDotsProps;

const loadingDotsSizeClasses = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
} satisfies Record<IconSize, string>;

/**
 * Secondary loading indicator for feed, lazy-loading, and progressive content states.
 *
 * Loading dots are decorative by default. Use `decorative={false}` with `label`
 * when the dots themselves are the only loading-state announcement.
 *
 * @example
 * ```tsx
 * <LoadingDots size="sm" />
 * <LoadingDots decorative={false} label="Loading posts" />
 * ```
 */
// CSS animation (not SMIL) so the global `prefers-reduced-motion` reset can
// switch the bounce off; SMIL <animate> ignores that media query entirely.
const loadingDotBounceClass = 'animate-bounce [animation-duration:0.9s]';

export const LoadingDots = ({
  size = 'md',
  decorative = true,
  className,
  ...props
}: LoadingDotsProps) => {
  const accessibilityProps = decorative
    ? { 'aria-hidden': true }
    : { 'aria-label': props.label, role: 'status' };

  const { label: _label, ...svgProps } = props;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn('inline-block shrink-0', loadingDotsSizeClasses[size], className)}
      focusable="false"
      {...accessibilityProps}
      {...svgProps}
    >
      <circle cx="5" cy="12" r="2.25" className={loadingDotBounceClass} />
      <circle
        cx="12"
        cy="12"
        r="2.25"
        className={cn(loadingDotBounceClass, '[animation-delay:0.15s]')}
      />
      <circle
        cx="19"
        cy="12"
        r="2.25"
        className={cn(loadingDotBounceClass, '[animation-delay:0.3s]')}
      />
    </svg>
  );
};
