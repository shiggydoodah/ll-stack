import { defineSpecimen } from '../../../specimens/define';
import { Heading } from '../index';
import type { HeadingProps } from '../index';

export const headingSpecimen = defineSpecimen<HeadingProps>({
  title: 'Heading',
  description: 'Semantic heading element using the shared typography scale.',
  component: Heading,
  argTypes: {
    children: { control: 'text', defaultValue: 'The quick brown fox' },
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
    tracking: {
      control: 'select',
      options: ['normal', 'wide', 'widest'] as const,
      defaultValue: 'wide',
    },
    leading: {
      control: 'select',
      options: ['none', 'tight', 'snug', 'normal'] as const,
      defaultValue: 'none',
    },
    tone: {
      control: 'select',
      options: ['default', 'muted', 'subtle', 'accent'] as const,
      defaultValue: 'default',
    },
  },
  variants: [
    { name: 'H1', props: { level: 'h1', children: 'Heading One' } },
    { name: 'H2', props: { level: 'h2', children: 'Heading Two' } },
    { name: 'H3', props: { level: 'h3', children: 'Heading Three' } },
    { name: 'H4', props: { level: 'h4', children: 'Heading Four' } },
    { name: 'Accent', props: { level: 'h2', tone: 'accent', children: 'Accent heading' } },
    { name: 'Muted', props: { level: 'h3', tone: 'muted', children: 'Muted heading' } },
  ],
});
