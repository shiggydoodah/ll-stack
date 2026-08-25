import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TraceIdInterceptor } from './common/interceptors/trace-id.interceptor';
import { ApiSecretGuard } from './common/guards/api-secret.guard';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { createLoggerConfig } from './common/logging/logger.config';
import { BoundedThrottlerStorage } from './common/throttling/bounded-throttler.storage';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { Env, envSchema } from './config/env.schema';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => envSchema.parse(raw),
    }),
    // `storage` replaces the package default, which never deletes a key — see
    // BoundedThrottlerStorage's header. Passing an instance is the only hook
    // ThrottlerModule offers; it becomes the `ThrottlerStorage` provider, so
    // Nest still drives its lifecycle hooks.
    //
    // ASYNC ONLY SO THE STORE IS PER CONTAINER. Under `forRoot` the instance is
    // an argument evaluated in this decorator's metadata — once per import of
    // this file, not once per Nest container. Every app built from `AppModule`
    // in one module registry would then share a store, and the first
    // `app.close()` would `records.clear()` and `clearInterval` the prune timer
    // out from under the others, with nothing re-arming it. Production runs one
    // app per process so it would never show there; a spec building two apps
    // from `AppModule` would. The factory below is resolved per container, so
    // each gets its own.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            limit: 60,
            ttl: 60_000,
          },
        ],
        storage: new BoundedThrottlerStorage(),
      }),
    }),
    // Global SchedulerRegistry. No workers use it yet; background jobs register
    // dynamically at bootstrap rather than via @Cron/@Interval decorators at
    // import time — the shape every future background job follows, with no
    // wiring change here.
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env>) => createLoggerConfig(configService),
    }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceIdInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ApiSecretGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
