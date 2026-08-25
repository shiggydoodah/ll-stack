import { defineSpecimen } from '../../../specimens/define';
import { Divider } from '../index';
import type { DividerProps } from '../index';

export const dividerSpecimen = defineSpecimen<DividerProps>({
  title: 'Divider',
  description: 'Horizontal rule with optional label text and alignment control.',
  component: Divider,
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'subtle', 'strong'] as const,
      defaultValue: 'neutral',
    },
    thickness: {
      control: 'select',
      options: ['thin', 'medium', 'thick'] as const,
      defaultValue: 'thin',
    },
    label: { control: 'text', defaultValue: '' },
    labelAlign: {
      control: 'select',
      options: ['start', 'center', 'end'] as const,
      defaultValue: 'center',
    },
  },
  variants: [
    { name: 'Default', props: {} },
    { name: 'Subtle', props: { tone: 'subtle' } },
    { name: 'Strong', props: { tone: 'strong' } },
    { name: 'With label (center)', props: { label: 'or', labelAlign: 'center' } },
    { name: 'With label (start)', props: { label: 'Section', labelAlign: 'start' } },
    { name: 'With label (end)', props: { label: 'Section', labelAlign: 'end' } },
    { name: 'Medium thickness', props: { thickness: 'medium' } },
    { name: 'Thick', props: { thickness: 'thick' } },
  ],
});
