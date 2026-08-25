import { defineSpecimen } from '../../../specimens/define';
import { StatusDot } from '../index';
import type { StatusDotProps } from '../index';

export const statusDotSpecimen = defineSpecimen<StatusDotProps>({
  title: 'StatusDot',
  description: 'Round presence/state indicator with optional pulse and label pill.',
  component: StatusDot,
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'green',
    },
    size: {
      control: 'select',
      options: ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const,
      defaultValue: 'medium',
    },
    pulse: { control: 'boolean', defaultValue: false },
    ring: { control: 'boolean', defaultValue: false },
    label: { control: 'text', defaultValue: '' },
  },
  variants: [
    { name: 'Online', props: { tone: 'green' } },
    { name: 'Busy', props: { tone: 'red' } },
    { name: 'Away', props: { tone: 'amber' } },
    { name: 'Offline', props: { tone: 'neutral' } },
    { name: 'Pulse (live)', props: { tone: 'green', pulse: true } },
    { name: 'Label pill', props: { tone: 'green', label: 'Online' } },
    { name: 'Large', props: { tone: 'green', size: 'xlarge' } },
  ],
});
