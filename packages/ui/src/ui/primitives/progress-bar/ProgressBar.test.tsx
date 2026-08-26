import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('exposes the progressbar role', () => {
    const html = renderToStaticMarkup(<ProgressBar value={50} />);
    expect(html).toContain('role="progressbar"');
  });

  it('reflects determinate value with aria + inline width', () => {
    const html = renderToStaticMarkup(<ProgressBar value={64} max={100} />);
    expect(html).toContain('aria-valuenow="64"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('width:64%');
  });

  it('clamps values above max to 100%', () => {
    const html = renderToStaticMarkup(<ProgressBar value={150} max={100} />);
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('width:100%');
  });

  it('respects a custom max when computing the fill', () => {
    const html = renderToStaticMarkup(<ProgressBar value={1} max={4} />);
    expect(html).toContain('aria-valuemax="4"');
    expect(html).toContain('width:25%');
  });

  it('omits aria-valuenow and animates when indeterminate', () => {
    const html = renderToStaticMarkup(<ProgressBar indeterminate />);
    expect(html).not.toContain('aria-valuenow');
    expect(html).toContain('animate-progress-indeterminate');
  });

  it('renders the rounded-(--ui-radius-sm) percentage when showValue is set', () => {
    const html = renderToStaticMarkup(<ProgressBar value={42.6} showValue />);
    expect(html).toContain('43%');
  });

  it('does not render a percentage while indeterminate', () => {
    const html = renderToStaticMarkup(<ProgressBar indeterminate showValue />);
    expect(html).not.toContain('%</span>');
  });

  it('renders a label and wires aria-labelledby', () => {
    const html = renderToStaticMarkup(<ProgressBar value={20} label="Uploading" />);
    expect(html).toContain('Uploading');
    expect(html).toContain('aria-labelledby=');
  });

  it('uses aria-label when no visible label is present', () => {
    const html = renderToStaticMarkup(<ProgressBar value={20} aria-label="Loading results" />);
    expect(html).toContain('aria-label="Loading results"');
    expect(html).not.toContain('aria-labelledby');
  });

  it('applies the tone fill class', () => {
    const html = renderToStaticMarkup(<ProgressBar value={50} tone="green" />);
    expect(html).toContain('bg-tone-green');
  });

  it('applies the size track class', () => {
    // `h-1` is the trailing class on the track, so the closing quote disambiguates
    // it from `sm`'s `h-1.5`.
    expect(renderToStaticMarkup(<ProgressBar value={50} size="xs" />)).toContain('h-1"');
    expect(renderToStaticMarkup(<ProgressBar value={50} size="sm" />)).toContain('h-1.5');
    expect(renderToStaticMarkup(<ProgressBar value={50} size="md" />)).toContain('h-2');
    expect(renderToStaticMarkup(<ProgressBar value={50} size="lg" />)).toContain('h-3');
  });

  it('merges a custom className onto the root', () => {
    const html = renderToStaticMarkup(<ProgressBar value={50} className="mt-4" />);
    expect(html).toContain('mt-4');
  });

  // Consumer passthrough must land on the progressbar-role element, not the
  // inert wrapper, so assistive tech associates aria-* with the right node.
  it('relocates consumer aria-* and data-* onto the progressbar element', () => {
    const html = renderToStaticMarkup(
      <ProgressBar value={50} aria-describedby="upload-hint" data-testid="track" />,
    );

    expect(html).toMatch(/<div[^>]*role="progressbar"[^>]*aria-describedby="upload-hint"/);
    expect(html).toMatch(/<div[^>]*role="progressbar"[^>]*data-testid="track"/);
  });
});
