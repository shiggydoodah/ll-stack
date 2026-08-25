'use client';

import { Form, makeBlurValidator, makeZodFormValidator, useAppForm } from '@repo/ui/integrations';

import { loginAction } from '@/app/actions/login';
import { emailSchema, loginSchema } from './loginSchema';
import type { LoginFormValues } from './loginSchema';

const emailBlurValidator = makeBlurValidator(emailSchema);
const zodFormValidator = makeZodFormValidator(loginSchema);

const defaultValues: LoginFormValues = {
  email: '',
  password: '',
};

export const LoginForm = () => {
  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: zodFormValidator },
    onSubmit: async ({ value }) => loginAction(value),
  });

  return (
    <Form form={form} className="flex flex-col gap-5">
      <form.TextField
        autoComplete="email"
        fieldValidators={{ onBlur: emailBlurValidator }}
        label="Email"
        name="email"
        placeholder="you@example.com"
        required
        type="email"
        validateOnBlur
      />
      <form.TextField
        autoComplete="current-password"
        label="Password"
        name="password"
        placeholder="Enter your password"
        required
        type="password"
      />
      <form.Errors />
      <form.SubmitButton
        fullWidth
        tone="neutral"
        variant="solid"
        size="large"
        className="text-2xs justify-between font-mono font-bold tracking-widest uppercase"
      >
        Sign in
        <span aria-hidden="true" className="tracking-normal">
          →
        </span>
      </form.SubmitButton>
    </Form>
  );
};
