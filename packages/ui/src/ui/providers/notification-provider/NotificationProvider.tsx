'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import type { GlobalBannerData } from '../../components/banner';
import { Toaster, notify } from '../../components/toast';
import type { ToasterProps } from '../../components/toast';
import { NotificationContext } from './NotificationContext';
import type { NotificationContextValue } from './NotificationContext';
import { createLocalStorageAdapter } from './storage';
import type { NotificationStorageAdapter } from './storage';

const EMPTY_DISMISSED: ReadonlySet<string> = new Set();

interface DismissalStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ReadonlySet<string>;
  getServerSnapshot: () => ReadonlySet<string>;
  dismiss: (id: string) => void;
}

/**
 * Wraps a storage adapter as an external store so dismissed ids can be read with
 * `useSyncExternalStore`. The server snapshot is always empty, so SSR and the
 * hydration render match; the client then reflects persisted dismissals.
 */
const createDismissalStore = (adapter: NotificationStorageAdapter): DismissalStore => {
  const listeners = new Set<() => void>();
  let snapshot: ReadonlySet<string> | null = null;

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => {
      // Cache so repeated reads return a stable reference between dismissals.
      snapshot ??= new Set(adapter.getDismissed());
      return snapshot;
    },
    getServerSnapshot: () => EMPTY_DISMISSED,
    dismiss: (id) => {
      adapter.dismiss(id);
      snapshot = new Set(adapter.getDismissed());
      listeners.forEach((listener) => listener());
    },
  };
};

/**
 * Props for {@link NotificationProvider}.
 */
export interface NotificationProviderProps {
  children: ReactNode;

  /**
   * Global banners to surface, supplied by the host app (and, later, the
   * admin-set backend feed). Dismissed banners are filtered out automatically.
   */
  banners?: GlobalBannerData[];

  /**
   * Dismissal persistence adapter.
   *
   * @defaultValue a `localStorage`-backed adapter
   */
  storage?: NotificationStorageAdapter;

  /** Props forwarded to the mounted {@link Toaster}. */
  toasterProps?: ToasterProps;
}

/**
 * Wires up the notification system: mounts a single {@link Toaster} and exposes
 * the active banner stack plus the imperative {@link notify} API via context.
 *
 * Banner dismissals are remembered by id through the `storage` adapter
 * (`localStorage` by default), read via `useSyncExternalStore` so server and
 * client render the same first paint without a hydration mismatch.
 *
 * Mount this once at the app root. A single provider handles concurrent
 * notifications from any source: toasts go through Sonner's global queue, so
 * independent events (e.g. a new DM arriving while a form submit fails) stack
 * and expire on their own timers without colliding. Do not nest a second
 * provider per form/feature — that would mount a competing `Toaster`.
 *
 * Pair with `BannerStack` (or read `useNotifications().banners`) to render the
 * banners wherever the layout needs them.
 */
export const NotificationProvider = ({
  children,
  banners = [],
  storage,
  toasterProps,
}: NotificationProviderProps) => {
  // Build the store once so an inline `storage` prop stays stable.
  const [store] = useState(() => createDismissalStore(storage ?? createLocalStorageAdapter()));

  const dismissedIds = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const dismissBanner = useCallback((id: string) => store.dismiss(id), [store]);

  const activeBanners = useMemo(
    () => banners.filter((banner) => banner.dismissible === false || !dismissedIds.has(banner.id)),
    [banners, dismissedIds],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({ banners: activeBanners, dismissBanner, notify }),
    [activeBanners, dismissBanner],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toaster {...toasterProps} />
    </NotificationContext.Provider>
  );
};
