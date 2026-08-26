import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Eyebrow, type EyebrowProps } from './Eyebrow';

const getClassTokens = (htmlFragment: string) => {
  const [, classAttribute = ''] = htmlFragment.match(/\sclass="([^"]*)"/) ?? [];

  return classAttribute.split(/\s+/);
};

const getFirstMatch = (html: string, pattern: RegExp) => {
  const [match] = html.match(pattern) ?? [];

  expect(match).toBeDefined();

  return match ?? '';
};

describe('Eyebrow', () => {
  it('renders the children text', () => {
    const html = renderToStaticMarkup(<Eyebrow>Section label</Eyebrow>);

    expect(html).toContain('Section label');
  });

  it('includes a decorative rule hidden from assistive tech', () => {
    const html = renderToStaticMarkup(<Eyebrow>Label</Eyebrow>);

    expect(html).toContain('aria-hidden="true"');
  });

  it('applies uppercase tracking-widest typography classes', () => {
    const html = renderToStaticMarkup(<Eyebrow>Label</Eyebrow>);

    expect(html).toContain('uppercase');
    expect(html).toContain('tracking-[0.18em]');
  });

  it('applies horizontal variant classes by default', () => {
    const html = renderToStaticMarkup(<Eyebrow>Label</Eyebrow>);

    expect(html).toContain('w-[18px]');
    expect(html).toContain('h-[2px]');
  });

  it('applies vertical rule height for vertical variant', () => {
    const html = renderToStaticMarkup(<Eyebrow variant="vertical">Label</Eyebrow>);

    expect(html).toContain('h-8');
    expect(html).toContain('w-0.5');
  });

  it('stacked variant stacks rule above text', () => {
    const html = renderToStaticMarkup(<Eyebrow variant="stacked">Label</Eyebrow>);

    expect(html).toContain('flex-col');
  });

  it('applies block display by default', () => {
    const html = renderToStaticMarkup(<Eyebrow>Label</Eyebrow>);
    const tokens = getClassTokens(html);

    expect(tokens).toContain('flex');
    expect(tokens).not.toContain('inline-flex');
  });

  it('applies inline-flex for display="inline"', () => {
    const html = renderToStaticMarkup(<Eyebrow display="inline">Inline</Eyebrow>);

    expect(html).toContain('inline-flex');
  });

  it('applies size class for size="large"', () => {
    const html = renderToStaticMarkup(<Eyebrow size="large">Large</Eyebrow>);

    expect(html).toContain('text-base');
  });

  it('applies accent tone by default', () => {
    const html = renderToStaticMarkup(<Eyebrow>Accent</Eyebrow>);

    expect(getClassTokens(html)).toContain('text-(--ui-accent)');
  });

  it('applies the shared default font color tone', () => {
    const html = renderToStaticMarkup(<Eyebrow tone="default">Default</Eyebrow>);

    expect(getClassTokens(html)).toContain('text-(--ui-foreground)');
  });

  it('applies shared font color tone overrides to the rule and text', () => {
    const html = renderToStaticMarkup(
      <Eyebrow lineTone="muted" textTone="subtle">
        Label
      </Eyebrow>,
    );
    const lineSpan = getFirstMatch(html, /<span[^>]*aria-hidden="true"[^>]*>/);
    const textSpan = getFirstMatch(html, /<span[^>]*>Label<\/span>/);

    expect(getClassTokens(lineSpan)).toContain('text-(--ui-text-muted)');
    expect(getClassTokens(textSpan)).toContain('text-(--ui-text-subtle)');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Eyebrow className="mb-6">Label</Eyebrow>);

    expect(html).toContain('mb-6');
  });

  it('passes through standard span attributes', () => {
    const html = renderToStaticMarkup(<Eyebrow id="section-eyebrow">Label</Eyebrow>);

    expect(html).toContain('id="section-eyebrow"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLSpanElement>();

    expect((Eyebrow({ children: 'Label', ref }) as ReactElement<EyebrowProps>).props.ref).toBe(ref);
  });

  it('applies lineClassName to the decorative rule', () => {
    const html = renderToStaticMarkup(<Eyebrow lineClassName="opacity-50">Label</Eyebrow>);
    const lineSpan = getFirstMatch(html, /<span[^>]*aria-hidden="true"[^>]*>/);

    expect(getClassTokens(lineSpan)).toContain('opacity-50');
  });

  it('applies textClassName to the text span', () => {
    const html = renderToStaticMarkup(<Eyebrow textClassName="truncate">Label text</Eyebrow>);
    const textSpan = getFirstMatch(html, /<span[^>]*>Label text<\/span>/);

    expect(getClassTokens(textSpan)).toContain('truncate');
  });
});
