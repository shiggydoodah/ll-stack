import 'server-only';
import { getSession } from '../authentication/session-cookie';

export function withSessionCache<T>(
  cachedFn: (userId: string, session: string) => Promise<T | null>,
): (userId: string) => Promise<T | null> {
  return async (userId: string) => {
    const session = await getSession();
    if (!session) return null;
    return cachedFn(userId, session);
  };
}
