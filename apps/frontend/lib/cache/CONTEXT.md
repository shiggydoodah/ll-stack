# Context: apps/frontend/lib/cache

## Purpose

- Generic Next cache plumbing: the cache-tag vocabulary, the named lifetime
  profiles, and the session-aware cache helper. Domain cached reads themselves
  live in `lib/gateway/`.

## Architecture

- `tags.ts` — `cacheTags`: `currentUser(userId)`,
  `emailVerificationState(fingerprint)`, and the shared `killSwitchStatus`
  string. One place so a tag and its invalidation cannot drift apart.
- `life.ts` — `cacheLifeProfiles`: `default`/`medium` (60 s revalidate, 300 s
  expire), `short` (30/60), `long` (300/900), `veryLong` (900/3600), typed by
  `CacheLifeProfile`.
- `utils.ts` — `withSessionCache(cachedFn)`: reads the session cookie **outside**
  the cached function and passes it in as a parameter, returning `null` when
  there is no session.

## Key Flows

- Cached gateway read pattern (see `lib/gateway/users.ts`):
  `withSessionCache(fetchX)` where `fetchX(userId, session)` is `'use cache'` +
  `cacheLife(cacheLifeProfiles.medium)` + `cacheTag(cacheTags.currentUser(userId))`.
- Mutations invalidate with `revalidateTag(cacheTags.…)` / `revalidatePath` from
  the server action.

## Gotchas

- **Request-scoped APIs cannot be called inside `'use cache'`** — that is the
  whole reason `withSessionCache` exists: `cookies()` runs outside, the session
  value crosses as an argument.
- `AsyncLocalStorage` correlation context does not cross the cache boundary
  either, so cached gateway calls forward no correlation headers by design.
- Never cache an auth check. `validateSession()` uses `cache: 'no-store'`;
  `getCurrentUserCached` is display-only.
- `next.config.ts` sets `cacheComponents: true`, so caching behaviour differs
  from older Next defaults — check `node_modules/next/dist/docs/` before
  assuming an API.

## Agent Notes

- Add a tag here rather than writing a template string at the call site, and add
  it alongside the code that invalidates it.
- Pick an existing life profile; add a new one only when an actual read needs a
  lifetime none of them expresses.
