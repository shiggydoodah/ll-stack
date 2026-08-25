import { describe, expect, it } from 'vitest';
import { isBenignResizeObserverError } from './benign-browser-errors';

describe('isBenignResizeObserverError', () => {
  it('matches both ResizeObserver loop wordings', () => {
    expect(
      isBenignResizeObserverError('ResizeObserver loop completed with undelivered notifications.'),
    ).toBe(true);
    expect(isBenignResizeObserverError('ResizeObserver loop limit exceeded')).toBe(true);
  });

  it('matches when the wording carries an engine prefix', () => {
    expect(isBenignResizeObserverError('Uncaught ResizeObserver loop limit exceeded')).toBe(true);
  });

  it('reads the message off an Error instance', () => {
    expect(isBenignResizeObserverError(new Error('ResizeObserver loop limit exceeded'))).toBe(true);
  });

  it('rejects genuine errors and non-error values', () => {
    expect(isBenignResizeObserverError(new Error('gateway exploded'))).toBe(false);
    expect(isBenignResizeObserverError('ReferenceError: ResizeObserver is not defined')).toBe(
      false,
    );
    expect(isBenignResizeObserverError('')).toBe(false);
    expect(isBenignResizeObserverError(null)).toBe(false);
    expect(isBenignResizeObserverError(undefined)).toBe(false);
    expect(isBenignResizeObserverError(42)).toBe(false);
  });
});
