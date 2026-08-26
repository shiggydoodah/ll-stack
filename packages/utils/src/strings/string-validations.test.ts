import { describe, expect, it } from 'vitest';

import { isBase64Format } from './string-validations';

describe('isBase64Format', () => {
  it('accepts non-empty base64url-shaped strings', () => {
    expect(isBase64Format('abc123-_XYZ')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isBase64Format('')).toBe(false);
  });

  it('rejects characters outside the base64url alphabet', () => {
    expect(isBase64Format('abc@123')).toBe(false);
    expect(isBase64Format('abc+123')).toBe(false);
    expect(isBase64Format('abc/123')).toBe(false);
    expect(isBase64Format('abc=')).toBe(false);
  });

  it('accepts the expected base64url length when bytes are provided', () => {
    expect(isBase64Format('a'.repeat(43), 32)).toBe(true);
  });

  it('rejects valid characters with the wrong encoded length when bytes are provided', () => {
    expect(isBase64Format('a'.repeat(42), 32)).toBe(false);
    expect(isBase64Format('a'.repeat(44), 32)).toBe(false);
  });
});
