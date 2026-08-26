import { describe, expect, it } from 'vitest';

import {
  clampMetric,
  convertMetric,
  formatMetric,
  metricPresets,
  parseMetric,
  resolveUnitConfig,
  type MetricUnit,
} from './metric-input.lib';

const kg = metricPresets.weight.units.find((u) => u.value === 'kg')!;
const lb = metricPresets.weight.units.find((u) => u.value === 'lb')!;
const g = metricPresets.weight.units.find((u) => u.value === 'g')!;
const m = metricPresets.length.units.find((u) => u.value === 'm')!;
const ft = metricPresets.length.units.find((u) => u.value === 'ft')!;
const l = metricPresets.volume.units.find((u) => u.value === 'l')!;
const gal = metricPresets.volume.units.find((u) => u.value === 'gal')!;

describe('convertMetric', () => {
  it('returns the same value when converting a unit to itself', () => {
    expect(convertMetric(10, kg, kg)).toBe(10);
  });

  it('converts kg to lb (1 kg ≈ 2.2046226 lb)', () => {
    expect(convertMetric(1, kg, lb)).toBeCloseTo(2.2046226, 6);
    expect(convertMetric(10, kg, lb)).toBeCloseTo(22.046226, 5);
  });

  it('converts lb back to kg', () => {
    expect(convertMetric(2.2046226, lb, kg)).toBeCloseTo(1, 6);
  });

  it('round-trips through an intermediate unit without drift', () => {
    const there = convertMetric(73.5, kg, lb);
    expect(convertMetric(there, lb, kg)).toBeCloseTo(73.5, 9);
  });

  it('converts metres to feet (1 m ≈ 3.2808399 ft)', () => {
    expect(convertMetric(1, m, ft)).toBeCloseTo(3.2808399, 6);
  });

  it('converts litres to US gallons (1 L ≈ 0.2641721 gal)', () => {
    expect(convertMetric(1, l, gal)).toBeCloseTo(0.2641721, 6);
  });

  it('converts between two non-base units (g to lb)', () => {
    // 453.59237 g == 1 lb
    expect(convertMetric(453.59237, g, lb)).toBeCloseTo(1, 6);
  });
});

describe('formatMetric', () => {
  it('strips trailing zeros', () => {
    expect(formatMetric(22.0, 2)).toBe('22');
    expect(formatMetric(22.5, 2)).toBe('22.5');
  });

  it('rounds to the requested precision', () => {
    expect(formatMetric(22.046, 2)).toBe('22.05');
    expect(formatMetric(22.044, 2)).toBe('22.04');
  });

  it('honours zero precision', () => {
    expect(formatMetric(22.4, 0)).toBe('22');
    expect(formatMetric(22.6, 0)).toBe('23');
  });

  it('defaults to 2 decimals of precision', () => {
    expect(formatMetric(1.23456)).toBe('1.23');
  });

  it('formats zero as "0"', () => {
    expect(formatMetric(0, 2)).toBe('0');
  });

  it('returns an empty string for non-finite input', () => {
    expect(formatMetric(Number.NaN)).toBe('');
    expect(formatMetric(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('parseMetric', () => {
  it('parses a decimal string', () => {
    expect(parseMetric('1.5')).toBe(1.5);
  });

  it('parses an integer string', () => {
    expect(parseMetric('10')).toBe(10);
  });

  it('parses negative numbers', () => {
    expect(parseMetric('-2')).toBe(-2);
  });

  it('parses zero', () => {
    expect(parseMetric('0')).toBe(0);
  });

  it('trims surrounding whitespace', () => {
    expect(parseMetric('  12  ')).toBe(12);
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(parseMetric('')).toBeNull();
    expect(parseMetric('   ')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseMetric('abc')).toBeNull();
    expect(parseMetric('1.2.3')).toBeNull();
    expect(parseMetric('Infinity')).toBeNull();
  });
});

describe('clampMetric', () => {
  it('returns the value when within bounds', () => {
    expect(clampMetric(5, 0, 10)).toBe(5);
  });

  it('clamps to the minimum', () => {
    expect(clampMetric(-1, 0, 10)).toBe(0);
  });

  it('clamps to the maximum', () => {
    expect(clampMetric(11, 0, 10)).toBe(10);
  });

  it('applies only the minimum when max is omitted', () => {
    expect(clampMetric(5, 3)).toBe(5);
    expect(clampMetric(2, 3)).toBe(3);
  });

  it('applies only the maximum when min is omitted', () => {
    expect(clampMetric(50, undefined, 10)).toBe(10);
    expect(clampMetric(5, undefined, 10)).toBe(5);
  });

  it('returns the value unchanged when both bounds are omitted', () => {
    expect(clampMetric(7)).toBe(7);
  });
});

describe('resolveUnitConfig', () => {
  it('resolves the full preset for a dimension', () => {
    const { units, canonicalUnit } = resolveUnitConfig({ dimension: 'weight' });
    expect(canonicalUnit).toBe('kg');
    expect(units).toEqual(metricPresets.weight.units);
  });

  it('resolves a subset of preset units in the given order', () => {
    const { units, canonicalUnit } = resolveUnitConfig({
      dimension: 'weight',
      units: ['kg', 'lb'],
    });
    expect(units.map((u) => u.value)).toEqual(['kg', 'lb']);
    expect(canonicalUnit).toBe('kg');
  });

  it('uses the first listed unit as the canonical default', () => {
    const { canonicalUnit, units } = resolveUnitConfig({
      dimension: 'weight',
      units: ['lb', 'kg'],
    });
    expect(units.map((u) => u.value)).toEqual(['lb', 'kg']);
    expect(canonicalUnit).toBe('lb');
  });

  it('honours an explicit canonicalUnit that is part of the resolved units', () => {
    const { canonicalUnit } = resolveUnitConfig({
      dimension: 'weight',
      units: ['kg', 'lb'],
      canonicalUnit: 'lb',
    });
    expect(canonicalUnit).toBe('lb');
  });

  it('falls back to the first unit when canonicalUnit is not present', () => {
    const { canonicalUnit } = resolveUnitConfig({
      dimension: 'weight',
      canonicalUnit: 'does-not-exist',
    });
    expect(canonicalUnit).toBe('kg');
  });

  it('falls back to the full preset when the subset matches nothing', () => {
    const { units } = resolveUnitConfig({ dimension: 'weight', units: ['nope'] });
    expect(units).toEqual(metricPresets.weight.units);
  });

  it('resolves a fully custom units array', () => {
    const custom: MetricUnit[] = [
      { value: 'box', label: 'boxes', factor: 1 },
      { value: 'pallet', label: 'pallets', factor: 48 },
    ];
    const { units, canonicalUnit } = resolveUnitConfig({ units: custom });
    expect(units).toBe(custom);
    expect(canonicalUnit).toBe('box');
  });

  it('throws when neither a dimension nor a non-empty units array is given', () => {
    expect(() => resolveUnitConfig({})).toThrow(/dimension.*units/i);
    expect(() => resolveUnitConfig({ units: [] })).toThrow();
  });

  it('throws when units are plain strings without a dimension', () => {
    expect(() => resolveUnitConfig({ units: ['kg', 'lb'] })).toThrow(/MetricUnit/i);
  });
});
