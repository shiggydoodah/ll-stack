import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CountBadge } from './count-badge';

describe('CountBadge', () => {
  it('renders the count', () => {
    const html = renderToStaticMarkup(<CountBadge count={3} />);

    expect(html).toContain('<span');
    expect(html).toContain('3');
  });

  it('renders nothing when the count is zero', () => {
    const html = renderToStaticMarkup(<CountBadge count={0} />);

    expect(html).toBe('');
  });

  it('renders nothing when the count is absent', () => {
    const html = renderToStaticMarkup(<CountBadge />);

    expect(html).toBe('');
  });

  it('renders zero when showZero is set', () => {
    const html = renderToStaticMarkup(<CountBadge count={0} showZero />);

    expect(html).toContain('>0<');
  });

  it('clamps to the default max with a plus suffix', () => {
    const html = renderToStaticMarkup(<CountBadge count={1280} />);

    expect(html).toContain('99+');
  });

  it('uses a custom max threshold', () => {
    const html = renderToStaticMarkup(<CountBadge count={12} max={9} />);

    expect(html).toContain('9+');
  });

  it('applies the default red solid tone', () => {
    const html = renderToStaticMarkup(<CountBadge count={1} />);

    expect(html).toContain('bg-tone-red');
    expect(html).toContain('text-tone-red-contrast');
  });

  it('applies tone and variant classes', () => {
    const html = renderToStaticMarkup(<CountBadge count={1} tone="green" variant="surface" />);

    expect(html).toContain('bg-tone-green/20');
  });

  it('renders as a circle/pill', () => {
    const html = renderToStaticMarkup(<CountBadge count={5} />);

    expect(html).toContain('rounded-full');
    expect(html).toContain('tabular-nums');
  });

  it('renders a bare dot with no number in dot mode', () => {
    const html = renderToStaticMarkup(<CountBadge dot />);

    expect(html).toContain('rounded-full');
    expect(html).toContain('bg-tone-red');
    expect(html).not.toContain('tabular-nums');
  });

  it('applies the halo ring when ring is set', () => {
    const html = renderToStaticMarkup(<CountBadge count={1} ring />);

    expect(html).toContain('ring-(--ui-background)');
  });

  it('passes through standard span attributes', () => {
    const html = renderToStaticMarkup(<CountBadge count={3} aria-label="3 unread" />);

    expect(html).toContain('aria-label="3 unread"');
  });

  it('adds role="img" to the bare dot when an aria-label is provided', () => {
    const html = renderToStaticMarkup(<CountBadge dot aria-label="Unread" />);

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Unread"');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<CountBadge count={1} className="absolute" />);

    expect(html).toContain('absolute');
  });
});
