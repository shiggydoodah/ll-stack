import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Spinner, type SpinnerProps } from './Spinner';

describe('Spinner', () => {
  it('is decorative by default with aria-hidden', () => {
    const html = renderToStaticMarkup(<Spinner />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('aria-label=');
  });

  it('adds aria-label and role="status" when not decorative', () => {
    const html = renderToStaticMarkup(<Spinner decorative={false} label="Loading results" />);

    expect(html).toContain('aria-label="Loading results"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-hidden=');
  });

  it('applies the correct size class', () => {
    const xs = renderToStaticMarkup(<Spinner size="xs" />);
    const lg = renderToStaticMarkup(<Spinner size="lg" />);

    expect(xs).toContain('size-3');
    expect(lg).toContain('size-6');
  });

  it('includes the animate-spin utility', () => {
    const html = renderToStaticMarkup(<Spinner />);

    expect(html).toContain('animate-spin');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Spinner className="text-white" />);

    expect(html).toContain('text-white');
    expect(html).toContain('animate-spin');
  });

  it('passes through svg attributes', () => {
    const html = renderToStaticMarkup(<Spinner data-testid="spinner" />);

    expect(html).toContain('data-testid="spinner"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<SVGSVGElement>();

    expect((Spinner({ ref }) as ReactElement<SpinnerProps>).props.ref).toBe(ref);
  });
});
