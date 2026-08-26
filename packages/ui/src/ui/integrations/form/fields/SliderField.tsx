'use client';

import { type ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Slider } from '../../../primitives';
import type {
  SliderMark,
  SliderOption,
  SliderOptionValue,
  SliderSize,
  SliderTone,
} from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

/** Value stored by the field, depending on mode (`options`) and `range`. */
export type SliderFieldValue =
  | number
  | [number, number]
  | SliderOptionValue
  | [SliderOptionValue, SliderOptionValue]
  | undefined;

interface NumericFieldMode {
  options?: undefined;
  /** @defaultValue `0` */
  min?: number;
  /** @defaultValue `100` */
  max?: number;
  /** @defaultValue `1` */
  step?: number;
  /** Labelled ticks positioned by value beneath the track. */
  marks?: ReadonlyArray<SliderMark>;
  /** Show the current value(s) above the track. */
  showValue?: boolean;
  /** Format a value for the readout. */
  formatValue?: (value: number) => ReactNode;
}

interface OptionsFieldMode {
  /** Discrete labelled stops (e.g. a Likert scale); emits the chosen option's `value`. */
  options: ReadonlyArray<SliderOption>;
}

interface SliderFieldCommon {
  className?: string;
  disabled?: boolean;
  /** @defaultValue `true` */
  fullWidth?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  /** Two-thumb min–max selection. */
  range?: boolean;
  required?: boolean;
  size?: SliderSize;
  tone?: SliderTone;
  orientation?: 'horizontal' | 'vertical';
  minStepsBetweenThumbs?: number;
  thumbLabels?: [string, string];
  /** Defer error display until the control is blurred. @defaultValue `false` */
  validateOnBlur?: boolean;
}

export type SliderFieldProps = SliderFieldCommon & (NumericFieldMode | OptionsFieldMode);

/**
 * Form-bound slider for TanStack Form. Consumed as `form.SliderField({ ... })`.
 * Wraps the {@link Slider} primitive in the shared field shell (label, hint,
 * error, ARIA wiring) and supports free/stepped numeric values, dual-thumb
 * ranges, and discrete option lists.
 */
export const SliderField = (props: SliderFieldProps) => {
  const {
    className,
    disabled,
    fullWidth = true,
    hint,
    id,
    label,
    required = false,
    validateOnBlur = false,
  } = props;

  const field = useTanStackFieldContext<SliderFieldValue>();
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });

  // FieldControl injects id/name/aria-labelledby/aria-describedby/aria-invalid/
  // aria-required/disabled (Field labelAssociation="labelledby" — the Radix slider
  // thumb is a `role="slider"` span, not a labelable element); we supply the value.
  const shared = {
    minStepsBetweenThumbs: props.minStepsBetweenThumbs,
    onBlur: field.handleBlur,
    orientation: props.orientation,
    size: props.size,
    thumbLabels: props.thumbLabels,
    tone: props.tone,
  };

  const control = props.options ? (
    props.range ? (
      <Slider
        {...shared}
        onValueChange={(value) => field.handleChange(value)}
        options={props.options}
        range
        value={field.state.value as [SliderOptionValue, SliderOptionValue] | undefined}
      />
    ) : (
      <Slider
        {...shared}
        onValueChange={(value) => field.handleChange(value)}
        options={props.options}
        value={field.state.value as SliderOptionValue | undefined}
      />
    )
  ) : props.range ? (
    <Slider
      {...shared}
      formatValue={props.formatValue}
      marks={props.marks}
      max={props.max}
      min={props.min}
      onValueChange={(value) => field.handleChange(value)}
      range
      showValue={props.showValue}
      step={props.step}
      value={field.state.value as [number, number] | undefined}
    />
  ) : (
    <Slider
      {...shared}
      formatValue={props.formatValue}
      marks={props.marks}
      max={props.max}
      min={props.min}
      onValueChange={(value) => field.handleChange(value)}
      showValue={props.showValue}
      step={props.step}
      value={field.state.value as number | undefined}
    />
  );

  return (
    <Field
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      id={id}
      invalid={invalid}
      labelAssociation="labelledby"
      name={field.name}
      required={required}
    >
      <FieldLabel>{label}</FieldLabel>
      <FieldHint>{hint}</FieldHint>
      <FieldControl>{control}</FieldControl>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
