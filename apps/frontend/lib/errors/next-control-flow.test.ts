import { describe, expect, it } from 'vitest';
import { isNextControlFlowSignal } from './next-control-flow';

const digestError = (digest: string): Error & { digest: string } => {
  const error = new Error('signal') as Error & { digest: string };
  error.digest = digest;
  return error;
};

describe('isNextControlFlowSignal', () => {
  it('matches every control-flow family carried on digest', () => {
    for (const digest of [
      'NEXT_REDIRECT;replace;/login;307;',
      'NEXT_NOT_FOUND',
      'NEXT_HTTP_ERROR_FALLBACK;404',
    ]) {
      expect(isNextControlFlowSignal(digestError(digest))).toBe(true);
    }
  });

  it('falls back to the message for Errors without a digest', () => {
    expect(isNextControlFlowSignal(new Error('NEXT_REDIRECT;push;/feed;307;'))).toBe(true);
  });

  it('matches plain-string signals', () => {
    expect(isNextControlFlowSignal('NEXT_NOT_FOUND')).toBe(true);
  });

  it('rejects genuine failures and non-signal values', () => {
    expect(isNextControlFlowSignal(new Error('gateway exploded'))).toBe(false);
    expect(isNextControlFlowSignal(digestError('abc1234567'))).toBe(false);
    expect(isNextControlFlowSignal('plain rejection reason')).toBe(false);
    expect(isNextControlFlowSignal(null)).toBe(false);
    expect(isNextControlFlowSignal(undefined)).toBe(false);
    expect(isNextControlFlowSignal(42)).toBe(false);
  });
});
