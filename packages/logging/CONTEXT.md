# Context: packages/logging

## Purpose

- `@repo/logging` — the shared logging substrate both tiers write through: sink
  transports, field-name redaction, per-environment level defaults, and request
  path sanitisation. It is what makes backend, Next-server, and browser log
  records queryable together.

## Architecture

Two entrypoints, and the split matters:

- `@repo/logging` (`src/index.ts`) — **Node only**. Adds `log-sink.ts`, which
  imports `node:stream` and writes to `process.stdout`.
- `@repo/logging/shared` (`src/shared.ts`) — **browser-safe**. Only the pure
  utilities: redaction, level defaults, request-path.

| File                    | Owns                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log-sink.ts`           | `LogSink` interface, `LogSinkType` (`stdout \| http_otlp \| seq`), `LogSinkConfig`, `createPinoSinkStream`, `resolveActiveLogSink`, OTLP payload shaping, batching/retry/circuit-breaker knobs |
| `log-redaction.ts`      | `sanitizeLogRecord` / `sanitizeLogValue` — depth-bounded, cycle-safe walk that redacts by **field name** (`SENSITIVE_KEYWORDS`, substring-matched) and by token-shaped value                   |
| `log-level.defaults.ts` | `RuntimeEnvironment`, `LogLevel`, `DEFAULT_LOG_LEVEL_BY_ENV` (development `trace`, staging `debug`, production `info`, test `warn`)                                                            |
| `request-path.ts`       | `resolveRequestPath` — strips query strings and replaces id-shaped segments (uuid, numeric, long hex/token, long filename) with `{id}`                                                         |

Builds to CommonJS `dist/` (`tsc -p tsconfig.build.json`) because the backend
`require()`s it at runtime.

## Key Flows

- Backend: `common/logging/logger.config.ts` wires `sanitizeLogRecord` as pino's
  `formatters.log` and `createPinoSinkStream` as the transport.
- Frontend server: `lib/logging/log-emitter.ts` writes through the same sink;
  browser records arrive via `POST /api/client-logs` and are re-sanitised
  server-side.
- Path sanitisation keeps high-cardinality ids out of `path` fields on both
  tiers.

## Gotchas

- **Add new sensitive field names to `SENSITIVE_KEYWORDS` here**, not to a
  per-app redact-path list. Pino's `redact` matches exact paths and only catches
  a field at the position written; this walker catches it wherever it is nested.
- Importing the root barrel from browser or edge code pulls `node:stream` in and
  breaks the bundle — use `/shared`.
- The package ships raw TypeScript for `types`/`import` and CommonJS `dist/` for
  `require`. `apps/backend/scripts/dist-boot-guard.mjs` exists partly to catch a
  missing `dist` reaching the container.

## Agent Notes

- Redaction is defence in depth, not permission to log secrets — call sites
  still log reasons, booleans, enums, and ids only.
- Sink config knobs are surfaced as `LOG_*` env vars in both apps' schemas; add
  them in all three places or not at all.
