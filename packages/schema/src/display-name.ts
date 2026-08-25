import { z } from 'zod';

export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 20;

// Display name is optional during profile setup; this schema validates it only
// when a value is present. Letters, numbers and spaces (mirrors the backend
// DISPLAY_NAME_PATTERN), 2–20 chars, trimmed.
export const displayNameSchema = z
  .string()
  .trim()
  .min(
    MIN_DISPLAY_NAME_LENGTH,
    `Display name must be at least ${MIN_DISPLAY_NAME_LENGTH} characters`,
  )
  .max(
    MAX_DISPLAY_NAME_LENGTH,
    `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
  )
  .regex(/^[a-zA-Z0-9 ]+$/, 'Use only letters, numbers and spaces');

export type DisplayName = z.infer<typeof displayNameSchema>;
