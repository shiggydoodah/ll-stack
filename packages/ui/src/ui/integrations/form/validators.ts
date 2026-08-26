import type { ZodType } from 'zod';

export const makeBlurValidator =
  <T>(schema: ZodType<T>) =>
  ({ value }: { value: unknown }): string | undefined => {
    const result = schema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  };

export const makeZodFormValidator =
  <TFormData>(schema: ZodType<TFormData>) =>
  ({ value }: { value: TFormData }) => {
    const result = schema.safeParse(value);
    if (result.success) return undefined;
    const fields: Record<string, string> = {};
    let formMessage: string | undefined;
    for (const issue of result.error.issues) {
      if (issue.path.length === 0) {
        formMessage ??= issue.message;
      } else {
        const key = String(issue.path[0]);
        if (!(key in fields)) fields[key] = issue.message;
      }
    }
    const hasFields = Object.keys(fields).length > 0;
    if (!formMessage && !hasFields) return undefined;
    const errors: { form?: string; fields?: Record<string, string> } = {};
    if (formMessage) errors.form = formMessage;
    if (hasFields) errors.fields = fields;
    return errors;
  };
