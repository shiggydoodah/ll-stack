'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { Field, FieldError, FieldHint } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { useTanStackFieldContext } from '../createAppForm';
import { FieldGroup } from './FieldGroup';
import type { RadioGroupItem } from './RadioGroupField';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

export interface RadioButtonGroupFieldProps {
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  hint?: ReactNode;
  items: ReadonlyArray<RadioGroupItem>;
  label: ReactNode;
  required?: boolean;
  validateOnBlur?: boolean;
}

export const RadioButtonGroupField = ({
  className,
  disabled,
  fullWidth = true,
  hint,
  items,
  label,
  required = false,
  validateOnBlur = false,
}: RadioButtonGroupFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });
  const groupId = useId();
  const labelId = `${groupId}-label`;
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const enabledItems = items.filter((item) => !(disabled || item.disabled));
  const selectedEnabledItem = enabledItems.find((item) => item.value === field.state.value);
  const tabbableValue = selectedEnabledItem?.value ?? enabledItems[0]?.value;

  const moveSelection = (currentValue: string, key: string) => {
    if (enabledItems.length === 0) return;

    const currentIndex = enabledItems.findIndex((item) => item.value === currentValue);
    const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
    const lastIndex = enabledItems.length - 1;
    const nextIndexByKey: Record<string, number> = {
      ArrowDown: fallbackIndex === lastIndex ? 0 : fallbackIndex + 1,
      ArrowLeft: fallbackIndex === 0 ? lastIndex : fallbackIndex - 1,
      ArrowRight: fallbackIndex === lastIndex ? 0 : fallbackIndex + 1,
      ArrowUp: fallbackIndex === 0 ? lastIndex : fallbackIndex - 1,
      End: lastIndex,
      Home: 0,
    };
    const nextIndex = nextIndexByKey[key];
    const nextItem = nextIndex === undefined ? undefined : enabledItems[nextIndex];

    if (!nextItem) return;

    if (nextItem.value !== field.state.value) {
      field.handleChange(nextItem.value);
    }
    buttonRefs.current.get(nextItem.value)?.focus();
  };

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>, value: string) => {
    if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    moveSelection(value, event.key);
  };

  return (
    <Field
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      <span className="block text-sm font-medium text-(--ui-text-body)" id={labelId}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-(--ui-accent)">
            *
          </span>
        )}
      </span>
      <FieldHint>{hint}</FieldHint>
      <FieldGroup
        aria-labelledby={labelId}
        className="inline-flex flex-wrap gap-2"
        role="radiogroup"
      >
        {items.map((item) => {
          const itemDisabled = disabled || item.disabled;
          const selected = field.state.value === item.value;
          const ariaInvalid = invalid && !itemDisabled;

          return (
            <button
              aria-checked={selected}
              aria-invalid={ariaInvalid || undefined}
              className={cn(
                'inline-flex items-center justify-center rounded-(--ui-radius-sm) border px-3 py-1.5 text-sm font-medium transition',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-accent)',
                selected
                  ? 'border-(--ui-accent) bg-(--ui-accent) text-(--ui-accent-contrast)'
                  : 'border-(--ui-border) text-(--ui-text-body) hover:border-(--ui-accent)',
                itemDisabled && 'cursor-not-allowed opacity-60',
              )}
              disabled={itemDisabled}
              key={item.value}
              onBlur={field.handleBlur}
              onClick={() => {
                if (item.value !== field.state.value) {
                  field.handleChange(item.value);
                }
              }}
              onKeyDown={(event) => handleButtonKeyDown(event, item.value)}
              ref={(node) => {
                if (node) {
                  buttonRefs.current.set(item.value, node);
                } else {
                  buttonRefs.current.delete(item.value);
                }
              }}
              role="radio"
              tabIndex={item.value === tabbableValue && !itemDisabled ? 0 : -1}
              type="button"
              value={item.value}
            >
              {item.label}
            </button>
          );
        })}
      </FieldGroup>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
