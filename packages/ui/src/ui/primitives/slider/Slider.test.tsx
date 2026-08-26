// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Slider } from './Slider';
import type { SliderOption } from './Slider';

beforeAll(() => {
  // Radix slider measures layout via ResizeObserver and uses pointer capture; jsdom lacks both.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

afterEach(cleanup);

const likert: SliderOption[] = [
  { value: 'strongly_agree', label: 'Strongly agree' },
  { value: 'agree', label: 'Agree' },
  { value: 'neutral', label: 'No opinion' },
  { value: 'disagree', label: 'Disagree' },
  { value: 'strongly_disagree', label: 'Strongly disagree' },
];

describe('Slider', () => {
  it('exposes the value, min and max on the thumb', () => {
    render(<Slider aria-label="Volume" max={100} min={0} value={40} onValueChange={() => {}} />);

    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('40');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('100');
  });

  it('increments by step and emits a number on ArrowRight', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(<Slider aria-label="Volume" onValueChange={onValueChange} step={5} value={40} />);

    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalledWith(45);
  });

  it('renders option labels and emits the option value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <Slider
        aria-label="Agreement"
        onValueChange={onValueChange}
        options={likert}
        value="neutral"
      />,
    );

    expect(screen.getByText('Strongly agree')).toBeTruthy();
    expect(screen.getByText('Strongly disagree')).toBeTruthy();

    const slider = screen.getByRole('slider');
    // 'neutral' is the third stop (index 2).
    expect(slider.getAttribute('aria-valuenow')).toBe('2');

    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenCalledWith('disagree');
  });

  it('renders two thumbs in range mode and updates the focused one', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <Slider aria-label="Band" onValueChange={onValueChange} range step={10} value={[20, 60]} />,
    );

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);

    const [minThumb] = sliders;
    minThumb?.focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenCalledWith([30, 60]);
  });

  it('labels the two range thumbs', () => {
    render(<Slider aria-label="Band" range value={[20, 60]} onValueChange={() => {}} />);

    expect(screen.getByRole('slider', { name: 'Minimum' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Maximum' })).toBeTruthy();
  });

  it('does not change when disabled', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(<Slider aria-label="Volume" disabled onValueChange={onValueChange} value={40} />);

    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).not.toHaveBeenCalled();
  });

  // Regression: the readout used to derive from props only, so it stayed
  // frozen at the default in uncontrolled mode.
  it('updates the showValue readout in uncontrolled mode', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(<Slider aria-label="Volume" defaultValue={40} showValue step={5} />);

    expect(screen.getByText('40')).toBeTruthy();

    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByText('45')).toBeTruthy();
    expect(screen.queryByText('40')).toBeNull();
  });

  it('forwards the ref to the Radix root element', () => {
    const ref = createRef<HTMLSpanElement>();

    render(<Slider aria-label="Volume" defaultValue={40} ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.querySelector('[role="slider"]')).toBeTruthy();
  });

  it('applies tone and size classes', () => {
    const { container } = render(
      <Slider aria-label="Volume" defaultValue={50} size="lg" tone="blue" />,
    );

    const html = container.innerHTML;
    expect(html).toContain('border-tone-blue');
    expect(html).toContain('bg-tone-blue');
    expect(html).toContain('size-6');
  });
});
