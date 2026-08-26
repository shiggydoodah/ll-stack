import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Text, type TextProps } from './Text';

const expectClassToken = (html: string, token: string) => {
  const [, classAttribute = ''] = html.match(/\sclass="([^"]*)"/) ?? [];

  expect(classAttribute.split(/\s+/)).toContain(token);
};

describe('Text', () => {
  it('renders a span by default', () => {
    const html = renderToStaticMarkup(<Text>Body copy</Text>);

    expect(html).toContain('<span');
    expect(html).toContain('Body copy');
    expect(html).not.toContain('<p');
  });

  it('renders the specified element', () => {
    const p = renderToStaticMarkup(<Text as="p">Paragraph</Text>);
    const label = renderToStaticMarkup(<Text as="label">Label</Text>);

    expect(p).toContain('<p');
    expect(label).toContain('<label');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLElement>();

    expect((Text({ children: 'Body', ref }) as ReactElement<TextProps>).props.ref).toBe(ref);
  });

  it('applies default size, weight, tracking, and leading', () => {
    const html = renderToStaticMarkup(<Text>Default</Text>);

    expectClassToken(html, 'text-base');
    expectClassToken(html, 'font-normal');
    expectClassToken(html, 'tracking-normal');
    expectClassToken(html, 'leading-normal');
  });

  it('applies the body font family and default tone', () => {
    const html = renderToStaticMarkup(<Text>Default</Text>);

    expectClassToken(html, '[font-family:var(--ui-font-body)]');
    expectClassToken(html, 'text-(--ui-foreground)');
  });

  it('overrides default size when size prop is provided', () => {
    const small = renderToStaticMarkup(<Text size="small">Small</Text>);
    const tiny = renderToStaticMarkup(<Text size="2xs">Tiny</Text>);

    expectClassToken(small, 'text-sm');
    expectClassToken(tiny, 'text-xs');
  });

  it('applies tone classes', () => {
    const subtle = renderToStaticMarkup(<Text tone="subtle">Subtle</Text>);
    const muted = renderToStaticMarkup(<Text tone="muted">Muted</Text>);

    expectClassToken(subtle, 'text-(--ui-text-subtle)');
    expectClassToken(muted, 'text-(--ui-text-muted)');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Text className="mb-4">Body</Text>);

    expectClassToken(html, 'mb-4');
  });

  it('passes through standard attributes', () => {
    const html = renderToStaticMarkup(<Text id="body-copy">Body</Text>);

    expect(html).toContain('id="body-copy"');
  });
});

describe('Text fixed-element helpers', () => {
  it('Text.P renders a p with text defaults', () => {
    const html = renderToStaticMarkup(<Text.P>Paragraph</Text.P>);

    expect(html).toContain('<p');
    expectClassToken(html, 'text-base');
  });

  it('Text.Label renders a label and passes htmlFor', () => {
    const html = renderToStaticMarkup(<Text.Label htmlFor="email">Email</Text.Label>);

    expect(html).toContain('<label');
    expect(html).toContain('for="email"');
  });

  it('Text.Span renders a span', () => {
    const html = renderToStaticMarkup(<Text.Span>Inline</Text.Span>);

    expect(html).toContain('<span');
  });

  it('fixed helpers accept size override', () => {
    const html = renderToStaticMarkup(<Text.P size="large">Large paragraph</Text.P>);

    expectClassToken(html, 'text-lg');
  });

  it('fixed helpers accept tone', () => {
    const html = renderToStaticMarkup(<Text.Span tone="accent">Accent</Text.Span>);

    expectClassToken(html, 'text-(--ui-accent)');
  });
});
