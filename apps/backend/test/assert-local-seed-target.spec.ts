import {
  assertLocalSeedTarget,
  describeTargetDatabase,
} from '../scripts/lib/assert-local-seed-target';

const WRITES = 'known-credential accounts';
const LOCAL = 'postgresql://postgres:postgres@localhost:5433/llstack_dev';

describe('assertLocalSeedTarget (unit)', () => {
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
  });

  it.each([
    ['localhost', LOCAL],
    ['127.0.0.1', 'postgresql://postgres:postgres@127.0.0.1:5433/llstack_dev'],
    ['a non-default local port', 'postgresql://postgres:postgres@localhost:6544/whatever'],
  ])('permits %s', (_label, url) => {
    process.env['NODE_ENV'] = 'development';
    expect(() => assertLocalSeedTarget(WRITES, url)).not.toThrow();
  });

  it.each([
    ['a remote host', 'postgresql://user:pw@db.example.com:5432/app'],
    ['an RDS host', 'postgresql://user:pw@prod.abc123.eu-west-2.rds.amazonaws.com:5432/app'],
    ['a bare IP that is not loopback', 'postgresql://user:pw@10.0.0.5:5432/app'],
  ])('refuses %s', (_label, url) => {
    process.env['NODE_ENV'] = 'development';
    expect(() => assertLocalSeedTarget(WRITES, url)).toThrow(/non-local database host/);
  });

  it.each(['production', 'staging'])('refuses NODE_ENV=%s even against localhost', (nodeEnv) => {
    process.env['NODE_ENV'] = nodeEnv;
    expect(() => assertLocalSeedTarget(WRITES, LOCAL)).toThrow(/Refusing to seed with NODE_ENV/);
  });

  it('refuses an unparseable DATABASE_URL rather than assuming it is safe', () => {
    process.env['NODE_ENV'] = 'development';
    expect(() => assertLocalSeedTarget(WRITES, 'not-a-url')).toThrow(/not a valid URL/);
  });

  it('explains which script is refusing, and why', () => {
    process.env['NODE_ENV'] = 'development';
    expect(() =>
      assertLocalSeedTarget(
        'a fabricated dev-fixture dataset',
        LOCAL.replace('localhost', 'db.example.com'),
      ),
    ).toThrow(/a fabricated dev-fixture dataset/);
  });
});

describe('describeTargetDatabase (unit)', () => {
  it('reports host and database name', () => {
    expect(describeTargetDatabase(LOCAL)).toBe('localhost:5433/llstack_dev');
  });

  // The whole point of this helper is that an operator can see the target
  // without the script printing their password into a terminal or a CI log.
  it('never leaks credentials', () => {
    const described = describeTargetDatabase(
      'postgresql://alice:hunter2@localhost:5433/llstack_dev',
    );
    expect(described).not.toContain('hunter2');
    expect(described).not.toContain('alice');
  });

  it('degrades gracefully on an unparseable URL', () => {
    expect(describeTargetDatabase('nonsense')).toBe('unparseable DATABASE_URL');
  });
});
