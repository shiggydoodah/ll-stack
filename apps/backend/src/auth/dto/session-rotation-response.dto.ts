import { ApiProperty } from '@nestjs/swagger';

/**
 * What the caller must do with the response, as a closed set. Not an enum — see
 * `docs/agents/backend.agents.md` § TypeScript.
 *
 * `invalid` is deliberately absent: it is answered as a 401, not as a body.
 */
export const SESSION_ROTATION_STATUSES = ['rotated', 'not_due', 'superseded'] as const;

export type SessionRotationStatus = (typeof SESSION_ROTATION_STATUSES)[number];

export class SessionRotationResponseDto {
  @ApiProperty({
    enum: SESSION_ROTATION_STATUSES,
    enumName: 'SessionRotationStatus',
    example: 'rotated',
    description:
      'rotated — a new token was issued and is on the Set-Cookie header; replace the stored one. ' +
      'not_due — the presented token is still current and nothing changed. ' +
      'superseded — the presented token has already been retired by another request that holds ' +
      'the successor; write no cookie, or you will overwrite it with a value the session no ' +
      'longer answers to.',
  })
  status!: SessionRotationStatus;

  @ApiProperty({
    type: Number,
    example: 3600,
    description:
      'Seconds until this session is next eligible for rotation. Schedule the next call against ' +
      'it rather than polling. Advisory on `superseded`, where another request owns the clock.',
  })
  nextRotationInSeconds!: number;
}
