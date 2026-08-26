// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Form, useAppForm } from '../index';
import { blurInput, renderReact, requireElement, submitForm, typeIntoInput } from '../test-utils';

const validIcon = (container: Element) =>
  container.querySelector<SVGElement>('svg.text-tone-green');

// jsdom does not implement showPicker, so install a spy for the duration of a test.
const stubShowPicker = (implementation?: () => void) => {
  const showPicker = implementation ? vi.fn(implementation) : vi.fn();

  Object.defineProperty(window.HTMLInputElement.prototype, 'showPicker', {
    configurable: true,
    value: showPicker,
    writable: true,
  });

  return showPicker;
};

const restoreShowPicker = () => {
  Reflect.deleteProperty(window.HTMLInputElement.prototype, 'showPicker');
};

const focusInput = async (input: HTMLInputElement) => {
  await act(async () => {
    input.focus();
  });
};

const pointerDownInput = async (input: HTMLInputElement) => {
  await act(async () => {
    input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
};

const emailBlurValidator = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? undefined
    : 'Invalid email address';

describe('form.TextField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders the label, hint, and bound value', async () => {
    type Values = { email: string };

    const Demo = () => {
      const defaultValues: Values = { email: 'a@b.test' };
      const form = useAppForm({ defaultValues });

      return (
        <Form form={form}>
          <form.TextField hint="We never share it." label="Email" name="email" type="email" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="email"]'),
      'email input',
    );

    expect(input.value).toBe('a@b.test');
    expect(rendered.container.textContent).toContain('Email');
    expect(rendered.container.textContent).toContain('We never share it.');

    await rendered.unmount();
  });

  it('forwards autoComplete to the input', async () => {
    type Values = { email: string };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { email: '' } as Values });

      return (
        <Form form={form}>
          <form.TextField autoComplete="username" label="Email" name="email" type="email" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input'),
      'input',
    );

    expect(input.getAttribute('autocomplete')).toBe('username');

    await rendered.unmount();
  });

  it('omits the autocomplete attribute when autoComplete is not set', async () => {
    type Values = { email: string };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { email: '' } as Values });

      return (
        <Form form={form}>
          <form.TextField label="Email" name="email" type="email" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input'),
      'input',
    );

    expect(input.hasAttribute('autocomplete')).toBe(false);

    await rendered.unmount();
  });

  it('propagates change events to the form state', async () => {
    type Values = { email: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { email: '' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.TextField label="Email" name="email" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input'),
      'input',
    );

    await typeIntoInput(input, 'typed@example.test');

    expect(formRef.current?.state.values.email).toBe('typed@example.test');

    await rendered.unmount();
  });

  it('renders inline error and aria-invalid after a failed submit', async () => {
    type Values = { email: string };

    const Demo = () => {
      const defaultValues: Values = { email: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.email.length === 0 ? { fields: { email: 'Email is required' } } : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.TextField label="Email" name="email" required />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const input = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input'),
      'input',
    );

    await submitForm(form);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(rendered.container.textContent).toContain('Email is required');
    expect(document.activeElement).toBe(input);

    await rendered.unmount();
  });

  describe('validateOnBlur', () => {
    it('does not show errors while typing before the field is blurred', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
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

      await typeIntoInput(input, 'notvalid');

      expect(rendered.container.textContent).not.toContain('Invalid email address');
      expect(input.getAttribute('aria-invalid')).toBeNull();

      await rendered.unmount();
    });

    it('shows an error and aria-invalid after blur with an invalid value', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
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

      await typeIntoInput(input, 'notvalid');
      await blurInput(input);

      expect(rendered.container.textContent).toContain('Invalid email address');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      await rendered.unmount();
    });

    it('clears the error when the value is corrected and the field is re-blurred', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
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

      await typeIntoInput(input, 'notvalid');
      await blurInput(input);
      expect(rendered.container.textContent).toContain('Invalid email address');

      await typeIntoInput(input, 'user@example.com');
      await blurInput(input);
      expect(rendered.container.textContent).not.toContain('Invalid email address');
      expect(input.getAttribute('aria-invalid')).toBeNull();

      await rendered.unmount();
    });

    it('reveals errors on a submit attempt even before the field is blurred', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({
          defaultValues: { email: '' } as Values,
          validators: {
            onSubmit: ({ value }) =>
              value.email.length === 0 ? { fields: { email: 'Email is required' } } : undefined,
          },
        });
        return (
          <Form form={form}>
            <form.TextField label="Email" name="email" validateOnBlur />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const formEl = requireElement(
        rendered.container.querySelector<HTMLFormElement>('form'),
        'form',
      );
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input'),
        'input',
      );

      await submitForm(formEl);

      expect(rendered.container.textContent).toContain('Email is required');
      expect(input.getAttribute('aria-invalid')).toBe('true');

      await rendered.unmount();
    });
  });

  describe('autoOpenPicker', () => {
    type Values = { schedule: string };

    const PickerDemo = ({
      autoOpenPicker,
      disabled,
      type,
    }: {
      autoOpenPicker?: boolean;
      disabled?: boolean;
      type: string;
    }) => {
      const form = useAppForm({ defaultValues: { schedule: '' } as Values });

      return (
        <Form form={form}>
          <form.TextField
            autoOpenPicker={autoOpenPicker}
            disabled={disabled}
            label="Starts"
            name="schedule"
            type={type}
          />
        </Form>
      );
    };

    const renderPicker = async (type: string, autoOpenPicker = true) => {
      const rendered = await renderReact(
        <PickerDemo autoOpenPicker={autoOpenPicker} type={type} />,
      );
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input'),
        `${type} input`,
      );

      return { input, rendered };
    };

    // A real click fires pointerdown before focus lands on the input.
    const clickIntoInput = async (input: HTMLInputElement) => {
      await pointerDownInput(input);
      await focusInput(input);
    };

    afterEach(() => {
      restoreShowPicker();
    });

    it('does not open the picker by default (prop off)', async () => {
      const showPicker = stubShowPicker();
      const { input, rendered } = await renderPicker('date', false);

      await clickIntoInput(input);

      expect(showPicker).not.toHaveBeenCalled();

      await rendered.unmount();
    });

    it.each(['date', 'time', 'datetime-local', 'month', 'week'])(
      'opens the native picker when a %s field is clicked into (enabled)',
      async (type) => {
        const showPicker = stubShowPicker();
        const { input, rendered } = await renderPicker(type);

        await clickIntoInput(input);

        expect(showPicker).toHaveBeenCalledTimes(1);

        await rendered.unmount();
      },
    );

    it('does not open the picker for keyboard or programmatic focus, even when enabled', async () => {
      const showPicker = stubShowPicker();
      const { input, rendered } = await renderPicker('date');

      // Tab traversal / focusFirstInvalid land here with no preceding pointerdown —
      // popping the picker would be an unexpected context change (WCAG 3.2.1).
      await focusInput(input);

      expect(showPicker).not.toHaveBeenCalled();

      await rendered.unmount();
    });

    it.each(['text', 'email', 'password', 'number'])(
      'does not open a picker for a %s field even when enabled',
      async (type) => {
        const showPicker = stubShowPicker();
        const { input, rendered } = await renderPicker(type);

        await clickIntoInput(input);
        await pointerDownInput(input);

        expect(showPicker).not.toHaveBeenCalled();

        await rendered.unmount();
      },
    );

    it('re-opens the picker when a field that already holds focus is clicked', async () => {
      const showPicker = stubShowPicker();
      const { input, rendered } = await renderPicker('date');

      await clickIntoInput(input);
      expect(showPicker).toHaveBeenCalledTimes(1);

      // No focus event fires on an already-focused field, so the pointerdown re-opens
      // (e.g. after dismissing the picker with Escape).
      await pointerDownInput(input);
      expect(showPicker).toHaveBeenCalledTimes(2);

      await rendered.unmount();
    });

    it('does not treat a stale pointerdown as pointer-initiated after refocusing by keyboard', async () => {
      const showPicker = stubShowPicker();
      const { input, rendered } = await renderPicker('date');

      await clickIntoInput(input);
      expect(showPicker).toHaveBeenCalledTimes(1);

      // Really move focus away (so the next focus() fires a focus event), then
      // return by keyboard/programmatic focus: no pointerdown preceded it, so the
      // picker must not re-open.
      await act(async () => {
        input.blur();
      });
      await focusInput(input);

      expect(showPicker).toHaveBeenCalledTimes(1);

      await rendered.unmount();
    });

    it('stays usable when showPicker throws without user activation', async () => {
      const showPicker = stubShowPicker(() => {
        throw new DOMException('Not allowed', 'NotAllowedError');
      });
      const { input, rendered } = await renderPicker('date');

      await clickIntoInput(input);
      await typeIntoInput(input, '2026-08-01');

      expect(showPicker).toHaveBeenCalledTimes(1);
      expect(input.value).toBe('2026-08-01');

      await rendered.unmount();
    });

    it('does not call showPicker on a disabled field', async () => {
      const showPicker = stubShowPicker();

      const rendered = await renderReact(<PickerDemo autoOpenPicker disabled type="date" />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input'),
        'date input',
      );

      await pointerDownInput(input);
      await act(async () => {
        input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      });

      expect(showPicker).not.toHaveBeenCalled();

      await rendered.unmount();
    });
  });

  describe('showValid icon', () => {
    it('does not render a checkmark when showValid is not set', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
              type="email"
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

      await typeIntoInput(input, 'user@example.com');
      await blurInput(input);

      expect(validIcon(rendered.container)).toBeNull();

      await rendered.unmount();
    });

    it('does not show a checkmark while typing before the field is blurred', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField label="Email" name="email" showValid type="email" validateOnBlur />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input'),
        'input',
      );

      await typeIntoInput(input, 'user@example.com');

      expect(validIcon(rendered.container)).toBeNull();

      await rendered.unmount();
    });

    it('keeps the input focused while typing multiple characters (no DOM remount)', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField label="Email" name="email" showValid type="email" validateOnBlur />
          </Form>
        );
      };

      const rendered = await renderReact(<Demo />);
      const input = requireElement(
        rendered.container.querySelector<HTMLInputElement>('input'),
        'input',
      );

      await act(async () => {
        input.focus();
      });

      await typeIntoInput(input, 'u');
      expect(document.activeElement).toBe(input);

      await typeIntoInput(input, 'us');
      expect(document.activeElement).toBe(input);

      await typeIntoInput(input, 'user@example.com');
      expect(document.activeElement).toBe(input);

      await rendered.unmount();
    });

    it('does not show a checkmark after blur with an invalid value', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
              showValid
              type="email"
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

      await typeIntoInput(input, 'notvalid');
      await blurInput(input);

      expect(validIcon(rendered.container)).toBeNull();
      expect(rendered.container.textContent).toContain('Invalid email address');

      await rendered.unmount();
    });

    it('shows a checkmark after blur with a valid value', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
              showValid
              type="email"
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

      await typeIntoInput(input, 'user@example.com');
      await blurInput(input);

      expect(validIcon(rendered.container)).not.toBeNull();
      expect(rendered.container.textContent).not.toContain('Invalid email address');

      await rendered.unmount();
    });

    it('removes the checkmark if the field is invalidated on a subsequent blur', async () => {
      type Values = { email: string };

      const Demo = () => {
        const form = useAppForm({ defaultValues: { email: '' } as Values });
        return (
          <Form form={form}>
            <form.TextField
              fieldValidators={{ onBlur: emailBlurValidator }}
              label="Email"
              name="email"
              showValid
              type="email"
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

      await typeIntoInput(input, 'user@example.com');
      await blurInput(input);
      expect(validIcon(rendered.container)).not.toBeNull();

      await typeIntoInput(input, 'notvalid');
      await blurInput(input);
      expect(validIcon(rendered.container)).toBeNull();
      expect(rendered.container.textContent).toContain('Invalid email address');

      await rendered.unmount();
    });
  });
});
