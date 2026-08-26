import { defineSpecimen } from '../../../specimens/define';
import { Callout } from '../index';
import type { CalloutSize, CalloutTone, CalloutVariant } from '../index';

type CalloutDemoProps = {
  tone: CalloutTone;
  variant: CalloutVariant;
  size: CalloutSize;
  title: string;
  body: string;
  dismissible: boolean;
  showAction: boolean;
};

/**
 * Flat-prop wrapper so the presentational `Callout` can be driven by the lab's
 * prop editor (icon/action/title are otherwise `ReactNode` slots).
 */
const CalloutDemo = ({
  tone,
  variant,
  size,
  title,
  body,
  dismissible,
  showAction,
}: CalloutDemoProps) => (
  <Callout
    tone={tone}
    variant={variant}
    size={size}
    title={title || undefined}
    dismissible={dismissible}
    action={
      showAction ? (
        <button
          type="button"
          className="text-sm font-semibold underline underline-offset-4 transition hover:opacity-80"
        >
          Resend email
        </button>
      ) : undefined
    }
  >
    {body}
  </Callout>
);

export const calloutSpecimen = defineSpecimen<CalloutDemoProps>({
  title: 'Callout',
  description:
    'Inline, in-content notice — the small-scale sibling of Banner. `subtle` (default) is a ' +
    'neutral box with a tone-coloured icon chip; `solid | surface | soft | outline` are ' +
    'tone-tinted containers. Tone drives the default icon and the alert/status role.',
  component: CalloutDemo,
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'neutral',
    },
    variant: {
      control: 'select',
      options: ['subtle', 'solid', 'surface', 'soft', 'outline'] as const,
      defaultValue: 'subtle',
    },
    size: { control: 'select', options: ['sm', 'md'] as const, defaultValue: 'md' },
    title: { control: 'text', defaultValue: '' },
    body: {
      control: 'text',
      defaultValue: 'This link will be verified after you confirm.',
    },
    dismissible: { control: 'boolean', defaultValue: false },
    showAction: { control: 'boolean', defaultValue: false },
  },
  variants: [
    {
      name: 'Subtle note (neutral)',
      props: {
        tone: 'neutral',
        variant: 'subtle',
        body: 'This link will be verified after you confirm.',
      },
    },
    {
      name: 'Subtle warning (amber)',
      props: {
        tone: 'amber',
        variant: 'subtle',
        size: 'sm',
        body: "Didn't get it? Check your spam or promotions folder, or wait up to 2 minutes.",
      },
    },
    {
      name: 'Soft error (red, role=alert)',
      props: {
        tone: 'red',
        variant: 'soft',
        title: 'Username taken',
        body: 'That username was claimed while you were setting up your profile.',
      },
    },
    {
      name: 'Surface info (blue)',
      props: {
        tone: 'blue',
        variant: 'surface',
        title: 'New feature',
        body: 'Profiles now support custom avatars.',
      },
    },
    {
      name: 'Success with action (green)',
      props: {
        tone: 'green',
        variant: 'soft',
        title: 'Email sent',
        body: 'Check your inbox to continue.',
        showAction: true,
      },
    },
    {
      name: 'Dismissible note',
      props: {
        tone: 'neutral',
        variant: 'subtle',
        body: 'You can dismiss this hint.',
        dismissible: true,
      },
    },
  ],
});
