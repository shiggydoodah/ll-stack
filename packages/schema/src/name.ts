import { z } from 'zod';

export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 120;

// Full name captured at signup. Deliberately permissive about characters —
// names legitimately contain hyphens, apostrophes, and non-Latin scripts —
// so only trim + bound the length here.
export const nameSchema = z
  .string()
  .trim()
  .min(MIN_NAME_LENGTH, 'Name is required')
  .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`);

export type Name = z.infer<typeof nameSchema>;
