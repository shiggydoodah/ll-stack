import { useState } from 'react';
import { defineSpecimen } from '../../../specimens/define';
import { Slider } from '../index';
import type { SliderOption, SliderOptionValue, SliderSize, SliderTone } from '../index';

const likert: SliderOption[] = [
  { value: 'strongly_agree', label: 'Strongly agree' },
  { value: 'agree', label: 'Agree' },
  { value: 'neutral', label: 'No opinion' },
  { value: 'disagree', label: 'Disagree' },
  { value: 'strongly_disagree', label: 'Strongly disagree' },
];

type SliderDemoProps = {
  mode: 'numeric' | 'options';
  range: boolean;
  min: number;
  max: number;
  step: number;
  tone: SliderTone;
  size: SliderSize;
  orientation: 'horizontal' | 'vertical';
  disabled: boolean;
  showValue: boolean;
};

/**
 * Stateful wrapper so the controlled `Slider` can be driven by the lab's prop editor.
 * Keeps an independent value per mode/range combination so toggling controls is lossless.
 */
const SliderDemo = ({
  mode,
  range,
  min,
  max,
  step,
  tone,
  size,
  orientation,
  disabled,
  showValue,
}: SliderDemoProps) => {
  const [numericValue, setNumericValue] = useState(Math.round((min + max) / 2));
  const [numericRange, setNumericRange] = useState<[number, number]>([
    Math.round(min + (max - min) * 0.25),
    Math.round(min + (max - min) * 0.75),
  ]);
  const [optionValue, setOptionValue] = useState<SliderOptionValue>('neutral');
  const [optionRange, setOptionRange] = useState<[SliderOptionValue, SliderOptionValue]>([
    'agree',
    'disagree',
  ]);

  const shared = { disabled, orientation, size, tone };

  return (
    <div
      className={
        orientation === 'vertical' ? 'flex h-72 justify-center p-8' : 'w-full max-w-md p-8'
      }
    >
      {mode === 'options' ? (
        range ? (
          <Slider
            {...shared}
            onValueChange={setOptionRange}
            options={likert}
            range
            value={optionRange}
          />
        ) : (
          <Slider {...shared} onValueChange={setOptionValue} options={likert} value={optionValue} />
        )
      ) : range ? (
        <Slider
          {...shared}
          max={max}
          min={min}
          onValueChange={setNumericRange}
          range
          showValue={showValue}
          step={step}
          value={numericRange}
        />
      ) : (
        <Slider
          {...shared}
          max={max}
          min={min}
          onValueChange={setNumericValue}
          showValue={showValue}
          step={step}
          value={numericValue}
        />
      )}
    </div>
  );
};

export const sliderSpecimen = defineSpecimen<SliderDemoProps>({
  title: 'Slider',
  description:
    'Accessible slider built on @radix-ui/react-slider (pointer + touch drag, keyboard, ' +
    'multi-thumb). Free/stepped numeric values, a dual-thumb range, or a discrete option ' +
    '(Likert) scale that emits the selected option value. For form-bound use, see SliderField.',
  component: SliderDemo,
  argTypes: {
    mode: { control: 'select', options: ['numeric', 'options'] as const, defaultValue: 'numeric' },
    range: { control: 'boolean', defaultValue: false },
    min: { control: 'number', defaultValue: 0 },
    max: { control: 'number', defaultValue: 100 },
    step: { control: 'number', defaultValue: 1 },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'red',
    },
    size: { control: 'select', options: ['sm', 'md', 'lg'] as const, defaultValue: 'md' },
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'] as const,
      defaultValue: 'horizontal',
    },
    disabled: { control: 'boolean', defaultValue: false },
    showValue: { control: 'boolean', defaultValue: true },
  },
  variants: [
    { name: 'Free slide', props: { mode: 'numeric', range: false, showValue: true } },
    { name: 'Stepped (10)', props: { mode: 'numeric', step: 10, showValue: true } },
    { name: 'Range', props: { mode: 'numeric', range: true, showValue: true } },
    { name: 'Likert options', props: { mode: 'options', range: false } },
  ],
});
