import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
  getTestDatabaseUrl,
} from './helpers/test-database-url';

const originalDatabaseUrl = process.env['DATABASE_URL'];
// This spec itself runs inside some jest worker, so JEST_WORKER_ID is always
// set to a value we don't control — every test pins it explicitly.
const originalWorkerId = process.env['JEST_WORKER_ID'];

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('test database URL guard', () => {
  afterEach(() => {
    restoreEnv('DATABASE_URL', originalDatabaseUrl);
    restoreEnv('JEST_WORKER_ID', originalWorkerId);
  });

  it('uses the llstack_test default when DATABASE_URL is not set', () => {
    delete process.env['DATABASE_URL'];
    process.env['JEST_WORKER_ID'] = '1';

    expect(getTestDatabaseUrl()).toBe(DEFAULT_TEST_DATABASE_URL);
    expect(assertTestDatabaseUrl()).toBe(DEFAULT_TEST_DATABASE_URL);
  });

  it('routes worker N > 1 to its per-worker clone of the default database', () => {
    delete process.env['DATABASE_URL'];
    process.env['JEST_WORKER_ID'] = '3';

    expect(getTestDatabaseUrl()).toBe(
      'postgresql://postgres:postgres@localhost:5433/llstack_test_w3',
    );
  });

  it('treats an explicit DATABASE_URL as the base for the per-worker clone', () => {
    process.env['DATABASE_URL'] = 'postgresql://postgres:postgres@ci-host:5432/llstack_test';
    process.env['JEST_WORKER_ID'] = '2';

    expect(getTestDatabaseUrl()).toBe(
      'postgresql://postgres:postgres@ci-host:5432/llstack_test_w2',
    );
  });

  it('does not suffix an already worker-scoped DATABASE_URL again', () => {
    process.env['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5433/llstack_test_w2';
    process.env['JEST_WORKER_ID'] = '2';

    expect(getTestDatabaseUrl()).toBe(
      'postgresql://postgres:postgres@localhost:5433/llstack_test_w2',
    );
  });

  it('keeps the base database for worker 1 and for runs without a worker id', () => {
    delete process.env['DATABASE_URL'];

    process.env['JEST_WORKER_ID'] = '1';
    expect(getTestDatabaseUrl()).toBe(DEFAULT_TEST_DATABASE_URL);

    delete process.env['JEST_WORKER_ID'];
    expect(getTestDatabaseUrl()).toBe(DEFAULT_TEST_DATABASE_URL);
  });

  it('allows llstack_test PostgreSQL URLs', () => {
    const url = 'postgresql://postgres:postgres@localhost:5433/llstack_test';

    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it('allows postgres URLs whose database name ends in _test', () => {
    const url = 'postgres://postgres:postgres@localhost:5433/feature_test';

    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it('allows per-worker clones of test databases', () => {
    const url = 'postgresql://postgres:postgres@localhost:5433/llstack_test_w4';

    expect(assertTestDatabaseUrl(url)).toBe(url);
  });

  it('rejects non-test database names before Prisma is created', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5433/llstack_dev'),
    ).toThrow(/destructive Prisma cleanup/);
  });

  it('rejects worker-suffixed names whose base is not a test database', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5433/llstack_dev_w2'),
    ).toThrow(/destructive Prisma cleanup/);
  });

  it('rejects empty database names with a clear placeholder', () => {
    expect(() => assertTestDatabaseUrl('postgresql://postgres:postgres@localhost:5433/')).toThrow(
      /database "\(none\)"/,
    );
  });

  it('rejects malformed database URLs with a clear error', () => {
    expect(() => assertTestDatabaseUrl('not a url')).toThrow(
      /Invalid DATABASE_URL for backend integration tests/,
    );
  });

  it('rejects non-PostgreSQL URLs even when the database name looks test-scoped', () => {
    expect(() => assertTestDatabaseUrl('mysql://root:root@localhost:3306/llstack_test')).toThrow(
      /Expected a PostgreSQL test database URL/,
    );
  });
});
