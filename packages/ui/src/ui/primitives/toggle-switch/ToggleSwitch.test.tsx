// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToggleSwitch } from './ToggleSwitch';
import type { ToggleSwitchProps } from './ToggleSwitch';

const OPTIONS = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
];

const THREE_OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
];

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

const renderIntoBody = async (props: ToggleSwitchProps) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ToggleSwitch {...props} />);
  });

  return {
    buttons: () => Array.from(container!.querySelectorAll('button')),
    unmount: async () => act(async () => root.unmount()),
  };
};

const pressKey = async (element: HTMLElement, key: string) =>
  act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

describe('ToggleSwitch', () => {
  it('renders a radiogroup with one radio per option', () => {
    const html = renderToStaticMarkup(
      <ToggleSwitch value="anyone" options={OPTIONS} aria-label="Audience" />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Audience"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(2);
  });

  it('marks the selected option as checked', () => {
    const html = renderToStaticMarkup(<ToggleSwitch value="followers" options={OPTIONS} />);

    expect(html).toContain('Followers');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
  });

  it('applies active styling to the selected option', () => {
    const html = renderToStaticMarkup(<ToggleSwitch value="anyone" options={OPTIONS} />);

    expect(html).toContain('bg-(--ui-accent)');
  });

  it('makes only the selected option a tab stop (roving tabindex)', () => {
    const html = renderToStaticMarkup(<ToggleSwitch value="followers" options={OPTIONS} />);

    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(1);
  });

  it('applies large-size classes to the root and options', () => {
    const html = renderToStaticMarkup(
      <ToggleSwitch value="anyone" options={OPTIONS} size="large" />,
    );

    // root large → rounded-(--ui-radius-lg); option large → px-4 (both absent from the small default).
    expect(html).toContain('rounded-(--ui-radius-lg)');
    expect(html).toContain('px-4');
  });

  it('applies full-width layout classes to the root and options', () => {
    const html = renderToStaticMarkup(<ToggleSwitch value="anyone" options={OPTIONS} fullWidth />);

    // root fullWidth → w-full; option fullWidth → flex-1.
    expect(html).toContain('w-full');
    expect(html).toContain('flex-1');
  });

  it('disables every option and ignores clicks when disabled', async () => {
    const html = renderToStaticMarkup(<ToggleSwitch value="anyone" options={OPTIONS} disabled />);
    expect(html).toContain('aria-disabled="true"');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);

    container = document.createElement('div');
    document.body.appendChild(container);
    const onValueChange = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ToggleSwitch value="anyone" options={OPTIONS} onValueChange={onValueChange} disabled />,
      );
    });

    const followers = container.querySelectorAll('button')[1]!;
    await act(async () => followers.click());

    expect(onValueChange).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('calls onValueChange with the clicked value', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onValueChange = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<ToggleSwitch value="anyone" options={OPTIONS} onValueChange={onValueChange} />);
    });

    const followers = container.querySelectorAll('button')[1]!;
    await act(async () => followers.click());

    expect(onValueChange).toHaveBeenCalledWith('followers');

    await act(async () => root.unmount());
  });

  it('moves selection and focus forward on ArrowRight and ArrowDown', async () => {
    const onValueChange = vi.fn();
    const rendered = await renderIntoBody({
      value: 'a',
      options: THREE_OPTIONS,
      onValueChange,
    });

    const [first] = rendered.buttons();
    first!.focus();

    await pressKey(first!, 'ArrowRight');
    expect(onValueChange).toHaveBeenLastCalledWith('b');
    expect(document.activeElement).toBe(rendered.buttons()[1]);

    await pressKey(first!, 'ArrowDown');
    expect(onValueChange).toHaveBeenLastCalledWith('b');

    await rendered.unmount();
  });

  it('moves selection backward on ArrowLeft and ArrowUp, wrapping at the ends', async () => {
    const onValueChange = vi.fn();
    const rendered = await renderIntoBody({
      value: 'a',
      options: THREE_OPTIONS,
      onValueChange,
    });

    const [first] = rendered.buttons();
    first!.focus();

    // Backward from the first option wraps to the last.
    await pressKey(first!, 'ArrowLeft');
    expect(onValueChange).toHaveBeenLastCalledWith('c');
    expect(document.activeElement).toBe(rendered.buttons()[2]);

    await pressKey(first!, 'ArrowUp');
    expect(onValueChange).toHaveBeenLastCalledWith('c');

    await rendered.unmount();
  });

  it('wraps forward from the last option to the first', async () => {
    const onValueChange = vi.fn();
    const rendered = await renderIntoBody({
      value: 'c',
      options: THREE_OPTIONS,
      onValueChange,
    });

    const last = rendered.buttons()[2]!;
    last.focus();

    await pressKey(last, 'ArrowRight');
    expect(onValueChange).toHaveBeenLastCalledWith('a');
    expect(document.activeElement).toBe(rendered.buttons()[0]);

    await rendered.unmount();
  });

  it('passes through a ref to the radiogroup element', async () => {
    const ref = createRef<HTMLDivElement>();
    const rendered = await renderIntoBody({ value: 'anyone', options: OPTIONS, ref });

    expect(ref.current?.getAttribute('role')).toBe('radiogroup');

    await rendered.unmount();
  });
});
