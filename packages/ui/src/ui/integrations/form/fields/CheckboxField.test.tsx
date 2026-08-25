// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement } from '../test-utils';

describe('form.CheckboxField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('reflects and updates the boolean form value', async () => {
    type Values = { agreed: boolean };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { agreed: false };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.CheckboxField label="I agree" name="agreed" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const checkbox = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="checkbox"]'),
      'checkbox',
    );

    expect(checkbox.checked).toBe(false);

    await act(async () => {
      checkbox.click();
    });

    expect(formRef.current?.state.values.agreed).toBe(true);

    await rendered.unmount();
  });
});
