// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement, submitForm } from '../test-utils';

const items = [
  { label: 'Small', value: 'small' },
  { label: 'Large', value: 'large' },
] as const;

const navigationItems = [
  { label: 'Small', value: 'small' },
  { disabled: true, label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
] as const;

const disabledFirstItems = [
  { disabled: true, label: 'Small', value: 'small' },
  { label: 'Large', value: 'large' },
] as const;

describe('form.RadioButtonGroupField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders horizontal buttons and updates state on click', async () => {
    type Values = { size: '' | (typeof items)[number]['value'] };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { size: '' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.RadioButtonGroupField items={items} label="Size" name="size" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const buttons = rendered.container.querySelectorAll<HTMLButtonElement>('[role="radio"]');

    expect(buttons.length).toBe(2);

    const large = requireElement(
      Array.from(buttons).find((button) => button.value === 'large') ?? null,
      'large button',
    );

    await act(async () => {
      large.click();
    });

    expect(formRef.current?.state.values.size).toBe('large');
    expect(large.getAttribute('aria-checked')).toBe('true');
    expect(large.tabIndex).toBe(0);

    await rendered.unmount();
  });

  it('uses a single tabbable radio button', async () => {
    type Values = { size: '' | (typeof navigationItems)[number]['value'] };

    const Demo = () => {
      const defaultValues: Values = { size: '' };
      const form = useAppForm({ defaultValues });

      return (
        <Form form={form}>
          <form.RadioButtonGroupField items={navigationItems} label="Size" name="size" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const buttons = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );

    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);

    await rendered.unmount();
  });

  it('moves selection and focus with arrow, Home, and End keys', async () => {
    type Values = { size: '' | (typeof navigationItems)[number]['value'] };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { size: '' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.RadioButtonGroupField items={navigationItems} label="Size" name="size" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const small = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[value="small"]'),
      'small button',
    );
    const large = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[value="large"]'),
      'large button',
    );

    await act(async () => {
      small.focus();
      small.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(formRef.current?.state.values.size).toBe('large');
    expect(document.activeElement).toBe(large);

    await act(async () => {
      large.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });

    expect(formRef.current?.state.values.size).toBe('small');
    expect(document.activeElement).toBe(small);

    await act(async () => {
      small.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    });

    expect(formRef.current?.state.values.size).toBe('large');
    expect(document.activeElement).toBe(large);

    await act(async () => {
      large.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    });

    expect(formRef.current?.state.values.size).toBe('small');
    expect(document.activeElement).toBe(small);

    await act(async () => {
      small.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });

    expect(formRef.current?.state.values.size).toBe('large');
    expect(document.activeElement).toBe(large);

    await rendered.unmount();
  });

  it('does not trigger resetOnChange when re-clicking the selected button', async () => {
    type Values = { detail: string | undefined; size: 'small' | 'large' | undefined };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { detail: 'kept', size: 'small' };
      const form = useAppForm({
        defaultValues,
      });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.RadioButtonGroupField
            items={items}
            label="Size"
            name="size"
            resetOnChange={['detail']}
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const small = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[value="small"]'),
      'small button',
    );

    await act(async () => {
      small.click();
    });

    expect(formRef.current?.state.values.size).toBe('small');
    expect(formRef.current?.state.values.detail).toBe('kept');

    await rendered.unmount();
  });

  it('marks every focusable radio button invalid after an empty submit', async () => {
    type Values = { size: '' | (typeof items)[number]['value'] };

    const Demo = () => {
      const defaultValues: Values = { size: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.size.length === 0 ? { fields: { size: 'Pick a size' } } : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.RadioButtonGroupField items={items} label="Size" name="size" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const buttons = rendered.container.querySelectorAll<HTMLButtonElement>('[role="radio"]');

    await submitForm(form);

    expect(
      Array.from(buttons).every((button) => button.getAttribute('aria-invalid') === 'true'),
    ).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);

    await rendered.unmount();
  });

  it('does not mark disabled radio buttons invalid after an empty submit', async () => {
    type Values = { size: '' | (typeof disabledFirstItems)[number]['value'] };

    const Demo = () => {
      const defaultValues: Values = { size: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.size.length === 0 ? { fields: { size: 'Pick a size' } } : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.RadioButtonGroupField items={disabledFirstItems} label="Size" name="size" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');
    const disabledButton = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[value="small"]'),
      'disabled button',
    );
    const enabledButton = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[value="large"]'),
      'enabled button',
    );

    await submitForm(form);

    expect(disabledButton.getAttribute('aria-invalid')).toBeNull();
    expect(enabledButton.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(enabledButton);

    await rendered.unmount();
  });

  it('paints the selected chip text with the accent-contrast token, not hard-coded white', async () => {
    type Values = { size: string };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { size: 'large' } as Values });

      return (
        <Form form={form}>
          <form.RadioButtonGroupField items={items} label="Size" name="size" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const selected = requireElement(
      rendered.container.querySelector<HTMLButtonElement>('button[value="large"]'),
      'selected button',
    );

    expect(selected.className).toContain('text-(--ui-accent-contrast)');
    expect(selected.className).not.toContain('text-white');

    await rendered.unmount();
  });

  it('wires aria-describedby (hint + error), aria-invalid and aria-required onto the radiogroup', async () => {
    type Values = { size: string };

    const Demo = () => {
      const form = useAppForm({
        defaultValues: { size: '' } as Values,
        validators: {
          onSubmit: ({ value }) => (value.size ? undefined : { fields: { size: 'Pick a size' } }),
        },
      });

      return (
        <Form form={form}>
          <form.RadioButtonGroupField
            hint="Fits vary."
            items={items}
            label="Size"
            name="size"
            required
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');

    await submitForm(form);

    const group = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="radiogroup"]'),
      'radiogroup',
    );
    const hint = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Fits vary.',
      ) ?? null,
      'hint',
    );
    const error = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Pick a size',
      ) ?? null,
      'error',
    );

    expect(group.getAttribute('aria-required')).toBe('true');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    const describedBy = group.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain(hint.id);
    expect(describedBy).toContain(error.id);

    await rendered.unmount();
  });
});
