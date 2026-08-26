import { describe, expect, it } from 'vitest';

import { base64TokenLength, createBase64TokenSchema } from './token';

describe('base64TokenLength', () => {
  it('returns the unpadded base64url character length for a byte count', () => {
    expect(base64TokenLength(32)).toBe(43);
    expect(base64TokenLength(48)).toBe(64);
  });
});

describe('createBase64TokenSchema', () => {
  const schema = createBase64TokenSchema(32);

  it('accepts a token of the encoded length for its byte size', () => {
    const token = 'a'.repeat(base64TokenLength(32));

    expect(schema.parse(token)).toBe(token);
  });

  it('rejects tokens with characters outside the base64url alphabet', () => {
    expect(() => schema.parse('a'.repeat(42) + '+')).toThrowError('Enter a valid token');
  });

  it('rejects valid base64url strings with the wrong token length', () => {
    expect(() => schema.parse('a'.repeat(base64TokenLength(32) - 1))).toThrowError(
      'Enter a valid token',
    );
  });

  it('sizes the length check from the byte length it is given', () => {
    const longSchema = createBase64TokenSchema(48);
    const longToken = 'a'.repeat(base64TokenLength(48));

    expect(longSchema.parse(longToken)).toBe(longToken);
    expect(() => longSchema.parse('a'.repeat(base64TokenLength(32)))).toThrowError(
      'Enter a valid token',
    );
  });
});
