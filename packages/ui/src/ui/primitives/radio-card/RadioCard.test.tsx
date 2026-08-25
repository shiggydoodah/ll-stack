import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RadioCard } from './RadioCard';

describe('RadioCard', () => {
  it('renders a button with children', () => {
    const html = renderToStaticMarkup(<RadioCard selected={false}>Public</RadioCard>);

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('Public');
  });

  it('applies unselected styling by default', () => {
    const html = renderToStaticMarkup(<RadioCard selected={false}>Public</RadioCard>);

    expect(html).toContain('border-(--ui-border-strong)');
    expect(html).not.toContain('data-selected');
  });

  it('applies selected styling and marker', () => {
    const html = renderToStaticMarkup(<RadioCard selected>Public</RadioCard>);

    expect(html).toContain('data-selected="true"');
    expect(html).toContain('border-tone-red');
    expect(html).toContain('bg-tone-red/10');
  });

  it('renders a round radio indicator by default', () => {
    const html = renderToStaticMarkup(<RadioCard selected>Public</RadioCard>);

    expect(html).toContain('rounded-full');
  });

  it('renders a checkbox indicator when requested', () => {
    const html = renderToStaticMarkup(
      <RadioCard selected indicator="checkbox">
        Gallery
      </RadioCard>,
    );

    expect(html).toContain('rounded-(--ui-radius-sm)');
  });

  it('passes through standard button attributes', () => {
    const html = renderToStaticMarkup(
      <RadioCard selected={false} role="radio" aria-checked={false}>
        Public
      </RadioCard>,
    );

    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="false"');
  });
});
