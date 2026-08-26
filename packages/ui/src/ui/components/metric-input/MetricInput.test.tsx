// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetricInput, type MetricInputProps } from './MetricInput';

afterEach(cleanup);

/** Stateful harness so the controlled input can be driven and observed. */
const Harness = ({
  initial = null,
  onChange,
  ...props
}: Partial<MetricInputProps> & {
  initial?: number | null;
  onChange?: (v: number | null) => void;
}) => {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <MetricInput
      aria-label="Weight"
      dimension="weight"
      units={['kg', 'lb']}
      {...props}
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
};

// The value input is a decimal text box, not a native number field ("textbox",
// not "spinbutton") — see the type="text" comment in MetricInput.
const getInput = () => screen.getByRole('textbox', { name: 'Weight' }) as HTMLInputElement;

describe('MetricInput rendering', () => {
  it('renders a numeric input and a unit toggle for multiple units', () => {
    render(<Harness initial={10} />);
    expect(getInput().value).toBe('10');
    expect(screen.getByRole('radiogroup', { name: 'Unit' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'kg' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'lb' })).toBeTruthy();
  });

  it('uses a text input with a decimal inputMode and pattern (not type="number")', () => {
    render(<Harness initial={10} />);
    const input = getInput();
    // type="number" badInput sanitisation reports '' for partial entries like
    // '-' or '1e', which wiped the focused-edit buffer on blur.
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('pattern')).toBeTruthy();
  });

  it('hides the switcher and shows a static unit label for a single unit', () => {
    render(<Harness units={['kg']} initial={5} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('kg')).toBeTruthy();
  });
});

describe('MetricInput selector mode', () => {
  it('uses a toggle for up to three units in auto mode', () => {
    render(<Harness initial={1} />);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('uses a dropdown for many units in auto mode', () => {
    render(<MetricInput aria-label="Weight" dimension="weight" value={1} onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Unit' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('honours an explicit select selector', () => {
    render(<Harness initial={1} selector="select" />);
    expect(screen.getByRole('combobox', { name: 'Unit' })).toBeTruthy();
  });

  it('honours an explicit toggle selector', () => {
    render(
      <MetricInput
        aria-label="Weight"
        dimension="weight"
        selector="toggle"
        value={1}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup')).toBeTruthy();
  });
});

describe('MetricInput value semantics', () => {
  it('emits the canonical (kg) value when the user types in lb', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness defaultDisplayUnit="lb" onChange={onChange} />);

    await user.type(getInput(), '22');

    // 22 lb -> 9.979 kg
    const last = onChange.mock.calls.at(-1)?.[0] as number;
    expect(last).toBeCloseTo(9.979, 3);
  });

  it('emits null when the input is cleared', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={10} onChange={onChange} />);

    await user.clear(getInput());

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('reformats the displayed value when switching units without emitting onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={10} onChange={onChange} />);

    expect(getInput().value).toBe('10');
    await user.click(screen.getByRole('radio', { name: 'lb' }));

    // 10 kg -> 22.0462 lb -> "22.05"; the canonical value is untouched.
    expect(getInput().value).toBe('22.05');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches units via keyboard activation', async () => {
    const user = userEvent.setup();
    render(<Harness initial={10} />);

    const lb = screen.getByRole('radio', { name: 'lb' });
    lb.focus();
    await user.keyboard('{Enter}');

    expect(getInput().value).toBe('22.05');
  });

  it('switches units via a select dropdown', async () => {
    const user = userEvent.setup();
    render(<Harness initial={10} selector="select" />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Unit' }), 'lb');

    expect(getInput().value).toBe('22.05');
  });

  it('re-derives the displayed text when the canonical value changes externally', () => {
    const { rerender } = render(
      <MetricInput
        aria-label="Weight"
        dimension="weight"
        units={['kg', 'lb']}
        value={10}
        onChange={() => {}}
      />,
    );
    expect(getInput().value).toBe('10');

    rerender(
      <MetricInput
        aria-label="Weight"
        dimension="weight"
        units={['kg', 'lb']}
        value={20}
        onChange={() => {}}
      />,
    );
    expect(getInput().value).toBe('20');
  });

  it('clamps the emitted value to max on input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness max={100} onChange={onChange} />);

    await user.type(getInput(), '250');

    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('keeps a partial entry like "-" in the buffer while focused instead of wiping it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness min={-100} onChange={onChange} />);
    const input = getInput();

    await user.click(input);
    await user.keyboard('-');

    // A number input's badInput sanitisation would report '' here and the next
    // sync would wipe the keystroke; the text input preserves it.
    expect(input.value).toBe('-');
    expect(onChange).toHaveBeenLastCalledWith(null);

    await user.keyboard('5');
    expect(input.value).toBe('-5');
    expect(onChange).toHaveBeenLastCalledWith(-5);
  });

  it('normalises an unfinished partial entry when the field blurs', async () => {
    const user = userEvent.setup();
    render(<Harness initial={10} />);
    const input = getInput();

    await user.click(input);
    await user.clear(input);
    await user.keyboard('-');
    await user.tab();

    // '-' parses to null, so the buffer re-derives to the empty canonical value.
    expect(input.value).toBe('');
  });
});

describe('MetricInput accessibility & passthrough', () => {
  it('sets aria-invalid when invalid', () => {
    render(<Harness initial={1} invalid />);
    expect(getInput().getAttribute('aria-invalid')).toBe('true');
  });

  it('disables the input when disabled', () => {
    render(<Harness initial={1} disabled />);
    expect(getInput().disabled).toBe(true);
  });

  it('disables the unit toggle when disabled', () => {
    render(<Harness initial={1} disabled />);
    expect((screen.getByRole('radio', { name: 'kg' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('merges className onto the root and forwards id', () => {
    render(<Harness initial={1} className="custom-root" id="weight-field" />);
    const input = getInput();
    expect(input.getAttribute('id')).toBe('weight-field');
    // Climb via closest rather than parentElement: the Input primitive wraps
    // its element, so the immediate parent is Input's own wrapper.
    const root = input.closest('.custom-root') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className).toContain('flex');
  });

  it('forwards a ref to the underlying input', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Harness initial={1} ref={ref} />);
    expect(ref.current?.tagName).toBe('INPUT');
  });

  it('passes through native attributes such as placeholder', () => {
    render(<Harness placeholder="e.g. 70" />);
    expect(getInput().getAttribute('placeholder')).toBe('e.g. 70');
  });
});
