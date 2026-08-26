export type RuntimeEnvironment = 'development' | 'test' | 'staging' | 'production';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Per-environment default thresholds (a level is emitted when its severity is
// >= the threshold). Chosen so each level has a clear audience:
//   trace — development only (fine-grained, noisy)
//   debug — development + staging (diagnostic breadcrumbs, off in production)
//   info  — every environment, including production
// Override per environment with LOG_LEVEL (backend / Next server) or
// NEXT_PUBLIC_LOG_LEVEL (browser).
export const DEFAULT_LOG_LEVEL_BY_ENV: Record<RuntimeEnvironment, LogLevel> = {
  development: 'trace',
  staging: 'debug',
  production: 'info',
  test: 'warn',
};
