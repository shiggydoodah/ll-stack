import { ApiProperty } from '@nestjs/swagger';

/**
 * Shape of every error response emitted by `HttpExceptionFilter`. Kept beside
 * the filter so the two stay in lockstep. Reference from `@ApiUnauthorizedResponse`,
 * `@ApiBadRequestResponse`, etc. so generated client types are concrete instead
 * of `unknown`.
 */
export class ApiErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'UnauthorizedException' })
  error!: string;

  @ApiProperty({
    description: 'Human-readable error message or array of validation messages.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Session no longer valid',
  })
  message!: string | string[];

  @ApiProperty({ example: '/users/me' })
  path!: string;

  @ApiProperty({ example: '2026-05-23T22:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({
    description: 'Backend trace id for this response; correlate with backend logs.',
    example: '0af7651916cd43dd8448eb211c80319c',
  })
  traceId!: string;
}
