import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Box, type BoxProps } from './box';
import type { BoxMaxWidth, BoxPadding, BoxVariant } from './box.styles';

const paddingCases: ReadonlyArray<[BoxPadding, string]> = [
  ['xs', 'p-1'],
  ['sm', 'p-2'],
  ['md', 'p-4'],
  ['lg', 'p-6'],
  ['xl', 'p-8'],
  ['2xl', 'p-12'],
];

const maxWidthCases: ReadonlyArray<[BoxMaxWidth, string]> = [
  ['xs', 'max-w-xs'],
  ['sm', 'max-w-sm'],
  ['md', 'max-w-md'],
  ['lg', 'max-w-lg'],
  ['xl', 'max-w-xl'],
];

const filledVariantCases: ReadonlyArray<[Exclude<BoxVariant, 'ghost' | 'outline'>, string]> = [
  ['surface', 'bg-(--ui-background-subtle)'],
  ['soft', 'bg-(--ui-background-muted)'],
];

describe('Box', () => {
  it('renders a div with children', () => {
    const html = renderToStaticMarkup(<Box>content</Box>);

    expect(html).toContain('<div');
    expect(html).toContain('content');
  });

  it('is a transparent, border-less div by default (ghost)', () => {
    const html = renderToStaticMarkup(<Box>x</Box>);

    expect(html).not.toContain('rounded-(--ui-radius-lg)');
    expect(html).not.toContain('border-(--ui-border)');
    expect(html).not.toContain('bg-(--ui-background');
    expect(html).not.toMatch(/\bp-\d/);
    expect(html).not.toMatch(/\bmax-w-/);
  });

  it.each(filledVariantCases)(
    'applies variant="%s" as a bordered, rounded-(--ui-radius-sm) surface with %s',
    (variant, expectedBg) => {
      const html = renderToStaticMarkup(<Box variant={variant}>x</Box>);

      expect(html).toContain('rounded-(--ui-radius-lg)');
      expect(html).toContain('border-(--ui-border)');
      expect(html).toContain(expectedBg);
    },
  );

  it('applies variant="outline" as a bordered, transparent container', () => {
    const html = renderToStaticMarkup(<Box variant="outline">x</Box>);

    expect(html).toContain('rounded-(--ui-radius-lg)');
    expect(html).toContain('border-(--ui-border)');
    expect(html).toContain('bg-transparent');
    expect(html).not.toContain('bg-(--ui-background');
  });

  it.each(paddingCases)('applies padding="%s" as %s', (padding, expected) => {
    const html = renderToStaticMarkup(<Box padding={padding}>x</Box>);
    expect(html).toContain(expected);
  });

  it.each(maxWidthCases)('applies maxWidth="%s" as %s', (maxWidth, expected) => {
    const html = renderToStaticMarkup(<Box maxWidth={maxWidth}>x</Box>);
    expect(html).toContain(expected);
  });

  it('merges className last so it can override mapped utilities', () => {
    const html = renderToStaticMarkup(
      <Box padding="md" className="p-8">
        x
      </Box>,
    );

    expect(html).toContain('p-8');
    expect(html).not.toContain('p-4');
  });

  it('passes through id, aria-* and other native div attributes', () => {
    const html = renderToStaticMarkup(
      <Box id="panel" aria-label="Summary" data-testid="box">
        x
      </Box>,
    );

    expect(html).toContain('id="panel"');
    expect(html).toContain('aria-label="Summary"');
    expect(html).toContain('data-testid="box"');
  });

  it('renders a div and forwards ref onto it', () => {
    const ref = createRef<HTMLDivElement>();
    const element = Box({ ref }) as ReactElement<BoxProps>;

    expect(element.type).toBe('div');
    expect(element.props.ref).toBe(ref);
  });
});
