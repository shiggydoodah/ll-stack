import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LoadingDots } from './LoadingDots';

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

    expect(sm).toContain('size-4');
    expect(xl).toContain('size-8');
  });

  it('renders three animated circles', () => {
    const html = renderToStaticMarkup(<LoadingDots />);

    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain('repeatCount="indefinite"');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<LoadingDots className="opacity-50" />);

    expect(html).toContain('opacity-50');
  });

  it('passes through svg attributes', () => {
    const html = renderToStaticMarkup(<LoadingDots data-testid="loading" />);

    expect(html).toContain('data-testid="loading"');
  });
});
