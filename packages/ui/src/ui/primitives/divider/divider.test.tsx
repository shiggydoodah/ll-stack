import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Divider, type DividerProps } from './divider';

describe('Divider', () => {
  it('renders a separator div', () => {
    const html = renderToStaticMarkup(<Divider />);
    expect(html).toContain('role="separator"');
  });

  it('renders a single line with no label', () => {
    const html = renderToStaticMarkup(<Divider />);
    expect(html).toContain('flex-1');
  });

  it('renders a label', () => {
    const html = renderToStaticMarkup(<Divider label="or" />);
    expect(html).toContain('or');
  });

  it('defaults to center alignment — two lines flank the label', () => {
    const html = renderToStaticMarkup(<Divider label="or" />);
    const lineCount = (html.match(/flex-1/g) ?? []).length;
    expect(lineCount).toBe(2);
  });

  it('start alignment — one trailing line', () => {
    const html = renderToStaticMarkup(<Divider label="Section" labelAlign="start" />);
    const lineCount = (html.match(/flex-1/g) ?? []).length;
    expect(lineCount).toBe(1);
  });

  it('end alignment — one leading line', () => {
    const html = renderToStaticMarkup(<Divider label="Section" labelAlign="end" />);
    const lineCount = (html.match(/flex-1/g) ?? []).length;
    expect(lineCount).toBe(1);
  });

  it('applies neutral tone class by default', () => {
    const html = renderToStaticMarkup(<Divider />);
    expect(html).toContain('text-(--ui-foreground)/20');
  });

  it('applies strong tone class', () => {
    const html = renderToStaticMarkup(<Divider tone="strong" />);
    expect(html).toContain('text-(--ui-foreground)/40');
  });

  it('applies subtle tone class', () => {
    const html = renderToStaticMarkup(<Divider tone="subtle" />);
    expect(html).toContain('text-(--ui-foreground)/10');
  });

  it('applies medium thickness', () => {
    const html = renderToStaticMarkup(<Divider thickness="medium" />);
    expect(html).toContain('h-0.5');
  });

  it('applies thick thickness', () => {
    const html = renderToStaticMarkup(<Divider thickness="thick" />);
    expect(html).toContain('h-[3px]');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Divider className="my-6" />);
    expect(html).toContain('my-6');
  });

  it('passes through standard div attributes', () => {
    const html = renderToStaticMarkup(<Divider id="my-divider" data-testid="divider" />);
    expect(html).toContain('id="my-divider"');
    expect(html).toContain('data-testid="divider"');
  });

  it('lets consumer props override the built-in attributes', () => {
    const html = renderToStaticMarkup(<Divider role="presentation" />);
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain('role="separator"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLDivElement>();
    expect((Divider({ ref }) as ReactElement<DividerProps>).props.ref).toBe(ref);
  });
});
