'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type Ref,
} from 'react';

import { cn } from '../../../lib/cn';
import { Input, Select, ToggleSwitch } from '../../primitives';
import {
  clampMetric,
  convertMetric,
  formatMetric,
  parseMetric,
  resolveUnitConfig,
  type MetricDimension,
  type MetricUnit,
} from './metric-input.lib';

/** How the unit switcher renders. */
export type MetricInputSelector = 'auto' | 'toggle' | 'select';

type NativeInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
>;

/**
 * Props for {@link MetricInput}.
 *
 * Provide either a `dimension` (optionally narrowed by a `units` subset of that
 * preset's unit keys) or a fully custom `units` array of {@link MetricUnit}. The
 * `dimension`/`units` relationship is validated at runtime by `resolveUnitConfig`.
 */
export interface MetricInputProps extends NativeInputProps {
  /** Canonical value, expressed in `canonicalUnit`. `null` means empty. */
  value: number | null;
  /** Called with the next canonical value (in `canonicalUnit`) when the user edits. */
  onChange?: (value: number | null) => void;
  /** Built-in unit preset; provides default units and canonical unit. */
  dimension?: MetricDimension;
  /**
   * Units offered in the switcher. With a `dimension`, a subset of that preset's
   * unit keys (`string[]`); otherwise a custom `MetricUnit[]`. Defaults to the
   * full preset for `dimension`.
   */
  units?: MetricUnit[] | string[];
  /**
   * Which resolved unit the canonical `value`/`onChange` are expressed in.
   *
   * @defaultValue the first resolved unit
   */
  canonicalUnit?: string;
  /**
   * Initial display unit when the display unit is uncontrolled.
   *
   * @defaultValue `canonicalUnit`
   */
  defaultDisplayUnit?: string;
  /** Controlled display unit. Pair with {@link MetricInputProps.onDisplayUnitChange}. */
  displayUnit?: string;
  /** Called when the user switches the display unit. */
  onDisplayUnitChange?: (unit: string) => void;
  /**
   * How the unit switcher renders. `'auto'` uses a segmented toggle for up to
   * three units and a dropdown for more.
   *
   * @defaultValue `'auto'`
   */
  selector?: MetricInputSelector;
  /** Minimum allowed canonical value (the emitted value is clamped to it). */
  min?: number;
  /** Maximum allowed canonical value (the emitted value is clamped to it). */
  max?: number;
  /** Marks the field invalid — styles the input and sets `aria-invalid`. */
  invalid?: boolean;
  /**
   * Accessible label for the unit switcher.
   *
   * @defaultValue `'Unit'`
   */
  unitLabel?: string;
  ref?: Ref<HTMLInputElement>;
}

const SELECTOR_TOGGLE_MAX_UNITS = 3;

/**
 * A controlled number input paired with a switchable unit. The form value
 * (`value`/`onChange`) is always kept in a single **canonical** unit, while the
 * user can view and edit it in any of the offered display units — switching
 * units only re-formats what is shown, it never changes the stored value.
 *
 * Conversions, formatting and the `weight`/`length`/`volume` presets live in
 * `metric-input.lib.ts`. Compose app-specific fields (or a form binding) on top
 * of this primitive — it holds no domain or form-library knowledge.
 *
 * @example
 * ```tsx
 * // Form value stays in kg; the user can toggle to lb.
 * const [weightKg, setWeightKg] = useState<number | null>(10);
 * <MetricInput
 *   aria-label="Weight"
 *   dimension="weight"
 *   units={['kg', 'lb']}
 *   value={weightKg}
 *   onChange={setWeightKg}
 * />
 * ```
 */
export const MetricInput = ({
  value,
  onChange,
  dimension,
  units: unitsProp,
  canonicalUnit: canonicalUnitProp,
  defaultDisplayUnit,
  displayUnit: displayUnitProp,
  onDisplayUnitChange,
  selector = 'auto',
  min,
  max,
  invalid,
  unitLabel = 'Unit',
  className,
  id,
  disabled,
  onFocus,
  onBlur,
  ref,
  ...rest
}: MetricInputProps) => {
  // Both rendered controls need their own id so the browser can key autofill off
  // them; `id` is normally injected by `FieldControl`, but MetricInput is also
  // usable standalone, so fall back to a generated one.
  const fallbackId = useId();
  const valueInputId = id ?? `${fallbackId}-value`;
  const unitSelectId = `${id ?? fallbackId}-unit`;

  const { units, canonicalUnit } = useMemo(
    () =>
      resolveUnitConfig({
        dimension,
        units: unitsProp,
        canonicalUnit: canonicalUnitProp,
      }),
    [dimension, unitsProp, canonicalUnitProp],
  );

  const canonicalUnitDef = units.find((unit) => unit.value === canonicalUnit) ?? units[0]!;

  const [internalDisplayUnit, setInternalDisplayUnit] = useState<string>(
    () => defaultDisplayUnit ?? canonicalUnit,
  );
  const isDisplayControlled = displayUnitProp !== undefined;
  const displayUnitValue = isDisplayControlled ? displayUnitProp : internalDisplayUnit;
  const displayUnitDef = units.find((unit) => unit.value === displayUnitValue) ?? canonicalUnitDef;

  const toDisplayText = (canonicalValue: number | null, unit: MetricUnit): string =>
    canonicalValue === null
      ? ''
      : formatMetric(convertMetric(canonicalValue, canonicalUnitDef, unit), unit.precision);

  const [text, setText] = useState<string>(() => toDisplayText(value, displayUnitDef));

  // While the input is focused we keep the user's raw keystrokes; we only
  // re-derive the displayed text from the canonical value when it (or the
  // display unit) changes from outside an active edit.
  const focusedRef = useRef(false);

  // The text the field should show for the current canonical value + display unit.
  const syncedText = toDisplayText(value, displayUnitDef);

  // Re-derive the buffer when that target changes from outside an active edit.
  // Depending on the derived string (not unit-object identities) means an inline
  // `units` array that re-resolves to the same units won't thrash this effect.
  useEffect(() => {
    if (focusedRef.current) return;
    setText(syncedText);
  }, [syncedText]);

  const emitCanonical = (raw: string) => {
    const parsed = parseMetric(raw);
    if (parsed === null) {
      onChange?.(null);
      return;
    }
    onChange?.(clampMetric(convertMetric(parsed, displayUnitDef, canonicalUnitDef), min, max));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setText(raw);
    emitCanonical(raw);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    // Normalise the buffer to the canonical value (applies rounding/clamping).
    setText(toDisplayText(value, displayUnitDef));
    onBlur?.(event);
  };

  const handleUnitChange = (nextUnit: string) => {
    const unit = units.find((candidate) => candidate.value === nextUnit);
    if (!unit) return;
    // Re-format the displayed value into the new unit; canonical value is unchanged.
    setText(toDisplayText(value, unit));
    if (!isDisplayControlled) setInternalDisplayUnit(nextUnit);
    onDisplayUnitChange?.(nextUnit);
  };

  const showSelector = units.length > 1;
  const selectorMode =
    selector === 'auto'
      ? units.length <= SELECTOR_TOGGLE_MAX_UNITS
        ? 'toggle'
        : 'select'
      : selector;

  const { 'aria-invalid': injectedAriaInvalid, ...nativeRest } = rest;
  const ariaInvalid =
    invalid || injectedAriaInvalid === true || injectedAriaInvalid === 'true' ? true : undefined;

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <Input
        // Not `type="number"`: its badInput sanitisation reports `''` for
        // partial entries like `-` or `1e`, so the focused-edit buffer — which
        // exists precisely to preserve raw keystrokes — got wiped on blur.
        // Text + decimal inputMode/pattern keeps the buffer intact while still
        // summoning a numeric keyboard on touch devices.
        type="text"
        inputMode="decimal"
        pattern="-?[0-9]*[.]?[0-9]*"
        {...nativeRest}
        ref={ref}
        id={valueInputId}
        className="min-w-0 flex-1"
        value={text}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        aria-invalid={ariaInvalid}
      />

      {showSelector ? (
        selectorMode === 'toggle' ? (
          <ToggleSwitch
            aria-label={unitLabel}
            size="medium"
            className="shrink-0"
            disabled={disabled}
            value={displayUnitValue}
            onValueChange={handleUnitChange}
            options={units.map((unit) => ({ value: unit.value, label: unit.label }))}
          />
        ) : (
          <div className="w-28 shrink-0">
            <Select
              id={unitSelectId}
              aria-label={unitLabel}
              value={displayUnitValue}
              onChange={(event) => handleUnitChange(event.target.value)}
              disabled={disabled}
            >
              {units.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </Select>
          </div>
        )
      ) : (
        <span className="flex shrink-0 items-center px-3 text-sm text-(--ui-text-subtle)">
          {displayUnitDef.label}
        </span>
      )}
    </div>
  );
};
