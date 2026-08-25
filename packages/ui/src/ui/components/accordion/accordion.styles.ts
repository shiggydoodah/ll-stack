import { cva } from 'class-variance-authority';

import type { UiSize } from '../../../types/ui.types';

/** Overall visual treatment of the accordion. */
export type AccordionVariant = 'separated' | 'contained' | 'ghost';

/** Size token. Accordion uses three of the shared sizes. */
export type AccordionSize = Exclude<UiSize, 'xsmall' | 'xlarge'>;

/**
 * Root container layout. `separated` stacks each item as its own bordered card;
 * `contained` wraps every item in a single bordered, clipped box; `ghost` adds no
 * outer chrome and relies on the per-item bottom divider.
 */
export const accordionRootClass = cva('', {
  variants: {
    variant: {
      separated: 'flex flex-col gap-2',
      contained: 'overflow-hidden rounded-(--ui-radius-lg) border border-(--ui-border)',
      ghost: '',
    },
  },
  defaultVariants: { variant: 'separated' },
});

/**
 * Per-item chrome. The `separated` card is clipped so the trigger hover and the
 * height animation stay inside its rounded-(--ui-radius-sm) corners; `contained` / `ghost` items
 * draw a divider between rows (suppressed on the last row).
 */
export const accordionItemClass = cva('', {
  variants: {
    variant: {
      separated: 'overflow-hidden rounded-(--ui-radius-lg) border border-(--ui-border)',
      contained: 'border-b border-(--ui-border) last:border-b-0',
      ghost: 'border-b border-(--ui-border) last:border-b-0',
    },
  },
  defaultVariants: { variant: 'separated' },
});

/**
 * The header button. Lives on a `group` so the chevron can react to
 * `data-state="open"`. Title sits left, chevron right via `justify-between`.
 */
export const accordionTriggerClass = cva(
  'group font-display flex w-full flex-1 cursor-pointer items-center justify-between gap-3 ' +
    'text-left leading-tight font-bold text-(--ui-foreground) transition-colors outline-none ' +
    'hover:bg-(--ui-foreground)/5 ' +
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-focus-ring) ' +
    'disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      size: {
        small: 'px-3 py-2.5 text-sm',
        medium: 'px-4 py-3.5 text-base',
        large: 'px-5 py-4 text-lg',
      },
    },
    defaultVariants: { size: 'medium' },
  },
);

/** Disclosure chevron. Rotates 180° when the enclosing trigger group is open. */
export const accordionChevronClass =
  'size-4 shrink-0 text-(--ui-text-subtle) transition-transform duration-(--ui-motion-fast) ' +
  'group-data-[state=open]:rotate-180';

/**
 * The animated Radix `Content` wrapper. `overflow-hidden` clips the height
 * transition; the keyframes are provided by `tw-animate-css` and read
 * `--radix-accordion-content-height`.
 */
export const accordionContentClass =
  'overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up';

/** Inner body padding. Top padding is 0 so the trigger's own padding sets the gap. */
export const accordionContentInnerClass = cva('pt-0 text-(--ui-text-body)', {
  variants: {
    size: {
      small: 'px-3 pb-2.5 text-sm',
      medium: 'px-4 pb-3.5 text-sm',
      large: 'px-5 pb-4 text-base',
    },
  },
  defaultVariants: { size: 'medium' },
});
