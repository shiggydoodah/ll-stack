import {
  createFormHook,
  createFormHookContexts,
  useSelector,
  type DeepKeys,
  type DeepValue,
  type FormAsyncValidateOrFn,
  type FormOptions,
  type FormValidateOrFn,
} from '@tanstack/react-form';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';

import type { FormError } from './types';

import {
  CheckboxButtonGroupField,
  type CheckboxButtonGroupFieldProps,
  CheckboxField,
  type CheckboxFieldProps,
  ChipSelectField,
  type ChipSelectFieldProps,
  ComboBoxField,
  type ComboBoxFieldProps,
  FileUploadField,
  type FileUploadFieldProps,
  MetricField,
  type MetricFieldProps,
  PASSWORD_MIN_LENGTH,
  PasswordField,
  type PasswordFieldProps,
  passwordMinLengthValidator,
  RadioButtonGroupField,
  type RadioButtonGroupFieldProps,
  RadioGroupField,
  type RadioGroupFieldProps,
  SelectField,
  type SelectFieldProps,
  SliderField,
  type SliderFieldProps,
  TextAreaField,
  type TextAreaFieldProps,
  TextField,
  type TextFieldProps,
} from './fields';
import { FormErrors, type FormErrorsProps, SubmitButton, type SubmitButtonProps } from './submit';

type AnyFormApi = {
  setErrorMap: (map: Record<string, unknown>) => void;
  setFieldMeta: (
    field: string,
    updater: (meta: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => void;
  state: { submissionAttempts: number };
};

const isFormSubmitError = (
  result: unknown,
): result is { ok: false; error: FormError<Record<string, unknown>> } =>
  result !== null &&
  typeof result === 'object' &&
  'ok' in result &&
  (result as { ok: unknown }).ok === false &&
  'error' in result &&
  typeof (result as { error: unknown }).error === 'object' &&
  (result as { error: unknown }).error !== null;

const applyErrorToFormApi = (formApi: AnyFormApi, error: FormError<Record<string, unknown>>) => {
  for (const [key, message] of Object.entries(error)) {
    if (!message) continue;
    if (key === 'api') {
      formApi.setErrorMap({ onServer: message });
    } else {
      formApi.setFieldMeta(key, (meta) => ({
        ...(meta ?? {}),
        errorMap: {
          ...(meta?.['errorMap'] as Record<string, unknown> | undefined),
          onSubmit: message,
        },
      }));
    }
  }
};

export const baseFieldComponents = {
  CheckboxButtonGroupField,
  CheckboxField,
  ChipSelectField,
  ComboBoxField,
  FileUploadField,
  MetricField,
  PasswordField,
  RadioButtonGroupField,
  RadioGroupField,
  SelectField,
  SliderField,
  TextAreaField,
  TextField,
} as const;

export const baseFormComponents = {
  Errors: FormErrors,
  SubmitButton,
} as const;

const appFormContexts = createFormHookContexts();

export const fieldContext = appFormContexts.fieldContext;
export const formContext = appFormContexts.formContext;
export const useTanStackFieldContext = appFormContexts.useFieldContext;
export const useFormContext = appFormContexts.useFormContext;

const innerHook = createFormHook({
  fieldComponents: baseFieldComponents,
  formComponents: baseFormComponents,
  fieldContext,
  formContext,
});

export const withForm = innerHook.withForm;
export const withFieldGroup = innerHook.withFieldGroup;
export const useTypedAppFormContext = innerHook.useTypedAppFormContext;
export const extendForm = innerHook.extendForm;

type FieldValidator = (props: { value: unknown }) => string | undefined | null | false;

type FieldValidators = {
  onBlur?: FieldValidator;
  onChange?: FieldValidator;
  onSubmit?: FieldValidator;
};

// Per-hook merge, not replacement: a consumer supplying one hook (say onBlur)
// must not silently drop a field's own prop-derived default on another (that is
// how PasswordField's minLength check would vanish the moment any unrelated
// validator was added). Consumer entries win per key.
const mergeFieldValidators = (
  defaults: FieldValidators | undefined,
  overrides: FieldValidators | undefined,
): FieldValidators | undefined => {
  if (!defaults) return overrides;
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
};

type BoundFieldExtras<TFormData> = {
  name: DeepKeys<TFormData>;
  resetOnChange?: ReadonlyArray<ResettableDeepKeys<TFormData>>;
  /**
   * Per-hook validators for this field. Merged over any defaults the field
   * derives from its own props (PasswordField's `minLength` check, for
   * example), so supplying `onBlur` here overrides only `onBlur` and leaves the
   * field's default `onChange` in place. Set a hook explicitly to replace it.
   */
  fieldValidators?: FieldValidators;
};

type BoundFieldProps<TFormData, TInnerProps> = TInnerProps & BoundFieldExtras<TFormData>;

type ResettableDeepKeys<TFormData> = {
  [TKey in DeepKeys<TFormData>]: undefined extends DeepValue<TFormData, TKey> ? TKey : never;
}[DeepKeys<TFormData>];

type BoundFieldRegistry<TFormData> = {
  CheckboxButtonGroupField: (
    props: BoundFieldProps<TFormData, CheckboxButtonGroupFieldProps>,
  ) => ReactElement;
  CheckboxField: (props: BoundFieldProps<TFormData, CheckboxFieldProps>) => ReactElement;
  ChipSelectField: (props: BoundFieldProps<TFormData, ChipSelectFieldProps>) => ReactElement;
  ComboBoxField: (props: BoundFieldProps<TFormData, ComboBoxFieldProps>) => ReactElement;
  FileUploadField: (props: BoundFieldProps<TFormData, FileUploadFieldProps>) => ReactElement;
  MetricField: (props: BoundFieldProps<TFormData, MetricFieldProps>) => ReactElement;
  PasswordField: (props: BoundFieldProps<TFormData, PasswordFieldProps>) => ReactElement;
  RadioButtonGroupField: (
    props: BoundFieldProps<TFormData, RadioButtonGroupFieldProps>,
  ) => ReactElement;
  RadioGroupField: (props: BoundFieldProps<TFormData, RadioGroupFieldProps>) => ReactElement;
  SelectField: (props: BoundFieldProps<TFormData, SelectFieldProps>) => ReactElement;
  SliderField: (props: BoundFieldProps<TFormData, SliderFieldProps>) => ReactElement;
  TextAreaField: (props: BoundFieldProps<TFormData, TextAreaFieldProps>) => ReactElement;
  TextField: (props: BoundFieldProps<TFormData, TextFieldProps>) => ReactElement;
};

interface FormBridgeApi<TFormData> {
  AppField: ComponentType<{
    name: DeepKeys<TFormData>;
    listeners?: { onChange?: (args: { value: unknown }) => void };
    validators?: FieldValidators;
    children: (field: unknown) => ReactElement;
  }>;
  resetFieldValue: <TField extends ResettableDeepKeys<TFormData>>(name: TField) => void;
}

interface BoundFieldRendererProps<TFormData, TInnerProps extends object> {
  Component: ComponentType<TInnerProps>;
  form: FormBridgeApi<TFormData>;
  name: DeepKeys<TFormData>;
  resetOnChange?: ReadonlyArray<ResettableDeepKeys<TFormData>>;
  fieldValidators?: FieldValidators;
  rest: TInnerProps;
}

const BoundFieldRenderer = <TFormData, TInnerProps extends object>({
  Component,
  form,
  name,
  resetOnChange,
  fieldValidators,
  rest,
}: BoundFieldRendererProps<TFormData, TInnerProps>): ReactElement => {
  const listeners = useMemo(() => {
    if (!resetOnChange || resetOnChange.length === 0) return undefined;
    return {
      onChange: () => {
        for (const path of resetOnChange) {
          if (path === name) continue;
          form.resetFieldValue(path);
        }
      },
    };
  }, [form, name, resetOnChange]);

  return (
    <form.AppField name={name} listeners={listeners} validators={fieldValidators}>
      {() => <Component {...rest} />}
    </form.AppField>
  );
};

const createBoundField = <TFormData, TInnerProps extends object>(
  form: FormBridgeApi<TFormData>,
  Component: ComponentType<TInnerProps>,
  displayName: string,
  // Lets a field contribute validators derived from its own props (e.g.
  // PasswordField's minLength). Consumer-supplied fieldValidators are merged
  // over these per hook rather than replacing them wholesale.
  defaultValidators?: (innerProps: TInnerProps) => FieldValidators | undefined,
) => {
  const BoundField = (
    props: TInnerProps & {
      name: DeepKeys<TFormData>;
      resetOnChange?: ReadonlyArray<ResettableDeepKeys<TFormData>>;
      fieldValidators?: FieldValidators;
    },
  ) => {
    const { name, resetOnChange, fieldValidators, ...rest } = props;
    // name/resetOnChange/fieldValidators are stripped before forwarding, so rest is the inner field prop shape.
    const innerProps = rest as unknown as TInnerProps;

    return (
      <BoundFieldRenderer
        Component={Component}
        form={form}
        name={name}
        resetOnChange={resetOnChange}
        fieldValidators={mergeFieldValidators(defaultValidators?.(innerProps), fieldValidators)}
        rest={innerProps}
      />
    );
  };
  BoundField.displayName = displayName;
  return BoundField;
};

export type AppFormApi<
  TFormData,
  TOnMount extends FormValidateOrFn<TFormData> | undefined,
  TOnChange extends FormValidateOrFn<TFormData> | undefined,
  TOnChangeAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnBlur extends FormValidateOrFn<TFormData> | undefined,
  TOnBlurAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnSubmit extends FormValidateOrFn<TFormData> | undefined,
  TOnSubmitAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnDynamic extends FormValidateOrFn<TFormData> | undefined,
  TOnDynamicAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnServer extends FormAsyncValidateOrFn<TFormData> | undefined,
  TSubmitMeta,
> = ReturnType<
  typeof innerHook.useAppForm<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >
> &
  BoundFieldRegistry<TFormData> & {
    setServerError: (error: string | undefined) => void;
    applyFormError: (error: FormError<TFormData>) => void;
    clearServerErrors: () => void;
    submitFailed: boolean;
    submitSuccess: boolean;
    submitFailCount: number;
    submitCount: number;
  };

export const useAppForm = <
  TFormData,
  TOnMount extends FormValidateOrFn<TFormData> | undefined,
  TOnChange extends FormValidateOrFn<TFormData> | undefined,
  TOnChangeAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnBlur extends FormValidateOrFn<TFormData> | undefined,
  TOnBlurAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnSubmit extends FormValidateOrFn<TFormData> | undefined,
  TOnSubmitAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnDynamic extends FormValidateOrFn<TFormData> | undefined,
  TOnDynamicAsync extends FormAsyncValidateOrFn<TFormData> | undefined,
  TOnServer extends FormAsyncValidateOrFn<TFormData> | undefined,
  TSubmitMeta,
>(
  options: FormOptions<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  > & {
    onSuccess?: () => void | Promise<void>;
    onError?: (error: FormError<TFormData>) => void | Promise<void>;
  },
): AppFormApi<
  TFormData,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync,
  TOnServer,
  TSubmitMeta
> => {
  const { onSuccess, onError, onSubmit, ...tanstackOptions } = options;

  // Refs so the stable wrapper always calls the latest versions of these callbacks.
  const onSubmitRef = useRef(onSubmit);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  const [submitFailCount, setSubmitFailCount] = useState(0);
  // True while wrappedOnSubmit is executing — used to prevent the useEffect from
  // double-counting failures that are already counted by the server-error path.
  const serverSubmitInFlightRef = useRef(false);
  // Tracks the last submission attempt whose outcome has been accounted for
  // (counted as a failure or acknowledged as a success). Must advance on BOTH
  // outcomes: if a success left it behind, a later field-validation failure
  // (blur/change validator) would read as a fresh failed submit and spuriously
  // bump submitFailCount without any new attempt.
  const lastCountedAttemptRef = useRef(0);

  // No dependency array: intentional "latest ref" pattern — updates refs on every render.
  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  // Stable wrapped onSubmit created once per hook lifetime. Callbacks are
  // accessed via refs so identity changes don't recreate this function.
  const hasOnSubmit = !!onSubmit;
  const wrappedOnSubmit = useMemo(() => {
    if (!hasOnSubmit) return undefined;
    return async (props: { value: TFormData; formApi: AnyFormApi }) => {
      serverSubmitInFlightRef.current = true;
      try {
        const result = await onSubmitRef.current!(
          props as unknown as Parameters<NonNullable<typeof onSubmit>>[0],
        );

        // Either way this attempt's outcome is decided here, so record it as
        // accounted for — the effect below must not re-count it when validators
        // later flip isValid (server errors now, field edits after a success).
        lastCountedAttemptRef.current = props.formApi.state.submissionAttempts;

        if (isFormSubmitError(result)) {
          setSubmitFailCount((c) => c + 1);
          applyErrorToFormApi(props.formApi, result.error);
          await onErrorRef.current?.(result.error as FormError<TFormData>);
        } else {
          setSubmitFailCount(0);
          await onSuccessRef.current?.();
        }
      } finally {
        serverSubmitInFlightRef.current = false;
      }
    };
  }, [hasOnSubmit]);

  const form = innerHook.useAppForm({
    ...tanstackOptions,
    onSubmit: wrappedOnSubmit,
  } as Parameters<typeof innerHook.useAppForm>[0]); // TanStack infers onSubmit's return as void; cast bridges the mismatch.

  const bridges = useMemo(() => {
    const bridgeForm: FormBridgeApi<TFormData> = {
      AppField: form.AppField,
      resetFieldValue: (name) => {
        // ResettableDeepKeys already narrows name to paths whose value allows undefined.
        // dontUpdateMeta: a programmatic sibling reset is not a user interaction — it
        // must not mark the field touched/dirty, or fields that reveal deferred errors
        // on interaction (ComboBox, FileUpload) would surface them without user input.
        form.setFieldValue(name, undefined as DeepValue<TFormData, typeof name>, {
          dontUpdateMeta: true,
        });
      },
    };
    return {
      CheckboxButtonGroupField: createBoundField(
        bridgeForm,
        CheckboxButtonGroupField,
        'BoundCheckboxButtonGroupField',
      ),
      CheckboxField: createBoundField(bridgeForm, CheckboxField, 'BoundCheckboxField'),
      ChipSelectField: createBoundField(bridgeForm, ChipSelectField, 'BoundChipSelectField'),
      ComboBoxField: createBoundField(bridgeForm, ComboBoxField, 'BoundComboBoxField'),
      FileUploadField: createBoundField(bridgeForm, FileUploadField, 'BoundFileUploadField'),
      MetricField: createBoundField(bridgeForm, MetricField, 'BoundMetricField'),
      // minLength must enforce itself — otherwise the prop only decorates the
      // placeholder/counter and submits anything. Merged per hook, so a consumer
      // adding an onBlur check keeps this onChange length guard.
      PasswordField: createBoundField(bridgeForm, PasswordField, 'BoundPasswordField', (props) => ({
        onChange: passwordMinLengthValidator(props.minLength ?? PASSWORD_MIN_LENGTH),
      })),
      RadioButtonGroupField: createBoundField(
        bridgeForm,
        RadioButtonGroupField,
        'BoundRadioButtonGroupField',
      ),
      RadioGroupField: createBoundField(bridgeForm, RadioGroupField, 'BoundRadioGroupField'),
      SelectField: createBoundField(bridgeForm, SelectField, 'BoundSelectField'),
      SliderField: createBoundField(bridgeForm, SliderField, 'BoundSliderField'),
      TextAreaField: createBoundField(bridgeForm, TextAreaField, 'BoundTextAreaField'),
      TextField: createBoundField(bridgeForm, TextField, 'BoundTextField'),
    };
  }, [form]);

  const submissionAttempts = useSelector(form.store, (s) => s.submissionAttempts);
  const isValid = useSelector(form.store, (s) => s.isValid);
  const isSubmitting = useSelector(form.store, (s) => s.isSubmitting);
  const isSubmitSuccessful = useSelector(form.store, (s) => s.isSubmitSuccessful);

  useEffect(() => {
    // TanStack updates submissionAttempts and isValid in separate store batches, so each
    // triggers its own render. Depending on both ensures the effect re-runs when isValid
    // settles to false after a validation-blocked submit, rather than reading a stale true.
    if (submissionAttempts <= lastCountedAttemptRef.current) return;
    if (isValid) {
      // A new attempt that settled valid completed successfully, so record it as
      // accounted for (covers forms without an onSubmit handler, where
      // wrappedOnSubmit never runs to do it) — otherwise a later field-validation
      // failure would read as this attempt failing. The isSubmitting guard skips
      // the transient valid state mid-pipeline so a validation-blocked attempt
      // isn't marked accounted-for before it fails.
      if (!isSubmitting) {
        lastCountedAttemptRef.current = submissionAttempts;
        // Clear earlier failures here too, for the same reason: wrappedOnSubmit
        // is undefined without an onSubmit handler, so its success branch can
        // never run and submitFailCount would stay pinned above zero forever —
        // permanently suppressing submitSuccess and pinning submitFailed true.
        // Gated on isSubmitSuccessful (false until onSubmit resolves, and reset
        // at the start of every attempt) so an onSubmit that throws leaves the
        // count alone rather than reporting the attempt as clean.
        if (isSubmitSuccessful) {
          // Same bounded cascade as the failure path below: the attempt guard
          // above has already advanced past submissionAttempts, so this runs at
          // most once per settled attempt and cannot re-trigger itself.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSubmitFailCount(0);
        }
      }
      return;
    }
    // Guard against double-counting: when onSubmit runs and returns a server error,
    // wrappedOnSubmit increments the count itself (and records the attempt), so an
    // in-flight submit is never counted here.
    if (!serverSubmitInFlightRef.current) {
      lastCountedAttemptRef.current = submissionAttempts;
      setSubmitFailCount((c) => c + 1);
    }
  }, [submissionAttempts, isValid, isSubmitting, isSubmitSuccessful]);

  const castSetErrorMap = form.setErrorMap as (map: Record<string, unknown>) => void;

  const extras = {
    setServerError: (error: string | undefined) => {
      // setErrorMap's type is narrowed by configured validators; cast to set onServer freely.
      castSetErrorMap({ onServer: error });
    },
    applyFormError: (error: FormError<TFormData>) => {
      applyErrorToFormApi(
        form as unknown as AnyFormApi,
        error as FormError<Record<string, unknown>>,
      );
    },
    clearServerErrors: () => {
      castSetErrorMap({ onServer: undefined });
      for (const field of Object.keys(form.state.fieldMeta)) {
        form.setFieldMeta(field as DeepKeys<TFormData>, (meta) =>
          meta ? { ...meta, errorMap: { ...meta.errorMap, onSubmit: undefined } } : meta,
        );
      }
    },
    submitFailCount,
    submitCount: submissionAttempts,
    submitFailed: submitFailCount > 0,
    // Derived from the store's per-attempt isSubmitSuccessful rather than live
    // isValid: a field validator failing during a post-submit edit must not
    // retroactively flip a completed submit back to "not successful". TanStack
    // resets isSubmitSuccessful when the next attempt starts (and on form.reset()),
    // and submitFailCount catches server-rejected submits (which resolve without
    // throwing, so the store alone would report them successful).
    submitSuccess: isSubmitSuccessful && submitFailCount === 0 && !isSubmitting,
  };

  return Object.assign(form, bridges, extras) as unknown as AppFormApi<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >;
};

export type { FormErrorsProps, SubmitButtonProps };
