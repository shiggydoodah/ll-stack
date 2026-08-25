import { defineSpecimen } from '../../../specimens/define';
import { CountBadge } from '../index';
import type { CountBadgeProps } from '../index';

export const countBadgeSpecimen = defineSpecimen<CountBadgeProps>({
  title: 'CountBadge',
  description:
    'Numeric counter for notifications and messages. Circle for one digit, pill for many.',
  component: CountBadge,
  argTypes: {
    count: { control: 'number', defaultValue: 5 },
    max: { control: 'number', defaultValue: 99 },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'red',
    },
    variant: {
      control: 'select',
      options: ['solid', 'surface', 'soft', 'outline'] as const,
      defaultValue: 'solid',
    },
    size: {
      control: 'select',
      options: ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const,
      defaultValue: 'medium',
    },
    showZero: { control: 'boolean', defaultValue: false },
    dot: { control: 'boolean', defaultValue: false },
    ring: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Single digit', props: { count: 3 } },
    { name: 'Multi digit', props: { count: 42 } },
    { name: 'Overflow', props: { count: 1280 } },
    { name: 'Dot only', props: { dot: true } },
    { name: 'Surface', props: { count: 7, variant: 'surface' } },
    { name: 'Neutral outline', props: { count: 9, tone: 'neutral', variant: 'outline' } },
  ],
});
