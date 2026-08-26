import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VerifiedBadge } from './verified-badge';

describe('VerifiedBadge', () => {
  it('renders a span with an accessible label', () => {
    const html = renderToStaticMarkup(<VerifiedBadge />);

    expect(html).toContain('<span');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Verified"');
  });

  it('renders a check icon', () => {
    const html = renderToStaticMarkup(<VerifiedBadge />);

    expect(html).toContain('<svg');
  });

  it('applies the default blue solid tone', () => {
    const html = renderToStaticMarkup(<VerifiedBadge />);

    expect(html).toContain('bg-tone-blue');
  });

  it('applies the requested tone', () => {
    const html = renderToStaticMarkup(<VerifiedBadge tone="red" />);

    expect(html).toContain('bg-tone-red');
  });

  it('applies the default medium size token', () => {
    const html = renderToStaticMarkup(<VerifiedBadge />);

    expect(html).toContain('size-5');
  });

  it('applies the requested size token', () => {
    const html = renderToStaticMarkup(<VerifiedBadge size="xlarge" />);

    expect(html).toContain('size-7');
  });

  it('supports a custom accessible label', () => {
    const html = renderToStaticMarkup(<VerifiedBadge label="Staff" />);

    expect(html).toContain('aria-label="Staff"');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<VerifiedBadge className="absolute" />);

    expect(html).toContain('absolute');
  });
});
