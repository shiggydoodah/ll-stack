import { describe, expect, it } from 'vitest';
import { ExpectedError } from './expected-error';
import { parseBoundaryError } from './parse-boundary-error';

describe('parseBoundaryError', () => {
  it('classifies a registered expected digest as expected with its code', () => {
    expect(parseBoundaryError(new ExpectedError('PAGE_DATA_UNAVAILABLE'))).toEqual({
      kind: 'expected',
      code: 'PAGE_DATA_UNAVAILABLE',
    });
  });

  it('classifies the digest of a server-stripped error the same way', () => {
    // In production the boundary receives a generic Error whose only surviving
    // detail is the digest — classification must not depend on the class.
    const stripped = new Error('An error occurred in the Server Components render.') as Error & {
      digest?: string;
    };
    stripped.digest = 'expected:PAGE_DATA_UNAVAILABLE';
    expect(parseBoundaryError(stripped)).toEqual({
      kind: 'expected',
      code: 'PAGE_DATA_UNAVAILABLE',
    });
  });

  it('fails safe: an expected prefix with an unregistered code is unexpected', () => {
    const error = new Error('boom') as Error & { digest?: string };
    error.digest = 'expected:NOT_IN_CATALOG';
    expect(parseBoundaryError(error)).toEqual({
      kind: 'unexpected',
      digest: 'expected:NOT_IN_CATALOG',
    });
  });

  it('classifies a digest-less error as unexpected with no digest', () => {
    expect(parseBoundaryError(new Error('boom'))).toEqual({ kind: 'unexpected' });
  });

  it('treats an empty-string digest as absent', () => {
    const error = new Error('boom') as Error & { digest?: string };
    error.digest = '';
    expect(parseBoundaryError(error)).toEqual({ kind: 'unexpected' });
  });

  it('carries a foreign digest through for display as the reference code', () => {
    const error = new Error('boom') as Error & { digest?: string };
    error.digest = '1234567890';
    expect(parseBoundaryError(error)).toEqual({ kind: 'unexpected', digest: '1234567890' });
  });
});
