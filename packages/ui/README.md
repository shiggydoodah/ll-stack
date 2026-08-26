# @repo/ui

The component library and design system the frontend is built from. Everything sits on a token-based theming system, so the same components take on a different visual identity by swapping a small theme config.

This package is a port of [LL-UI](https://github.com/shiggydoodah/ll-ui), my standalone component library, vendored here as `@repo/ui` so the template ships a real UI layer instead of a placeholder. LL-UI is where it's developed, against a component playground and a render test per specimen, and that's the repo to read if you want the design system rather than the stack. It's pre-release there, so token and component names can still move; nothing pulls those changes into this copy for you.

`COMPONENTS.md` is the catalog. Read it before writing a component, so nobody writes a fourth button.

## Components

**Primitives** — single-element building blocks:

Avatar, Badge, Bars, Box, Button, Card, Checkbox, CheckboxButton, CountBadge, Divider, Grid, Icon, Input, List, LoadingDots, ProgressBar, Radio, RadioCard, Row / Stack, Select, Skeleton, Slider, Spinner, StatusDot, Switch, Table, Textarea, ToggleSwitch, Typography (Text, Heading, Display), VerifiedBadge

**Components** — composed pieces:

Accordion, ActionModal, AvatarCrop, Banner, Callout, Dialog, Drawer, DropDown, Fields, FileUpload, HoverCard, MessageBubble, MetricInput, PasswordStrengthMeter, Popover, ScrollArea, Tabs, Toast, Tooltip

**Integrations** — DataTable (TanStack Table) and Form (TanStack Form) wrappers.

**Hooks & providers** — `useCountdown`, `useDebouncedAsync`, `useFileUpload`, `useMediaQuery`, plus a notification provider.

## How the design system works

Components never hard-code visual decisions. Colour, type, radius, shadows, borders, motion and even letter casing all come from a `--ui-*` CSS token contract. A theme is a small `theme.json` — at most 12 palette colours, three font roles, three radii, three shadows — compiled to CSS by `pnpm --filter @repo/ui themes:build`, and you pick theme and mode with two attributes:

```html
<html data-theme="default" data-mode="dark"></html>
```

One theme ships here: `default`, which is light-first with soft radii and a quiet indigo accent. `apps/frontend/app/layout.tsx` stamps `data-theme` and `components/ModeToggle.tsx` owns `data-mode`. Adding a second theme means a new `themes/<name>/theme.json` and a regenerate, rather than a stylesheet rewrite.

On top of that, components share a consistent `tone` / `variant` / `size` prop API, so `<Button tone="green" variant="outline">` looks right under any theme. That portability is the reason the token contract exists: the same component code moves between projects with completely different branding.

## Specimens

Components ship with a colocated `.specimen` file — a small definition of the prop surface and showcase variants, a bit like a lightweight Storybook story without the tooling. The registry in `src/specimens/` powers a render test that mounts every one of them, so each component gets a smoke test for free. `scripts/verify-component-catalog.mjs` then fails the build when an exported folder has no specimen and no entry in the script's grandfathered list, and when `COMPONENTS.md` and the barrels disagree.

There's no playground app in this repo. That's ll-lab, and it stays upstream in LL-UI; preview a component here by rendering it in `apps/frontend`. The `ui-lab only` comments left on some specimens are a leftover from the port.

## Working on it

```bash
pnpm --filter @repo/ui test      # vitest
pnpm --filter @repo/ui verify    # lint, typecheck, tests, theme/CSS/catalog checks
pnpm verify:ui                   # the above, then the frontend that consumes it
```

`CONTEXT.md` maps the package for agents, including the checklist for adding a component. The rules for consuming these in the app are in `docs/agents/frontend.agents.md`.

## Works with

- React 19 / React DOM 19 (peer dependencies)
- TypeScript — the package is source-shipped, so the consuming app's bundler compiles it
- Tailwind CSS v4 + tw-animate-css — the app installs them and owns the CSS build
- Zod 4 — the theme schema and the form integration
- Radix UI under the hood for the tricky interactive parts
