---
applyTo: 'apps/frontend/**/*.{ts,tsx}'
---

# PR Review Frontend Rules (Next.js App Router + React)

Use these checks for frontend changes in `apps/frontend`.

## Review priority

Apply checks in this order to avoid overwhelm. Focus only on sections relevant to the changed files. Skip sections that don't apply:

1. **Server/client boundaries & Session/auth safety** — Always review; merge-blocking issues
2. **Security for frontend-backend communication** — Required for API/backend-touching changes
3. **Contract and error handling** — Required when consuming backend APIs
4. **UX and responsiveness** — High-impact user-facing changes
5. **React performance, architecture, testing, validation** — Review as applicable

## Source of truth

- Read `apps/frontend/CONTEXT.md` and the nearest nested `CONTEXT.md` before reviewing source.
- Review frontend changes against `AGENTS.md`, `CONTEXT.md`, `apps/frontend/CONTEXT.md`, `apps/frontend/src/CONTEXT.md`, and `docs/charters/frontend.md`. If one of these files is not populated, skip that file entirely and continue with the remaining sources.
- Do not approve manual edits to generated `@repo/services` clients. Flag any such changes and require regeneration from source instead.

## Server/client boundaries

- Browser code must not call the backend directly.
- Backend-bound work must go through server-only modules (Server Components, Server Actions, or Route Handlers) and generated `@repo/services` clients.
- Verify the server-side backend caller preserves the internal backend URL, API secret handling, request ID propagation, optional bearer token handling, and refresh-on-401 where relevant.
- Ensure backend API secrets, access tokens, session tokens, sealed session internals, and sensitive user data never reach client-visible props, logs, URLs, browser storage, or cache keys.
- Require server environment reads to stay in server-only validation/config modules. Public environment must remain intentionally narrow.

## Session and auth safety

- Validate that session cookies remain HttpOnly and server-managed (set via `next/headers` cookies in server-only code).
- Ensure tampered, expired, or invalid sessions are handled safely and cleared when appropriate.
- Check robust handling of unauthenticated, expired-session, and forbidden responses.
- For destructive or high-risk mutations, flag missing replay/idempotency safeguards and CSRF-appropriate protections.

## UX and responsiveness

- Validate mobile-first behavior for changed flows before desktop checks.
- Check responsive layouts, touch targets, and content overflow on small screens.
- Flag accessibility regressions in critical flows (keyboard navigation, labels, focus states, contrast).
- Flag performance regressions in critical user flows (slow interactions, janky animations, large bundles).

## React performance and optimization

- Flag unnecessary re-renders and unstable props/function identities in hot components.
- Identify heavy client-side computation in render paths; recommend memoization or splitting where justified.
- Check large-list rendering patterns; require virtualization/pagination when needed.
- Review bundle/per-route impact and suggest code splitting or lazy-loading opportunities.

## Security for frontend-backend communication

- Ensure API requests do not expose sensitive values in logs, URLs, or browser storage.
- Validate auth/session handling is safe and consistent with backend expectations.
- Check robust handling of auth failures, expired sessions, and forbidden responses.
- Ensure user-controlled data is rendered safely (avoid XSS-prone patterns).
- Ensure cache/data handling is safe for user-scoped and sensitive content (no cross-user leakage via caching behavior).
- For cookie-authenticated mutations, flag missing CSRF-appropriate protections and replay/idempotency safeguards where flows are destructive or high-risk.

## Contract and error handling

- Verify frontend assumptions match backend API contracts for changed endpoints.
- Ensure fallback states, loading states, and error states are explicit and user-safe.
- Require generated service types to be used instead of duplicated ad hoc response shapes.
- Flag stale generated clients when backend DTO/controller/OpenAPI changes are consumed by frontend code.

## Frontend testing expectations

- Require test updates when behavior, API contracts, or critical user flows change.
- Call out missing material coverage as a review finding.
- Expect auth/session, Server Action / Route Handler, and route behavior tests for meaningful changes to those areas.

## Architecture and rollout alignment

- Ensure server/client boundaries align with the server-first model and avoid unnecessary large client trees.
- Check route handling against the App Router file conventions under `app/`.
- For high-risk flows (auth/session/navigation), expect controlled rollout and rollback/kill-switch planning.
- Keep shared UI primitives generic and app-specific UI inside the app.
- Preserve strict TypeScript types. Do not accept `any`, broad casts, or weakened validation to satisfy compile errors.

## Frontend validation expectations

- Prefer targeted validation during review: `pnpm --filter @repo/frontend lint`, `typecheck`, `test`, and `build`.
- For non-trivial frontend changes, expect `pnpm verify` or a clearly justified targeted validation set.
