import { Logger } from '@nestjs/common';
// Deep import: `TestingLogger` is not re-exported from the `@nestjs/testing`
// root. The package declares no `exports` map, so this path resolves fine.
import { TestingLogger } from '@nestjs/testing/services/testing-logger.service';

// Keep the backend test console free of Nest log noise. Two mechanisms cover the
// two ways logs reach stdout in tests:
//
// 1. Unit specs instantiate
//    `@nestjs/common` Loggers directly and exercise error/happy paths. With no
//    Nest app, those calls hit Nest's default ConsoleLogger and print — the
//    pino routing in `main.ts` only applies once an app calls `useLogger`.
//    `Logger.overrideLogger(false)` silences the static logger. `Logger` is a
//    process-wide singleton (Jest does not reset modules between files), so we
//    re-assert it in `beforeEach`: `Test.createTestingModule(...).compile()`
//    reinstalls a `TestingLogger` as the static logger on every call, which
//    would otherwise clobber the one-time override.
//
// 2. `TestingLogger` no-ops log/warn/debug/verbose but deliberately STILL prints
//    `error()`. That leaks for any `new Logger().error()` once a `compile()` has
//    run — including async, fire-and-forget paths (e.g. a background flag-store
//    refresh) that land between tests, outside the `beforeEach` window. No-op
//    its `error` so a compiled-module test run is fully quiet too.
//
// Tests that assert on logs are unaffected: `log-sink` calls `useLogger` inside
// the test (after `beforeEach`), and the redaction suites
// `jest.spyOn(Logger.prototype, ...)`, which replaces the method directly and
// bypasses both the static logger and `TestingLogger`. Genuine failures still
// surface as failed assertions — only console output is suppressed.
//
// This affects nothing outside the Jest process: it does not touch `main.ts` or
// the nestjs-pino `Logger`.
TestingLogger.prototype.error = (): void => {};

const silence = (): void => {
  Logger.overrideLogger(false);
};

silence();
beforeEach(silence);
