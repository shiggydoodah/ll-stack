import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@repo/schema';

const MAX_EMAIL_LENGTH = 256;

export class RegisterRequestDto {
  @ApiProperty({ example: 'Ada Whitcombe', minLength: 1, maxLength: MAX_NAME_LENGTH })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @ApiProperty({ example: 'member@example.com', maxLength: MAX_EMAIL_LENGTH })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @ApiProperty({
    example: 'change-me-please-1234',
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;

  @ApiProperty({ example: true, description: 'Terms/privacy consent — must be true' })
  @IsBoolean()
  @Equals(true, { message: 'consent must be true' })
  consent!: boolean;
}
