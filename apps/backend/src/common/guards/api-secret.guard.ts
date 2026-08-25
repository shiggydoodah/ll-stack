import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { type Env } from '../../config/env.schema';
import { SKIP_API_SECRET_KEY } from '../constants/security.constants';
import { secretsMatch } from '../utils/secret-compare';

/**
 * The BFF-to-backend trust boundary: every request must carry `x-api-secret`
 * unless the route is deliberately public (`@SkipApiSecret()`).
 *
 * IT IS REGISTERED AFTER `AppThrottlerGuard` IN `app.module.ts`, DELIBERATELY.
 * Global guards run in provider order, so a guard placed before the throttler
 * answers 401 without the request ever being counted — which leaves the one
 * header standing between the internet and every internal route guessable at
 * whatever rate the network allows. Ordering the throttler first puts the
 * global 60 req/min per-IP bucket in front of the guess, at no cost to
 * legitimate traffic (which was already inside that bucket).
 */
@Injectable()
export class ApiSecretGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isSkipped = this.reflector.getAllAndOverride<boolean>(SKIP_API_SECRET_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isSkipped) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const providedSecret = request.header('x-api-secret');
    const expectedSecret = this.configService.get('BACKEND_API_SECRET', { infer: true });

    if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid API secret');
    }

    return true;
  }
}
