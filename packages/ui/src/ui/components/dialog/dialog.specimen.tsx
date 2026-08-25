import { useState } from 'react';
import { defineSpecimen } from '../../../specimens/define';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../index';
import type { DialogAnimation } from '../index';
import { Button } from '../../primitives';

type DialogDemoProps = {
  triggerLabel: string;
  title: string;
  description: string;
  body: string;
  withFooter: boolean;
  hideClose: boolean;
  animation: DialogAnimation;
};

/**
 * Stateful wrapper so the controlled compound `Dialog` can be driven by the lab's prop
 * editor. Renders a trigger that opens the dialog; the specimen render test mounts it
 * closed (Radix only portals the content while open, so SSR stays portal-free).
 */
const DialogDemo = ({
  triggerLabel,
  title,
  description,
  body,
  withFooter,
  hideClose,
  animation,
}: DialogDemoProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-60 items-center justify-center p-8">
      <Button tone="neutral" variant="outline" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent hideClose={hideClose} animation={animation}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <p className="text-sm leading-relaxed text-(--ui-text-body)">{body}</p>

          {withFooter ? (
            <DialogFooter>
              <DialogClose asChild>
                <Button tone="neutral" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button tone="red" variant="solid">
                  Confirm
                </Button>
              </DialogClose>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const dialogSpecimen = defineSpecimen<DialogDemoProps>({
  title: 'Dialog',
  description:
    'Accessible modal built on @radix-ui/react-dialog, composed from the compound parts ' +
    '(Dialog.Content / Header / Title / Description / Footer / Close). Controlled via ' +
    'open/onOpenChange; focus trap, scroll lock, Escape and overlay-click close come for free.',
  component: DialogDemo,
  argTypes: {
    triggerLabel: { control: 'text', defaultValue: 'Open dialog' },
    title: { control: 'text', defaultValue: 'Invite teammates' },
    description: { control: 'text', defaultValue: 'They will get an email with a join link.' },
    body: {
      control: 'text',
      defaultValue:
        'Anyone with the link can request access. You can revoke a member from settings at any time.',
    },
    withFooter: { control: 'boolean', defaultValue: true },
    hideClose: { control: 'boolean', defaultValue: false },
    animation: {
      control: 'select',
      options: ['scale', 'fade', 'float', 'none'] as const,
      defaultValue: 'scale',
    },
  },
  variants: [
    { name: 'With footer actions', props: { withFooter: true } },
    { name: 'Body only', props: { withFooter: false } },
    {
      name: 'Without close button',
      props: { hideClose: true, withFooter: true, title: 'Heads up' },
    },
    { name: 'Fade animation', props: { animation: 'fade' } },
    { name: 'Float animation', props: { animation: 'float' } },
  ],
});
