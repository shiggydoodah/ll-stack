import { defineSpecimen } from '../../../specimens/define';
import { Banner } from '../index';
import type { BannerProps } from '../index';

export const bannerSpecimen = defineSpecimen<BannerProps>({
  title: 'Banner',
  description:
    'Full-width banner for global, site-wide announcements (maintenance, outages, promos).',
  component: Banner,
  argTypes: {
    title: { control: 'text', defaultValue: 'Scheduled maintenance' },
    children: {
      control: 'text',
      defaultValue: 'The site will be unavailable on 12/06 at 22:00 UTC.',
    },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'amber',
    },
    variant: {
      control: 'select',
      options: ['solid', 'surface', 'soft', 'outline'] as const,
      defaultValue: 'surface',
    },
  },
  variants: [
    {
      name: 'Warning (amber surface)',
      props: {
        tone: 'amber',
        variant: 'surface',
        title: 'Scheduled maintenance',
        children: 'The site will be unavailable on 12/06 at 22:00 UTC.',
      },
    },
    {
      name: 'Dismissible (amber surface)',
      props: {
        tone: 'amber',
        variant: 'surface',
        title: 'Scheduled maintenance',
        children: 'The dismiss control renders only when an onDismiss handler is wired.',
        onDismiss: () => {},
      },
    },
    {
      name: 'Error (red solid)',
      props: {
        tone: 'red',
        variant: 'solid',
        title: 'Server issues',
        children: 'We are currently investigating elevated error rates.',
      },
    },
    {
      name: 'Info (blue surface)',
      props: {
        tone: 'blue',
        variant: 'surface',
        title: 'New feature',
        children: 'Profiles now support custom avatars.',
      },
    },
    {
      name: 'Success (green soft)',
      props: {
        tone: 'green',
        variant: 'soft',
        title: 'All set',
        children: 'Your changes have been published.',
      },
    },
    {
      name: 'Promo (purple soft)',
      props: {
        tone: 'purple',
        variant: 'soft',
        title: '14-day free trial',
        children: 'Only this weekend — upgrade and try every premium feature.',
      },
    },
    {
      name: 'Neutral (not dismissible)',
      props: {
        tone: 'neutral',
        variant: 'outline',
        title: 'Read-only notice',
        children: 'This banner is always shown — no onDismiss handler, no dismiss control.',
      },
    },
  ],
});
