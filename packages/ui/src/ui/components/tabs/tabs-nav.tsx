'use client';

import { createContext, useContext } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';

import { cn } from '../../../lib/cn';
import {
  tabCountClass,
  tabIndicatorClass,
  tabsListClass,
  tabsToneClasses,
  tabTriggerClass,
} from './tabs.styles';
import type { TabsAlign, TabsIndicator, TabsSize, TabsTone, TabsVariant } from './tabs.styles';

type TabsNavStyleProps = {
  /** @defaultValue `'underline'` */
  variant?: TabsVariant;
  /** @defaultValue `'inset'` */
  indicator?: TabsIndicator;
  /** @defaultValue `'start'` */
  align?: TabsAlign;
  /** @defaultValue `'medium'` */
  size?: TabsSize;
  /** @defaultValue `'red'` */
  tone?: TabsTone;
};

// Style props cascade nav → links through context (the same shape Tabs.tsx uses
// for its panel surface) rather than `Children.map` + `cloneElement`, so links
// can sit behind wrappers, fragments, or interleaved non-link children without
// the clone pass injecting unknown props onto them.
const tabsNavStyleDefaults: Required<TabsNavStyleProps> = {
  variant: 'underline',
  indicator: 'inset',
  align: 'start',
  size: 'medium',
  tone: 'red',
};

const TabsNavStyleContext = createContext<Required<TabsNavStyleProps>>(tabsNavStyleDefaults);

/** Props for {@link TabsNav}. */
export type TabsNavProps = ComponentPropsWithoutRef<'nav'> & TabsNavStyleProps;

/**
 * A navigation tab bar: a `<nav>` landmark of links styled identically to
 * {@link Tabs} but using `aria-current="page"` rather than the `tablist`
 * role (per the W3C/Radix guidance that page navigation must not be a tablist).
 *
 * Style props set on the nav cascade to its {@link TabsNavLink} descendants via
 * context, so you only declare `variant`/`size`/etc. once — links do not need to
 * be direct children, and other elements can be interleaved freely. The
 * component is framework- and router-agnostic: the consumer supplies each link
 * element (via `asChild`) and computes the active flag.
 *
 * @example
 * ```tsx
 * <TabsNav aria-label="Profile sections" indicator="inset" size="small">
 *   <TabsNavLink active asChild><Link href="/profile">Profile</Link></TabsNavLink>
 *   <TabsNavLink asChild><Link href="/profile/posts">Posts</Link></TabsNavLink>
 * </TabsNav>
 * ```
 */
export const TabsNav = ({
  variant = 'underline',
  indicator = 'inset',
  align = 'start',
  size = 'medium',
  tone = 'red',
  'aria-label': ariaLabel = 'Tabs',
  className,
  children,
  ...props
}: TabsNavProps) => (
  <nav
    aria-label={ariaLabel}
    className={cn(tabsListClass({ variant, align }), className)}
    {...props}
  >
    <TabsNavStyleContext.Provider value={{ variant, indicator, align, size, tone }}>
      {children}
    </TabsNavStyleContext.Provider>
  </nav>
);

/** Props for {@link TabsNavLink}. */
export interface TabsNavLinkProps extends TabsNavStyleProps {
  /** Whether this link points at the current route. Renders `aria-current="page"`. */
  active?: boolean;
  /**
   * Optional count rendered after the label. In `asChild` mode the count is
   * injected into the supplied element alongside its own content.
   */
  count?: number;
  /**
   * Render the consumer's own element (e.g. a router `<Link>`) instead of a
   * plain `<a>`, merging the tab styling, `data-state` and `aria-current` onto
   * it. The supplied child must be a single element.
   *
   * @defaultValue `false`
   */
  asChild?: boolean;
  /** Destination for the default `<a>` (ignored when `asChild` is set). */
  href?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A single navigation tab. Renders a plain `<a>` by default, or the consumer's
 * element when `asChild` is set. Active styling is driven by the `active` prop;
 * style props inherit from the enclosing {@link TabsNav}, and any set directly
 * on the link win over the inherited ones.
 */
export const TabsNavLink = ({
  active = false,
  count,
  asChild = false,
  href,
  className,
  children,
  variant: variantProp,
  indicator: indicatorProp,
  align: alignProp,
  size: sizeProp,
  tone: toneProp,
}: TabsNavLinkProps) => {
  const inherited = useContext(TabsNavStyleContext);
  const variant = variantProp ?? inherited.variant;
  const indicator = indicatorProp ?? inherited.indicator;
  const align = alignProp ?? inherited.align;
  const size = sizeProp ?? inherited.size;
  const tone = toneProp ?? inherited.tone;

  const Comp = asChild ? Slot : 'a';

  const adornments = (
    <>
      {count != null && <span className={tabCountClass}>{count}</span>}
      {variant === 'underline' && (
        <span
          aria-hidden="true"
          className={cn(tabIndicatorClass({ indicator }), tabsToneClasses[tone].bar)}
        />
      )}
    </>
  );

  return (
    <Comp
      data-state={active ? 'active' : 'inactive'}
      aria-current={active ? 'page' : undefined}
      className={cn(
        tabTriggerClass({ variant, size, align }),
        variant === 'pill' && tabsToneClasses[tone].pill,
        className,
      )}
      {...(asChild ? {} : { href })}
    >
      {asChild ? <Slottable>{children}</Slottable> : children}
      {adornments}
    </Comp>
  );
};
