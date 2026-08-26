import { defineSpecimen } from '../../../specimens/define';
import { ProgressBar } from '../index';
import type { ProgressBarProps } from '../index';

export const progressBarSpecimen = defineSpecimen<ProgressBarProps>({
  title: 'ProgressBar',
  description:
    'Progress indicator for tasks with known (value) or unknown (indeterminate) completion. ' +
    'Optional caption and percentage; full UiTone palette with the accent as default.',
  component: ProgressBar,
  argTypes: {
    value: { control: 'number', defaultValue: 60 },
    max: { control: 'number', defaultValue: 100 },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'red',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'] as const,
      defaultValue: 'md',
    },
    indeterminate: { control: 'boolean', defaultValue: false },
    showValue: { control: 'boolean', defaultValue: true },
    label: { control: 'text', defaultValue: 'Uploading…' },
  },
  variants: [
    { name: 'Determinate', props: { value: 64 } },
    { name: 'With label + %', props: { value: 64, label: 'Uploading…', showValue: true } },
    { name: 'Indeterminate', props: { indeterminate: true, tone: 'blue' } },
    {
      name: 'Success (green)',
      props: { value: 100, tone: 'green', label: 'Complete', showValue: true },
    },
    { name: 'Small', props: { value: 40, size: 'sm' } },
    { name: 'Extra small', props: { value: 40, size: 'xs' } },
  ],
});
