// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement, submitForm } from '../test-utils';

const options = ['apple', 'orange', 'cherry'] as const;

const chipByLabel = (container: HTMLElement, label: string) =>
  requireElement(
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')).find(
      (chip) => chip.textContent?.trim() === label,
    ) ?? null,
    `${label} chip`,
  );

describe('form.ChipSelectField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders one chip per option and selects on click', async () => {
    type Values = { role: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { role: '' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.ChipSelectField label="Role" name="role" options={options} />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const chips = rendered.container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');

    expect(chips.length).toBe(3);

    const apple = chipByLabel(rendered.container, 'apple');

    await act(async () => {
      apple.click();
    });

    expect(formRef.current?.state.values.role).toBe('apple');
    expect(apple.getAttribute('aria-checked')).toBe('true');

    await rendered.unmount();
  });

  it('clears the value back to an empty string when the selected chip is re-clicked', async () => {
    type Values = { role: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { role: 'orange' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.ChipSelectField label="Role" name="role" options={options} />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const orange = chipByLabel(rendered.container, 'orange');

    expect(orange.getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      orange.click();
    });

    expect(formRef.current?.state.values.role).toBe('');
    expect(orange.getAttribute('aria-checked')).toBe('false');

    await rendered.unmount();
  });

  it('surfaces the field error message after a failed submit', async () => {
    type Values = { role: string };

    const Demo = () => {
      const defaultValues: Values = { role: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.role.length === 0 ? { fields: { role: 'Pick a role' } } : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.ChipSelectField label="Role" name="role" options={options} />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');

    await submitForm(form);

    expect(rendered.container.textContent).toContain('Pick a role');

    await rendered.unmount();
  });

  it('disables every chip when the field is disabled', async () => {
    type Values = { role: string };

    const Demo = () => {
      const defaultValues: Values = { role: '' };
      const form = useAppForm({ defaultValues });

      return (
        <Form form={form}>
          <form.ChipSelectField disabled label="Role" name="role" options={options} />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const chips = Array.from(
      rendered.container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'),
    );

    expect(chips.length).toBe(3);
    expect(chips.every((chip) => chip.disabled)).toBe(true);

    await rendered.unmount();
  });

  it('wires aria-describedby (hint + error), aria-invalid and aria-required onto the group', async () => {
    type Values = { role: string };

    const Demo = () => {
      const defaultValues: Values = { role: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.role.length === 0 ? { fields: { role: 'Pick a role' } } : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.ChipSelectField
            hint="One only."
            label="Role"
            name="role"
            options={options}
            required
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');

    await submitForm(form);

    const group = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="group"]'),
      'group',
    );
    const hint = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'One only.',
      ) ?? null,
      'hint',
    );
    const error = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Pick a role',
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
