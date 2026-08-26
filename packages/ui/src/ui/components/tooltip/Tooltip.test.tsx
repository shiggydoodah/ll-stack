// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Tooltip, TooltipContent, TooltipRoot, TooltipTrigger } from './Tooltip';

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

// A convenience tooltip with zero delays so hover/leave resolve immediately in tests.
// `extra` is spread last so individual tests can override content, delays or placement.
const renderTooltip = (extra: Record<string, unknown> = {}) =>
  render(
    <Tooltip content="Copy to clipboard" openDelay={0} closeDelay={0} {...extra}>
      <button type="button">Copy</button>
    </Tooltip>,
  );

// ── Open on hover / focus ─────────────────────────────────────────────────────

describe('open on hover and focus', () => {
  it('does not render the tooltip until triggered', () => {
    renderTooltip();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on pointer hover', async () => {
    const user = userEvent.setup();
    renderTooltip();
    await user.hover(screen.getByRole('button', { name: 'Copy' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Copy to clipboard');
  });

  it('opens on keyboard focus', async () => {
    const user = userEvent.setup();
    renderTooltip();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Copy' })).toBe(document.activeElement);
    expect(await screen.findByRole('tooltip')).not.toBeNull();
  });
});

// ── Accessibility wiring ──────────────────────────────────────────────────────

describe('accessibility', () => {
  it('exposes the content as role="tooltip" and links it via aria-describedby', async () => {
    const user = userEvent.setup();
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Copy' });
    await user.hover(trigger);
    const tip = await screen.findByRole('tooltip');
    const id = tip.getAttribute('id');
    expect(id).toBeTruthy();
    expect(trigger.getAttribute('aria-describedby')).toBe(id);
  });

  it('does not set aria-describedby while closed', () => {
    renderTooltip();
    expect(
      screen.getByRole('button', { name: 'Copy' }).getAttribute('aria-describedby'),
    ).toBeNull();
  });

  it('does not mark the trigger as a popup control', async () => {
    const user = userEvent.setup();
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Copy' });
    await user.hover(trigger);
    await screen.findByRole('tooltip');
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBeNull();
  });

  it('keeps focus on the trigger when opened by focus (no focus trap)', async () => {
    const user = userEvent.setup();
    renderTooltip();
    await user.tab();
    await screen.findByRole('tooltip');
    expect(screen.getByRole('button', { name: 'Copy' })).toBe(document.activeElement);
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('close behaviour', () => {
  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderTooltip();
    await user.hover(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('tooltip');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('closes on pointer leave', async () => {
    const user = userEvent.setup();
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Copy' });
    await user.hover(trigger);
    await screen.findByRole('tooltip');
    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('closes on blur', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Copy to clipboard" openDelay={0} closeDelay={0}>
          <button type="button">Copy</button>
        </Tooltip>
        <button type="button">Other</button>
      </>,
    );
    await user.tab(); // focus Copy → open
    await screen.findByRole('tooltip');
    await user.tab(); // focus Other → blur Copy → close
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('stays open while the content itself is hovered', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Copy to clipboard" openDelay={0} closeDelay={500}>
        <button type="button">Copy</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Copy' });
    await user.hover(trigger);
    const tip = await screen.findByRole('tooltip');
    await user.unhover(trigger); // schedules a close 500ms out
    await user.hover(tip); // cancels the pending close
    expect(screen.queryByRole('tooltip')).not.toBeNull();
  });
});

// ── Touch ─────────────────────────────────────────────────────────────────────

describe('touch', () => {
  it('toggles open and closed on tap (no hover available)', async () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Copy' });

    // A touch tap = pointerdown(touch) followed by click.
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('tooltip')).not.toBeNull();

    // Tapping again dismisses it (rather than re-opening).
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('does not open from a touch pointer merely entering the trigger', () => {
    renderTooltip();
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Copy' }), { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

// ── Disabled ──────────────────────────────────────────────────────────────────

describe('disabled', () => {
  it('never opens and renders the bare trigger', async () => {
    const user = userEvent.setup();
    renderTooltip({ disabled: true });
    const trigger = screen.getByRole('button', { name: 'Copy' });
    await user.hover(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
  });

  it('renders the bare trigger when content is empty', () => {
    render(
      <Tooltip content="">
        <button type="button">Copy</button>
      </Tooltip>,
    );
    expect(
      screen.getByRole('button', { name: 'Copy' }).getAttribute('aria-describedby'),
    ).toBeNull();
  });
});

// ── Content configuration ─────────────────────────────────────────────────────

describe('content configuration', () => {
  it('forwards side to the content element', async () => {
    const user = userEvent.setup();
    renderTooltip({ side: 'right' });
    await user.hover(screen.getByRole('button', { name: 'Copy' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip.getAttribute('data-side')).toBe('right');
  });

  it('renders an arrow only when showArrow is set', async () => {
    const user = userEvent.setup();
    const { rerender } = renderTooltip();
    await user.hover(screen.getByRole('button', { name: 'Copy' }));
    expect((await screen.findByRole('tooltip')).querySelector('svg')).toBeNull();

    rerender(
      <Tooltip content="Copy to clipboard" openDelay={0} closeDelay={0} showArrow>
        <button type="button">Copy</button>
      </Tooltip>,
    );
    expect((await screen.findByRole('tooltip')).querySelector('svg')).not.toBeNull();
  });

  it('merges a custom className onto the content', async () => {
    const user = userEvent.setup();
    renderTooltip({ className: 'custom-tip' });
    await user.hover(screen.getByRole('button', { name: 'Copy' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip.classList.contains('custom-tip')).toBe(true);
  });
});

// ── Controlled mode ───────────────────────────────────────────────────────────

describe('controlled mode', () => {
  it('reflects the external open prop', () => {
    const { rerender } = render(
      <Tooltip content="Copy to clipboard" open={false} onOpenChange={() => {}}>
        <button type="button">Copy</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();

    rerender(
      <Tooltip content="Copy to clipboard" open onOpenChange={() => {}}>
        <button type="button">Copy</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeNull();
  });

  it('calls onOpenChange when opening and closing', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderTooltip({ onOpenChange });
    await user.hover(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('tooltip');
    expect(onOpenChange).toHaveBeenCalledWith(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

// ── Compound parts ────────────────────────────────────────────────────────────

describe('compound parts', () => {
  it('renders and wires TooltipRoot/Trigger/Content', async () => {
    const user = userEvent.setup();
    render(
      <TooltipRoot openDelay={0} closeDelay={0}>
        <TooltipTrigger>
          <button type="button">Help</button>
        </TooltipTrigger>
        <TooltipContent>More info</TooltipContent>
      </TooltipRoot>,
    );
    const trigger = screen.getByRole('button', { name: 'Help' });
    await user.hover(trigger);
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('More info');
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.getAttribute('id'));
  });

  it('forwards ref and rest props (className/style/data-*) through TooltipTrigger', () => {
    const ref = createRef<HTMLElement>();
    render(
      <TooltipRoot openDelay={0} closeDelay={0}>
        <TooltipTrigger
          ref={ref}
          className="custom-trigger"
          style={{ letterSpacing: '1px' }}
          data-testid="tip-trigger"
        >
          <button type="button" className="own-class">
            Help
          </button>
        </TooltipTrigger>
        <TooltipContent>More info</TooltipContent>
      </TooltipRoot>,
    );

    const trigger = screen.getByTestId('tip-trigger');
    expect(ref.current).toBe(trigger);
    // className/style merge onto the child element rather than replacing its own.
    expect(trigger.classList.contains('custom-trigger')).toBe(true);
    expect(trigger.classList.contains('own-class')).toBe(true);
    expect(trigger.style.letterSpacing).toBe('1px');
  });

  it('composes consumer handlers with the trigger tooltip wiring', async () => {
    const user = userEvent.setup();
    const onPointerEnter = vi.fn();
    render(
      <TooltipRoot openDelay={0} closeDelay={0}>
        <TooltipTrigger onPointerEnter={onPointerEnter}>
          <button type="button">Help</button>
        </TooltipTrigger>
        <TooltipContent>More info</TooltipContent>
      </TooltipRoot>,
    );

    await user.hover(screen.getByRole('button', { name: 'Help' }));

    // The consumer handler fired and the tooltip still opened.
    expect(onPointerEnter).toHaveBeenCalled();
    expect(await screen.findByRole('tooltip')).not.toBeNull();
  });

  it('forwards ref and rest props (style/data-*) through TooltipContent', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLDivElement>();
    render(
      <TooltipRoot openDelay={0} closeDelay={0}>
        <TooltipTrigger>
          <button type="button">Help</button>
        </TooltipTrigger>
        <TooltipContent ref={ref} style={{ zIndex: 60 }} data-testid="tip-content">
          More info
        </TooltipContent>
      </TooltipRoot>,
    );

    await user.hover(screen.getByRole('button', { name: 'Help' }));
    const tip = await screen.findByRole('tooltip');

    expect(tip.getAttribute('data-testid')).toBe('tip-content');
    expect(tip.style.zIndex).toBe('60');
    expect(ref.current).toBe(tip);
  });
});
