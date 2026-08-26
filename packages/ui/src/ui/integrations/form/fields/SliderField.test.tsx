// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Form, useAppForm } from '../index';
import type { SliderOption } from '../../../primitives';

beforeAll(() => {
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

describe('form.SliderField', () => {
  it('binds a numeric field, labels the slider, and updates state via keyboard', async () => {
    type Values = { volume: number };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { volume: 40 } as Values });
      formRef.current = form;

      return (
        <Form form={form}>
          <form.SliderField label="Volume" max={100} name="volume" step={5} />
        </Form>
      );
    };

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Demo />);

    const slider = screen.getByRole('slider', { name: 'Volume' });
    expect(slider.getAttribute('aria-valuenow')).toBe('40');

    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(formRef.current?.state.values.volume).toBe(45);
  });

  it('binds an options (Likert) field and stores the option value', async () => {
    type Values = { sentiment: string };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { sentiment: 'neutral' } as Values });
      formRef.current = form;

      return (
        <Form form={form}>
          <form.SliderField label="Sentiment" name="sentiment" options={likert} />
        </Form>
      );
    };

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Demo />);

    const slider = screen.getByRole('slider', { name: 'Sentiment' });
    slider.focus();
    await user.keyboard('{ArrowLeft}');

    expect(formRef.current?.state.values.sentiment).toBe('agree');
  });

  it('binds a range field and stores a tuple', async () => {
    type Values = { band: [number, number] };
    const formRef: { current: { state: { values: Values } } | undefined } = { current: undefined };

    const Demo = () => {
      const form = useAppForm({ defaultValues: { band: [20, 60] } as Values });
      formRef.current = form;

      return (
        <Form form={form}>
          <form.SliderField label="Band" name="band" range step={10} />
        </Form>
      );
    };

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Demo />);

    const [minThumb] = screen.getAllByRole('slider');
    minThumb?.focus();
    await user.keyboard('{ArrowRight}');

    expect(formRef.current?.state.values.band).toEqual([30, 60]);
  });

  it('shows a validation error after blur', async () => {
    const Demo = () => {
      const form = useAppForm({ defaultValues: { score: 0 } });

      return (
        <Form form={form}>
          <form.SliderField
            fieldValidators={{
              onBlur: ({ value }) => ((value as number) < 5 ? 'Too low' : undefined),
            }}
            label="Score"
            max={10}
            name="score"
            validateOnBlur
          />
        </Form>
      );
    };

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Demo />);

    screen.getByRole('slider', { name: 'Score' }).focus();
    await user.tab();

    expect(await screen.findByText('Too low')).toBeTruthy();
  });
});
