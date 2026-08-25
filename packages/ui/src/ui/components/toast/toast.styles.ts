import type { CSSProperties } from 'react';
import type { ToastClassnames } from 'sonner';

/**
 * Drives Sonner's surface colours from our `--ui-*` tokens so toasts (and the
 * close button) adapt to whichever theme the consuming app defines. The
 * `*-hover` vars colour the close button on hover: a subtle foreground tint with
 * the foreground X kept legible. Sonner only reads these vars in its `dark`
 * ruleset, so the {@link Toaster} forces `theme="dark"` and lets the tokens
 * decide the actual light/dark appearance.
 */
export const toasterStyleVars = {
  '--normal-bg': 'var(--ui-background)',
  '--normal-text': 'var(--ui-foreground)',
  '--normal-border': 'var(--ui-border-strong)',
  '--normal-bg-hover': 'color-mix(in oklab, var(--ui-foreground) 12%, transparent)',
  '--normal-border-hover': 'var(--ui-border-hover)',
} as CSSProperties;

/**
 * Class overrides applied to every toast so typography and the action controls
 * match the rest of the UI library. The close button's colours are driven by
 * the `--normal-*` vars above rather than classes (Sonner's hover selector
 * outranks utility classes).
 */
export const toasterClassNames = {
  toast:
    'ui-toast font-body rounded-(--ui-radius-md) border-(length:--ui-border-width) text-sm shadow-(--ui-shadow-md)',
  title: 'font-display text-sm font-bold',
  description: 'text-sm text-(--ui-text-subtle)',
  actionButton: 'ui-display-text font-display text-xs font-bold',
  cancelButton: 'ui-display-text font-display text-xs font-bold',
} satisfies ToastClassnames;
