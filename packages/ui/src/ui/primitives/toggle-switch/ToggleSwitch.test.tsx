// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToggleSwitch } from './ToggleSwitch';

const OPTIONS = [
  { value: 'anyone', label: 'Anyone' },
  { value: 'followers', label: 'Followers' },
];

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
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

    expect(html).toContain('bg-tone-red');
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
});
