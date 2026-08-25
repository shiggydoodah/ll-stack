# Users Module

Account-facing reads for the signed-in member. Currently one route:

- `GET /users/me` (`SessionGuard`) — the account behind the session cookie,
  as `AccountResponseDto`. A session whose user no longer resolves answers 401
  `SESSION_INVALID` and clears the cookie.

No service of its own yet — `AuthService.getUserById` owns the read; this
module imports `AuthModule` for the guard, cookie service, and service. Grows a
`users.service.ts` the moment a write or a non-auth-owned read lands.

Tests: `test/users-dashboard.integration.spec.ts`.
