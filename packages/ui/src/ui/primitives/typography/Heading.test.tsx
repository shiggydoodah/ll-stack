import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Heading, type HeadingProps } from './Heading';

const expectClassToken = (html: string, token: string) => {
  const [, classAttribute = ''] = html.match(/\sclass="([^"]*)"/) ?? [];

  expect(classAttribute.split(/\s+/)).toContain(token);
};

describe('Heading', () => {
  it('renders an h2 by default', () => {
    const html = renderToStaticMarkup(<Heading>Title</Heading>);

    expect(html).toContain('<h2');
    expect(html).toContain('Title');
  });

  it('renders the specified heading level', () => {
    const h1 = renderToStaticMarkup(<Heading level="h1">H1</Heading>);
    const h4 = renderToStaticMarkup(<Heading level="h4">H4</Heading>);

    expect(h1).toContain('<h1');
    expect(h4).toContain('<h4');
  });

  it('applies level-default size and weight for h2', () => {
    const html = renderToStaticMarkup(<Heading level="h2">Section</Heading>);

    expectClassToken(html, 'text-4xl');
    expectClassToken(html, 'font-black');
  });

  it('applies level-default size and weight for h6', () => {
    const html = renderToStaticMarkup(<Heading level="h6">Small</Heading>);

    expectClassToken(html, 'text-sm');
    expectClassToken(html, 'font-bold');
    expectClassToken(html, 'tracking-widest');
  });

  it('uses a monotonic descending default scale across levels', () => {
    const expectedSizeByLevel = {
      h1: 'text-5xl',
      h2: 'text-4xl',
      h3: 'text-3xl',
      h4: 'text-2xl',
      h5: 'text-base',
      h6: 'text-sm',
    } as const;

    for (const [level, sizeClass] of Object.entries(expectedSizeByLevel)) {
      const html = renderToStaticMarkup(
        <Heading level={level as keyof typeof expectedSizeByLevel}>Title</Heading>,
      );

      expectClassToken(html, sizeClass);
    }
  });

  it('overrides default size when size prop is provided', () => {
    const html = renderToStaticMarkup(
      <Heading level="h1" size="small">
        Small H1
      </Heading>,
    );

    expectClassToken(html, 'text-2xl');
  });

  it('applies tone class', () => {
    const html = renderToStaticMarkup(<Heading tone="muted">Muted</Heading>);

    expectClassToken(html, 'text-(--ui-text-muted)');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Heading className="mb-4">Title</Heading>);

    expectClassToken(html, 'mb-4');
  });

  it('passes through standard heading attributes', () => {
    const html = renderToStaticMarkup(<Heading id="section-title">Title</Heading>);

    expect(html).toContain('id="section-title"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLHeadingElement>();

    expect((Heading({ children: 'Title', ref }) as ReactElement<HeadingProps>).props.ref).toBe(ref);
  });
});

describe('Heading fixed-level helpers', () => {
  it('Heading.H1 renders an h1 with h1 defaults', () => {
    const html = renderToStaticMarkup(<Heading.H1>Page title</Heading.H1>);

    expect(html).toContain('<h1');
    expectClassToken(html, 'text-5xl');
  });

  it('Heading.H3 renders an h3', () => {
    const html = renderToStaticMarkup(<Heading.H3>Section</Heading.H3>);

    expect(html).toContain('<h3');
    expectClassToken(html, 'font-extrabold');
  });

  it('Heading.H6 renders an h6', () => {
    const html = renderToStaticMarkup(<Heading.H6>Label</Heading.H6>);

    expect(html).toContain('<h6');
  });

  it('fixed helpers accept size override', () => {
    const html = renderToStaticMarkup(<Heading.H2 size="2xl">Big H2</Heading.H2>);

    expectClassToken(html, 'text-8xl');
  });
});
