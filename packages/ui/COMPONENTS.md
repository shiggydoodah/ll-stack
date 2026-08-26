# `@repo/ui` — Component Catalog

**Audience: agents (and humans) composing app UI.** This is the _index_ of every
building block `@repo/ui` ships, so you can pick the right one without reading the
source tree. It is intentionally lean — one line and the distinctive props per
component. For the full typed prop API, open the component's `index.ts`; for a
working usage example, open its colocated specimen. Pointers are at the foot of each
section.

For authoring components _inside_ this package (styling, tokens, how to add one),
see `CONTEXT.md`. For the rules on consuming these in the app, see
`docs/agents/frontend.agents.md`.

## How to use this file

1. Scan for the component that fits — sections group by layer and purpose.
2. Note its **import path** (the heading) and **key props** (the row).
3. Need the full prop list? → open `src/ui/<layer>/<name>/index.ts`.
4. Need a usage example? → open the colocated `src/ui/<layer>/<name>/<name>.specimen.*`.

**Import paths** (mirrors `docs/agents/frontend.agents.md`):

| Need                                    | Import from             |
| --------------------------------------- | ----------------------- |
| Primitives                              | `@repo/ui/primitives`   |
| Composed components                     | `@repo/ui/components`   |
| Form integration (TanStack Form)        | `@repo/ui/integrations` |
| Hooks                                   | `@repo/ui/hooks`        |
| Providers                               | `@repo/ui/providers`    |
| Icons                                   | `@repo/ui/icons`        |
| All of the above minus icons, plus `cn` | `@repo/ui` (barrel)     |

The root barrel re-exports the primitives, components, hooks, integrations and
providers surfaces plus `cn` — everything except icons, types, specimens and
the theme tooling, which stay subpath-only.

> **Server components** MUST import from the sub-paths (`@repo/ui/primitives`,
> `@repo/ui/icons`, …), never the top-level `@repo/ui` barrel — it re-exports
> client hooks and TanStack Form and is not RSC-safe.

**Shorthand used in the Key-props column:**

- `tone(7)` → the brand tones: `neutral · red · green · amber · blue · purple · magenta`
- `size(5)` → `xsmall · small · medium · large · xlarge`
- `·` separates the allowed options for a prop. Defaults noted in parentheses where non-obvious.

---

## Primitives — import from `@repo/ui/primitives`

### Layout

| Component                | Use for                                                                                                                       | Key props                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Box`                    | Single-element surface container with variant, padding, optional max-width.                                                   | `variant: ghost·surface·soft·outline` · `padding: none·xs·sm·md·lg·xl·2xl` · `maxWidth: xs·sm·md·lg·xl`                                   |
| `Stack` · `Row` · `Flex` | Flex containers — `Stack` vertical, `Row` horizontal (responsive by default; `responsive={false}` to stay a row), `Flex` raw. | `gap` · `padding` (none·xs…2xl) · `align: start·center·end·stretch·baseline` · `justify: start·center·end·between·around·evenly` · `wrap` |
| `Grid` · `GridItem`      | Responsive CSS-grid container with typed column props; nest or use `GridItem` for cell spans.                                 | `cols: 1–6` (per-breakpoint) · `gap: xs·sm·md·lg·xl` · `colSpan` · `rowSpan: 1–6`                                                         |
| `Divider`                | Horizontal rule with optional label and alignment.                                                                            | `tone: neutral·subtle·strong` · `thickness: thin·medium·thick` · `label` · `labelAlign: start·center·end`                                 |
| `List`                   | Compound icon list — `List.Root` (`ul`), `List.Item` (`li`), `List.ItemIcon` + preset status icons.                           | `List.ItemIcon`: `tone(7 + accent)` · `size: sm·md·lg` · `icon` — presets `CheckIcon`·`XIcon`·`InfoIcon`·`WarningIcon`·`BanIcon`          |

### Typography

| Component                      | Use for                                            | Key props                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Text` (`.P`/`.Label`/`.Span`) | Body text on the shared text scale + body font.    | `as: span·p·label` · `size: 2xs·xs·small·medium·large·xl·2xl` · `weight: regular·medium·semibold·bold·extrabold·black` · `tracking` · `leading` · `tone: default·accent·muted·subtle` |
| `Heading` (`.H1`–`.H6`)        | Semantic heading on the shared typography scale.   | `level: h1–h6` (each level carries a monotonic size default) · `size: 2xs·xs·small·medium·large·xl·2xl` · `weight` · `tracking` · `leading` · `tone`                                  |
| `Display`                      | Large non-semantic display text (heading scale).   | `level: h1–h6` · `size: 2xs·xs·small·medium·large·xl·2xl` · `weight` · `tracking` · `leading` · `tone`                                                                                |
| `Eyebrow`                      | Small section label with optional decorative rule. | `variant: horizontal·vertical·stacked` · `display: block·inline` · `size: small·medium·large·xl` · `tone(7)` · `lineTone`                                                             |

### Form controls

| Component        | Use for                                                                            | Key props                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Input`          | Text input primitive.                                                              | `type` · `isValid` · `isPending` · `placeholder`                                                                    |
| `Textarea`       | Multi-line text input with resize.                                                 | `rows` · `placeholder` · `disabled`                                                                                 |
| `Select`         | Native `<select>` with custom chevron.                                             | `multiple` · `disabled`                                                                                             |
| `Checkbox`       | Checkbox input — controlled or uncontrolled.                                       | `checked` / `defaultChecked` · `onCheckedChange` · `onChange`                                                       |
| `CheckboxButton` | Checkbox styled as a toggle button (multi-select option groups).                   | `selected` · `size: small·medium`                                                                                   |
| `Radio`          | Radio button input.                                                                | `name` · `value`                                                                                                    |
| `RadioCard`      | Boxed selectable option for single-select groups.                                  | `selected` · `indicator: radio·checkbox`                                                                            |
| `ToggleSwitch`   | Segmented toggle for binary/ternary choice.                                        | `options` · `value` · `onValueChange` · `size: small·medium` · `disabled`                                           |
| `Switch`         | iOS-style on/off switch (`button[role="switch"]`).                                 | `checked` · `onCheckedChange` · `size: small·medium` · `aria-label` required                                        |
| `Slider`         | Range input — single/dual-thumb, numeric or named options, optional marks/readout. | `value` · `min` · `max` · `step` · `range` · `options` · `tone(7)` · `size: sm·md·lg` · `orientation` · `showValue` |

### Buttons

| Component                              | Use for                                                                                                                      | Key props                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` · `ButtonLink` · `IconButton` | Actions / form submit (`Button`), link-as-button (`ButtonLink`, needs `href`), icon-only (`IconButton`, needs `aria-label`). | `variant: solid·surface·outline·ghost` · `tone(7)` (default red) · `size(5)` · `loading` · `fullWidth` · `shape: square·circle` (IconButton) |

### Data display

| Component         | Use for                                                                                                                                                                 | Key props                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Avatar`          | Circular user avatar with initials fallback + optional online dot.                                                                                                      | `initials` · `src` · `alt` · `size: xs·sm·md·lg·xl` · `online` · `statusTone(7)` · `ring`                                                                            |
| `Badge`           | Compact label for status / categorisation.                                                                                                                              | `tone(7)` (default neutral) · `variant: solid·surface·soft·outline` (default surface)                                                                                |
| `CountBadge`      | Numeric counter for notifications/messages (circle for one digit, pill for many).                                                                                       | `count` · `max` · `tone(7)` · `variant: solid·surface·soft·outline` · `size(5)` · `dot` · `ring`                                                                     |
| `VerifiedBadge`   | Small circular "verified" tick badge.                                                                                                                                   | `tone(7)` (default blue) · `size(5)` · `label` (default "Verified")                                                                                                  |
| `StatusDot`       | Round presence/state indicator with optional pulse + label pill.                                                                                                        | `tone(7)` · `size(5)` · `pulse` · `ring` · `label`                                                                                                                   |
| `Card`            | Generic bordered surface for grouping content.                                                                                                                          | `tone: default·danger`                                                                                                                                               |
| `Bars`            | Minimal vertical bar-series chart for a numeric series (server-safe, no hooks).                                                                                         | `data: {value, title?}[]` · `max` · `labelStart`/`labelEnd` · `aria-label` required · `role="img"`                                                                   |
| `Table` (+ parts) | Presentational table chrome (sorting/data via the `DataTable` integration). Parts: `Table·TableHeader·TableBody·TableFooter·TableRow·TableHead·TableCell·TableCaption`. | `density: compact·comfortable` · `stickyHeader` · `containerClassName` (`Table`) · `align: left·center·right` (`TableHead`/`TableCell`) · `interactive` (`TableRow`) |

### Feedback & loading

| Component     | Use for                                                                      | Key props                                                                                   |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Spinner`     | Loading spinner (decorative by default).                                     | `size: xs·sm·md·lg·xl` · `decorative` · `label`                                             |
| `LoadingDots` | Secondary loading indicator for feeds / progressive content.                 | `size: xs·sm·md·lg·xl` · `decorative` · `label`                                             |
| `Skeleton`    | Loading placeholder for content with a known shape.                          | `preset: heading·text·button`                                                               |
| `ProgressBar` | Determinate or indeterminate progress, optional caption/percentage.          | `value` · `max` · `tone(7)` · `size: xs·sm·md·lg` · `indeterminate` · `showValue` · `label` |
| `Icon`        | Wrapper for Lucide icons — consistent sizing + a11y (decorative by default). | `icon` (LucideIcon) · `size: xs·sm·md·lg·xl` · `decorative` · `label`                       |

_Full props → `src/ui/primitives/<name>/index.ts` (e.g. `primitives/button/index.ts`). Live example → the colocated `<name>.specimen.*` in the component folder. No specimen yet (read `index.ts`): `avatar`, `card`, `checkbox-button`, `icon`, `loading-dots`, `radio-card`, `skeleton`, `spinner`, `toggle-switch`, `Eyebrow`._

<!-- @ui-folders: avatar, badge, bars, box, button, card, checkbox, checkbox-button, count-badge, divider, flex, grid, icon, input, list, loading-dots, progress-bar, radio, radio-card, select, skeleton, slider, spinner, status-dot, switch, table, textarea, toggle-switch, typography, verified-badge -->

---

## Components — import from `@repo/ui/components`

Composed, multi-element components. Most are compound (a parent plus parts you
nest); the `parts:` note lists the sub-components, all exported from the same path.

### Modals & overlays

| Component         | Use for                                                                             | Key props / parts                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog`          | Centred modal — overlay, portal, focus trap, Escape-to-close, default close button. | `open` · `onOpenChange` · `animation: none·fade·scale` · `hideClose` · parts: `Trigger·Content·Overlay·Header·Title·Description·Footer·Close`                                                                                           |
| `Drawer`          | Panel sliding from a screen edge, opt-in drag-to-dismiss; modal or non-modal.       | `direction: top·right·bottom·left` · `open` · `onOpenChange` · `modal` · `dragToDismiss` (default false — swipe only moves the panel when true) · `snapPoints` · parts: `Trigger·Content·Overlay·Header·Footer·Title·Description·Close` |
| `ActionModal`     | Generic confirm/cancel modal — title, body, Enter-submit, loading + dismiss lock.   | `open` · `onOpenChange` · `title` · `onConfirm` · `onCancel` · `confirmTone` · `pending` · `animation: none·fade·scale`                                                                                                                 |
| `AvatarCropModal` | Crop a profile photo to a 1:1 square (pan/zoom); returns the pixel crop rect.       | `open` · `imageSrc` · `onConfirm(area)` · `onCancel` · `busy`                                                                                                                                                                           |

### Popovers & hints

| Component   | Use for                                                                  | Key props / parts                                                                                                                                |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Popover`   | Floating surface anchored to a trigger (non-modal) — menus, small forms. | `open` · `onOpenChange` · `modal` · parts: `Trigger·Content·Arrow·Anchor·Close`                                                                  |
| `Tooltip`   | Hint text on hover/focus (tap-to-toggle on touch).                       | `content` · `side: top·right·bottom·left` · `align: start·center·end` · `openDelay` · `closeDelay` · `disabled` · parts: `Trigger·Content·Arrow` |
| `HoverCard` | Preview surface on hover/focus (non-modal); suppressed on touch.         | `open` · `onOpenChange` · `openDelay` · `closeDelay` · `disableOnMobile` · parts: `Trigger·Content·Arrow·Preview`                                |

### Disclosure & navigation

| Component   | Use for                                                     | Key props / parts                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Accordion` | Collapsible sections (FAQ-style), ARIA-wired.               | `type: single·multiple` · `collapsible` · `variant: separated·contained·ghost` · `size: small·medium·large` · parts: `Item·Trigger·Content`                                             |
| `Tabs`      | In-page tab set (ARIA tablist), keyboard nav, lazy content. | `value` · `onValueChange` · `variant: underline·pill` · `indicator: inset·centered` · `tone(7)` · `size: small·medium·large` · `align: start·justified` · parts: `List·Trigger·Content` |

### Notifications

| Component              | Use for                                                                                                                | Key props / parts                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Toaster` + `notify()` | Transient toasts — mount `Toaster` once, then call `notify.success/error/info/warning/message/loading/custom/promise`. | `Toaster`: Sonner props (position, duration, theme…) · `notify(message, { description, action, duration })`  |
| `Banner`               | Full-width, site-wide announcement (maintenance, outage, promo).                                                       | `tone(7)` · `variant: solid·surface·soft·outline` · `dismissible` · `title` · `icon` · `action`              |
| `Callout`              | Inline in-content notice (small sibling of Banner) — hints/warnings in forms/cards.                                    | `tone(7)` · `variant: subtle·solid·surface·soft·outline` · `size: sm·md` · `dismissible` · `icon` · `action` |

### Content & composed inputs

| Component               | Use for                                                                                                                                                    | Key props / parts                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MessageBubble`         | Chat bubble — sent/received, optional avatar, timestamp, delivery status.                                                                                  | `variant: sent·received` · `senderName` · `timestamp` · `status: sending·sent·delivered·read` · `avatar` · `actions`                                                      |
| `MetricInput`           | Number input paired with a switchable unit; the form value stays in one canonical unit while the user views/edits another (weight/length/volume + custom). | `value` · `onChange` (canonical) · `dimension: weight·length·volume` · `units` · `canonicalUnit` · `displayUnit` · `selector: auto·toggle·select` · `min·max` · `invalid` |
| `ScrollArea`            | Scroll container with a styled overlay scrollbar.                                                                                                          | `orientation: vertical·horizontal·both` · `hideScrollbar` · `type` · `viewportRef` · `aria-label`                                                                         |
| `PasswordStrengthMeter` | Visual password-strength indicator (0–5 scale).                                                                                                            | `strength: 0–5` · `rightContent`                                                                                                                                          |
| `DropDown`              | Value-select combobox (Radix Popover + cmdk) — **a value picker, not a generic menu**.                                                                     | `options` · `value` · `onChange` · `multiple` · `searchable` · `maxCount` · `showSelectAll` · `renderOption`                                                              |
| `FileUpload`            | Accessible file uploader — button or drag-drop, single/multi, accept/size validation.                                                                      | `accept` · `multiple` · `minFiles` · `maxFiles` · `maxSize` · `value` · `onChange` · `tone(7)` · `variant` · `size(5)` · `dropzone` · `label` · `hint` · `error`          |
| `Field` (+ parts)       | Field-accessibility system — id/ARIA wiring + label/hint/error around any control (validation-library-agnostic).                                           | parts: `Field·FieldControl·FieldLabel·FieldError·FieldHint·FieldGroupLabel·FieldRequiredIndicator·FieldContextProvider` + `useFieldContext`                               |

_Full props → `src/ui/components/<name>/index.ts`. Live example → the colocated `<name>.specimen.*` in the component folder. No specimen yet (read `index.ts`): `avatar-crop`, `fields`, `popover`, `toast`._

<!-- @ui-folders: accordion, action-modal, avatar-crop, banner, callout, dialog, drawer, dropdown, fields, file-upload, hover-card, message-bubble, metric-input, password-strength-meter, popover, scroll-area, tabs, toast, tooltip -->

---

## Form integration — import from `@repo/ui/integrations`

TanStack Form bindings. Build a form with `useAppForm`, render with `Form`, and use
the bound fields below (they read/write form state directly — no manual wiring).

### Form core

| Export                                                                                               | Use for                                                                 | Signature / props                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `useAppForm`                                                                                         | Create the form hook (field validation + state).                        | `useAppForm({ defaultValues, validators, onSubmit })`                       |
| `Form` · `FormSection` · `FormRow`                                                                   | Form wrapper + grouping/layout helpers.                                 | `<Form form={form}>` · `FormSection` (title, description) · `FormRow` (gap) |
| `SubmitButton` · `FormErrors`                                                                        | Submit button with busy state · top-level/API error display.            | `SubmitButton` (variant, tone, size) · `FormErrors` (`errors`)              |
| `FormBusyProvider` · `useFormBusyContext`                                                            | Track submission state; disable fields during async work.               | `<FormBusyProvider>` · `useFormBusyContext()`                               |
| `withForm` · `withFieldGroup` · `useSelector` · `useFormValue` · `useFormTask` · `focusFirstInvalid` | Composition HOCs, state selectors, async task tracking, focus-on-error. | see `integrations/form/index.ts`                                            |
| `makeZodFormValidator` · `makeBlurValidator`                                                         | Build Zod validators (submit / blur).                                   | `makeZodFormValidator(schema)` · `makeBlurValidator(schema)`                |

### Bound fields

All accept the standard TanStack field props plus `label`, `hint`, `required`,
`validateOnBlur`. Distinctive props listed below.

`TextField` types that own a native picker (`date`, `time`, `datetime-local`,
`month`, `week`) open that picker when the field is focused or clicked, rather
than only from the browser's indicator icon.

| Field                      | Use for                                             | Key props                                                                  |
| -------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `TextField`                | Single-line text.                                   | `type` · `placeholder` · `showValid` · `autoComplete`                      |
| `TextAreaField`            | Multi-line text.                                    | `rows` · `placeholder`                                                     |
| `PasswordField`            | Password input with strength meter + reveal toggle. | `minLength` (default 12) · `showValid`                                     |
| `CheckboxField`            | Single boolean checkbox.                            | —                                                                          |
| `CheckboxButtonGroupField` | Multi-select buttons → `string[]`.                  | `items`                                                                    |
| `RadioGroupField`          | Vertical radio group → `string`.                    | `items`                                                                    |
| `RadioButtonGroupField`    | Horizontal button-style radio group.                | `items`                                                                    |
| `SelectField`              | Native dropdown select.                             | `options` · `placeholder`                                                  |
| `ComboBoxField`            | Searchable combobox (wraps `DropDown`) → `string`.  | `options` · `searchable` (default true) · `emptyMessage`                   |
| `SliderField`              | Numeric/option slider, single or dual-thumb range.  | `min` · `max` · `step` · `marks` · `range` · `showValue` · `tone` · `size` |
| `FileUploadField`          | File upload with drag-and-drop → `File[]`.          | `accept` · `multiple` · `maxFiles` · `minFiles` · `maxSize` · `dropzone`   |
| `ChipSelectField`          | Single-select chip group → `string`.                | `options`                                                                  |

_Full API → `src/ui/integrations/form/index.ts` (+ `fields/`, `submit/`). Examples → real usage in `apps/frontend` (e.g. `app/(public)/login/LoginForm.tsx`)._

### DataTable

TanStack Table bindings rendered through the `Table` primitive. Drive it with `columns` + `data` + opt-in flags, or pass a pre-built `table` instance (escape hatch). App-specific cell content (badges, avatars, monospace, actions) lives in your column definitions.

| Export      | Use for                                                                                         | Key props                                                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable` | Sortable / selectable / paginated data table with row-click, loading skeleton, and empty state. | `columns` · `data` · `table` (escape hatch) · `enableSorting` · `enableRowSelection` · `pagination: boolean·ManualPagination` · `pageSize` · `density` · `stickyHeader` · `onRowClick` · `isLoading` · `emptyState` · per-column `meta.align` |

_Also re-exports `createColumnHelper` · `flexRender` and the key types (`ColumnDef`, `SortingState`, `RowSelectionState`, `PaginationState`, `ColumnMeta`, plus `TanStackRow`/`TanStackTable` — the generic `Row`/`Table` names aliased to avoid clashing with the UI primitives) from `@tanstack/react-table`, so consumers never import the library directly. Full API → `src/ui/integrations/data-table/index.ts`._

---

## Hooks — import from `@repo/ui/hooks`

| Hook                | Use for                                                          | Signature                                                                                                                  |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `useCountdown`      | Countdown timer from remaining ms.                               | `useCountdown({ initialRemainingMs, durationMs })` → `{ mmss, minutes, seconds, hasExpired, percentElapsed, remainingMs }` |
| `useDebouncedAsync` | Debounce an async fn (type-ahead); drops out-of-order responses. | `useDebouncedAsync(fn, { delay })` → `{ state, run, reset }`                                                               |
| `useFileUpload`     | Manage file selection + validation (count/size/type/dupes).      | `useFileUpload({ value, accept, maxFiles, minFiles, maxSize, … })`                                                         |
| `useMediaQuery`     | Subscribe to a CSS media query (SSR-safe, false during SSR).     | `useMediaQuery(query)` → `boolean`                                                                                         |

---

## Providers — import from `@repo/ui/providers`

| Export                                              | Use for                                                                        | Signature / props                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `NotificationProvider`                              | Mount at app root — wires the toast + banner stack with dismissal persistence. | `<NotificationProvider banners storage toasterProps>`       |
| `useNotifications`                                  | Access the active banner stack + imperative `notify()` API.                    | `useNotifications()`                                        |
| `createLocalStorageAdapter` · `createMemoryAdapter` | Persistence backends for banner dismissals.                                    | `createLocalStorageAdapter(key?)` · `createMemoryAdapter()` |

---

## Icons — import from `@repo/ui/icons`

| Export                    | Use for                                | Notes                                               |
| ------------------------- | -------------------------------------- | --------------------------------------------------- |
| `Icon`                    | Consistent icon sizing + a11y wrapper. | `<Icon icon={SomeLucideIcon} size />`               |
| _(all of `lucide-react`)_ | Any Lucide icon, re-exported directly. | `import { ArrowLeft, Check } from '@repo/ui/icons'` |

---

## Utilities — import from `@repo/ui`

| Export | Use for                                                              | Signature                  |
| ------ | -------------------------------------------------------------------- | -------------------------- |
| `cn`   | Merge Tailwind + conditional classes safely (clsx + tailwind-merge). | `cn(...inputs)` → `string` |

---

## Keeping this catalog current

This file is hand-maintained and guarded. When you add or change a component:

- Add/update its row here, and add the folder slug to that section's `@ui-folders`
  manifest comment.
- `node ./scripts/verify-component-catalog.mjs` (run by `pnpm verify:ui`) fails if a
  primitive/component **folder** is exported but missing from the manifest, or vice
  versa. It is folder-granular: a brand-new export added _inside_ an existing folder
  is not caught here — keep its row accurate via the "How to add a new component"
  checklist in `CONTEXT.md` and the in-package specimen render test. The integrations, hooks,
  and providers sections are checklist-maintained, not guarded.
