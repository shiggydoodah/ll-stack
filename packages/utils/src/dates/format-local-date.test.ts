import { describe, expect, it } from 'vitest';

import {
  formatClockTime,
  formatDayOfMonth,
  formatMonthAbbrev,
  formatWeekdayDateLong,
  formatWeekdayDateShort,
} from './format-local-date';

// These formatters are timezone-dependent BY DESIGN (viewer wall clock), so
// inputs use local-time constructors — the local wall clock is then identical
// in every timezone and the expected strings stay deterministic. Locale is
// always passed explicitly ('en-GB' unless the case targets another locale).
const saturdayEvening = new Date(2026, 4, 2, 19, 0, 0); // Sat 2 May 2026, 19:00 local
const now = new Date(2026, 5, 10, 12, 0, 0); // 10 Jun 2026 — same year as saturdayEvening

describe('formatMonthAbbrev', () => {
  it('returns the uppercased short month', () => {
    expect(formatMonthAbbrev(saturdayEvening, 'en-GB')).toBe('MAY');
    expect(formatMonthAbbrev(new Date(2026, 0, 15), 'en-GB')).toBe('JAN');
  });

  it('accepts string and number inputs as well as Date', () => {
    expect(formatMonthAbbrev(saturdayEvening.toISOString(), 'en-GB')).toBe('MAY');
    expect(formatMonthAbbrev(saturdayEvening.getTime(), 'en-GB')).toBe('MAY');
  });
});

describe('formatDayOfMonth', () => {
  it('zero-pads single-digit days', () => {
    expect(formatDayOfMonth(saturdayEvening)).toBe('02');
  });

  it('leaves two-digit days unpadded-but-correct', () => {
    expect(formatDayOfMonth(new Date(2026, 4, 15, 12, 0, 0))).toBe('15');
  });
});

describe('formatWeekdayDateShort', () => {
  it('omits the year when the value shares a year with now', () => {
    expect(formatWeekdayDateShort(saturdayEvening, now, 'en-GB')).toBe('Sat 2 May');
  });

  it('appends the year when it differs from now (and strips the comma)', () => {
    const nextYear = new Date(2027, 4, 1, 12, 0, 0); // Sat 1 May 2027
    expect(formatWeekdayDateShort(nextYear, now, 'en-GB')).toBe('Sat 1 May 2027');
  });

  it('strips the locale comma from comma-styled locales', () => {
    expect(formatWeekdayDateShort(saturdayEvening, now, 'en-US')).toBe('Sat May 2');
  });

  it('only strips the FIRST comma — an en-US year date keeps its second one', () => {
    // Documents current behaviour: .replace(',', '') is single-shot, so the
    // comma before the year survives in comma-heavy locales.
    const nextYear = new Date(2027, 4, 1, 12, 0, 0);
    expect(formatWeekdayDateShort(nextYear, now, 'en-US')).toBe('Sat May 1, 2027');
  });

  it('accepts string and number inputs as well as Date', () => {
    expect(formatWeekdayDateShort(saturdayEvening.toISOString(), now, 'en-GB')).toBe('Sat 2 May');
    expect(formatWeekdayDateShort(saturdayEvening.getTime(), now, 'en-GB')).toBe('Sat 2 May');
  });
});

describe('formatWeekdayDateLong', () => {
  it('omits the year when the value shares a year with now', () => {
    expect(formatWeekdayDateLong(saturdayEvening, now, 'en-GB')).toBe('Saturday 2 May');
  });

  it('appends the year when it differs from now (and strips the comma)', () => {
    const nextYear = new Date(2027, 4, 1, 12, 0, 0); // Sat 1 May 2027
    expect(formatWeekdayDateLong(nextYear, now, 'en-GB')).toBe('Saturday 1 May 2027');
  });
});

describe('formatClockTime', () => {
  it('uses the 24-hour clock for en-GB', () => {
    expect(formatClockTime(saturdayEvening, 'en-GB')).toBe('19:00');
  });

  it('uses the 12-hour clock for en-US', () => {
    expect(formatClockTime(saturdayEvening, 'en-US')).toBe('7:00 PM');
  });

  it('always renders two-digit minutes', () => {
    expect(formatClockTime(new Date(2026, 4, 2, 19, 5, 0), 'en-GB')).toBe('19:05');
  });

  it('accepts string and number inputs as well as Date', () => {
    expect(formatClockTime(saturdayEvening.toISOString(), 'en-GB')).toBe('19:00');
    expect(formatClockTime(saturdayEvening.getTime(), 'en-GB')).toBe('19:00');
  });
});
