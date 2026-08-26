// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from './index';
import { renderReact, requireElement, submitForm } from './test-utils';

describe('Form integration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the first invalid raw TanStack field after a failed submit', async () => {
    const TinyForm = () => {
      const form = useAppForm({
        defaultValues: {
          email: '',
        },
        validators: {
          onSubmit: ({ value }) =>
            value.email.length === 0
              ? {
                  fields: {
                    email: 'Required',
                  },
                }
              : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.Field name="email">
            {(field) => (
              <input
                name={field.name}
                value={field.state.value}
                aria-invalid={field.state.meta.errors.length > 0 ? true : undefined}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
        </Form>
      );
    };

    const rendered = await renderReact(<TinyForm />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const input = requireElement(form.querySelector<HTMLInputElement>('input'), 'input');

    await submitForm(form);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);

    await rendered.unmount();
  });
});
