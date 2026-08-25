import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from '@repo/schema';

export { emailSchema, nameSchema, passwordSchema };

// One schema for both tiers: unlike login, every rule here is safe to show a
// prospective member, so the client form and the server action parse the same
// shape (the action re-parses — client validation is never trusted).
export const createAccountSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  consent: z.boolean().refine((value) => value === true, {
    message: 'You must accept the terms to continue.',
  }),
});

export type CreateAccountFormValues = z.infer<typeof createAccountSchema>;
