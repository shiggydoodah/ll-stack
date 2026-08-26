import { z } from 'zod';
import { emailSchema, passwordSchema } from '@repo/schema';

export { emailSchema };

// The user-facing password schema is more lenient than the one used for
// validation in the action, to avoid lecturing a returning user about
// complexity rules on the login screen. loginSchemaAction re-parses with the
// strict schema server-side.
const userFacingPasswordSchema = z.string().min(1, 'Password is required');

export const loginSchema = z.object({
  email: emailSchema,
  password: userFacingPasswordSchema,
});

// Used on the server action to validate the password.
export const loginSchemaAction = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginFormValues = z.infer<typeof loginSchema>;
