import { defineSpecimen } from '../../../specimens/define';
import { Button } from '../index';
import type { ButtonProps } from '../index';

export const buttonSpecimen = defineSpecimen<ButtonProps>({
  title: 'Button',
  description: 'Shared text button for actions and form submissions.',
  component: Button,
  argTypes: {
    children: { control: 'text', defaultValue: 'Click me' },
    variant: {
      control: 'select',
      options: ['solid', 'surface', 'outline', 'ghost'] as const,
      defaultValue: 'solid',
    },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'red',
    },
    size: {
      control: 'select',
      options: ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const,
      defaultValue: 'medium',
    },
    disabled: { control: 'boolean', defaultValue: false },
    loading: { control: 'boolean', defaultValue: false },
    fullWidth: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Solid', props: { children: 'Click me', variant: 'solid', tone: 'red' } },
    { name: 'Surface', props: { children: 'Click me', variant: 'surface', tone: 'red' } },
    { name: 'Outline', props: { children: 'Click me', variant: 'outline', tone: 'neutral' } },
    { name: 'Ghost', props: { children: 'Click me', variant: 'ghost', tone: 'neutral' } },
    { name: 'Loading', props: { children: 'Saving…', loading: true } },
    { name: 'Disabled', props: { children: 'Click me', disabled: true } },
  ],
});
