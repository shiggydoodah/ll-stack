# Context: apps/backend/src/bootstrap

## Purpose

- Everything that happens to a built `INestApplication` before it listens, plus
  the OpenAPI document that `packages/services` generates from.
- Read/edit here when changing global pipes, the Swagger contract, operation
  ids, docs exposure, or boot-failure reporting.

## Architecture

- `configure-app.ts`
  - `configureApp(app, { openapi? })` — mounts `cookie-parser`, applies
    `trust proxy` from `TRUST_PROXY`, installs the global `ValidationPipe`
    (`transform`, `whitelist`, `forbidNonWhitelisted`), conditionally mounts the
    docs, and returns `PORT`. Reads everything from the typed
    `ConfigService<Env>`, never `process.env`.
  - `buildOpenApiDocument(app)` — `DocumentBuilder` with the
    `backendApiSecret` (`x-api-secret`) API-key scheme applied document-wide,
    the `llstack_session` cookie scheme, and the tag list. Post-processes the
    document: clears security on `GET /health`, and re-applies **both** schemes
    to every cookie-authed operation.
  - `operationIdsByControllerMethod` — hand-assigned stable operation ids keyed
    by `ControllerName.methodName`; these become the generated client function
    names.
  - `parseTrustProxy` — maps the env string onto an Express `trust proxy` value.
- `openapi-docs.ts` — `mountOpenApiDocs` plus the admin-key gate. Exports the
  three paths (`docs`, `docs-json`, `docs-yaml`) as constants,
  `docsRequireAdminKey(nodeEnv)`, `readDocsCredential` (accepts `x-admin-key`
  **or** HTTP Basic password, so a browser can open the UI), and
  `createDocsAuthMiddleware`.
- `report-boot-failure.ts` — `formatBootFailure` + `writeBootFailure`, a
  bounded-retry synchronous `writeSync` loop to fd 2.

## Key Flows

- Boot: `main.ts` → `configureApp(app)` → `app.listen(port)`.
- Extraction: `scripts/extract-openapi.ts` → `buildOpenApiDocument(app)`
  directly (no HTTP route involved), so `pnpm gen:client` and `check:drift`
  exercise the same code path.
- Docs request in staging/production: gate middleware → `SwaggerModule` handler.

## Gotchas

- **`@ApiCookieAuth` replaces document-level security** in OpenAPI semantics.
  Without `applyCookieAndSecretSecurity`, generated clients stop sending
  `x-api-secret` on session-guarded routes and the global guard 401s them.
- The gate is registered **before** `SwaggerModule.setup` for each path —
  Express runs middleware in registration order — and per path, because
  `app.use('/docs', …)` does not cover `/docs-json`.
- The docs gate is Express middleware, not a Nest guard, so its 401 body is a
  bare envelope without `traceId`; `HttpExceptionFilter` never sees it.
- A stale entry in `operationIdsByControllerMethod` does **not** error — the
  route silently falls back to an auto-generated id. Grow the map with new
  endpoints, not after the fact.
- `configureApp(app, { openapi: true })` is how a spec opts the document back in
  under `NODE_ENV=test`; leaving it off elsewhere avoids a full reflection pass
  per app build.
- `writeBootFailure` is not `process.stderr.write` on purpose: `process.exit`
  drops pending async writes, and a non-blocking fd returns short counts. Both
  facts are why it loops.

## Agent Notes

- Any new endpoint: add its tag here if new, add its operation id, then
  regenerate clients.
- Contract accuracy is a hard requirement — schema drift breaks the generated
  frontend clients silently. `test/openapi-docs.spec.ts` and
  `test/configure-app.spec.ts` cover this file.
