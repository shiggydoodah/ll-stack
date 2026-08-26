import { z } from 'zod';

export const MIN_USERNAME_LENGTH = 2;
export const MAX_USERNAME_LENGTH = 12;

// Mirrors the backend username rules (profile-setup.service.ts): letters, numbers,
// underscore and hyphen, 2–12 chars, no leading/trailing separator. Reserved-name
// and uniqueness checks are owned by the backend availability endpoint.
export const usernameSchema = z
  .string()
  .trim()
  .min(MIN_USERNAME_LENGTH, `Username must be at least ${MIN_USERNAME_LENGTH} characters`)
  .max(MAX_USERNAME_LENGTH, `Username must be at most ${MAX_USERNAME_LENGTH} characters`)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Use only letters, numbers, dashes and underscores')
  .refine(
    (value) => !/^[_-]/.test(value) && !/[_-]$/.test(value),
    'Username cannot start or end with a dash or underscore',
  );

export type Username = z.infer<typeof usernameSchema>;
