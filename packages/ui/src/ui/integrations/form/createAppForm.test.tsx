// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Form, useAppForm } from './index';
import { blurInput, renderReact, requireElement, submitForm, typeIntoInput } from './test-utils';

describe('useAppForm', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('onSubmit wrapping', () => {
    it('calls onSuccess when onSubmit resolves without an error result', async () => {
      const onSuccess = vi.fn();

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => undefined,
          onSuccess,
        });

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(onSuccess).toHaveBeenCalledOnce();

      await rendered.unmount();
    });

    it('does not call onSuccess when onSubmit returns { ok: false }', async () => {
      const onSuccess = vi.fn();

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { api: 'fail' } }),
          onSuccess,
        });

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(onSuccess).not.toHaveBeenCalled();

      await rendered.unmount();
    });

    it('calls onError with the error when onSubmit returns { ok: false }', async () => {
      const onError = vi.fn();

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { api: 'Server error' } }),
          onError,
        });

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(onError).toHaveBeenCalledWith({ api: 'Server error' });

      await rendered.unmount();
    });

    it('applies the api error key to the form-level server error', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { api: 'Unauthorized' } }),
        });

        return (
          <Form form={form}>
            <form.Errors />
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
        'Unauthorized',
      );

      await rendered.unmount();
    });

    it('applies field error keys to field-level onSubmit errors', async () => {
      let getEmailOnSubmitError: (() => unknown) | undefined;

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { email: 'Already taken' } }),
        });
        getEmailOnSubmitError = () => form.state.fieldMeta['email']?.errorMap?.onSubmit;

        return (
          <Form form={form}>
            <form.TextField label="Email" name="email" type="email" />
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(getEmailOnSubmitError!()).toBe('Already taken');

      await rendered.unmount();
    });
  });

  describe('submitFailed', () => {
    it('is false before any submission', async () => {
      let snapshot: boolean | undefined;

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } });
        snapshot = form.submitFailed;
        return null;
      };

      const rendered = await renderReact(<Demo />);

      expect(snapshot).toBe(false);

      await rendered.unmount();
    });

    it('becomes true when onSubmit returns { ok: false }', async () => {
      let snapshot: boolean | undefined;

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { api: 'fail' } }),
        });
        snapshot = form.submitFailed;

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(snapshot).toBe(true);

      await rendered.unmount();
    });

    it('resets to false after a subsequent successful submission', async () => {
      let callCount = 0;
      let snapshot: boolean | undefined;

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => {
            callCount++;
            if (callCount === 1) return { ok: false as const, error: { api: 'fail' } };
            return undefined;
          },
        });
        snapshot = form.submitFailed;

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');

      await submitForm(formEl);
      expect(snapshot).toBe(true);

      await submitForm(formEl);
      expect(snapshot).toBe(false);

      await rendered.unmount();
    });

    it('resets to false when validation errors are corrected and the submit succeeds', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => undefined,
          validators: {
            onSubmit: ({ value }) => (value.email ? undefined : 'Required'),
          },
        });

        return (
          <Form form={form}>
            <output data-testid="failed">{String(form.submitFailed)}</output>
            <form.TextField label="Email" name="email" type="email" />
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');

      await submitForm(formEl);
      const output = requireElement(
        rendered.container.querySelector('[data-testid="failed"]'),
        'failed output',
      );
      expect(output.textContent).toBe('true');

      const emailInput = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[name="email"]'),
        'email input',
      );
      await typeIntoInput(emailInput, 'test@example.com');
      await submitForm(formEl);

      expect(output.textContent).toBe('false');

      await rendered.unmount();
    });

    it('becomes true when a submit is blocked by validation errors', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          validators: {
            onSubmit: () => 'Required',
          },
        });

        return (
          <Form form={form}>
            <output data-testid="failed">{String(form.submitFailed)}</output>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      const output = requireElement(
        rendered.container.querySelector('[data-testid="failed"]'),
        'failed output',
      );
      expect(output.textContent).toBe('true');

      await rendered.unmount();
    });
  });

  describe('submitFailCount', () => {
    it('is 0 before any submission', async () => {
      let snapshot: number | undefined;

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } });
        snapshot = form.submitFailCount;
        return null;
      };

      const rendered = await renderReact(<Demo />);

      expect(snapshot).toBe(0);

      await rendered.unmount();
    });

    it('increments on each failed server submission', async () => {
      let snapshot: number | undefined;

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { api: 'fail' } }),
        });
        snapshot = form.submitFailCount;

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');

      await submitForm(formEl);
      expect(snapshot).toBe(1);

      await submitForm(formEl);
      expect(snapshot).toBe(2);

      await rendered.unmount();
    });

    it('does not increment when a field validator fails after a successful submit', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: 'user@example.com' },
          onSubmit: async () => undefined,
        });

        return (
          <Form form={form}>
            <output data-testid="fail-count">{form.submitFailCount}</output>
            <output data-testid="failed">{String(form.submitFailed)}</output>
            <form.TextField
              fieldValidators={{
                onBlur: ({ value }) =>
                  typeof value === 'string' && value.includes('@') ? undefined : 'Invalid email',
              }}
              label="Email"
              name="email"
            />
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');
      const failCount = requireElement(
        rendered.container.querySelector('[data-testid="fail-count"]'),
        'fail-count output',
      );

      await submitForm(formEl);
      expect(failCount.textContent).toBe('0');

      // Invalidate the field after the successful submit — no new attempt happened,
      // so the earlier success must not be re-counted as a failure.
      const emailInput = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[name="email"]'),
        'email input',
      );
      await typeIntoInput(emailInput, 'notvalid');
      await blurInput(emailInput);

      expect(failCount.textContent).toBe('0');
      expect(rendered.container.querySelector('[data-testid="failed"]')?.textContent).toBe('false');

      await rendered.unmount();
    });

    it('increments each time a submit is blocked by validation errors', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          validators: { onSubmit: () => 'Required' },
        });

        return (
          <Form form={form}>
            <output data-testid="fail-count">{form.submitFailCount}</output>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');
      const output = requireElement(
        rendered.container.querySelector('[data-testid="fail-count"]'),
        'fail-count output',
      );

      await submitForm(formEl);
      expect(output.textContent).toBe('1');

      await submitForm(formEl);
      expect(output.textContent).toBe('2');

      await rendered.unmount();
    });
  });

  describe('submitSuccess', () => {
    it('stays true when a field validator fails after a successful submit', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: 'user@example.com' },
          onSubmit: async () => undefined,
        });

        return (
          <Form form={form}>
            <output data-testid="success">{String(form.submitSuccess)}</output>
            <form.TextField
              fieldValidators={{
                onBlur: ({ value }) =>
                  typeof value === 'string' && value.includes('@') ? undefined : 'Invalid email',
              }}
              label="Email"
              name="email"
            />
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');
      const success = requireElement(
        rendered.container.querySelector('[data-testid="success"]'),
        'success output',
      );

      expect(success.textContent).toBe('false');
      await submitForm(formEl);
      expect(success.textContent).toBe('true');

      // Editing the field into an invalid state is not a new submit attempt, so
      // the completed submit must still read as successful.
      const emailInput = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[name="email"]'),
        'email input',
      );
      await typeIntoInput(emailInput, 'notvalid');
      await blurInput(emailInput);

      expect(success.textContent).toBe('true');

      await rendered.unmount();
    });

    it('is false after a server-rejected submit', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => ({ ok: false as const, error: { api: 'fail' } }),
        });

        return (
          <Form form={form}>
            <output data-testid="success">{String(form.submitSuccess)}</output>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(rendered.container.querySelector('[data-testid="success"]')?.textContent).toBe(
        'false',
      );

      await rendered.unmount();
    });

    it('is false after a validation-blocked submit', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          validators: { onSubmit: () => 'Required' },
        });

        return (
          <Form form={form}>
            <output data-testid="success">{String(form.submitSuccess)}</output>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(rendered.container.querySelector('[data-testid="success"]')?.textContent).toBe(
        'false',
      );

      await rendered.unmount();
    });

    // Regression: submitFailCount used to be cleared only inside wrappedOnSubmit,
    // which is never created for a form without an onSubmit handler. A single
    // validation miss therefore pinned submitSuccess false (and submitFailed true)
    // for the rest of the form's life, however many clean submits followed.
    it('becomes true after a clean submit that follows a validation failure, with no onSubmit', async () => {
      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          validators: { onSubmit: ({ value }) => (value.email ? undefined : 'Required') },
        });

        return (
          <Form form={form}>
            <output data-testid="success">{String(form.submitSuccess)}</output>
            <output data-testid="failed">{String(form.submitFailed)}</output>
            <form.TextField label="Email" name="email" />
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');
      const success = requireElement(
        rendered.container.querySelector('[data-testid="success"]'),
        'success output',
      );
      const failed = requireElement(
        rendered.container.querySelector('[data-testid="failed"]'),
        'failed output',
      );

      await submitForm(formEl);
      expect(success.textContent).toBe('false');
      expect(failed.textContent).toBe('true');

      const emailInput = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[name="email"]'),
        'email input',
      );
      await typeIntoInput(emailInput, 'user@example.com');
      await submitForm(formEl);

      expect(success.textContent).toBe('true');
      expect(failed.textContent).toBe('false');

      await rendered.unmount();
    });
  });

  describe('submitCount', () => {
    it('reflects the number of submission attempts', async () => {
      let snapshot: number | undefined;

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' },
          onSubmit: async () => undefined,
        });
        snapshot = form.submitCount;

        return (
          <Form form={form}>
            <form.SubmitButton>Submit</form.SubmitButton>
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(rendered.container.querySelector('form'), 'form');

      await submitForm(formEl);
      expect(snapshot).toBe(1);

      await submitForm(formEl);
      expect(snapshot).toBe(2);

      await rendered.unmount();
    });
  });

  describe('setServerError', () => {
    it('makes the message visible in FormErrors', async () => {
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
        setServerError!('Session expired');
      });

      expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
        'Session expired',
      );

      await rendered.unmount();
    });
  });

  describe('applyFormError', () => {
    it('routes the api key to the form-level server error', async () => {
      let applyFormError: ((error: { api?: string }) => void) | undefined;

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } });
        applyFormError = (e) => form.applyFormError(e);

        return (
          <Form form={form}>
            <form.Errors />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);

      await act(async () => {
        applyFormError!({ api: 'Forbidden' });
      });

      expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
        'Forbidden',
      );

      await rendered.unmount();
    });

    it('routes field keys to field-level onSubmit errors', async () => {
      let applyFormError: ((error: { email?: string }) => void) | undefined;
      let getEmailOnSubmitError: (() => unknown) | undefined;

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } });
        applyFormError = (e) => form.applyFormError(e);
        getEmailOnSubmitError = () => form.state.fieldMeta['email']?.errorMap?.onSubmit;
        return null;
      };

      const rendered = await renderReact(<Demo />);

      await act(async () => {
        applyFormError!({ email: 'Already taken' });
      });

      expect(getEmailOnSubmitError!()).toBe('Already taken');

      await rendered.unmount();
    });
  });

  describe('clearServerErrors', () => {
    it('removes the form-level server error from FormErrors', async () => {
      let setServerError: ((error: string | undefined) => void) | undefined;
      let clearServerErrors: (() => void) | undefined;

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } });
        setServerError = (e) => form.setServerError(e);
        clearServerErrors = () => form.clearServerErrors();

        return (
          <Form form={form}>
            <form.Errors />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);

      await act(async () => {
        setServerError!('Error');
      });
      expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();

      await act(async () => {
        clearServerErrors!();
      });
      expect(rendered.container.querySelector('[role="alert"]')).toBeNull();

      await rendered.unmount();
    });

    it('removes field-level onSubmit errors set via applyFormError', async () => {
      let applyFormError: ((error: { email?: string }) => void) | undefined;
      let clearServerErrors: (() => void) | undefined;
      let getEmailOnSubmitError: (() => unknown) | undefined;

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } });
        applyFormError = (e) => form.applyFormError(e);
        clearServerErrors = () => form.clearServerErrors();
        getEmailOnSubmitError = () => form.state.fieldMeta['email']?.errorMap?.onSubmit;
        return null;
      };

      const rendered = await renderReact(<Demo />);

      await act(async () => {
        applyFormError!({ email: 'Already taken' });
      });
      await act(async () => {
        clearServerErrors!();
      });

      expect(getEmailOnSubmitError!()).toBeUndefined();

      await rendered.unmount();
    });
  });

  describe('resetOnChange (bound fields)', () => {
    it('resets a sibling optional field when the triggering field changes', async () => {
      type Values = { country: string; city: string | undefined };
      let getCityValue: (() => string | undefined) | undefined;

      const Demo = () => {
        const defaultValues: Values = { country: 'uk', city: 'London' };
        const form = useAppForm({ defaultValues });
        getCityValue = () => form.state.values.city;

        return (
          <Form form={form}>
            <form.TextField label="Country" name="country" resetOnChange={['city']} />
            <form.TextField label="City" name="city" />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      expect(getCityValue!()).toBe('London');

      const countryInput = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[name="country"]'),
        'country input',
      );
      await typeIntoInput(countryInput, 'fr');

      expect(getCityValue!()).toBeUndefined();

      await rendered.unmount();
    });
  });
});
