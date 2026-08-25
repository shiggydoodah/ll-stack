import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';
import { type Env } from '../../config/env.schema';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.header('x-admin-key');
    const expectedKey = this.configService.get('ADMIN_API_KEY', { infer: true });

    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('Invalid admin key');
    }

    return true;
  }
}
