/** Vertical rhythm applied to every header and body cell. */
export type TableDensity = 'compact' | 'comfortable';

/** Horizontal text alignment for a header or body cell. */
export type TableAlign = 'left' | 'center' | 'right';

/**
 * Cell padding shared by `<th>` and `<td>`. The root `<table>` carries `group/table` plus a
 * `data-density` attribute, so each cell selects its padding through a `group-data` variant —
 * every cell in a hand-composed table stays consistent without threading a `density` prop
 * through each one. Class-only, so it stays RSC-safe.
 */
export const tableCellPaddingClass = [
  'group-data-[density=comfortable]/table:px-4 group-data-[density=comfortable]/table:py-3',
  'group-data-[density=compact]/table:px-3 group-data-[density=compact]/table:py-2',
].join(' ');

/**
 * Sticky-header treatment applied when the root `Table` sets `stickyHeader` (via the
 * `data-sticky` attribute it emits). The header pins to the top of the scroll container while
 * the body scrolls beneath it.
 */
export const tableStickyHeaderClass = [
  'group-data-[sticky=true]/table:sticky group-data-[sticky=true]/table:top-0',
  'group-data-[sticky=true]/table:z-10 group-data-[sticky=true]/table:bg-(--ui-background-subtle)',
].join(' ');

/** Text alignment utility per {@link TableAlign}. */
export const tableAlign = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} satisfies Record<TableAlign, string>;
