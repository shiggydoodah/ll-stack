// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Banner } from './Banner';

afterEach(cleanup);

describe('Banner', () => {
  it('renders the title and message body', () => {
    render(<Banner title="Heads up">Maintenance tonight</Banner>);

    expect(screen.getByText('Heads up')).toBeTruthy();
    expect(screen.getByText('Maintenance tonight')).toBeTruthy();
  });

  it('renders a dismiss control when onDismiss is provided and calls it when clicked', () => {
    const onDismiss = vi.fn();
    render(<Banner title="Hi" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders no dismiss control when there is no onDismiss handler', () => {
    // A dismiss button with nothing to call would be a no-op affordance.
    render(<Banner title="Hi" />);

    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('renders no dismiss control for an explicit dismissible without a handler', () => {
    render(<Banner title="Hi" dismissible />);

    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('hides the dismiss control when dismissible is false even with a handler', () => {
    render(<Banner title="Hi" dismissible={false} onDismiss={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('renders the action slot', () => {
    render(
      <Banner tone="purple" title="Promo" action={<button type="button">Start trial</button>}>
        14 day free trial
      </Banner>,
    );

    expect(screen.getByRole('button', { name: 'Start trial' })).toBeTruthy();
  });

  it('uses role="alert" for red/amber tones and role="status" otherwise', () => {
    const { rerender } = render(<Banner tone="red" title="Error" />);
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(<Banner tone="blue" title="Info" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('applies the tone and variant classes', () => {
    const { container } = render(<Banner tone="green" variant="solid" title="Saved" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('bg-tone-green');
  });
});
