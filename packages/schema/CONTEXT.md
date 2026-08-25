# Context: packages/schema

## Purpose

- `@repo/schema` — the small set of zod primitives both tiers validate against,
  so a rule like "how long may a password be" has exactly one definition.

## Architecture

Single barrel (`src/index.ts`); every export is a zod schema, its inferred
type, or a bound constant:

| Module            | Exports                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `constants.ts`    | `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`                         |
| `email.ts`        | `emailSchema`, `Email`                                               |
| `name.ts`         | `nameSchema`, `Name`, `MIN_NAME_LENGTH`, `MAX_NAME_LENGTH`           |
| `display-name.ts` | `displayNameSchema`, `DisplayName`, min/max                          |
| `username.ts`     | `usernameSchema`, `Username`, min/max                                |
| `password.ts`     | `passwordSchema`, `Password`                                         |
| `token.ts`        | `createBase64TokenSchema(bytes)`, `base64TokenLength`, `Base64Token` |

Ships raw TypeScript for `types`/`import` and CommonJS `dist/` for `require`
(the backend `require()`s it at runtime). Tested with vitest colocated
`*.test.ts`.

## Key Flows

- Backend DTOs and the frontend's form/action schemas both build on these, so a
  bound cannot drift between the tier that validates the form and the tier that
  validates the request.
- `displayNameSchema` and `usernameSchema` are shipped ahead of use — the
  current auth surface only takes name, email, password, and consent.

## Gotchas

- These are **shared primitives**, not app schemas. Route-specific composition
  (`loginSchema.ts`, `createAccountSchema.ts`) stays in the app.
- Changing a bound is a contract change on both tiers: update the backend DTO
  and the frontend schema in the same PR, and regenerate clients if the OpenAPI
  shape moved.
- `zod` is a real dependency here (`catalog:`), unlike the type-only packages.

## Agent Notes

- Add a primitive here only when both tiers genuinely need it; a one-app rule
  belongs in that app.
- Every module has a colocated test — extend it in the same change.
