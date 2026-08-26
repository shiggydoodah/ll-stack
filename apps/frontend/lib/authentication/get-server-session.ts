import 'server-only';
import React from 'react';
import type { AccountDto } from '@repo/services/users';
import { getCurrentUserForSession } from '@/lib/gateway/users';

export interface SessionResult {
  account: AccountDto;
}

// `cache: 'no-store'` guarantees a real backend round trip — auth checks
// never come from a cache; `React.cache` only dedupes within one render pass.
async function fetchValidatedSession(): Promise<SessionResult | null> {
  const account = await getCurrentUserForSession({ cache: 'no-store' });
  return account ? { account } : null;
}

export const validateSession = React.cache(fetchValidatedSession);
export const getServerSession = validateSession;
