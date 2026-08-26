# Context: packages/utils

## Purpose

- `@repo/utils` — dependency-light, framework-free TypeScript helpers shared by
  the backend and the frontend. No React, no Node-only APIs, no zod.

## Architecture

Single barrel (`src/index.ts`), source-only (no build step — consumers compile
it):

| Module                          | Exports                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `strings/string-validations.ts` | `isBase64Format`                                                                                              |
| `dates/format-relative-time.ts` | `formatRelativeTime`, `formatRelativeTimeCompact`                                                             |
| `dates/format-local-date.ts`    | `formatClockTime`, `formatDayOfMonth`, `formatMonthAbbrev`, `formatWeekdayDateLong`, `formatWeekdayDateShort` |

Colocated vitest `*.test.ts` per module.

## Key Flows

- Imported directly (`import { formatRelativeTime } from '@repo/utils'`) by
  either tier; there is no per-domain subpath.

## Gotchas

- Date helpers resolve **local** wall-clock time. The frontend vitest config
  pins `TZ='Europe/London'` precisely so a UTC-only implementation cannot pass
  by accident on a UTC CI runner — keep that in mind when adding date code and
  its tests.
- `packages/ui` carries its own `src/lib/format-relative-time.ts`; the two are
  independent copies. Check both before assuming a fix propagates.
- Keep this package dependency-free — it is imported by the backend at runtime
  and by the browser bundle.

## Agent Notes

- Add a helper here only when both tiers use it; otherwise keep it local.
- Export it from `src/index.ts` explicitly (the barrel is a named-export list,
  not a `export *`).
