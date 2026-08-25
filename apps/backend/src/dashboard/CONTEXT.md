# Dashboard Module

Example authenticated read backing the boilerplate's dashboard homepage —
replace with real product endpoints when building on the stack.

- `GET /dashboard` (`SessionGuard`) — `DashboardResponseDto`: live-member count
  plus the 8 most recently joined live accounts, one consistent snapshot
  (`$transaction`). Deliberately a bounded summary, NOT a paginated list — a
  real members listing gets its own cursor-paginated contract.

Files: `dashboard.controller.ts` (thin), `dashboard.service.ts` (Prisma-owning),
`dashboard.types.ts`, `dto/dashboard-response.dto.ts`.

Tests: `test/users-dashboard.integration.spec.ts`.
