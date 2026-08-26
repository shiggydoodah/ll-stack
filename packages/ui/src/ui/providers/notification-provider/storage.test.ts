// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalStorageAdapter, DEFAULT_DISMISSED_BANNERS_KEY } from './storage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createLocalStorageAdapter', () => {
  it('round-trips dismissals through localStorage', () => {
    const adapter = createLocalStorageAdapter();

    adapter.dismiss('b1');
    adapter.dismiss('b2');

    expect(adapter.isDismissed('b1')).toBe(true);
    expect(adapter.getDismissed().sort()).toEqual(['b1', 'b2']);
    // A fresh adapter over the same key sees the persisted ids.
    expect(createLocalStorageAdapter().isDismissed('b2')).toBe(true);
  });

  it('treats corrupt JSON as no dismissals instead of throwing', () => {
    window.localStorage.setItem(DEFAULT_DISMISSED_BANNERS_KEY, '{not valid json');
    const adapter = createLocalStorageAdapter();

    expect(adapter.getDismissed()).toEqual([]);
    expect(adapter.isDismissed('b1')).toBe(false);
    // Dismissing over the corrupt payload starts a clean list.
    adapter.dismiss('b1');
    expect(adapter.getDismissed()).toEqual(['b1']);
  });

  it('ignores non-array payloads', () => {
    window.localStorage.setItem(
      DEFAULT_DISMISSED_BANNERS_KEY,
      JSON.stringify({ sneaky: 'object' }),
    );

    expect(createLocalStorageAdapter().getDismissed()).toEqual([]);
  });

  it('drops non-string entries from an otherwise valid array', () => {
    window.localStorage.setItem(
      DEFAULT_DISMISSED_BANNERS_KEY,
      JSON.stringify(['b1', 42, null, { id: 'b2' }]),
    );

    expect(createLocalStorageAdapter().getDismissed()).toEqual(['b1']);
  });

  it('swallows quota-exceeded writes — dismissal is best-effort', () => {
    const adapter = createLocalStorageAdapter();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => adapter.dismiss('b1')).not.toThrow();
    // The write never landed, so reads (which go back to storage) stay empty.
    expect(adapter.isDismissed('b1')).toBe(false);
  });

  it('treats a throwing getItem (storage disabled) as no dismissals', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    const adapter = createLocalStorageAdapter();
    expect(adapter.getDismissed()).toEqual([]);
    expect(adapter.isDismissed('b1')).toBe(false);
  });

  it('is inert without a window (SSR guard)', () => {
    // `vi.stubGlobal('window', undefined)` makes `typeof window` evaluate to
    // 'undefined', which is exactly what the adapter's SSR guard checks.
    vi.stubGlobal('window', undefined);
    const adapter = createLocalStorageAdapter();

    expect(adapter.getDismissed()).toEqual([]);
    expect(() => adapter.dismiss('b1')).not.toThrow();
    expect(adapter.isDismissed('b1')).toBe(false);
  });

  it('scopes persistence to the provided key', () => {
    const adapter = createLocalStorageAdapter('custom-key');
    adapter.dismiss('b1');

    expect(window.localStorage.getItem('custom-key')).toBe(JSON.stringify(['b1']));
    expect(window.localStorage.getItem(DEFAULT_DISMISSED_BANNERS_KEY)).toBeNull();
  });
});
