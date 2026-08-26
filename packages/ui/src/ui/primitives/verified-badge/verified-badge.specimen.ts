import { defineSpecimen } from '../../../specimens/define';
import { VerifiedBadge } from '../index';
import type { VerifiedBadgeProps } from '../index';

export const verifiedBadgeSpecimen = defineSpecimen<VerifiedBadgeProps>({
  title: 'VerifiedBadge',
  description: 'Small circular verified tick.',
  component: VerifiedBadge,
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'blue',
    },
    size: {
      control: 'select',
      options: ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const,
      defaultValue: 'medium',
    },
    label: { control: 'text', defaultValue: 'Verified' },
  },
  variants: [
    { name: 'Default', props: {} },
    { name: 'Staff (red)', props: { tone: 'red', label: 'Staff' } },
    { name: 'Large', props: { size: 'xlarge' } },
  ],
});
