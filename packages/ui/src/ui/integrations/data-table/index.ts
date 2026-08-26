export { DataTable } from './DataTable';
export type { DataTableProps, ManualPagination } from './DataTable';

// Re-export the parts of @tanstack/react-table consumers need so they never import the library
// directly (mirrors how the Form integration re-exports `useSelector`). The generic `Table` and
// `Row` names are aliased to avoid colliding with the `Table`/`Row` UI primitives at the
// package's root barrel.
export { createColumnHelper, flexRender } from '@tanstack/react-table';
export type {
  CellContext,
  ColumnDef,
  ColumnMeta,
  HeaderContext,
  PaginationState,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table';
export type { Row as TanStackRow, Table as TanStackTable } from '@tanstack/react-table';
