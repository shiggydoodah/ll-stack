// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { blurInput, renderReact, requireElement, submitForm, typeIntoInput } from '../test-utils';

const validIcon = (container: Element) =>
  container.querySelector<SVGElement>('svg.text-tone-green');

const passwordBlurValidator = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value : '';
  if (v.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(v)) return 'Password must include at least one lowercase letter.';
  if (!/[^a-z]/.test(v))
    return 'Password must include at least one uppercase letter, number, or special character.';
  return undefined;
};

// A password that passes passwordBlurValidator
const VALID_PASSWORD = 'Password1!';
// A password that fails (too short)
const INVALID_PASSWORD = 'abc';

describe('form.PasswordField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the label and a password input', async () => {
    type Values = { password: string };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { password: '' } as Values });
      return (
        <Form form={form}>
          <form.PasswordField label="Password" name="password" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
      'password input',
    );

    expect(input.type).toBe('password');
    expect(rendered.container.textContent).toContain('Password');

    await rendered.unmount();
  });

  it('propagates change events to the form state', async () => {
    type Values = { password: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { password: '' } as Values });
      formRef.current = form;
      return (
        <Form form={form}>
          <form.PasswordField label="Password" name="password" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
      'password input',
    );

    await typeIntoInput(input, VALID_PASSWORD);

    expect(formRef.current?.state.values.password).toBe(VALID_PASSWORD);

    await rendered.unmount();
  });

  it('toggles the input between password and text type when the visibility button is clicked', async () => {
    type Values = { password: string };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { password: '' } as Values });
      return (
        <Form form={form}>
          <form.PasswordField label="Password" name="password" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const showButton = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]'),
      'show button',
    );

    expect(
      rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
    ).not.toBeNull();

    await act(async () => {
      showButton.click();
    });

    expect(rendered.container.querySelector<HTMLInputElement>('input[type="text"]')).not.toBeNull();
    expect(
      rendered.container.querySelector<HTMLButtonElement>('button[aria-label="Hide password"]'),
    ).not.toBeNull();

    await rendered.unmount();
  });

  it('renders inline error and aria-invalid after a failed submit', async () => {
    type Values = { password: string };

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { password: '' } as Values,
        validators: {
          onSubmit: ({ value }) =>
            value.password.length === 0
              ? { fields: { password: 'Password is required' } }
              : undefined,
        },
      });
      return (
        <Form form={form}>
          <form.PasswordField label="Password" name="password" required />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
      'password input',
    );

    await submitForm(form);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(rendered.container.textContent).toContain('Password is required');
    expect(document.activeElement).toBe(input);

    await rendered.unmount();
  });

  describe('validateOnBlur', () => {
    it('does not show errors while typing before the field is blurred', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, INVALID_PASSWORD);

      expect(rendered.container.textContent).not.toContain('at least 8');
      expect(input.getAttribute('aria-invalid')).toBeNull();

      await rendered.unmount();
    });

    it('shows an error and aria-invalid after blur with an invalid value', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, INVALID_PASSWORD);
      await blurInput(input);

      expect(rendered.container.textContent).toContain('at least 8 characters');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      await rendered.unmount();
    });

    it('clears the error when the value is corrected and the field is re-blurred', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, INVALID_PASSWORD);
      await blurInput(input);
      expect(rendered.container.textContent).toContain('at least 8 characters');

      await typeIntoInput(input, VALID_PASSWORD);
      await blurInput(input);
      expect(rendered.container.textContent).not.toContain('at least 8');
      expect(input.getAttribute('aria-invalid')).toBeNull();

      await rendered.unmount();
    });

    it('reveals errors on a submit attempt even before the field is blurred', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { password: '' } as Values,
          validators: {
            onSubmit: ({ value }) =>
              value.password.length === 0
                ? { fields: { password: 'Password is required' } }
                : undefined,
          },
        });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" name="password" validateOnBlur />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(
        rendered.container.querySelector<HTMLFormElement>('form'),
        'form',
      );
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await submitForm(formEl);

      expect(rendered.container.textContent).toContain('Password is required');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      await rendered.unmount();
    });
  });

  describe('showValid icon', () => {
    it('does not render a checkmark when showValid is not set', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, VALID_PASSWORD);
      await blurInput(input);

      expect(validIcon(rendered.container)).toBeNull();

      await rendered.unmount();
    });

    it('does not show a checkmark while typing before the field is blurred', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" name="password" showValid validateOnBlur />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, VALID_PASSWORD);

      expect(validIcon(rendered.container)).toBeNull();

      await rendered.unmount();
    });

    it('keeps the input focused while typing multiple characters (no DOM remount)', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" name="password" showValid validateOnBlur />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await act(async () => {
        input.focus();
      });

      await typeIntoInput(input, 'P');
      expect(document.activeElement).toBe(input);

      await typeIntoInput(input, 'Pa');
      expect(document.activeElement).toBe(input);

      await typeIntoInput(input, VALID_PASSWORD);
      expect(document.activeElement).toBe(input);

      await rendered.unmount();
    });

    it('does not show a checkmark after blur with an invalid password', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              showValid
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, INVALID_PASSWORD);
      await blurInput(input);

      expect(validIcon(rendered.container)).toBeNull();
      expect(rendered.container.textContent).toContain('at least 8 characters');

      await rendered.unmount();
    });

    it('shows a checkmark after blur with a valid password', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              showValid
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, VALID_PASSWORD);
      await blurInput(input);

      expect(validIcon(rendered.container)).not.toBeNull();
      expect(rendered.container.textContent).not.toContain('at least 8');

      await rendered.unmount();
    });

    it('removes the checkmark if the field is invalidated on a subsequent blur', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{ onBlur: passwordBlurValidator }}
              label="Password"
              name="password"
              showValid
              validateOnBlur
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      await typeIntoInput(input, VALID_PASSWORD);
      await blurInput(input);
      expect(validIcon(rendered.container)).not.toBeNull();

      await typeIntoInput(input, INVALID_PASSWORD);
      await blurInput(input);
      expect(validIcon(rendered.container)).toBeNull();
      expect(rendered.container.textContent).toContain('at least 8 characters');

      await rendered.unmount();
    });
  });
});
