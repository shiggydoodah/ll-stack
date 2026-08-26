// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';

beforeAll(() => {
  // Radix's scroll-lock measures layout via ResizeObserver; jsdom lacks it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

interface FixtureProps {
  open?: boolean;
  hideClose?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Fixture = ({ open = true, hideClose = false, onOpenChange = () => {} }: FixtureProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent hideClose={hideClose}>
      <DialogHeader>
        <DialogTitle>Crop photo</DialogTitle>
        <DialogDescription>Reframe your image.</DialogDescription>
      </DialogHeader>
      <p>Body content</p>
    </DialogContent>
  </Dialog>
);

/**
 * Radix portals the overlay in as the panel's immediately-preceding sibling.
 * Styling assertions resolve both so each class is checked against the element
 * that owns it — asserting over `document.body.innerHTML` instead would pass
 * even if a class moved from the overlay to the panel (or vice versa).
 */
const getDialogParts = () => {
  const panel = screen.getByRole('dialog');
  const overlay = panel.previousElementSibling;
  expect(overlay).toBeInstanceOf(HTMLElement);
  return { panel, overlay: overlay as HTMLElement };
};

describe('Dialog composition', () => {
  it('renders the title, description and body when open', () => {
    render(<Fixture />);

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByText('Crop photo')).not.toBeNull();
    expect(screen.getByText('Reframe your image.')).not.toBeNull();
    expect(screen.getByText('Body content')).not.toBeNull();
  });

  it('renders the default close button', () => {
    render(<Fixture />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeNull();
  });

  it('hides the close button when hideClose is set', () => {
    render(<Fixture hideClose />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('respects the controlled open prop', () => {
    const { rerender } = render(<Fixture open={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<Fixture open />);
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('renders identically via the dot-notation statics', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Dotted title</Dialog.Title>
            <Dialog.Description>Dotted description</Dialog.Description>
          </Dialog.Header>
          <p>Dotted body</p>
        </Dialog.Content>
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByText('Dotted title')).not.toBeNull();
    expect(screen.getByText('Dotted body')).not.toBeNull();
  });

  it('mounts into a provided portal container', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    try {
      render(
        <Dialog open onOpenChange={() => {}}>
          <DialogContent container={container}>
            <DialogHeader>
              <DialogTitle>Scoped title</DialogTitle>
              <DialogDescription>Scoped description</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>,
      );

      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
      expect(container.textContent).toContain('Scoped title');
      expect(container.textContent).toContain('Scoped description');
    } finally {
      document.body.removeChild(container);
    }
  });
});

describe('Dialog dismissal', () => {
  it('calls onOpenChange(false) when the close button is clicked', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(<Fixture onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) when Escape is pressed', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(<Fixture onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Dialog styling', () => {
  it('carries the overlay and panel surface classes', () => {
    render(<Fixture />);
    const { panel, overlay } = getDialogParts();

    // Overlay backdrop: the themable scrim token, which carries its own alpha.
    expect(overlay.className).toContain('bg-(--ui-overlay)');
    expect(overlay.className).not.toContain('bg-black/70');
    expect(overlay.className).toContain('backdrop-blur-sm');
    // Centered content panel.
    expect(panel.className).toContain('max-w-lg');
    expect(panel.className).toContain('rounded-(--ui-radius-lg)');
    expect(panel.className).toContain('border-(--ui-border-strong)');
  });
});

describe('Dialog animation', () => {
  it('applies the centred scale animation by default', () => {
    render(<Fixture />);
    const { panel } = getDialogParts();

    expect(panel.className).toContain('data-[state=open]:animate-in');
    expect(panel.className).toContain('data-[state=open]:zoom-in-95');
    // The `translate` property keeps the panel centred while `transform` animates, so
    // any slide-*-1/2 "pin" would compose into a second −50% and fly it in from the corner.
    expect(panel.className).not.toContain('slide-in-from-left-1/2');
    expect(panel.className).not.toContain('slide-in-from-top-1/2');
  });

  it('cross-fades without scaling when animation is "fade"', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent animation="fade">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Desc</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const { panel } = getDialogParts();

    expect(panel.className).toContain('data-[state=open]:fade-in-0');
    expect(panel.className).not.toContain('zoom-in-95');
  });

  it('floats up from below centre when animation is "float"', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent animation="float">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Desc</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const { panel } = getDialogParts();

    expect(panel.className).toContain('data-[state=open]:fade-in-0');
    // A pure +12px delta: the `translate` property already keeps the panel centred.
    expect(panel.className).toContain('data-[state=open]:slide-in-from-bottom-3');
    expect(panel.className).toContain('data-[state=closed]:slide-out-to-bottom-3');
    expect(panel.className).not.toContain('zoom-in-95');
  });

  it('omits animation classes when animation is "none"', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent animation="none">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Desc</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const { panel, overlay } = getDialogParts();

    for (const className of [panel.className, overlay.className]) {
      expect(className).not.toContain('animate-in');
      expect(className).not.toContain('zoom-in-95');
    }
  });
});
