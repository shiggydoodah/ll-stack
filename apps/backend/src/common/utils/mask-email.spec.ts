import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('ada@example.com')).toBe('a***@example.com');
    expect(maskEmail('marcus.reid@sub.example.co.uk')).toBe('m***@sub.example.co.uk');
  });

  it('hides the local part length', () => {
    expect(maskEmail('a@example.com')).toBe(maskEmail('abcdefghijklmnop@example.com'));
  });

  it('masks completely when the value is not recognisably local@domain', () => {
    // A stored value that never went through the register DTO must not fall
    // through unmasked just because it failed to parse.
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('ada@')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });

  it('masks the local part of an address containing more than one @', () => {
    // Splitting on the LAST @ is what the addressing spec allows in a quoted
    // local part; the domain is whatever follows it.
    expect(maskEmail('"weird@local"@example.com')).toBe('"***@example.com');
  });
});
