// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ActionModal } from './ActionModal';

beforeAll(() => {
  // Radix's scroll-lock measures layout via ResizeObserver; jsdom lacks it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const noop = () => {};

describe('ActionModal confirm', () => {
  it('fires onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onConfirm = vi.fn();
    render(<ActionModal open onOpenChange={noop} title="Confirm thing" onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onConfirm exactly once when Enter is pressed in the body', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onConfirm = vi.fn();
    render(
      <ActionModal open onOpenChange={noop} title="Confirm thing" onConfirm={onConfirm}>
        <input aria-label="field" />
      </ActionModal>,
    );

    await user.type(screen.getByLabelText('field'), '{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ActionModal cancel', () => {
  it('fires onCancel when provided', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ActionModal
        open
        onOpenChange={noop}
        title="Confirm thing"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('falls back to onOpenChange(false) when onCancel is omitted', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(<ActionModal open onOpenChange={onOpenChange} title="Confirm thing" onConfirm={noop} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ActionModal pending', () => {
  it('does not close on Escape while pending', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(
      <ActionModal
        open
        pending
        onOpenChange={onOpenChange}
        title="Confirm thing"
        onConfirm={noop}
      />,
    );

    await user.keyboard('{Escape}');

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows the confirm spinner and disables cancel', () => {
    render(<ActionModal open pending onOpenChange={noop} title="Confirm thing" onConfirm={noop} />);

    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);

    const busy = document.querySelector('button[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.textContent).toContain('Confirm');
  });

  it('does not fire onConfirm on Enter while pending', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onConfirm = vi.fn();
    render(
      <ActionModal open pending onOpenChange={noop} title="Confirm thing" onConfirm={onConfirm}>
        <input aria-label="field" />
      </ActionModal>,
    );

    await user.type(screen.getByLabelText('field'), '{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(0);
  });
});

describe('ActionModal confirmDisabled', () => {
  it('does not fire onConfirm on Enter while the confirm is disabled', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onConfirm = vi.fn();
    render(
      <ActionModal
        open
        confirmDisabled
        onOpenChange={noop}
        title="Confirm thing"
        onConfirm={onConfirm}
      >
        <input aria-label="field" />
      </ActionModal>,
    );

    await user.type(screen.getByLabelText('field'), '{Enter}');

    expect(onConfirm).toHaveBeenCalledTimes(0);
  });
});

describe('ActionModal customisation', () => {
  it('renders a custom confirm label and icon', () => {
    render(
      <ActionModal
        open
        onOpenChange={noop}
        title="Delete your account"
        confirmLabel="Delete my account"
        confirmTone="red"
        confirmIcon={<svg data-testid="confirm-icon" />}
        onConfirm={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete my account' })).not.toBeNull();
    expect(screen.getByTestId('confirm-icon')).not.toBeNull();
  });

  it('echoes the title into an sr-only description when none is given', () => {
    render(<ActionModal open onOpenChange={noop} title="Danger zone" onConfirm={noop} />);

    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).not.toBeNull();
    expect(srOnly?.textContent).toBe('Danger zone');
  });
});
