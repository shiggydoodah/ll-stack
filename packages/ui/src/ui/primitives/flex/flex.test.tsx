import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Flex, type FlexLayoutProps } from './flex';
import type { FlexAlign, FlexJustify, FlexSpace } from './flex.styles';
import { Row, type RowProps } from './row';
import { Stack, type StackProps } from './stack';

const paddingCases: ReadonlyArray<[FlexSpace, string]> = [
  ['xs', 'p-1'],
  ['sm', 'p-2'],
  ['md', 'p-4'],
  ['lg', 'p-6'],
  ['xl', 'p-8'],
  ['2xl', 'p-12'],
];

const gapCases: ReadonlyArray<[FlexSpace, string]> = [
  ['none', 'gap-0'],
  ['xs', 'gap-1'],
  ['sm', 'gap-2'],
  ['md', 'gap-3'],
  ['lg', 'gap-4'],
  ['xl', 'gap-6'],
  ['2xl', 'gap-8'],
];

const alignCases: ReadonlyArray<[FlexAlign, string]> = [
  ['start', 'items-start'],
  ['center', 'items-center'],
  ['end', 'items-end'],
  ['stretch', 'items-stretch'],
  ['baseline', 'items-baseline'],
];

const justifyCases: ReadonlyArray<[FlexJustify, string]> = [
  ['start', 'justify-start'],
  ['center', 'justify-center'],
  ['end', 'justify-end'],
  ['between', 'justify-between'],
  ['around', 'justify-around'],
  ['evenly', 'justify-evenly'],
];

describe('Stack', () => {
  it('renders a flex column div with children', () => {
    const html = renderToStaticMarkup(<Stack>content</Stack>);

    expect(html).toContain('<div');
    expect(html).toContain('content');
    expect(html).toContain('flex');
    expect(html).toContain('flex-col');
  });

  it('defaults to no padding and zero gap', () => {
    const html = renderToStaticMarkup(<Stack>x</Stack>);

    expect(html).toContain('gap-0');
    expect(html).not.toMatch(/\bp-\d/);
  });

  it.each(paddingCases)('applies padding="%s" as %s', (padding, expected) => {
    const html = renderToStaticMarkup(<Stack padding={padding}>x</Stack>);
    expect(html).toContain(expected);
  });

  it.each(gapCases)('applies gap="%s" as %s', (gap, expected) => {
    const html = renderToStaticMarkup(<Stack gap={gap}>x</Stack>);
    expect(html).toContain(expected);
  });

  it.each(alignCases)('applies align="%s" as %s', (align, expected) => {
    const html = renderToStaticMarkup(<Stack align={align}>x</Stack>);
    expect(html).toContain(expected);
  });

  it.each(justifyCases)('applies justify="%s" as %s', (justify, expected) => {
    const html = renderToStaticMarkup(<Stack justify={justify}>x</Stack>);
    expect(html).toContain(expected);
  });

  it('applies flex-wrap only when wrap is set', () => {
    expect(renderToStaticMarkup(<Stack>x</Stack>)).not.toContain('flex-wrap');
    expect(renderToStaticMarkup(<Stack wrap>x</Stack>)).toContain('flex-wrap');
  });

  it('merges className last so it can override mapped utilities', () => {
    const html = renderToStaticMarkup(
      <Stack padding="md" className="p-8">
        x
      </Stack>,
    );

    expect(html).toContain('p-8');
    expect(html).not.toContain('p-4');
  });

  it('passes through id, aria-* and other native div attributes', () => {
    const html = renderToStaticMarkup(
      <Stack id="region" aria-label="Filters" data-testid="stack">
        x
      </Stack>,
    );

    expect(html).toContain('id="region"');
    expect(html).toContain('aria-label="Filters"');
    expect(html).toContain('data-testid="stack"');
  });

  it('forwards ref through to the Flex base', () => {
    const ref = createRef<HTMLDivElement>();
    expect((Stack({ ref }) as ReactElement<StackProps>).props.ref).toBe(ref);
  });
});

describe('Row', () => {
  it('stacks below sm and becomes a row at sm+ by default (responsive)', () => {
    const html = renderToStaticMarkup(<Row>content</Row>);

    expect(html).toContain('flex-col');
    expect(html).toContain('sm:flex-row');
  });

  it('stays a row at every width when responsive is false', () => {
    const html = renderToStaticMarkup(<Row responsive={false}>content</Row>);

    expect(html).toContain('flex-row');
    expect(html).not.toContain('sm:flex-row');
    expect(html).not.toContain('flex-col');
  });

  it('shares the spacing and alignment props with Stack', () => {
    const html = renderToStaticMarkup(
      <Row gap="sm" padding="lg" align="center" justify="between">
        x
      </Row>,
    );

    expect(html).toContain('gap-2');
    expect(html).toContain('p-6');
    expect(html).toContain('items-center');
    expect(html).toContain('justify-between');
  });

  it('forwards ref through to the Flex base', () => {
    const ref = createRef<HTMLDivElement>();
    expect((Row({ ref }) as ReactElement<RowProps>).props.ref).toBe(ref);
  });
});

describe('Flex (internal base)', () => {
  it('renders a div and forwards ref onto it', () => {
    const ref = createRef<HTMLDivElement>();
    const element = Flex({ direction: 'col', ref }) as ReactElement<FlexLayoutProps>;

    expect(element.type).toBe('div');
    expect(element.props.ref).toBe(ref);
  });
});
