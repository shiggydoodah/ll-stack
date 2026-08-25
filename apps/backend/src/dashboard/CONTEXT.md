# Dashboard Module

Example authenticated read backing the boilerplate's dashboard homepage —
replace with real product endpoints when building on the stack.

- `GET /dashboard` (`SessionGuard`) — `DashboardResponseDto`: live-member count
  plus the 8 most recently joined live accounts, one consistent snapshot
  (`$transaction`). Deliberately a bounded summary, NOT a paginated list — a
  real members listing gets its own cursor-paginated contract.

Member emails are published as `emailMasked`, never as stored. A valid session
is the only thing authorizing this read and anyone can mint one by signing up,
so the full address would be readable by the public. `dashboard.service.ts`
masks at the service boundary (`common/utils/mask-email.ts`) so the stored value
never enters the domain type. Tightening that — or dropping the field — is a
per-product decision; the mask is the floor.

Files: `dashboard.controller.ts` (thin), `dashboard.service.ts` (Prisma-owning),
`dashboard.types.ts`, `dto/dashboard-response.dto.ts`.

Tests: `test/users-dashboard.integration.spec.ts`.
