import { createServer } from 'http';
import type { Server } from 'http';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule } from 'nestjs-pino';
import { __resetOutOfContextForTests } from 'nestjs-pino/PinoLogger';

import type { LogSinkConfig } from '@repo/logging';
import {
  __resetActiveLogSinkForTests,
  resolveActiveLogSink,
  shutdownActiveLogSink,
} from '@repo/logging';

import { createLoggerConfig } from '../src/common/logging/logger.config';
import { assertTestDatabaseUrl, getTestDatabaseUrl } from './helpers/test-database-url';
import type { Env } from '../src/config/env.schema';
import { envSchema } from '../src/config/env.schema';

const originalProcessEnv = { ...process.env };

const TEST_SINK_CONFIG: LogSinkConfig = {
  sinkType: 'stdout',
  serviceName: 'backend',
  environment: 'test',
  timeoutMs: 5_000,
  batchSize: 100,
  queueSize: 1_000,
  flushIntervalMs: 5_000,
  maxRetries: 3,
  backoffBaseMs: 200,
  backoffMaxMs: 10_000,
  backoffJitterFactor: 0.3,
  failureFallbackThreshold: 5,
  initFailureFallbackThreshold: 3,
  circuitOpenMs: 30_000,
  shutdownDrainTimeoutMs: 10_000,
};

function setTestEnvironment(overrides: Partial<Record<string, string>> = {}): void {
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '3110';
  process.env['APPLICATION_NAME'] = 'backend';
  // Via the helper so a parallel worker names its own database clone: this
  // suite never opens a Postgres connection, but the value persists in this
  // worker's process.env, where a later integration suite would re-derive its
  // connection string from it.
  process.env['DATABASE_URL'] = assertTestDatabaseUrl(getTestDatabaseUrl());
  process.env['BACKEND_API_SECRET'] = 'test_backend_api_secret';
  process.env['ADMIN_API_KEY'] = 'test_admin_api_key';
  process.env['FRONTEND_PUBLIC_URL'] = 'http://localhost:4100';
  process.env['LOG_LEVEL'] = 'info';
  process.env['LOG_SINK'] = 'stdout';

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

async function compileLoggingTestModule() {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        cache: false,
        ignoreEnvFile: true,
        validate: (raw) => envSchema.parse(raw),
      }),
      LoggerModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService<Env>) => createLoggerConfig(configService),
      }),
    ],
  }).compile();
}

describe('Log Sink Integration', () => {
  let app: INestApplication | null = null;
  let mockSinkServer: Server | null = null;

  beforeEach(() => {
    setTestEnvironment();
    __resetOutOfContextForTests();
    __resetActiveLogSinkForTests();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }

    await shutdownActiveLogSink();

    if (mockSinkServer) {
      mockSinkServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        mockSinkServer?.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      mockSinkServer = null;
    }

    __resetOutOfContextForTests();
    __resetActiveLogSinkForTests();
    jest.restoreAllMocks();
    process.env = { ...originalProcessEnv };
  });

  it('boots with stdout sink and performs graceful sink shutdown', async () => {
    const testingModule = await compileLoggingTestModule();
    app = testingModule.createNestApplication();
    app.useLogger(app.get(Logger));

    await app.init();

    const activeSinkBeforeShutdown = resolveActiveLogSink(TEST_SINK_CONFIG);

    await app.close();
    app = null;
    await shutdownActiveLogSink();

    const activeSinkAfterShutdown = resolveActiveLogSink(TEST_SINK_CONFIG);

    expect(activeSinkAfterShutdown).not.toBe(activeSinkBeforeShutdown);
  });

  it('fails startup fast when LOG_SINK is invalid', async () => {
    setTestEnvironment({
      LOG_SINK: 'unknown-sink',
    });

    await expect(
      (async () => {
        const testingModule = await compileLoggingTestModule();
        app = testingModule.createNestApplication();
        app.useLogger(app.get(Logger));
        await app.init();
      })(),
    ).rejects.toThrow(/LOG_SINK/i);
  });

  it('falls back to stdout when http_otlp endpoint keeps failing without crashing app startup', async () => {
    let requestCount = 0;
    mockSinkServer = createServer((_request, response) => {
      requestCount += 1;
      response.statusCode = 503;
      response.end('sink unavailable');
    });

    const sinkServer = mockSinkServer;

    if (!sinkServer) {
      throw new Error('Failed to create mock sink server.');
    }

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error): void => {
        sinkServer.removeListener('listening', handleListening);
        reject(error);
      };

      const handleListening = (): void => {
        sinkServer.removeListener('error', handleError);
        resolve();
      };

      sinkServer.once('error', handleError);
      sinkServer.once('listening', handleListening);
      sinkServer.listen(0, '127.0.0.1');
    });

    const serverAddress = sinkServer.address();

    if (!serverAddress || typeof serverAddress === 'string') {
      throw new Error('Failed to resolve mock sink server address.');
    }

    const sinkEndpoint = `http://127.0.0.1:${serverAddress.port}/v1/logs`;

    setTestEnvironment({
      LOG_SINK: 'http_otlp',
      LOG_HTTP_OTLP_ENDPOINT: sinkEndpoint,
      LOG_HTTP_BATCH_SIZE: '1',
      LOG_HTTP_QUEUE_SIZE: '10',
      LOG_HTTP_FLUSH_INTERVAL_MS: '50',
      LOG_HTTP_TIMEOUT_MS: '200',
      LOG_HTTP_MAX_RETRIES: '0',
      LOG_HTTP_FAILURE_FALLBACK_THRESHOLD: '1',
      LOG_HTTP_CIRCUIT_OPEN_MS: '30000',
      LOG_HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS: '300',
    });

    const stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(
        (_chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: unknown) => {
          type WriteCallback = (error: Error | null | undefined) => void;

          if (typeof encodingOrCallback === 'function') {
            (encodingOrCallback as WriteCallback)(null);
          } else if (typeof callback === 'function') {
            (callback as WriteCallback)(null);
          }

          return true;
        },
      );

    const testingModule = await compileLoggingTestModule();
    app = testingModule.createNestApplication();
    const logger = app.get(Logger);
    app.useLogger(logger);

    await app.init();

    logger.log('llstack-http-otlp-fallback-sentinel');

    const maxWaitMs = 2_000;
    const pollIntervalMs = 50;
    let elapsedMs = 0;
    let didEmitSentinelToStdout = false;

    while (elapsedMs <= maxWaitMs) {
      didEmitSentinelToStdout = stdoutSpy.mock.calls.some((call) =>
        call.some(
          (argument) =>
            typeof argument === 'string' &&
            argument.includes('llstack-http-otlp-fallback-sentinel'),
        ),
      );

      if (didEmitSentinelToStdout) {
        break;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, pollIntervalMs);
      });
      elapsedMs += pollIntervalMs;
    }

    await shutdownActiveLogSink();
    __resetActiveLogSinkForTests();

    expect(requestCount).toBeGreaterThan(0);
    expect(didEmitSentinelToStdout).toBe(true);
  });
});
