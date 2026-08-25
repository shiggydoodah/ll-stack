import { defineSpecimen } from '../../../specimens/define';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../index';
import { Button } from '../../primitives';

type DrawerDemoProps = {
  direction: 'top' | 'right' | 'bottom' | 'left';
  modal: boolean;
  dismissible: boolean;
  dragToDismiss: boolean;
};

/**
 * Flat-prop wrapper so the convenience parts can be driven by the lab's prop editor and
 * rendered (closed) by the specimen render test. Renders a complete, openable drawer.
 */
const DrawerDemo = ({ direction, modal, dismissible, dragToDismiss }: DrawerDemoProps) => (
  <Drawer
    direction={direction}
    modal={modal}
    dismissible={dismissible}
    dragToDismiss={dragToDismiss}
  >
    <DrawerTrigger asChild>
      <Button tone="neutral">Open drawer</Button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Edit profile</DrawerTitle>
        <DrawerDescription>Make changes to your profile here.</DrawerDescription>
      </DrawerHeader>
      <div className="px-4 text-sm text-(--ui-text-muted)">
        Drawer body content. Drag the handle or press Escape to dismiss.
      </div>
      <DrawerFooter>
        <Button>Save changes</Button>
        <DrawerClose asChild>
          <Button tone="neutral" variant="outline">
            Cancel
          </Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
);

export const drawerSpecimen = defineSpecimen<DrawerDemoProps>({
  title: 'Drawer',
  description:
    'Slide-out panel built on vaul (opt-in drag-to-dismiss, 4 directions). An accessible ' +
    'dialog with focus trap, scroll lock and Escape-to-close, styled with the shared UI tokens.',
  component: DrawerDemo,
  argTypes: {
    direction: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'] as const,
      defaultValue: 'right',
    },
    modal: { control: 'boolean', defaultValue: true },
    dismissible: { control: 'boolean', defaultValue: true },
    dragToDismiss: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Right', props: { direction: 'right' } },
    { name: 'Left', props: { direction: 'left' } },
    { name: 'Bottom', props: { direction: 'bottom' } },
    { name: 'Top', props: { direction: 'top' } },
  ],
});
