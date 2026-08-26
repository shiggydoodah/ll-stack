// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement } from '../test-utils';

const items = [
  { label: 'Yes', value: 'yes' },
  { label: 'No', value: 'no' },
] as const;

describe('form.RadioGroupField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('updates the form value when a radio is clicked', async () => {
    type Values = { basedInTheUk: 'yes' | 'no' | '' };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { basedInTheUk: '' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.RadioGroupField items={items} label="Based in the UK?" name="basedInTheUk" />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const yes = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="radio"][value="yes"]'),
      'yes radio',
    );

    await act(async () => {
      yes.click();
    });

    expect(formRef.current?.state.values.basedInTheUk).toBe('yes');

    await rendered.unmount();
  });

  it('clears resetOnChange fields when the parent changes', async () => {
    type Values = { basedInTheUk: 'yes' | 'no' | ''; typeOfOrganisation: string | undefined };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = {
        basedInTheUk: 'yes',
        typeOfOrganisation: 'charity',
      };
      const form = useAppForm({
        defaultValues,
      });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.RadioGroupField
            items={items}
            label="Based in the UK?"
            name="basedInTheUk"
            resetOnChange={['typeOfOrganisation']}
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const no = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="radio"][value="no"]'),
      'no radio',
    );

    expect(formRef.current?.state.values.typeOfOrganisation).toBe('charity');

    await act(async () => {
      no.click();
    });

    expect(formRef.current?.state.values.basedInTheUk).toBe('no');
    expect(formRef.current?.state.values.typeOfOrganisation).toBeUndefined();

    await rendered.unmount();
  });

  it('wires aria-describedby (hint + error), aria-invalid and aria-required onto the radiogroup', async () => {
    type Values = { basedInTheUk: string };

    const Demo = () => {
      const defaultValues: Values = { basedInTheUk: '' };
      const form = useAppForm({
        defaultValues,
        validators: {
          onSubmit: ({ value }) =>
            value.basedInTheUk ? undefined : { fields: { basedInTheUk: 'Pick one' } },
        },
      });

      return (
        <Form form={form}>
          <form.RadioGroupField
            hint="Charities only."
            items={items}
            label="Based in the UK?"
            name="basedInTheUk"
            required
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const formEl = requireElement(
      rendered.container.querySelector<HTMLFormElement>('form'),
      'form',
    );

    await act(async () => {
      formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const group = requireElement(
      rendered.container.querySelector<HTMLElement>('[role="radiogroup"]'),
      'radiogroup',
    );
    const hint = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Charities only.',
      ) ?? null,
      'hint',
    );
    const error = requireElement(
      Array.from(rendered.container.querySelectorAll('p')).find(
        (p) => p.textContent === 'Pick one',
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

  it('does not clear the current field when resetOnChange includes itself', async () => {
    type Values = { basedInTheUk: 'yes' | 'no' | undefined };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { basedInTheUk: undefined };
      const form = useAppForm({
        defaultValues,
      });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.RadioGroupField
            items={items}
            label="Based in the UK?"
            name="basedInTheUk"
            resetOnChange={['basedInTheUk']}
          />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const no = requireElement(
      rendered.container.querySelector<HTMLInputElement>('input[type="radio"][value="no"]'),
      'no radio',
    );

    await act(async () => {
      no.click();
    });

    expect(formRef.current?.state.values.basedInTheUk).toBe('no');

    await rendered.unmount();
  });
});
