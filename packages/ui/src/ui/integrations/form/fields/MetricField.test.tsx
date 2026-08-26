// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';

afterEach(cleanup);

type Values = { weightKg: number | null };
type FormRef = { current: { state: { values: Values } } | undefined };

describe('form.MetricField', () => {
  it('binds a canonical number value, labels the input, and updates as the user types', async () => {
    const formRef: FormRef = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { weightKg: 10 } as Values });
      formRef.current = form;
      return (
        <Form form={form}>
          <form.MetricField
            dimension="weight"
            label="Weight"
            name="weightKg"
            units={['kg', 'lb']}
          />
        </Form>
      );
    };

    const user = userEvent.setup();
    render(<Demo />);

    const input = screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement;
    expect(input.value).toBe('10');

    await user.clear(input);
    await user.type(input, '12');

    expect(formRef.current?.state.values.weightKg).toBe(12);
  });

  it('keeps the canonical value unchanged when switching display units', async () => {
    const formRef: FormRef = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { weightKg: 10 } as Values });
      formRef.current = form;
      return (
        <Form form={form}>
          <form.MetricField
            dimension="weight"
            label="Weight"
            name="weightKg"
            units={['kg', 'lb']}
          />
        </Form>
      );
    };

    const user = userEvent.setup();
    render(<Demo />);

    const input = screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement;
    await user.click(screen.getByRole('radio', { name: 'lb' }));

    expect(input.value).toBe('22.05');
    expect(formRef.current?.state.values.weightKg).toBe(10);
  });

  it('shows a validation error after blur', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { weightKg: null } as Values });
      return (
        <Form form={form}>
          <form.MetricField
            dimension="weight"
            fieldValidators={{ onBlur: ({ value }) => (value === null ? 'Required' : undefined) }}
            label="Weight"
            name="weightKg"
            units={['kg', 'lb']}
            validateOnBlur
          />
        </Form>
      );
    };

    const user = userEvent.setup();
    render(<Demo />);

    screen.getByRole('textbox', { name: 'Weight' }).focus();
    await user.tab();

    expect(await screen.findByText('Required')).toBeTruthy();
  });
});
