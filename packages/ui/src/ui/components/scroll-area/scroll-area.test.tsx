// @vitest-environment jsdom

import { createRef } from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ScrollArea, ScrollBar } from './scroll-area';
import { scrollbarThumbClass } from './scroll-area.styles';

beforeAll(() => {
  // Radix ScrollArea measures the viewport/thumb via ResizeObserver; jsdom lacks it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const LongContent = () => (
  <div style={{ height: 1000 }}>
    <p>Inner content</p>
  </div>
);

describe('ScrollArea structure & behaviour', () => {
  it('renders its children inside the scroll viewport', () => {
    render(
      <ScrollArea className="h-40">
        <LongContent />
      </ScrollArea>,
    );

    expect(screen.getByText('Inner content')).not.toBeNull();
  });

  it('forwards viewportRef to the scrollable viewport node that holds the content', () => {
    const viewportRef = createRef<HTMLDivElement>();
    render(
      <ScrollArea className="h-40" viewportRef={viewportRef}>
        <LongContent />
      </ScrollArea>,
    );

    expect(viewportRef.current).toBeInstanceOf(HTMLElement);
    expect(viewportRef.current?.textContent).toContain('Inner content');
  });

  it('makes the viewport keyboard-focusable for arrow-key scrolling', () => {
    const viewportRef = createRef<HTMLDivElement>();
    render(
      <ScrollArea className="h-40" viewportRef={viewportRef}>
        <LongContent />
      </ScrollArea>,
    );

    expect(viewportRef.current?.getAttribute('tabindex')).toBe('0');
  });

  it('lets a consumer opt out of the tab stop via tabIndex={-1}', () => {
    const viewportRef = createRef<HTMLDivElement>();
    render(
      <ScrollArea className="h-40" tabIndex={-1} viewportRef={viewportRef}>
        <LongContent />
      </ScrollArea>,
    );

    expect(viewportRef.current?.getAttribute('tabindex')).toBe('-1');
  });

  it('exposes the viewport as a named region when given an aria-label', () => {
    render(
      <ScrollArea className="h-40" aria-label="Activity feed">
        <LongContent />
      </ScrollArea>,
    );

    const region = screen.getByRole('region', { name: 'Activity feed' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.textContent).toContain('Inner content');
  });

  it('does not add a region role when unlabelled', () => {
    render(
      <ScrollArea className="h-40">
        <LongContent />
      </ScrollArea>,
    );

    expect(screen.queryByRole('region')).toBeNull();
  });

  it('forwards Radix root props and className to the root element', () => {
    const { container } = render(
      <ScrollArea className="custom-root h-40" dir="rtl">
        <LongContent />
      </ScrollArea>,
    );

    const root = container.querySelector('.custom-root');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('dir')).toBe('rtl');
  });
});

describe('ScrollArea scrollbars', () => {
  it('renders a vertical scrollbar by default', () => {
    const { container } = render(
      // `type="always"` keeps the bar mounted without real overflow (absent in jsdom).
      <ScrollArea className="h-40" type="always">
        <LongContent />
      </ScrollArea>,
    );

    const bar = container.querySelector('[data-orientation="vertical"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('w-2.5');
    expect(bar?.className).toContain('touch-none');
    expect(bar?.className).toContain('select-none');
  });

  // Radix only mounts the thumb once it has a measured size, which never happens
  // headless (no layout in jsdom), so assert the thumb's styling at its source.
  it('styles the thumb as a rounded-(--ui-radius-sm), themed pill', () => {
    expect(scrollbarThumbClass).toContain('rounded-full');
    expect(scrollbarThumbClass).toContain('bg-(--ui-border-strong)');
    expect(scrollbarThumbClass).toContain('hover:bg-(--ui-border-hover)');
  });

  it('renders a horizontal scrollbar when orientation is horizontal', () => {
    const { container } = render(
      <ScrollArea orientation="horizontal" className="w-40" type="always">
        <div style={{ width: 1000 }}>Wide content</div>
      </ScrollArea>,
    );

    expect(container.querySelector('[data-orientation="vertical"]')).toBeNull();
    const bar = container.querySelector('[data-orientation="horizontal"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('h-2.5');
    expect(bar?.className).toContain('flex-col');
  });

  it('renders both scrollbars when orientation is both', () => {
    const { container } = render(
      <ScrollArea orientation="both" className="h-40 w-40" type="always">
        <div style={{ height: 1000, width: 1000 }}>Big content</div>
      </ScrollArea>,
    );

    expect(container.querySelector('[data-orientation="vertical"]')).not.toBeNull();
    expect(container.querySelector('[data-orientation="horizontal"]')).not.toBeNull();
  });

  it('enables overflow on the scrolling axis so the viewport actually scrolls', () => {
    const viewportRef = createRef<HTMLDivElement>();
    render(
      <ScrollArea className="h-40" type="always" viewportRef={viewportRef}>
        <LongContent />
      </ScrollArea>,
    );

    // Radix only sets overflow:scroll for an axis whose scrollbar is mounted.
    expect(viewportRef.current?.style.overflowY).toBe('scroll');
    expect(viewportRef.current?.style.overflowX).toBe('hidden');
  });
});

describe('ScrollArea hideScrollbar', () => {
  it('hides the bar visually but keeps the viewport scrollable', () => {
    const viewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <ScrollArea className="h-40" type="always" hideScrollbar viewportRef={viewportRef}>
        <LongContent />
      </ScrollArea>,
    );

    // The bar is still mounted (so the axis stays scrollable)…
    expect(viewportRef.current?.style.overflowY).toBe('scroll');
    // …but rendered with display:none so nothing shows.
    const bar = container.querySelector('[data-orientation="vertical"]');
    expect(bar?.className).toContain('hidden');
    expect(bar?.className).not.toContain('flex');
  });

  it('hides both bars while keeping both axes scrollable for orientation both', () => {
    const viewportRef = createRef<HTMLDivElement>();
    const { container } = render(
      <ScrollArea
        orientation="both"
        className="h-40 w-40"
        type="always"
        hideScrollbar
        viewportRef={viewportRef}
      >
        <div style={{ height: 1000, width: 1000 }}>Big content</div>
      </ScrollArea>,
    );

    // Both axes remain scrollable even though both bars are hidden.
    expect(viewportRef.current?.style.overflowY).toBe('scroll');
    expect(viewportRef.current?.style.overflowX).toBe('scroll');
    expect(container.querySelector('[data-orientation="vertical"]')?.className).toContain('hidden');
    expect(container.querySelector('[data-orientation="horizontal"]')?.className).toContain(
      'hidden',
    );
  });
});

describe('ScrollBar', () => {
  it('applies horizontal classes when composed directly as a sibling of the viewport', () => {
    // ScrollBar is meant to sit under the Radix Root alongside the Viewport, not inside
    // it — compose the primitives by hand so the test reflects real usage.
    const { container } = render(
      <ScrollAreaPrimitive.Root type="always" className="h-40">
        <ScrollAreaPrimitive.Viewport>
          <LongContent />
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar orientation="horizontal" forceMount />
      </ScrollAreaPrimitive.Root>,
    );

    const bar = container.querySelector('[data-orientation="horizontal"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('h-2.5');
    expect(bar?.className).toContain('flex-col');
  });
});
