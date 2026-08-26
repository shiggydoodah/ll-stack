'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import { useState } from 'react';
import type { AriaAttributes, ComponentRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  sliderMarkLabelClass,
  sliderMarksRowClass,
  sliderRangeBaseClass,
  sliderRangeToneClasses,
  sliderRootClass,
  sliderThumbBaseClass,
  sliderThumbSizeClass,
  sliderThumbToneClasses,
  sliderTrackClass,
  sliderTrackThicknessClass,
  sliderValueReadoutClass,
} from './slider.styles';
import type { SliderSize, SliderTone } from './slider.styles';

export type { SliderSize, SliderTone };

/** A value an option resolves to when selected. */
export type SliderOptionValue = string | number;

export interface SliderOption {
  /** Stable value emitted when this stop is selected. */
  value: SliderOptionValue;
  /** Visible label rendered beneath the stop. */
  label: ReactNode;
  /** Currently unused for interaction (Radix has no per-stop disable); reserved for styling. */
  disabled?: boolean;
}

/** A labelled tick on a numeric slider. */
export interface SliderMark {
  value: number;
  label: ReactNode;
}

type SliderAriaProps = Pick<
  AriaAttributes,
  'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-invalid' | 'aria-required'
> & {
  id?: string;
  /** Submitted field name; Radix renders hidden inputs when set. */
  name?: string;
  /** Fired when focus leaves the control (a thumb). */
  onBlur?: () => void;
};

interface SliderSharedProps extends SliderAriaProps {
  /** Fill/handle colour. @defaultValue `'red'` */
  tone?: SliderTone;
  /** Control size. @defaultValue `'md'` */
  size?: SliderSize;
  disabled?: boolean;
  /** @defaultValue `'horizontal'` */
  orientation?: 'horizontal' | 'vertical';
  /** Applied to the outer wrapper. */
  className?: string;
  /** Minimum number of steps the two range thumbs must stay apart. @defaultValue `0` */
  minStepsBetweenThumbs?: number;
  /** Accessible labels for the two range thumbs. @defaultValue `['Minimum', 'Maximum']` */
  thumbLabels?: [string, string];
  /** Forwarded to the Radix slider root element. */
  ref?: Ref<ComponentRef<typeof SliderPrimitive.Root>>;
}

interface NumericBaseProps {
  options?: undefined;
  /** @defaultValue `0` */
  min?: number;
  /** @defaultValue `100` */
  max?: number;
  /** @defaultValue `1` */
  step?: number;
  /** Optional labelled ticks positioned by value beneath the track. */
  marks?: ReadonlyArray<SliderMark>;
  /** Show the current value(s) above the track. @defaultValue `false` */
  showValue?: boolean;
  /** Format a value for the readout. */
  formatValue?: (value: number) => ReactNode;
}

interface NumericSingleProps extends NumericBaseProps {
  range?: false;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
}

interface NumericRangeProps extends NumericBaseProps {
  range: true;
  value?: [number, number];
  defaultValue?: [number, number];
  onValueChange?: (value: [number, number]) => void;
}

interface OptionsBaseProps {
  /** Discrete labelled stops; drives `min=0`, `max=options.length-1`, `step=1`. */
  options: ReadonlyArray<SliderOption>;
}

interface OptionsSingleProps extends OptionsBaseProps {
  range?: false;
  value?: SliderOptionValue;
  defaultValue?: SliderOptionValue;
  onValueChange?: (value: SliderOptionValue) => void;
}

interface OptionsRangeProps extends OptionsBaseProps {
  range: true;
  value?: [SliderOptionValue, SliderOptionValue];
  defaultValue?: [SliderOptionValue, SliderOptionValue];
  onValueChange?: (value: [SliderOptionValue, SliderOptionValue]) => void;
}

export type SliderProps = SliderSharedProps &
  (NumericSingleProps | NumericRangeProps | OptionsSingleProps | OptionsRangeProps);

/**
 * Accessible slider built on `@radix-ui/react-slider` (pointer + touch drag,
 * keyboard, RTL, multi-thumb). Three behaviours via one API:
 *
 * - **Free / stepped** — numeric `min`/`max`/`step` (omit `options`).
 * - **Range** — set `range` for a two-thumb min–max band.
 * - **Option list** — pass `options` for a discrete labelled (e.g. Likert)
 *   scale; the slider emits the selected option's `value`.
 *
 * Presentational and controllable; for form-bound use the integration's
 * `SliderField`.
 *
 * @example
 * ```tsx
 * <Slider value={volume} onValueChange={setVolume} max={11} />
 * <Slider range value={band} onValueChange={setBand} />
 * <Slider
 *   options={[
 *     { value: 'strongly_agree', label: 'Strongly agree' },
 *     { value: 'agree', label: 'Agree' },
 *     { value: 'neutral', label: 'No opinion' },
 *     { value: 'disagree', label: 'Disagree' },
 *     { value: 'strongly_disagree', label: 'Strongly disagree' },
 *   ]}
 *   value={answer}
 *   onValueChange={setAnswer}
 * />
 * ```
 */
export const Slider = (props: SliderProps) => {
  const {
    tone = 'red',
    size = 'md',
    disabled = false,
    orientation = 'horizontal',
    className,
    minStepsBetweenThumbs,
    thumbLabels = ['Minimum', 'Maximum'],
    ref,
    id,
    name,
    onBlur,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
  } = props;

  const { options } = props;
  const isRange = props.range === true;
  const thumbCount = isRange ? 2 : 1;

  // Resolve the numeric domain. Options mode maps each stop to an index.
  const min = props.options ? 0 : (props.min ?? 0);
  const max = props.options ? Math.max(props.options.length - 1, 0) : (props.max ?? 100);
  const step = props.options ? 1 : (props.step ?? 1);

  const indexOfOption = (value: SliderOptionValue): number => {
    const index = options?.findIndex((option) => option.value === value) ?? -1;
    return index === -1 ? 0 : index;
  };

  const toRadix = (value: SliderProps['value']): number[] | undefined => {
    if (value === undefined) return undefined;
    if (options) {
      return isRange
        ? (value as [SliderOptionValue, SliderOptionValue]).map(indexOfOption)
        : [indexOfOption(value as SliderOptionValue)];
    }
    return isRange ? [...(value as [number, number])] : [value as number];
  };

  const controlledValue = toRadix(props.value);
  const fallbackDefault = isRange ? [min, max] : [min];
  const defaultValue =
    controlledValue !== undefined ? undefined : (toRadix(props.defaultValue) ?? fallbackDefault);

  // Radix owns the value in uncontrolled mode, so mirror it here — otherwise the
  // `showValue` readout would stay frozen at the default.
  const [internalValue, setInternalValue] = useState<number[]>(
    () => toRadix(props.defaultValue) ?? fallbackDefault,
  );

  const handleValueChange = (next: number[]) => {
    setInternalValue(next);
    const first = next[0] ?? min;
    const second = next[1] ?? max;
    if (props.options) {
      const opts = props.options;
      const valueAt = (index: number): SliderOptionValue =>
        opts[index]?.value ?? opts[0]?.value ?? '';
      if (props.range) {
        props.onValueChange?.([valueAt(first), valueAt(second)]);
      } else {
        props.onValueChange?.(valueAt(first));
      }
      return;
    }
    if (props.range) {
      props.onValueChange?.([first, second]);
    } else {
      props.onValueChange?.(first);
    }
  };

  // Per-thumb ARIA: a single thumb carries the field wiring (id + name from the
  // label); range thumbs are distinguished by their own labels instead.
  const thumbAriaProps = (index: number) =>
    isRange
      ? {
          'aria-label': thumbLabels[index],
          'aria-describedby': ariaDescribedby,
          'aria-invalid': ariaInvalid,
          'aria-required': ariaRequired,
        }
      : {
          id,
          'aria-label': ariaLabel,
          'aria-labelledby': ariaLabelledby,
          'aria-describedby': ariaDescribedby,
          'aria-invalid': ariaInvalid,
          'aria-required': ariaRequired,
        };

  const showValue = props.options ? false : (props.showValue ?? false);
  const formatValue = props.options ? undefined : props.formatValue;
  const marks = props.options ? undefined : props.marks;

  const displayValues = controlledValue ?? internalValue;
  const renderNumber = (value: number): ReactNode => (formatValue ? formatValue(value) : value);

  return (
    <div
      className={cn(
        'w-full',
        orientation === 'vertical' && 'inline-flex h-full w-auto flex-col items-center',
        className,
      )}
    >
      {showValue && (
        <div className={sliderValueReadoutClass}>
          {isRange
            ? `${renderNumber(displayValues[0] ?? min)} – ${renderNumber(displayValues[1] ?? max)}`
            : renderNumber(displayValues[0] ?? min)}
        </div>
      )}

      <SliderPrimitive.Root
        ref={ref}
        className={sliderRootClass}
        defaultValue={defaultValue}
        disabled={disabled}
        max={max}
        min={min}
        minStepsBetweenThumbs={minStepsBetweenThumbs}
        name={name}
        onBlur={onBlur}
        onValueChange={handleValueChange}
        orientation={orientation}
        step={step}
        value={controlledValue}
      >
        <SliderPrimitive.Track className={cn(sliderTrackClass, sliderTrackThicknessClass[size])}>
          <SliderPrimitive.Range
            className={cn(sliderRangeBaseClass, sliderRangeToneClasses[tone])}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }, (_, index) => (
          <SliderPrimitive.Thumb
            className={cn(
              sliderThumbBaseClass,
              sliderThumbSizeClass[size],
              sliderThumbToneClasses[tone],
            )}
            key={index}
            {...thumbAriaProps(index)}
          />
        ))}
      </SliderPrimitive.Root>

      {options && orientation === 'horizontal' && (
        <div className={sliderMarksRowClass}>
          {options.map((option, index) => (
            <span
              className={cn(
                sliderMarkLabelClass,
                'flex-1',
                index === 0
                  ? 'text-left'
                  : index === options.length - 1
                    ? 'text-right'
                    : 'text-center',
              )}
              key={index}
            >
              {option.label}
            </span>
          ))}
        </div>
      )}

      {marks && orientation === 'horizontal' && (
        <div className="relative mt-2 h-4 w-full">
          {marks.map((mark) => (
            <span
              className={cn(sliderMarkLabelClass, 'absolute -translate-x-1/2 whitespace-nowrap')}
              key={mark.value}
              style={{ left: `${max > min ? ((mark.value - min) / (max - min)) * 100 : 0}%` }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
