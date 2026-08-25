// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const sampleTable = (props: Parameters<typeof Table>[0] = {}) => (
  <Table {...props}>
    <TableCaption>Quarterly totals</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead align="right">Total</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Acme</TableCell>
        <TableCell align="right">42</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);

describe('Table', () => {
  it('renders semantic table structure inside a scroll container', () => {
    const html = renderToStaticMarkup(sampleTable());

    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html).toContain('<thead');
    expect(html).toContain('<tbody');
    expect(html).toContain('<th');
    expect(html).toContain('scope="col"');
    expect(html).toContain('Acme');
  });

  it('defaults to comfortable density and emits the density data attribute', () => {
    expect(renderToStaticMarkup(sampleTable())).toContain('data-density="comfortable"');
    expect(renderToStaticMarkup(sampleTable({ density: 'compact' }))).toContain(
      'data-density="compact"',
    );
  });

  it('applies density padding to cells via group-data variants', () => {
    const html = renderToStaticMarkup(sampleTable());

    expect(html).toContain('group-data-[density=comfortable]/table:py-3');
    expect(html).toContain('group-data-[density=compact]/table:py-2');
  });

  it('applies alignment classes to header and body cells', () => {
    const html = renderToStaticMarkup(sampleTable());

    expect(html).toContain('text-left');
    expect(html).toContain('text-right');
  });

  it('removes the divider on the last body row', () => {
    // `&` is HTML-escaped to `&amp;` in the serialised markup.
    expect(renderToStaticMarkup(sampleTable())).toContain('_tr:last-child]:border-0');
  });

  it('marks the header sticky when stickyHeader is set', () => {
    const html = renderToStaticMarkup(sampleTable({ stickyHeader: true }));

    expect(html).toContain('data-sticky="true"');
    expect(html).toContain('group-data-[sticky=true]/table:sticky');
  });

  it('does not mark the header sticky by default', () => {
    expect(renderToStaticMarkup(sampleTable())).not.toContain('data-sticky="true"');
  });

  it('merges custom className onto the table', () => {
    expect(renderToStaticMarkup(sampleTable({ className: 'my-table' }))).toContain('my-table');
  });

  it('passes through native table attributes', () => {
    const html = renderToStaticMarkup(
      <Table id="users" aria-label="Users" data-testid="users-table">
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(html).toContain('id="users"');
    expect(html).toContain('aria-label="Users"');
    expect(html).toContain('data-testid="users-table"');
  });

  it('forwards ref to the underlying table element', () => {
    const ref = createRef<HTMLTableElement>();

    render(
      <Table ref={ref}>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(ref.current).toBeInstanceOf(HTMLTableElement);
  });
});
