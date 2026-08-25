// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { PasswordStrengthMeter, type PasswordStrength } from './PasswordStrengthMeter';

const roots: Root[] = [];

const render = async (strength: PasswordStrength): Promise<HTMLElement> => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<PasswordStrengthMeter strength={strength} />);
  });
  return container;
};

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount();
  });
  roots.length = 0;
  document.body.replaceChildren();
});

const getLabel = (container: HTMLElement): string =>
  container.querySelector('[aria-live]')?.textContent ?? '';

const filledSegments = (container: HTMLElement): number => {
  const meter = container.querySelector('[data-testid="password-strength"]');
  if (!meter) throw new Error('meter not found');
  return meter.querySelectorAll('[data-filled="true"]').length;
};

describe('PasswordStrengthMeter', () => {
  it('shows no label with no filled segments for strength 0', async () => {
    const container = await render(0);
    expect(getLabel(container)).toBe('');
    expect(filledSegments(container)).toBe(0);
  });

  it('shows "Very weak" with 1 filled segment for strength 1', async () => {
    const container = await render(1);
    expect(getLabel(container)).toBe('Very weak');
    expect(filledSegments(container)).toBe(1);
  });

  it('shows "Weak" with 2 filled segments for strength 2', async () => {
    const container = await render(2);
    expect(getLabel(container)).toBe('Weak');
    expect(filledSegments(container)).toBe(2);
  });

  it('shows "Medium" with 3 filled segments for strength 3', async () => {
    const container = await render(3);
    expect(getLabel(container)).toBe('Medium');
    expect(filledSegments(container)).toBe(3);
  });

  it('shows "Strong" with 4 filled segments for strength 4', async () => {
    const container = await render(4);
    expect(getLabel(container)).toBe('Strong');
    expect(filledSegments(container)).toBe(4);
  });

  it('shows "Very strong" with 5 filled segments for strength 5', async () => {
    const container = await render(5);
    expect(getLabel(container)).toBe('Very strong');
    expect(filledSegments(container)).toBe(5);
  });

  it('renders the strength label inside an aria-live region', async () => {
    const container = await render(3);
    const liveRegion = container.querySelector('[aria-live]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
  });

  it('renders the bar segments as aria-hidden', async () => {
    const container = await render(2);
    const bar = container.querySelector('[aria-hidden="true"]');
    expect(bar).not.toBeNull();
  });

  it('renders 5 bar segments total', async () => {
    const container = await render(3);
    const meter = container.querySelector('[data-testid="password-strength"]');
    const segments = meter?.querySelectorAll('.h-1.flex-1');
    expect(segments?.length).toBe(5);
  });

  it('renders rightContent when provided', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(<PasswordStrengthMeter strength={3} rightContent="12/32" />);
    });
    expect(container.textContent).toContain('12/32');
  });

  it('does not render the rightContent slot when undefined', async () => {
    const container = await render(2);
    const rightSlot = container.querySelector('[data-testid="password-strength-right-content"]');
    expect(rightSlot).toBeNull();
  });
});
