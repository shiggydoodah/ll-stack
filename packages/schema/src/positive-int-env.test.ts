import { describe, expect, it } from 'vitest';
import { positiveIntEnvSchema } from './positive-int-env';

const schema = positiveIntEnvSchema('KNOB', 7, 100);

describe('positiveIntEnvSchema', () => {
  it('treats absent and blank values as unset, taking the default', () => {
    // `KNOB=` is how an env file says "left alone" — it must not read as 0.
    expect(schema.parse(undefined)).toBe(7);
    expect(schema.parse('')).toBe(7);
    expect(schema.parse('   ')).toBe(7);
  });

  it('parses a decimal integer, tolerating surrounding whitespace', () => {
    expect(schema.parse('42')).toBe(42);
    expect(schema.parse(' 42 ')).toBe(42);
  });

  it('refuses a value that does not read as the number it parses to', () => {
    // 1e3 and 0x10 coerce cleanly to numbers, which is exactly the trap: an
    // operator reading the file sees something other than what boots.
    for (const raw of ['1e3', '0x10', '12.5', '-3', 'none']) {
      expect(() => schema.parse(raw)).toThrowError('whole number');
    }
  });

  it('enforces the [1, max] bounds by name', () => {
    expect(schema.parse('1')).toBe(1);
    expect(schema.parse('100')).toBe(100);
    expect(() => schema.parse('0')).toThrowError('KNOB must be between 1 and 100');
    expect(() => schema.parse('101')).toThrowError('KNOB must be between 1 and 100');
  });
});
