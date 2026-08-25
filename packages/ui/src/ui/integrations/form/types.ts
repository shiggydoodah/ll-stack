export type { DeepKeys, DeepValue } from '@tanstack/react-form';

export type FormError<TFormData> = {
  [K in keyof TFormData]?: string;
} & { api?: string };

export type FormSubmitResult<TFormData> = { ok: true } | { ok: false; error: FormError<TFormData> };
