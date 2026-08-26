// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './Drawer';

beforeAll(() => {
  // Radix/vaul observe the content size; jsdom lacks ResizeObserver + scrollIntoView.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  // vaul's drag gesture uses pointer capture, which jsdom does not implement.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  // vaul reads matchMedia on mount to detect reduced-motion / viewport.
  window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(cleanup);

// A complete drawer with a button trigger, titled content and a close in the footer.
// `root`/`content` are spread onto the respective parts so tests can pass
// open/onOpenChange/direction/className/etc.
const renderDrawer = (root: Record<string, unknown> = {}, content: Record<string, unknown> = {}) =>
  render(
    <Drawer {...root}>
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerContent {...content}>
        <DrawerHeader>
          <DrawerTitle>Edit profile</DrawerTitle>
          <DrawerDescription>Update your details.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <DrawerClose>Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>,
  );

// ── Open / close ──────────────────────────────────────────────────────────────

describe('open and close', () => {
  it('does not render content until opened', () => {
    renderDrawer();
    expect(screen.queryByText('Edit profile')).toBeNull();
  });

  it('opens when the trigger is clicked (uncontrolled)', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Edit profile');
    expect(dialog.textContent).toContain('Update your details.');
  });

  it('calls onOpenChange(false) on Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDrawer({ onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('calls onOpenChange(false) when a DrawerClose inside the content is activated', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDrawer({ onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

// ── Controlled mode ───────────────────────────────────────────────────────────

describe('controlled mode', () => {
  it('reflects the external open prop', () => {
    const { rerender } = render(
      <Drawer open={false} onOpenChange={() => {}}>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Edit profile</DrawerTitle>
          <DrawerDescription>Update your details.</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.queryByText('Edit profile')).toBeNull();

    rerender(
      <Drawer open onOpenChange={() => {}}>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Edit profile</DrawerTitle>
          <DrawerDescription>Update your details.</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.queryByText('Edit profile')).not.toBeNull();
  });

  it('calls onOpenChange when opening', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDrawer({ onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

// ── Direction & content configuration ─────────────────────────────────────────

describe('content configuration', () => {
  it('defaults to the bottom direction', async () => {
    renderDrawer({ open: true });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('data-vaul-drawer-direction')).toBe('bottom');
  });

  it('forwards the direction to the content element', async () => {
    renderDrawer({ open: true, direction: 'right' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('data-vaul-drawer-direction')).toBe('right');
  });

  it('merges a custom className onto the content', async () => {
    renderDrawer({ open: true }, { className: 'custom-drawer' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.classList.contains('custom-drawer')).toBe(true);
  });

  it('renders the drag handle by default and omits it when showHandle is false', async () => {
    const { rerender } = renderDrawer({ open: true });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('[class*="w-[100px]"]')).not.toBeNull();

    rerender(
      <Drawer open>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent showHandle={false}>
          <DrawerTitle>Edit profile</DrawerTitle>
          <DrawerDescription>Update your details.</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').querySelector('[class*="w-[100px]"]')).toBeNull();
  });

  it('renders arbitrary interactive content', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Drawer open>
        <DrawerContent>
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>Manage your settings.</DrawerDescription>
          <button type="button" onClick={onClick}>
            Save
          </button>
        </DrawerContent>
      </Drawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

// ── Overlay styling ───────────────────────────────────────────────────────────

describe('overlay styling', () => {
  it('uses the themable scrim token and leaves the fade entirely to vaul', async () => {
    renderDrawer({ open: true });
    await screen.findByRole('dialog');

    const overlay = document.querySelector('[data-vaul-overlay]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.className).toContain('bg-(--ui-overlay)');
    expect(overlay.className).toContain('backdrop-blur-sm');
    expect(overlay.className).not.toContain('bg-black/70');
    // vaul drives overlay opacity itself (including the drag-proportional fade);
    // tw-animate keyframes on top caused a visible jump on drag-release dismiss.
    expect(overlay.className).not.toContain('animate-in');
    expect(overlay.className).not.toContain('animate-out');
    expect(overlay.className).not.toContain('fade-in-0');
    expect(overlay.className).not.toContain('fade-out-0');
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('accessibility', () => {
  it('marks the trigger as a dialog control and toggles aria-expanded', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    await screen.findByRole('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('labels the dialog with the title and describes it with the description', async () => {
    renderDrawer({ open: true });
    // getByRole name resolves via aria-labelledby → the DrawerTitle.
    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain(
      'Update your details.',
    );
  });

  // vaul opts out of Radix's focus-on-open, which would leave focus on the trigger
  // — inside the subtree Radix marks `aria-hidden` — so Chrome refuses the
  // aria-hidden and the page behind the modal stays exposed to assistive tech.
  it('moves focus to the panel on open instead of leaving it on the trigger', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(document.activeElement).not.toBe(trigger);
  });

  it('lets a caller place focus itself by preventing the open auto-focus', async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger>Open</DrawerTrigger>
        <DrawerContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById('save')?.focus();
          }}
        >
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>Manage your settings.</DrawerDescription>
          <button id="save" type="button">
            Save
          </button>
        </DrawerContent>
      </Drawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const save = await screen.findByRole('button', { name: 'Save' });
    await waitFor(() => expect(document.activeElement).toBe(save));
  });
});
