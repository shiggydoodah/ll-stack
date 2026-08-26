// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DropDown } from './DropDown';
import type { DropDownGroup, DropDownOption } from './DropDown';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const flatOptions: DropDownOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

const groupedOptions: DropDownGroup[] = [
  {
    label: 'Fruits',
    options: [
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
    ],
  },
  { label: 'Veggies', options: [{ value: 'carrot', label: 'Carrot' }] },
];

// ── Suite 1: Single select ─────────────────────────────────────────────────────

describe('Single select', () => {
  it('renders trigger with placeholder', () => {
    render(<DropDown options={flatOptions} placeholder="Pick one" />);
    expect(screen.getByRole('combobox').textContent).toContain('Pick one');
  });

  it('opens popover on click', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Apple')).not.toBeNull();
  });

  it('closes popover after selection', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Apple'));
    expect(screen.queryByText('Banana')).toBeNull();
  });

  it('calls onChange with selected value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropDown options={flatOptions} onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Apple'));
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('shows selected value in trigger', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Apple'));
    expect(screen.getByRole('combobox').textContent).toContain('Apple');
  });

  it('controlled: external value change reflects in trigger', () => {
    const { rerender } = render(<DropDown options={flatOptions} value="apple" />);
    expect(screen.getByRole('combobox').textContent).toContain('Apple');
    rerender(<DropDown options={flatOptions} value="banana" />);
    expect(screen.getByRole('combobox').textContent).toContain('Banana');
  });

  it('disabled: trigger not clickable', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} disabled />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Apple')).toBeNull();
  });

  it('renders flat options in list', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} />);
    await user.click(screen.getByRole('combobox'));
    for (const opt of flatOptions) {
      expect(screen.queryByText(opt.label)).not.toBeNull();
    }
  });

  it('renders grouped options with headings', async () => {
    const user = userEvent.setup();
    render(<DropDown options={groupedOptions} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Fruits')).not.toBeNull();
    expect(screen.queryByText('Veggies')).not.toBeNull();
    expect(screen.queryByText('Carrot')).not.toBeNull();
  });
});

// ── Suite 2: Multi-select ─────────────────────────────────────────────────────

describe('Multi-select', () => {
  it('selecting item shows chip', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} multiple />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Apple'));
    expect(screen.queryByRole('button', { name: 'Remove Apple' })).not.toBeNull();
  });

  it('clicking chip X removes it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DropDown options={flatOptions} multiple value={['apple', 'banana']} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove Apple' }));
    expect(onChange).toHaveBeenCalledWith(['banana']);
  });

  it('maxCount shows "+N more" chip', () => {
    render(
      <DropDown
        options={flatOptions}
        multiple
        value={['apple', 'banana', 'cherry']}
        maxCount={2}
      />,
    );
    expect(screen.queryByText('+1 more')).not.toBeNull();
  });

  it('clicking "+N more" expands the chip list without touching the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DropDown
        options={flatOptions}
        multiple
        value={['apple', 'banana', 'cherry']}
        maxCount={2}
        onChange={onChange}
      />,
    );

    // Collapsed: the overflow chip is hidden behind the toggle.
    expect(screen.queryByRole('button', { name: 'Remove Cherry' })).toBeNull();

    await user.click(screen.getByText('+1 more'));

    // Expanded: every chip is visible and the selection was not mutated.
    expect(screen.queryByRole('button', { name: 'Remove Cherry' })).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    // The toggle collapses the list again.
    await user.click(screen.getByText('Show less'));
    expect(screen.queryByRole('button', { name: 'Remove Cherry' })).toBeNull();
    expect(screen.queryByText('+1 more')).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('showSelectAll selects all values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropDown options={flatOptions} multiple showSelectAll onChange={onChange} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Select all'));
    expect(onChange).toHaveBeenCalledWith(['apple', 'banana', 'cherry']);
  });

  it('showClearAll clears all values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DropDown
        options={flatOptions}
        multiple
        showClearAll
        value={['apple', 'banana']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Clear all'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('backspace removes last chip when popover is closed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DropDown options={flatOptions} multiple value={['apple', 'banana']} onChange={onChange} />,
    );
    screen.getByRole('combobox').focus();
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['apple']);
  });

  it('renders grouped options in multi mode', async () => {
    const user = userEvent.setup();
    render(<DropDown options={groupedOptions} multiple />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Fruits')).not.toBeNull();
    expect(screen.queryByText('Veggies')).not.toBeNull();
  });
});

// ── Suite 3: Searchable (static) ──────────────────────────────────────────────

describe('Searchable (static)', () => {
  it('search input visible on open', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByPlaceholderText('Search…')).not.toBeNull();
  });

  it('typing filters by label', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), 'app');
    expect(screen.queryByText('Apple')).not.toBeNull();
    expect(screen.queryByText('Banana')).toBeNull();
  });

  it('typing filters by tags', async () => {
    const user = userEvent.setup();
    const opts: DropDownOption[] = [
      { value: 'a', label: 'Alpha', tags: ['first'] },
      { value: 'b', label: 'Beta', tags: ['second'] },
    ];
    render(<DropDown options={opts} searchable />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), 'first');
    expect(screen.queryByText('Alpha')).not.toBeNull();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('no match shows emptyMessage', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable emptyMessage="Nothing here" />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), 'zzz');
    expect(screen.queryByText('Nothing here')).not.toBeNull();
  });

  it('clearing search shows all options', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable />);
    await user.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Search…');
    await user.type(input, 'app');
    await user.clear(input);
    for (const opt of flatOptions) {
      expect(screen.queryByText(opt.label)).not.toBeNull();
    }
  });

  it('whitespace-only search shows all options', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), '   ');
    for (const opt of flatOptions) {
      expect(screen.queryByText(opt.label)).not.toBeNull();
    }
  });
});

// ── Suite 4: Searchable (async) ───────────────────────────────────────────────
// Debounce tests open the popover under real timers (so Radix's focus-management
// setTimeout fires naturally), then use synchronous fireEvent.change to simulate
// rapid typing under fake timers. fireEvent is synchronous and avoids the async
// act() path that React 18 uses with concurrent mode — which would hang when fake
// timers are installed. After firing events, advanceTimersByTime makes the debounce
// fire exactly once with the final value, regardless of machine speed.

describe('Searchable (async)', () => {
  it('onSearch called once after typing (debounced)', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<DropDown options={[]} searchable onSearch={onSearch} searchDebounce={10} />);
    await user.click(screen.getByRole('combobox'));
    vi.useFakeTimers();
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.change(input, { target: { value: 'fo' } });
    fireEvent.change(input, { target: { value: 'foo' } });
    vi.advanceTimersByTime(20);
    vi.useRealTimers();
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('foo');
  });

  it('isLoading=true shows spinner', async () => {
    const user = userEvent.setup();
    render(
      <DropDown
        options={flatOptions}
        searchable
        onSearch={vi.fn()}
        isLoading
        searchDebounce={10}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), 'a');
    expect(screen.queryByRole('status')).not.toBeNull();
  });

  it('isLoading=false hides spinner', async () => {
    const user = userEvent.setup();
    render(
      <DropDown
        options={flatOptions}
        searchable
        onSearch={vi.fn()}
        isLoading={false}
        searchDebounce={10}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), 'a');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('whitespace-only input does not call onSearch', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<DropDown options={[]} searchable onSearch={onSearch} searchDebounce={10} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), '   ');
    // Guard in handleSearchChange prevents scheduling for whitespace-only queries
    expect(onSearch).not.toHaveBeenCalled();
    // Also wait past debounce to confirm it never fires
    await new Promise((r) => setTimeout(r, 50));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('grouped async results rendered', async () => {
    const user = userEvent.setup();
    render(<DropDown options={groupedOptions} searchable onSearch={vi.fn()} searchDebounce={10} />);
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Search…'), 'a');
    expect(screen.queryByText('Fruits')).not.toBeNull();
    expect(screen.queryByText('Veggies')).not.toBeNull();
  });

  it('custom searchDebounce fires once per burst', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<DropDown options={[]} searchable onSearch={onSearch} searchDebounce={10} />);
    await user.click(screen.getByRole('combobox'));
    // Open under real timers (Radix), then switch to fake timers for deterministic
    // control of the debounce. fireEvent.change is synchronous so it doesn't block
    // on React 18's async act() scheduler when fake timers replace setTimeout.
    vi.useFakeTimers();
    const input = screen.getByPlaceholderText('Search…');
    fireEvent.change(input, { target: { value: 'h' } });
    fireEvent.change(input, { target: { value: 'hi' } });
    vi.advanceTimersByTime(20);
    vi.useRealTimers();
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('hi');
  });
});

// ── Suite 5: Filter box naming ────────────────────────────────────────────────
// The filter box borrows the trigger's own name so several searchable dropdowns
// on one page don't all announce the same generic label. Assertions read
// `aria-label` directly rather than the full accessible name because cmdk also
// stamps its own `aria-labelledby` on the input, pointing at an empty element —
// that reference contributes no text, so the name falls through to `aria-label`.

const searchBoxName = () => screen.getByPlaceholderText('Search…').getAttribute('aria-label');

describe('Filter box naming', () => {
  it('borrows the text of the label element the trigger references', async () => {
    const user = userEvent.setup();
    render(
      <>
        <span id="interests-label">Interests</span>
        <DropDown options={flatOptions} searchable aria-labelledby="interests-label" />
      </>,
    );
    await user.click(screen.getByRole('combobox'));
    expect(searchBoxName()).toBe('Filter Interests options');
  });

  it('borrows the referenced label when opened from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <>
        <span id="country-label">Country</span>
        <DropDown options={flatOptions} searchable aria-labelledby="country-label" />
      </>,
    );
    screen.getByRole('combobox').focus();
    await user.keyboard('{Enter}');
    expect(searchBoxName()).toBe('Filter Country options');
  });

  it('derives from the trigger aria-label when there is no label element', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable aria-label="City" />);
    await user.click(screen.getByRole('combobox'));
    expect(searchBoxName()).toBe('Filter City options');
  });

  it('falls back to a generic name when the trigger is unnamed', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} searchable />);
    await user.click(screen.getByRole('combobox'));
    expect(searchBoxName()).toBe('Filter options');
  });

  it('names each dropdown distinctly when a page renders several', async () => {
    const user = userEvent.setup();
    render(
      <>
        <span id="a-label">Country</span>
        <DropDown options={flatOptions} searchable aria-labelledby="a-label" />
        <span id="b-label">State</span>
        <DropDown options={flatOptions} searchable aria-labelledby="b-label" />
      </>,
    );
    const [first, second] = screen.getAllByRole('combobox');
    await user.click(first!);
    expect(searchBoxName()).toBe('Filter Country options');
    await user.keyboard('{Escape}');
    await user.click(second!);
    expect(searchBoxName()).toBe('Filter State options');
  });
});

// ── Suite 6: Scrolling inside a scroll-locked surface ─────────────────────────
// A Drawer/Dialog wraps itself in `react-remove-scroll`, which listens on
// `document` and cancels every `wheel`/`touchmove` originating outside its own
// subtree. The popover is portaled to `document.body`, so the lock counts the
// option list as "outside" and eats the gesture — the list renders scrollable
// but refuses to move (e.g. a multi-select inside a filter drawer). The content
// keeps those events away from `document`, which is what these assert: the lock
// never gets the chance to cancel them.

const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox'));
  const list = document.querySelector('[cmdk-list]');
  expect(list).not.toBeNull();
  return list as HTMLElement;
};

describe('Scroll gestures over the option list', () => {
  // Stands in for the scroll lock's own document listener. Tracked so a failed
  // assertion can't leave a spy attached for the rest of the file.
  const attached: [string, EventListener][] = [];
  const spyOnDocument = (type: string) => {
    const listener = vi.fn();
    document.addEventListener(type, listener);
    attached.push([type, listener]);
    return listener;
  };

  afterEach(() => {
    for (const [type, listener] of attached.splice(0)) {
      document.removeEventListener(type, listener);
    }
  });

  it('does not let a wheel event reach the document-level scroll lock', async () => {
    const user = userEvent.setup();
    const documentListener = spyOnDocument('wheel');

    render(<DropDown options={flatOptions} />);
    fireEvent.wheel(await openList(user), { deltaY: 120 });

    expect(documentListener).not.toHaveBeenCalled();
  });

  it('does not let a touchmove event reach the document-level scroll lock', async () => {
    const user = userEvent.setup();
    const documentListener = spyOnDocument('touchmove');

    render(<DropDown options={flatOptions} multiple />);
    fireEvent.touchMove(await openList(user));

    expect(documentListener).not.toHaveBeenCalled();
  });

  it('contains overscroll so a gesture past the end does not scroll the page', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} />);
    const list = await openList(user);

    expect(list.className).toContain('overscroll-contain');
  });
});

// ── Suite 7: Keyboard operability without a search box ────────────────────────
// cmdk's Arrow/Enter handling lives on the Command root and only fires for keys
// bubbling up from inside it. With `searchable=false` nothing inside the
// Command subtree used to be focusable, so Radix focused `Popover.Content` (an
// ancestor) and the list was completely keyboard-dead. A visually hidden
// `Command.Input` now keeps focus inside cmdk.

describe('Keyboard operability (non-searchable)', () => {
  it('selects the highlighted option with Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropDown options={flatOptions} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    // cmdk highlights the first option by default.
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('apple');
    // Single select closes on selection.
    expect(screen.queryByText('Banana')).toBeNull();
  });

  it('moves the highlight with the arrow keys before selecting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropDown options={flatOptions} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('toggles options from the keyboard in multiple mode without closing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropDown options={flatOptions} multiple onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['apple']);

    // The popover stays open for further keyboard toggling.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['apple', 'banana']);
  });

  it('works when opened from the keyboard alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DropDown options={flatOptions} onChange={onChange} />);

    screen.getByRole('combobox').focus();
    await user.keyboard('{Enter}'); // open
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('cherry');
  });

  it('exposes aria-controls on the trigger pointing at the listbox while open', async () => {
    const user = userEvent.setup();
    render(<DropDown options={flatOptions} />);
    const trigger = screen.getByRole('combobox');

    expect(trigger.getAttribute('aria-controls')).toBeNull();

    await user.click(trigger);
    const list = document.querySelector('[cmdk-list]') as HTMLElement;
    expect(list.id).toBeTruthy();
    expect(trigger.getAttribute('aria-controls')).toBe(list.id);

    await user.keyboard('{Escape}');
    expect(trigger.getAttribute('aria-controls')).toBeNull();
  });
});

// ── Suite 8: Debounce lifecycle ───────────────────────────────────────────────

describe('Debounced onSearch cleanup', () => {
  it('does not fire a pending onSearch after unmount', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const { unmount } = render(
      <DropDown options={[]} searchable onSearch={onSearch} searchDebounce={10} />,
    );
    await user.click(screen.getByRole('combobox'));

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'foo' } });
    unmount();
    vi.advanceTimersByTime(50);
    vi.useRealTimers();

    expect(onSearch).not.toHaveBeenCalled();
  });
});
