import { defineSpecimen } from '../../../specimens/define';
import { Badge } from '../index';
import type { BadgeProps } from '../index';

export const badgeSpecimen = defineSpecimen<BadgeProps>({
  title: 'Badge',
  description: 'Compact label for status and categorisation.',
  component: Badge,
  argTypes: {
    children: { control: 'text', defaultValue: 'Badge' },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'neutral',
    },
    variant: {
      control: 'select',
      options: ['solid', 'surface', 'soft', 'outline'] as const,
      defaultValue: 'surface',
    },
  },
  variants: [
    { name: 'Default (neutral surface)', props: { children: 'Badge' } },
    { name: 'Solid neutral', props: { children: 'Badge', tone: 'neutral', variant: 'solid' } },
    { name: 'Surface red', props: { children: 'Error', tone: 'red', variant: 'surface' } },
    { name: 'Soft green', props: { children: 'Success', tone: 'green', variant: 'soft' } },
    { name: 'Outline amber', props: { children: 'Warning', tone: 'amber', variant: 'outline' } },
    { name: 'Blue', props: { children: 'Info', tone: 'blue', variant: 'surface' } },
    { name: 'Purple', props: { children: 'Beta', tone: 'purple', variant: 'solid' } },
  ],
});
