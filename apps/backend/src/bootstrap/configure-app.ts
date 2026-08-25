import { ValidationPipe } from '@nestjs/common';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { type OperationIdFactory } from '@nestjs/swagger';
import { type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { type Env } from '../config/env.schema';

const BACKEND_API_SECRET_SECURITY_SCHEME = 'backendApiSecret';

/**
 * Stable, hand-assigned operationIds keyed by `${ControllerName}.${methodName}`.
 * The {@link operationIdFactory} resolves a route's id here, falling back to an
 * auto-generated id when a key is absent. That fallback is silent: a key that
 * goes stale (controller/method renamed or removed) does NOT error — the route
 * just loses its stable client name, so grow this map alongside new endpoints
 * rather than after the fact.
 */
export const operationIdsByControllerMethod = new Map<string, string>([
  ['HealthController.getHealth', 'getHealth'],
]);

const createDefaultOperationId = (
  controllerKey: string,
  methodKey: string,
  version?: string,
): string => {
  if (version) {
    return controllerKey ? `${controllerKey}_${methodKey}_${version}` : `${methodKey}_${version}`;
  }

  return controllerKey ? `${controllerKey}_${methodKey}` : methodKey;
};

const operationIdFactory: OperationIdFactory = (controllerKey, methodKey, version) =>
  operationIdsByControllerMethod.get(`${controllerKey}.${methodKey}`) ??
  createDefaultOperationId(controllerKey, methodKey, version);

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const openApiConfig = new DocumentBuilder()
    .setTitle('Platform API')
    .setDescription('Private backend API for the platform.')
    .setVersion('0.0.1')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-secret',
      },
      BACKEND_API_SECRET_SECURITY_SCHEME,
    )
    .addSecurityRequirements(BACKEND_API_SECRET_SECURITY_SCHEME)
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, openApiConfig, {
    operationIdFactory,
  });

  // `/health` carries `@SkipApiSecret()` deliberately — an infrastructure probe
  // cannot hold the internal shared secret — so documenting the document-wide
  // `x-api-secret` requirement on it would be a plain factual error in the
  // published contract.
  const healthOperation = document.paths['/health']?.get;
  if (healthOperation) {
    healthOperation.security = [];
  }

  return document;
}

/**
 * Maps the `TRUST_PROXY` env string onto an Express `trust proxy` value.
 * See env.schema.ts for the accepted forms and the security rationale.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined) return false;
  const value = raw.trim();
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  return value;
}

/**
 * `openapi` builds the Swagger document and mounts `/docs` + `/docs-json`.
 *
 * Off under test. Nearly every integration spec that boots the app never
 * requests either route, yet each pays a full reflection pass over every
 * controller and DTO in every feature module to serve them. A spec that starts
 * asserting `/docs*` without opting back in via `{ openapi: true }` fails
 * loudly on a 404, which is the intended failure mode — this cannot cause a
 * false pass, since no other behaviour depends on the document being mounted.
 * Outside the suite, `scripts/extract-openapi.ts` calls
 * {@link buildOpenApiDocument} directly rather than through here, so
 * `pnpm gen:client` and the `check:drift` step in `pnpm verify:backend`
 * exercise the same path.
 *
 * The default is resolved from the validated `NODE_ENV` inside the body rather
 * than from `process.env` in the parameter list: this function is past DI (it
 * takes a built `INestApplication`), so the backend runbook's "read config via
 * typed `ConfigService<Env>`" rule applies, and only the schema's enum can say
 * what a legal environment name is.
 */
export function configureApp(
  app: INestApplication,
  { openapi }: { openapi?: boolean } = {},
): number {
  app.use(cookieParser());

  const config = app.get(ConfigService<Env, true>);

  // Apply the deployed proxy chain so per-client throttles key on the real
  // client IP rather than the proxy address. Defaults to `false` (no trust).
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (openapi ?? config.get('NODE_ENV', { infer: true }) !== 'test') {
    const openApiDocument = buildOpenApiDocument(app);
    SwaggerModule.setup('docs', app, openApiDocument);
  }

  return config.get('PORT', { infer: true });
}
