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
    expect(html).toContain('border-(--ui-accent)');
    expect(html).toContain('bg-(--ui-accent)/10');
  });

  // Radio semantics stay opt-in: role="radio" obliges an APG radiogroup's
  // keyboard behaviour, which the card cannot supply on its own.
  it('declares no ARIA role of its own', () => {
    const unselected = renderToStaticMarkup(<RadioCard selected={false}>Public</RadioCard>);
    const selected = renderToStaticMarkup(<RadioCard selected>Public</RadioCard>);

    expect(unselected).not.toContain('role=');
    expect(unselected).not.toContain('aria-checked');
    expect(selected).not.toContain('aria-checked');
  });

  it('lets consumers declare radio semantics', () => {
    const html = renderToStaticMarkup(
      <RadioCard selected aria-checked role="radio">
        Public
      </RadioCard>,
    );

    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
  });

  it('lets consumers declare checkbox semantics for multi-select', () => {
    const html = renderToStaticMarkup(
      <RadioCard selected indicator="checkbox" role="checkbox">
        Gallery
      </RadioCard>,
    );

    expect(html).toContain('role="checkbox"');
    expect(html).not.toContain('role="radio"');
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
      <RadioCard selected={false} data-testid="radio-card" disabled>
        Public
      </RadioCard>,
    );

    expect(html).toContain('data-testid="radio-card"');
    expect(html).toContain('disabled');
  });
});
