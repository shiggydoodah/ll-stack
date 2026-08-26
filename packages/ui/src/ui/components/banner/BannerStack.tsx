import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import { Banner } from './Banner';
import type { BannerTone, BannerVariant } from './banner.styles';

/**
 * Serialisable description of a global banner. This is the data contract a host
 * app (and, later, the admin-set backend feed) supplies to render a stack.
 */
export interface GlobalBannerData {
  /** Stable id used to remember dismissal. */
  id: string;
  /** @defaultValue `'neutral'` */
  tone?: BannerTone;
  /** @defaultValue `'surface'` */
  variant?: BannerVariant;
  /** Emphasised heading. */
  title?: ReactNode;
  /** Message body. */
  message?: ReactNode;
  /** Optional call-to-action (e.g. a `<Button />`). */
  action?: ReactNode;
  /**
   * Whether users can dismiss this banner.
   *
   * @defaultValue `true`
   */
  dismissible?: boolean;
}

/**
 * Props for {@link BannerStack}.
 */
export interface BannerStackProps extends ComponentPropsWithoutRef<'div'> {
  /** Banners to render, top to bottom. */
  banners: GlobalBannerData[];
  /** Called with a banner id when its dismiss control is activated. */
  onDismiss: (id: string) => void;
}

/**
 * Renders a vertical stack of {@link Banner}s from plain data, wiring each
 * banner's dismiss control to `onDismiss`. Presentational and state-free — pair
 * it with `useNotifications()` from the notification provider (which supplies
 * the active `banners` and a `dismissBanner` callback), or drive it with your
 * own data. Renders nothing when `banners` is empty.
 *
 * @example
 * ```tsx
 * const { banners, dismissBanner } = useNotifications();
 * <BannerStack banners={banners} onDismiss={dismissBanner} />
 * ```
 */
export const BannerStack = ({ banners, onDismiss, className, ...props }: BannerStackProps) => {
  if (banners.length === 0) return null;

  return (
    <div className={cn('flex w-full flex-col gap-2', className)} {...props}>
      {banners.map((banner) => (
        <Banner
          key={banner.id}
          tone={banner.tone}
          variant={banner.variant}
          title={banner.title}
          action={banner.action}
          dismissible={banner.dismissible}
          onDismiss={() => onDismiss(banner.id)}
        >
          {banner.message}
        </Banner>
      ))}
    </div>
  );
};
