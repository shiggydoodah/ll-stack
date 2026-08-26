import { defineSpecimen } from '../../../specimens/define';
import { Display } from '../index';
import type { DisplayProps } from '../index';

export const displaySpecimen = defineSpecimen<DisplayProps>({
  title: 'Display',
  description: 'Non-semantic display text using the shared heading scale.',
  component: Display,
  argTypes: {
    children: { control: 'text', defaultValue: 'Display text' },
    level: {
      control: 'select',
      options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const,
      defaultValue: 'h2',
    },
    size: {
      control: 'select',
      options: ['2xl', 'xl', 'large', 'medium', 'small', 'xs'] as const,
      defaultValue: 'large',
    },
    weight: {
      control: 'select',
      options: ['regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'] as const,
      defaultValue: 'black',
    },
    tone: {
      control: 'select',
      options: ['default', 'muted', 'subtle', 'accent'] as const,
      defaultValue: 'default',
    },
  },
  variants: [
    { name: 'Default', props: { level: 'h2', children: 'Display text' } },
    { name: 'Large', props: { level: 'h1', size: '2xl', children: 'Large display' } },
    { name: 'Accent', props: { level: 'h1', tone: 'accent', children: 'Accent display' } },
    { name: 'Muted', props: { level: 'h3', tone: 'muted', children: 'Muted display' } },
  ],
});
