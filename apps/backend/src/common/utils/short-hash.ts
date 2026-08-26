import { createHash } from 'node:crypto';

/**
 * A 16-char sha256 prefix — the `ipHash` / `actorHash` / `emailHash`
 * construction used across the backend's log facets and
 * throttle trackers. Never the raw value: it collapses repeat occurrences of
 * one item (an email, an IP, an external reference) into a single identifiable
 * token without putting the value itself in the log store.
 */
export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
