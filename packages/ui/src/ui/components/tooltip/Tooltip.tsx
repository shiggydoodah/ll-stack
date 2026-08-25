'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';

import { cn } from '../../../lib/cn';
import { Popover, PopoverAnchor, PopoverContent } from '../popover';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Placement of the tooltip relative to its trigger. */
export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
/** Alignment of the tooltip along the chosen side. */
export type TooltipAlign = 'start' | 'center' | 'end';

// ── Context ───────────────────────────────────────────────────────────────────

type TooltipContextValue = {
  /** Whether the tooltip is currently visible. */
  open: boolean;
  /** Stable id shared by the content (`id`) and trigger (`aria-describedby`). */
  contentId: string;
  /** Live reference to the trigger element, used to exempt it from outside-dismiss. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Open after the hover delay (used by pointer-enter). */
  scheduleOpen: () => void;
  /** Close after the hover delay (used by pointer-leave). */
  scheduleClose: () => void;
  /** Open with no delay (used by keyboard focus). */
  openImmediate: () => void;
  /** Close with no delay (used by blur / Escape / outside interaction). */
  closeImmediate: () => void;
  /** Cancel a pending close so hovering the content keeps it open. */
  cancelClose: () => void;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

const useTooltipContext = (): TooltipContextValue => {
  const context = useContext(TooltipContext);
  if (context === null) {
    throw new Error('Tooltip parts must be rendered inside <TooltipRoot> (or <Tooltip>).');
  }
  return context;
};

// ── Surface ───────────────────────────────────────────────────────────────────

/**
 * Compact overrides applied on top of the {@link PopoverContent} surface — a tooltip
 * shrinks the default `w-72 p-4` panel and uses smaller text while keeping the shared
 * border, background, shadow and animations. `tailwind-merge` (via `cn`) resolves the
 * width / padding / radius conflicts in favour of these values.
 */
const tooltipSurfaceClass = 'w-auto max-w-xs rounded-(--ui-radius-md) px-3 py-1.5 text-sm';

// ── Root ──────────────────────────────────────────────────────────────────────

/** Props for {@link TooltipRoot}. */
export interface TooltipRootProps {
  /** The {@link TooltipTrigger} and {@link TooltipContent} that make up the tooltip. */
  children: ReactNode;
  /** Controlled open state. Provide alongside `onOpenChange`. */
  open?: boolean;
  /** Initial open state when uncontrolled. @defaultValue `false` */
  defaultOpen?: boolean;
  /** Called whenever the open state should change (hover, focus, Escape, blur). */
  onOpenChange?: (open: boolean) => void;
  /** Delay in ms before opening on hover. @defaultValue `300` */
  openDelay?: number;
  /** Delay in ms before closing on leave. @defaultValue `150` */
  closeDelay?: number;
  /** Disable the tooltip — it never opens. @defaultValue `false` */
  disabled?: boolean;
}

/**
 * Root of a tooltip. Owns the open state, the hover open/close delays and the wiring
 * between {@link TooltipTrigger} and {@link TooltipContent}. Built on the shared
 * {@link Popover} (non-modal) for positioning and the styled surface, but exposes proper
 * tooltip semantics: opens on hover **and** keyboard focus, closes on leave, blur,
 * `Escape` or outside interaction, and never traps focus. On touch devices (no hover) a
 * tap on the trigger toggles the tooltip, so it doubles as a tap-to-open "toggletip".
 *
 * Use the compound parts for full control, or the {@link Tooltip} convenience component
 * for the common case.
 *
 * @example
 * ```tsx
 * <TooltipRoot>
 *   <TooltipTrigger>
 *     <Button>Copy</Button>
 *   </TooltipTrigger>
 *   <TooltipContent side="top">Copy to clipboard</TooltipContent>
 * </TooltipRoot>
 * ```
 */
export const TooltipRoot = ({
  children,
  open: openProp,
  defaultOpen,
  onOpenChange,
  openDelay = 300,
  closeDelay = 150,
  disabled = false,
}: TooltipRootProps) => {
  const contentId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = disabled ? false : isControlled ? openProp : uncontrolledOpen;

  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const scheduleOpen = useCallback(() => {
    if (disabled) return;
    clearCloseTimer();
    if (openTimer.current !== null) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, openDelay);
  }, [disabled, clearCloseTimer, openDelay, setOpen]);

  const scheduleClose = useCallback(() => {
    clearOpenTimer();
    if (closeTimer.current !== null) return;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, closeDelay);
  }, [clearOpenTimer, closeDelay, setOpen]);

  const openImmediate = useCallback(() => {
    if (disabled) return;
    clearOpenTimer();
    clearCloseTimer();
    setOpen(true);
  }, [disabled, clearOpenTimer, clearCloseTimer, setOpen]);

  const closeImmediate = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setOpen(false);
  }, [clearOpenTimer, clearCloseTimer, setOpen]);

  const cancelClose = useCallback(() => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  // Clear any pending timers when the tooltip unmounts.
  useEffect(
    () => () => {
      clearOpenTimer();
      clearCloseTimer();
    },
    [clearOpenTimer, clearCloseTimer],
  );

  const context = useMemo<TooltipContextValue>(
    () => ({
      open,
      contentId,
      triggerRef,
      scheduleOpen,
      scheduleClose,
      openImmediate,
      closeImmediate,
      cancelClose,
    }),
    [open, contentId, scheduleOpen, scheduleClose, openImmediate, closeImmediate, cancelClose],
  );

  return (
    <TooltipContext.Provider value={context}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Without a PopoverTrigger, Radix only ever asks us to close here
          // (Escape key or outside interaction via the dismissable layer).
          if (!next) closeImmediate();
        }}
      >
        {children}
      </Popover>
    </TooltipContext.Provider>
  );
};

// ── Trigger ───────────────────────────────────────────────────────────────────

/** Props for {@link TooltipTrigger}. */
export interface TooltipTriggerProps {
  /**
   * The trigger element. Must be a single, focusable element (a `button`, `a`, or an
   * element with `tabIndex`) so the tooltip is reachable by keyboard and announced to
   * screen readers. The tooltip wiring is merged onto this element via `asChild`.
   */
  children: ReactElement;
  /** Optional class merged onto the trigger element. */
  className?: string;
}

/**
 * The element a tooltip describes. Renders as a positioning anchor for the content and
 * attaches the hover/focus listeners plus `aria-describedby` (set only while open) onto
 * your child element. Unlike a popover trigger it adds no `aria-haspopup`/`aria-expanded`,
 * matching the ARIA tooltip pattern.
 */
export const TooltipTrigger = ({ children, className }: TooltipTriggerProps) => {
  const {
    open,
    contentId,
    triggerRef,
    scheduleOpen,
    scheduleClose,
    openImmediate,
    closeImmediate,
  } = useTooltipContext();
  // Remembers whether the in-flight interaction came from a touch pointer, so the
  // following `click`/`focus` can be routed to tap-to-toggle instead of hover/focus.
  const isTouch = useRef(false);

  const setTriggerNode = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    [triggerRef],
  );

  return (
    <PopoverAnchor
      asChild
      ref={setTriggerNode}
      className={className}
      aria-describedby={open ? contentId : undefined}
      onPointerDown={(event) => {
        isTouch.current = event.pointerType === 'touch';
      }}
      onPointerEnter={(event) => {
        // Touch has no hover; a tap fires enter+leave and would never settle open.
        if (event.pointerType !== 'touch') scheduleOpen();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') scheduleClose();
      }}
      onFocus={() => {
        // A tap can also focus the trigger; let the tap handler own that case.
        if (!isTouch.current) openImmediate();
      }}
      onBlur={() => {
        isTouch.current = false;
        closeImmediate();
      }}
      onClick={() => {
        // On touch devices a tap toggles the tooltip (a "toggletip").
        if (!isTouch.current) return;
        isTouch.current = false;
        if (open) closeImmediate();
        else openImmediate();
      }}
    >
      {children}
    </PopoverAnchor>
  );
};

// ── Content ───────────────────────────────────────────────────────────────────

/** Props for {@link TooltipContent}. */
export interface TooltipContentProps {
  /** The tooltip body — keep it short and non-interactive. */
  children: ReactNode;
  /** Side of the trigger to render on. @defaultValue `'top'` */
  side?: TooltipSide;
  /** Alignment along the chosen side. @defaultValue `'center'` */
  align?: TooltipAlign;
  /** Gap in px between trigger and tooltip. @defaultValue `6` */
  sideOffset?: number;
  /** Render a small arrow pointing at the trigger. @defaultValue `false` */
  showArrow?: boolean;
  /** Class merged onto the content surface. */
  className?: string;
}

/**
 * The floating tooltip surface. Reuses {@link PopoverContent} for placement, the portal,
 * the styled surface and animations, but is exposed as `role="tooltip"`, keeps focus on
 * the trigger (auto-focus is prevented and the underlying popover is non-modal) and stays
 * open while hovered. Radix flips/shifts it to stay in view near viewport edges.
 */
export const TooltipContent = ({
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  showArrow = false,
  className,
}: TooltipContentProps) => {
  const { contentId, triggerRef, cancelClose, scheduleClose } = useTooltipContext();

  return (
    <PopoverContent
      id={contentId}
      role="tooltip"
      side={side}
      align={align}
      sideOffset={sideOffset}
      showArrow={showArrow}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onPointerEnter={cancelClose}
      onPointerLeave={scheduleClose}
      onInteractOutside={(event) => {
        // We anchor (not "trigger") the popover, so Radix sees a tap on the trigger as
        // an outside dismiss. Exempt it — the trigger's own tap handler owns toggling.
        const target = event.target as Node | null;
        if (target && triggerRef.current?.contains(target)) {
          event.preventDefault();
        }
      }}
      className={cn(tooltipSurfaceClass, className)}
    >
      {children}
    </PopoverContent>
  );
};

// ── Convenience component ───────────────────────────────────────────────────────

/** Props for {@link Tooltip}. */
export interface TooltipProps
  extends
    Omit<TooltipRootProps, 'children'>,
    Pick<TooltipContentProps, 'side' | 'align' | 'sideOffset' | 'showArrow' | 'className'> {
  /** The tooltip text/content shown on hover or focus. */
  content: ReactNode;
  /** The trigger — a single focusable element. See {@link TooltipTrigger}. */
  children: ReactElement;
}

/**
 * Single-element tooltip for the common case: wrap a focusable element and pass the
 * `content` to show on hover or focus. A thin wrapper over {@link TooltipRoot} /
 * {@link TooltipTrigger} / {@link TooltipContent} — reach for those directly when you
 * need richer composition. When `content` is empty or `disabled` is set, the trigger is
 * rendered with no tooltip behaviour.
 *
 * @example
 * ```tsx
 * <Tooltip content="Copy to clipboard" side="top">
 *   <Button>Copy</Button>
 * </Tooltip>
 * ```
 */
export const Tooltip = ({
  content,
  children,
  side,
  align,
  sideOffset,
  showArrow,
  className,
  disabled = false,
  ...rootProps
}: TooltipProps) => {
  if (disabled || content === null || content === undefined || content === '') {
    return children;
  }

  return (
    <TooltipRoot {...rootProps}>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        showArrow={showArrow}
        className={className}
      >
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
};
