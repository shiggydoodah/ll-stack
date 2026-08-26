// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import { renderReact, requireElement } from '../test-utils';

const options = [
  { label: 'Charity', value: 'charity' },
  { label: 'Company', value: 'company' },
] as const;

describe('form.SelectField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders options and updates state on change', async () => {
    type Values = { organisation: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const defaultValues: Values = { organisation: 'charity' };
      const form = useAppForm({ defaultValues });

      formRef.current = form;

      return (
        <Form form={form}>
          <form.SelectField label="Organisation" name="organisation" options={options} />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const select = requireElement(
      rendered.container.querySelector<HTMLSelectElement>('select'),
      'select',
    );

    expect(select.value).toBe('charity');

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(select, 'company');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(formRef.current?.state.values.organisation).toBe('company');

    await rendered.unmount();
  });

  it('sits on the shared Field rhythm without per-field spacing overrides', async () => {
    type Values = { organisation: string };

    const Demo = () => {
      const defaultValues: Values = { organisation: '' };
      const form = useAppForm({ defaultValues });

      return (
        <Form form={form}>
          <form.SelectField label="Organisation" name="organisation" options={options} />
        </Form>
      );
    };

    const rendered = await renderReact(<Demo />);
    const fieldRoot = requireElement(
      rendered.container.querySelector<HTMLElement>('form > div'),
      'field root',
    );

    expect(fieldRoot.className).toContain('space-y-2');
    expect(fieldRoot.className).not.toContain('gap-1');

    await rendered.unmount();
  });
});
