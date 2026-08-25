import { defineSpecimen } from '../../../specimens/define';
import { Textarea } from '../index';
import type { TextareaProps } from '../index';

export const textareaSpecimen = defineSpecimen<TextareaProps>({
  title: 'Textarea',
  description: 'Multi-line text input with resize support.',
  component: Textarea,
  argTypes: {
    placeholder: { control: 'text', defaultValue: 'Enter text…' },
    rows: { control: 'number', defaultValue: 4 },
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Default', props: { placeholder: 'Enter text…', rows: 4 } },
    { name: 'Disabled', props: { disabled: true, placeholder: 'Disabled', rows: 4 } },
  ],
});
