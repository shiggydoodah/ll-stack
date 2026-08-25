/**
 * The `P2002` constraint-target reader, shared so a version-dependent Prisma
 * workaround cannot end up byte-for-byte duplicated across feature modules —
 * one Prisma upgrade away from being fixed in some copies and not others. Each
 * module still owns its OWN constraint definitions (which columns, which index)
 * as domain facts; only the reader and the predicate live here (`common` is the
 * shared move; a feature module importing another feature's internals is not).
 */

/** What Prisma codes a unique violation raised by a MODELLED write (`create`, `upsert`, …). */
const PRISMA_UNIQUE_CONSTRAINT = 'P2002';

/**
 * What Prisma codes a RAW statement's failure — `$executeRaw`, `$queryRaw` — and
 * it codes EVERY one of them, not just a unique violation.
 *
 * A raw insert that duplicates a unique never reaches `P2002` at all: Prisma 7.9
 * on the pg driver adapter reports `P2010` ("Raw query failed") and puts the
 * classification one level down, in `meta.driverAdapterError.cause.kind`. That
 * asymmetry is invisible from the call site — the same duplicate row, written
 * two ways, arrives as two different codes — which is why it is read here rather
 * than by whichever service happens to hit it first.
 */
const PRISMA_RAW_QUERY_FAILED = 'P2010';

/**
 * The `kind` the driver adapter puts on a raw unique violation, and the ONLY one
 * that may be read as one.
 *
 * `P2010` alone is not enough and the difference is not academic — probed
 * against the real database, a foreign-key violation arrives as `P2010` with
 * `kind: 'ForeignKeyConstraintViolation'` AND a `constraint.index` naming the
 * FK, so a code-only test would hand the reader below an FK's name to match
 * against a caller's index. A not-null violation and a check violation are two
 * more `P2010`s. The kind is what separates them, and reading it is what keeps
 * this predicate answering the question its name asks.
 */
const DRIVER_UNIQUE_VIOLATION_KIND = 'UniqueConstraintViolation';

function readProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/** Where the pg driver adapter puts what it knows, on both codes. */
function driverAdapterCause(error: unknown): unknown {
  return readProperty(readProperty(readProperty(error, 'meta'), 'driverAdapterError'), 'cause');
}

/**
 * Structural read rather than `instanceof` — the caller must not depend on
 * the Prisma error class.
 *
 * BOTH SPELLINGS, because a service is allowed to write raw SQL and a unique
 * violation means the same thing whichever statement raised it. See
 * {@link PRISMA_RAW_QUERY_FAILED}.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  const code = readProperty(error, 'code');
  if (code === PRISMA_UNIQUE_CONSTRAINT) {
    return true;
  }

  return (
    code === PRISMA_RAW_QUERY_FAILED &&
    readProperty(driverAdapterCause(error), 'kind') === DRIVER_UNIQUE_VIOLATION_KIND
  );
}

function toStringTokens(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value.toLowerCase()];
  }
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.toLowerCase());
  }
  return [];
}

/**
 * What a `P2002` reported, SPLIT BY WHAT THE TOKENS NAME. A column list and an
 * index name are matched on different terms — the columns as a whole set, the
 * name as a single token — so they cannot share one flat list: flattening them
 * is what let a set be considered satisfied by a superset of itself.
 */
interface UniqueConstraintReport {
  /** The constraint's columns, in the order reported, lowercased. */
  readonly columns: readonly string[];
  /** Tokens naming the INDEX rather than its columns, lowercased. */
  readonly names: readonly string[];
}

const NOTHING_REPORTED: UniqueConstraintReport = { columns: [], names: [] };

/**
 * Read a unique violation's target, classified.
 *
 * Two shapes are read because which one a driver reports is version-dependent,
 * not because both are observed today: Prisma 7.9 on the pg driver adapter
 * reports `meta.driverAdapterError.cause.constraint.{fields,index}` — the
 * constraint's columns, in order, with no `index` key — and leaves the
 * documented `meta.target` empty, so that is read as the fallback for a future
 * driver that reports it instead.
 *
 * THE RAW-STATEMENT SHAPE NEEDS NO SECOND READER, which is the one good surprise
 * in `P2010`: the driver adapter fills the SAME `constraint.fields` for a raw
 * duplicate as for a modelled one — probed against the real database, a raw
 * insert violating a composite unique reports exactly its columns, in order —
 * so only the CODE test above had to grow. The `meta.target` fallback below is
 * documented for `P2002` alone and simply never fires on a raw error.
 *
 * THE FALLBACK IS CLASSIFIED BY ITS SHAPE, which is Prisma's own distinction:
 * `meta.target` is documented as a `string[]` of field names or a `string`
 * naming the constraint, so an array is read as columns and a bare string as a
 * name. A future driver that reported an index NAME inside an array would land
 * on the column arm and match nothing — a fail-closed miss (a 500 rather than
 * the typed outcome), which is the posture this module owes its callers, and
 * the index arm below reads every token anyway for exactly that case.
 *
 * Reports nothing when the target cannot be determined. Callers MUST fail
 * closed on that — never guess which constraint fired.
 */
function readUniqueConstraintReport(error: unknown): UniqueConstraintReport {
  if (!isUniqueConstraintError(error)) {
    return NOTHING_REPORTED;
  }

  const meta = readProperty(error, 'meta');
  const constraint = readProperty(
    readProperty(readProperty(meta, 'driverAdapterError'), 'cause'),
    'constraint',
  );

  const columns = toStringTokens(readProperty(constraint, 'fields'));
  const names = toStringTokens(readProperty(constraint, 'index'));
  if (columns.length > 0 || names.length > 0) {
    return { columns, names };
  }

  const target = readProperty(meta, 'target');
  return typeof target === 'string'
    ? { columns: [], names: toStringTokens(target) }
    : { columns: toStringTokens(target), names: [] };
}

/**
 * Which columns (or index) a unique violation fired on, lowercased and flattened.
 *
 * THE LOW-LEVEL READER, and deliberately not what a service should reach for:
 * a caller comparing these tokens itself is one `includes` away from the
 * bare-token misclassification {@link violatesUniqueConstraint} exists to
 * prevent. Its callers are this module's own predicate and the integration
 * specs that pin what a REAL driver reports — nothing in a feature module.
 *
 * Returns an empty list when the target cannot be determined.
 */
export function uniqueConstraintTargets(error: unknown): readonly string[] {
  const { columns, names } = readUniqueConstraintReport(error);
  return [...columns, ...names];
}

/**
 * A unique constraint a caller wants to test a `P2002` against: its columns
 * IN FULL, plus the index name a future driver upgrade might report instead.
 * There is deliberately no bare-string overload — `columns` is required, so a
 * single bare column token does not compile.
 *
 * A COLUMN NAME ON ITS OWN IS NOT A CONSTRAINT. The target Prisma reports
 * carries no table, so a single-column token identifies a column name across
 * the WHOLE SCHEMA, not one table's index. The moment two tables share a
 * column name and one of them has it as its own single-column unique, a bare
 * token meant for one constraint silently matches the other — reclassifying an
 * unrelated error as the typed outcome a caller swallows. Matching the whole
 * column set closes that: only an EXACT set match, or the index name, counts.
 *
 * AND A WHOLE COLUMN SET IS NOT A CONSTRAINT EITHER, ONCE TWO TABLES SHARE ONE.
 * If two tables carry byte-identical composite uniques, an exact set match no
 * longer separates them on its own. A caller may still match on columns when it
 * can say which STATEMENT raised the error and show it could not have hit the
 * twin (a single-table `updateMany`, an `upsert` on a path that writes only one
 * of the two tables). Index-name-only matching is the alternative — it fails
 * closed on today's driver, which turns the typed outcome into a 500, so it is
 * the right trade only when the statement cannot be bounded.
 *
 * EXACT MEANS EXACT — NOT "CONTAINS", IN EITHER DIRECTION. A subset of
 * `columns` does not match (that is the misread above), and neither does a
 * SUPERSET: a reported `(a, b, c)` is a different constraint from `(a, b)` and
 * must not answer to it. Widening an existing unique with an extra column is an
 * ordinary migration, and a containment test would silently keep matching it
 * under the OLD constraint's meaning.
 *
 * `columns: []` MATCHES NOTHING BY COLUMN, deliberately, and is the supported
 * spelling of INDEX-NAME-ONLY matching (`{ columns: [], index }`) — the safe
 * way to ask about a constraint whose column set another table duplicates byte
 * for byte WHEN THE CALLER CANNOT BOUND THE STATEMENT that raised the error.
 * It fails closed until a driver reports index names, which is the point. An
 * empty set must never be the wildcard that vacuous `every()` semantics would
 * make it.
 */
export interface UniqueConstraintTarget {
  readonly columns: readonly string[];
  readonly index?: string;
}

/**
 * Did this error violate the named unique constraint? An unreadable target
 * answers `false` — fail closed, never guess.
 */
export function violatesUniqueConstraint(
  error: unknown,
  constraint: UniqueConstraintTarget,
): boolean {
  const report = readUniqueConstraintReport(error);
  const { columns, index } = constraint;

  // THE INDEX ARM READS EVERY REPORTED TOKEN, columns included, where the
  // column arm below reads only the column group. That asymmetry is the point:
  // an index name is unique across the whole schema, so a token equal to one
  // can only have come from that index and there is no ambiguity to protect
  // against — which also means a future driver reporting the name in the wrong
  // group is still read correctly. A COLUMN name carries no such guarantee,
  // and that is the entire subject of the note above.
  const wantedIndex = index?.toLowerCase();
  if (
    wantedIndex !== undefined &&
    (report.names.includes(wantedIndex) || report.columns.includes(wantedIndex))
  ) {
    return true;
  }

  // Sets rather than lengths-and-`every`, so a repeated column on either side
  // cannot stand in for a missing one.
  const wanted = new Set(columns.map((column) => column.toLowerCase()));
  if (wanted.size === 0) {
    return false;
  }
  const reported = new Set(report.columns);
  return reported.size === wanted.size && [...wanted].every((column) => reported.has(column));
}
