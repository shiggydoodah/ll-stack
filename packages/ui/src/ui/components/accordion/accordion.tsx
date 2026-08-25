'use client';

import { createContext, useContext } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../../lib/cn';
import {
  accordionChevronClass,
  accordionContentClass,
  accordionContentInnerClass,
  accordionItemClass,
  accordionRootClass,
  accordionTriggerClass,
} from './accordion.styles';
import type { AccordionSize, AccordionVariant } from './accordion.styles';

export type { AccordionSize, AccordionVariant } from './accordion.styles';

type AccordionStyleContextValue = {
  variant: AccordionVariant;
  size: AccordionSize;
};

const accordionStyleDefaults: AccordionStyleContextValue = {
  variant: 'separated',
  size: 'medium',
};

const AccordionStyleContext = createContext<AccordionStyleContextValue>(accordionStyleDefaults);

const useAccordionStyleContext = () => useContext(AccordionStyleContext);

/** Visual style props layered on top of Radix's `Accordion.Root` props. */
type AccordionStyleProps = {
  /**
   * Visual treatment of the accordion.
   *
   * @defaultValue `'separated'`
   */
  variant?: AccordionVariant;

  /**
   * Size token controlling trigger padding and font scale.
   *
   * @defaultValue `'medium'`
   */
  size?: AccordionSize;
};

/**
 * Distribute the style props across Radix Root's `single | multiple` discriminated
 * union so `type`, `collapsible`, and the branch-correct `value` / `onValueChange`
 * signatures are all preserved. A plain `Union & Props` would collapse the union as
 * soon as the rest props are spread (`Omit` over a union drops branch-only keys).
 */
type WithAccordionStyle<T> = T extends unknown ? T & AccordionStyleProps : never;

/** Props for {@link Accordion}. Extends every Radix `Accordion.Root` prop. */
export type AccordionProps = WithAccordionStyle<
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>
>;

/**
 * Accessible, collapsible content sections backed by `@radix-ui/react-accordion`
 * (ARIA `region`/heading wiring, keyboard navigation, controlled + uncontrolled).
 *
 * Compose an {@link AccordionItem} per section, each holding an
 * {@link AccordionTrigger} (the title — any node) and an {@link AccordionContent}
 * (the body — any node). `type` is required: pass `type="single" collapsible` for a
 * one-at-a-time FAQ, or `type="multiple"` to let several stay open.
 *
 * @example
 * ```tsx
 * <Accordion type="single" collapsible variant="separated">
 *   <AccordionItem value="shipping">
 *     <AccordionTrigger>How long is shipping?</AccordionTrigger>
 *     <AccordionContent>3–5 business days.</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 */
export const Accordion = ({
  variant = 'separated',
  size = 'medium',
  className,
  ...props
}: AccordionProps) => (
  <AccordionStyleContext.Provider value={{ variant, size }}>
    <AccordionPrimitive.Root
      className={cn(accordionRootClass({ variant }), className)}
      {...props}
    />
  </AccordionStyleContext.Provider>
);

/** Props for {@link AccordionItem}. Extends every Radix `Accordion.Item` prop. */
export type AccordionItemProps = ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>;

/** A single collapsible section. `value` is required and identifies the item. */
export const AccordionItem = ({ className, ...props }: AccordionItemProps) => {
  const { variant } = useAccordionStyleContext();
  return (
    <AccordionPrimitive.Item
      className={cn(accordionItemClass({ variant }), className)}
      {...props}
    />
  );
};

/** Props for {@link AccordionTrigger}. Extends every Radix `Accordion.Trigger` prop. */
export type AccordionTriggerProps = ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>;

/**
 * The clickable header that toggles its section. Children are the title; a chevron
 * that rotates on open is appended automatically. Wrapped in a Radix `Header` so the
 * trigger is exposed as a heading to assistive tech.
 */
export const AccordionTrigger = ({ className, children, ...props }: AccordionTriggerProps) => {
  const { size } = useAccordionStyleContext();
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(accordionTriggerClass({ size }), className)}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden="true" className={accordionChevronClass} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
};

/** Props for {@link AccordionContent}. Extends every Radix `Accordion.Content` prop. */
export type AccordionContentProps = ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>;

/**
 * The collapsible body of a section. Holds any node — text, lists, forms, media.
 * The height open/close animation lives on the Radix wrapper; `className` styles the
 * inner padded body.
 */
export const AccordionContent = ({ className, children, ...props }: AccordionContentProps) => {
  const { size } = useAccordionStyleContext();
  return (
    <AccordionPrimitive.Content className={accordionContentClass} {...props}>
      <div className={cn(accordionContentInnerClass({ size }), className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
};
