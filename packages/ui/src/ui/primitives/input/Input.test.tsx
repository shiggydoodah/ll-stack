import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Input, type InputProps } from './Input';

const getInputProps = (props: InputProps) => (Input(props) as ReactElement<InputProps>).props;

describe('Input', () => {
  it('renders a text input by default', () => {
    const html = renderToStaticMarkup(<Input name="email" />);

    expect(html).toContain('<input');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="email"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLInputElement>();

    expect(getInputProps({ ref }).ref).toBe(ref);
  });

  it('applies invalid accessibility attributes', () => {
    const html = renderToStaticMarkup(<Input aria-invalid="true" aria-describedby="email-error" />);

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-error"');
  });

  it('applies disabled state', () => {
    const html = renderToStaticMarkup(<Input disabled />);

    expect(html).toContain('disabled=""');
  });

  it('renders a check icon when isValid is true', () => {
    const html = renderToStaticMarkup(<Input isValid />);

    expect(html).toContain('<svg');
    expect(html).toContain('<input');
  });

  it('does not render a check icon when isValid is false', () => {
    const html = renderToStaticMarkup(<Input isValid={false} />);

    expect(html).not.toContain('<svg');
    expect(html).toContain('<input');
  });

  it('applies aria attributes on the native input even when isValid is true', () => {
    const html = renderToStaticMarkup(
      <Input isValid aria-invalid="true" aria-describedby="email-error" />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-error"');
  });
});
