import { CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { AriaRole, ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import { bannerLayoutClass, bannerToneClasses } from './banner.styles';
import type { BannerTone, BannerVariant } from './banner.styles';

export type { BannerTone, BannerVariant };

/**
 * Default leading icon per tone. Pass `icon` to override, or `icon={null}` to
 * render a banner with no icon.
 */
const defaultToneIcon: Record<BannerTone, ReactNode> = {
  neutral: <Info size={18} aria-hidden="true" />,
  red: <CircleAlert size={18} aria-hidden="true" />,
  amber: <TriangleAlert size={18} aria-hidden="true" />,
  green: <CircleCheck size={18} aria-hidden="true" />,
  blue: <Info size={18} aria-hidden="true" />,
  purple: <Sparkles size={18} aria-hidden="true" />,
  magenta: <Sparkles size={18} aria-hidden="true" />,
};

/**
 * Props for {@link Banner}.
 *
 * Extends every standard `div` attribute except `title` (re-typed below to
 * accept rich content). The banner is purely presentational — dismissal
 * persistence is owned by the notification provider, not the component.
 */
export interface BannerProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * Tone scope for the banner.
   *
   * @defaultValue `'neutral'`
   */
  tone?: BannerTone;

  /**
   * Visual treatment applied using shared UI variant classes.
   *
   * @defaultValue `'surface'`
   */
  variant?: BannerVariant;

  /** Emphasised heading rendered above the message body. */
  title?: ReactNode;

  /** Message body. */
  children?: ReactNode;

  /**
   * Leading icon. Defaults to a tone-appropriate icon. Pass `null` to hide it.
   */
  icon?: ReactNode;

  /** Call-to-action slot rendered under the message (e.g. a `<Button />`). */
  action?: ReactNode;

  /**
   * Whether the banner renders a dismiss (X) control. Defaults to whether an
   * `onDismiss` handler is provided; pass `false` to hide the control even
   * with a handler. Without a handler no control is rendered — a dismiss
   * button that does nothing is worse than none.
   */
  dismissible?: boolean;

  /** Called when the dismiss control is activated. */
  onDismiss?: () => void;

  /**
   * Accessible label for the dismiss control.
   *
   * @defaultValue `'Dismiss'`
   */
  dismissLabel?: string;
}

const getDefaultRole = (tone: BannerTone): AriaRole =>
  tone === 'red' || tone === 'amber' ? 'alert' : 'status';

/**
 * Full-width banner for global, site-wide announcements (maintenance windows,
 * outages, warnings, or promotions). Styled with the shared tone/variant
 * classes to match the rest of the UI library.
 *
 * @example
 * ```tsx
 * <Banner tone="amber" title="Scheduled maintenance" onDismiss={hide}>
 *   The site will be unavailable on 12/06 at 22:00 UTC.
 * </Banner>
 * ```
 */
export const Banner = ({
  tone = 'neutral',
  variant = 'surface',
  title,
  children,
  icon,
  action,
  dismissible,
  onDismiss,
  dismissLabel = 'Dismiss',
  role,
  className,
  ...props
}: BannerProps) => {
  const resolvedIcon = icon === undefined ? defaultToneIcon[tone] : icon;
  // No handler → no button: rendering a no-op dismiss control would announce an
  // affordance that does nothing. The explicit prop only ever hides it.
  const showDismiss = onDismiss !== undefined && dismissible !== false;

  return (
    <div
      role={role ?? getDefaultRole(tone)}
      className={cn(bannerLayoutClass(), bannerToneClasses[tone][variant], className)}
      {...props}
    >
      {resolvedIcon ? <span className="mt-0.5 shrink-0">{resolvedIcon}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-display text-sm font-bold">{title}</p> : null}
        {children ? <div className="text-sm leading-snug opacity-90">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {showDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="-mt-1 -mr-1 inline-flex shrink-0 items-center justify-center rounded-(--ui-radius-sm) p-1 opacity-70 transition hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
};
