import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';

export type SkeletonPreset = 'heading' | 'text' | 'button';

export interface SkeletonProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'color'> {
  /**
   * Shape preset for common UI placeholders.
   *
   * @defaultValue `'text'`
   */
  preset?: SkeletonPreset;

  /**
   * Additional classes merged after the preset so dimensions can be overridden.
   */
  className?: string;

  ref?: Ref<HTMLDivElement>;
}

const skeletonPresetClasses = {
  heading: 'h-6 w-2/3 rounded-(--ui-radius-sm)',
  text: 'h-2.5 w-full rounded-(--ui-radius-sm)',
  button: 'h-10 w-28 rounded-(--ui-radius-sm)',
} satisfies Record<SkeletonPreset, string>;

/**
 * Decorative loading placeholder for content with a known shape.
 */
export const Skeleton = ({ preset = 'text', className, ...props }: SkeletonProps) => (
  <div
    {...props}
    aria-hidden="true"
    className={cn('ui-skeleton block shrink-0', skeletonPresetClasses[preset], className)}
  />
);
