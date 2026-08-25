import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Radio, type RadioProps } from './Radio';

const getRadioProps = (props: RadioProps) => (Radio(props) as ReactElement<RadioProps>).props;

describe('Radio', () => {
  it('renders a radio input', () => {
    const html = renderToStaticMarkup(<Radio name="plan" value="basic" />);

    expect(html).toContain('<input');
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="plan"');
    expect(html).toContain('value="basic"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLInputElement>();

    expect(getRadioProps({ ref }).ref).toBe(ref);
  });

  it('applies invalid accessibility attributes', () => {
    const html = renderToStaticMarkup(<Radio aria-invalid="true" aria-describedby="plan-error" />);

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="plan-error"');
  });

  it('applies disabled state', () => {
    const html = renderToStaticMarkup(<Radio disabled />);

    expect(html).toContain('disabled=""');
  });
});
