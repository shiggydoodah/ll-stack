---
applyTo: 'packages/ui/**/*.{ts,tsx,css,json}'
---

# PR Review UI Package Rules

Use these checks for shared UI package changes in `packages/ui`.

## Source of truth

- Read `packages/ui/CONTEXT.md` before reviewing UI package changes.
- Treat `packages/ui` as a shared primitive/component library for frontend apps, not a place for app-specific feature UI.

## Component and API design

- Keep exports generic, composable, and stable for app consumers.
- Verify component props are typed narrowly and avoid leaking app-specific concepts into shared primitives.
- Preserve accessibility expectations for interactive components, including labels, keyboard behavior, focus states, and disabled/loading states.
- Keep shared theme tokens and styles reusable. App-specific layout, copy, route logic, and feature styling belong in app workspaces.
- Avoid unnecessary global CSS and check that shared styles do not unexpectedly override consuming apps.

## Styling and frontend compatibility

- Use the existing Tailwind and `cn` helper patterns.
- Check class merging, token usage, responsive behavior, and CSS export compatibility with frontend apps.
- Preserve React peer dependency expectations and avoid introducing frontend framework coupling beyond the package contract.
- For components intended for browser use, check SSR/hydration safety and avoid direct global access during render.

## UI testing and validation

- Require meaningful tests or consumer coverage when shared component behavior changes materially.
- Prefer `pnpm --filter @repo/ui lint` and `pnpm --filter @repo/ui typecheck` for package-local validation.
- For broad UI contract changes, expect affected frontend app validation as well.
