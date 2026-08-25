import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .pipe(z.email({ message: 'Enter a valid email' }));

export type Email = z.infer<typeof emailSchema>;
