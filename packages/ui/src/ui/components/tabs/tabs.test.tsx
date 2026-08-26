// @vitest-environment jsdom

import { useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { TabsNav, TabsNavLink } from './tabs-nav';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const PanelFixture = (props: Partial<React.ComponentProps<typeof Tabs>> = {}) => (
  <Tabs defaultValue="a" {...props}>
    <TabsList aria-label="Sections">
      <TabsTrigger value="a">First</TabsTrigger>
      <TabsTrigger value="b" count={3}>
        Second
      </TabsTrigger>
    </TabsList>
    <TabsContent value="a">Panel A</TabsContent>
    <TabsContent value="b">Panel B</TabsContent>
  </Tabs>
);

describe('Tabs (panel surface)', () => {
  it('renders tablist, tabs and only the active panel', () => {
    render(<PanelFixture />);

    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel A');
    // Inactive panel content is unmounted by default.
    expect(screen.queryByText('Panel B')).toBeNull();
  });

  it('switches panels on click (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(<PanelFixture />);

    await user.click(screen.getByRole('tab', { name: /Second/ }));

    expect(screen.getByRole('tabpanel').textContent).toContain('Panel B');
    expect(screen.getByRole('tab', { name: /Second/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Panel A')).toBeNull();
  });

  it('moves the active tab with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<PanelFixture />);

    await user.click(screen.getByRole('tab', { name: 'First' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /Second/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel B');
  });

  it('supports controlled mode via value + onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Tabs value="a" onValueChange={onValueChange}>
        <TabsList aria-label="Controlled">
          <TabsTrigger value="a">First</TabsTrigger>
          <TabsTrigger value="b">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );

    await user.click(screen.getByRole('tab', { name: 'Second' }));

    expect(onValueChange).toHaveBeenCalledWith('b');
    // Still showing A because the parent hasn't updated `value`.
    expect(screen.getByRole('tabpanel').textContent).toContain('Panel A');

    rerender(
      <Tabs value="b" onValueChange={onValueChange}>
        <TabsList aria-label="Controlled">
          <TabsTrigger value="a">First</TabsTrigger>
          <TabsTrigger value="b">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tabpanel').textContent).toContain('Panel B');
  });

  it('renders an optional count on a trigger', () => {
    render(<PanelFixture />);
    expect(screen.getByRole('tab', { name: /Second/ }).textContent).toContain('3');
  });

  it('lazily mounts a panel only once its tab is activated', async () => {
    const user = userEvent.setup();
    const onMount = vi.fn();
    const Probe = () => {
      useEffect(() => onMount(), []);
      return <span>probe</span>;
    };

    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Lazy">
          <TabsTrigger value="a">First</TabsTrigger>
          <TabsTrigger value="b">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">
          <Probe />
        </TabsContent>
      </Tabs>,
    );

    expect(onMount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Second' }));

    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('renders to static markup for SSR', () => {
    const html = renderToStaticMarkup(<PanelFixture />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Panel A');
  });
});

describe('Tabs styling', () => {
  it('makes triggers fill equal width when justified', () => {
    const html = renderToStaticMarkup(<PanelFixture align="justified" />);
    expect(html).toContain('flex-1');
  });

  it('uses the centered indicator geometry', () => {
    const html = renderToStaticMarkup(<PanelFixture indicator="centered" />);
    expect(html).toContain('w-10');
    expect(html).not.toContain('inset-x-3');
  });

  it('uses the inset indicator geometry by default', () => {
    const html = renderToStaticMarkup(<PanelFixture />);
    expect(html).toContain('inset-x-3');
  });

  it('applies the pill active fill for the pill variant and tone', () => {
    const html = renderToStaticMarkup(<PanelFixture variant="pill" tone="green" />);
    expect(html).toContain('data-[state=active]:bg-tone-green');
    expect(html).toContain('rounded-(--ui-radius-md)'); // bordered track
  });

  it('renders the underline divider on the list', () => {
    const html = renderToStaticMarkup(<PanelFixture />);
    expect(html).toContain('border-(--ui-border)');
  });
});

describe('TabsNav (navigation surface)', () => {
  it('renders a nav landmark of links, not a tablist', () => {
    render(
      <TabsNav aria-label="Profile">
        <TabsNavLink active href="/profile">
          Profile
        </TabsNavLink>
        <TabsNavLink href="/profile/posts">Posts</TabsNavLink>
      </TabsNav>,
    );

    expect(screen.getByRole('navigation', { name: 'Profile' })).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('marks the active link with aria-current="page"', () => {
    render(
      <TabsNav aria-label="Profile">
        <TabsNavLink active href="/profile">
          Profile
        </TabsNavLink>
        <TabsNavLink href="/profile/posts">Posts</TabsNavLink>
      </TabsNav>,
    );

    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Posts' }).getAttribute('aria-current')).toBeNull();
  });

  it('renders the consumer element via asChild, merging styling and injecting the indicator', () => {
    const { container } = render(
      <TabsNav aria-label="Profile">
        <TabsNavLink active asChild>
          <a href="/profile" data-testid="custom">
            Profile
          </a>
        </TabsNavLink>
      </TabsNav>,
    );

    const link = screen.getByTestId('custom');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.getAttribute('data-state')).toBe('active');
    expect(link.className).toContain('group');
    // The underline indicator was injected inside the consumer's element.
    expect(container.querySelector('[data-testid="custom"] span[aria-hidden="true"]')).toBeTruthy();
  });

  it('cascades style props from the nav to its links', () => {
    const html = renderToStaticMarkup(
      <TabsNav aria-label="Feed" align="justified" indicator="centered">
        <TabsNavLink active href="/a">
          A
        </TabsNavLink>
      </TabsNav>,
    );
    expect(html).toContain('flex-1'); // align cascaded
    expect(html).toContain('w-10'); // centered indicator cascaded
  });

  it('cascades style props to links that are not direct children', () => {
    const html = renderToStaticMarkup(
      <TabsNav aria-label="Feed" indicator="centered">
        <div>
          <TabsNavLink active href="/a">
            A
          </TabsNavLink>
        </div>
      </TabsNav>,
    );
    // The clone-based cascade only reached direct children; context reaches
    // through arbitrary wrappers.
    expect(html).toContain('w-10');
    expect(html).not.toContain('inset-x-3');
  });

  it('lets a style prop set on the link win over the cascaded one', () => {
    const html = renderToStaticMarkup(
      <TabsNav aria-label="Feed" indicator="centered">
        <TabsNavLink active href="/a" indicator="inset">
          A
        </TabsNavLink>
      </TabsNav>,
    );
    expect(html).toContain('inset-x-3');
    expect(html).not.toContain('w-10');
  });

  it('renders non-TabsNavLink children untouched (no cloned style props leak onto them)', () => {
    render(
      <TabsNav aria-label="Feed">
        <TabsNavLink active href="/a">
          A
        </TabsNavLink>
        <span data-testid="divider" aria-hidden="true" />
      </TabsNav>,
    );

    const divider = screen.getByTestId('divider');
    // The old Children.map + cloneElement pass injected variant/indicator/etc.
    // onto every element child; arbitrary children must stay prop-free.
    for (const attr of ['variant', 'indicator', 'align', 'size', 'tone']) {
      expect(divider.getAttribute(attr)).toBeNull();
    }
  });

  it('renders to static markup for SSR', () => {
    const html = renderToStaticMarkup(
      <TabsNav aria-label="Profile">
        <TabsNavLink active href="/profile">
          Profile
        </TabsNavLink>
      </TabsNav>,
    );
    expect(html).toContain('<nav');
    expect(html).toContain('aria-current="page"');
  });
});
