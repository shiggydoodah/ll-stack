// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from './index';
import { renderReact, requireElement, submitForm } from './test-utils';

describe('bound fields integration', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('submits successfully when fields are valid', async () => {
    type Values = { email: string };
    let submittedValue: string | undefined;

    const Demo = () => {
      const defaultValues: Values = { email: '' };
      const form = useAppForm({
        defaultValues,
        onSubmit: async ({ value }) => {
          submittedValue = value.email;
        },
      });

      return (
        <Form form={form}>
          <form.TextField label="Email" name="email" type="email" />
          <form.SubmitButton>Submit</form.SubmitButton>
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="email"]'),
      'email input',
    );

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(input, 'me@example.test');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await submitForm(form);

    expect(submittedValue).toBe('me@example.test');

    await rendered.unmount();
  });

  it('focuses the first invalid bound field after a failed submit', async () => {
    type Values = { email: string; name: string };

    const Demo = () => {
      const defaultValues: Values = { email: '', name: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) => {
            const fields: Partial<Record<keyof Values, string>> = {};
            if (value.email.length === 0) fields.email = 'Required';
            if (value.name.length === 0) fields.name = 'Required';
            return Object.keys(fields).length > 0 ? { fields } : undefined;
          },
        },
      });

      return (
        <Form form={form}>
          <form.TextField label="Name" name="name" />
          <form.TextField label="Email" name="email" type="email" />
          <form.SubmitButton>Submit</form.SubmitButton>
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );
    const nameInput = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[name="name"]'),
      'name input',
    );

    await submitForm(formEl);

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(nameInput);

    await rendered.unmount();
  });
});
