import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CheckboxButton } from './CheckboxButton';

describe('CheckboxButton', () => {
  it('renders a button with children', () => {
    const html = renderToStaticMarkup(<CheckboxButton>Foo</CheckboxButton>);

    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('Foo');
  });

  it('applies base classes', () => {
    const html = renderToStaticMarkup(<CheckboxButton>FooBar</CheckboxButton>);

    expect(html).toContain('ui-display-text');
    expect(html).toContain('rounded-(--ui-radius-sm)');
  });

  it('is unchecked and uses unselected styling by default', () => {
    const html = renderToStaticMarkup(<CheckboxButton>Foobar</CheckboxButton>);

    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('border-(--ui-border-strong)');
  });

  it('reflects the selected state', () => {
    const html = renderToStaticMarkup(<CheckboxButton selected>Foo</CheckboxButton>);

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('bg-(--ui-accent)');
    expect(html).toContain('text-(--ui-accent-contrast)');
  });

  it('applies the small size token', () => {
    const html = renderToStaticMarkup(<CheckboxButton size="small">Foo</CheckboxButton>);

    expect(html).toContain('text-2xs');
  });

  it('passes through standard button attributes', () => {
    const html = renderToStaticMarkup(
      <CheckboxButton disabled data-testid="checkbox-button">
        Foo
      </CheckboxButton>,
    );

    expect(html).toContain('disabled');
    expect(html).toContain('data-testid="checkbox-button"');
  });

  it('merges custom className', () => {
    const html = renderToStaticMarkup(<CheckboxButton className="m-1">Foo</CheckboxButton>);

    expect(html).toContain('m-1');
  });
});
