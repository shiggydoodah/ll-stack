import { ApiProperty } from '@nestjs/swagger';

import type { ActiveSession, ActiveSessionList } from '../auth.types';

export class ActiveSessionDto {
  @ApiProperty({
    example: '01890c4b-1d6a-7c00-93b6-2c9c0a3d5f10',
    description:
      'Stable id for the whole sign-in. The session token behind it is re-issued periodically ' +
      'and this value does not change with it.',
  })
  sessionId!: string;

  @ApiProperty({ example: '2026-08-25T12:00:00.000Z', description: 'When this sign-in began' })
  startedAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-27T09:14:00.000Z',
    description:
      'When the sign-in was last seen, accurate to within one token-rotation interval rather ' +
      'than to the last request. Null on a sign-in whose newest token has not been presented yet.',
  })
  lastSeenAt!: string | null;

  @ApiProperty({
    example: '2026-09-01T12:00:00.000Z',
    description: 'When this sign-in ends on its own, whatever happens in between',
  })
  expiresAt!: string;

  @ApiProperty({ example: true, description: 'True for the sign-in that made this request' })
  current!: boolean;
}

export class ActiveSessionsResponseDto {
  @ApiProperty({ type: [ActiveSessionDto], description: 'Live sign-ins, most recent first' })
  sessions!: ActiveSessionDto[];

  @ApiProperty({
    example: false,
    description:
      'True when the account holds more live sign-ins than one listing returns. Nothing here ' +
      'pages; use revoke-all to clear the rest.',
  })
  truncated!: boolean;
}

function toActiveSessionDto(session: ActiveSession): ActiveSessionDto {
  return {
    sessionId: session.sessionId,
    startedAt: session.startedAt.toISOString(),
    lastSeenAt: session.lastSeenAt === null ? null : session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.current,
  };
}

/** Map the domain {@link ActiveSessionList} to its public wire DTO. */
export function toActiveSessionsResponseDto(list: ActiveSessionList): ActiveSessionsResponseDto {
  return {
    sessions: list.sessions.map(toActiveSessionDto),
    truncated: list.truncated,
  };
}
