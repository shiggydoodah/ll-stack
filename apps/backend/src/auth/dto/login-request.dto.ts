import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH } from '@repo/schema';

export class LoginRequestDto {
  @ApiProperty({ example: 'member@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  // MinLength(1) only — login must accept any existing secret, but cap the
  // input at the creation-time max so an over-long password is rejected before
  // it reaches argon2 (cost-amplification guard; no live account can hold a
  // longer password, since creation enforces the same cap).
  @ApiProperty({ example: 'redacted', minLength: 1, maxLength: MAX_PASSWORD_LENGTH })
  @IsString()
  @MinLength(1, { message: 'password is required' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}
