import { describe, expect, it } from 'vitest';

import { BASE64_TOKEN_LENGTH, base64TokenSchema } from './token';

describe('base64TokenSchema', () => {
  it('accepts a 32-byte base64url token shape', () => {
    const token = 'a'.repeat(BASE64_TOKEN_LENGTH);

    expect(base64TokenSchema.parse(token)).toBe(token);
  });

  it('rejects tokens with characters outside the base64url alphabet', () => {
    expect(() => base64TokenSchema.parse('a'.repeat(42) + '+')).toThrowError('Enter a valid token');
  });

  it('rejects valid base64url strings with the wrong token length', () => {
    expect(() => base64TokenSchema.parse('a'.repeat(BASE64_TOKEN_LENGTH - 1))).toThrowError(
      'Enter a valid token',
    );
  });
});
