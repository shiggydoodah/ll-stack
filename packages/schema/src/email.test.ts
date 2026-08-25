import { describe, expect, it } from 'vitest';

import { emailSchema } from './email';

describe('emailSchema', () => {
  it('normalizes a valid email address', () => {
    expect(emailSchema.parse(' PERSON@Example.COM ')).toBe('person@example.com');
  });

  it('rejects an invalid email address', () => {
    expect(() => emailSchema.parse('not-an-email')).toThrowError('Enter a valid email');
  });

  it('rejects a blank email address after trimming whitespace', () => {
    expect(() => emailSchema.parse('   ')).toThrowError('Email is required');
  });
});
