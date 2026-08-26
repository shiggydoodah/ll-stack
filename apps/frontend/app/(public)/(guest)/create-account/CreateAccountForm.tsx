'use client';

import { Form, makeBlurValidator, makeZodFormValidator, useAppForm } from '@repo/ui/integrations';
import { MIN_PASSWORD_LENGTH } from '@repo/schema';

import { createUserAction } from '@/app/actions/create-user';
import {
  createAccountSchema,
  emailSchema,
  nameSchema,
  passwordSchema,
} from './createAccountSchema';
import type { CreateAccountFormValues } from './createAccountSchema';

const nameBlurValidator = makeBlurValidator(nameSchema);
const emailBlurValidator = makeBlurValidator(emailSchema);
const passwordBlurValidator = makeBlurValidator(passwordSchema);
const zodFormValidator = makeZodFormValidator(createAccountSchema);

const defaultValues: CreateAccountFormValues = {
  name: '',
  email: '',
  password: '',
  consent: false,
};

export const CreateAccountForm = () => {
  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: zodFormValidator },
    onSubmit: async ({ value }) => createUserAction(value),
  });

  return (
    <Form form={form} className="flex flex-col gap-5">
      <form.TextField
        autoComplete="name"
        fieldValidators={{ onBlur: nameBlurValidator }}
        label="Name"
        name="name"
        placeholder="Ada Whitcombe"
        required
        validateOnBlur
      />
      <form.TextField
        autoComplete="email"
        fieldValidators={{ onBlur: emailBlurValidator }}
        label="Email"
        name="email"
        placeholder="you@example.com"
        required
        showValid
        type="email"
        validateOnBlur
      />
      <form.PasswordField
        fieldValidators={{ onBlur: passwordBlurValidator }}
        label="Password"
        minLength={MIN_PASSWORD_LENGTH}
        name="password"
        required
        showValid
        validateOnBlur
      />
      <form.CheckboxField
        label="I accept the Terms of Service and Privacy Policy."
        name="consent"
      />
      <form.Errors />
      <form.SubmitButton
        fullWidth
        tone="neutral"
        variant="solid"
        size="large"
        className="text-2xs justify-between font-mono font-bold tracking-widest uppercase"
      >
        Create account
        <span aria-hidden="true" className="tracking-normal">
          →
        </span>
      </form.SubmitButton>
    </Form>
  );
};
