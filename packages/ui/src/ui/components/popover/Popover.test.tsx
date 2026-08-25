// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from './Popover';

beforeAll(() => {
  // Radix's positioning (Popper) observes the trigger/content; jsdom lacks these.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

// A minimal, reusable popover with a button trigger and text content. `extra` is
// spread onto the Popover root so individual tests can pass open/onOpenChange/etc.
const renderPopover = (extra: Record<string, unknown> = {}, content = <p>Account settings</p>) =>
  render(
    <Popover {...extra}>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>{content}</PopoverContent>
    </Popover>,
  );

// ── Open / close ────────────────────────────────────────────────────────────────

describe('open and close', () => {
  it('does not render content until opened', () => {
    renderPopover();
    expect(screen.queryByText('Account settings')).toBeNull();
  });

  it('opens when the trigger is clicked (uncontrolled)', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByText('Account settings')).not.toBeNull();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByText('Account settings')).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Account settings')).toBeNull();
  });

  it('closes when a PopoverClose inside the content is activated', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <PopoverClose>Dismiss</PopoverClose>
        </PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});

// ── Controlled mode ───────────────────────────────────────────────────────────

describe('controlled mode', () => {
  it('reflects the external open prop', () => {
    const { rerender } = render(
      <Popover open={false} onOpenChange={() => {}}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <p>Account settings</p>
        </PopoverContent>
      </Popover>,
    );
    expect(screen.queryByText('Account settings')).toBeNull();

    rerender(
      <Popover open onOpenChange={() => {}}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <p>Account settings</p>
        </PopoverContent>
      </Popover>,
    );
    expect(screen.queryByText('Account settings')).not.toBeNull();
  });

  it('calls onOpenChange when opening and closing', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderPopover({ onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ── Accessibility ───────────────────────────────────────────────────────────────

describe('accessibility', () => {
  it('marks the trigger as a dialog control', () => {
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes the content as a dialog and toggles aria-expanded', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

// ── Placement, arrow, className ──────────────────────────────────────────────────

describe('content configuration', () => {
  it('forwards side and align to the content element', () => {
    render(
      <Popover open onOpenChange={() => {}}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent side="right" align="end" avoidCollisions={false}>
          <p>Account settings</p>
        </PopoverContent>
      </Popover>,
    );
    const content = screen.getByRole('dialog');
    expect(content.getAttribute('data-side')).toBe('right');
    expect(content.getAttribute('data-align')).toBe('end');
  });

  it('renders an arrow only when showArrow is set', () => {
    const { rerender } = render(
      <Popover open onOpenChange={() => {}}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <p>Account settings</p>
        </PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole('dialog').querySelector('svg')).toBeNull();

    rerender(
      <Popover open onOpenChange={() => {}}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent showArrow>
          <p>Account settings</p>
        </PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole('dialog').querySelector('svg')).not.toBeNull();
  });

  it('merges a custom className onto the content', () => {
    render(
      <Popover open onOpenChange={() => {}}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent className="custom-pop">
          <p>Account settings</p>
        </PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole('dialog').classList.contains('custom-pop')).toBe(true);
  });

  it('renders arbitrary interactive content', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <img src="/avatar.png" alt="Avatar" />
          <button type="button" onClick={onClick}>
            Report
          </button>
        </PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByAltText('Avatar')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Report' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
