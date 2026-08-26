import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LoadingDots, type LoadingDotsProps } from './LoadingDots';

/**
 * Class tokens on the rendered root element. Exact membership rather than a
 * substring scan of the markup, so `size-4` cannot be satisfied by `size-40`
 * (or by the class landing on a child instead of the root).
 */
const rootClassList = (html: string) =>
  (/^<[^>]*\sclass="([^"]*)"/.exec(html)?.[1] ?? '').split(/\s+/).filter(Boolean);

describe('LoadingDots', () => {
  it('is decorative by default with aria-hidden', () => {
    const html = renderToStaticMarkup(<LoadingDots />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('aria-label=');
  });

  it('adds aria-label and role="status" when not decorative', () => {
    const html = renderToStaticMarkup(<LoadingDots decorative={false} label="Loading posts" />);

    expect(html).toContain('aria-label="Loading posts"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-hidden=');
  });

  it('applies the correct size class', () => {
    const sm = renderToStaticMarkup(<LoadingDots size="sm" />);
    const xl = renderToStaticMarkup(<LoadingDots size="xl" />);

    expect(rootClassList(sm)).toContain('size-4');
    expect(rootClassList(xl)).toContain('size-8');
  });

  // CSS animation (not SMIL) so the global prefers-reduced-motion reset applies.
  it('renders three circles bouncing via CSS with a stagger', () => {
    const html = renderToStaticMarkup(<LoadingDots />);

    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html.match(/animate-bounce/g)).toHaveLength(3);
    expect(html).toContain('[animation-delay:0.15s]');
    expect(html).toContain('[animation-delay:0.3s]');
    expect(html).not.toContain('<animate');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<LoadingDots className="opacity-50" />);

    expect(rootClassList(html)).toContain('opacity-50');
  });

  it('passes through svg attributes', () => {
    const html = renderToStaticMarkup(<LoadingDots data-testid="loading" />);

    expect(html).toContain('data-testid="loading"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<SVGSVGElement>();

    expect((LoadingDots({ ref }) as ReactElement<LoadingDotsProps>).props.ref).toBe(ref);
  });
});
