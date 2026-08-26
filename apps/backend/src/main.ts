import 'reflect-metadata';
import { formatBootFailure, writeBootFailure } from './bootstrap/report-boot-failure';
import { envSchema } from './config/env.schema';
import { startBackendTelemetry } from './common/telemetry/backend-telemetry';

// ConfigModule normally loads the local `.env` file when the Nest app boots, but
// telemetry has to start (and so env has to be validated) BEFORE the app loads.
// Mirror that load here using Node's built-in loader. Absent in production where
// env is injected by the orchestrator — ignore a missing file.
function loadLocalEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    // No local .env (e.g. staging/production) — env comes from the environment.
  }
}

async function bootstrap() {
  // Validate env and start telemetry FIRST so the HTTP/Express/Prisma
  // instrumentations patch those modules before they are imported below.
  loadLocalEnvFile();
  const env = envSchema.parse(process.env);
  const telemetry = startBackendTelemetry(env);

  const { NestFactory } = await import('@nestjs/core');
  const { default: helmet } = await import('helmet');
  const { Logger } = await import('nestjs-pino');
  const { AppModule } = await import('./app.module.js');
  const { configureApp } = await import('./bootstrap/configure-app.js');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableShutdownHooks();

  const port = configureApp(app);

  // Drain spans on shutdown signals with a bounded timeout. Nest's own shutdown
  // hooks close the app on the same signals; both listeners fire independently.
  const drainTelemetry = async (): Promise<void> => {
    await telemetry.shutdown();
  };
  process.once('SIGTERM', () => void drainTelemetry());
  process.once('SIGINT', () => void drainTelemetry());

  await app.listen(port);
}

// Every boot failure lands here: the `envSchema.parse` above, a DI resolution
// error, and — the case this exists for — a rejected `onApplicationBootstrap`
// hook. Without a handler those arrive as an unhandled promise rejection: Node
// still exits non-zero, but the operator gets a bare stack with no statement
// that the process failed to START, which is the fact that determines what
// they do next.
//
// `process.exit` rather than `process.exitCode`, matching the boot guards in
// scripts/: a partially-initialized app can hold a Prisma pool or a telemetry
// exporter interval, and letting the loop drain would turn a failed boot into a
// hang. The unhandled-rejection path this replaces force-exits too, so exiting
// here keeps that behaviour rather than trading a crash for a stall.
// `writeBootFailure` rather than `process.stderr.write`, because `process.exit`
// drops a pending async write and stderr is async when it is a pipe on macOS —
// the module documents the full reasoning. It is imported statically, unlike
// everything else this file defers, because a handler that has to `await import`
// its own reporter loses the error whenever that import is what failed.
bootstrap().catch((error: unknown) => {
  writeBootFailure(formatBootFailure(error));
  process.exit(1);
});
