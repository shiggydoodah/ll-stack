import { renderToStaticMarkup } from 'react-dom/server';
import { Star } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { List } from './List';

describe('List.Root', () => {
  it('renders a ul with base classes and children', () => {
    const html = renderToStaticMarkup(
      <List.Root>
        <li>Item</li>
      </List.Root>,
    );

    expect(html).toContain('<ul');
    expect(html).toContain('list-none');
    expect(html).toContain('flex-col');
    expect(html).toContain('Item');
  });

  it('merges custom className and passes through native attributes', () => {
    const html = renderToStaticMarkup(<List.Root id="todo" className="my-4" data-testid="root" />);

    expect(html).toContain('id="todo"');
    expect(html).toContain('my-4');
    expect(html).toContain('data-testid="root"');
  });
});

describe('List.Item', () => {
  it('renders a flex-row li with foreground text', () => {
    const html = renderToStaticMarkup(<List.Item>Label</List.Item>);

    expect(html).toContain('<li');
    expect(html).toContain('items-center');
    expect(html).toContain('text-(--ui-foreground)');
    expect(html).toContain('Label');
  });

  it('merges custom className and passes through native attributes', () => {
    const html = renderToStaticMarkup(
      <List.Item id="row" className="font-bold">
        x
      </List.Item>,
    );

    expect(html).toContain('id="row"');
    expect(html).toContain('font-bold');
  });
});

describe('List.ItemIcon', () => {
  it('renders a div chip with the default Check icon and accent colour', () => {
    const html = renderToStaticMarkup(<List.ItemIcon />);

    expect(html).toContain('<div');
    expect(html).toContain('rounded-full');
    expect(html).toContain('<svg');
    expect(html).toContain('text-(--ui-accent)');
    expect(html).toContain('bg-(--ui-accent)/10');
  });

  it('is decorative (aria-hidden) by default', () => {
    const html = renderToStaticMarkup(<List.ItemIcon />);

    expect(html).toContain('aria-hidden="true"');
  });

  it.each([
    ['neutral', 'text-(--ui-foreground)'],
    ['red', 'text-tone-red'],
    ['green', 'text-tone-green'],
    ['amber', 'text-tone-amber'],
    ['blue', 'text-tone-blue'],
    ['purple', 'text-tone-purple'],
    ['magenta', 'text-tone-magenta'],
  ] as const)('applies %s tone classes', (tone, expected) => {
    const html = renderToStaticMarkup(<List.ItemIcon tone={tone} />);

    expect(html).toContain(expected);
  });

  it.each([
    ['small', 'size-5'],
    ['medium', 'size-6'],
    ['large', 'size-8'],
  ] as const)('applies %s chip size', (size, expected) => {
    const html = renderToStaticMarkup(<List.ItemIcon size={size} />);

    expect(html).toContain(expected);
  });

  it('renders a custom React element verbatim', () => {
    const html = renderToStaticMarkup(
      <List.ItemIcon icon={<span className="custom-glyph">!</span>} />,
    );

    expect(html).toContain('custom-glyph');
  });

  it('renders a custom Lucide component as an svg with the chosen tone', () => {
    const html = renderToStaticMarkup(<List.ItemIcon icon={Star} tone="amber" />);

    expect(html).toContain('<svg');
    expect(html).toContain('text-tone-amber');
  });

  it('renders the chip without an icon (no crash) when icon is null', () => {
    const html = renderToStaticMarkup(<List.ItemIcon icon={null} />);

    expect(html).toContain('<div');
    expect(html).not.toContain('<svg');
  });

  it('renders a non-element ReactNode (string) verbatim without crashing', () => {
    const html = renderToStaticMarkup(<List.ItemIcon icon="•" />);

    expect(html).toContain('•');
    expect(html).not.toContain('<svg');
  });

  it('merges custom className and passes through native attributes', () => {
    const html = renderToStaticMarkup(<List.ItemIcon id="chip" className="ml-2" />);

    expect(html).toContain('id="chip"');
    expect(html).toContain('ml-2');
  });
});

describe('List preset icons', () => {
  it('SuccessIcon renders a green check', () => {
    const html = renderToStaticMarkup(<List.SuccessIcon />);

    expect(html).toContain('text-tone-green');
    expect(html).toContain('<svg');
  });

  it('DangerIcon renders red', () => {
    const html = renderToStaticMarkup(<List.DangerIcon />);

    expect(html).toContain('text-tone-red');
  });

  it('WarningIcon renders amber', () => {
    const html = renderToStaticMarkup(<List.WarningIcon />);

    expect(html).toContain('text-tone-amber');
  });

  it('InfoIcon renders blue', () => {
    const html = renderToStaticMarkup(<List.InfoIcon />);

    expect(html).toContain('text-tone-blue');
  });

  it('DisabledIcon renders a muted subtle colour', () => {
    const html = renderToStaticMarkup(<List.DisabledIcon />);

    expect(html).toContain('text-(--ui-text-subtle)');
    expect(html).toContain('bg-(--ui-text-subtle)/10');
  });

  it('presets still accept size and className', () => {
    const html = renderToStaticMarkup(<List.SuccessIcon size="large" className="mr-1" />);

    expect(html).toContain('size-8');
    expect(html).toContain('mr-1');
  });
});
