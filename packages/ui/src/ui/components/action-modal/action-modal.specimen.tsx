import { useState } from 'react';
import { defineSpecimen } from '../../../specimens/define';
import { ActionModal } from '../index';
import type { DialogAnimation } from '../index';
import { Button } from '../../primitives';
import type { ButtonTone } from '../../primitives';

type ActionModalDemoProps = {
  triggerLabel: string;
  title: string;
  description: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmTone: ButtonTone;
  hideClose: boolean;
  animation: DialogAnimation;
};

/**
 * Stateful wrapper so the generic `ActionModal` can be driven by the lab's prop editor.
 * Confirm simulates a ~1.2s async action to show the pending spinner + close-lock; the
 * specimen render test mounts it closed (no portal during SSR).
 */
const ActionModalDemo = ({
  triggerLabel,
  title,
  description,
  body,
  confirmLabel,
  cancelLabel,
  confirmTone,
  hideClose,
  animation,
}: ActionModalDemoProps) => {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleConfirm = (): void => {
    setPending(true);
    setTimeout(() => {
      setPending(false);
      setOpen(false);
    }, 1200);
  };

  return (
    <div className="flex min-h-60 items-center justify-center p-8">
      <Button tone={confirmTone} variant="solid" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <ActionModal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        confirmTone={confirmTone}
        hideClose={hideClose}
        animation={animation}
        pending={pending}
        onConfirm={handleConfirm}
      >
        <p className="text-sm leading-relaxed text-(--ui-text-body)">{body}</p>
      </ActionModal>
    </div>
  );
};

export const actionModalSpecimen = defineSpecimen<ActionModalDemoProps>({
  title: 'ActionModal',
  description:
    'Generic confirm/cancel modal built on the compound Dialog. Owns the header, a form ' +
    'so Enter confirms, a Cancel/Confirm footer, and the "cannot close while pending" lock. ' +
    'Callers pass only the body and wire onConfirm/onCancel.',
  component: ActionModalDemo,
  argTypes: {
    triggerLabel: { control: 'text', defaultValue: 'Delete account' },
    title: { control: 'text', defaultValue: 'Delete your account' },
    description: { control: 'text', defaultValue: 'This is permanent and cannot be undone.' },
    body: {
      control: 'text',
      defaultValue:
        'Your profile, photos, and account data will be permanently removed and you will be signed out.',
    },
    confirmLabel: { control: 'text', defaultValue: 'Delete my account' },
    cancelLabel: { control: 'text', defaultValue: 'Cancel' },
    confirmTone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'blue'] as const,
      defaultValue: 'red',
    },
    hideClose: { control: 'boolean', defaultValue: false },
    animation: {
      control: 'select',
      options: ['scale', 'fade', 'none'] as const,
      defaultValue: 'scale',
    },
  },
  variants: [
    {
      name: 'Destructive (delete)',
      props: {
        triggerLabel: 'Delete account',
        confirmTone: 'red',
        confirmLabel: 'Delete my account',
      },
    },
    {
      name: 'Neutral confirm',
      props: {
        triggerLabel: 'Publish changes',
        title: 'Publish changes?',
        description: 'Your edits will go live immediately.',
        body: 'Visitors will see the new version right away. You can keep editing afterwards.',
        confirmTone: 'neutral',
        confirmLabel: 'Publish',
      },
    },
  ],
});
