/**
 * Persists which global banners a user has dismissed, keyed by banner id.
 *
 * The UI library stays framework-agnostic: it ships a `localStorage` default and
 * an in-memory adapter, but the host app can supply its own (e.g. a cookie or
 * server-backed adapter) by implementing this interface.
 */
export interface NotificationStorageAdapter {
  /** All currently dismissed banner ids. */
  getDismissed(): string[];
  /** Whether a banner id has been dismissed. */
  isDismissed(id: string): boolean;
  /** Mark a banner id as dismissed (persisted). */
  dismiss(id: string): void;
}

/** Default `localStorage` key used by {@link createLocalStorageAdapter}. */
export const DEFAULT_DISMISSED_BANNERS_KEY = 'll-ui:dismissed-banners';

/**
 * In-memory adapter — dismissals last for the lifetime of the adapter only.
 * Useful for tests, SSR, or callers that wire their own persistence on top.
 */
export const createMemoryAdapter = (initial: string[] = []): NotificationStorageAdapter => {
  const dismissed = new Set(initial);

  return {
    getDismissed: () => Array.from(dismissed),
    isDismissed: (id) => dismissed.has(id),
    dismiss: (id) => {
      dismissed.add(id);
    },
  };
};

/**
 * `localStorage`-backed adapter. SSR-safe: when `window` is unavailable every
 * read returns empty and writes are skipped, so banners simply show until the
 * client hydrates.
 */
export const createLocalStorageAdapter = (
  key: string = DEFAULT_DISMISSED_BANNERS_KEY,
): NotificationStorageAdapter => {
  const read = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return new Set();
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((value): value is string => typeof value === 'string'));
    } catch {
      return new Set();
    }
  };

  const write = (dismissed: Set<string>): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(Array.from(dismissed)));
    } catch {
      // Storage may be full or disabled (private mode) — dismissal is best-effort.
    }
  };

  return {
    getDismissed: () => Array.from(read()),
    isDismissed: (id) => read().has(id),
    dismiss: (id) => {
      const dismissed = read();
      dismissed.add(id);
      write(dismissed);
    },
  };
};
