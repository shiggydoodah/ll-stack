// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { BannerStack } from '../../components/banner';
import type { GlobalBannerData } from '../../components/banner';
import { useNotifications } from './NotificationContext';
import type { NotificationContextValue } from './NotificationContext';
import { NotificationProvider } from './NotificationProvider';
import { createMemoryAdapter } from './storage';

/** Connects the provider context to the now-presentational BannerStack. */
const Banners = () => {
  const { banners, dismissBanner } = useNotifications();
  return <BannerStack banners={banners} onDismiss={dismissBanner} />;
};

beforeAll(() => {
  // Sonner's Toaster (mounted by the provider) reads matchMedia.
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

afterEach(cleanup);

const banners: GlobalBannerData[] = [
  { id: 'b1', title: 'One', message: 'first banner' },
  { id: 'b2', title: 'Two', message: 'second banner' },
];

describe('useNotifications', () => {
  it('throws when used outside a NotificationProvider', () => {
    const Probe = () => {
      useNotifications();
      return null;
    };

    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      'useNotifications must be used within a NotificationProvider.',
    );
  });
});

describe('NotificationProvider', () => {
  it('renders active banners and dismisses + persists by id', async () => {
    const adapter = createMemoryAdapter();

    render(
      <NotificationProvider banners={banners} storage={adapter}>
        <Banners />
      </NotificationProvider>,
    );

    expect(screen.getByText('One')).toBeTruthy();
    expect(screen.getByText('Two')).toBeTruthy();

    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissButtons[0] as HTMLElement);

    await waitFor(() => expect(screen.queryByText('One')).toBeNull());
    expect(screen.getByText('Two')).toBeTruthy();
    expect(adapter.isDismissed('b1')).toBe(true);
  });

  it('filters out banners already dismissed in storage on mount', async () => {
    const adapter = createMemoryAdapter(['b1']);

    render(
      <NotificationProvider banners={banners} storage={adapter}>
        <Banners />
      </NotificationProvider>,
    );

    await waitFor(() => expect(screen.queryByText('One')).toBeNull());
    expect(screen.getByText('Two')).toBeTruthy();
  });

  it('keeps the context value referentially stable across re-renders with banners omitted', () => {
    const seen: NotificationContextValue[] = [];
    const Probe = () => {
      seen.push(useNotifications());
      return null;
    };
    const adapter = createMemoryAdapter();
    const App = ({ tick }: { tick: number }) => (
      <NotificationProvider storage={adapter}>
        <span data-testid="tick">{tick}</span>
        <Probe />
      </NotificationProvider>
    );

    const { rerender } = render(<App tick={1} />);
    rerender(<App tick={2} />);
    rerender(<App tick={3} />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    // Every render observed the exact same context value object — the omitted
    // banners prop must not manufacture a new `[]` (and thus a new value) per
    // provider-parent re-render.
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]?.banners).toHaveLength(0);
  });

  it('returns the input banners array unchanged when nothing is dismissed', () => {
    const seen: NotificationContextValue[] = [];
    const Probe = () => {
      seen.push(useNotifications());
      return null;
    };
    const adapter = createMemoryAdapter();
    const App = ({ tick }: { tick: number }) => (
      <NotificationProvider banners={banners} storage={adapter}>
        <span data-testid="tick">{tick}</span>
        <Probe />
      </NotificationProvider>
    );

    const { rerender } = render(<App tick={1} />);
    rerender(<App tick={2} />);

    // Nothing was filtered out, so the context exposes the caller's array by
    // reference and the memoized value survives the parent re-render.
    expect(seen[0]?.banners).toBe(banners);
    expect(new Set(seen).size).toBe(1);
  });

  it('always shows non-dismissible banners even when their id is stored', async () => {
    const adapter = createMemoryAdapter(['b3']);

    render(
      <NotificationProvider
        banners={[{ id: 'b3', title: 'Outage', dismissible: false }]}
        storage={adapter}
      >
        <Banners />
      </NotificationProvider>,
    );

    expect(screen.getByText('Outage')).toBeTruthy();
    // Give the hydration effect a chance to run; banner must remain.
    await waitFor(() => expect(screen.getByText('Outage')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});
