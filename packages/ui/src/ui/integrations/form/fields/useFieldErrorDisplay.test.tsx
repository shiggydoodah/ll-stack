// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { blurInput, renderReact, requireElement, typeIntoInput } from '../test-utils';

const tooShortValidator = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.length > 0 && value.length < 3 ? 'Too short' : undefined;

describe('useFieldErrorDisplay (via form.TextField)', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const setup = async () => {
    type Values = { code: string };
    const resetRef: { current: (() => void) | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { code: '' } as Values });
      resetRef.current = () => form.reset();

      return (
        <Form form={form}>
          <form.TextField
            fieldValidators={{ onChange: tooShortValidator }}
            label="Code"
            name="code"
            validateOnBlur
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input'),
      'input',
    );

    return { input, rendered, reset: () => resetRef.current?.() };
  };

  it('re-arms deferred error display when the form is reset', async () => {
    const { input, rendered, reset } = await setup();

    // Trigger an error display the normal way: invalid value + blur.
    await typeIntoInput(input, 'ab');
    expect(rendered.container.textContent).not.toContain('Too short');
    await blurInput(input);
    expect(rendered.container.textContent).toContain('Too short');

    await act(async () => {
      reset();
    });

    // Reset clears the errors themselves...
    expect(rendered.container.textContent).not.toContain('Too short');
    expect(input.value).toBe('');

    // ...and the blurred flag: a fresh invalid value must stay deferred again
    // (a local useState flag would survive the reset and leak the error here).
    await typeIntoInput(input, 'ab');
    expect(rendered.container.textContent).not.toContain('Too short');

    await blurInput(input);
    expect(rendered.container.textContent).toContain('Too short');

    await rendered.unmount();
  });
});
