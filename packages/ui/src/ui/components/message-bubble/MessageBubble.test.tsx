// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageBubble } from './MessageBubble';

afterEach(cleanup);

describe('MessageBubble', () => {
  it('renders its children as the bubble body', () => {
    render(<MessageBubble variant="received">Hello there</MessageBubble>);
    expect(screen.getByText('Hello there')).toBeTruthy();
  });

  it('applies sent styling: accent fill, right alignment, reversed row', () => {
    const { container } = render(<MessageBubble variant="sent">My message</MessageBubble>);
    const root = container.firstChild as HTMLElement;

    expect(root.className).toContain('items-end');
    expect(root.querySelector('.flex-row-reverse')).toBeTruthy();
    expect(screen.getByText('My message').className).toContain('bg-tone-red');
  });

  it('applies received styling: flat neutral fill, foreground text, borderless, left alignment', () => {
    const { container } = render(<MessageBubble variant="received">Their message</MessageBubble>);
    const root = container.firstChild as HTMLElement;

    expect(root.className).toContain('items-start');
    expect(root.querySelector('.flex-row-reverse')).toBeNull();

    const bubble = screen.getByText('Their message');
    expect(bubble.className).toContain('bg-(--ui-input-background)');
    // Peer bubble matches the desktop mock's flat neutral box: bright foreground text, no border.
    expect(bubble.className).toContain('text-(--ui-foreground)');
    expect(bubble.className).not.toContain('border');
  });

  it('renders an optional sender name above the bubble', () => {
    render(
      <MessageBubble variant="received" senderName="Marcus">
        Hi
      </MessageBubble>,
    );
    expect(screen.getByText('Marcus')).toBeTruthy();
  });

  it('renders a <time> carrying an ISO dateTime and the formatted relative label', () => {
    const ts = Date.now() - 5 * 60_000; // 5 minutes ago
    const { container } = render(
      <MessageBubble variant="received" timestamp={ts}>
        Hi
      </MessageBubble>,
    );

    const time = container.querySelector('time');
    expect(time).toBeTruthy();
    expect(time?.getAttribute('datetime')).toBe(new Date(ts).toISOString());
    expect(time?.textContent).toBe('5 mins ago');
  });

  it('shows the delivery-status icon only for sent messages', () => {
    const { rerender } = render(
      <MessageBubble variant="sent" status="read">
        Hi
      </MessageBubble>,
    );
    expect(screen.getByRole('img', { name: 'Read' })).toBeTruthy();

    rerender(
      <MessageBubble variant="received" status="read">
        Hi
      </MessageBubble>,
    );
    expect(screen.queryByRole('img', { name: 'Read' })).toBeNull();
  });

  it('maps each status to its own accessible label and tick shape', () => {
    const { rerender } = render(
      <MessageBubble variant="sent" status="sending">
        Hi
      </MessageBubble>,
    );
    expect(screen.getByRole('img', { name: 'Sending' })).toBeTruthy();

    // sent → a single tick (lucide Check renders one <path>).
    rerender(
      <MessageBubble variant="sent" status="sent">
        Hi
      </MessageBubble>,
    );
    expect(screen.getByRole('img', { name: 'Sent' }).querySelectorAll('path')).toHaveLength(1);

    // delivered → still a single tick (shares the glyph with sent) but announces "Delivered".
    rerender(
      <MessageBubble variant="sent" status="delivered">
        Hi
      </MessageBubble>,
    );
    expect(screen.getByRole('img', { name: 'Delivered' }).querySelectorAll('path')).toHaveLength(1);

    // read → the double tick (lucide CheckCheck renders two <path>s).
    rerender(
      <MessageBubble variant="sent" status="read">
        Hi
      </MessageBubble>,
    );
    expect(screen.getByRole('img', { name: 'Read' }).querySelectorAll('path')).toHaveLength(2);
  });

  it('renders the avatar and actions slots', () => {
    render(
      <MessageBubble
        variant="received"
        avatar={<span data-testid="avatar">AV</span>}
        actions={<button data-testid="actions">More</button>}
      >
        Hi
      </MessageBubble>,
    );
    expect(screen.getByTestId('avatar')).toBeTruthy();
    expect(screen.getByTestId('actions')).toBeTruthy();
  });

  it('caps its width and wraps without splitting words mid-character', () => {
    render(
      <MessageBubble variant="received">
        {'supercalifragilisticexpialidocious'.repeat(5)}
      </MessageBubble>,
    );

    const bubble = screen.getByText(/supercalifragilistic/);
    // Width is capped so a long message can't span the whole thread...
    expect(bubble.className).toContain('max-w-[min(75%,34rem)]');
    // ...and content wraps at spaces / newlines, but words are never broken mid-character.
    expect(bubble.className).toContain('whitespace-pre-wrap');
    expect(bubble.className).not.toContain('break-words');
  });

  it('renders to static markup for SSR', () => {
    const html = renderToStaticMarkup(
      <MessageBubble variant="sent" status="delivered" timestamp={Date.now()}>
        SSR body
      </MessageBubble>,
    );
    expect(html).toContain('SSR body');
    expect(html).toContain('<time');
  });
});
