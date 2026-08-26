import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Display, type DisplayProps } from './Display';

describe('Display', () => {
  it('always renders a span regardless of level', () => {
    const html = renderToStaticMarkup(<Display level="h1">Hero text</Display>);

    expect(html).toContain('<span');
    expect(html).not.toContain('<h1');
  });

  it('defaults to h2 visual scale', () => {
    const html = renderToStaticMarkup(<Display>Display text</Display>);

    expect(html).toContain('text-4xl');
    expect(html).toContain('font-black');
  });

  it('applies h1 visual scale when level="h1"', () => {
    const html = renderToStaticMarkup(<Display level="h1">Hero</Display>);

    expect(html).toContain('text-5xl');
  });

  it('overrides default size when size prop is provided', () => {
    const html = renderToStaticMarkup(
      <Display level="h1" size="small">
        Small display
      </Display>,
    );

    expect(html).toContain('text-2xl');
  });

  it('applies tone class', () => {
    const html = renderToStaticMarkup(<Display tone="accent">Accent</Display>);

    expect(html).toContain('text-(--ui-accent)');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Display className="my-8">Display</Display>);

    expect(html).toContain('my-8');
  });

  it('passes through standard span attributes', () => {
    const html = renderToStaticMarkup(<Display id="hero-text">Display</Display>);

    expect(html).toContain('id="hero-text"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLSpanElement>();

    expect((Display({ children: 'Hero', ref }) as ReactElement<DisplayProps>).props.ref).toBe(ref);
  });
});

describe('Display fixed-level helpers', () => {
  it('Display.H1 renders a span with h1 visual scale', () => {
    const html = renderToStaticMarkup(<Display.H1>Hero</Display.H1>);

    expect(html).toContain('<span');
    expect(html).not.toContain('<h1');
    expect(html).toContain('text-5xl');
  });

  it('Display.H4 renders a span with h4 visual scale', () => {
    const html = renderToStaticMarkup(<Display.H4>Sub-display</Display.H4>);

    expect(html).toContain('<span');
    expect(html).toContain('font-bold');
  });

  it('fixed helpers accept size override', () => {
    const html = renderToStaticMarkup(<Display.H3 size="xs">Small</Display.H3>);

    expect(html).toContain('text-base');
  });
});
