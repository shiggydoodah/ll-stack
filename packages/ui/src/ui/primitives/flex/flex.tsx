import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { flexClass, type FlexAlign, type FlexJustify, type FlexSpace } from './flex.styles';

/** Layout props shared by {@link Stack} and {@link Row}. */
export interface FlexLayoutProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Inner padding applied on all sides.
   *
   * @defaultValue `'none'`
   */
  padding?: FlexSpace;

  /**
   * Space between children.
   *
   * @defaultValue `'none'`
   */
  gap?: FlexSpace;

  /** Cross-axis alignment of children (`items-*`). Unset uses the browser default. */
  align?: FlexAlign;

  /** Main-axis distribution of children (`justify-*`). Unset uses the browser default. */
  justify?: FlexJustify;

  /**
   * Allow children to wrap onto multiple lines.
   *
   * @defaultValue `false`
   */
  wrap?: boolean;

  ref?: Ref<HTMLDivElement>;
}

type FlexDirection = 'col' | 'row' | 'responsive-row';

/**
 * Internal flexbox `<div>` shared by {@link Stack} and {@link Row}. Not exported from the
 * package barrel — consumers compose layouts from `Stack`/`Row`, which set `direction`.
 */
export const Flex = ({
  direction,
  padding,
  gap,
  align,
  justify,
  wrap,
  className,
  ...props
}: FlexLayoutProps & { direction: FlexDirection }) => (
  <div
    className={cn(flexClass({ direction, padding, gap, align, justify, wrap }), className)}
    {...props}
  />
);
