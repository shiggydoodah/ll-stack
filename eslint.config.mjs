import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

const noTailwindVarLonghand = {
  selector: 'Literal[value=/\\[var\\(--/]',
  message:
    'Use Tailwind v4 CSS variable shorthand: bg-(--ui-background) not bg-[var(--ui-background)].',
};

// A form field with no id/name is unidentifiable to the browser: it reports the
// field under DevTools > Issues and skips it for autofill. Controls inside
// `<FieldControl>` are exempt — `Field` injects the id there — and so is
// anything taking a prop spread, whose source supplies it (e.g. the id
// `useFileUpload`'s `getInputProps` returns).
//
// `name.name` matches plain tags (`<Input>`); `name.property.name` matches
// namespaced ones (`<Command.Input>`, which renders a real `<input>`).
const FORM_CONTROL_TAGS = 'input|select|textarea|Input|Select|Textarea|Checkbox|Radio|MetricInput';
const NEEDS_ID_MESSAGE =
  'Give this form control an `id` (or wrap it in `<FieldControl>` inside a `Field` to have one injected). Without an id or name the browser cannot autofill it.';
const withoutIdOutsideField = (nameMatcher) =>
  `JSXOpeningElement[${nameMatcher}=/^(${FORM_CONTROL_TAGS})$/]:not(:has(JSXAttribute[name.name="id"])):not(:has(JSXSpreadAttribute)):not(JSXElement[openingElement.name.name="FieldControl"] JSXOpeningElement)`;

const formControlNeedsId = {
  selector: withoutIdOutsideField('name.name'),
  message: NEEDS_ID_MESSAGE,
};

const namespacedFormControlNeedsId = {
  selector: withoutIdOutsideField('name.property.name'),
  message: NEEDS_ID_MESSAGE,
};

// Reaching into another package's compiled output. Applies repo-wide.
//
// SPREAD BACK INTO EVERY `no-restricted-imports` BLOCK BELOW. Flat config does
// not merge a rule's options across blocks — the last matching block replaces
// them outright — so an override that forgot this list would silently reopen the
// dist/build imports for those files.
const NO_BUILD_OUTPUT_IMPORT_PATTERNS = [
  'next/dist/**',
  'next/build/**',
  'react/dist/**',
  '**/dist/**',
  '**/build/**',
];

// Feature code takes the injected `PrismaService`; constructing a raw
// `PrismaClient` opens a second connection pool the lifecycle hooks never
// close and skips the slow-query logging the service wires up. The service
// and module that DECLARE the client are exempt below, as are colocated
// `*.spec.ts` files, which ship in no build and have to be able to type the
// client they hand a test double.
const NO_RAW_PRISMA_CLIENT_IMPORT = {
  name: '@prisma/client',
  importNames: ['PrismaClient'],
  message:
    'Feature code takes the injected `PrismaService` (see apps/backend/src/prisma). Constructing a raw `PrismaClient` opens an unmanaged connection pool and bypasses slow-query logging. A new sanctioned holder is a design conversation, not a lint exemption.',
};

const RAW_PRISMA_LINT_EXEMPT_FILES = [
  'apps/backend/src/prisma/prisma.service.ts',
  'apps/backend/src/prisma/prisma.module.ts',
  'apps/backend/src/**/*.spec.ts',
];

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'packages/services/src/**/generated/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  },

  // TypeScript base — all .ts / .tsx files
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-restricted-imports': ['error', { patterns: NO_BUILD_OUTPUT_IMPORT_PATTERNS }],
    },
  },

  // Backend feature code — no raw `PrismaClient`. See
  // NO_RAW_PRISMA_CLIENT_IMPORT above for why.
  {
    files: ['apps/backend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: NO_BUILD_OUTPUT_IMPORT_PATTERNS,
          paths: [NO_RAW_PRISMA_CLIENT_IMPORT],
        },
      ],
    },
  },

  // The exemptions — see RAW_PRISMA_LINT_EXEMPT_FILES above.
  {
    files: RAW_PRISMA_LINT_EXEMPT_FILES,
    rules: {
      'no-restricted-imports': ['error', { patterns: NO_BUILD_OUTPUT_IMPORT_PATTERNS }],
    },
  },

  // React — frontend apps and UI package
  {
    files: ['apps/frontend/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: '19' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-restricted-syntax': [
        'error',
        noTailwindVarLonghand,
        formControlNeedsId,
        namespacedFormControlNeedsId,
      ],
    },
  },

  // Specs render bare primitives to assert the primitive's own behaviour, so the
  // rendered-page id requirement doesn't apply to them.
  {
    files: ['apps/frontend/**/*.test.{ts,tsx}', 'packages/ui/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', noTailwindVarLonghand],
    },
  },

  // Enforce const arrow functions in JSX files
  {
    files: ['apps/frontend/**/*.tsx', 'packages/ui/**/*.tsx'],
    rules: {
      'func-style': ['error', 'expression'],
    },
  },

  // Frontend uses structured logging — no stray console.* calls.
  {
    files: ['apps/frontend/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },

  // The logging modules are the one sanctioned place for console: they fall
  // back to it when remote shipping is disabled or in development.
  {
    files: ['apps/frontend/lib/logging/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },

  // Prettier — must be last
  prettierConfig,
];
