'use client';

import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import type { ToasterProps as SonnerToasterProps } from 'sonner';

import { toasterClassNames, toasterStyleVars } from './toast.styles';

/**
 * Props for {@link Toaster}. Re-exports every Sonner `Toaster` prop so callers
 * can tweak position, duration, `expand`, etc.
 */
export type ToasterProps = SonnerToasterProps;

/**
 * Themed mount point for toasts, wrapping Sonner. Render this once near the
 * root of the app (the `NotificationProvider` does this for you). Toasts are
 * fired imperatively via {@link notify}.
 *
 * Defaults to bottom-right with a manual close button on every toast; auto and
 * manual dismissal are controlled per toast through {@link notify}.
 */
export const Toaster = ({
  // Sonner reads our `--normal-*` tokens (incl. the close-button colours) in its
  // `dark` ruleset; the tokens themselves decide the real light/dark appearance.
  theme = 'dark',
  position = 'bottom-right',
  closeButton = true,
  toastOptions,
  style,
  ...props
}: ToasterProps) => (
  <SonnerToaster
    theme={theme}
    position={position}
    closeButton={closeButton}
    toastOptions={{ classNames: toasterClassNames, ...toastOptions }}
    style={{ ...toasterStyleVars, ...style } as CSSProperties}
    {...props}
  />
);
