import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders initials when no src is provided', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" />);

    expect(html).toContain('MB');
    expect(html).not.toContain('<img');
  });

  it('applies the default medium size token', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" />);

    expect(html).toContain('size-12');
  });

  it('applies the requested size token', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" size="sm" />);

    expect(html).toContain('size-9');
  });

  it('renders an image when src is provided', () => {
    const html = renderToStaticMarkup(<Avatar src="/me.jpg" alt="Marcus" />);

    expect(html).toContain('<img');
    expect(html).toContain('src="/me.jpg"');
    expect(html).toContain('alt="Marcus"');
  });

  it('renders the online indicator when online', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" online />);

    expect(html).toContain('bg-tone-green');
  });

  it('omits the online indicator by default', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" />);

    expect(html).not.toContain('bg-tone-green');
  });

  it('applies the accent ring when ring is set', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" ring />);

    expect(html).toContain('ring-(--ui-accent)');
  });

  it('does not put an aria-label on the initials span', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" />);

    expect(html).not.toContain('aria-label');
  });

  it('renders the online indicator with a custom status tone', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" online statusTone="red" />);

    expect(html).toContain('bg-tone-red');
  });

  it('sizes the online dot relative to the avatar', () => {
    const html = renderToStaticMarkup(<Avatar initials="MB" online />);

    expect(html).toContain('size-1/4');
    expect(html).not.toContain('size-2.5');
  });

  it('renders the supplied child through the slot when asChild is set', () => {
    const html = renderToStaticMarkup(
      <Avatar asChild>
        <img src="/child.jpg" alt="Custom" />
      </Avatar>,
    );

    expect(html).toContain('src="/child.jpg"');
    expect(html).toContain('alt="Custom"');
  });

  it('merges the avatar image styling onto the asChild child', () => {
    const html = renderToStaticMarkup(
      <Avatar asChild>
        <img src="/child.jpg" alt="Custom" />
      </Avatar>,
    );

    expect(html).toContain('object-cover');
    expect(html).toContain('rounded-full');
  });

  it('applies the accent ring to the asChild child when ring is set', () => {
    const html = renderToStaticMarkup(
      <Avatar asChild ring>
        <img src="/child.jpg" alt="Custom" />
      </Avatar>,
    );

    expect(html).toContain('ring-(--ui-accent)');
  });

  it('ignores src and initials when asChild is set', () => {
    const html = renderToStaticMarkup(
      <Avatar asChild src="/ignored.jpg" alt="Ignored" initials="MB">
        <img src="/child.jpg" alt="Custom" />
      </Avatar>,
    );

    expect(html).toContain('src="/child.jpg"');
    expect(html).not.toContain('/ignored.jpg');
    expect(html).not.toContain('MB');
  });
});
