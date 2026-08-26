// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Toaster } from './Toaster';
import { notify, toToastDuration } from './notify';
import type { NotifyPromiseStateOptions } from './notify';

beforeAll(() => {
  // Sonner reads matchMedia for theme detection; jsdom does not implement it.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

afterEach(() => {
  act(() => {
    notify.dismiss();
  });
  cleanup();
});

describe('toToastDuration', () => {
  it('returns undefined when no duration is provided (use Toaster default)', () => {
    expect(toToastDuration(undefined)).toBeUndefined();
  });

  it('converts seconds to milliseconds for auto-dismiss', () => {
    expect(toToastDuration(5)).toBe(5000);
  });

  it('passes Infinity through for manual-only dismissal', () => {
    expect(toToastDuration(Infinity)).toBe(Infinity);
  });
});

// notify.promise used to pass raw Sonner options through, silently making its
// `duration` milliseconds while every other helper takes seconds. These assert
// the conversion happens everywhere a duration can appear in the promise API.
describe('notify.promise duration conversion', () => {
  const spyOnToastPromise = () =>
    vi
      .spyOn(toast, 'promise')
      .mockReturnValue('toast-1' as unknown as ReturnType<typeof toast.promise>);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts the top-level duration from seconds to milliseconds', () => {
    const spy = spyOnToastPromise();

    notify.promise(Promise.resolve('ok'), { loading: 'Saving…', success: 'Saved', duration: 5 });

    expect(spy).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({ loading: 'Saving…', success: 'Saved', duration: 5000 }),
    );
  });

  it('converts durations inside extended success/error state results', () => {
    const spy = spyOnToastPromise();

    notify.promise(Promise.resolve('ok'), {
      success: { message: 'Saved', duration: 2 },
      error: { message: 'Failed', duration: Infinity },
    });

    const data = spy.mock.calls[0]?.[1] as {
      success: NotifyPromiseStateOptions;
      error: NotifyPromiseStateOptions;
    };
    expect(data.success).toEqual({ message: 'Saved', duration: 2000 });
    // Infinity passes through so the error toast waits for manual dismissal.
    expect(data.error).toEqual({ message: 'Failed', duration: Infinity });
  });

  it('converts durations in results returned by success/error functions', async () => {
    const spy = spyOnToastPromise();

    notify.promise(Promise.resolve(7), {
      success: (count: number) => ({ message: `Saved ${count}`, duration: 3 }),
      error: () => Promise.resolve({ message: 'Failed', duration: 4 }),
    });

    const data = spy.mock.calls[0]?.[1] as {
      success: (d: number) => NotifyPromiseStateOptions;
      error: (d: unknown) => Promise<NotifyPromiseStateOptions>;
    };
    expect(data.success(7)).toEqual({ message: 'Saved 7', duration: 3000 });
    await expect(data.error(new Error('x'))).resolves.toEqual({
      message: 'Failed',
      duration: 4000,
    });
  });

  it('leaves plain message results and other options untouched', () => {
    const spy = spyOnToastPromise();
    const onDismiss = () => {};

    notify.promise(Promise.resolve('ok'), {
      loading: 'Working…',
      success: 'Done',
      error: 'Broke',
      onDismiss,
    });

    expect(spy).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({
        loading: 'Working…',
        success: 'Done',
        error: 'Broke',
        onDismiss,
        duration: undefined,
      }),
    );
  });

  it('passes the promise straight through when no options are given', () => {
    const spy = spyOnToastPromise();
    const promise = Promise.resolve('ok');

    notify.promise(promise);

    expect(spy).toHaveBeenCalledWith(promise);
  });
});

describe('notify + Toaster', () => {
  it('renders a toast fired through notify', async () => {
    render(<Toaster />);

    act(() => {
      notify.success('Profile updated');
    });

    expect(await screen.findByText('Profile updated')).toBeTruthy();
  });

  it('renders a custom description', async () => {
    render(<Toaster />);

    act(() => {
      notify.error('Update failed', { description: 'Please try again.' });
    });

    expect(await screen.findByText('Update failed')).toBeTruthy();
    expect(await screen.findByText('Please try again.')).toBeTruthy();
  });
});
