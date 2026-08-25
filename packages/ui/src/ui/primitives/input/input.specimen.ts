import { defineSpecimen } from '../../../specimens/define';
import { Input } from '../index';
import type { InputProps } from '../index';

export const inputSpecimen = defineSpecimen<InputProps>({
  title: 'Input',
  description: 'Text input primitive with shared UI styling.',
  component: Input,
  argTypes: {
    placeholder: { control: 'text', defaultValue: 'Enter text…' },
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Default', props: { type: 'text', placeholder: 'Enter text…' } },
    { name: 'Email', props: { type: 'email', placeholder: 'you@example.com' } },
    { name: 'Password', props: { type: 'password', placeholder: 'Password' } },
    { name: 'Disabled', props: { disabled: true, placeholder: 'Disabled input' } },
  ],
});
