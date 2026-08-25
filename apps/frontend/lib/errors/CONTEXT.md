# Context: apps/frontend/lib/errors

## Purpose

- The typed error vocabulary shared by throw sites and error boundaries, plus
  the filters that keep known-benign browser noise out of the log stream.

## Architecture

| File                       | Role                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `expected-error.ts`        | `ExpectedError` — a deliberate "this page cannot render" throw. Carries `digest = 'expected:<CODE>'`. |
| `expected-error-codes.ts`  | `EXPECTED_ERROR_CODES` — the registered code → `{ title, body, recovery }` copy catalog.              |
| `parse-boundary-error.ts`  | Maps a boundary's `error.digest` back to registered copy (or generic).                                |
| `next-control-flow.ts`     | `isNextControlFlowSignal` — recognises `redirect()`/`notFound()` throws.                              |
| `benign-browser-errors.ts` | `isBenignResizeObserverError` — the self-correcting `ResizeObserver` notification.                    |

## Key Flows

- Production Next **strips a server-thrown error's message** before it reaches
  the client boundary; only `digest` survives. So the code travels in the digest
  and `EXPECTED_ERROR_CODES` is the boundary's only copy source. Client-thrown
  errors set the digest too, so there is one parsing path.
- Throw site (e.g. `app/(members)/dashboard/page.tsx` when the dashboard read
  fails) → nearest `error.tsx` → `ErrorScreen` → `parseBoundaryError` →
  registered copy, and a `client.error.expected` (warn) log record rather than
  `client.error.boundary` (error).
- `LoggingProvider` uses the two filters to drop control-flow signals and the
  benign resize notification before emitting.

## Gotchas

- `expected-error.ts` must stay importable from **both** server and client
  components: no `'server-only'`, no `'use client'`, no React, no logging
  imports. Adding any of those breaks every boundary.
- A new code must be registered in `expected-error-codes.ts` in the same change
  that throws it — an unregistered digest falls back to generic copy silently.
- Copy must be leak-free: no backend error codes, endpoints, statuses, or
  internals.
- `ExpectedError` is rung 5 of the error ladder ("the page _is_ this data").
  Recoverable failures should degrade in place instead.

## Agent Notes

- Grow the catalog one genuine case at a time, never speculatively.
- Every file here has a colocated `*.test.ts`; extend it with the change.
