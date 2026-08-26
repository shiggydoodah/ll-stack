import { Logger, type INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { secretsMatch } from '../common/utils/secret-compare';
import type { Env } from '../config/env.schema';

/**
 * The Swagger UI path, and the two document paths derived from it.
 *
 * These are `SwaggerModule`'s own defaults (`<path>-json`, `<path>-yaml`)
 * restated as constants, and {@link mountOpenApiDocs} passes them back to
 * `SwaggerModule.setup` explicitly rather than letting it re-derive them.
 * That is deliberate: the gate below has to be registered per path, and
 * `app.use('/docs', …)` does NOT cover `/docs-json` — Express prefix matching
 * stops at the segment boundary. Deriving the mounted set and the guarded set
 * from the same three constants is what stops the JSON document — the whole
 * API contract in one response — from quietly ending up outside the gate.
 */
export const OPENAPI_DOCS_PATH = 'docs';
export const OPENAPI_JSON_PATH = `${OPENAPI_DOCS_PATH}-json`;
export const OPENAPI_YAML_PATH = `${OPENAPI_DOCS_PATH}-yaml`;

const DOCS_REALM = 'Platform API docs';

/**
 * Whether the docs mount needs the admin-key gate in front of it.
 *
 * Development and test are ungated: the UI is a local tool there, and the e2e
 * spec opts the document in with `configureApp(app, { openapi: true })`.
 * Anywhere else, an operator has had to set `OPENAPI_DOCS_ENABLED=true`
 * against a default of off, and what they have turned on is a full description
 * of every route, DTO, error code, and security scheme in the service —
 * mounted straight onto Express by `SwaggerModule.setup`, which is to say
 * outside `ApiSecretGuard`, outside the throttler, and outside the access log.
 * The gate is what puts a credential back in front of it.
 */
export function docsRequireAdminKey(nodeEnv: Env['NODE_ENV']): boolean {
  return nodeEnv === 'staging' || nodeEnv === 'production';
}

/**
 * The admin key a docs request is presenting, in either of the two forms that
 * are usable against a docs URL:
 *
 * - `x-admin-key`, matching {@link AdminApiKeyGuard} — for `curl`, CI, and
 *   anything scripted against `/docs-json`.
 * - HTTP Basic, password field only (the username is ignored) — because the
 *   Swagger UI is opened by a browser, and a browser cannot be asked to set a
 *   custom header on a top-level navigation. `curl -u :$ADMIN_API_KEY` also
 *   lands here.
 *
 * Returns `null` when neither is present or the Basic payload is malformed;
 * the caller answers 401 either way, so the distinction is not worth
 * publishing to whoever is probing.
 */
export function readDocsCredential(req: Request): string | null {
  const headerKey = req.header('x-admin-key');
  if (headerKey !== undefined && headerKey.length > 0) {
    return headerKey;
  }

  const authorization = req.header('authorization');
  if (authorization === undefined || !authorization.toLowerCase().startsWith('basic ')) {
    return null;
  }

  const decoded = Buffer.from(authorization.slice('basic '.length).trim(), 'base64').toString(
    'utf8',
  );
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const password = decoded.slice(separatorIndex + 1);
  return password.length > 0 ? password : null;
}

/**
 * Express middleware — NOT a Nest guard — because `SwaggerModule.setup`
 * registers its routes on the underlying Express instance, where no Nest
 * enhancer runs. That is also why the 401 body here is a bare envelope rather
 * than `HttpExceptionFilter`'s `{ statusCode, error, message, path, timestamp,
 * traceId }`: the filter and the trace-id interceptor never see this request,
 * and faking a `traceId` that correlates with nothing would be worse than
 * omitting it.
 */
export function createDocsAuthMiddleware(adminApiKey: string): RequestHandler {
  const logger = new Logger('OpenApiDocs');

  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = readDocsCredential(req);

    if (provided !== null && secretsMatch(provided, adminApiKey)) {
      next();
      return;
    }

    // Reason only, never the presented value — the same posture as every other
    // security denial in this service.
    logger.warn({
      event: BACKEND_LOG_EVENTS['system.openapi_docs.denied'],
      message: 'OpenAPI docs request rejected: missing or invalid admin key.',
      reason: provided === null ? 'ADMIN_KEY_MISSING' : 'ADMIN_KEY_INVALID',
      path: req.path,
    });

    res.setHeader('WWW-Authenticate', `Basic realm="${DOCS_REALM}", charset="UTF-8"`);
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Invalid admin key',
    });
  };
}

/**
 * Mounts the Swagger UI and the OpenAPI documents, gating them on
 * `ADMIN_API_KEY` in staging and production.
 *
 * The gate is registered BEFORE `SwaggerModule.setup` for each of the three
 * paths: Express runs middleware in registration order, so a gate added
 * afterwards would sit behind the handler it is supposed to protect and never
 * run.
 */
export function mountOpenApiDocs(
  app: INestApplication,
  document: OpenAPIObject,
  options: { nodeEnv: Env['NODE_ENV']; adminApiKey: string },
): void {
  if (docsRequireAdminKey(options.nodeEnv)) {
    const gate = createDocsAuthMiddleware(options.adminApiKey);
    for (const path of [OPENAPI_DOCS_PATH, OPENAPI_JSON_PATH, OPENAPI_YAML_PATH]) {
      app.use(`/${path}`, gate);
    }
  }

  SwaggerModule.setup(OPENAPI_DOCS_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    yamlDocumentUrl: OPENAPI_YAML_PATH,
  });
}
