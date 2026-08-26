import { defineSpecimen } from '../../../specimens/define';
import { Text } from '../index';
import type { TextProps } from '../index';

export const textSpecimen = defineSpecimen<TextProps>({
  title: 'Text',
  description: 'Body text element using the shared text scale and body font.',
  component: Text,
  argTypes: {
    children: {
      control: 'text',
      defaultValue: 'The quick brown fox jumps over the lazy dog.',
    },
    as: {
      control: 'select',
      options: ['span', 'p', 'label'] as const,
      defaultValue: 'span',
    },
    size: {
      control: 'select',
      options: ['2xl', 'xl', 'large', 'medium', 'small', 'xs', '2xs'] as const,
      defaultValue: 'medium',
    },
    weight: {
      control: 'select',
      options: ['regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'] as const,
      defaultValue: 'regular',
    },
    tracking: {
      control: 'select',
      options: ['normal', 'wide', 'widest'] as const,
      defaultValue: 'normal',
    },
    leading: {
      control: 'select',
      options: ['none', 'tight', 'snug', 'normal'] as const,
      defaultValue: 'normal',
    },
    tone: {
      control: 'select',
      options: ['default', 'muted', 'subtle', 'accent'] as const,
      defaultValue: 'default',
    },
  },
  variants: [
    { name: 'Span', props: { as: 'span', children: 'Inline span text' } },
    {
      name: 'Paragraph',
      props: {
        as: 'p',
        children:
          'A paragraph of body copy that wraps across multiple lines to show measure, rhythm, and the default leading of the shared text scale.',
      },
    },
    { name: 'Label', props: { as: 'label', children: 'Email address' } },
    { name: 'Subtle', props: { tone: 'subtle', children: 'Subtle supporting text' } },
    { name: 'Muted', props: { tone: 'muted', children: 'Muted supporting text' } },
    { name: 'Small', props: { size: 'small', children: 'Small print and footnotes' } },
  ],
});
