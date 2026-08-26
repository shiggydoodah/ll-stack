import { defineSpecimen } from '../../../specimens/define';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../index';
import type { AccordionSize, AccordionVariant } from '../index';

type AccordionDemoProps = {
  variant: AccordionVariant;
  size: AccordionSize;
  collapsible: boolean;
};

const faqs = [
  {
    value: 'shipping',
    title: 'How long does shipping take?',
    body: 'Most orders arrive within 3–5 business days. Tracking is emailed the moment your parcel leaves the warehouse.',
  },
  {
    value: 'returns',
    title: 'What is your returns policy?',
    body: 'Unused items can be returned within 30 days for a full refund. Start a return from your orders page.',
  },
  {
    value: 'support',
    title: 'How do I contact support?',
    body: 'Our team is available 9–5 GMT on weekdays via the in-app chat, or email support@example.com',
  },
];

/**
 * Flat-prop wrapper so the compound `Accordion` can be driven by the lab's prop
 * editor and rendered by the specimen render test.
 */
const AccordionDemo = ({ variant, size, collapsible }: AccordionDemoProps) => (
  <Accordion
    type="single"
    collapsible={collapsible}
    variant={variant}
    size={size}
    defaultValue="shipping"
    className="w-full max-w-xl"
  >
    {faqs.map((faq) => (
      <AccordionItem key={faq.value} value={faq.value}>
        <AccordionTrigger>{faq.title}</AccordionTrigger>
        <AccordionContent>{faq.body}</AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

export const accordionSpecimen = defineSpecimen<AccordionDemoProps>({
  title: 'Accordion',
  description:
    'Collapsible content sections (Radix) for FAQs and help panels — a title plus any-node content, in separated / contained / ghost variants.',
  component: AccordionDemo,
  argTypes: {
    variant: {
      control: 'select',
      options: ['separated', 'contained', 'ghost'] as const,
      defaultValue: 'separated',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'] as const,
      defaultValue: 'medium',
    },
    collapsible: { control: 'boolean', defaultValue: true },
  },
  variants: [
    { name: 'Separated (FAQ)', props: { variant: 'separated', size: 'medium' } },
    { name: 'Contained', props: { variant: 'contained', size: 'medium' } },
    { name: 'Ghost', props: { variant: 'ghost', size: 'medium' } },
    { name: 'Large', props: { variant: 'separated', size: 'large' } },
  ],
});
