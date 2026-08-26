// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement, submitForm } from '../test-utils';

describe('form.Errors', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders nothing when there are no form-level errors', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { email: '' } });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);

    expect(rendered.container.querySelector('[role="alert"]')).toBeNull();

    await rendered.unmount();
  });

  it('renders a server error set via setServerError after form submission', async () => {
    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: '' },
        onSubmit: async () => {
          form.setServerError('Server connection failed.');
        },
      });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );

    await submitForm(formEl);

    const alert = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="alert"]'),
      'alert',
    );
    expect(alert.textContent).toContain('Server connection failed.');

    await rendered.unmount();
  });

  it('renders the form-level error from a submit validator', async () => {
    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: '' },
        validators: {
          onSubmit: () => ({ form: 'Something went wrong.', fields: {} }),
        },
      });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');

    await submitForm(form);

    const alert = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="alert"]'),
      'alert',
    );

    expect(alert.textContent).toContain('Something went wrong.');

    await rendered.unmount();
  });

  it('shows the api error when onSubmit returns a FormSubmitResult with ok: false', async () => {
    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: '' },
        onSubmit: async () => ({ ok: false as const, error: { api: 'Service unavailable.' } }),
      });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );

    await submitForm(formEl);

    const alert = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="alert"]'),
      'alert',
    );
    expect(alert.textContent).toContain('Service unavailable.');

    await rendered.unmount();
  });

  it('calls onError with the FormError when onSubmit returns ok: false', async () => {
    const errors: unknown[] = [];

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: '' },
        onSubmit: async () => ({ ok: false as const, error: { api: 'Bad request.' } }),
        onError: (error) => {
          errors.push(error);
        },
      });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );

    await submitForm(formEl);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({ api: 'Bad request.' });

    await rendered.unmount();
  });

  it('calls onSuccess when onSubmit returns ok: true', async () => {
    let successCalled = false;

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: '' },
        onSubmit: async () => ({ ok: true as const }),
        onSuccess: () => {
          successCalled = true;
        },
      });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );

    await submitForm(formEl);

    expect(successCalled).toBe(true);

    await rendered.unmount();
  });

  it('clears a stale api error on re-submission', async () => {
    let attempt = 0;

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { email: '' },
        onSubmit: async () => {
          attempt += 1;
          if (attempt === 1) return { ok: false as const, error: { api: 'First failure.' } };
          return { ok: true as const };
        },
      });

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );

    await submitForm(formEl);
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();

    await submitForm(formEl);
    expect(rendered.container.querySelector('[role="alert"]')).toBeNull();

    await rendered.unmount();
  });

  it('uses the semantic error tone, not the accent colour', async () => {
    let setServerError: ((error: string | undefined) => void) | undefined;

    const Demo = () => {
      const form = useAppForm({ defaultValues: { email: '' } });
      setServerError = (e) => form.setServerError(e);

      return (
        <Form form={form}>
          <form.Errors />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);

    await act(async () => {
      setServerError!('Nope.');
    });

    const alert = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="alert"]'),
      'alert',
    );
    expect(alert.className).toContain('text-tone-red');
    expect(alert.className).not.toContain('text-(--ui-accent)');

    await rendered.unmount();
  });
});
