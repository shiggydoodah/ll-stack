import { ApiProperty } from '@nestjs/swagger';

export class RevokeSessionsResponseDto {
  @ApiProperty({
    example: 2,
    description:
      'How many sign-ins were ended. Counted per sign-in, matching what the listing shows — ' +
      'not per session token, of which one sign-in holds many.',
  })
  revokedSessions!: number;

  @ApiProperty({
    example: false,
    description:
      'True when this request ended its own sign-in, which is the default. The session cookie ' +
      'has been cleared and every following call needs a fresh sign-in.',
  })
  currentSessionRevoked!: boolean;
}
