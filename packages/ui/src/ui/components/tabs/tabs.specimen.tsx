import { defineSpecimen } from '../../../specimens/define';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../index';
import type { TabsAlign, TabsIndicator, TabsSize, TabsTone, TabsVariant } from '../index';

type TabsDemoProps = {
  variant: TabsVariant;
  indicator: TabsIndicator;
  align: TabsAlign;
  size: TabsSize;
  tone: TabsTone;
  showCounts: boolean;
};

/**
 * Flat-prop wrapper so the compound `Tabs` can be driven by the lab's prop
 * editor and rendered by the specimen render test.
 */
const TabsDemo = ({ variant, indicator, align, size, tone, showCounts }: TabsDemoProps) => (
  <Tabs
    defaultValue="feed"
    variant={variant}
    indicator={indicator}
    align={align}
    size={size}
    tone={tone}
    className="w-full max-w-xl"
  >
    <TabsList aria-label="Demo feed">
      <TabsTrigger value="feed" count={showCounts ? 128 : undefined}>
        Feed
      </TabsTrigger>
      <TabsTrigger value="popular" count={showCounts ? 42 : undefined}>
        Popular
      </TabsTrigger>
      <TabsTrigger value="latest">Latest</TabsTrigger>
    </TabsList>
    <TabsContent value="feed" className="py-4 text-sm text-(--ui-text-subtle)">
      Your personalised feed.
    </TabsContent>
    <TabsContent value="popular" className="py-4 text-sm text-(--ui-text-subtle)">
      What is trending right now.
    </TabsContent>
    <TabsContent value="latest" className="py-4 text-sm text-(--ui-text-subtle)">
      The freshest posts.
    </TabsContent>
  </Tabs>
);

export const tabsSpecimen = defineSpecimen<TabsDemoProps>({
  title: 'Tabs',
  description:
    'In-page panel tabs (Radix) and link navigation tabs sharing one underline / pill style system.',
  component: TabsDemo,
  argTypes: {
    variant: {
      control: 'select',
      options: ['underline', 'pill'] as const,
      defaultValue: 'underline',
    },
    indicator: {
      control: 'select',
      options: ['inset', 'centered'] as const,
      defaultValue: 'inset',
    },
    align: {
      control: 'select',
      options: ['start', 'justified'] as const,
      defaultValue: 'start',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'] as const,
      defaultValue: 'medium',
    },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'red',
    },
    showCounts: { control: 'boolean', defaultValue: false },
  },
  variants: [
    {
      name: 'Feed (centered, justified)',
      props: { variant: 'underline', indicator: 'centered', align: 'justified', size: 'medium' },
    },
    {
      name: 'Profile (inset, counts)',
      props: {
        variant: 'underline',
        indicator: 'inset',
        align: 'start',
        size: 'small',
        showCounts: true,
      },
    },
    { name: 'Pill', props: { variant: 'pill', align: 'start', size: 'medium' } },
  ],
});
