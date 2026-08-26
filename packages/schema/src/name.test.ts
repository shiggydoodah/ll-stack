import { describe, expect, it } from 'vitest';

import { MAX_NAME_LENGTH, nameSchema } from './name';

describe('nameSchema', () => {
  it('trims surrounding whitespace', () => {
    expect(nameSchema.parse('  Ada Whitcombe  ')).toBe('Ada Whitcombe');
  });

  it('accepts names with punctuation and non-Latin characters', () => {
    expect(nameSchema.parse("Seán O'Brien-Løvström")).toBe("Seán O'Brien-Løvström");
  });

  it('rejects a blank name after trimming', () => {
    expect(() => nameSchema.parse('   ')).toThrowError('Name is required');
  });

  it(`rejects names longer than ${MAX_NAME_LENGTH} characters`, () => {
    expect(() => nameSchema.parse('a'.repeat(MAX_NAME_LENGTH + 1))).toThrowError(
      `Name must be at most ${MAX_NAME_LENGTH} characters`,
    );
  });
});
