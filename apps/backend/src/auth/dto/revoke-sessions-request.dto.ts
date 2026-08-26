import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';

export class RevokeSessionsRequestDto {
  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Spare the sign-in making this request. Defaults to false, because the route revokes ' +
      'all of them — send true for a "sign out everywhere else" control.',
  })
  @ValidateIf((dto: RevokeSessionsRequestDto) => dto.keepCurrent !== undefined)
  @IsBoolean()
  keepCurrent?: boolean;
}
