# UI Package Context

This package is the global reusable UI library. It exports primitive building blocks, brand styling tokens, generic recipes, a `cn` class-name helper, global Tailwind CSS, layered CSS entrypoints, field accessibility shells, and a TanStack Form integration.

Treat every component exported from `@ll-ui/react` as a reusable primitive for consumer apps. The package may encode brand style, accessibility wiring, composition patterns, and generic interaction recipes, but it must not know about frontend routes, app workflows, domain entities, backend contracts, or consumer-app business logic.

Build larger complex or app-specific components inside the frontend app by composing these UI primitives.

The public stylesheet is `@ll-ui/react/styles.css`, which imports Tailwind and internal layered token/base CSS. Themes are separate opt-in imports: `@ll-ui/react/themes/<name>` (see "Theming" below).

Use `pnpm --filter @ll-ui/react verify` when changing stylesheet or component contracts. It runs lint, typecheck, the theme staleness check, CSS export/purity/guardrail checks, and the component catalog check.

**Component catalog:** `COMPONENTS.md` is the agent-facing index of everything this package exports and how to import it — the fast path for _picking_ a component to compose. This file (`CONTEXT.md`) is the guide for _authoring_ components inside the package. Keep the catalog in sync when you add or change components (see the checklist below).

---

## Styling approach

### When to use Tailwind directly

One-off layout or utility classes with no tone/variant dimensions. No `*.styles.ts` file needed.

### When to use a `*.styles.ts` typed class map

Simple components with a tone × variant grid (fixed set of combinations). Define a `const toneClasses` object and a `satisfies Record<ComponentTone, Record<ComponentVariant, string>>` check.

**Example — Badge:**

```ts
// badge.styles.ts
export const badgeToneClasses = {
  neutral: {
    solid: 'border-(--ui-foreground) bg-(--ui-foreground) text-(--ui-background)',
    // ...
  },
  red: {
    solid: 'border-tone-red bg-tone-red text-tone-red-contrast',
    // ...
  },
  // all 7 tones
} satisfies Record<BadgeTone, Record<BadgeVariant, string>>;
```

Apply in the component: `cn(badgeBaseClass, badgeToneClasses[tone][variant], className)`.

### When to use CVA

Components with multiple **independent** styling axes (size, fullWidth, shape). Use CVA for those axes and a typed class map for tone × variant. Apply both via `cn()`.

**Example — Button:**

```ts
// button.styles.ts
export const buttonLayoutClass = cva('...base classes...', {
  variants: {
    size: {
      xsmall: 'h-7 ...',
      small: 'h-8 ...',
      medium: 'h-10 ...',
      large: 'h-11 ...',
      xlarge: 'h-12 ...',
    },
    fullWidth: { true: 'w-full' },
  },
  defaultVariants: { size: 'medium', fullWidth: false },
});
```

Apply in the component: `cn(buttonLayoutClass({ size, fullWidth }), buttonToneClasses[tone][variant], className)`.

---

## Shared types

Source of truth: `packages/ui/src/types/ui.types.ts`

```ts
export type UiTone = 'neutral' | 'red' | 'green' | 'amber' | 'blue' | 'purple' | 'magenta';
export type UiVariant = 'solid' | 'surface' | 'soft' | 'outline' | 'ghost';
export type UiSize = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge';
```

Component-level types narrow these with `Exclude<>` when a variant doesn't apply:

```ts
export type BadgeVariant = Exclude<UiVariant, 'ghost'>; // no ghost on Badge
export type ButtonVariant = Exclude<UiVariant, 'soft'>; // no soft on Button
```

Always import from `ui.types.ts` — never re-declare these types locally.

### Global ambient types (`globals.d.ts`)

`packages/ui/src/globals.d.ts` declares a separate set of types into the global TypeScript namespace (no import needed anywhere in the repo):

| Type            | Purpose                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `UiSize`        | Full size token set: `'3xl' \| '2xl' \| 'xl' \| 'large' \| 'medium' \| 'small' \| 'xs' \| '2xs'` |
| `UiFontSize`    | `Exclude<UiSize, '3xl'>` plus `'default'`                                                        |
| `UiFontColor`   | Semantic text colour roles: `'primary' \| 'secondary' \| 'tertiary'`                             |
| `UiTone`        | Extended tone set including dark variants and `'black' \| 'white'`                               |
| `UiUtilityTone` | Semantic state tones: `'danger' \| 'success' \| 'warning' \| 'info' \| 'disabled'`               |

Note: the global `UiSize` and `UiTone` in `globals.d.ts` are wider than the module-exported equivalents in `ui.types.ts`. The module types are used for component prop APIs; the global ambient types are used by typography and utility components that need the full token range. Never merge or alias them — they serve different contracts.

---

## Tone and colour rules

- **`neutral`** — uses `--ui-foreground` and `--ui-background` CSS variables. Adapts to the app's global colour scheme.
- **All other tones** — use the `tone-*` utilities generated from the `--ui-tone-*` token slots (e.g. `bg-tone-red`, `text-tone-red`). The tone _names_ are fixed API; themes reinterpret the hue (eightbit maps `blue` → cyan).
- For solid fills, the on-colour is always `text-tone-<tone>-contrast` — never a literal white/black. Each theme decides the contrast colour per tone.
- Use `/20` and `/10` opacity modifiers for surface and soft variants respectively — they compile to `color-mix()` over the tone variable and stay theme-driven.
- Radius, shadows, border width and motion also ride tokens: `rounded-(--ui-radius-sm|md|lg)`, `shadow-(--ui-shadow-sm|md|lg)`, `border-(length:--ui-border-width)`, `duration-(--ui-motion-fast|slow)`, `ease-(--ui-ease)`. Literal `rounded-md`/`shadow-sm` utilities are banned by the verify guard (`rounded-full` for genuinely circular things is the exception).
- Display-text chrome (buttons, badges, tab triggers, table headers, field labels) carries the `.ui-display-text` class; case and tracking come from `--ui-display-case`/`--ui-display-tracking`. Never hardcode `uppercase`/`tracking-*` on chrome (typography components' explicit props are the exception).
- Never hardcode hex values in components.

---

## The token contract (`src/styles/tokens.css`) and theming

`tokens.css` is the single authoritative `--ui-*` contract (~50 tokens) with
neutral fallback values that mirror the `default` theme's light mode. Themes
override the values; the NAMES are frozen — add tokens deliberately, never
rename. The verify guard fails if a component references a `--ui-*` name that
`tokens.css` does not declare.

Token groups (see `tokens.css` for the full annotated list):

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
| Shadows    | `--ui-shadow-sm`, `--ui-shadow-md`, `--ui-shadow-lg` (full box-shadow strings)                                            |
| Motion     | `--ui-motion-fast`, `--ui-motion-slow`, `--ui-ease`                                                                       |

The semantic typography scale (`globals.d.ts` → `UiFontColor`) maps `primary →
--ui-foreground`, `secondary → --ui-text-subtle`, `tertiary → --ui-text-muted`.
`--ui-text-muted` is the token for tertiary/eyebrow text and is not
interchangeable with `--ui-text-subtle`.

### Theming (`themes/<name>/`)

A theme is a folder: `theme.json` (hand-written config — max 12 palette
colours, 3 fonts, 3 radii, 3 shadows, border, motion, display case; validated
by the zod schema in `src/theme/config.ts`), optional `custom.css` (structural
styling tokens cannot express, targeting the stable `.ui-*` class hooks), and
generated `tokens.gen.css` + `index.css` (committed; regenerate with
`pnpm themes:build`, drift fails `verify`). The pure generator
(`src/theme/generate.ts`) is exported via `@ll-ui/react/theme` so external
tooling can produce identical CSS.

Apps import `@ll-ui/react/themes/<name>` after `styles.css` and set
`data-theme="<name>"` (plus `data-mode="light|dark"`) on `<html>` or any
element — themes scope to `[data-theme]`, never `:root`, so theme/mode islands
nest freely. Only imported themes cost bytes.

The stable class hooks for per-theme structural CSS: `.ui-btn`, `.ui-field`,
`.ui-badge`, `.ui-card`, `.ui-callout`, `.ui-banner`, `.ui-dialog`,
`.ui-popover`, `.ui-drawer`, `.ui-toast`, `.ui-dropdown`, `.ui-switch`,
`.ui-checkbox`, `.ui-radio`, `.ui-avatar`, `.ui-table`, `.ui-progress`,
`.ui-skeleton`, `.ui-display-text`.

**Rule:** Always write CSS variable utilities in Tailwind v4 shorthand — `text-(--ui-foreground)`, `border-(--ui-border)`, `bg-(--ui-background)`. The legacy form `text-[var(--ui-foreground)]` is banned by ESLint (`no-restricted-syntax` in `eslint.config.mjs`).

---

## File structure for new components

```
packages/ui/src/ui/<layer>/<name>/
  <name>.tsx          # component(s)
  <name>.styles.ts    # class map and/or CVA exports (when needed)
  <name>.specimen.tsx # defineSpecimen() preview contract (argTypes + variants)
  <name>.test.tsx     # vitest + jsdom tests
  index.ts            # re-exports components, props types, tone/variant types
```

The root barrel `packages/ui/src/index.ts` re-exports primitives, components, integrations, and `cn`. Other package surfaces are exposed through explicit subpath exports such as `@ll-ui/react/icons`, `@ll-ui/react/hooks`, and `@ll-ui/react/types`.

---

## How to add a new component

1. Determine the layer: `ui/primitives/` (single-element), `ui/components/` (composed), or `ui/integrations/` (third-party wrapper).
2. Create the folder `ui/<layer>/<name>/`.
3. In `<name>.styles.ts` (if needed):
   - Import `UiTone`, `UiVariant`, `UiSize` from `types/ui.types`.
   - Define component-scoped type aliases, narrowing with `Exclude<>` where needed.
   - Build a typed class map and/or CVA. Add `satisfies Record<...>` to catch missing entries.
4. In `<name>.tsx`, apply styles via `cn()`. No `data-theme` attribute, no hex values.
5. In `index.ts`, export the component, its props interface, and its tone/variant types.
6. Add the export to the layer barrel (`ui/<layer>/index.ts`).
7. Add a row to `COMPONENTS.md` (one-liner + import + key props) and add the new folder slug to that section's `<!-- @ui-folders: … -->` manifest. The catalog guard (`scripts/verify-component-catalog.mjs`, run by `verify`) fails if an exported primitive/component folder is missing from the catalog.
8. Create `<name>.specimen.tsx` next to the component using `defineSpecimen<Props>()` from `../../../specimens/define` — declare `argTypes` and at least one variant. Register it in `src/specimens/index.ts` (named export + the `allSpecimens` array); the catalog guard enforces both, and `src/specimens/specimens.render.test.tsx` renders every registered specimen automatically.
9. Add a route under `apps/ui-lab/src/routes/components/<layer>/<name>.tsx` (import the specimen from `@ll-ui/react/specimens`) and register it in `apps/ui-lab/src/nav.config.ts`.
10. Run `pnpm --filter @ll-ui/react verify && pnpm --filter @ll-ui/react test`, then eyeball the component in ui-lab (`pnpm dev`) under both themes and both modes.

### Keeping specimens in sync

When updating an existing component's props (new prop, renamed prop, changed options), open its colocated `<name>.specimen.tsx` and update `argTypes` and `variants` to match. Run `pnpm --filter @ll-ui/react test` after the change — the in-package render test fails when a specimen is out of sync. Also update the component's row in `COMPONENTS.md` if its key props changed.

---

## How to add a new tone or variant

**New tone** (e.g. adding `teal`) — prefer NOT to: themes can already remap any
existing tone's hue, which covers most needs without an API change. If a new
tone is genuinely warranted:

1. Add `'teal'` to `UiTone` in `types/ui.types.ts`.
2. Add `--ui-tone-teal` + `--ui-tone-teal-contrast` to `tokens.css`, the `@theme inline` bridge in `styles.css`, the config schema's tone list (`src/theme/config.ts`), and every `themes/*/theme.json`.
3. Add a `teal: { ... }` entry to every `*ToneClasses` map in every `*.styles.ts`. TypeScript will error on any map missing the new key (enforced by `satisfies Record<UiTone, ...>`).
4. Regenerate themes (`pnpm themes:build`).

**New variant** (e.g. adding `raised`):

1. Add `'raised'` to `UiVariant` in `types/ui.types.ts`.
2. For each component that should support it, add `'raised'` entries to its `*ToneClasses` map.
3. For components that exclude it, update their `Exclude<UiVariant, ...>` narrowing.

---

## What must not change

- The `--ui-*` token NAMES declared in `tokens.css` — they are the contract every theme is written against
- The tone names (`red`, `green`, `amber`, `blue`, `purple`, `magenta`) — themes remap hues, the prop API stays
- The stable `.ui-*` class hooks — theme custom.css files target them
- Any component's external prop API
- TypeScript strictness — no `as any`, no loose `string` types

---

## Package layers

The layers below describe how reusable UI building blocks are organized. Components in all layers should remain generic enough to be reused across consumer apps.

### `src/ui/primitives`

Single-element components — wrap exactly one HTML element or SVG: `Input`, `Textarea`, `Checkbox`, `Radio`, `Select`, `Button`, `Badge`, `Icon`, typography (`Heading`, `Display`, `Eyebrow`), `Spinner`, `Skeleton`, `LoadingDots`. Must stay form-state-agnostic. Importable from `@ll-ui/react` or `@ll-ui/react/primitives`.

### `src/ui/components`

Composed multi-element components built from primitives: `DropDown`, `PasswordStrengthMeter`, and the field accessibility system (`fields/`). Fields own id generation, ARIA wiring, and required/invalid/disabled state via context — they must stay validation-library-agnostic. Future additions: `Toast`, `Dialog`. Importable from `@ll-ui/react` or `@ll-ui/react/components`.

### `src/ui/integrations`

Third-party library wrappers — anything that imports an external library directly. Currently contains the TanStack Form integration: `useAppForm`, `withForm`, `Form`, layout helpers, async task tracking, focus-on-error, typed value selection, and TanStack-bound form fields (`TextField`, `SelectField`, etc.). The only layer that should import TanStack Form. Importable from `@ll-ui/react` or `@ll-ui/react/integrations`.

### `src/ui/icons`

Lucide icon re-export barrel. Importable from `@ll-ui/react/icons`.

### `src/ui/hooks`

Shared reusable hooks that are not tied to a specific integration. Currently empty — add hooks here when they are generic enough to be used across multiple features or consumer apps.

### `src/ui/providers`

Shared context providers that are not tied to a specific integration. Currently empty — add providers here when they are generic and app-domain-neutral.
