import { ValidationPipe } from '@nestjs/common';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { type OperationIdFactory } from '@nestjs/swagger';
import { type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie.service';
import { type Env } from '../config/env.schema';
import { mountOpenApiDocs } from './openapi-docs';

const BACKEND_API_SECRET_SECURITY_SCHEME = 'backendApiSecret';

const HTTP_OPERATION_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
] as const;

type HttpOperationMethod = (typeof HTTP_OPERATION_METHODS)[number];
type OpenApiOperation = NonNullable<
  NonNullable<OpenAPIObject['paths'][string]>[HttpOperationMethod]
>;

function operationRequiresSecurityScheme(
  operation: OpenApiOperation,
  securityScheme: string,
): boolean {
  return (operation.security ?? []).some((requirement) =>
    Object.prototype.hasOwnProperty.call(requirement, securityScheme),
  );
}

/**
 * `@ApiCookieAuth` sets operation-level security that OVERRIDES the
 * document-level backendApiSecret requirement in the spec (OpenAPI semantics:
 * an operation's `security` replaces the document's, it never merges). Left
 * alone, the generated clients then stop sending `x-api-secret` on every
 * session-guarded route and the global ApiSecretGuard 401s them. Restore both
 * schemes explicitly so the client knows to send the secret alongside the
 * session cookie.
 */
function applyCookieAndSecretSecurity(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths)) {
    if (!pathItem) continue;

    for (const method of HTTP_OPERATION_METHODS) {
      const operation = pathItem[method];
      if (!operation || !operationRequiresSecurityScheme(operation, SESSION_COOKIE_NAME)) {
        continue;
      }

      operation.security = [
        { [SESSION_COOKIE_NAME]: [], [BACKEND_API_SECRET_SECURITY_SCHEME]: [] },
      ];
    }
  }
}

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
  ['AuthController.register', 'registerUser'],
  ['AuthController.login', 'loginUser'],
  ['AuthController.logout', 'logoutSession'],
  ['UsersController.getMe', 'getCurrentUser'],
  ['DashboardController.getDashboard', 'getDashboard'],
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
    .addCookieAuth(SESSION_COOKIE_NAME, {
      type: 'apiKey',
      in: 'cookie',
      name: SESSION_COOKIE_NAME,
      description: 'Opaque session bearer cookie issued by /auth/register and /auth/login.',
    })
    .addTag('health')
    .addTag('auth')
    .addTag('users')
    .addTag('dashboard')
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

  applyCookieAndSecretSecurity(document);

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
 * `openapi` builds the Swagger document and mounts `/docs`, `/docs-json`, and
 * `/docs-yaml`.
 *
 * THE DEFAULT IS `OPENAPI_DOCS_ENABLED`, WHICH RESOLVES TO DEVELOPMENT-ONLY.
 * It used to be "anything but test", which mounted the full contract of every
 * route in production — outside `ApiSecretGuard`, outside the throttler, and
 * on the access log's exclusion list, so nothing recorded who read it. An
 * operator can still turn it on in a deployed environment; the mount is gated
 * on `ADMIN_API_KEY` there (`bootstrap/openapi-docs.ts`).
 *
 * The `openapi` parameter overrides the env for a caller that knows what it
 * wants — `test/app.e2e-spec.ts` opts the document back in under NODE_ENV=test,
 * where every other spec leaves it off. Off is the right default under test for
 * a reason unrelated to security: nearly every integration spec that boots the
 * app never requests these routes, yet each would pay a full reflection pass
 * over every controller and DTO in every feature module to serve them. A spec
 * that starts asserting `/docs*` without opting in fails loudly on a 404, which
 * is the intended failure mode — it cannot cause a false pass, since no other
 * behaviour depends on the document being mounted. Outside the suite,
 * `scripts/extract-openapi.ts` calls {@link buildOpenApiDocument} directly
 * rather than through here, so `pnpm gen:client` and the `check:drift` step in
 * `pnpm verify:backend` exercise the same path with no HTTP route involved.
 *
 * Everything here is resolved from the validated `Env` inside the body rather
 * than from `process.env` in the parameter list: this function is past DI (it
 * takes a built `INestApplication`), so the backend runbook's "read config via
 * typed `ConfigService<Env>`" rule applies, and only the schema can say what a
 * legal environment name is.
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

  if (openapi ?? config.get('OPENAPI_DOCS_ENABLED', { infer: true })) {
    mountOpenApiDocs(app, buildOpenApiDocument(app), {
      nodeEnv: config.get('NODE_ENV', { infer: true }),
      adminApiKey: config.get('ADMIN_API_KEY', { infer: true }),
    });
  }

  return config.get('PORT', { infer: true });
}
