import { describe, expect, it } from 'vitest';

import { errorCode } from './error-code';

describe('errorCode', () => {
  it('extracts the stable code from the backend error envelope', () => {
    expect(
      errorCode({ statusCode: 403, error: 'EXPLORE_UNAVAILABLE', message: 'Explore is off' }),
    ).toBe('EXPLORE_UNAVAILABLE');
  });

  it('stringifies a non-string error field', () => {
    expect(errorCode({ error: 403 })).toBe('403');
  });

  it('returns undefined when the payload has no error field', () => {
    expect(errorCode({ statusCode: 500, message: 'boom' })).toBeUndefined();
  });

  it('returns undefined for non-object payloads', () => {
    expect(errorCode(undefined)).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode('FORUMS_WRITE_DISABLED')).toBeUndefined();
    expect(errorCode(403)).toBeUndefined();
  });
});
