// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

// Fixtures below pair this validator with minLength={8} so the field's own
// derived length check agrees with it — consumer validators merge over the
// prop-derived defaults per hook, they do not replace them.
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

  describe('minLength wiring', () => {
    it('sets the native minLength attribute (default 12, prop-driven)', async () => {
      type Values = { password: string };

      const Demo = ({ minLength }: { minLength?: number }) => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" minLength={minLength} name="password" />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      expect(
        rendered.container
          .querySelector<HTMLInputElement>('input[type="password"]')
          ?.getAttribute('minlength'),
      ).toBe('12');
      await rendered.unmount();

      const custom = await renderReact(<Demo minLength={8} />);
      expect(
        custom.container
          .querySelector<HTMLInputElement>('input[type="password"]')
          ?.getAttribute('minlength'),
      ).toBe('8');
      await custom.unmount();
    });

    it('derives a minimum-length validator that blocks submission when no fieldValidators are supplied', async () => {
      type Values = { password: string };
      const onSubmit = vi.fn(async () => undefined);

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values, onSubmit });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" minLength={8} name="password" />
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

      await typeIntoInput(input, 'short');
      expect(rendered.container.textContent).toContain('Password must be at least 8 characters.');

      await submitForm(formEl);
      expect(onSubmit).not.toHaveBeenCalled();

      await typeIntoInput(input, 'long enough');
      expect(rendered.container.textContent).not.toContain('must be at least');

      await submitForm(formEl);
      expect(onSubmit).toHaveBeenCalledTimes(1);

      await rendered.unmount();
    });

    it('keeps the derived length validator when fieldValidators supply a different hook', async () => {
      type Values = { password: string };
      const onSubmit = vi.fn(async () => undefined);

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values, onSubmit });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{
                onBlur: ({ value }) =>
                  value === 'password' ? 'That password is too common.' : undefined,
              }}
              label="Password"
              minLength={8}
              name="password"
            />
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

      // Supplying onBlur must not silently drop the prop-derived onChange guard:
      // validators merge per hook rather than replacing the whole set.
      await typeIntoInput(input, 'short');
      expect(rendered.container.textContent).toContain('Password must be at least 8 characters.');

      await submitForm(formEl);
      expect(onSubmit).not.toHaveBeenCalled();

      // ...and the consumer's own hook still runs.
      await typeIntoInput(input, 'password');
      await blurInput(input);
      expect(rendered.container.textContent).toContain('That password is too common.');

      await rendered.unmount();
    });

    it('lets fieldValidators.onChange replace the derived length validator', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              fieldValidators={{
                onChange: ({ value }) => (value === 'nope' ? 'Custom onChange error.' : undefined),
              }}
              label="Password"
              minLength={8}
              name="password"
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input[type="password"]'),
        'password input',
      );

      // Same-key overrides still win outright — the escape hatch is per hook.
      await typeIntoInput(input, 'short');
      expect(rendered.container.textContent).not.toContain('must be at least');

      await typeIntoInput(input, 'nope');
      expect(rendered.container.textContent).toContain('Custom onChange error.');

      await rendered.unmount();
    });

    it('leaves an empty optional password valid (emptiness is required’s concern)', async () => {
      type Values = { password: string };
      const onSubmit = vi.fn(async () => undefined);

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values, onSubmit });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" name="password" />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      await submitForm(requireElement(rendered.container.querySelector('form'), 'form'));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(rendered.container.textContent).not.toContain('must be at least');

      await rendered.unmount();
    });
  });

  describe('placeholder', () => {
    it('defaults to the minLength-derived English string', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField label="Password" minLength={8} name="password" />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      expect(
        rendered.container
          .querySelector<HTMLInputElement>('input[type="password"]')
          ?.getAttribute('placeholder'),
      ).toBe('At least 8 characters');

      await rendered.unmount();
    });

    it('is overridable for localisation', async () => {
      type Values = { password: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { password: '' } as Values });
        return (
          <Form form={form}>
            <form.PasswordField
              label="Password"
              name="password"
              placeholder="Mindestens 12 Zeichen"
            />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      expect(
        rendered.container
          .querySelector<HTMLInputElement>('input[type="password"]')
          ?.getAttribute('placeholder'),
      ).toBe('Mindestens 12 Zeichen');

      await rendered.unmount();
    });
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
              minLength={8}
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
              minLength={8}
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
              minLength={8}
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
              minLength={8}
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
              minLength={8}
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
              minLength={8}
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
              minLength={8}
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
