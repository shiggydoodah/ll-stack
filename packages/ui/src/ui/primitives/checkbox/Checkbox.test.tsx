import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox, type CheckboxProps } from './Checkbox';

const getCheckboxProps = (props: CheckboxProps) =>
  (Checkbox(props) as ReactElement<CheckboxProps>).props;

type CheckboxChangeEvent = Parameters<NonNullable<CheckboxProps['onChange']>>[0];

describe('Checkbox', () => {
  it('renders a checkbox input', () => {
    const html = renderToStaticMarkup(<Checkbox checked name="remember" readOnly />);

    expect(html).toContain('<input');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="remember"');
    expect(html).toContain('checked=""');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLInputElement>();

    expect(getCheckboxProps({ checked: false, ref }).ref).toBe(ref);
  });

  it('applies invalid accessibility attributes', () => {
    const html = renderToStaticMarkup(
      <Checkbox checked={false} aria-invalid="true" aria-describedby="remember-error" readOnly />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="remember-error"');
  });

  it('applies disabled state', () => {
    const html = renderToStaticMarkup(<Checkbox checked={false} disabled readOnly />);

    expect(html).toContain('disabled=""');
  });

  it('calls onCheckedChange with the next checked value', () => {
    const onCheckedChange = vi.fn();
    const handleChange = getCheckboxProps({
      checked: false,
      onCheckedChange,
    }).onChange;

    if (!handleChange) {
      throw new Error('Expected Checkbox to render an onChange handler.');
    }

    handleChange({
      currentTarget: { checked: true },
      defaultPrevented: false,
    } as CheckboxChangeEvent);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('does not call onCheckedChange when the change event is prevented', () => {
    const onCheckedChange = vi.fn();
    let defaultPrevented = false;
    const handleChange = getCheckboxProps({
      checked: false,
      onChange: (event) => event.preventDefault(),
      onCheckedChange,
    }).onChange;

    if (!handleChange) {
      throw new Error('Expected Checkbox to render an onChange handler.');
    }

    handleChange({
      currentTarget: { checked: true },
      get defaultPrevented() {
        return defaultPrevented;
      },
      preventDefault: () => {
        defaultPrevented = true;
      },
    } as CheckboxChangeEvent);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
