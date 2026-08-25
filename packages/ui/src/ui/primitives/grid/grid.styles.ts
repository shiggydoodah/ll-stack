import type { UiSize } from '../../../types/ui.types';

/**
 * Responsive breakpoint keys. `base` is the unprefixed (mobile-first) value;
 * the rest map to Tailwind's default breakpoint prefixes.
 */
export type GridBreakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Supported column counts for {@link Grid}. */
export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6;

/** Column span for a {@link GridItem} — a column count or the full track. */
export type GridColSpan = GridColumns | 'full';

/** Gap between grid cells, reusing the shared size scale. */
export type GridGap = UiSize;

/**
 * A prop that can be a single value or a per-breakpoint object.
 *
 * @example
 * cols={3}                          // applies at every breakpoint
 * cols={{ base: 1, sm: 2, lg: 3 }}  // applies per breakpoint, mobile-first
 */
export type ResponsiveProp<T> = T | Partial<Record<GridBreakpoint, T>>;

/**
 * Static, literal `grid-cols-*` classes per breakpoint. Tailwind v4 scans source
 * for complete class names, so these must be written out — never interpolated.
 */
export const gridColsClasses = {
  base: {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  },
  sm: {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-4',
    5: 'sm:grid-cols-5',
    6: 'sm:grid-cols-6',
  },
  md: {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
    6: 'md:grid-cols-6',
  },
  lg: {
    1: 'lg:grid-cols-1',
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
    5: 'lg:grid-cols-5',
    6: 'lg:grid-cols-6',
  },
  xl: {
    1: 'xl:grid-cols-1',
    2: 'xl:grid-cols-2',
    3: 'xl:grid-cols-3',
    4: 'xl:grid-cols-4',
    5: 'xl:grid-cols-5',
    6: 'xl:grid-cols-6',
  },
  '2xl': {
    1: '2xl:grid-cols-1',
    2: '2xl:grid-cols-2',
    3: '2xl:grid-cols-3',
    4: '2xl:grid-cols-4',
    5: '2xl:grid-cols-5',
    6: '2xl:grid-cols-6',
  },
} satisfies Record<GridBreakpoint, Record<GridColumns, string>>;

/** Static, literal `col-span-*` classes per breakpoint for {@link GridItem}. */
export const gridItemColSpanClasses = {
  base: {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
    5: 'col-span-5',
    6: 'col-span-6',
    full: 'col-span-full',
  },
  sm: {
    1: 'sm:col-span-1',
    2: 'sm:col-span-2',
    3: 'sm:col-span-3',
    4: 'sm:col-span-4',
    5: 'sm:col-span-5',
    6: 'sm:col-span-6',
    full: 'sm:col-span-full',
  },
  md: {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
    4: 'md:col-span-4',
    5: 'md:col-span-5',
    6: 'md:col-span-6',
    full: 'md:col-span-full',
  },
  lg: {
    1: 'lg:col-span-1',
    2: 'lg:col-span-2',
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    full: 'lg:col-span-full',
  },
  xl: {
    1: 'xl:col-span-1',
    2: 'xl:col-span-2',
    3: 'xl:col-span-3',
    4: 'xl:col-span-4',
    5: 'xl:col-span-5',
    6: 'xl:col-span-6',
    full: 'xl:col-span-full',
  },
  '2xl': {
    1: '2xl:col-span-1',
    2: '2xl:col-span-2',
    3: '2xl:col-span-3',
    4: '2xl:col-span-4',
    5: '2xl:col-span-5',
    6: '2xl:col-span-6',
    full: '2xl:col-span-full',
  },
} satisfies Record<GridBreakpoint, Record<GridColSpan, string>>;

/**
 * Static `row-span-*` classes for {@link GridItem}. Row spans are a single,
 * non-responsive value to keep the matrix bounded.
 */
export const gridItemRowSpanClasses = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
  4: 'row-span-4',
  5: 'row-span-5',
  6: 'row-span-6',
} satisfies Record<GridColumns, string>;

/** Gap scale mapped to Tailwind gap utilities (mirrors Button's spacing rhythm). */
export const gridGapClasses = {
  xsmall: 'gap-2',
  small: 'gap-3',
  medium: 'gap-4',
  large: 'gap-6',
  xlarge: 'gap-8',
} satisfies Record<GridGap, string>;

/**
 * Resolves a {@link ResponsiveProp} to a space-separated class string using the
 * supplied per-breakpoint lookup map. A plain value resolves to its `base` class;
 * an object resolves each declared breakpoint.
 */
export const resolveResponsiveClass = <T extends GridColumns | GridColSpan>(
  value: ResponsiveProp<T>,
  map: Record<GridBreakpoint, Record<T, string>>,
): string => {
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([breakpoint, columns]) => map[breakpoint as GridBreakpoint][columns as T])
      .join(' ');
  }

  return map.base[value];
};
