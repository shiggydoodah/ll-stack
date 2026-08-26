import { defineSpecimen } from '../../../specimens/define';
import { MessageBubble } from '../index';
import type { MessageBubbleVariant, MessageStatus } from '../index';
import { MoreHorizontal } from '../../icons';
import { Avatar } from '../../primitives';

type MessageBubbleDemoProps = {
  variant: MessageBubbleVariant;
  status: MessageStatus;
  content: 'text' | 'long' | 'image';
  showAvatar: boolean;
  showName: boolean;
  showActions: boolean;
};

const SHORT_MESSAGE = 'Hey — are we still on for tomorrow at 10?';

const LONG_MESSAGE =
  'Absolutely. I pushed the latest build to staging and left notes on the two flows we ' +
  'discussed. When you get a sec, could you sanity-check the onboarding copy and the empty ' +
  'states? No rush — just before the review on Friday.';

// Inline placeholder so the image variant needs no network or bundled asset.
const SAMPLE_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='150'>" +
      "<rect width='220' height='150' rx='8' fill='#27272a'/>" +
      "<text x='50%' y='50%' fill='#fafafa' font-family='sans-serif' font-size='16' " +
      "text-anchor='middle' dominant-baseline='middle'>Shared photo</text></svg>",
  );

// Fixed reference time so the bubble shows a stable "5 mins ago" relative label.
const FIVE_MINUTES_AGO = Date.now() - 5 * 60 * 1000;

/**
 * Flat-prop wrapper so the presentational `MessageBubble` can be driven by the
 * lab's prop editor and rendered by the specimen render test. Each control maps to
 * one of the component's slots.
 */
const MessageBubbleDemo = ({
  variant,
  status,
  content,
  showAvatar,
  showName,
  showActions,
}: MessageBubbleDemoProps) => (
  <MessageBubble
    variant={variant}
    status={status}
    timestamp={FIVE_MINUTES_AGO}
    senderName={showName ? 'Marcus Bell' : undefined}
    avatar={showAvatar ? <Avatar initials="MB" size="sm" /> : undefined}
    actions={
      showActions ? (
        <button
          type="button"
          aria-label="Message actions"
          className="inline-flex size-7 items-center justify-center rounded-full text-(--ui-text-subtle) transition-colors hover:bg-(--ui-input-background) hover:text-(--ui-foreground)"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      ) : undefined
    }
  >
    {content === 'image' ? (
      <img
        src={SAMPLE_IMAGE}
        alt="Shared photo"
        width={220}
        height={150}
        className="block rounded-(--ui-radius-lg)"
      />
    ) : content === 'long' ? (
      LONG_MESSAGE
    ) : (
      SHORT_MESSAGE
    )}
  </MessageBubble>
);

export const messageBubbleSpecimen = defineSpecimen<MessageBubbleDemoProps>({
  title: 'MessageBubble',
  description:
    'Presentational chat bubble with sent / received variants. Content is a children slot; ' +
    'sender name, avatar, per-message actions, timestamp, and delivery status are optional.',
  component: MessageBubbleDemo,
  argTypes: {
    variant: {
      control: 'select',
      options: ['received', 'sent'] as const,
      defaultValue: 'received',
    },
    status: {
      control: 'select',
      options: ['sending', 'sent', 'delivered', 'read'] as const,
      defaultValue: 'read',
    },
    content: {
      control: 'select',
      options: ['text', 'long', 'image'] as const,
      defaultValue: 'text',
    },
    showAvatar: { control: 'boolean', defaultValue: false },
    showName: { control: 'boolean', defaultValue: false },
    showActions: { control: 'boolean', defaultValue: false },
  },
  variants: [
    {
      name: 'Received (name + avatar)',
      props: { variant: 'received', content: 'text', showName: true, showAvatar: true },
    },
    { name: 'Sent (read)', props: { variant: 'sent', content: 'text', status: 'read' } },
    {
      name: 'Long message',
      props: { variant: 'received', content: 'long', showAvatar: true },
    },
    {
      name: 'Image message',
      props: { variant: 'received', content: 'image', showName: true, showAvatar: true },
    },
  ],
});
