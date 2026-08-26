# Context: bruno

## Purpose

- A small [Bruno](https://usebruno.com) request collection for hand-driven local
  smoke checks against the running backend. Reference tooling, not part of any
  automated gate.

## Architecture

- `bruno.json` — collection manifest (the repo root also carries one so
  `pnpm bruno:run` works from there).
- `environments/local.bru` — the local environment: backend base URL and the
  dev API secret.
- `health/get-health.bru` — the one request today: `GET /health`.

## Key Flows

- `pnpm bruno:run` → `cd bruno && bru run --env local` against a backend already
  running on `localhost:3100`.

## Gotchas

- Every backend route except `/health` needs the `x-api-secret` header — a new
  request that omits it gets a 401, not a routing error.
- Session-guarded routes additionally need the `llstack_session` cookie, which
  this collection does not currently mint.
- Values here are the committed local dev credentials; never put a real secret
  in a `.bru` file.

## Agent Notes

- Adding requests here is optional. The authoritative contract is the OpenAPI
  document (`/docs-json`) and the generated clients in `packages/services`.
- Not covered by `pnpm verify`; changes here need no validation run.
