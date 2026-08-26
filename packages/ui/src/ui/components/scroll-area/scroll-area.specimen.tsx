import { defineSpecimen } from '../../../specimens/define';
import { ScrollArea } from '../index';
import type { ScrollAreaOrientation } from '../index';

type ScrollType = 'scroll' | 'hover' | 'always' | 'auto';

type ScrollAreaDemoProps = {
  orientation: ScrollAreaOrientation;
  type: ScrollType;
  hideScrollbar: boolean;
};

/**
 * Flat-prop wrapper so the lab's prop editor can drive `orientation`, `type`, and
 * `hideScrollbar`. The content adapts to the chosen axis so there is always something
 * to scroll.
 */
const ScrollAreaDemo = ({ orientation, type, hideScrollbar }: ScrollAreaDemoProps) => {
  const vertical = orientation === 'vertical' || orientation === 'both';
  const horizontal = orientation === 'horizontal' || orientation === 'both';
  const lines = Array.from({ length: vertical ? 28 : 8 }, (_, i) => i + 1);

  return (
    <ScrollArea
      orientation={orientation}
      type={type}
      hideScrollbar={hideScrollbar}
      aria-label="Demo scroll area"
      className="h-72 w-72 rounded-(--ui-radius-md) border border-(--ui-border)"
    >
      <div className="p-4" style={{ width: horizontal ? 640 : undefined }}>
        {lines.map((line) => (
          <p key={line} className="py-1 text-sm whitespace-nowrap text-(--ui-text-body)">
            Line {line} — the quick brown fox jumps over the lazy dog.
          </p>
        ))}
      </div>
    </ScrollArea>
  );
};

export const scrollAreaSpecimen = defineSpecimen<ScrollAreaDemoProps>({
  title: 'ScrollArea',
  description:
    'Cross-platform scroll container (Radix) with a themed overlay scrollbar. Hides the native scrollbar while preserving native, touch-friendly scrolling. Give it a bounded height/width.',
  component: ScrollAreaDemo,
  argTypes: {
    orientation: {
      control: 'select',
      options: ['vertical', 'horizontal', 'both'] as const,
      defaultValue: 'vertical',
    },
    type: {
      control: 'select',
      options: ['scroll', 'hover', 'always', 'auto'] as const,
      defaultValue: 'scroll',
    },
    hideScrollbar: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Vertical', props: { orientation: 'vertical', type: 'scroll' } },
    { name: 'Horizontal', props: { orientation: 'horizontal', type: 'scroll' } },
    { name: 'Both axes', props: { orientation: 'both', type: 'scroll' } },
    { name: 'Always visible', props: { orientation: 'vertical', type: 'always' } },
    { name: 'Hidden bar', props: { orientation: 'vertical', hideScrollbar: true } },
  ],
});
