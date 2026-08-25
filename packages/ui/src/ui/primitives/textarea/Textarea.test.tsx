import { createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Textarea, type TextareaProps } from './Textarea';

const getTextareaProps = (props: TextareaProps) =>
  (Textarea(props) as ReactElement<TextareaProps>).props;

describe('Textarea', () => {
  it('renders a textarea', () => {
    const html = renderToStaticMarkup(<Textarea name="bio" />);

    expect(html).toContain('<textarea');
    expect(html).toContain('name="bio"');
  });

  it('passes through a ref prop', () => {
    const ref = createRef<HTMLTextAreaElement>();

    expect(getTextareaProps({ ref }).ref).toBe(ref);
  });

  it('applies invalid accessibility attributes', () => {
    const html = renderToStaticMarkup(
      <Textarea aria-invalid="true" aria-describedby="bio-error" />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="bio-error"');
  });

  it('applies disabled state', () => {
    const html = renderToStaticMarkup(<Textarea disabled />);

    expect(html).toContain('disabled=""');
  });
});
