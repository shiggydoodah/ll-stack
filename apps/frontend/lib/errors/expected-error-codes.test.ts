import { describe, expect, it } from 'vitest';
import { EXPECTED_ERROR_CODES, isExpectedErrorCode } from './expected-error-codes';

const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

describe('EXPECTED_ERROR_CODES', () => {
  it('names every code in SCREAMING_SNAKE', () => {
    for (const code of Object.keys(EXPECTED_ERROR_CODES)) {
      expect(code, `code "${code}" must be SCREAMING_SNAKE`).toMatch(SCREAMING_SNAKE);
    }
  });

  it('gives every entry non-empty title, body, and recovery copy', () => {
    for (const [code, copy] of Object.entries(EXPECTED_ERROR_CODES)) {
      expect(copy.title.trim(), `${code} title`).not.toBe('');
      expect(copy.body.trim(), `${code} body`).not.toBe('');
      expect(copy.recovery.trim(), `${code} recovery`).not.toBe('');
    }
  });

  it('keeps copy leak-free — no backend statuses, endpoints, or internals', () => {
    for (const [code, copy] of Object.entries(EXPECTED_ERROR_CODES)) {
      const text = `${copy.title} ${copy.body} ${copy.recovery}`;
      expect(text, `${code} copy must not leak internals`).not.toMatch(
        /status|endpoint|gateway|backend|\/api|[45]\d{2}/i,
      );
    }
  });

  it('recognises registered codes and rejects everything else', () => {
    expect(isExpectedErrorCode('PAGE_DATA_UNAVAILABLE')).toBe(true);
    expect(isExpectedErrorCode('NOT_A_REGISTERED_CODE')).toBe(false);
    expect(isExpectedErrorCode('')).toBe(false);
    // Object prototype names must not count as registered codes.
    expect(isExpectedErrorCode('toString')).toBe(false);
  });
});
