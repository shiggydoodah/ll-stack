// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Toaster } from './Toaster';
import { notify, toToastDuration } from './notify';

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
