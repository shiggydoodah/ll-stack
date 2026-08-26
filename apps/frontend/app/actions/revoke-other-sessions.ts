'use server';

import { refresh } from 'next/cache';
import { revokeAllSessions } from '@/lib/gateway/auth';
import { ERROR_MESSAGES } from '@/lib/constants';
import { actionWrapper } from '@/lib/actions/action-wrapper';

/**
 * What the account page shows after the member pressed the button. A count
 * rather than a bare success, because the number is the answer to the question
 * they asked — a "signed out" toast on zero sessions is a lie by omission.
 */
export type RevokeOtherSessionsResult =
  | { readonly ok: true; readonly revokedSessions: number }
  | { readonly ok: false; readonly error: string };

/**
 * Ends every sign-in on the account except the one running this action.
 *
 * `keepCurrent` is hard-coded true here, not passed in. The backend route
 * revokes everything by default and this is the "sign out everywhere else"
 * control; leaving the choice to a caller is how it eventually gets called with
 * the wrong one and signs the member out of the page they are standing on.
 */
export const revokeOtherSessionsAction = actionWrapper(
  'revokeOtherSessionsAction',
  async (): Promise<RevokeOtherSessionsResult> => {
    const result = await revokeAllSessions(true);

    if (!result.ok) {
      if (result.status === 429) {
        return { ok: false, error: ERROR_MESSAGES.TOO_MANY_ATTEMPTS_MESSAGE };
      }
      return { ok: false, error: ERROR_MESSAGES.GENERIC_ERROR_MESSAGE };
    }

    // The list this page is showing has just gone stale. The read behind it is
    // uncached, so there is no cache entry to invalidate — the client router is
    // what is holding the old rows, and this is what tells it to ask again.
    refresh();

    return { ok: true, revokedSessions: result.data?.revokedSessions ?? 0 };
  },
);
