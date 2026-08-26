// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BannerStack } from './BannerStack';
import type { GlobalBannerData } from './BannerStack';

afterEach(cleanup);

const banners: GlobalBannerData[] = [
  { id: 'a', title: 'First', message: 'first body' },
  { id: 'b', tone: 'red', title: 'Second', message: 'second body' },
];

describe('BannerStack', () => {
  it('renders nothing when there are no banners', () => {
    const { container } = render(<BannerStack banners={[]} onDismiss={() => {}} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders one Banner per item', () => {
    render(<BannerStack banners={banners} onDismiss={() => {}} />);

    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('calls onDismiss with the banner id when a dismiss control is clicked', () => {
    const onDismiss = vi.fn();
    render(<BannerStack banners={banners} onDismiss={onDismiss} />);

    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissButtons[1] as HTMLElement);

    expect(onDismiss).toHaveBeenCalledWith('b');
  });
});
