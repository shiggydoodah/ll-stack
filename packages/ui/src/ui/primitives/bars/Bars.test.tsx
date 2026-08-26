import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Bars } from './Bars';

const countBars = (html: string): number => (html.match(/aria-hidden="true"/g) ?? []).length;

describe('Bars', () => {
  it('renders one bar per datum', () => {
    const html = renderToStaticMarkup(
      <Bars aria-label="Chart" data={[{ value: 1 }, { value: 2 }, { value: 3 }]} />,
    );
    expect(countBars(html)).toBe(3);
  });

  it('scales bar heights proportionally to the largest value by default', () => {
    const html = renderToStaticMarkup(
      <Bars aria-label="Chart" data={[{ value: 2 }, { value: 4 }]} />,
    );
    expect(html).toContain('height:50%');
    expect(html).toContain('height:100%');
  });

  it('respects an explicit max as the scale ceiling', () => {
    const html = renderToStaticMarkup(<Bars aria-label="Chart" data={[{ value: 5 }]} max={20} />);
    expect(html).toContain('height:25%');
  });

  it('clamps values above the ceiling to 100%', () => {
    const html = renderToStaticMarkup(<Bars aria-label="Chart" data={[{ value: 50 }]} max={10} />);
    expect(html).toContain('height:100%');
  });

  it('renders empty data without crashing', () => {
    const html = renderToStaticMarkup(<Bars aria-label="Chart" data={[]} />);
    expect(html).toContain('role="img"');
    expect(html).not.toContain('NaN');
  });

  it('renders an all-zero series flat instead of dividing by zero', () => {
    const html = renderToStaticMarkup(
      <Bars aria-label="Chart" data={[{ value: 0 }, { value: 0 }]} />,
    );
    expect(html).toContain('height:0%');
    expect(html).not.toContain('NaN');
  });

  it('exposes role="img" with the required aria-label on the container', () => {
    const html = renderToStaticMarkup(<Bars aria-label="Signups per day" data={[{ value: 1 }]} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Signups per day"');
  });

  it('hides the individual bars from assistive tech', () => {
    const html = renderToStaticMarkup(<Bars aria-label="Chart" data={[{ value: 1 }]} />);
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders the per-bar native title', () => {
    const html = renderToStaticMarkup(
      <Bars aria-label="Chart" data={[{ value: 4, title: '2026-07-01: 4' }]} />,
    );
    expect(html).toContain('title="2026-07-01: 4"');
  });

  it('renders the start/end axis labels only when provided', () => {
    const withLabels = renderToStaticMarkup(
      <Bars
        aria-label="Chart"
        data={[{ value: 1 }]}
        labelStart="2026-06-01"
        labelEnd="2026-06-30"
      />,
    );
    expect(withLabels).toContain('2026-06-01');
    expect(withLabels).toContain('2026-06-30');

    const withoutLabels = renderToStaticMarkup(<Bars aria-label="Chart" data={[{ value: 1 }]} />);
    expect(withoutLabels).not.toContain('justify-between');
  });

  it('merges a custom className onto the container last', () => {
    const html = renderToStaticMarkup(
      <Bars aria-label="Chart" data={[{ value: 1 }]} className="h-32" />,
    );
    expect(html).toContain('h-32');
    expect(html).not.toContain('h-24');
  });
});
