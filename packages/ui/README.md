# @repo/ui

A theme-agnostic React primitives library + design system. Components read
every visual decision — colour, type, radius, shadows, borders, motion, letter
case — from a `--ui-*` CSS token contract, and a theme is just a small JSON
config compiled to CSS. Slot the same components into any product and any
visual identity.

## Install & setup

Two CSS imports and one attribute:

```css
/* app entry stylesheet */
@import '@repo/ui/styles.css'; /* Tailwind + tokens + base (theme-agnostic) */
@import '@repo/ui/themes/default'; /* the theme(s) you use — only these cost bytes */
```

```html
<html data-theme="default" data-mode="light"></html>
```

Peer dependencies: `react ^19`, `react-dom ^19`, `zod ^4`, Tailwind CSS v4 in
the consuming app. In this monorepo the package is consumed as a workspace
dependency (`"@repo/ui": "workspace:*"`); `apps/frontend` is the worked example
— see its `app/globals.css` for the two imports and `app/layout.tsx` for the
`data-theme` attribute.

```tsx
import { Button, Card, Input } from '@repo/ui';

<Button tone="green" variant="solid">
  Save
</Button>;
```

## Import surfaces

| Subpath                 | Contents                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `@repo/ui`              | Root barrel (client-safe only in client components)            |
| `…/primitives`          | Single-element building blocks (Button, Input, Badge, …)       |
| `…/components`          | Composed components (Dialog, Drawer, DropDown, fields, …)      |
| `…/integrations`        | TanStack Form + Table wrappers                                 |
| `…/hooks` `…/providers` | Shared hooks / context providers                               |
| `…/icons`               | `Icon` wrapper + full lucide-react re-export                   |
| `…/types`               | `UiTone`, `UiVariant`, `UiSize`                                |
| `…/specimens`           | Dev-only component preview registry (for ui-lab / theme tools) |
| `…/theme`               | Theme config zod schema + pure CSS generator                   |
| `…/styles.css`          | The shared stylesheet entrypoint                               |
| `…/themes/<name>`       | One theme's CSS (`default`, `eightbit`, …)                     |

Server components must import from the sub-paths, never the top-level barrel
(it re-exports client hooks and TanStack Form).

## Theming

A theme lives in `themes/<name>/`:

```
themes/eightbit/
  theme.json      # hand-written config (the future theme-builder exports this)
  custom.css      # optional structural CSS the tokens can't express
  fonts/*.woff2   # optional self-hosted fonts (embedded as data URIs at build)
  tokens.gen.css  # GENERATED — do not edit
  index.css       # GENERATED entrypoint: tokens + custom.css
```

`theme.json` is deliberately constrained: **max 12 named palette colours** (the
only place raw hex is allowed — every colour role references a palette name or
a `color-mix(… {name} …)` expression), **max 3 fonts** (`body`, `display`,
`mono`), **3 radii**, **3 shadows**, border width/style, motion (fast/slow/
easing), and display case/tracking. Both `light` and `dark` modes are required,
but only `background`, `foreground`, `accent` and the six tone hues are
mandatory — everything else (borders, text tiers, input fills, skeleton, tone
contrast colours) derives automatically, so a hand-written theme stays ~40
lines. See `themes/default/theme.json` for a minimal example and
`themes/eightbit/theme.json` for a maximal one.

```bash
pnpm themes:build          # validate + regenerate all themes
pnpm themes:build --check  # CI staleness check (part of `pnpm verify`)
```

### How the pieces fit

1. **`src/styles/tokens.css`** declares the `--ui-*` contract with neutral
   fallbacks — an app with no theme import renders like default-light.
2. **`src/styles.css`** bridges tokens into Tailwind utilities via
   `@theme inline` (`bg-tone-red`, `font-display`, …) so utilities resolve at
   the element that uses them — which is what makes theme islands work.
3. **Generated theme CSS** scopes token values under `[data-theme='<name>']`
   with `[data-mode]` blocks for light/dark. No `:root` rules — a theme applies
   only where you put its attribute:
   - whole app: `<html data-theme="eightbit" data-mode="dark">`
   - theme island: `<section data-theme="eightbit">` inherits the page's mode
   - mode island: `<div data-mode="light">` inside a themed subtree
4. **`custom.css`** chains after the tokens for structural styling — e.g.
   eightbit's press-into-shadow buttons — by targeting the stable class hooks
   (`.ui-btn`, `.ui-field`, `.ui-card`, `.ui-dialog`, `.ui-badge`,
   `.ui-display-text`, …). Components never change per theme.

### The focus ring

The animated conic focus ring is the library default and is fully
token-coloured (`--ui-focus-ring`, `--ui-focus-ring-background`) — most themes
just recolor it. A theme wanting a different mechanism overrides it in
`custom.css` (see `themes/eightbit/custom.css` for the hard-outline recipe).

## Icons

Use the shared `Icon` wrapper for consistent sizing and accessibility defaults.
Import Lucide symbols from `@repo/ui/icons`.

```tsx
import { Icon } from '@repo/ui';
import { AlertTriangle, Search } from '@repo/ui/icons';

<Icon icon={Search} />
<Icon icon={AlertTriangle} decorative={false} label="Warning" />
```

## Development

- `COMPONENTS.md` — catalog of every export (what to compose).
- `CONTEXT.md` — authoring guide (how to add/change components).
- `pnpm --filter @repo/ui verify` — lint, typecheck, theme staleness,
  CSS export/purity/guardrail checks, component catalog.
- Preview a component by rendering it in `apps/frontend` (`pnpm dev` at the repo
  root) under both themes and both modes.
