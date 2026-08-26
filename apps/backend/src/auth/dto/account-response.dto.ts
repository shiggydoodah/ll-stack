import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import type { Account } from '../auth.types';

export class AccountDto {
  @ApiProperty({ example: '01890c4b-1d6a-7c00-93b6-2c9c0a3d5f10' })
  userId!: string;

  @ApiProperty({ example: 'Ada Whitcombe' })
  name!: string;

  @ApiProperty({ example: 'member@example.com' })
  email!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.MEMBER })
  role!: UserRole;

  @ApiProperty({ example: '2026-08-25T12:00:00.000Z' })
  createdAt!: string;
}

export class AccountResponseDto {
  @ApiProperty({ type: AccountDto })
  account!: AccountDto;
}

/** Map a domain {@link Account} to its public wire DTO. */
export function toAccountDto(account: Account): AccountDto {
  return {
    userId: account.userId,
    name: account.name,
    email: account.email,
    role: account.role,
    createdAt: account.createdAt.toISOString(),
  };
}
