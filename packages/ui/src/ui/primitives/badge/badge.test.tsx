import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge, type BadgeProps } from './badge';

describe('Badge', () => {
  it('defaults to the neutral surface treatment', () => {
    const html = renderToStaticMarkup(<Badge>Draft</Badge>);

    expect(html).toContain('border-(--ui-foreground)/20');
    expect(html).toContain('bg-(--ui-foreground)/10');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLSpanElement>();

    expect((Badge({ children: 'x', ref }) as ReactElement<BadgeProps>).props.ref).toBe(ref);
  });

  it('renders a span with children', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="red">
        New
      </Badge>,
    );

    expect(html).toContain('<span');
    expect(html).toContain('New');
  });

  it('applies base classes', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="red">
        Label
      </Badge>,
    );

    expect(html).toContain('ui-display-text');
  });

  it('applies tone and variant classes for solid', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="red">
        Active
      </Badge>,
    );

    expect(html).toContain('bg-tone-red');
    expect(html).toContain('text-tone-red-contrast');
  });

  it('applies tone and variant classes for surface', () => {
    const html = renderToStaticMarkup(
      <Badge variant="surface" tone="green">
        Status
      </Badge>,
    );

    expect(html).toContain('bg-tone-green/20');
    expect(html).toContain('text-tone-green');
  });

  it('applies outline variant', () => {
    const html = renderToStaticMarkup(
      <Badge variant="outline" tone="blue">
        Info
      </Badge>,
    );

    expect(html).toContain('bg-transparent');
    expect(html).toContain('border-tone-blue');
  });

  it('applies neutral solid variant using CSS vars', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="neutral">
        Default
      </Badge>,
    );

    expect(html).toContain('bg-(--ui-foreground)');
  });

  it('does not set data-theme', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="red">
        Status
      </Badge>,
    );

    expect(html).not.toContain('data-theme');
  });

  it('passes through standard span attributes', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="red" id="status-badge" data-testid="badge">
        Status
      </Badge>,
    );

    expect(html).toContain('id="status-badge"');
    expect(html).toContain('data-testid="badge"');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(
      <Badge variant="solid" tone="red" className="my-4">
        Label
      </Badge>,
    );

    expect(html).toContain('my-4');
  });
});
