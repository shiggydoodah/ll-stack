// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { DropDownOption } from '../../../components/dropdown';
import { Form, useAppForm } from '../index';

beforeAll(() => {
  // Radix's popover/scroll-lock measures layout via ResizeObserver; cmdk scrolls the
  // active option into view. jsdom implements neither.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const options: DropDownOption[] = [
  { value: 'gb', label: 'United Kingdom' },
  { value: 'us', label: 'United States' },
  { value: 'fr', label: 'France' },
];

type Values = { country: string | undefined };

interface FixtureProps {
  defaultValue?: string | undefined;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
}

const Fixture = ({ defaultValue = undefined, disabled, required, searchable }: FixtureProps) => {
  const form = useAppForm({ defaultValues: { country: defaultValue } as Values });

  return (
    <Form form={form}>
      <form.ComboBoxField
        disabled={disabled}
        label="Country"
        name="country"
        options={options}
        placeholder="Select a country"
        required={required}
        searchable={searchable}
      />
    </Form>
  );
};

const ValidatedFixture = ({ hideErrorMessage = false }: { hideErrorMessage?: boolean }) => {
  const form = useAppForm({
    defaultValues: { country: undefined } as Values,
    validators: {
      onSubmit: ({ value }: { value: Values }) =>
        value.country ? undefined : { fields: { country: 'Pick a country' } },
    },
  });

  return (
    <Form form={form}>
      <form.ComboBoxField
        hideErrorMessage={hideErrorMessage}
        label="Country"
        name="country"
        options={options}
      />
    </Form>
  );
};

const submitForm = async () => {
  const form = document.querySelector('form');
  if (form === null) throw new Error('Expected a form element.');

  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
};

describe('form.ComboBoxField', () => {
  it('renders the label and a combobox trigger with the placeholder', () => {
    render(<Fixture />);

    expect(screen.getByText('Country')).not.toBeNull();
    expect(screen.getByRole('combobox').textContent).toContain('Select a country');
  });

  it('opens the popover and lists every option on trigger click', async () => {
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole('combobox'));

    for (const option of options) {
      expect(screen.queryByText(option.label)).not.toBeNull();
    }
  });

  it('writes the selected value to form state and reflects it in the trigger', async () => {
    type DemoValues = { country: string | undefined };
    const formRef: { current: { state: { values: DemoValues } } | undefined } = {
      current: undefined,
    };

    const Demo = () => {
      const defaultValues: DemoValues = { country: undefined };
      const form = useAppForm({ defaultValues });

      useEffect(() => {
        formRef.current = form;
      });

      return (
        <Form form={form}>
          <form.ComboBoxField
            label="Country"
            name="country"
            options={options}
            placeholder="Select a country"
          />
        </Form>
      );
    };

    const user = userEvent.setup();
    render(<Demo />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('France'));

    expect(formRef.current?.state.values.country).toBe('fr');
    expect(screen.getByRole('combobox').textContent).toContain('France');
  });

  it('shows a preselected value in the trigger', () => {
    render(<Fixture defaultValue="us" />);

    expect(screen.getByRole('combobox').textContent).toContain('United States');
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<Fixture disabled />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.queryByText('France')).toBeNull();
  });

  it('shows a search input when searchable', async () => {
    const user = userEvent.setup();
    render(<Fixture searchable />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.queryByPlaceholderText('Search…')).not.toBeNull();
  });

  it('omits the search input when searchable is false', async () => {
    const user = userEvent.setup();
    render(<Fixture searchable={false} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('renders the required indicator next to the label', () => {
    render(<Fixture required />);

    // The combobox is a `<div role="combobox">`, so its label is a `<span>` named
    // via aria-labelledby (a bare `<label>` would be an unassociated-label a11y
    // violation). Resolve the label through that association.
    const labelledBy = screen.getByRole('combobox').getAttribute('aria-labelledby');
    const label = labelledBy ? document.getElementById(labelledBy) : null;

    expect(label?.textContent).toContain('Country');
    expect(label?.textContent).toContain('*');
  });

  it('surfaces the field error after a failed submit', async () => {
    render(<ValidatedFixture />);

    await submitForm();

    expect(screen.queryByText('Pick a country')).not.toBeNull();
  });

  it('hides the error message when hideErrorMessage is set', async () => {
    render(<ValidatedFixture hideErrorMessage />);

    await submitForm();

    expect(screen.queryByText('Pick a country')).toBeNull();
  });
});
