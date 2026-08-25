const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Formats a timestamp as a short, human-readable relative string.
 *
 * Pure and dependency-free: `now` is injectable so callers (and tests) stay
 * deterministic without fake timers or reaching for the wall clock. Future or
 * negative diffs clamp to `"just now"`.
 *
 * The diff (`now - value`) maps as follows:
 *
 * | Condition      | Output                                            |
 * | -------------- | ------------------------------------------------- |
 * | `diff < 4 min` | `just now`                                         |
 * | `diff < 60 min`| `{floor(min)} mins ago`                           |
 * | `diff < 24 h`  | `{floor(h)} hour ago` / `{floor(h)} hours ago`    |
 * | `diff < 48 h`  | `yesterday`                                        |
 * | `diff >= 48 h` | `MM/DD/YYYY` (zero-padded, local date components)  |
 *
 * The absolute date is built from local date parts rather than
 * `toLocaleDateString` so the `MM/DD/YYYY` shape and zero-padding are stable
 * across locales.
 *
 * @param value - The instant to describe, as a `Date`, ISO/parseable string, or epoch ms.
 * @param now - Reference instant the diff is measured against. Defaults to the current time.
 * @returns The relative-time label.
 *
 * @example
 * ```ts
 * formatRelativeTime(Date.now() - 5 * 60_000); // "5 mins ago"
 * formatRelativeTime('2026-06-08T09:30:00Z', new Date('2026-06-20T09:30:00Z')); // "06/08/2026"
 * ```
 */
export function formatRelativeTime(value: Date | string | number, now: Date = new Date()): string {
  const target = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const diff = now.getTime() - target;

  if (diff < 4 * MINUTE_MS) {
    return 'just now';
  }

  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)} mins ago`;
  }

  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  if (diff < 2 * DAY_MS) {
    return 'yesterday';
  }

  const date = new Date(target);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
}

/**
 * Compact variant of {@link formatRelativeTime} for dense surfaces (feed posts and
 * comment timestamps): drops the `" ago"` suffix and shortens the unit, while
 * keeping the friendly `"just now"`. Same pure, injectable-`now` contract; future
 * or negative diffs clamp to `"just now"`.
 *
 * The diff (`now - value`) maps as follows:
 *
 * | Condition      | Output                                            |
 * | -------------- | ------------------------------------------------- |
 * | `diff < 4 min` | `just now`                                         |
 * | `diff < 60 min`| `{floor(min)}m`  (e.g. `5m`)                       |
 * | `diff < 24 h`  | `{floor(h)}h`    (e.g. `16h`)                      |
 * | `diff < 7 d`   | `{floor(d)}d`    (e.g. `3d`)                       |
 * | `diff >= 7 d`  | `MM/DD/YYYY` (zero-padded, local date components)  |
 *
 * @param value - The instant to describe, as a `Date`, ISO/parseable string, or epoch ms.
 * @param now - Reference instant the diff is measured against. Defaults to the current time.
 * @returns The compact relative-time label.
 *
 * @example
 * ```ts
 * formatRelativeTimeCompact(Date.now() - 5 * 60_000); // "5m"
 * formatRelativeTimeCompact(Date.now() - 16 * 60 * 60_000); // "16h"
 * ```
 */
export function formatRelativeTimeCompact(
  value: Date | string | number,
  now: Date = new Date(),
): string {
  const target = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const diff = now.getTime() - target;

  if (diff < 4 * MINUTE_MS) {
    return 'just now';
  }

  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)}m`;
  }

  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)}h`;
  }

  if (diff < 7 * DAY_MS) {
    return `${Math.floor(diff / DAY_MS)}d`;
  }

  const date = new Date(target);
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
}
