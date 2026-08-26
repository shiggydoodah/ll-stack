// @vitest-environment jsdom

import { act, createRef, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { Input, type InputProps } from './Input';

const getWrapperChildren = (props: InputProps) =>
  (Input(props) as ReactElement<{ children: ReactElement<InputProps>[] }>).props.children;

const getInputProps = (props: InputProps) => {
  const [inputElement] = getWrapperChildren(props);

  if (!inputElement) {
    throw new Error('Expected Input to render a native input element.');
  }

  return inputElement.props;
};

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

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

  it('reserves trailing padding only while a validation state is in play', () => {
    expect(renderToStaticMarkup(<Input />)).not.toContain('pr-10');
    expect(renderToStaticMarkup(<Input isPending />)).toContain('pr-10');
    expect(renderToStaticMarkup(<Input isValid={false} />)).toContain('pr-10');
  });

  it('applies aria attributes on the native input even when isValid is true', () => {
    const html = renderToStaticMarkup(
      <Input isValid aria-invalid="true" aria-describedby="email-error" />,
    );

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-error"');
  });

  it('labels the pending spinner "Checking" by default and accepts an override', () => {
    expect(renderToStaticMarkup(<Input isPending />)).toContain('aria-label="Checking"');
    expect(renderToStaticMarkup(<Input isPending pendingLabel="Vérification" />)).toContain(
      'aria-label="Vérification"',
    );
  });

  // Regression: the input previously moved between a bare and a wrapped tree
  // shape when validation state first appeared, remounting the element and
  // dropping focus/caret/uncontrolled value mid-typing.
  it('keeps the same input element (and its value) when isPending appears', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Input name="email" />);
    });

    const input = container.querySelector('input')!;
    input.value = 'louis@example';
    input.focus();

    await act(async () => {
      root.render(<Input name="email" isPending />);
    });

    const inputAfter = container.querySelector('input')!;
    expect(inputAfter).toBe(input);
    expect(inputAfter.value).toBe('louis@example');
    expect(document.activeElement).toBe(inputAfter);

    await act(async () => root.unmount());
  });
});
