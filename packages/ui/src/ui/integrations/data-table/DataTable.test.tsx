// @vitest-environment jsdom

import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataTable } from './DataTable';

afterEach(cleanup);

const setup = () => userEvent.setup({ pointerEventsCheck: 0 });

type Person = { id: string; name: string; age: number };

const PEOPLE: Person[] = [
  { id: '1', name: 'Charlie', age: 30 },
  { id: '2', name: 'Alice', age: 25 },
  { id: '3', name: 'Bob', age: 35 },
];

const COLUMNS: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age', meta: { align: 'right' } },
];

const nameCells = () =>
  screen
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
    .filter((text) => text && Number.isNaN(Number(text)));

describe('DataTable', () => {
  it('renders columns and data through the Table primitive', () => {
    render(<DataTable columns={COLUMNS} data={PEOPLE} />);

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(screen.getByText('Charlie')).toBeTruthy();
  });

  it('toggles sorting (reorders rows + sets aria-sort)', async () => {
    const user = setup();
    render(<DataTable columns={COLUMNS} data={PEOPLE} enableSorting />);

    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(nameHeader.getAttribute('aria-sort')).toBe('none');
    expect(nameCells()[0]).toBe('Charlie');

    await user.click(screen.getByRole('button', { name: 'Name' }));

    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(nameCells()[0]).toBe('Alice');

    await user.click(screen.getByRole('button', { name: 'Name' }));

    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
    expect(nameCells()[0]).toBe('Charlie');
  });

  it('supports select-all (indeterminate) + per-row selection', async () => {
    const user = setup();
    render(<DataTable columns={COLUMNS} data={PEOPLE} enableRowSelection />);

    const selectAll = screen.getByLabelText('Select all rows') as HTMLInputElement;
    const rowBoxes = screen.getAllByLabelText('Select row') as HTMLInputElement[];
    expect(rowBoxes).toHaveLength(3);
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(false);

    await user.click(rowBoxes[0] as HTMLInputElement);

    expect((screen.getAllByLabelText('Select row')[0] as HTMLInputElement).checked).toBe(true);
    const partial = screen.getByLabelText('Select all rows') as HTMLInputElement;
    expect(partial.checked).toBe(false);
    expect(partial.indeterminate).toBe(true);

    await user.click(screen.getByLabelText('Select all rows'));

    const allBoxes = screen.getAllByLabelText('Select row') as HTMLInputElement[];
    expect(allBoxes.every((box) => box.checked)).toBe(true);
    expect((screen.getByLabelText('Select all rows') as HTMLInputElement).checked).toBe(true);
  });

  it('paginates client-side and disables the pager at the bounds', async () => {
    const user = setup();
    const rows: Person[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      name: `r${i + 1}`,
      age: 20 + i,
    }));
    render(<DataTable columns={COLUMNS} data={rows} pagination pageSize={2} />);

    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement;

    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(nameCells()[0]).toBe('r1');

    await user.click(next);
    expect(nameCells()[0]).toBe('r3');
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled,
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(nameCells()[0]).toBe('r5');
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('drives manual/keyset pagination through callbacks + flags', async () => {
    const user = setup();
    const onPreviousPage = vi.fn();
    const onNextPage = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        pagination={{
          hasPreviousPage: false,
          hasNextPage: true,
          onPreviousPage,
          onNextPage,
          label: 'keyset · 10 per page',
        }}
      />,
    );

    expect(screen.getByText('keyset · 10 per page')).toBeTruthy();
    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    await user.click(next);
    expect(onNextPage).toHaveBeenCalledTimes(1);
    expect(onPreviousPage).not.toHaveBeenCalled();
  });

  it('renders skeleton rows while loading', () => {
    const { container } = render(
      <DataTable columns={COLUMNS} data={PEOPLE} isLoading loadingRowCount={3} />,
    );

    // 3 rows × 2 columns of skeleton placeholders.
    expect(container.querySelectorAll('.ui-skeleton')).toHaveLength(6);
    expect(screen.queryByText('Charlie')).toBeNull();
  });

  it('renders the empty state when there are no rows', () => {
    render(<DataTable columns={COLUMNS} data={[]} />);
    expect(screen.getByText('No results')).toBeTruthy();

    cleanup();

    render(<DataTable columns={COLUMNS} data={[]} emptyState="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  describe('onRowClick', () => {
    const withAction: ColumnDef<Person>[] = [
      ...COLUMNS,
      {
        id: 'actions',
        header: '',
        cell: () => (
          <button type="button" aria-label="Open menu" onClick={(e) => e.stopPropagation()}>
            ⋯
          </button>
        ),
      },
    ];

    it('fires on row click', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      render(<DataTable columns={COLUMNS} data={PEOPLE} onRowClick={onRowClick} />);

      await user.click(screen.getByText('Charlie'));

      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick.mock.calls[0]?.[0]?.original).toEqual(PEOPLE[0]);
    });

    it('fires on Enter and Space when the row is focused', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      render(<DataTable columns={COLUMNS} data={PEOPLE} onRowClick={onRowClick} />);

      const row = screen.getByText('Charlie').closest('tr') as HTMLTableRowElement;
      // Native row semantics are preserved (no button role); the row is just focusable.
      expect(row.getAttribute('role')).toBeNull();
      expect(row.getAttribute('tabindex')).toBe('0');

      act(() => row.focus());
      await user.keyboard('{Enter}');
      await user.keyboard(' ');

      expect(onRowClick).toHaveBeenCalledTimes(2);
    });

    it('does not fire from the selection cell (checkbox or its surrounding padding)', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      render(
        <DataTable columns={COLUMNS} data={PEOPLE} enableRowSelection onRowClick={onRowClick} />,
      );

      const checkbox = screen.getAllByLabelText('Select row')[0] as HTMLElement;
      await user.click(checkbox);
      // The whole selection cell swallows the click, not just the checkbox.
      await user.click(checkbox.closest('td') as HTMLTableCellElement);

      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('does not fire from an action control that stops propagation', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      render(<DataTable columns={withAction} data={PEOPLE} onRowClick={onRowClick} />);

      await user.click(screen.getAllByRole('button', { name: 'Open menu' })[0] as HTMLElement);

      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('does not fire from keyboard activation of the selection checkbox (Enter)', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      render(
        <DataTable columns={COLUMNS} data={PEOPLE} enableRowSelection onRowClick={onRowClick} />,
      );

      const checkbox = screen.getAllByLabelText('Select row')[0] as HTMLInputElement;
      act(() => checkbox.focus());
      await user.keyboard('{Enter}');

      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('toggles the selection checkbox with Space without firing the row', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      render(
        <DataTable columns={COLUMNS} data={PEOPLE} enableRowSelection onRowClick={onRowClick} />,
      );

      const checkbox = screen.getAllByLabelText('Select row')[0] as HTMLInputElement;
      act(() => checkbox.focus());
      await user.keyboard(' ');

      // The native checkbox toggle still happens (the row no longer swallows its keydown)...
      expect((screen.getAllByLabelText('Select row')[0] as HTMLInputElement).checked).toBe(true);
      // ...and the row navigation does not fire.
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('does not fire from keyboard activation of an action button (Enter)', async () => {
      const user = setup();
      const onRowClick = vi.fn();
      const onAction = vi.fn();
      const cols: ColumnDef<Person>[] = [
        ...COLUMNS,
        {
          id: 'actions',
          header: '',
          cell: () => (
            <button
              type="button"
              aria-label="Open menu"
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
            >
              ⋯
            </button>
          ),
        },
      ];
      render(<DataTable columns={cols} data={PEOPLE} onRowClick={onRowClick} />);

      const button = screen.getAllByRole('button', { name: 'Open menu' })[0] as HTMLButtonElement;
      act(() => button.focus());
      await user.keyboard('{Enter}');

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onRowClick).not.toHaveBeenCalled();
    });
  });

  it('keys row selection by getRowId when provided', () => {
    const onRowSelectionChange = vi.fn();
    // PEOPLE: index 0 = id '1' (Charlie), index 1 = id '2' (Alice), index 2 = id '3' (Bob).
    render(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        enableRowSelection
        getRowId={(person) => person.id}
        rowSelection={{ '2': true }}
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    const boxes = screen.getAllByLabelText('Select row') as HTMLInputElement[];
    // With getRowId = person.id, key '2' resolves to Alice (index 1), not the index-2 row.
    expect(boxes[1]?.checked).toBe(true);
    expect(boxes[2]?.checked).toBe(false);
  });

  it('still sorts internally when onSortingChange is passed without the sorting prop', async () => {
    const user = setup();
    const onSortingChange = vi.fn();
    // Notification mode: the callback observes changes, it must not freeze the feature.
    render(
      <DataTable columns={COLUMNS} data={PEOPLE} enableSorting onSortingChange={onSortingChange} />,
    );

    expect(nameCells()[0]).toBe('Charlie');

    await user.click(screen.getByRole('button', { name: 'Name' }));

    expect(onSortingChange).toHaveBeenCalledTimes(1);
    expect(nameCells()[0]).toBe('Alice');

    await user.click(screen.getByRole('button', { name: 'Name' }));

    expect(onSortingChange).toHaveBeenCalledTimes(2);
    expect(nameCells()[0]).toBe('Charlie');
    expect(screen.getByRole('columnheader', { name: 'Name' }).getAttribute('aria-sort')).toBe(
      'descending',
    );
  });

  it('still selects internally when onRowSelectionChange is passed without the rowSelection prop', async () => {
    const user = setup();
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        enableRowSelection
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    await user.click(screen.getAllByLabelText('Select row')[0] as HTMLInputElement);

    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    expect((screen.getAllByLabelText('Select row')[0] as HTMLInputElement).checked).toBe(true);
  });

  it('still pages internally when onPaginationChange is passed without the paginationState prop', async () => {
    const user = setup();
    const onPaginationChange = vi.fn();
    const rows: Person[] = Array.from({ length: 4 }, (_, i) => ({
      id: String(i + 1),
      name: `r${i + 1}`,
      age: 20 + i,
    }));
    render(
      <DataTable
        columns={COLUMNS}
        data={rows}
        pagination
        pageSize={2}
        onPaginationChange={onPaginationChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(onPaginationChange).toHaveBeenCalledTimes(1);
    expect(nameCells()[0]).toBe('r3');
  });

  it('respects controlled sorting state and reports changes without self-updating', async () => {
    const user = setup();
    const onSortingChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        enableSorting
        sorting={[]}
        onSortingChange={onSortingChange}
      />,
    );

    expect(nameCells()[0]).toBe('Charlie');

    await user.click(screen.getByRole('button', { name: 'Name' }));

    // Controlled: the change is reported, but order does not move until the prop updates.
    expect(onSortingChange).toHaveBeenCalledTimes(1);
    expect(nameCells()[0]).toBe('Charlie');

    rerender(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        enableSorting
        sorting={[{ id: 'name', desc: false }]}
        onSortingChange={onSortingChange}
      />,
    );

    expect(nameCells()[0]).toBe('Alice');
  });

  it('respects controlled row-selection state', () => {
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        enableRowSelection
        rowSelection={{ '1': true }}
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    const boxes = screen.getAllByLabelText('Select row') as HTMLInputElement[];
    // Default row id is the slice index as a string, so '1' is the second row.
    expect(boxes[1]?.checked).toBe(true);
    expect(boxes[0]?.checked).toBe(false);
  });

  it('renders custom loading rows via renderLoading', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={PEOPLE}
        isLoading
        renderLoading={() => (
          <tr>
            <td>Custom loading…</td>
          </tr>
        )}
      />,
    );

    expect(screen.getByText('Custom loading…')).toBeTruthy();
    expect(screen.queryByText('Charlie')).toBeNull();
  });

  it('merges className onto the table element', () => {
    render(<DataTable columns={COLUMNS} data={PEOPLE} className="my-data-table" />);
    expect(screen.getByRole('table').className).toContain('my-data-table');
  });

  it('renders a pre-built table instance via the escape hatch', () => {
    const EscapeHatch = () => {
      const table = useReactTable({
        data: PEOPLE,
        columns: COLUMNS,
        getCoreRowModel: getCoreRowModel(),
      });
      return <DataTable table={table} />;
    };

    render(<EscapeHatch />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(screen.getByText('Charlie')).toBeTruthy();
  });

  it('enforces the config/escape-hatch split at the type level', () => {
    // Compile-time-only assertions (checked by `pnpm typecheck`): the props union
    // makes the documented "escape hatch ignores the flags" rule un-writable.
    const TypeLevel = () => {
      const table = useReactTable({
        data: PEOPLE,
        columns: COLUMNS,
        getCoreRowModel: getCoreRowModel(),
      });

      return (
        <>
          {/* @ts-expect-error — neither columns/data nor table is not a valid DataTable. */}
          <DataTable<Person> />
          {/* @ts-expect-error — columns without data is incomplete config. */}
          <DataTable columns={COLUMNS} />
          {/* @ts-expect-error — feature flags are ignored (and so forbidden) with the escape hatch. */}
          <DataTable table={table} enableSorting />
          {/* @ts-expect-error — columns/data are ignored (and so forbidden) with the escape hatch. */}
          <DataTable table={table} columns={COLUMNS} data={PEOPLE} />
        </>
      );
    };

    // Chrome-only props remain valid on both members; rendering one proves the
    // union still accepts the legal shapes at runtime.
    render(<DataTable columns={COLUMNS} data={PEOPLE} density="compact" />);
    expect(TypeLevel).toBeDefined();
    expect(screen.getByText('Charlie')).toBeTruthy();
  });
});
