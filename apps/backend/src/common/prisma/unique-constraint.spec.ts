import {
  isUniqueConstraintError,
  uniqueConstraintTargets,
  violatesUniqueConstraint,
} from './unique-constraint';

/**
 * Error shapes mirror what Prisma 7.9 on the pg driver adapter actually
 * reports (probed against a real database, see unique-constraint.ts): the
 * constraint lands in `meta.driverAdapterError.cause.constraint`, and the
 * documented `meta.target` is only a fallback shape for future drivers.
 */
function driverAdapterViolation(constraint: { fields?: string[]; index?: string }) {
  return {
    code: 'P2002',
    meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint } } },
  };
}

function rawViolation(constraint: { fields?: string[]; index?: string }) {
  return {
    code: 'P2010',
    meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint } } },
  };
}

function rawForeignKeyViolation(index: string) {
  return {
    code: 'P2010',
    meta: {
      driverAdapterError: {
        cause: { kind: 'ForeignKeyConstraintViolation', constraint: { index } },
      },
    },
  };
}

describe('isUniqueConstraintError', () => {
  it('accepts a modelled P2002', () => {
    expect(isUniqueConstraintError(driverAdapterViolation({ fields: ['email'] }))).toBe(true);
  });

  it('accepts a raw P2010 whose driver kind is a unique violation', () => {
    expect(isUniqueConstraintError(rawViolation({ fields: ['email'] }))).toBe(true);
  });

  it('rejects a raw P2010 of any other kind — an FK violation is not a unique violation', () => {
    expect(isUniqueConstraintError(rawForeignKeyViolation('users_org_id_fkey'))).toBe(false);
  });

  it('rejects non-Prisma errors and non-objects', () => {
    expect(isUniqueConstraintError(new Error('boom'))).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
    expect(isUniqueConstraintError('P2002')).toBe(false);
  });
});

describe('uniqueConstraintTargets', () => {
  it('reads the driver-adapter constraint columns, lowercased', () => {
    expect(uniqueConstraintTargets(driverAdapterViolation({ fields: ['Email'] }))).toEqual([
      'email',
    ]);
  });

  it('reads composite constraints in reported order', () => {
    expect(uniqueConstraintTargets(rawViolation({ fields: ['org_id', 'email'] }))).toEqual([
      'org_id',
      'email',
    ]);
  });

  it('falls back to meta.target when the driver reports nothing', () => {
    expect(uniqueConstraintTargets({ code: 'P2002', meta: { target: ['email'] } })).toEqual([
      'email',
    ]);
    expect(uniqueConstraintTargets({ code: 'P2002', meta: { target: 'users_email_key' } })).toEqual(
      ['users_email_key'],
    );
  });

  it('reports nothing for an FK violation — never an FK index name', () => {
    expect(uniqueConstraintTargets(rawForeignKeyViolation('users_org_id_fkey'))).toEqual([]);
  });
});

describe('violatesUniqueConstraint', () => {
  const emailUnique = { columns: ['email'], index: 'users_email_key' } as const;

  it('matches an exact column set', () => {
    expect(
      violatesUniqueConstraint(driverAdapterViolation({ fields: ['email'] }), emailUnique),
    ).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(
      violatesUniqueConstraint(driverAdapterViolation({ fields: ['Email'] }), emailUnique),
    ).toBe(true);
  });

  it('matches on the index name when a driver reports it', () => {
    expect(
      violatesUniqueConstraint(driverAdapterViolation({ index: 'users_email_key' }), emailUnique),
    ).toBe(true);
  });

  it('does NOT match a subset — one shared column is not the composite', () => {
    expect(
      violatesUniqueConstraint(driverAdapterViolation({ fields: ['email'] }), {
        columns: ['org_id', 'email'],
      }),
    ).toBe(false);
  });

  it('does NOT match a superset — a widened unique is a different constraint', () => {
    expect(
      violatesUniqueConstraint(driverAdapterViolation({ fields: ['org_id', 'email', 'kind'] }), {
        columns: ['org_id', 'email'],
      }),
    ).toBe(false);
  });

  it('empty columns match nothing by column — index-name-only asks fail closed', () => {
    expect(
      violatesUniqueConstraint(driverAdapterViolation({ fields: ['email'] }), {
        columns: [],
        index: 'other_table_email_key',
      }),
    ).toBe(false);
  });

  it('an unreadable target answers false — fail closed, never guess', () => {
    expect(violatesUniqueConstraint({ code: 'P2002', meta: {} }, emailUnique)).toBe(false);
    expect(violatesUniqueConstraint(new Error('boom'), emailUnique)).toBe(false);
  });
});
