// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Callout } from './Callout';

afterEach(cleanup);

describe('Callout', () => {
  it('renders the message body', () => {
    const html = renderToStaticMarkup(<Callout>Heads up</Callout>);

    expect(html).toContain('<div');
    expect(html).toContain('Heads up');
  });

  it('renders the subtle neutral box with an icon chip by default', () => {
    const html = renderToStaticMarkup(<Callout tone="amber">Notice</Callout>);

    // Neutral dashed container, regardless of tone.
    expect(html).toContain('border-dashed');
    expect(html).toContain('bg-(--ui-foreground)/5');
    // Tone-coloured icon chip.
    expect(html).toContain('rounded-full');
    expect(html).toContain('bg-tone-amber/10');
    expect(html).toContain('text-tone-amber');
  });

  it('renders a tone-tinted container with an inline icon for tinted variants', () => {
    const html = renderToStaticMarkup(
      <Callout tone="red" variant="soft">
        Error
      </Callout>,
    );

    expect(html).toContain('bg-tone-red/10');
    expect(html).toContain('text-tone-red');
    // No neutral box and no icon chip in the tinted look.
    expect(html).not.toContain('border-dashed');
    expect(html).not.toContain('rounded-full');
  });

  it('renders a tone-appropriate default icon', () => {
    const html = renderToStaticMarkup(<Callout tone="green">Saved</Callout>);

    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
  });

  it('hides the icon when icon is null', () => {
    const html = renderToStaticMarkup(
      <Callout tone="blue" icon={null}>
        No icon
      </Callout>,
    );

    expect(html).not.toContain('<svg');
  });

  it('renders a custom icon override', () => {
    const html = renderToStaticMarkup(
      <Callout icon={<span data-testid="custom-icon">★</span>}>Custom</Callout>,
    );

    expect(html).toContain('data-testid="custom-icon"');
    expect(html).toContain('★');
  });

  it('renders an optional title', () => {
    render(<Callout title="Username taken">That username was claimed.</Callout>);

    expect(screen.getByText('Username taken')).toBeTruthy();
    expect(screen.getByText('That username was claimed.')).toBeTruthy();
  });

  it('renders the action slot', () => {
    render(
      <Callout tone="amber" action={<button type="button">Resend</button>}>
        Check your inbox.
      </Callout>,
    );

    expect(screen.getByRole('button', { name: 'Resend' })).toBeTruthy();
  });

  it('has no dismiss control by default', () => {
    render(<Callout>Hi</Callout>);

    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('renders a dismiss control and calls onDismiss when clicked', () => {
    const onDismiss = vi.fn();
    render(
      <Callout dismissible onDismiss={onDismiss}>
        Hi
      </Callout>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('uses role="alert" for red/amber tones and role="status" otherwise', () => {
    expect(renderToStaticMarkup(<Callout tone="red">x</Callout>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Callout tone="amber">x</Callout>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Callout tone="blue">x</Callout>)).toContain('role="status"');
    expect(renderToStaticMarkup(<Callout tone="neutral">x</Callout>)).toContain('role="status"');
  });

  it('allows the role to be overridden', () => {
    const html = renderToStaticMarkup(
      <Callout tone="red" role="status">
        x
      </Callout>,
    );

    expect(html).toContain('role="status"');
  });

  it('applies size classes', () => {
    expect(renderToStaticMarkup(<Callout size="sm">x</Callout>)).toContain('p-3');
    expect(renderToStaticMarkup(<Callout size="sm">x</Callout>)).toContain('text-xs');
    expect(renderToStaticMarkup(<Callout size="md">x</Callout>)).toContain('p-4');
  });

  it('center-aligns the icon and dismiss control for a single-block callout', () => {
    const { container } = render(<Callout dismissible>Short note</Callout>);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('items-center');
    expect(root.className).not.toContain('items-start');
  });

  it('top-aligns when a title or action is present', () => {
    const { container, rerender } = render(<Callout title="Heads up">Body</Callout>);
    expect((container.firstElementChild as HTMLElement).className).toContain('items-start');

    rerender(<Callout action={<button type="button">Do</button>}>Body</Callout>);
    expect((container.firstElementChild as HTMLElement).className).toContain('items-start');
  });

  it('passes through standard div attributes', () => {
    const html = renderToStaticMarkup(
      <Callout id="verify-note" data-testid="callout">
        x
      </Callout>,
    );

    expect(html).toContain('id="verify-note"');
    expect(html).toContain('data-testid="callout"');
  });

  it('merges a custom className', () => {
    const html = renderToStaticMarkup(<Callout className="mt-4">x</Callout>);

    expect(html).toContain('mt-4');
  });
});
