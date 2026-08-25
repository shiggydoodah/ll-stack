import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { type Request } from 'express';
import { type Env } from '../../config/env.schema';
import { SKIP_API_SECRET_KEY } from '../constants/security.constants';

/**
 * Constant-time secret comparison. Both inputs are hashed to a fixed 32-byte
 * digest first so `timingSafeEqual` never sees mismatched lengths (it throws on
 * those) and the comparison leaks neither the secret's length nor how many
 * leading characters matched.
 */
const secretsMatch = (provided: string, expected: string): boolean => {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
};

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
