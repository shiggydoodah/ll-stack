import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { tableAlign, tableCellPaddingClass, tableStickyHeaderClass } from './table.styles';
import type { TableAlign, TableDensity } from './table.styles';

export type { TableAlign, TableDensity };

/**
 * Props for {@link Table}.
 *
 * Includes every standard `table` attribute except `color`, plus density and sticky-header
 * controls. `className` lands on the `<table>`; use `containerClassName` to size the scroll
 * wrapper (e.g. a `max-h-*` so a sticky header has somewhere to stick).
 */
export interface TableProps extends Omit<ComponentPropsWithoutRef<'table'>, 'color'> {
  /**
   * Vertical rhythm applied to every cell.
   *
   * @defaultValue `'comfortable'`
   */
  density?: TableDensity;

  /**
   * Pin {@link TableHeader} to the top of the scroll container while the body scrolls.
   *
   * @defaultValue `false`
   */
  stickyHeader?: boolean;

  /** Classes for the scroll-container wrapper — set a `max-h-*` here to enable a sticky header. */
  containerClassName?: string;

  ref?: Ref<HTMLTableElement>;
}

/**
 * Presentational, RSC-safe table chrome. Wraps a semantic `<table>` in a horizontally
 * scrollable container and exposes a density axis + optional sticky header that the cell and
 * header sub-components pick up automatically. Compose by hand, or drive it with the
 * `DataTable` integration.
 *
 * @example
 * ```tsx
 * <Table density="compact" stickyHeader>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Name</TableHead>
 *       <TableHead align="right">Total</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Acme</TableCell>
 *       <TableCell align="right">£42</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 */
export const Table = ({
  density = 'comfortable',
  stickyHeader = false,
  className,
  containerClassName,
  ref,
  ...props
}: TableProps) => (
  <div className={cn('w-full overflow-x-auto', containerClassName)}>
    <table
      ref={ref}
      data-density={density}
      data-sticky={stickyHeader || undefined}
      className={cn('ui-table group/table w-full border-collapse text-sm', className)}
      {...props}
    />
  </div>
);

/** Props for {@link TableHeader}. */
export interface TableHeaderProps extends ComponentPropsWithoutRef<'thead'> {
  /** Force the sticky treatment regardless of the root `Table`'s `stickyHeader`. */
  sticky?: boolean;
  ref?: Ref<HTMLTableSectionElement>;
}

/**
 * Table head section. The header row carries a stronger underline than body rows, and becomes
 * sticky when the root `Table` sets `stickyHeader` (or when `sticky` is set directly here).
 */
export const TableHeader = ({ sticky = false, className, ref, ...props }: TableHeaderProps) => (
  <thead
    ref={ref}
    className={cn(
      '[&_tr]:border-(--ui-border-strong)',
      tableStickyHeaderClass,
      sticky && 'sticky top-0 z-10 bg-(--ui-background-subtle)',
      className,
    )}
    {...props}
  />
);

/** Props for {@link TableBody}. */
export interface TableBodyProps extends ComponentPropsWithoutRef<'tbody'> {
  ref?: Ref<HTMLTableSectionElement>;
}

/** Table body section. Drops the divider on the final row so the table reads as a clean block. */
export const TableBody = ({ className, ref, ...props }: TableBodyProps) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);

/** Props for {@link TableFooter}. */
export interface TableFooterProps extends ComponentPropsWithoutRef<'tfoot'> {
  ref?: Ref<HTMLTableSectionElement>;
}

/** Table footer section on a subtle raised surface — totals, pagers, summary rows. */
export const TableFooter = ({ className, ref, ...props }: TableFooterProps) => (
  <tfoot
    ref={ref}
    className={cn('border-t border-(--ui-border-strong) bg-(--ui-background-subtle)', className)}
    {...props}
  />
);

/** Props for {@link TableRow}. */
export interface TableRowProps extends ComponentPropsWithoutRef<'tr'> {
  /** Apply pointer cursor + hover surface for clickable rows. @defaultValue `false` */
  interactive?: boolean;
  ref?: Ref<HTMLTableRowElement>;
}

/** A table row. Add `interactive` to signal a clickable row (cursor + hover surface). */
export const TableRow = ({ interactive = false, className, ref, ...props }: TableRowProps) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-(--ui-border) transition-colors',
      interactive && 'cursor-pointer hover:bg-(--ui-background-subtle)',
      className,
    )}
    {...props}
  />
);

/** Props for {@link TableHead}. */
export interface TableHeadProps extends Omit<ComponentPropsWithoutRef<'th'>, 'align'> {
  /** Horizontal alignment of the header label. @defaultValue `'left'` */
  align?: TableAlign;
  ref?: Ref<HTMLTableCellElement>;
}

/** Header cell — uppercase, tracked, subtle label. */
export const TableHead = ({ align = 'left', className, ref, ...props }: TableHeadProps) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      'ui-display-text text-2xs font-bold whitespace-nowrap text-(--ui-text-subtle)',
      tableCellPaddingClass,
      tableAlign[align],
      className,
    )}
    {...props}
  />
);

/** Props for {@link TableCell}. */
export interface TableCellProps extends Omit<ComponentPropsWithoutRef<'td'>, 'align'> {
  /** Horizontal alignment of the cell content. @defaultValue `'left'` */
  align?: TableAlign;
  ref?: Ref<HTMLTableCellElement>;
}

/** Body cell — middle-aligned body text. Style strong/secondary cells via `className`. */
export const TableCell = ({ align = 'left', className, ref, ...props }: TableCellProps) => (
  <td
    ref={ref}
    className={cn(
      'align-middle text-(--ui-text-body)',
      tableCellPaddingClass,
      tableAlign[align],
      className,
    )}
    {...props}
  />
);

/** Props for {@link TableCaption}. */
export interface TableCaptionProps extends ComponentPropsWithoutRef<'caption'> {
  ref?: Ref<HTMLTableCaptionElement>;
}

/** Subtle caption describing the table's contents (rendered above the header by default). */
export const TableCaption = ({ className, ref, ...props }: TableCaptionProps) => (
  <caption
    ref={ref}
    className={cn('pb-3 text-left text-xs text-(--ui-text-subtle)', className)}
    {...props}
  />
);
