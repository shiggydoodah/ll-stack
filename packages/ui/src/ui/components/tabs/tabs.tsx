'use client';

import { createContext, useContext } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '../../../lib/cn';
import {
  tabContentClass,
  tabCountClass,
  tabIndicatorClass,
  tabsListClass,
  tabsToneClasses,
  tabTriggerClass,
} from './tabs.styles';
import type { TabsAlign, TabsIndicator, TabsSize, TabsTone, TabsVariant } from './tabs.styles';

export type { TabsAlign, TabsIndicator, TabsSize, TabsTone, TabsVariant } from './tabs.styles';

type TabsStyleContextValue = {
  variant: TabsVariant;
  indicator: TabsIndicator;
  align: TabsAlign;
  size: TabsSize;
  tone: TabsTone;
};

const tabsStyleDefaults: TabsStyleContextValue = {
  variant: 'underline',
  indicator: 'inset',
  align: 'start',
  size: 'medium',
  tone: 'red',
};

const TabsStyleContext = createContext<TabsStyleContextValue>(tabsStyleDefaults);

const useTabsStyleContext = () => useContext(TabsStyleContext);

/**
 * Props for {@link Tabs}. Extends every Radix `Tabs.Root` prop (so `value`,
 * `defaultValue`, `onValueChange` and `activationMode` work as documented)
 * except `orientation`, which is fixed to horizontal to match the styling.
 */
export interface TabsProps extends Omit<
  ComponentPropsWithoutRef<typeof TabsPrimitive.Root>,
  'orientation'
> {
  /**
   * Visual treatment of the tab set.
   *
   * @defaultValue `'underline'`
   */
  variant?: TabsVariant;

  /**
   * Active-bar shape for the `underline` variant.
   *
   * @defaultValue `'inset'`
   */
  indicator?: TabsIndicator;

  /**
   * Accent scope for the active indicator / pill fill.
   *
   * @defaultValue `'red'`
   */
  tone?: TabsTone;

  /**
   * Size token.
   *
   * @defaultValue `'medium'`
   */
  size?: TabsSize;

  /**
   * Distribution of triggers along the list. `justified` makes every trigger
   * fill an equal share of the width.
   *
   * @defaultValue `'start'`
   */
  align?: TabsAlign;

  children: ReactNode;
}

/**
 * Accessible, in-page tabs backed by `@radix-ui/react-tabs` (ARIA
 * `tablist`/`tab`/`tabpanel`, keyboard navigation, controlled + uncontrolled).
 *
 * Use this when switching content **within the same page**. For tabs that
 * navigate to real routes, use {@link TabsNav} / {@link TabsNavLink} instead.
 *
 * Inactive `TabsContent` is unmounted by default, which makes it the natural
 * place to lazily fetch a panel's data: render a child that loads on mount and
 * it only runs once its tab becomes active.
 *
 * @example
 * ```tsx
 * <Tabs defaultValue="foryou" indicator="centered" align="justified">
 *   <TabsList aria-label="Feed">
 *     <TabsTrigger value="foryou">For You</TabsTrigger>
 *     <TabsTrigger value="media" count={12}>Media</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="foryou">…</TabsContent>
 *   <TabsContent value="media"><LazyMedia /></TabsContent>
 * </Tabs>
 * ```
 */
export const Tabs = ({
  variant = 'underline',
  indicator = 'inset',
  tone = 'red',
  size = 'medium',
  align = 'start',
  children,
  ...props
}: TabsProps) => (
  <TabsStyleContext.Provider value={{ variant, indicator, tone, size, align }}>
    <TabsPrimitive.Root {...props}>{children}</TabsPrimitive.Root>
  </TabsStyleContext.Provider>
);

/** Props for {@link TabsList}. Extends every Radix `Tabs.List` prop. */
export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;

/** The row of triggers. Styling is inherited from the enclosing {@link Tabs}. */
export const TabsList = ({ className, ...props }: TabsListProps) => {
  const { variant, align } = useTabsStyleContext();
  return (
    <TabsPrimitive.List className={cn(tabsListClass({ variant, align }), className)} {...props} />
  );
};

/** Props for {@link TabsTrigger}. Extends every Radix `Tabs.Trigger` prop. */
export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Optional count rendered after the label. */
  count?: number;
}

/** A single tab button. `value` is required and ties it to a {@link TabsContent}. */
export const TabsTrigger = ({ count, className, children, ...props }: TabsTriggerProps) => {
  const { variant, indicator, size, align, tone } = useTabsStyleContext();
  return (
    <TabsPrimitive.Trigger
      className={cn(
        tabTriggerClass({ variant, size, align }),
        variant === 'pill' && tabsToneClasses[tone].pill,
        className,
      )}
      {...props}
    >
      {children}
      {count != null && <span className={tabCountClass}>{count}</span>}
      {variant === 'underline' && (
        <span
          aria-hidden="true"
          className={cn(tabIndicatorClass({ indicator }), tabsToneClasses[tone].bar)}
        />
      )}
    </TabsPrimitive.Trigger>
  );
};

/** Props for {@link TabsContent}. Extends every Radix `Tabs.Content` prop. */
export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

/** A tab panel. `value` is required and ties it to a {@link TabsTrigger}. */
export const TabsContent = ({ className, ...props }: TabsContentProps) => (
  <TabsPrimitive.Content className={cn(tabContentClass, className)} {...props} />
);
