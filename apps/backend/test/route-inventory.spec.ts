import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { SKIP_API_SECRET_KEY } from '../src/common/constants/security.constants';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';

interface RouteRecord {
  readonly method: string;
  readonly path: string;
  readonly skipApiSecret: boolean;
  readonly guards: readonly string[];
}

function joinPaths(controllerPath: string, methodPath: string): string {
  const joined = `/${controllerPath}/${methodPath}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function collectRoutes(app: INestApplication): RouteRecord[] {
  const modulesContainer = app.get(ModulesContainer);
  const routes: RouteRecord[] = [];

  for (const moduleRef of modulesContainer.values()) {
    for (const controller of moduleRef.controllers.values()) {
      const metatype = controller.metatype;
      if (typeof metatype !== 'function') continue;

      const controllerPath: string = Reflect.getMetadata(PATH_METADATA, metatype) ?? '';
      const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, metatype) ?? [];
      const classSkip: boolean = Reflect.getMetadata(SKIP_API_SECRET_KEY, metatype) ?? false;

      for (const propertyName of Object.getOwnPropertyNames(metatype.prototype)) {
        const handler: unknown = metatype.prototype[propertyName as keyof object];
        if (typeof handler !== 'function' || propertyName === 'constructor') continue;

        const requestMethod: RequestMethod | undefined = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        );
        if (requestMethod === undefined) continue;

        const methodPath: string = Reflect.getMetadata(PATH_METADATA, handler) ?? '';
        const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
        const methodSkip: boolean | undefined = Reflect.getMetadata(SKIP_API_SECRET_KEY, handler);

        routes.push({
          method: RequestMethod[requestMethod],
          path: joinPaths(controllerPath, methodPath),
          skipApiSecret: methodSkip ?? classSkip,
          guards: [...classGuards, ...methodGuards].map((guard) =>
            typeof guard === 'function' ? guard.name : String(guard),
          ),
        });
      }
    }
  }

  return routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

/**
 * THE ROUTE INVENTORY SNAPSHOT IS THE ENFORCEMENT (backend.agents.md § Auth
 * and gating): every registered route, whether it skips the global
 * ApiSecretGuard, and the names of its @UseGuards. Opening an unauthenticated
 * route therefore requires editing this checked-in snapshot — and any PR whose
 * diff touches it must state which route changed classification and why.
 */
describe('Route inventory', () => {
  let app: INestApplication;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    applyAppModuleTestEnv(3194);
    const { AppModule } = await import('../src/app.module.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = previousEnv;
  });

  it('matches the checked-in inventory of routes, guards, and api-secret skips', () => {
    expect(collectRoutes(app)).toEqual([
      {
        method: 'POST',
        path: '/auth/login',
        skipApiSecret: false,
        guards: ['AuthLoginThrottlerGuard'],
      },
      { method: 'POST', path: '/auth/logout', skipApiSecret: false, guards: [] },
      {
        method: 'POST',
        path: '/auth/register',
        skipApiSecret: false,
        guards: ['AuthRegisterThrottlerGuard'],
      },
      {
        method: 'POST',
        path: '/auth/session/rotate',
        skipApiSecret: false,
        guards: ['AuthSessionRotateThrottlerGuard'],
      },
      { method: 'GET', path: '/auth/sessions', skipApiSecret: false, guards: ['SessionGuard'] },
      {
        method: 'POST',
        path: '/auth/sessions/revoke-all',
        skipApiSecret: false,
        guards: ['SessionGuard', 'AuthSessionsRevokeThrottlerGuard'],
      },
      { method: 'GET', path: '/dashboard', skipApiSecret: false, guards: ['SessionGuard'] },
      { method: 'GET', path: '/health', skipApiSecret: true, guards: [] },
      { method: 'GET', path: '/users/me', skipApiSecret: false, guards: ['SessionGuard'] },
    ]);
  });
});
