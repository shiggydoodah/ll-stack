import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusDot } from './status-dot';

describe('StatusDot', () => {
  it('renders a span', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" />);

    expect(html).toContain('<span');
  });

  it('applies the tone fill', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" />);

    expect(html).toContain('bg-tone-green');
  });

  it('uses a muted fill for the neutral (offline) tone', () => {
    const html = renderToStaticMarkup(<StatusDot tone="neutral" />);

    expect(html).toContain('bg-(--ui-text-subtle)');
  });

  it('applies the default medium size token', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" />);

    expect(html).toContain('size-2.5');
  });

  it('applies the requested size token', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" size="xlarge" />);

    expect(html).toContain('size-3.5');
  });

  it('renders an animated ping when pulse is set', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" pulse />);

    expect(html).toContain('animate-ping');
  });

  it('omits the ping by default', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" />);

    expect(html).not.toContain('animate-ping');
  });

  it('applies the halo ring when ring is set', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" ring />);

    expect(html).toContain('ring-(--ui-background)');
  });

  it('renders a label pill when label is provided', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" label="Online" />);

    expect(html).toContain('Online');
    expect(html).toContain('rounded-full');
    expect(html).toContain('ui-display-text');
  });

  it('passes through standard span attributes', () => {
    const html = renderToStaticMarkup(
      <StatusDot tone="green" aria-label="Online" data-testid="dot" />,
    );

    expect(html).toContain('aria-label="Online"');
    expect(html).toContain('data-testid="dot"');
  });

  it('adds role="img" to a bare dot when an aria-label is provided', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" aria-label="Online" />);

    expect(html).toContain('role="img"');
  });

  it('stays role-less when the bare dot has no aria-label', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" />);

    expect(html).not.toContain('role=');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<StatusDot tone="green" className="absolute" />);

    expect(html).toContain('absolute');
  });
});
