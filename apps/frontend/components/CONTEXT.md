# Context: apps/frontend/components

## Purpose

- App-shared React components — used by more than one route. Anything used by a
  single route belongs in that route's `_components/` instead.

## Architecture

| File                  | Role                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoggingProvider.tsx` | `'use client'`. Installs browser logging once on mount: flush-on-unload lifecycle, `window` error/rejection capture, and the one-off `client.session.start` record. Mounted high in the root layout. |
| `ErrorScreen.tsx`     | The shared error-boundary UI. Maps an `ExpectedError` digest back to registered copy, otherwise shows generic recovery copy.                                                                         |
| `NotFoundScreen.tsx`  | The shared 404 UI.                                                                                                                                                                                   |
| `ModeToggle.tsx`      | Light/dark toggle — sets `data-mode` on `<html>` and persists the choice.                                                                                                                            |
| `AppToaster.tsx`      | Toast host.                                                                                                                                                                                          |

`ErrorScreen` and `NotFoundScreen` have colocated `*.test.tsx` (vitest + jsdom
via the `// @vitest-environment jsdom` pragma).

## Key Flows

- `LoggingProvider` filters noise before emitting: Next control-flow signals
  (`isNextControlFlowSignal`) and the benign `ResizeObserver` notification
  (`isBenignResizeObserverError`) are dropped, never logged.
- `ErrorScreen` is what every `error.tsx` renders; the `scope` prop
  (`root`/group name) is what the log record records.

## Integrations

- Composes `@repo/ui` primitives — see `packages/ui/COMPONENTS.md` for the
  catalog. Never re-implement a primitive here.
- `lib/logging/*` for the client logger and event names, `lib/errors/*` for
  boundary-error parsing, `lib/routes.ts` for links.

## Gotchas

- `no-console` is an ESLint error in this app — log through `clientLogger`.
- `.tsx` files must use `const` arrow functions (ESLint `func-style`).
- Tailwind v4 shorthand only: `text-(--ui-foreground)`, never
  `text-[var(--ui-foreground)]`.
- Server Components must import `@repo/ui` sub-paths (`/primitives`, `/icons`),
  not the top-level barrel, which re-exports client hooks.

## Agent Notes

- Before adding a component, check `packages/ui/COMPONENTS.md` — the answer is
  usually composition, not a new file. A net-new `@repo/ui` primitive needs
  separate review (`docs/agents/frontend.agents.md`).
- Promote a route's `_components/` file here only when a second route actually
  needs it.
