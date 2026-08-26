import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  gridColsClasses,
  gridGapClasses,
  gridItemColSpanClasses,
  gridItemRowSpanClasses,
  resolveResponsiveClass,
} from './grid.styles';
import type { GridColSpan, GridColumns, GridGap, ResponsiveProp } from './grid.styles';

/**
 * Props for {@link Grid}.
 *
 * Includes every standard React `div` attribute plus typed layout props. All
 * native attributes (`id`, `aria-*`, `role`, `ref`, …) are forwarded.
 */
export interface GridProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Column count — a single value applied at every breakpoint, or a
   * per-breakpoint object (`{ base: 1, sm: 2, lg: 3 }`). Defaults to `1`.
   */
  cols?: ResponsiveProp<GridColumns>;
  /** Gap between grid cells, from the shared size scale. Defaults to `medium`. */
  gap?: GridGap;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Responsive CSS-grid container. Declares column layouts through typed props
 * instead of ad-hoc utility classes, and composes (nest a `Grid`, or use
 * {@link GridItem} for cell spans).
 *
 * @example
 * ```tsx
 * <Grid cols={{ base: 1, sm: 2, lg: 3 }} gap="medium">
 *   <Card />
 *   <Card />
 *   <Card />
 * </Grid>
 * ```
 */
export const Grid = ({ cols = 1, gap = 'medium', className, children, ...props }: GridProps) => (
  <div
    className={cn(
      'grid',
      resolveResponsiveClass(cols, gridColsClasses),
      gridGapClasses[gap],
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

/**
 * Props for {@link GridItem}.
 *
 * Includes every standard React `div` attribute plus typed span props.
 */
export interface GridItemProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Columns to span — a single value, `'full'`, or a per-breakpoint object
   * (`{ base: 1, lg: 2 }`). When omitted the item occupies one track.
   */
  colSpan?: ResponsiveProp<GridColSpan>;
  /** Rows to span (1–6). */
  rowSpan?: GridColumns;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A cell within a {@link Grid} that can span multiple columns and/or rows.
 * Use it only when a cell needs a span; plain children flow one-per-track.
 *
 * @example
 * ```tsx
 * <Grid cols={3} gap="medium">
 *   <GridItem colSpan={{ base: 1, lg: 2 }}>Featured</GridItem>
 *   <Card />
 * </Grid>
 * ```
 */
export const GridItem = ({ colSpan, rowSpan, className, children, ...props }: GridItemProps) => (
  <div
    className={cn(
      colSpan != null && resolveResponsiveClass(colSpan, gridItemColSpanClasses),
      rowSpan != null && gridItemRowSpanClasses[rowSpan],
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
