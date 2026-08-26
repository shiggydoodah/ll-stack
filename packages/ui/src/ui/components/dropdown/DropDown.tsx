'use client';

import { Command } from 'cmdk';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as Popover from '@radix-ui/react-popover';

import { cn } from '../../../lib/cn';
import { Spinner } from '../../primitives/spinner/Spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single selectable item in a {@link DropDown} list.
 */
export interface DropDownOption {
  /** Unique identifier used as the selection key. */
  value: string;
  /** Human-readable text shown in the trigger and option list. */
  label: string;
  /** Optional leading icon rendered before the label. */
  icon?: ReactNode;
  /** Additional keywords matched during client-side search filtering. */
  tags?: string[];
  /** When true the option is visible but cannot be selected. */
  disabled?: boolean;
}

/**
 * A labelled group of {@link DropDownOption} items rendered under a section heading.
 */
export interface DropDownGroup {
  /** Heading text displayed above the group in the list. */
  label: string;
  /** Options belonging to this group. */
  options: DropDownOption[];
}

/**
 * Props shared by both selection modes of {@link DropDown}. The mode-specific
 * `multiple`/`value`/`defaultValue`/`onChange` shape lives in {@link DropDownProps}.
 */
export interface DropDownBaseProps {
  /** Flat option list or grouped sections to render in the popover. */
  options: DropDownOption[] | DropDownGroup[];
  /**
   * When true, a search input is rendered at the top of the list for client-side filtering.
   *
   * @defaultValue `false`
   */
  searchable?: boolean;
  /**
   * Placeholder text shown in the trigger when no value is selected.
   *
   * @defaultValue `'Select…'`
   */
  placeholder?: string;
  /** Message shown when the filtered option list is empty. */
  emptyMessage?: string;
  /** Custom render function for an option row inside the list. */
  renderOption?: (option: DropDownOption) => ReactNode;
  /** Additional class names applied to the trigger element. */
  className?: string;
  /**
   * When true the trigger is inert and the popover cannot be opened.
   *
   * @defaultValue `false`
   */
  disabled?: boolean;
  /**
   * Maximum number of selection chips to show before collapsing into a "+N more" button.
   *
   * @defaultValue `3`
   */
  maxCount?: number;
  /**
   * Show a "Select all" button in the list header. Only applies in `multiple` mode.
   *
   * @defaultValue `false`
   */
  showSelectAll?: boolean;
  /**
   * Show a "Clear all" button in the list header. Only applies in `multiple` mode.
   *
   * @defaultValue `false`
   */
  showClearAll?: boolean;
  /**
   * Async search callback. When provided the option list is hidden until the user types,
   * and client-side filtering is disabled in favour of the server response.
   */
  onSearch?: (query: string) => void;
  /**
   * When true the list shows a spinner in place of options.
   *
   * @defaultValue `false`
   */
  isLoading?: boolean;
  /**
   * Debounce delay in milliseconds applied to the `onSearch` callback.
   *
   * @defaultValue `500`
   */
  searchDebounce?: number;
  /** Id applied to the focusable trigger. */
  id?: string;
  /**
   * Accessible name for the trigger when there is no labelling element to
   * reference. The `searchable` filter box derives its own name from this.
   */
  'aria-label'?: string;
  /**
   * Id of the labelling element, exposed on the trigger via `aria-labelledby`.
   * The trigger is a `<div role="combobox">` — not a labelable element — so it
   * must be named this way rather than with a `<label htmlFor>`. The
   * `searchable` filter box derives its own name from this element too.
   */
  'aria-labelledby'?: string;
  /** Ids of descriptive elements (hint/error) for the trigger's `aria-describedby`. */
  'aria-describedby'?: string;
  /** Marks the trigger as invalid for assistive tech. */
  'aria-invalid'?: boolean;
  /** Marks the trigger as required for assistive tech. */
  'aria-required'?: boolean;
  /** Fired when focus leaves the trigger (e.g. to mark a form field as touched). */
  onBlur?: () => void;
}

/**
 * Props for {@link DropDown}.
 *
 * `multiple` discriminates the value shape (mirroring SelectField's
 * `label`/`placeholder` union) so consumers get the exact `string` or
 * `string[]` type for their mode instead of a union they must re-narrow.
 */
export type DropDownProps = DropDownBaseProps &
  (
    | {
        /**
         * When true, multiple values can be selected simultaneously and are shown as chips.
         *
         * @defaultValue `false`
         */
        multiple?: false;
        /** Controlled selected value. Pair with `onChange` for controlled usage. */
        value?: string;
        /** Initial selected value for uncontrolled usage. */
        defaultValue?: string;
        /** Callback fired when the selection changes. */
        onChange?: (value: string) => void;
      }
    | {
        /** When true, multiple values can be selected simultaneously and are shown as chips. */
        multiple: true;
        /** Controlled selected values. Pair with `onChange` for controlled usage. */
        value?: string[];
        /** Initial selected values for uncontrolled usage. */
        defaultValue?: string[];
        /** Callback fired when the selection changes. */
        onChange?: (value: string[]) => void;
      }
  );

// ── Utilities ─────────────────────────────────────────────────────────────────

const isGrouped = (options: DropDownOption[] | DropDownGroup[]): options is DropDownGroup[] => {
  const first = options[0];
  return first !== undefined && 'options' in first;
};

const flattenOptions = (options: DropDownOption[] | DropDownGroup[]): DropDownOption[] => {
  if (isGrouped(options)) return options.flatMap((g) => g.options);
  return options;
};

const filterOptions = (
  options: DropDownOption[] | DropDownGroup[],
  query: string,
): DropDownOption[] | DropDownGroup[] => {
  const q = query.toLowerCase();
  const matchesOption = (o: DropDownOption) =>
    o.label.toLowerCase().includes(q) || (o.tags ?? []).some((t) => t.toLowerCase().includes(q));

  if (isGrouped(options)) {
    return options
      .map((g) => ({ ...g, options: g.options.filter(matchesOption) }))
      .filter((g) => g.options.length > 0);
  }
  return (options as DropDownOption[]).filter(matchesOption);
};

/**
 * Text an `aria-labelledby` resolves to, concatenated across every referenced
 * element the way a screen reader would. Empty when nothing resolves.
 */
const readLabelledByText = (ids: string): string =>
  ids
    .split(' ')
    .map((refId) => document.getElementById(refId)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');

const useDebounce = (fn: (query: string) => void, delay: number) => {
  const ref = useRef(fn);
  // Update the ref after render, not during, to satisfy react-hooks/refs.
  useLayoutEffect(() => {
    ref.current = fn;
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clear any pending call when the component unmounts (the TooltipRoot timer
  // cleanup pattern) — otherwise a debounced `onSearch` fires into a dead tree.
  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(
    (query: string) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => ref.current(query), delay);
    },
    [delay],
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  onRemove: () => void;
}

const DropDownChip = ({ label, onRemove }: ChipProps) => {
  return (
    <span className="inline-flex items-center gap-1 rounded-(--ui-radius-sm) border border-(--ui-border-strong) bg-(--ui-background-muted) px-1.5 py-0.5 text-sm">
      {label}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex items-center rounded-(--ui-radius-sm) opacity-60 hover:opacity-100 focus:outline-none"
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
};

interface OptionRowProps {
  option: DropDownOption;
  isSelected: boolean;
  renderOption?: (option: DropDownOption) => ReactNode;
  onSelect: (value: string) => void;
}

const OptionRow = ({ option, isSelected, renderOption, onSelect }: OptionRowProps) => {
  return (
    <Command.Item
      key={option.value}
      value={option.value}
      keywords={option.tags}
      disabled={option.disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-(--ui-radius-md) px-3 py-2 text-sm select-none',
        'text-(--ui-text-body) outline-none',
        'data-[selected=true]:bg-(--ui-background-muted)',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      )}
    >
      {renderOption ? (
        renderOption(option)
      ) : (
        <>
          {option.icon && <span className="shrink-0">{option.icon}</span>}
          <span className="flex-1">{option.label}</span>
        </>
      )}
      {isSelected && <Check className="ml-auto size-4 shrink-0 text-(--ui-accent)" />}
    </Command.Item>
  );
};

interface ListProps {
  options: DropDownOption[] | DropDownGroup[];
  selectedValues: string[];
  renderOption?: (option: DropDownOption) => ReactNode;
  onSelect: (value: string) => void;
  emptyMessage?: string;
  isLoading?: boolean;
  /** Reports the mounted listbox's id (undefined on unmount) for `aria-controls`. */
  onListboxIdChange?: (id: string | undefined) => void;
}

const DropDownList = ({
  options,
  selectedValues,
  renderOption,
  onSelect,
  emptyMessage = 'No options found.',
  isLoading,
  onListboxIdChange,
}: ListProps) => {
  // Stable so the ref only fires on mount/unmount — an inline callback would
  // re-fire (null, node) every render and thrash the parent's listbox-id state.
  const listRef = useCallback(
    (node: HTMLElement | null) => {
      onListboxIdChange?.(node?.id ?? undefined);
    },
    [onListboxIdChange],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner decorative={false} label="Loading" size="sm" />
      </div>
    );
  }

  const renderFlat = (opts: DropDownOption[]) =>
    opts.map((o) => (
      <OptionRow
        key={o.value}
        option={o}
        isSelected={selectedValues.includes(o.value)}
        renderOption={renderOption}
        onSelect={onSelect}
      />
    ));

  return (
    <Command.List
      // cmdk generates the listbox id itself and overwrites any `id` prop, so
      // it is read back off the node for the trigger's `aria-controls`.
      ref={listRef}
      className={cn(
        // `overscroll-contain` stops a wheel/touch gesture that runs past this
        // list's end from chaining out to the page behind — the popover is
        // portaled to `document.body`, so its scroll parent is the document,
        // not whatever surface the trigger sits on.
        'max-h-60 overflow-y-auto overscroll-contain p-1',
        isLoading && 'pointer-events-none opacity-50',
      )}
    >
      <Command.Empty className="py-4 text-center text-sm text-(--ui-text-muted)">
        {emptyMessage}
      </Command.Empty>

      {isGrouped(options)
        ? options.map((group) => (
            <Command.Group
              key={group.label}
              heading={group.label}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-(--ui-text-muted)"
            >
              {renderFlat(group.options)}
            </Command.Group>
          ))
        : renderFlat(options as DropDownOption[])}
    </Command.List>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Accessible single- and multi-select dropdown backed by Radix Popover and cmdk.
 *
 * Supports flat or grouped options, client-side keyword filtering, async server-side
 * search, keyboard navigation, and multi-select chips. Use `value` + `onChange` for
 * controlled mode; `defaultValue` alone for uncontrolled.
 *
 * @example
 * ```tsx
 * <DropDown options={options} onChange={setValue} placeholder="Pick one" />
 * ```
 *
 * @example
 * ```tsx
 * <DropDown options={groups} multiple searchable showClearAll />
 * ```
 */
export const DropDown = ({
  options,
  multiple = false,
  searchable = false,
  value,
  defaultValue,
  onChange,
  placeholder = 'Select…',
  emptyMessage,
  renderOption,
  className,
  disabled = false,
  maxCount = 3,
  showSelectAll = false,
  showClearAll = false,
  onSearch,
  isLoading = false,
  searchDebounce = 500,
  id,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: DropDownProps) => {
  const isAsync = onSearch !== undefined;
  const isControlled = value !== undefined;

  const initialValue = isControlled ? value : (defaultValue ?? (multiple ? [] : ''));

  const [internalValue, setInternalValue] = useState<string | string[]>(initialValue);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Whether the multi-select chip list shows every selection or collapses the
  // tail behind the "+N more" toggle.
  const [chipsExpanded, setChipsExpanded] = useState(false);
  // The trigger's aria-controls target. cmdk stamps its own generated id on the
  // listbox and offers no prop to override it, so the id is read back from the
  // mounted list element instead of being passed down.
  const [listboxId, setListboxId] = useState<string | undefined>(undefined);

  // `id` names the trigger, so the popover's filter box needs its own. Derived
  // from the trigger where there is one (debuggable, and unique because the
  // trigger id is), else generated — an unidentified field is skipped for
  // autofill and reported under DevTools > Issues.
  const fallbackId = useId();
  const searchInputId = `${id ?? fallbackId}-search`;
  // The non-searchable keyboard input needs its own id too — an unidentified
  // field is reported under DevTools > Issues (and trips the form-control lint).
  const keyboardInputId = `${id ?? fallbackId}-keyboard`;

  // The filter box (and the hidden keyboard input in non-searchable mode)
  // borrows the trigger's own name, so a page rendering several dropdowns
  // doesn't announce the same generic label for each one.
  // It has to be spelled as `aria-label`: cmdk spreads caller props *before*
  // stamping its own `aria-labelledby`, so anything we pass under that name is
  // overwritten and lost. Text behind an `aria-labelledby` is therefore read
  // from the DOM as the popover opens — see `handleOpenChange`.
  const [triggerLabelText, setTriggerLabelText] = useState('');
  // Gated on the prop as well as the captured text so a trigger that swaps a
  // referenced label for a plain `aria-label` doesn't keep the stale reading.
  const triggerName = (ariaLabelledBy && triggerLabelText) || ariaLabel;
  const searchAriaLabel = triggerName ? `Filter ${triggerName} options` : 'Filter options';

  const currentValue = isControlled ? value : internalValue;
  const selectedValues: string[] = multiple
    ? Array.isArray(currentValue)
      ? currentValue
      : currentValue
        ? [currentValue]
        : []
    : [];
  const singleValue = !multiple
    ? Array.isArray(currentValue)
      ? currentValue[0]
      : currentValue
    : '';

  const commit = useCallback(
    (next: string | string[]) => {
      if (!isControlled) setInternalValue(next);
      // The discriminated prop type guarantees `next` matches the mode's
      // handler; TS cannot correlate the two union sides here, so widen once.
      (onChange as ((value: string | string[]) => void) | undefined)?.(next);
    },
    [isControlled, onChange],
  );

  const debouncedSearch = useDebounce((q) => onSearch?.(q), searchDebounce);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (isAsync && q.trim()) debouncedSearch(q);
  };

  const handleSelect = (val: string) => {
    if (multiple) {
      const next = selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val];
      commit(next);
    } else {
      commit(val);
      setOpen(false);
    }
  };

  // Reading the label as the popover opens (it is already mounted beside the
  // trigger) keeps the filter box correctly named on its very first render,
  // where an effect would leave it generically named for a frame. Read for the
  // non-searchable (visually hidden) input too — it borrows the same name.
  const handleOpenChange = (next: boolean) => {
    if (next && ariaLabelledBy) {
      setTriggerLabelText(readLabelledByText(ariaLabelledBy));
    }
    setOpen(next);
  };

  const handleChipRemove = (val: string) => {
    const next = selectedValues.filter((v) => v !== val);
    commit(next);
  };

  const handleSelectAll = () => {
    const all = flattenOptions(options)
      .filter((o) => !o.disabled)
      .map((o) => o.value);
    commit(all);
  };

  const handleClearAll = () => {
    commit([]);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open && e.key === 'Backspace' && multiple && selectedValues.length > 0) {
      const next = selectedValues.slice(0, -1);
      commit(next);
    }
  };

  const trimmedQuery = searchQuery.trim();
  const displayedOptions =
    !isAsync && trimmedQuery ? filterOptions(options, trimmedQuery) : options;

  const showList = !isAsync || searchQuery.trim().length > 0;

  const allFlat = flattenOptions(options);
  const selectedLabels = selectedValues.map((v) => allFlat.find((o) => o.value === v)?.label ?? v);
  const singleLabel = !multiple ? allFlat.find((o) => o.value === singleValue)?.label : undefined;

  const visibleChips = chipsExpanded ? selectedValues : selectedValues.slice(0, maxCount);
  const overflowCount = selectedValues.length - maxCount;

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <Popover.Trigger asChild>
        <div
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-disabled={disabled}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          tabIndex={disabled ? -1 : 0}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleOpenChange(!open);
            }
            handleTriggerKeyDown(e);
          }}
          className={cn(
            'flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-(--ui-radius-lg) border border-(--ui-border-strong)',
            'bg-(--ui-input-background) px-3 py-2 text-sm text-(--ui-text-body)',
            'transition-[border-color,background-color] outline-none',
            'hover:border-(--ui-border-hover)',
            'focus-visible:border-(--ui-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-focus-ring)',
            disabled && 'cursor-not-allowed opacity-60',
            className,
          )}
        >
          {multiple ? (
            <span className="flex flex-1 flex-wrap gap-1">
              {selectedValues.length === 0 ? (
                <span className="text-(--ui-text-muted)">{placeholder}</span>
              ) : (
                <>
                  {visibleChips.map((v, i) => (
                    <DropDownChip
                      key={v}
                      label={selectedLabels[i] ?? v}
                      onRemove={() => handleChipRemove(v)}
                    />
                  ))}
                  {overflowCount > 0 && (
                    <button
                      type="button"
                      aria-expanded={chipsExpanded}
                      onClick={(e) => {
                        // Toggling the chip list must never mutate the
                        // selection — the chip reads "more", so acting as a
                        // delete control would silently destroy user state.
                        e.stopPropagation();
                        setChipsExpanded((expanded) => !expanded);
                      }}
                      className="inline-flex items-center rounded-(--ui-radius-sm) border border-(--ui-border-strong) bg-(--ui-background-muted) px-1.5 py-0.5 text-sm"
                    >
                      {chipsExpanded ? 'Show less' : `+${overflowCount} more`}
                    </button>
                  )}
                </>
              )}
            </span>
          ) : (
            <span className={cn('flex-1 text-left', !singleLabel && 'text-(--ui-text-muted)')}>
              {singleLabel ?? placeholder}
            </span>
          )}
          <ChevronDown className="ml-auto size-4 shrink-0 opacity-50" />
        </div>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          // Keep the option list scrollable inside a scroll-locked surface. A
          // Drawer/Dialog wraps itself in `react-remove-scroll`, which cancels
          // every `wheel`/`touchmove` that reaches `document` from outside its
          // own subtree. This content is portaled to `document.body`, so the
          // lock sees the list as "outside" and eats the gesture — the list
          // renders scrollable but refuses to move. Stopping propagation here
          // keeps those events from reaching the lock's document listener; the
          // browser still performs the scroll, and `overscroll-contain` on the
          // list keeps it from chaining out to the page behind.
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          className={cn(
            'z-50 w-(--radix-popover-trigger-width) min-w-48',
            'ui-dropdown rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border-strong) bg-(--ui-background) shadow-(--ui-shadow-md)',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <Command shouldFilter={false}>
            {searchable ? (
              <div className="flex items-center border-b border-(--ui-border-strong) px-3">
                <Search className="mr-2 size-4 shrink-0 opacity-50" />
                <Command.Input
                  id={searchInputId}
                  name="search"
                  value={searchQuery}
                  onValueChange={handleSearchChange}
                  placeholder="Search…"
                  aria-label={searchAriaLabel}
                  className="flex h-10 w-full bg-transparent py-3 text-sm text-(--ui-text-body) outline-none placeholder:text-(--ui-text-muted)"
                />
              </div>
            ) : (
              // Rendered even when not searchable: cmdk's Arrow/Enter handling
              // lives on the Command root and only fires for keys bubbling up
              // from inside it, but Radix's FocusScope focuses Popover.Content
              // — an *ancestor* — on open, leaving the list keyboard-dead. A
              // visually hidden input keeps focus (and cmdk's
              // aria-activedescendant wiring) inside cmdk. Its value is pinned
              // to '' so stray typing cannot invisibly filter the list.
              <Command.Input
                id={keyboardInputId}
                value=""
                aria-label={triggerName ?? placeholder}
                className="sr-only"
              />
            )}

            {(showSelectAll || showClearAll) && multiple && (
              <div className="flex gap-2 border-b border-(--ui-border-strong) px-3 py-1.5">
                {showSelectAll && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs text-(--ui-accent) hover:underline"
                  >
                    Select all
                  </button>
                )}
                {showClearAll && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs text-(--ui-text-muted) hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}

            {showList && (
              <DropDownList
                options={displayedOptions}
                selectedValues={multiple ? selectedValues : singleValue ? [singleValue] : []}
                renderOption={renderOption}
                onSelect={handleSelect}
                emptyMessage={emptyMessage}
                isLoading={isLoading}
                onListboxIdChange={setListboxId}
              />
            )}
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
