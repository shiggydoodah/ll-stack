// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HoverCard, HoverCardContent, HoverCardPreview, HoverCardTrigger } from './HoverCard';

/** Stub `matchMedia` with a predicate so tests can simulate desktop vs coarse-pointer devices. */
const mockMatchMedia = (matcher: (query: string) => boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matcher(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
};

const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  // Default: a hover-capable, fine-pointer desktop device.
  mockMatchMedia(() => false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('HoverCard', () => {
  it('renders the trigger and keeps the content unmounted while closed', () => {
    render(
      <HoverCard>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent>Preview body</HoverCardContent>
      </HoverCard>,
    );

    expect(screen.getByText('@lou')).toBeTruthy();
    expect(screen.queryByText('Preview body')).toBeNull();
  });

  it('shows the content when controlled open, merging className and exposing data-state', async () => {
    render(
      <HoverCard open>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent className="custom-surface">Preview body</HoverCardContent>
      </HoverCard>,
    );

    const content = await screen.findByText('Preview body');
    expect(content.className).toContain('custom-surface');
    // className is merged last, so the shared surface tokens survive alongside the override.
    expect(content.className).toContain('bg-(--ui-background)');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('forwards id, aria-*, ref and native props onto the content', async () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <HoverCard open>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent ref={ref} id="card-1" aria-label="Profile preview" data-testid="hc">
          Preview body
        </HoverCardContent>
      </HoverCard>,
    );

    const content = await screen.findByTestId('hc');
    expect(content.id).toBe('card-1');
    expect(content.getAttribute('aria-label')).toBe('Profile preview');
    expect(ref.current).toBe(content);
  });

  it('opens on hover and closes again on leave', async () => {
    const user = setupUser();
    render(
      <HoverCard openDelay={0} closeDelay={0}>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent>Preview body</HoverCardContent>
      </HoverCard>,
    );

    await user.hover(screen.getByText('@lou'));
    expect(await screen.findByText('Preview body')).toBeTruthy();

    await user.unhover(screen.getByText('@lou'));
    await waitFor(() => expect(screen.queryByText('Preview body')).toBeNull());
  });

  it('opens on keyboard focus of the trigger', async () => {
    const user = setupUser();
    render(
      <HoverCard openDelay={0} closeDelay={0}>
        <HoverCardTrigger asChild>
          <a href="/u/lou">@lou</a>
        </HoverCardTrigger>
        <HoverCardContent>Preview body</HoverCardContent>
      </HoverCard>,
    );

    await user.tab();
    expect(screen.getByText('@lou')).toBe(document.activeElement);
    expect(await screen.findByText('Preview body')).toBeTruthy();
  });

  it('dismisses on Escape', async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();
    render(
      <HoverCard open onOpenChange={onOpenChange}>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent>Preview body</HoverCardContent>
      </HoverCard>,
    );

    await screen.findByText('Preview body');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('renders the arrow when showArrow is set', async () => {
    const { container } = render(
      <HoverCard open>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent showArrow>Preview body</HoverCardContent>
      </HoverCard>,
    );

    await screen.findByText('Preview body');
    expect(container.ownerDocument.querySelector('svg')).toBeTruthy();
  });

  describe('disableOnMobile', () => {
    beforeEach(() => {
      // Simulate a touch / no-hover device.
      mockMatchMedia((query) => query.includes('hover: none') || query.includes('pointer: coarse'));
    });

    it('suppresses the preview on coarse-pointer devices by default', async () => {
      const user = setupUser();
      render(
        <HoverCard openDelay={0} closeDelay={0}>
          <HoverCardTrigger>@lou</HoverCardTrigger>
          <HoverCardContent>Preview body</HoverCardContent>
        </HoverCard>,
      );

      await user.hover(screen.getByText('@lou'));
      // The trigger keeps working; the card never mounts.
      expect(screen.getByText('@lou')).toBeTruthy();
      expect(screen.queryByText('Preview body')).toBeNull();
    });

    it('still opens on a coarse-pointer device when disableOnMobile is false', async () => {
      const user = setupUser();
      render(
        <HoverCard openDelay={0} closeDelay={0} disableOnMobile={false}>
          <HoverCardTrigger>@lou</HoverCardTrigger>
          <HoverCardContent>Preview body</HoverCardContent>
        </HoverCard>,
      );

      await user.hover(screen.getByText('@lou'));
      expect(await screen.findByText('Preview body')).toBeTruthy();
    });

    it('does not report a phantom open to onOpenChange while suppressed', async () => {
      const user = setupUser();
      const onOpenChange = vi.fn();
      render(
        <HoverCard openDelay={0} closeDelay={0} onOpenChange={onOpenChange}>
          <HoverCardTrigger>@lou</HoverCardTrigger>
          <HoverCardContent>Preview body</HoverCardContent>
        </HoverCard>,
      );

      await user.hover(screen.getByText('@lou'));

      // Consumers lazily fetch on open — a suppressed card must never say "open".
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
      expect(screen.queryByText('Preview body')).toBeNull();
    });

    it('never flips the Radix root between controlled and uncontrolled when suppression changes', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const card = (disableOnMobile: boolean) => (
        <HoverCard openDelay={0} closeDelay={0} disableOnMobile={disableOnMobile}>
          <HoverCardTrigger>@lou</HoverCardTrigger>
          <HoverCardContent>Preview body</HoverCardContent>
        </HoverCard>
      );

      // On a coarse-pointer device, toggling `disableOnMobile` flips suppression
      // mid-lifetime — the exact transition that used to alternate the root
      // between `open=undefined` and `open={false}` and trip Radix's warning.
      const { rerender } = render(card(false));
      rerender(card(true));
      rerender(card(false));

      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('changing from uncontrolled to controlled'),
      );
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('changing from controlled to uncontrolled'),
      );
      warn.mockRestore();
    });
  });

  it('opens initially via defaultOpen (uncontrolled)', async () => {
    render(
      <HoverCard defaultOpen>
        <HoverCardTrigger>@lou</HoverCardTrigger>
        <HoverCardContent>Preview body</HoverCardContent>
      </HoverCard>,
    );

    expect(await screen.findByText('Preview body')).toBeTruthy();
  });

  it('supports async content fetched on open via onOpenChange (deferred promise)', async () => {
    const user = setupUser();
    let resolveProfile!: (value: string) => void;
    const profilePromise = new Promise<string>((resolve) => {
      resolveProfile = resolve;
    });

    const AsyncDemo = () => {
      const [name, setName] = useState<string | null>(null);
      return (
        <HoverCard
          openDelay={0}
          closeDelay={0}
          onOpenChange={(open) => {
            if (open && name === null) void profilePromise.then(setName);
          }}
        >
          <HoverCardTrigger>@lou</HoverCardTrigger>
          <HoverCardContent>{name ?? <span>Loading…</span>}</HoverCardContent>
        </HoverCard>
      );
    };

    render(<AsyncDemo />);
    await user.hover(screen.getByText('@lou'));

    expect(await screen.findByText('Loading…')).toBeTruthy();
    await act(async () => {
      resolveProfile('Ada Lovelace');
      await profilePromise;
    });
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
  });
});

describe('HoverCardPreview', () => {
  it('renders only the trigger when content is nullish', () => {
    render(
      <HoverCardPreview content={null}>
        <a href="/u/lou">@lou</a>
      </HoverCardPreview>,
    );

    const trigger = screen.getByText('@lou');
    expect(trigger.tagName).toBe('A');
    // No hover-card wiring is added when there is nothing to preview.
    expect(trigger.getAttribute('aria-expanded')).toBeNull();
  });

  it('opens the preview content on hover', async () => {
    const user = setupUser();
    render(
      <HoverCardPreview content={<span>Preview body</span>} openDelay={0} closeDelay={0}>
        <a href="/u/lou">@lou</a>
      </HoverCardPreview>,
    );

    await user.hover(screen.getByText('@lou'));
    expect(await screen.findByText('Preview body')).toBeTruthy();
  });
});
