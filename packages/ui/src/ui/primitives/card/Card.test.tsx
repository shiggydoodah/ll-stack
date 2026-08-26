import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Card } from './Card';

describe('Card', () => {
  it('renders a div with children', () => {
    const html = renderToStaticMarkup(<Card>Body</Card>);

    expect(html).toContain('<div');
    expect(html).toContain('Body');
  });

  it('applies base surface classes', () => {
    const html = renderToStaticMarkup(<Card>Body</Card>);

    expect(html).toContain('rounded-(--ui-radius-lg)');
    expect(html).toContain('bg-(--ui-input-background)');
  });

  it('uses the default border tone by default', () => {
    const html = renderToStaticMarkup(<Card>Body</Card>);

    expect(html).toContain('border-(--ui-border)');
  });

  it('applies the danger border tone', () => {
    const html = renderToStaticMarkup(<Card tone="danger">Body</Card>);

    expect(html).toContain('border-tone-red');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<Card className="p-4">Body</Card>);

    expect(html).toContain('p-4');
  });

  it('passes through standard div attributes', () => {
    const html = renderToStaticMarkup(
      <Card id="panel" data-testid="card">
        Body
      </Card>,
    );

    expect(html).toContain('id="panel"');
    expect(html).toContain('data-testid="card"');
  });
});
