import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Skeleton, type SkeletonProps } from './Skeleton';

describe('Skeleton', () => {
  it('renders a decorative text placeholder by default', () => {
    const html = renderToStaticMarkup(<Skeleton />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('ui-skeleton');
    expect(html).toContain('h-2.5');
    expect(html).toContain('w-full');
  });

  it('applies preset classes for heading and button placeholders', () => {
    const headingHtml = renderToStaticMarkup(<Skeleton preset="heading" />);
    const buttonHtml = renderToStaticMarkup(<Skeleton preset="button" />);

    expect(headingHtml).toContain('h-6');
    expect(headingHtml).toContain('w-2/3');
    expect(buttonHtml).toContain('h-10');
    expect(buttonHtml).toContain('w-28');
  });

  it('merges custom classes after preset classes', () => {
    const html = renderToStaticMarkup(<Skeleton preset="button" className="h-12 w-40" />);

    expect(html).toContain('ui-skeleton');
    expect(html).toContain('h-12');
    expect(html).toContain('w-40');
    expect(html).not.toContain('h-10');
    expect(html).not.toContain('w-28');
  });

  it('passes through standard div attributes while staying decorative', () => {
    const html = renderToStaticMarkup(
      <Skeleton id="profile-name-loading" data-slot="profile-name" aria-hidden={false} />,
    );

    expect(html).toContain('id="profile-name-loading"');
    expect(html).toContain('data-slot="profile-name"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLDivElement>();

    expect((Skeleton({ ref }) as ReactElement<SkeletonProps>).props.ref).toBe(ref);
  });
});
