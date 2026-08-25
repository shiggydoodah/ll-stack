import { describe, it, expect } from 'vitest';
import { generateCorrelationId, isValidCorrelationId, normalizeCorrelationId } from './correlation';

describe('correlation', () => {
  it('generates ids that satisfy the backend request-id shape', () => {
    const id = generateCorrelationId();
    expect(isValidCorrelationId(id)).toBe(true);
    // Same constraint as apps/backend request-id.middleware.ts VALID_REQUEST_ID.
    expect(id).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });

  it('accepts well-formed ids', () => {
    expect(isValidCorrelationId('abc-123_4.5')).toBe(true);
    expect(isValidCorrelationId('a'.repeat(128))).toBe(true);
  });

  it('rejects malformed, empty, overlong, or unsafe ids', () => {
    expect(isValidCorrelationId('')).toBe(false);
    expect(isValidCorrelationId(null)).toBe(false);
    expect(isValidCorrelationId(undefined)).toBe(false);
    expect(isValidCorrelationId('a'.repeat(129))).toBe(false);
    expect(isValidCorrelationId('has space')).toBe(false);
    expect(isValidCorrelationId('inject\r\nheader')).toBe(false);
  });

  it('normalizes a valid inbound id unchanged', () => {
    expect(normalizeCorrelationId('trusted-id_1')).toBe('trusted-id_1');
  });

  it('mints a fresh valid id when the inbound value is untrusted', () => {
    const normalized = normalizeCorrelationId('bad value!');
    expect(normalized).not.toBe('bad value!');
    expect(isValidCorrelationId(normalized)).toBe(true);
  });
});
