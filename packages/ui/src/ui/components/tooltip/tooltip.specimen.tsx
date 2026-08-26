import { defineSpecimen } from '../../../specimens/define';
import { Tooltip } from '../index';
import type { TooltipAlign, TooltipSide } from '../index';
import { Button } from '../../primitives';

type TooltipDemoProps = {
  content: string;
  side: TooltipSide;
  align: TooltipAlign;
  showArrow: boolean;
  disabled: boolean;
  openDelay: number;
  closeDelay: number;
};

/**
 * Flat-prop wrapper so the convenience `Tooltip` can be driven by the lab's prop editor
 * and rendered (closed) by the specimen render test.
 */
const TooltipDemo = ({
  content,
  side,
  align,
  showArrow,
  disabled,
  openDelay,
  closeDelay,
}: TooltipDemoProps) => (
  <Tooltip
    content={content}
    side={side}
    align={align}
    showArrow={showArrow}
    disabled={disabled}
    openDelay={openDelay}
    closeDelay={closeDelay}
  >
    <Button tone="neutral" variant="outline">
      Hover or focus me
    </Button>
  </Tooltip>
);

export const tooltipSpecimen = defineSpecimen<TooltipDemoProps>({
  title: 'Tooltip',
  description:
    'Accessible hover/focus overlay built on Popover. Exposed as role="tooltip" with ' +
    'aria-describedby; opens on hover and keyboard focus, dismisses on leave / blur / ' +
    'Escape, and never traps focus.',
  component: TooltipDemo,
  argTypes: {
    content: { control: 'text', defaultValue: 'Copy to clipboard' },
    side: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'] as const,
      defaultValue: 'top',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'] as const,
      defaultValue: 'center',
    },
    showArrow: { control: 'boolean', defaultValue: false },
    disabled: { control: 'boolean', defaultValue: false },
    openDelay: { control: 'number', defaultValue: 300 },
    closeDelay: { control: 'number', defaultValue: 150 },
  },
  variants: [
    { name: 'Top', props: { content: 'Copy to clipboard', side: 'top' } },
    { name: 'Right + arrow', props: { content: 'Open settings', side: 'right', showArrow: true } },
    {
      name: 'Bottom, aligned start',
      props: { content: 'Shown below the trigger', side: 'bottom', align: 'start' },
    },
    { name: 'Disabled', props: { content: 'Never shown', disabled: true } },
  ],
});
