import { Children, createRef, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Select, type SelectProps } from './Select';

type SelectWrapperProps = {
  children?: ReactNode;
};

type NativeSelectElement = ReactElement<SelectProps, 'select'>;

const isNativeSelectElement = (node: ReactNode): node is NativeSelectElement =>
  isValidElement<SelectProps>(node) && node.type === 'select';

const getNativeSelectProps = (props: SelectProps) => {
  const element = Select(props) as ReactElement<SelectWrapperProps>;
  const selectElement = Children.toArray(element.props.children).find(isNativeSelectElement);

  if (!selectElement) {
    throw new Error('Expected Select to render a native select element.');
  }

  return selectElement.props;
};

describe('Select', () => {
  it('renders a native select', () => {
    const html = renderToStaticMarkup(
      <Select name="country">
        <option value="gb">United Kingdom</option>
      </Select>,
    );

    expect(html).toContain('<select');
    expect(html).toContain('name="country"');
    expect(html).toContain('<option value="gb">United Kingdom</option>');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLSelectElement>();

    expect(getNativeSelectProps({ ref }).ref).toBe(ref);
  });

  it('renders a decorative chevron', () => {
    const html = renderToStaticMarkup(<Select />);

    expect(html).toContain('aria-hidden="true"');
  });

  it('applies invalid accessibility attributes', () => {
    const html = renderToStaticMarkup(
      <Select aria-invalid="true" aria-describedby="country-error" />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="country-error"');
  });

  it('applies disabled state', () => {
    const html = renderToStaticMarkup(<Select disabled />);

    expect(html).toContain('disabled=""');
  });

  it('applies containerClassName to the wrapper span', () => {
    const html = renderToStaticMarkup(<Select containerClassName="max-w-xs" />);

    expect(html).toMatch(/<span[^>]*class="[^"]*max-w-xs/);
    expect(html).not.toMatch(/<select[^>]*max-w-xs/);
  });
});
