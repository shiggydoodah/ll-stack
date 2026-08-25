import { defineConfig } from '@hey-api/openapi-ts';

const input = process.env['OPENAPI_SPEC_PATH'] ?? 'http://localhost:3100/docs-json';
const outputPath = process.env['OPENAPI_OUTPUT_PATH'] ?? 'src/auth/generated';
const runtimeConfigPath = process.env['OPENAPI_RUNTIME_CONFIG_PATH'] ?? '../hey-api';

export default defineConfig({
  input,
  output: {
    path: outputPath,
    clean: true,
    postProcess: [],
  },
  plugins: [
    {
      name: '@hey-api/client-next',
      runtimeConfigPath,
    },
    '@hey-api/schemas',
    {
      name: '@hey-api/sdk',
      operations: {
        strategy: 'flat',
        nesting: 'operationId',
      },
    },
    {
      name: '@hey-api/typescript',
      enums: 'javascript',
    },
  ],
});
