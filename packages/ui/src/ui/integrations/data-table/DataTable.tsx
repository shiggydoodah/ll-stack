'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  Row,
  RowData,
  RowSelectionState,
  SortingState,
  Table as TanStackTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { IconButton } from '../../primitives/button';
import { Checkbox } from '../../primitives/checkbox';
import { Skeleton } from '../../primitives/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../primitives/table';
import type { TableAlign, TableDensity } from '../../primitives/table';

// Teach TanStack about the per-column `align` we read off `columnDef.meta` to align header + body
// cells. Augmenting here keeps the typing local to the integration that owns the library.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Horizontal alignment forwarded to the `TableHead`/`TableCell` for this column. */
    align?: TableAlign;
  }
}

/** Stable empty array so the throwaway table built for the escape-hatch path never re-renders. */
const EMPTY_DATA: readonly unknown[] = [];

const SELECTION_COLUMN_ID = '__select__';

/**
 * Manual (server / keyset) pagination config. Provide this as the `pagination` prop when the
 * caller already paginates `data` and just needs the pager wired to its own navigation.
 */
export interface ManualPagination {
  /** Whether a previous page exists. */
  hasPreviousPage: boolean;
  /** Whether a next page exists. */
  hasNextPage: boolean;
  /** Navigate to the previous page. */
  onPreviousPage: () => void;
  /** Navigate to the next page. */
  onNextPage: () => void;
  /** Status label shown between the pager buttons, e.g. `"keyset · 10 per page"`. */
  label?: ReactNode;
}

/**
 * Props for {@link DataTable}.
 *
 * Drive it the easy way with `columns` + `data` + opt-in feature flags, or hand it a fully
 * built TanStack `table` instance for total control (the escape hatch ignores `columns`/`data`
 * and every feature flag — you own the state and row models).
 */
export interface DataTableProps<TData> {
  /** Column definitions. Required unless a pre-built `table` instance is provided. */
  columns?: ColumnDef<TData, unknown>[];
  /** Row data. Required unless a pre-built `table` instance is provided. */
  data?: TData[];

  /**
   * Derive each row's stable identity (used as the row-selection key). Provide this for
   * server/keyset-paginated selection so a row stays identified across pages. Without it, rows
   * are keyed by their index within the current `data` slice — stable only within a single page.
   */
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;

  /**
   * Escape hatch — a pre-built TanStack table instance. When provided it is rendered directly
   * and `columns`/`data` plus all feature flags are ignored.
   */
  table?: TanStackTable<TData>;

  /**
   * Make sortable columns' headers clickable/keyboard-operable with a sort indicator. Sorting is
   * client-side over the rows in `data`; combined with manual/keyset `pagination` it only sorts
   * the current page slice (there is no server-sort hand-off).
   */
  enableSorting?: boolean;
  /** Inject a leading checkbox column with select-all (indeterminate) + per-row selection. */
  enableRowSelection?: boolean;
  /**
   * Built-in footer pager. `true` = client pagination (the table slices `data`); an object =
   * manual/keyset pagination driven by the caller's navigation callbacks.
   */
  pagination?: boolean | ManualPagination;
  /** Initial page size for client pagination (uncontrolled — set after mount has no effect). @defaultValue `10` */
  pageSize?: number;

  /** Vertical rhythm forwarded to the underlying `Table`. @defaultValue `'comfortable'` */
  density?: TableDensity;
  /** Pin the header while the body scrolls. @defaultValue `false` */
  stickyHeader?: boolean;

  /**
   * Called when a row is activated by click or by keyboard (Enter/Space) while the row itself is
   * focused. Makes rows focusable with a hover surface and focus ring while keeping their native
   * row semantics. Clicks bubble from cell content, so the built-in selection checkbox cell stops
   * click propagation and you should call `event.stopPropagation()` in your own interactive cell
   * handlers (links, action buttons). Keyboard activation only fires when the row element holds
   * focus, so nested controls are exempt without extra handling.
   */
  onRowClick?: (row: Row<TData>) => void;

  /** Render skeleton rows instead of data. */
  isLoading?: boolean;
  /** Number of skeleton rows rendered while loading. @defaultValue `5` */
  loadingRowCount?: number;
  /** Override the loading rows entirely (return `<TableRow>`s). */
  renderLoading?: () => ReactNode;
  /** Shown (spanning all columns) when not loading and there are no rows. @defaultValue `"No results"` */
  emptyState?: ReactNode;

  /** Controlled sorting state. Falls back to internal state when omitted. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Controlled row-selection state. Falls back to internal state when omitted. */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /**
   * Controlled client-pagination state. Falls back to internal state when omitted. Only wired
   * when `pagination` is `true` (client pagination); ignored for manual/keyset pagination, which
   * is driven by the `ManualPagination` callbacks.
   */
  paginationState?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;

  /** Classes merged onto the `<table>`. */
  className?: string;
  /** Classes for the scroll-container wrapper (e.g. a `max-h-*` to enable a sticky header). */
  containerClassName?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  ref?: Ref<HTMLTableElement>;
}

const ariaSortFor = (sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' => {
  if (sorted === 'asc') return 'ascending';
  if (sorted === 'desc') return 'descending';
  return 'none';
};

const sortJustify = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} satisfies Record<TableAlign, string>;

/** Sort affordance + indicator wrapped around a sortable header label. Keyboard-operable for free. */
const SortableHeaderButton = ({
  align = 'left',
  sorted,
  onToggle,
  children,
}: {
  align?: TableAlign;
  sorted: false | 'asc' | 'desc';
  onToggle: ((event: unknown) => void) | undefined;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={cn(
      'ui-display-text flex w-full cursor-pointer items-center gap-1 rounded-(--ui-radius-sm) outline-none select-none',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-focus-ring)',
      sortJustify[align],
    )}
  >
    {children}
    {sorted === 'asc' ? (
      <ChevronUp className="size-3.5 shrink-0" aria-hidden />
    ) : sorted === 'desc' ? (
      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
    ) : (
      <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
    )}
  </button>
);

/** Footer pager — previous/next buttons (≥44px targets) with a status label between them. */
const DataTablePagination = ({
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  label,
}: {
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  label?: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 border-t border-(--ui-border) px-4 py-2">
    <span className="text-xs text-(--ui-text-subtle)">{label}</span>
    <div className="flex items-center gap-2">
      <IconButton
        aria-label="Previous page"
        variant="outline"
        tone="neutral"
        size="small"
        disabled={!canPreviousPage}
        onClick={onPreviousPage}
        className="min-h-11 min-w-11"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </IconButton>
      <IconButton
        aria-label="Next page"
        variant="outline"
        tone="neutral"
        size="small"
        disabled={!canNextPage}
        onClick={onNextPage}
        className="min-h-11 min-w-11"
      >
        <ChevronRight className="size-4" aria-hidden />
      </IconButton>
    </div>
  </div>
);

/**
 * Data-driven table built on `@tanstack/react-table`, rendered through the `@repo/ui` `Table`
 * primitives so it shares one visual source of truth with hand-composed tables. App-specific
 * cell content (badges, avatars, monospace, action buttons) lives in the caller's column
 * definitions — this component ships the chrome + engine wiring only.
 *
 * @example
 * ```tsx
 * const columns: ColumnDef<User>[] = [
 *   { accessorKey: 'name', header: 'Name' },
 *   { accessorKey: 'total', header: 'Total', meta: { align: 'right' } },
 * ];
 * <DataTable columns={columns} data={users} enableSorting pagination onRowClick={open} />
 * ```
 */
export const DataTable = <TData,>({
  columns,
  data,
  getRowId,
  table: tableProp,
  enableSorting = false,
  enableRowSelection = false,
  pagination = false,
  pageSize = 10,
  density,
  stickyHeader,
  onRowClick,
  isLoading = false,
  loadingRowCount = 5,
  renderLoading,
  emptyState = 'No results',
  sorting: sortingProp,
  onSortingChange,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  paginationState: paginationStateProp,
  onPaginationChange,
  className,
  containerClassName,
  id,
  ref,
  ...aria
}: DataTableProps<TData>) => {
  // Narrow the union once: an object means manual/keyset paging, `true` means client paging.
  const manualPagination = typeof pagination === 'object' ? pagination : null;
  const isClientPagination = pagination === true;

  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const sorting = sortingProp ?? internalSorting;
  const rowSelection = rowSelectionProp ?? internalRowSelection;
  const paginationState = paginationStateProp ?? internalPagination;

  // Scopes the selection checkbox ids so two DataTables on one page stay unique.
  const tableId = useId();

  // Prepend the selection column (config path only — the escape hatch owns its own columns).
  const resolvedColumns = useMemo(() => {
    const base = columns ?? [];
    if (!enableRowSelection) return base;

    const selectionColumn: ColumnDef<TData, unknown> = {
      id: SELECTION_COLUMN_ID,
      enableSorting: false,
      meta: { align: 'center' },
      header: ({ table }) => (
        <Checkbox
          id={`${tableId}-select-all`}
          aria-label="Select all rows"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) {
              el.indeterminate =
                table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
            }
          }}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          id={`${tableId}-select-row-${row.id}`}
          aria-label="Select row"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    };
    return [selectionColumn, ...base];
  }, [columns, enableRowSelection, tableId]);

  const internalTable = useReactTable<TData>({
    data: data ?? (EMPTY_DATA as TData[]),
    columns: resolvedColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getPaginationRowModel: isClientPagination ? getPaginationRowModel() : undefined,
    enableSorting,
    enableRowSelection,
    manualPagination: manualPagination ? true : undefined,
    state: {
      sorting,
      rowSelection,
      ...(isClientPagination ? { pagination: paginationState } : {}),
    },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onRowSelectionChange: onRowSelectionChange ?? setInternalRowSelection,
    onPaginationChange: onPaginationChange ?? setInternalPagination,
  });

  const activeTable = tableProp ?? internalTable;
  const columnCount = activeTable.getVisibleLeafColumns().length || 1;
  const rows = activeTable.getRowModel().rows;

  // Loading + empty states are config-path only; the escape hatch owns its own rendering.
  const showLoading = !tableProp && isLoading;
  const showEmpty = !tableProp && !isLoading && rows.length === 0;

  const renderDataRows = () =>
    rows.map((row) => {
      const interactive = Boolean(onRowClick);
      return (
        <TableRow
          key={row.id}
          interactive={interactive}
          data-state={row.getIsSelected() ? 'selected' : undefined}
          // Keep the native `row` role (so the table stays navigable by AT and interactive cell
          // content isn't nested inside a `button` role) but make the row focusable + activatable.
          tabIndex={interactive ? 0 : undefined}
          onClick={interactive ? () => onRowClick?.(row) : undefined}
          onKeyDown={
            interactive
              ? (event) => {
                  // Only the row itself activates. Enter/Space bubbling up from a nested control
                  // (selection checkbox, action button) has a different `target`, so ignore it —
                  // otherwise we'd cancel the control's own default (e.g. the native checkbox
                  // toggle) and fire spurious row navigation.
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick?.(row);
                  }
                }
              : undefined
          }
          className={cn(
            'data-[state=selected]:bg-(--ui-background-subtle)',
            interactive &&
              'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-focus-ring)',
          )}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell
              key={cell.id}
              align={cell.column.columnDef.meta?.align}
              // The whole selection cell (not just the checkbox) swallows clicks so its padding
              // never triggers the row.
              onClick={
                cell.column.id === SELECTION_COLUMN_ID
                  ? (event) => event.stopPropagation()
                  : undefined
              }
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      );
    });

  const renderLoadingRows = () =>
    Array.from({ length: loadingRowCount }).map((_, rowIndex) => (
      <TableRow key={`dt-skeleton-${rowIndex}`}>
        {Array.from({ length: columnCount }).map((_, cellIndex) => (
          <TableCell key={cellIndex}>
            <Skeleton preset="text" />
          </TableCell>
        ))}
      </TableRow>
    ));

  const showPager = !tableProp && (isClientPagination || manualPagination !== null);

  return (
    <>
      <Table
        ref={ref}
        id={id}
        density={density}
        stickyHeader={stickyHeader}
        className={className}
        containerClassName={containerClassName}
        {...aria}
      >
        <TableHeader>
          {activeTable.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const align = header.column.columnDef.meta?.align;
                const label = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <TableHead
                    key={header.id}
                    align={align}
                    aria-sort={canSort ? ariaSortFor(header.column.getIsSorted()) : undefined}
                  >
                    {canSort ? (
                      <SortableHeaderButton
                        align={align}
                        sorted={header.column.getIsSorted()}
                        onToggle={header.column.getToggleSortingHandler()}
                      >
                        {label}
                      </SortableHeaderButton>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {showLoading ? (
            (renderLoading?.() ?? renderLoadingRows())
          ) : showEmpty ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                align="center"
                className="py-10 text-(--ui-text-subtle)"
              >
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            renderDataRows()
          )}
        </TableBody>
      </Table>
      {showPager ? (
        manualPagination ? (
          <DataTablePagination
            canPreviousPage={manualPagination.hasPreviousPage}
            canNextPage={manualPagination.hasNextPage}
            onPreviousPage={manualPagination.onPreviousPage}
            onNextPage={manualPagination.onNextPage}
            label={manualPagination.label}
          />
        ) : (
          <DataTablePagination
            canPreviousPage={activeTable.getCanPreviousPage()}
            canNextPage={activeTable.getCanNextPage()}
            onPreviousPage={() => activeTable.previousPage()}
            onNextPage={() => activeTable.nextPage()}
            label={`Page ${activeTable.getState().pagination.pageIndex + 1} of ${Math.max(
              activeTable.getPageCount(),
              1,
            )}`}
          />
        )
      ) : null}
    </>
  );
};
