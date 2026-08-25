import { describe, expect, it } from 'vitest';

import { passwordSchema } from './password';

describe('passwordSchema', () => {
  it('accepts a password with the required length, letter, and number', () => {
    expect(passwordSchema.parse('password1')).toBe('password1');
  });

  it('rejects a password without a number', () => {
    expect(() => passwordSchema.parse('password')).toThrowError(
      'Password must include at least one number',
    );
  });

  it('rejects a password without a letter', () => {
    expect(() => passwordSchema.parse('12345678')).toThrowError(
      'Password must include at least one letter',
    );
  });

  it('rejects a password shorter than eight characters', () => {
    expect(() => passwordSchema.parse('pass1')).toThrowError(
      'Password must be at least 8 characters',
    );
  });
});
