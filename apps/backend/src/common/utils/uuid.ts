// UUID guard for `@db.Uuid` lookup paths.
//
// Why: every PK and FK column is `@db.Uuid`. Prisma validates input shape
// before sending it to Postgres and throws `P2007` for non-UUID strings. That
// surfaces as a 500 instead of the domain-level NOT_FOUND error the caller
// expects when a client sends a malformed ID. Services use this guard to
// translate "malformed UUID" into the same not-found path as "well-formed but
// absent UUID".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
