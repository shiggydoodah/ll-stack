import { defineConfig } from 'vitest/config';

// The default environment stays `node`; DOM tests opt in per-file with a
// `// @vitest-environment jsdom` pragma. `setupFiles` runs for every test
// regardless of environment, so raw `react-dom`/`act` tests don't each need
// to set `IS_REACT_ACT_ENVIRONMENT` themselves to keep React's act-environment
// warning quiet.
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
