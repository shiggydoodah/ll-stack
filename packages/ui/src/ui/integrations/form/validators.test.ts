import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeBlurValidator, makeZodFormValidator } from './validators';

describe('makeBlurValidator', () => {
  const schema = z.string().min(3, 'Too short');

  it('returns undefined when value is valid', () => {
    expect(makeBlurValidator(schema)({ value: 'abc' })).toBeUndefined();
  });

  it('returns the first Zod issue message when value is invalid', () => {
    expect(makeBlurValidator(schema)({ value: 'ab' })).toBe('Too short');
  });
});

describe('makeZodFormValidator', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name required'),
    seats: z.number().min(1, 'At least one seat'),
  });

  it('returns undefined when all fields are valid', () => {
    const validate = makeZodFormValidator(schema);
    expect(validate({ value: { name: 'Alice', seats: 20 } })).toBeUndefined();
  });

  it('returns field errors keyed by field name', () => {
    const validate = makeZodFormValidator(schema);
    const result = validate({ value: { name: '', seats: 20 } });
    expect(result).toEqual({ fields: { name: 'Name required' } });
  });

  it('records only the first error per field when multiple issues exist for the same key', () => {
    const multiIssueSchema = z.object({ val: z.string() }).superRefine((data, ctx) => {
      ctx.addIssue({ code: 'custom', path: ['val'], message: 'First error' });
      ctx.addIssue({ code: 'custom', path: ['val'], message: 'Second error' });
    });
    const validate = makeZodFormValidator(multiIssueSchema);
    const result = validate({ value: { val: '' } });
    expect(result).toEqual({ fields: { val: 'First error' } });
  });

  it('coerces numeric array-index path keys to strings', () => {
    const arraySchema = z.object({ items: z.array(z.string().min(1, 'Item required')) });
    const validate = makeZodFormValidator(arraySchema);
    const result = validate({ value: { items: [''] } });
    expect(result?.fields).toBeDefined();
    expect(typeof Object.keys(result!.fields!)[0]).toBe('string');
  });

  it('surfaces pathless (root-level) Zod errors in the form property', () => {
    const refinedSchema = z
      .object({ password: z.string(), confirm: z.string() })
      .superRefine((data, ctx) => {
        if (data.password !== data.confirm) {
          ctx.addIssue({ code: 'custom', message: 'Passwords do not match' });
        }
      });
    const validate = makeZodFormValidator(refinedSchema);
    const result = validate({ value: { password: 'abc', confirm: 'xyz' } });
    expect(result).toEqual({ form: 'Passwords do not match' });
  });

  it('includes both form and fields when a pathless error and field errors coexist', () => {
    const mixedSchema = z
      .object({ name: z.string().min(1, 'Name required'), confirm: z.string() })
      .superRefine((data, ctx) => {
        ctx.addIssue({ code: 'custom', message: 'Root error' });
      });
    const validate = makeZodFormValidator(mixedSchema);
    const result = validate({ value: { name: '', confirm: 'x' } });
    expect(result?.form).toBe('Root error');
    expect(result?.fields?.name).toBe('Name required');
  });

  it('uses the first pathless error message when multiple root issues exist', () => {
    const multiRootSchema = z.object({ x: z.string() }).superRefine((_data, ctx) => {
      ctx.addIssue({ code: 'custom', message: 'First root error' });
      ctx.addIssue({ code: 'custom', message: 'Second root error' });
    });
    const validate = makeZodFormValidator(multiRootSchema);
    const result = validate({ value: { x: 'y' } });
    expect(result?.form).toBe('First root error');
  });
});
