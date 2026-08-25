// Low-entropy browser/device telemetry captured once per page load to aid
// debugging. Deliberately excludes anything that identifies a person: no IP, no
// geolocation, no account data. URLs are reduced to pathname only so query
// tokens (reset-password / verify-email links) never reach the logs.
//
// To limit device-fingerprinting surface, high-entropy signals are dropped or
// coarsened: deviceMemory and hardwareConcurrency are omitted, and screen size /
// devicePixelRatio are bucketed rather than reported exactly.

interface NavigatorConnectionLike {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

const matchMediaSafe = (query: string): boolean | undefined => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia(query).matches;
};

// Coarse width bucket — enough to distinguish phone/tablet/desktop layouts
// without reporting an exact, fingerprintable pixel dimension.
const widthBucket = (width: number | undefined): string | undefined => {
  if (typeof width !== 'number' || !Number.isFinite(width)) return undefined;
  if (width < 640) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1440) return 'lg';
  return 'xl';
};

// Quantised pixel ratio (1x / 2x / 3x+) rather than the exact float.
const pixelRatioBucket = (ratio: number | undefined): string | undefined => {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return undefined;
  if (ratio >= 3) return '3x';
  if (ratio >= 2) return '2x';
  return '1x';
};

const resolveTimezone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

// Pathname only — strips query string and fragment, which can carry secrets.
export const safePathname = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.location.pathname;
};

export const captureUserEnv = (): Record<string, unknown> => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};

  const connection = (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection;
  const prefersDark = matchMediaSafe('(prefers-color-scheme: dark)');

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : undefined,
    timezone: resolveTimezone(),
    viewport: widthBucket(window.innerWidth),
    screen: widthBucket(window.screen?.width),
    devicePixelRatio: pixelRatioBucket(window.devicePixelRatio),
    connection: connection
      ? {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          saveData: connection.saveData,
        }
      : undefined,
    // Preserve the unknown signal (undefined) when matchMedia is unavailable,
    // matching prefersReducedMotion below.
    prefersColorScheme: prefersDark === undefined ? undefined : prefersDark ? 'dark' : 'light',
    prefersReducedMotion: matchMediaSafe('(prefers-reduced-motion: reduce)'),
    appName: process.env.NEXT_PUBLIC_APP_NAME,
    path: safePathname(),
  };
};
