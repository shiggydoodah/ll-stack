import { describe, expect, it } from 'vitest';

import { formatRelativeTime, formatRelativeTimeCompact } from './format-relative-time';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Fixed reference instant so every case is deterministic (no wall clock).
const now = new Date(2026, 5, 10, 12, 0, 0);
const ago = (ms: number): Date => new Date(now.getTime() - ms);

describe('formatRelativeTime', () => {
  it('clamps anything under 4 minutes to "just now"', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(ago(3 * MINUTE_MS + 59_000), now)).toBe('just now'); // 3m59s
  });

  it('clamps future / negative diffs to "just now"', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 10 * MINUTE_MS), now)).toBe('just now');
  });

  it('reports whole minutes between 4 and 59 minutes', () => {
    expect(formatRelativeTime(ago(4 * MINUTE_MS), now)).toBe('4 mins ago');
    expect(formatRelativeTime(ago(59 * MINUTE_MS), now)).toBe('59 mins ago');
  });

  it('switches to hours at the 60 minute boundary (singular at 1)', () => {
    expect(formatRelativeTime(ago(60 * MINUTE_MS), now)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(23 * HOUR_MS), now)).toBe('23 hours ago');
  });

  it('reports "yesterday" between 24 and 47 hours', () => {
    expect(formatRelativeTime(ago(24 * HOUR_MS), now)).toBe('yesterday');
    expect(formatRelativeTime(ago(47 * HOUR_MS), now)).toBe('yesterday');
  });

  it('falls back to an absolute DD/MM/YYYY date at 48 hours and beyond', () => {
    // 48h before 10 Jun 2026 12:00 local => 8 Jun 2026.
    expect(formatRelativeTime(ago(48 * HOUR_MS), now)).toBe('08/06/2026');
  });

  it('zero-pads single-digit months and days', () => {
    const value = new Date(2026, 5, 8, 9, 30, 0); // 8 Jun 2026
    const reference = new Date(2026, 5, 20, 9, 30, 0); // 12 days later
    expect(formatRelativeTime(value, reference)).toBe('08/06/2026');
  });

  it('leaves two-digit months and days unpadded-but-correct', () => {
    const value = new Date(2026, 10, 25, 9, 30, 0); // 25 Nov 2026
    const reference = new Date(2026, 11, 10, 9, 30, 0);
    expect(formatRelativeTime(value, reference)).toBe('25/11/2026');
  });

  it('accepts string and number inputs as well as Date', () => {
    const oneHourAgo = ago(HOUR_MS);
    expect(formatRelativeTime(oneHourAgo.toISOString(), now)).toBe('1 hour ago');
    expect(formatRelativeTime(oneHourAgo.getTime(), now)).toBe('1 hour ago');
  });

  it('returns an empty string for unparseable input instead of NaN garbage', () => {
    expect(formatRelativeTime('not a date', now)).toBe('');
    expect(formatRelativeTime(Number.NaN, now)).toBe('');
    expect(formatRelativeTime(new Date('not a date'), now)).toBe('');
  });

  describe('dateStyle: "medium"', () => {
    const medium = { dateStyle: 'medium' } as const;

    it('writes the absolute fallback as "{d} {Mon}, {YYYY}"', () => {
      expect(formatRelativeTime(ago(48 * HOUR_MS), now, medium)).toBe('8 Jun, 2026');
    });

    it('leaves the day unpadded and abbreviates the month', () => {
      const reference = new Date(2026, 11, 10, 9, 30, 0);
      expect(formatRelativeTime(new Date(2026, 10, 5, 9, 30, 0), reference, medium)).toBe(
        '5 Nov, 2026',
      );
      expect(formatRelativeTime(new Date(2026, 10, 25, 9, 30, 0), reference, medium)).toBe(
        '25 Nov, 2026',
      );
    });

    it('leaves everything inside the relative window unchanged', () => {
      expect(formatRelativeTime(now, now, medium)).toBe('just now');
      expect(formatRelativeTime(ago(30 * MINUTE_MS), now, medium)).toBe('30 mins ago');
      expect(formatRelativeTime(ago(HOUR_MS), now, medium)).toBe('1 hour ago');
      expect(formatRelativeTime(ago(47 * HOUR_MS), now, medium)).toBe('yesterday');
    });
  });
});

describe('formatRelativeTimeCompact', () => {
  it('clamps anything under 4 minutes to "just now"', () => {
    expect(formatRelativeTimeCompact(now, now)).toBe('just now');
    expect(formatRelativeTimeCompact(ago(3 * MINUTE_MS + 59_000), now)).toBe('just now'); // 3m59s
  });

  it('clamps future / negative diffs to "just now"', () => {
    expect(formatRelativeTimeCompact(new Date(now.getTime() + 10 * MINUTE_MS), now)).toBe(
      'just now',
    );
  });

  it('reports whole minutes as "{n}m" between 4 and 59 minutes', () => {
    expect(formatRelativeTimeCompact(ago(4 * MINUTE_MS), now)).toBe('4m');
    expect(formatRelativeTimeCompact(ago(59 * MINUTE_MS), now)).toBe('59m');
  });

  it('switches to "{n}h" at the 60 minute boundary', () => {
    expect(formatRelativeTimeCompact(ago(60 * MINUTE_MS), now)).toBe('1h');
    expect(formatRelativeTimeCompact(ago(23 * HOUR_MS), now)).toBe('23h');
  });

  it('switches to "{n}d" from 24 hours through 6 days', () => {
    expect(formatRelativeTimeCompact(ago(24 * HOUR_MS), now)).toBe('1d');
    expect(formatRelativeTimeCompact(ago(6 * DAY_MS), now)).toBe('6d');
  });

  it('falls back to an absolute DD/MM/YYYY date at 7 days and beyond', () => {
    // 7d before 10 Jun 2026 12:00 local => 3 Jun 2026.
    expect(formatRelativeTimeCompact(ago(7 * DAY_MS), now)).toBe('03/06/2026');
  });

  it('accepts string and number inputs as well as Date', () => {
    const oneHourAgo = ago(HOUR_MS);
    expect(formatRelativeTimeCompact(oneHourAgo.toISOString(), now)).toBe('1h');
    expect(formatRelativeTimeCompact(oneHourAgo.getTime(), now)).toBe('1h');
  });

  it('returns an empty string for unparseable input instead of NaN garbage', () => {
    expect(formatRelativeTimeCompact('not a date', now)).toBe('');
    expect(formatRelativeTimeCompact(Number.NaN, now)).toBe('');
    expect(formatRelativeTimeCompact(new Date('not a date'), now)).toBe('');
  });
});
