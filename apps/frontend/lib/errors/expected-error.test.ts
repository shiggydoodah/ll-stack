import { describe, expect, it } from 'vitest';
import { EXPECTED_DIGEST_PREFIX, ExpectedError } from './expected-error';

describe('ExpectedError', () => {
  it('sets the structured digest that survives production message-stripping', () => {
    const error = new ExpectedError('PAGE_DATA_UNAVAILABLE');
    expect(error.digest).toBe('expected:PAGE_DATA_UNAVAILABLE');
    expect(error.digest.startsWith(EXPECTED_DIGEST_PREFIX)).toBe(true);
  });

  it('is a named Error subclass boundaries receive as-is when thrown client-side', () => {
    const error = new ExpectedError('PAGE_DATA_UNAVAILABLE');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ExpectedError');
  });

  it('never carries user-facing copy in the message (the catalog is the copy source)', () => {
    const error = new ExpectedError('PAGE_DATA_UNAVAILABLE');
    expect(error.message).toBe('Expected error: PAGE_DATA_UNAVAILABLE');
  });
});
