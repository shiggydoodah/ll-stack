import type { ComponentPropsWithoutRef, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../../lib/cn';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type IconBaseProps = Omit<ComponentPropsWithoutRef<'svg'>, 'aria-label' | 'children' | 'color'> & {
  /**
   * Lucide icon component to render.
   */
  icon: LucideIcon;

  /**
   * Shared icon size token.
   *
   * @defaultValue `'md'`
   */
  size?: IconSize;

  ref?: Ref<SVGSVGElement>;
};

type DecorativeIconProps = IconBaseProps & {
  /**
   * Whether the icon is purely visual and should be hidden from assistive tech.
   *
   * @defaultValue `true`
   */
  decorative?: true;
  label?: never;
};

type LabeledIconProps = IconBaseProps & {
  /**
   * Set to false when the icon itself communicates meaning.
   */
  decorative: false;

  /**
   * Accessible name for non-decorative icons.
   */
  label: string;
};

export type IconProps = DecorativeIconProps | LabeledIconProps;

const iconSizeClasses = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
} satisfies Record<IconSize, string>;

/**
 * Shared wrapper for Lucide icons with consistent sizing and accessibility defaults.
 *
 * Icons are decorative by default. Use `decorative={false}` with `label` when
 * the icon itself conveys meaning without adjacent text.
 *
 * @example
 * ```tsx
 * <Icon icon={Search} />
 * <Icon icon={AlertTriangle} decorative={false} label="Warning" />
 * ```
 */
export const Icon = ({
  icon: LucideIconComponent,
  size = 'md',
  decorative = true,
  className,
  ...props
}: IconProps) => {
  const accessibilityProps = decorative
    ? { 'aria-hidden': true }
    : { 'aria-label': props.label, role: 'img' };

  const { label: _label, ...svgProps } = props;

  return (
    <LucideIconComponent
      className={cn('inline-block shrink-0', iconSizeClasses[size], className)}
      focusable="false"
      {...accessibilityProps}
      {...svgProps}
    />
  );
};
