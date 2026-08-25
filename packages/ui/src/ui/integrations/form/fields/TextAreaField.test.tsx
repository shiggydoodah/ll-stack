// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement, submitForm } from '../test-utils';

describe('form.TextAreaField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the textarea bound to the form value', async () => {
    type Values = { notes: string };

    const Demo = () => {
      const defaultValues: Values = { notes: 'hello' };
      const form = useAppForm({ defaultValues });

      return (
        <Form form={form}>
          <form.TextAreaField label="Notes" name="notes" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const textarea = requireElement(
      rendered.container.querySelector<HTMLTextAreaElement>('textarea'),
      'textarea',
    );

    expect(textarea.value).toBe('hello');

    await rendered.unmount();
  });

  it('propagates input to the form state and shows errors after a failed submit', async () => {
    type Values = { notes: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { notes: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.notes.length === 0 ? { fields: { notes: 'Required' } } : undefined,
        },
      });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.TextAreaField label="Notes" name="notes" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const textarea = requireElement(
      rendered.container.querySelector<HTMLTextAreaElement>('textarea'),
      'textarea',
    );

    await submitForm(form);

    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(rendered.container.textContent).toContain('Required');

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(textarea, 'now filled');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(formRef.current?.state.values.notes).toBe('now filled');

    await rendered.unmount();
  });
});
