const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Shape of the absolute date the relative window falls back to.
 *
 * - `numeric` — `08/06/2026` (`DD/MM/YYYY`)
 * - `medium` — `8 Jun, 2026`
 */
export type RelativeTimeDateStyle = 'numeric' | 'medium';

/**
 * The absolute fallback, from local date parts. The month abbreviation pins
 * `en-GB` rather than following the runtime locale, so the string's *shape*
 * never varies with the runtime's locale settings — the same reason the
 * numeric form is hand-built (day-first `DD/MM/YYYY`, matching the pinned
 * `en-GB` month names) instead of delegated to `toLocaleDateString`.
 *
 * The date *parts* still come from the runtime's local timezone; see the
 * caveat on {@link formatRelativeTime}.
 */
const formatAbsoluteDate = (target: number, dateStyle: RelativeTimeDateStyle): string => {
  const date = new Date(target);
  if (dateStyle === 'medium') {
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    return `${date.getDate()} ${month}, ${date.getFullYear()}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

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
 * | `diff >= 48 h` | the absolute date, in the requested `dateStyle`    |
 *
 * The absolute fallback's *shape* is locale-stable (month names pin `en-GB`,
 * the numeric form is hand-built `DD/MM/YYYY`), but its date parts are read in
 * the runtime's local timezone — a server and a browser in different timezones
 * can disagree near midnight. Callers wanting cross-timezone determinism
 * should pass a server-computed `now` and render the string on the server (or
 * pin the process timezone).
 *
 * Unparseable input (e.g. `formatRelativeTime('not a date')`) returns an empty
 * string rather than a `NaN/NaN/NaN` artefact — callers render nothing instead
 * of garbage.
 *
 * @param value - The instant to describe, as a `Date`, ISO/parseable string, or epoch ms.
 * @param now - Reference instant the diff is measured against. Defaults to the current time.
 * @param options - `dateStyle` picks the absolute fallback's shape; defaults to `numeric`.
 * @returns The relative-time label, or `''` when `value` cannot be parsed.
 *
 * @example
 * ```ts
 * formatRelativeTime(Date.now() - 5 * 60_000); // "5 mins ago"
 * formatRelativeTime('2026-06-08T09:30:00Z', new Date('2026-06-20T09:30:00Z')); // "08/06/2026"
 * formatRelativeTime('2026-06-08T09:30:00Z', new Date('2026-06-20T09:30:00Z'), {
 *   dateStyle: 'medium',
 * }); // "8 Jun, 2026"
 * ```
 */
export function formatRelativeTime(
  value: Date | string | number,
  now: Date = new Date(),
  { dateStyle = 'numeric' }: { dateStyle?: RelativeTimeDateStyle } = {},
): string {
  const target = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(target)) {
    return '';
  }
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

  return formatAbsoluteDate(target, dateStyle);
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
 * | `diff >= 7 d`  | `DD/MM/YYYY` (zero-padded, local date components)  |
 *
 * Shares {@link formatRelativeTime}'s caveats: the absolute fallback reads
 * local-timezone date parts, and unparseable input returns an empty string.
 *
 * @param value - The instant to describe, as a `Date`, ISO/parseable string, or epoch ms.
 * @param now - Reference instant the diff is measured against. Defaults to the current time.
 * @returns The compact relative-time label, or `''` when `value` cannot be parsed.
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
  if (Number.isNaN(target)) {
    return '';
  }
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

  return formatAbsoluteDate(target, 'numeric');
}
