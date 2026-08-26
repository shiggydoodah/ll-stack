// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement, submitForm } from '../test-utils';

const items = [
  { label: 'Foo', value: 'foo' },
  { label: 'Bar', value: 'bar' },
  { label: 'Baz', value: 'baz' },
] as const;

const checkboxes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'));

const checkboxByLabel = (container: HTMLElement, label: string) =>
  requireElement(
    checkboxes(container).find((button) => button.textContent?.trim() === label) ?? null,
    `${label} checkbox`,
  );

describe('form.CheckboxButtonGroupField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders one checkbox button per item inside a labelled group', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: [] as string[] } });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={items} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const group = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="group"]'),
      'group',
    );
    const labelId = requireValueLabelId(group);

    expect(checkboxes(rendered.container).length).toBe(3);
    expect(rendered.container.querySelector(`#${labelId}`)?.textContent).toContain('Interests');
    expect(
      checkboxes(rendered.container).every((b) => b.getAttribute('aria-checked') === 'false'),
    ).toBe(true);

    await rendered.unmount();
  });

  it('adds a value to the array when an unselected item is clicked', async () => {
    type Values = { interests: string[] };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: [] as string[] } });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={items} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const foo = checkboxByLabel(rendered.container, 'Foo');

    await act(async () => {
      foo.click();
    });

    expect(formRef.current?.state.values.interests).toEqual(['foo']);
    expect(foo.getAttribute('aria-checked')).toBe('true');

    await rendered.unmount();
  });

  it('removes a value from the array when a selected item is clicked again', async () => {
    type Values = { interests: string[] };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: ['bar'] as string[] } });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={items} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const bar = checkboxByLabel(rendered.container, 'Bar');

    expect(bar.getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      bar.click();
    });

    expect(formRef.current?.state.values.interests).toEqual([]);
    expect(bar.getAttribute('aria-checked')).toBe('false');

    await rendered.unmount();
  });

  it('keeps multiple selections and preserves click order', async () => {
    type Values = { interests: string[] };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: [] as string[] } });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={items} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);

    await act(async () => {
      checkboxByLabel(rendered.container, 'Foo').click();
    });
    await act(async () => {
      checkboxByLabel(rendered.container, 'Baz').click();
    });

    expect(formRef.current?.state.values.interests).toEqual(['foo', 'baz']);

    await rendered.unmount();
  });

  it('reflects preselected values via aria-checked', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: ['foo', 'baz'] as string[] } });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={items} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);

    expect(checkboxByLabel(rendered.container, 'Foo').getAttribute('aria-checked')).toBe('true');
    expect(checkboxByLabel(rendered.container, 'Bar').getAttribute('aria-checked')).toBe('false');
    expect(checkboxByLabel(rendered.container, 'Baz').getAttribute('aria-checked')).toBe('true');

    await rendered.unmount();
  });

  it('disables every checkbox when the field is disabled', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: [] as string[] } });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField
            disabled
            items={items}
            label="Interests"
            name="interests"
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);

    expect(checkboxes(rendered.container).every((button) => button.disabled)).toBe(true);

    await rendered.unmount();
  });

  it('disables only the item flagged disabled', async () => {
    const mixedItems = [
      { label: 'Foo', value: 'foo' },
      { disabled: true, label: 'Bar', value: 'bar' },
    ] as const;

    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: [] as string[] } });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={mixedItems} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);

    expect(checkboxByLabel(rendered.container, 'Foo').disabled).toBe(false);
    expect(checkboxByLabel(rendered.container, 'Bar').disabled).toBe(true);

    await rendered.unmount();
  });

  it('renders the required indicator and the hint', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { interests: [] as string[] } });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField
            hint="Pick or add your own"
            items={items}
            label="Interests"
            name="interests"
            required
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const group = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="group"]'),
      'group',
    );
    const labelId = requireValueLabelId(group);

    expect(rendered.container.querySelector(`#${labelId}`)?.textContent).toContain('*');
    expect(rendered.container.textContent).toContain('Pick or add your own');

    await rendered.unmount();
  });

  it('surfaces the field error message after a failed submit', async () => {
    const Demo = () => {
      const form = useAppForm({
        defaultValues: { interests: [] as string[] },
        validators: {
          onSubmit: ({ value }) =>
            value.interests.length === 0
              ? { fields: { interests: 'Pick at least one' } }
              : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField items={items} label="Interests" name="interests" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const form = requireElement(rendered.container.querySelector<HTMLFormElement>('form'), 'form');

    await submitForm(form);

    expect(rendered.container.textContent).toContain('Pick at least one');

    await rendered.unmount();
  });

  it('wires aria-describedby (hint + error), aria-invalid and aria-required onto the group', async () => {
    const Demo = () => {
      const form = useAppForm({
        defaultValues: { interests: [] as string[] },
        validators: {
          onSubmit: ({ value }) =>
            value.interests.length === 0
              ? { fields: { interests: 'Pick at least one' } }
              : undefined,
        },
      });

      return (
        <Form form={form}>
          <form.CheckboxButtonGroupField
            hint="Pick or add your own"
            items={items}
            label="Interests"
            name="interests"
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
        (p) => p.textContent === 'Pick or add your own',
      ) ?? null,
      'hint',
    );
    const error = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Pick at least one',
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

const requireValueLabelId = (group: HTMLElement) => {
  const labelId = group.getAttribute('aria-labelledby');
  if (labelId === null) {
    throw new Error('Expected the group to expose aria-labelledby.');
  }
  return labelId;
};
