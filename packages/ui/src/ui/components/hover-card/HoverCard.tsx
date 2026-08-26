'use client';

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { useState } from 'react';
import type { ComponentPropsWithoutRef, ReactElement, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Side of the trigger the card is placed on. */
export type HoverCardSide = 'top' | 'right' | 'bottom' | 'left';
/** Alignment of the card along the chosen side. */
export type HoverCardAlign = 'start' | 'center' | 'end';

/** Media query that matches touch / no-hover devices, where a hover preview is meaningless. */
const COARSE_POINTER_QUERY = '(hover: none), (pointer: coarse)';

// ── Root ──────────────────────────────────────────────────────────────────────

/** Props for {@link HoverCard}. */
export interface HoverCardProps {
  /** The {@link HoverCardTrigger} and {@link HoverCardContent} that make up the card. */
  children: ReactNode;
  /** Controlled open state. Provide alongside `onOpenChange`. */
  open?: boolean;
  /** Initial open state when uncontrolled. @defaultValue `false` */
  defaultOpen?: boolean;
  /**
   * Called whenever the open state should change (hover, focus, blur, Escape). Use this to
   * lazily fetch the preview content the first time the card opens.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * Delay in ms before the card opens on hover/focus. The deliberate delay means a quick
   * pass-through never opens the card (and never triggers a fetch). @defaultValue `300`
   */
  openDelay?: number;
  /** Delay in ms before the card closes on leave/blur. @defaultValue `150` */
  closeDelay?: number;
  /**
   * Suppress the hover preview on touch / no-hover devices, where it is meaningless and would
   * fight tap-to-navigate. When suppressed the card never opens and the content never mounts,
   * so the trigger keeps working as an ordinary link/tap target. @defaultValue `true`
   */
  disableOnMobile?: boolean;
}

/**
 * Root of a hover card — a preview surface shown when a sighted user hovers or focuses a
 * trigger (typically a link). Built on `@radix-ui/react-hover-card`: opens on hover **and**
 * keyboard focus, closes on leave / blur / `Escape`, is non-modal (never traps focus), and
 * flips/shifts to stay within the viewport.
 *
 * The content is generic — pass any `ReactNode`. To preview data fetched on demand, drive the
 * card with `open`/`onOpenChange` and start the fetch when it first opens; the `openDelay`
 * avoids fetching on an accidental pass-through.
 *
 * Use the compound parts for full control, or the {@link HoverCardPreview} convenience
 * component for the common case.
 *
 * @example
 * ```tsx
 * <HoverCard openDelay={200}>
 *   <HoverCardTrigger asChild>
 *     <a href="/u/lou">@lou</a>
 *   </HoverCardTrigger>
 *   <HoverCardContent side="top">…preview…</HoverCardContent>
 * </HoverCard>
 * ```
 */
export const HoverCard = ({
  children,
  open,
  defaultOpen,
  onOpenChange,
  openDelay = 300,
  closeDelay = 150,
  disableOnMobile = true,
}: HoverCardProps) => {
  // `useMediaQuery` reads the match during render, so on a client-only render a
  // touch device is known on the very first frame rather than one effect later.
  // Under SSR the hydration render still reports `false` (no `window` to ask) and
  // suppression lands on the first post-hydration commit instead.
  const isCoarsePointer = useMediaQuery(COARSE_POINTER_QUERY);
  const suppressed = disableOnMobile && isCoarsePointer;
  const isConsumerControlled = open !== undefined;

  // Uncontrolled consumers are mirrored into local state so the Radix root can
  // always be given an `open` value. Branching between an uncontrolled root
  // (`open=undefined`) and a suppressed controlled one (`open={false}`) made
  // the media query flip Radix between modes after mount, which triggers its
  // controlled/uncontrolled mode-switch warning and can drop state. A single
  // always-controlled root keeps the decision stable for the component's
  // lifetime; suppression then just forces the value to `false`.
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const resolvedOpen = suppressed ? false : isConsumerControlled ? open : internalOpen;

  const handleOpenChange = (next: boolean) => {
    // While suppressed the preview is inert — swallow open requests entirely so
    // consumers that lazily fetch on open never see a phantom `true`.
    if (suppressed && next) return;
    if (!isConsumerControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <HoverCardPrimitive.Root
      open={resolvedOpen}
      onOpenChange={handleOpenChange}
      openDelay={openDelay}
      closeDelay={closeDelay}
    >
      {children}
    </HoverCardPrimitive.Root>
  );
};

// ── Trigger ───────────────────────────────────────────────────────────────────

/**
 * The element the card previews. Pass `asChild` to render your own element (usually an anchor)
 * as the trigger while keeping the hover-card wiring. Keep the trigger a single focusable
 * element so keyboard users can open the card and reach the underlying link directly.
 */
export const HoverCardTrigger = HoverCardPrimitive.Trigger;
export type HoverCardTriggerProps = ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>;

// ── Arrow ───────────────────────────────────────────────────────────────────────

/** Props for {@link HoverCardArrow}. */
export interface HoverCardArrowProps extends ComponentPropsWithoutRef<
  typeof HoverCardPrimitive.Arrow
> {
  ref?: Ref<SVGSVGElement>;
}

/**
 * A small triangle pointing from the card toward the trigger, filled with the card surface
 * colour. Usually rendered via the `showArrow` prop on {@link HoverCardContent}.
 */
export const HoverCardArrow = ({ className, ref, ...props }: HoverCardArrowProps) => (
  <HoverCardPrimitive.Arrow
    ref={ref}
    className={cn('fill-(--ui-background)', className)}
    {...props}
  />
);

// ── Content ─────────────────────────────────────────────────────────────────────

/** Props for {@link HoverCardContent}. */
export interface HoverCardContentProps extends ComponentPropsWithoutRef<
  typeof HoverCardPrimitive.Content
> {
  /** Render a small arrow pointing at the trigger. @defaultValue `false` */
  showArrow?: boolean;
  /**
   * DOM node the content is portalled into. Defaults to `document.body`. Pass a node to scope
   * the portal (e.g. inside a dialog or a CSS containment boundary).
   */
  container?: HTMLElement | null;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The floating card surface. Renders in a portal and owns placement, the styled surface
 * (border, background, shadow, radius) and the open/close animations — matching the rest of the
 * overlay system. Holds any content: text, media, stats, actions.
 *
 * `side` (`top` | `right` | `bottom` | `left`) and `align` (`start` | `center` | `end`) control
 * placement; Radix flips/shifts it to stay in view. Content taller than the viewport scrolls
 * within `--radix-hover-card-content-available-height`, so it stays usable on small screens. The
 * default `w-64 p-4` surface can be overridden via `className`.
 *
 * @example
 * ```tsx
 * <HoverCardContent side="right" align="start" showArrow>
 *   <p>Account preview</p>
 * </HoverCardContent>
 * ```
 */
export const HoverCardContent = ({
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  collisionPadding = 8,
  showArrow = false,
  container,
  children,
  ref,
  ...props
}: HoverCardContentProps) => (
  <HoverCardPrimitive.Portal container={container ?? undefined}>
    <HoverCardPrimitive.Content
      ref={ref}
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'ui-popover z-50 w-64 max-w-[calc(100vw-1rem)] rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border-strong) bg-(--ui-background) p-4 text-(--ui-text-body) shadow-(--ui-shadow-md) outline-none',
        'max-h-(--radix-hover-card-content-available-height) overflow-y-auto overscroll-contain',
        'origin-(--radix-hover-card-content-transform-origin)',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    >
      {children}
      {showArrow ? <HoverCardArrow /> : null}
    </HoverCardPrimitive.Content>
  </HoverCardPrimitive.Portal>
);

// ── Convenience component ───────────────────────────────────────────────────────

/** Props for {@link HoverCardPreview}. */
export interface HoverCardPreviewProps
  extends
    Omit<HoverCardProps, 'children'>,
    Pick<HoverCardContentProps, 'side' | 'align' | 'sideOffset' | 'showArrow' | 'className'> {
  /** The preview shown on hover or focus. When nullish, the trigger renders with no card. */
  content: ReactNode;
  /** The trigger — a single focusable element. See {@link HoverCardTrigger}. */
  children: ReactElement;
}

/**
 * Single-element hover card for the common case: wrap a focusable element and pass the `content`
 * to preview on hover or focus. A thin wrapper over {@link HoverCard} / {@link HoverCardTrigger}
 * / {@link HoverCardContent} — reach for those directly when you need richer composition. When
 * `content` is nullish the trigger is rendered with no hover-card behaviour.
 *
 * @example
 * ```tsx
 * <HoverCardPreview content={<UserPreview id={id} />} side="top">
 *   <a href={`/u/${handle}`}>@{handle}</a>
 * </HoverCardPreview>
 * ```
 */
export const HoverCardPreview = ({
  content,
  children,
  side,
  align,
  sideOffset,
  showArrow,
  className,
  ...rootProps
}: HoverCardPreviewProps) => {
  if (content === null || content === undefined) {
    return children;
  }

  return (
    <HoverCard {...rootProps}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        showArrow={showArrow}
        className={className}
      >
        {content}
      </HoverCardContent>
    </HoverCard>
  );
};
