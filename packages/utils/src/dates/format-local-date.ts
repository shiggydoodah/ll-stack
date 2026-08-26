/**
 * Locale-aware wall-clock display helpers for absolute instants (event dates,
 * schedules). Unlike `format-relative-time` (stable across locales by design),
 * these deliberately follow the runtime locale + timezone so a viewer sees the
 * instant as their own wall clock. `locale` is injectable so tests stay
 * deterministic; callers omit it to use the runtime default.
 *
 * Because output depends on the runtime timezone, client components rendering
 * these need `suppressHydrationWarning` on the containing element — the
 * server-rendered string may differ from the viewer-local one.
 */

const toDate = (value: Date | string | number): Date =>
  value instanceof Date ? value : new Date(value);

/**
 * Uppercased short month for a calendar-tile header.
 *
 * @example formatMonthAbbrev('2026-05-03T18:00:00Z') // "MAY"
 */
export function formatMonthAbbrev(value: Date | string | number, locale?: string): string {
  return toDate(value).toLocaleDateString(locale, { month: 'short' }).toUpperCase();
}

/**
 * Zero-padded day of month for a calendar-tile body.
 *
 * @example formatDayOfMonth('2026-05-03T18:00:00Z') // "03"
 */
export function formatDayOfMonth(value: Date | string | number): string {
  return String(toDate(value).getDate()).padStart(2, '0');
}

/**
 * Compact weekday date — "Sat 3 May" — with the year appended only when it
 * differs from `now`'s ("Sat 3 May 2027").
 */
export function formatWeekdayDateShort(
  value: Date | string | number,
  now: Date = new Date(),
  locale?: string,
): string {
  const date = toDate(value);
  return date
    .toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    })
    .replace(',', '');
}

/**
 * Full weekday date — "Saturday 3 May" — with the same year rule as
 * {@link formatWeekdayDateShort}.
 */
export function formatWeekdayDateLong(
  value: Date | string | number,
  now: Date = new Date(),
  locale?: string,
): string {
  const date = toDate(value);
  return date
    .toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    })
    .replace(',', '');
}

/**
 * Time of day in the locale's clock style — "7:00 PM" (en-US) / "19:00" (en-GB).
 */
export function formatClockTime(value: Date | string | number, locale?: string): string {
  return toDate(value).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}
