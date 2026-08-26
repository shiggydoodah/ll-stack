import { describe, expect, it } from 'vitest';

import { REDACTED_LOG_VALUE, sanitizeLogRecord } from './log-redaction';

// `__proto__` is the one key an accumulator built with plain assignment cannot
// hold, and this sanitizer is where every untrusted record enters the logging
// pipeline (`/api/client-logs` sanitizes bodies straight off `JSON.parse`, and
// the backend wires this in as `formatters.log`). The cases below pin both
// halves: the field survives as data, and it never becomes a prototype.
describe('sanitizeLogRecord and a literal __proto__ key', () => {
  /**
   * `JSON.parse` hands `__proto__` back as an ORDINARY OWN PROPERTY — the
   * literal-syntax special case does not apply to it — which is exactly why a
   * record parsed from a request body can carry one at all.
   */
  const parseWithProtoKey = (): Record<string, unknown> =>
    JSON.parse(
      '{"message":"hi","event":"client.session.start","__proto__":{"polluted":1}}',
    ) as Record<string, unknown>;

  it('keeps the field as data instead of silently dropping it', () => {
    const sanitized = sanitizeLogRecord(parseWithProtoKey());

    expect(Object.keys(sanitized)).toContain('__proto__');
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(true);
    // The value has to survive the round trip the sink actually performs.
    expect(JSON.parse(JSON.stringify(sanitized))['__proto__']).toEqual({ polluted: 1 });
  });

  it('leaves the sanitized record on a clean prototype', () => {
    const sanitized = sanitizeLogRecord(parseWithProtoKey());

    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
    expect((sanitized as { polluted?: unknown }).polluted).toBeUndefined();
    // Nothing escaped onto the shared prototype either.
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('still redacts a sensitive key that arrives as __proto__-adjacent data', () => {
    const record = JSON.parse('{"__proto__":{"x":1},"password":"hunter2"}') as Record<
      string,
      unknown
    >;
    const sanitized = sanitizeLogRecord(record);

    expect(sanitized.password).toBe(REDACTED_LOG_VALUE);
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(true);
  });

  it('holds for a nested object too, not just the record root', () => {
    const record = JSON.parse('{"context":{"__proto__":{"polluted":1},"kept":"yes"}}') as Record<
      string,
      unknown
    >;
    const nested = sanitizeLogRecord(record).context as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(nested, '__proto__')).toBe(true);
    expect(nested.kept).toBe('yes');
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
  });
});
