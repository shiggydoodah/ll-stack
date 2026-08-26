import { useRef, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import { focusFirstInvalid } from './focusFirstInvalid';
import { FormBusyProvider } from './FormBusyProvider';
import type { useAppForm } from './createAppForm';

// useAppForm carries a generic slot for every TanStack validator hook.
// Form only needs the values shape, so the validator slots are fixed to
// undefined here to represent "not configured" while extracting AppForm and
// handleSubmit from the concrete return type. This is type-only and has no
// runtime effect.
type AppFormApiForValues<TValues> = ReturnType<
  typeof useAppForm<
    TValues,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >
>;

export type FormApiForForm<TValues> = Pick<
  AppFormApiForValues<TValues>,
  'AppForm' | 'handleSubmit' | 'clearServerErrors'
>;

export interface FormProps<TValues> extends Omit<
  ComponentPropsWithoutRef<'form'>,
  'children' | 'color' | 'noValidate' | 'onSubmit'
> {
  children: ReactNode;
  form: FormApiForForm<TValues>;
}

export const Form = <TValues,>({ children, className, form, ...props }: FormProps<TValues>) => {
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Clear server errors before TanStack validates — stale onServer errors
    // mark the form invalid and would block re-submission otherwise.
    form.clearServerErrors();
    await form.handleSubmit();
    focusFirstInvalid(formRef.current);
  };

  return (
    <form
      ref={formRef}
      noValidate
      // No default field spacing: consumers own their own spacing (typically a
      // flex/grid container with its own `gap-*`). A `space-y-*` default here would
      // stack on top of any such gap (tailwind-merge keeps both — different property
      // groups), double-spacing fields.
      className={cn(className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <form.AppForm>
        <FormBusyProvider>{children}</FormBusyProvider>
      </form.AppForm>
    </form>
  );
};
