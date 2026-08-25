import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FormSection } from './FormSection';

describe('FormSection', () => {
  it('renders a vertical form section', () => {
    const html = renderToStaticMarkup(
      <FormSection aria-label="Account">
        <input name="email" />
      </FormSection>,
    );

    expect(html).toContain('<section');
    expect(html).toContain('aria-label="Account"');
    expect(html).toContain('flex');
    expect(html).toContain('flex-col');
    expect(html).toContain('gap-5');
    expect(html).toContain('name="email"');
  });

  it('merges custom classes', () => {
    const html = renderToStaticMarkup(
      <FormSection className="border-t">
        <input name="password" />
      </FormSection>,
    );

    expect(html).toContain('border-t');
  });
});
