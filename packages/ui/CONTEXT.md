# Context: packages/ui

## Purpose

- `@repo/ui` — the global reusable UI library: primitives, composed components,
  third-party integrations, icons, hooks, providers, the `--ui-*` token
  contract, the theme generator, and the `cn` helper.
- Read/edit here when **authoring** a component inside the package. To **pick** a
  component to compose in the app, read `COMPONENTS.md` instead — it is the
  catalog. For the rules on consuming these in the app, read
  `docs/agents/frontend.agents.md`.

> **Origin note.** This package was ported from a standalone library published
> upstream as `@ll-ui/react`; here it is `@repo/ui` throughout. Two leftovers
> from that port are still around deliberately: the `ui-lab only` comments on
> the specimens (there is **no** `apps/ui-lab` workspace in this repo — preview
> a component by rendering it in `apps/frontend`), and the `ll-ui:` namespace on
> the notification provider's `localStorage` key
> (`DEFAULT_DISMISSED_BANNERS_KEY`), which is persisted user data rather than a
> name reference — renaming it would resurface every banner a user has already
> dismissed.

## Architecture

```
packages/ui/
  src/
    index.ts          barrel: primitives + components + hooks + integrations + providers + cn
    styles.css        public stylesheet (Tailwind + layered token/base CSS)
    styles/           tokens.css (the --ui-* contract), base, components, reset, index
    theme/            config.ts (zod theme schema), generate.ts (pure generator), index.ts
    types/ui.types.ts UiTone / UiVariant / UiSize — the module-exported prop types
    globals.d.ts      wider ambient UiSize/UiTone/UiFontSize/UiFontColor/UiUtilityTone
    lib/cn.ts         class-name helper
    specimens/        define.ts, the registry barrel, and the render test
    ui/primitives/    single-element components
    ui/components/    composed components
    ui/integrations/  third-party wrappers (TanStack Form, TanStack Table)
    ui/icons/         lucide re-export barrel
    ui/hooks/         useCountdown, useDebouncedAsync, useFileUpload, useMediaQuery
    ui/providers/     notification-provider
  themes/             default/ — theme.json + generated tokens.gen.css + index.css
  scripts/            generate-themes.ts, verify-css-exports.mjs, verify-component-catalog.mjs
  COMPONENTS.md       the agent-facing component catalog
```

Package exports: `.` (barrel), `./primitives`, `./components`, `./integrations`,
`./hooks`, `./providers`, `./icons`, `./types`, `./specimens`, `./theme`,
`./styles.css`, `./themes/*`.

**Layers.** `primitives/` wrap exactly one HTML element or SVG and stay
form-state-agnostic. `components/` compose primitives (including the `fields/`
accessibility system, which owns id generation and ARIA wiring and must stay
validation-library-agnostic). `integrations/` is the only layer that may import
an external library directly. All three must stay generic — no app routes, no
domain entities, no backend contracts.

Run `pnpm --filter @repo/ui verify` when changing stylesheet or component
contracts: lint, typecheck, the theme staleness check, the CSS export/purity
guard, and the component catalog guard. `pnpm --filter @repo/ui test` runs
vitest.

## Key Flows

### Styling approach

- **Plain Tailwind** — one-off layout with no tone/variant dimensions. No
  `*.styles.ts` file.
- **Typed class map** — a fixed tone × variant grid. Define `const toneClasses`
  with a `satisfies Record<ComponentTone, Record<ComponentVariant, string>>`
  check, then `cn(baseClass, toneClasses[tone][variant], className)`.
- **CVA** — for genuinely _independent_ axes (size, fullWidth, shape). Combine
  with the typed map through `cn()`:
  `cn(buttonLayoutClass({ size, fullWidth }), buttonToneClasses[tone][variant], className)`.

### Shared types

Source of truth is `src/types/ui.types.ts`:

```ts
export type UiTone = 'neutral' | 'red' | 'green' | 'amber' | 'blue' | 'purple' | 'magenta';
export type UiVariant = 'solid' | 'surface' | 'soft' | 'outline' | 'ghost';
export type UiSize = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge';
```

Components narrow with `Exclude<>` (`BadgeVariant = Exclude<UiVariant, 'ghost'>`,
`ButtonVariant = Exclude<UiVariant, 'soft'>`). Always import from `ui.types.ts`;
never re-declare locally.

`src/globals.d.ts` declares a **separate, wider** ambient set (`UiSize`,
`UiFontSize`, `UiFontColor`, `UiTone`, `UiUtilityTone`) used by typography and
utility components that need the full token range. The module types are the
component prop API. Never merge or alias the two — they serve different
contracts.

### Tone and colour rules

- `neutral` uses `--ui-foreground` / `--ui-background` and follows the app's
  colour scheme.
- Every other tone uses the `tone-*` utilities generated from the `--ui-tone-*`
  slots (`bg-tone-red`, `text-tone-red`). Tone _names_ are fixed API; themes
  remap the hue (a theme may map `blue` → cyan).
- Solid fills always use `text-tone-<tone>-contrast`, never a literal
  white/black.
- `/20` and `/10` opacity modifiers back the surface and soft variants; they
  compile to `color-mix()` over the tone variable.
- Radius, shadow, border width and motion ride tokens too:
  `rounded-(--ui-radius-sm|md|lg)`, `shadow-(--ui-shadow-sm|md|lg)`,
  `border-(length:--ui-border-width)`, `duration-(--ui-motion-fast|slow)`,
  `ease-(--ui-ease)`. Literal `rounded-md`/`shadow-sm` utilities fail the verify
  guard (`rounded-full` for genuinely circular things is the exception).
- Display-text chrome (buttons, badges, tab triggers, table headers, field
  labels) carries `.ui-display-text`; case and tracking come from
  `--ui-display-case` / `--ui-display-tracking`. Never hardcode
  `uppercase`/`tracking-*` on chrome.
- Never hardcode hex values.

### The token contract and theming

`src/styles/tokens.css` is the authoritative `--ui-*` contract (~50 tokens) with
neutral fallbacks mirroring the `default` theme's light mode. Themes override
values; the **names are frozen**. The verify guard fails if a component
references a `--ui-*` name `tokens.css` does not declare.

| Group      | Tokens                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Surfaces   | `--ui-background`, `--ui-background-subtle`, `--ui-background-muted`, `--ui-foreground`                                   |
| Accent     | `--ui-accent`, `--ui-accent-hover`                                                                                        |
| Borders    | `--ui-border`, `--ui-border-strong`, `--ui-border-hover`, `--ui-border-invalid`, `--ui-border-width`, `--ui-border-style` |
| Text       | `--ui-text-body`, `--ui-text-subtle` (secondary), `--ui-text-muted` (tertiary), `--ui-text-invalid`                       |
| Inputs     | `--ui-input-background`, `--ui-input-background-focus`, `--ui-input-background-invalid`                                   |
| Focus      | `--ui-focus-ring`, `--ui-focus-ring-background`                                                                           |
| Skeleton   | `--ui-skeleton-bg-start`, `--ui-skeleton-bg-mid`, `--ui-skeleton-bg-end`                                                  |
| Tone slots | `--ui-tone-{red,green,amber,blue,purple,magenta}` + `--ui-tone-<tone>-contrast`                                           |
| Typography | `--ui-font-body`, `--ui-font-display`, `--ui-font-mono`, `--ui-display-case`, `--ui-display-tracking`                     |
| Radius     | `--ui-radius-sm` (compact controls), `--ui-radius-md` (mid surfaces), `--ui-radius-lg` (fields, cards, dialogs)           |
| Shadows    | `--ui-shadow-sm`, `--ui-shadow-md`, `--ui-shadow-lg`                                                                      |
| Motion     | `--ui-motion-fast`, `--ui-motion-slow`, `--ui-ease`                                                                       |

The semantic typography scale maps `primary → --ui-foreground`,
`secondary → --ui-text-subtle`, `tertiary → --ui-text-muted`. `--ui-text-muted`
is tertiary/eyebrow text and is not interchangeable with `--ui-text-subtle`.

A **theme** is a folder under `themes/<name>/`: hand-written `theme.json` (max
12 palette colours, 3 fonts, 3 radii, 3 shadows, border, motion, display case —
validated by the zod schema in `src/theme/config.ts`), an optional `custom.css`
targeting the stable `.ui-*` class hooks, and the **committed generated**
`tokens.gen.css` + `index.css`. Regenerate with
`pnpm --filter @repo/ui themes:build`; drift fails verify. The pure generator
(`src/theme/generate.ts`) is exported via `@repo/ui/theme`.

Apps import `@repo/ui/themes/<name>` after `styles.css` and set
`data-theme="<name>"` (plus `data-mode="light|dark"`) on `<html>` or any
element — themes scope to `[data-theme]`, never `:root`, so theme/mode islands
nest freely. Only imported themes cost bytes.

Stable class hooks for per-theme structural CSS: `.ui-btn`, `.ui-field`,
`.ui-badge`, `.ui-card`, `.ui-callout`, `.ui-banner`, `.ui-dialog`,
`.ui-popover`, `.ui-drawer`, `.ui-toast`, `.ui-dropdown`, `.ui-switch`,
`.ui-checkbox`, `.ui-radio`, `.ui-avatar`, `.ui-table`, `.ui-progress`,
`.ui-skeleton`, `.ui-display-text`.

### Adding a component

```
packages/ui/src/ui/<layer>/<name>/
  <name>.tsx          component(s)
  <name>.styles.ts    class map and/or CVA exports (when needed)
  <name>.specimen.tsx defineSpecimen() preview contract (argTypes + variants)
  <name>.test.tsx     vitest + jsdom
  index.ts            re-exports components, props types, tone/variant types
```

1. Pick the layer: `primitives/` (single element), `components/` (composed),
   `integrations/` (wraps a third-party library).
2. In `<name>.styles.ts`, import `UiTone`/`UiVariant`/`UiSize` from
   `types/ui.types`, narrow with `Exclude<>`, and add `satisfies Record<...>` so
   a missing key is a type error.
3. In `<name>.tsx`, apply styles via `cn()`. No `data-theme` attribute, no hex.
4. Export the component, its props interface, and its tone/variant types from
   `index.ts`, then add it to the layer barrel (`ui/<layer>/index.ts`).
5. Add a row to `COMPONENTS.md` (one-liner + import + key props) **and** the
   folder slug to that section's `<!-- @ui-folders: … -->` manifest.
6. Add `<name>.specimen.tsx` using `defineSpecimen<Props>()` and register it in
   `src/specimens/index.ts` (named export **and** the `allSpecimens` array).
7. Run `pnpm --filter @repo/ui verify && pnpm --filter @repo/ui test`, then look
   at it in the frontend under both themes and both modes.

The catalog guard (`scripts/verify-component-catalog.mjs`) enforces steps 5 and
6 in both directions, including a `SPECIMEN_EXEMPT` list a new component must
join deliberately if it genuinely ships without one.

### Adding a tone or variant

**New tone** — prefer not to: themes can already remap any existing tone's hue.
If genuinely warranted: add it to `UiTone`, add `--ui-tone-<t>` +
`--ui-tone-<t>-contrast` to `tokens.css`, the `@theme inline` bridge in
`styles.css`, the tone list in `src/theme/config.ts`, and **every**
`themes/*/theme.json`; add the key to every `*ToneClasses` map (TypeScript will
point at each one); regenerate themes.

**New variant** — add it to `UiVariant`, add entries to the maps that should
support it, and update the `Exclude<>` narrowing on those that should not.

## Integrations

- Consumers: `apps/frontend` only (`transpilePackages` includes `@repo/ui`).
- Dependencies: Radix primitives, TanStack Form + Table, `cmdk`, `sonner`,
  `vaul`, `lucide-react`, `class-variance-authority`, `tailwind-merge`,
  Tailwind v4.
- Tailwind sees the app's classes through `@source '.'` in
  `apps/frontend/app/globals.css`.

## Gotchas

- **Write CSS-variable utilities in Tailwind v4 shorthand** —
  `text-(--ui-foreground)`, `border-(--ui-border)`. The legacy
  `text-[var(--ui-foreground)]` form is an ESLint error repo-wide.
- **Server Components must import sub-paths** (`@repo/ui/primitives`,
  `@repo/ui/icons`, …), never the top-level barrel — it re-exports client hooks
  and TanStack Form and is not RSC-safe.
- Generated theme CSS is committed; editing it by hand is undone by the next
  `themes:build` and fails the staleness check meanwhile.
- `.tsx` files must use `const` arrow functions (ESLint `func-style`).
- `src/lib/format-relative-time.ts` duplicates a helper in `@repo/utils`; they
  are independent.

## What must not change

- The `--ui-*` token **names** in `tokens.css` — every theme is written against
  them.
- The tone names (`red`, `green`, `amber`, `blue`, `purple`, `magenta`).
- The stable `.ui-*` class hooks that theme `custom.css` files target.
- Any component's external prop API.
- TypeScript strictness — no `as any`, no loose `string` types.

## Agent Notes

- Picking a component to use in the app? `COMPONENTS.md`, then
  `docs/agents/frontend.agents.md`. Authoring one? This file.
- Keep `COMPONENTS.md` and the specimen registry in sync in the same change;
  updating a component's props means updating its specimen's `argTypes` and
  `variants` (the in-package render test fails otherwise).
- A net-new primitive consumed by the frontend needs separate review before use.
