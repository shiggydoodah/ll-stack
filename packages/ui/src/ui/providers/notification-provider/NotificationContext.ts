import { createContext, useContext } from 'react';

import type { GlobalBannerData } from '../../components/banner';
import type { Notify } from '../../components/toast';

export interface NotificationContextValue {
  /** Active (not-yet-dismissed) global banners. */
  banners: GlobalBannerData[];
  /** Dismiss a banner by id and persist the dismissal. */
  dismissBanner: (id: string) => void;
  /** Imperative toast API. */
  notify: Notify;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Access the notification context. Throws when used outside a
 * {@link NotificationProvider}.
 */
export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);

  if (context === null) {
    throw new Error('useNotifications must be used within a NotificationProvider.');
  }

  return context;
};
