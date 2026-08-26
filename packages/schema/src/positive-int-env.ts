import { z } from 'zod';

/**
 * A whole-number env knob that arrives as a string. Shared by both apps' env
 * schemas (`apps/frontend/config/env.schema.ts`,
 * `apps/backend/src/config/env.schema.ts`) so variables documented as mirrors —
 * the instance counts, the rate-limit allowances — parse under ONE set of
 * rules; two per-app copies kept in sync by a comment were the drift the env
 * schemas eliminate everywhere else.
 *
 * Parsed from the string rather than with `z.coerce.number()` so the two ways
 * an env file says "unset" behave identically: `FOO=` and an absent `FOO` both
 * take the default. Coercion turns the empty string into `0`, which then fails
 * `.positive()` and reports "greater than 0" for a variable the operator left
 * blank. Non-decimal forms (`0x10`, `1e3`, `12.5`) are refused for the same
 * reason — a value that parses to something other than what it reads as is
 * worse than a boot failure.
 */
export const positiveIntEnvSchema = (name: string, defaultValue: number, max: number) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === '') return defaultValue;
      if (!/^\d+$/.test(raw.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be a whole number (decimal digits only), or unset for ${defaultValue}.`,
        });
        return z.NEVER;
      }
      const value = Number(raw.trim());
      if (value < 1 || value > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${name} must be between 1 and ${max}.`,
        });
        return z.NEVER;
      }
      return value;
    });
