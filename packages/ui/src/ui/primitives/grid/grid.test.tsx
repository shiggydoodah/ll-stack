// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { Grid, GridItem } from './grid';

describe('Grid', () => {
  it('renders a div with the grid class and children', () => {
    const html = renderToStaticMarkup(<Grid>cell</Grid>);

    expect(html).toContain('<div');
    expect(html).toContain('cell');
    expect(html).toContain('grid');
  });

  it('applies default props (cols=1, gap=medium)', () => {
    const html = renderToStaticMarkup(<Grid>cell</Grid>);

    expect(html).toContain('grid-cols-1');
    expect(html).toContain('gap-4');
  });

  it('resolves a single numeric cols value', () => {
    const html = renderToStaticMarkup(<Grid cols={3}>cell</Grid>);

    expect(html).toContain('grid-cols-3');
  });

  it('resolves a responsive cols object mobile-first', () => {
    const html = renderToStaticMarkup(<Grid cols={{ base: 1, sm: 2, lg: 3 }}>cell</Grid>);

    expect(html).toContain('grid-cols-1');
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('lg:grid-cols-3');
  });

  it('maps each gap size to its utility', () => {
    const cases = [
      ['xsmall', 'gap-2'],
      ['small', 'gap-3'],
      ['medium', 'gap-4'],
      ['large', 'gap-6'],
      ['xlarge', 'gap-8'],
    ] as const;

    for (const [gap, expected] of cases) {
      const html = renderToStaticMarkup(<Grid gap={gap}>cell</Grid>);
      expect(html).toContain(expected);
    }
  });

  it('merges a custom className last', () => {
    const html = renderToStaticMarkup(<Grid className="custom-grid">cell</Grid>);

    expect(html).toContain('custom-grid');
  });

  it('passes through native div attributes', () => {
    const html = renderToStaticMarkup(
      <Grid id="layout" data-testid="grid" role="list" aria-label="cards">
        cell
      </Grid>,
    );

    expect(html).toContain('id="layout"');
    expect(html).toContain('data-testid="grid"');
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="cards"');
  });

  it('supports nested grids', () => {
    const html = renderToStaticMarkup(
      <Grid cols={2}>
        <Grid cols={3}>nested</Grid>
      </Grid>,
    );

    expect(html).toContain('grid-cols-2');
    expect(html).toContain('grid-cols-3');
    expect(html).toContain('nested');
  });
});

describe('GridItem', () => {
  it('resolves a single numeric colSpan', () => {
    const html = renderToStaticMarkup(<GridItem colSpan={2}>cell</GridItem>);

    expect(html).toContain('col-span-2');
  });

  it('resolves the full colSpan', () => {
    const html = renderToStaticMarkup(<GridItem colSpan="full">cell</GridItem>);

    expect(html).toContain('col-span-full');
  });

  it('resolves a responsive colSpan object', () => {
    const html = renderToStaticMarkup(<GridItem colSpan={{ base: 1, lg: 2 }}>cell</GridItem>);

    expect(html).toContain('col-span-1');
    expect(html).toContain('lg:col-span-2');
  });

  it('applies a rowSpan', () => {
    const html = renderToStaticMarkup(<GridItem rowSpan={2}>cell</GridItem>);

    expect(html).toContain('row-span-2');
  });

  it('renders no span classes when none are supplied', () => {
    const html = renderToStaticMarkup(<GridItem>cell</GridItem>);

    expect(html).not.toContain('col-span');
    expect(html).not.toContain('row-span');
  });

  it('merges className and passes through native attributes', () => {
    const html = renderToStaticMarkup(
      <GridItem colSpan={2} id="featured" className="custom-item">
        cell
      </GridItem>,
    );

    expect(html).toContain('id="featured"');
    expect(html).toContain('custom-item');
  });
});

describe('ref forwarding', () => {
  let container: HTMLDivElement;

  afterEach(() => {
    container?.remove();
  });

  it('forwards a ref to the underlying Grid and GridItem divs', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const gridRef = createRef<HTMLDivElement>();
    const itemRef = createRef<HTMLDivElement>();
    const root = createRoot(container);

    act(() => {
      root.render(
        <Grid ref={gridRef} cols={2}>
          <GridItem ref={itemRef} colSpan={2}>
            cell
          </GridItem>
        </Grid>,
      );
    });

    expect(gridRef.current).toBeInstanceOf(HTMLDivElement);
    expect(gridRef.current?.className).toContain('grid');
    expect(itemRef.current).toBeInstanceOf(HTMLDivElement);
    expect(itemRef.current?.className).toContain('col-span-2');

    act(() => {
      root.unmount();
    });
  });
});
