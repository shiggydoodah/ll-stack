import { describe, expect, it } from 'vitest';
import {
  computeDomainSourceHash,
  computeSourceHash,
  createDomainSpecs,
  findDriftedDomains,
  normalizeNullableEnums,
  parseGenArgs,
  parseOpenApiDocument,
  selectDomainSpecs,
  shouldSkipDomainGeneration,
  shouldSkipGeneration,
  validateKnownTags,
  type OpenApiDocument,
} from './gen-client-lib';

const MANIFEST = [
  { name: 'auth', tag: 'auth' },
  { name: 'posts', tag: 'posts' },
  { name: 'messaging', tag: 'messaging' },
];

const sampleSpec: OpenApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Test',
    version: '1.0.0',
  },
  tags: [{ name: 'auth' }, { name: 'health' }, { name: 'admin-internal' }],
  components: {
    schemas: {
      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          session: { $ref: '#/components/schemas/SessionDto' },
        },
      },
      SessionDto: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/UserSummary' },
        },
      },
      UserSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
      },
      UnrelatedProfile: {
        type: 'object',
        properties: {
          displayName: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['auth'],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
        },
      },
      parameters: [{ name: 'x-request-id', in: 'header', required: false }],
    },
    '/health': {
      get: {
        tags: ['health'],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/admin-internal/ping': {
      get: {
        tags: ['admin-internal'],
      },
    },
  },
};

describe('gen-client-lib', () => {
  it('parses a valid OpenAPI JSON document', () => {
    const parsed = parseOpenApiDocument(JSON.stringify(sampleSpec));
    expect(parsed.openapi).toBe('3.0.0');
  });

  it('computes a stable hash for the same document and manifest', () => {
    const hash1 = computeSourceHash(sampleSpec);
    const hash2 = computeSourceHash(sampleSpec);
    expect(hash1).toBe(hash2);
  });

  it('includes manifest changes in hash calculations', () => {
    const defaultHash = computeSourceHash(sampleSpec);
    const changedHash = computeSourceHash(sampleSpec, [{ name: 'auth', tag: 'auth' }]);
    expect(defaultHash).not.toBe(changedHash);
  });

  it('skips generation only when hash matches and force is false', () => {
    expect(shouldSkipGeneration({ existingHash: 'abc', nextHash: 'abc', force: false })).toBe(true);
    expect(shouldSkipGeneration({ existingHash: 'abc', nextHash: 'def', force: false })).toBe(
      false,
    );
    expect(shouldSkipGeneration({ existingHash: 'abc', nextHash: 'abc', force: true })).toBe(false);
  });

  it('can skip generation per domain only when that domain output exists', () => {
    expect(
      shouldSkipDomainGeneration({
        existingHash: 'abc',
        nextHash: 'abc',
        force: false,
        outputExists: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipDomainGeneration({
        existingHash: 'abc',
        nextHash: 'abc',
        force: false,
        outputExists: false,
      }),
    ).toBe(false);
    expect(
      shouldSkipDomainGeneration({
        existingHash: 'abc',
        nextHash: 'def',
        force: false,
        outputExists: true,
      }),
    ).toBe(false);
  });

  it('creates per-domain specs with tagged operations only', () => {
    const domainSpecs = createDomainSpecs(
      sampleSpec,
      [
        { name: 'auth', tag: 'auth' },
        { name: 'health', tag: 'health' },
      ],
      ['admin-internal'],
    );

    const authSpec = domainSpecs.find((entry) => entry.domain === 'auth');
    expect(authSpec).toBeDefined();
    expect(authSpec?.document.tags).toEqual([{ name: 'auth' }]);
    expect(Object.keys(authSpec?.document.paths ?? {})).toEqual(['/auth/login']);
    expect(authSpec?.document.paths?.['/auth/login']).toMatchObject({
      parameters: [{ name: 'x-request-id', in: 'header', required: false }],
    });
    expect(authSpec?.document.paths?.['/health']).toBeUndefined();

    const healthSpec = domainSpecs.find((entry) => entry.domain === 'health');
    expect(healthSpec).toBeDefined();
    expect(Object.keys(healthSpec?.document.paths ?? {})).toEqual(['/health']);
    expect(healthSpec?.document.paths?.['/auth/login']).toBeUndefined();
  });

  it('recursively prunes component schemas that are not referenced by a domain', () => {
    const domainSpecs = createDomainSpecs(
      sampleSpec,
      [
        { name: 'auth', tag: 'auth' },
        { name: 'health', tag: 'health' },
      ],
      ['admin-internal'],
    );

    const authSpec = domainSpecs.find((entry) => entry.domain === 'auth');
    expect(Object.keys(authSpec?.document.components?.schemas ?? {})).toEqual([
      'LoginRequest',
      'LoginResponse',
      'SessionDto',
      'UserSummary',
    ]);
    expect(authSpec?.document.components?.schemas?.['HealthResponse']).toBeUndefined();
    expect(authSpec?.document.components?.schemas?.['UnrelatedProfile']).toBeUndefined();

    const healthSpec = domainSpecs.find((entry) => entry.domain === 'health');
    expect(Object.keys(healthSpec?.document.components?.schemas ?? {})).toEqual(['HealthResponse']);
  });

  it('computes hashes independently for each domain spec', () => {
    const domainSpecs = createDomainSpecs(
      sampleSpec,
      [
        { name: 'auth', tag: 'auth' },
        { name: 'health', tag: 'health' },
      ],
      ['admin-internal'],
    );
    const authSpec = domainSpecs.find((entry) => entry.domain === 'auth');
    const healthSpec = domainSpecs.find((entry) => entry.domain === 'health');

    expect(authSpec).toBeDefined();
    expect(healthSpec).toBeDefined();

    if (!authSpec || !healthSpec) {
      throw new Error('Expected auth and health domain specs');
    }

    expect(computeDomainSourceHash(authSpec)).not.toBe(computeDomainSourceHash(healthSpec));
  });

  it('fails unknown tags unless they are explicitly ignored', () => {
    const specWithUnknownTag: OpenApiDocument = {
      ...sampleSpec,
      tags: [...(sampleSpec.tags ?? []), { name: 'payments' }],
    };

    expect(() =>
      validateKnownTags(
        specWithUnknownTag,
        [
          { name: 'auth', tag: 'auth' },
          { name: 'health', tag: 'health' },
        ],
        ['admin-internal'],
      ),
    ).toThrow(/payments/);

    expect(() =>
      validateKnownTags(
        specWithUnknownTag,
        [
          { name: 'auth', tag: 'auth' },
          { name: 'health', tag: 'health' },
        ],
        ['admin-internal', 'payments'],
      ),
    ).not.toThrow();
  });

  it('ignores admin-internal without generating a domain for it', () => {
    const domainSpecs = createDomainSpecs(
      sampleSpec,
      [
        { name: 'auth', tag: 'auth' },
        { name: 'health', tag: 'health' },
      ],
      ['admin-internal'],
    );

    expect(domainSpecs.map((entry) => entry.domain)).toEqual(['auth', 'health']);
    expect(domainSpecs.some((entry) => entry.domain === 'admin-internal')).toBe(false);
  });
});

describe('findDriftedDomains', () => {
  const domainSpecs = createDomainSpecs(
    sampleSpec,
    [
      { name: 'auth', tag: 'auth' },
      { name: 'health', tag: 'health' },
    ],
    ['admin-internal'],
  );
  const authSpec = domainSpecs.find((entry) => entry.domain === 'auth');
  const healthSpec = domainSpecs.find((entry) => entry.domain === 'health');
  if (!authSpec || !healthSpec) {
    throw new Error('Expected auth and health domain specs');
  }
  const authHash = computeDomainSourceHash(authSpec);
  const healthHash = computeDomainSourceHash(healthSpec);

  it('finds nothing drifted when every committed hash matches', () => {
    const committed = new Map([
      ['auth', authHash],
      ['health', healthHash],
    ]);

    expect(findDriftedDomains(domainSpecs, (domain) => committed.get(domain) ?? null)).toEqual([]);
  });

  it('names only the domain whose committed hash is stale', () => {
    const committed = new Map([
      ['auth', authHash],
      ['health', 'a-stale-hash'],
    ]);

    expect(findDriftedDomains(domainSpecs, (domain) => committed.get(domain) ?? null)).toEqual([
      'health',
    ]);
  });

  it('treats a missing committed hash as drift', () => {
    const committed = new Map([['auth', authHash]]);

    expect(findDriftedDomains(domainSpecs, (domain) => committed.get(domain) ?? null)).toEqual([
      'health',
    ]);
  });
});

describe('parseGenArgs', () => {
  it('defaults to all domains with flags off when given no args', () => {
    expect(parseGenArgs([], MANIFEST)).toEqual({
      domains: [],
      dryRun: false,
      force: false,
      list: false,
    });
  });

  it('collects positional domain names', () => {
    expect(parseGenArgs(['posts'], MANIFEST).domains).toEqual(['posts']);
    expect(parseGenArgs(['posts', 'auth'], MANIFEST).domains).toEqual(['posts', 'auth']);
  });

  it('parses the --dry-run and --force flags independent of order', () => {
    expect(parseGenArgs(['--dry-run', 'posts'], MANIFEST)).toEqual({
      domains: ['posts'],
      dryRun: true,
      force: false,
      list: false,
    });
    expect(parseGenArgs(['posts', '--force'], MANIFEST)).toEqual({
      domains: ['posts'],
      dryRun: false,
      force: true,
      list: false,
    });
  });

  it('parses the --list flag (optionally with pre-selected domains)', () => {
    expect(parseGenArgs(['--list'], MANIFEST)).toEqual({
      domains: [],
      dryRun: false,
      force: false,
      list: true,
    });
    expect(parseGenArgs(['--list', 'posts'], MANIFEST)).toEqual({
      domains: ['posts'],
      dryRun: false,
      force: false,
      list: true,
    });
  });

  it('throws on an unknown domain, listing the valid domains', () => {
    expect(() => parseGenArgs(['bogus'], MANIFEST)).toThrow(/Unknown domain\(s\): bogus/);
    expect(() => parseGenArgs(['bogus'], MANIFEST)).toThrow(/auth, posts, messaging/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseGenArgs(['--nope'], MANIFEST)).toThrow(/Unknown flag: --nope/);
  });

  it('ignores a standalone `--` separator (pnpm may forward it)', () => {
    expect(parseGenArgs(['--', '--dry-run', 'posts'], MANIFEST)).toEqual({
      domains: ['posts'],
      dryRun: true,
      force: false,
      list: false,
    });
  });
});

describe('selectDomainSpecs', () => {
  const specs = [
    { domain: 'auth', document: { openapi: '3.0.0' } },
    { domain: 'posts', document: { openapi: '3.0.0' } },
    { domain: 'messaging', document: { openapi: '3.0.0' } },
  ];

  it('returns every spec when no domains are requested', () => {
    expect(selectDomainSpecs(specs, []).map((spec) => spec.domain)).toEqual([
      'auth',
      'posts',
      'messaging',
    ]);
  });

  it('keeps only the requested domains', () => {
    expect(selectDomainSpecs(specs, ['posts']).map((spec) => spec.domain)).toEqual(['posts']);
  });
});

describe('normalizeNullableEnums', () => {
  const buildSpec = (schemas: Record<string, unknown>): OpenApiDocument => ({
    openapi: '3.0.0',
    components: { schemas },
    paths: {},
  });

  it('appends null to an inline nullable enum (component schema)', () => {
    const spec = buildSpec({
      UpdateDto: {
        type: 'object',
        properties: {
          drugs: { type: 'string', enum: ['never', 'sometimes', 'yes'], nullable: true },
        },
      },
    });

    const normalized = normalizeNullableEnums(spec);
    expect(normalized.components?.schemas?.['UpdateDto']).toEqual({
      type: 'object',
      properties: {
        drugs: { type: 'string', enum: ['never', 'sometimes', 'yes', null], nullable: true },
      },
    });
  });

  it('appends null to an inline nullable enum nested in a path response schema', () => {
    const spec: OpenApiDocument = {
      openapi: '3.0.0',
      paths: {
        '/things': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        rsvp: { type: 'string', enum: ['GOING', 'NOT_GOING'], nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const normalized = normalizeNullableEnums(spec);
    const rsvp = JSON.stringify(normalized);
    expect(rsvp).toContain('["GOING","NOT_GOING",null]');
  });

  it('leaves non-nullable enums untouched', () => {
    const spec = buildSpec({
      Dto: {
        type: 'object',
        properties: { scope: { type: 'string', enum: ['PUBLIC', 'FOLLOWERS'] } },
      },
    });

    expect(normalizeNullableEnums(spec)).toEqual(spec);
  });

  it('is idempotent when null is already an enum member', () => {
    const spec = buildSpec({
      Dto: {
        type: 'object',
        properties: {
          vote: { type: 'string', enum: ['UP', 'DOWN', null], nullable: true },
        },
      },
    });

    expect(normalizeNullableEnums(spec)).toEqual(spec);
    expect(normalizeNullableEnums(normalizeNullableEnums(spec))).toEqual(
      normalizeNullableEnums(spec),
    );
  });

  it('does not mutate the input document', () => {
    const spec = buildSpec({
      Dto: {
        type: 'object',
        properties: {
          drugs: { type: 'string', enum: ['never'], nullable: true },
        },
      },
    });
    const snapshot = JSON.parse(JSON.stringify(spec));

    normalizeNullableEnums(spec);
    expect(spec).toEqual(snapshot);
  });
});
