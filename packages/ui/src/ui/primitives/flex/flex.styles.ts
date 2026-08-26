import { cva } from 'class-variance-authority';

/** Spacing scale shared by `padding` and `gap` (same keys, different magnitudes per axis). */
export type FlexSpace = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Cross-axis alignment of children, mapped to `items-*`. */
export type FlexAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** Main-axis distribution of children, mapped to `justify-*`. */
export type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

export const flexClass = cva('flex', {
  variants: {
    direction: {
      col: 'flex-col',
      row: 'flex-row',
      'responsive-row': 'flex-col sm:flex-row',
    },
    padding: {
      none: '',
      xs: 'p-1',
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
      xl: 'p-8',
      '2xl': 'p-12',
    },
    gap: {
      none: 'gap-0',
      xs: 'gap-1',
      sm: 'gap-2',
      md: 'gap-3',
      lg: 'gap-4',
      xl: 'gap-6',
      '2xl': 'gap-8',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      end: 'items-end',
      stretch: 'items-stretch',
      baseline: 'items-baseline',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
      evenly: 'justify-evenly',
    },
    wrap: { true: 'flex-wrap' },
  },
  defaultVariants: { padding: 'none', gap: 'none', wrap: false },
});
