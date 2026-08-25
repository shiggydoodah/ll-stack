/**
 * Pure conversion + formatting helpers and unit presets for {@link MetricInput}.
 *
 * The model is a simple linear "factor to base unit" system: every unit declares
 * a `factor` that converts a value in that unit to its dimension's base unit
 * (kg for weight, m for length, L for volume). Converting between any two units
 * is therefore `(value * from.factor) / to.factor`.
 *
 * This module is intentionally framework-agnostic and free of app/domain
 * knowledge — it is safe to import from anywhere (no `'use client'`).
 */

/** Physical quantity a {@link MetricInput} measures. */
export type MetricDimension = 'weight' | 'length' | 'volume';

/** A single selectable unit and how it maps onto its dimension's base unit. */
export interface MetricUnit {
  /** Stable key — also used as the `<select>`/toggle option value. */
  value: string;
  /** Visible label shown in the unit switcher. */
  label: string;
  /** Multiplier that converts a value in this unit to the dimension's base unit. */
  factor: number;
  /**
   * Decimal places used when formatting a value in this unit for display.
   *
   * @defaultValue `2`
   */
  precision?: number;
}

/** Default display precision when a {@link MetricUnit} omits its own. */
export const DEFAULT_METRIC_PRECISION = 2;

/**
 * Convert `value` expressed in unit `from` into the equivalent value in unit
 * `to`. Linear and lossless up to floating-point precision.
 */
export const convertMetric = (value: number, from: MetricUnit, to: MetricUnit): number =>
  (value * from.factor) / to.factor;

/**
 * Format a numeric value for display: round to `precision` decimals and drop any
 * trailing zeros (so `22.0` renders as `"22"`, `22.046` as `"22.05"`). Non-finite
 * input (`NaN`, `Infinity`) yields an empty string.
 */
export const formatMetric = (
  value: number,
  precision: number = DEFAULT_METRIC_PRECISION,
): string => {
  if (!Number.isFinite(value)) return '';
  // toFixed rounds to the requested precision; Number(...) then strips trailing zeros.
  return String(Number(value.toFixed(Math.max(0, precision))));
};

/**
 * Parse user input into a number. Empty/whitespace-only input is treated as
 * "no value" (`null`); anything that is not a finite number is also `null`.
 */
export const parseMetric = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Clamp `value` to the optional `[min, max]` bounds (either may be omitted). */
export const clampMetric = (value: number, min?: number, max?: number): number => {
  let result = value;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
};

/**
 * Built-in unit presets keyed by dimension. The first unit in each list is the
 * canonical/base unit and the default for storing a form value. Factors are the
 * exact SI/customary definitions (e.g. `1 lb = 0.45359237 kg`).
 */
export const metricPresets: Record<
  MetricDimension,
  { canonicalUnit: string; units: MetricUnit[] }
> = {
  weight: {
    canonicalUnit: 'kg',
    units: [
      { value: 'kg', label: 'kg', factor: 1 },
      { value: 'g', label: 'g', factor: 0.001, precision: 0 },
      { value: 'mg', label: 'mg', factor: 0.000001, precision: 0 },
      { value: 'lb', label: 'lb', factor: 0.45359237 },
      { value: 'oz', label: 'oz', factor: 0.028349523125 },
      { value: 'st', label: 'st', factor: 6.35029318 },
    ],
  },
  length: {
    canonicalUnit: 'm',
    units: [
      { value: 'm', label: 'm', factor: 1 },
      { value: 'cm', label: 'cm', factor: 0.01, precision: 1 },
      { value: 'mm', label: 'mm', factor: 0.001, precision: 0 },
      { value: 'km', label: 'km', factor: 1000, precision: 3 },
      { value: 'in', label: 'in', factor: 0.0254 },
      { value: 'ft', label: 'ft', factor: 0.3048 },
      { value: 'yd', label: 'yd', factor: 0.9144 },
      { value: 'mi', label: 'mi', factor: 1609.344, precision: 3 },
    ],
  },
  volume: {
    canonicalUnit: 'l',
    units: [
      { value: 'l', label: 'L', factor: 1 },
      { value: 'ml', label: 'mL', factor: 0.001, precision: 0 },
      { value: 'gal', label: 'gal', factor: 3.785411784 },
      { value: 'qt', label: 'qt', factor: 0.946352946 },
      { value: 'pt', label: 'pt', factor: 0.473176473 },
      { value: 'floz', label: 'fl oz', factor: 0.0295735295625, precision: 1 },
    ],
  },
};

/** Input accepted by {@link resolveUnitConfig}. Mirrors the relevant MetricInput props. */
export interface ResolveUnitConfigInput {
  /** Selects a built-in preset; provides default units + canonical unit. */
  dimension?: MetricDimension;
  /**
   * When `dimension` is set, a subset of preset unit keys (`string[]`); otherwise
   * a fully custom `MetricUnit[]`.
   */
  units?: MetricUnit[] | string[];
  /** Overrides which resolved unit the canonical value is stored in. */
  canonicalUnit?: string;
}

/** Concrete unit list + canonical unit resolved from the props. */
export interface ResolvedUnitConfig {
  units: MetricUnit[];
  canonicalUnit: string;
}

/**
 * Resolve the (`dimension` | `units`) + `canonicalUnit` props into a concrete
 * `{ units, canonicalUnit }`. The canonical unit is guaranteed to be present in
 * the returned `units` (so conversions always have its factor available):
 * an explicit `canonicalUnit` is honoured only when it resolves to one of the
 * units, otherwise the first unit is used.
 *
 * @throws if no `dimension` is given and `units` is empty/undefined.
 */
export const resolveUnitConfig = ({
  dimension,
  units,
  canonicalUnit,
}: ResolveUnitConfigInput): ResolvedUnitConfig => {
  let resolvedUnits: MetricUnit[];

  if (dimension) {
    const preset = metricPresets[dimension];
    if (units && units.length > 0) {
      // With a dimension, `units` is a subset of preset keys.
      const keys = units as string[];
      const picked = keys
        .map((key) => preset.units.find((unit) => unit.value === key))
        .filter((unit): unit is MetricUnit => unit !== undefined);
      resolvedUnits = picked.length > 0 ? picked : preset.units;
    } else {
      resolvedUnits = preset.units;
    }
  } else {
    const custom = (units ?? []) as MetricUnit[];
    if (custom.length === 0) {
      throw new Error('MetricInput: provide a `dimension` or a non-empty `units` array.');
    }
    if (typeof custom[0] !== 'object') {
      throw new Error('MetricInput: `units` must be a MetricUnit[] when no `dimension` is given.');
    }
    resolvedUnits = custom;
  }

  const canonical =
    canonicalUnit && resolvedUnits.some((unit) => unit.value === canonicalUnit)
      ? canonicalUnit
      : resolvedUnits[0]!.value;

  return { units: resolvedUnits, canonicalUnit: canonical };
};
