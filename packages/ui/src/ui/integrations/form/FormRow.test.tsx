import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FormRow } from './FormRow';

describe('FormRow', () => {
  it('renders a full-width medium-gap row by default', () => {
    const html = renderToStaticMarkup(
      <FormRow>
        <input name="firstName" />
        <input name="lastName" />
      </FormRow>,
    );

    expect(html).toContain('grid');
    expect(html).toContain('gap-4');
    expect(html).toContain('w-full');
    expect(html).toContain('name="firstName"');
    expect(html).toContain('name="lastName"');
  });

  it('applies gap and width overrides', () => {
    const html = renderToStaticMarkup(
      <FormRow gap="large" fullWidth={false} className="items-start">
        <input name="email" />
      </FormRow>,
    );
    const className = html.match(/class="([^"]+)"/)?.[1] ?? '';
    const classTokens = className.split(' ');

    expect(html).toContain('gap-6');
    expect(classTokens).toContain('w-fit');
    expect(classTokens).toContain('max-w-full');
    expect(classTokens).toContain('items-start');
    expect(classTokens).not.toContain('w-full');
  });
});
