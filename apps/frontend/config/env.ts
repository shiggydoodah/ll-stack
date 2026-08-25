import { serverEnvSchema, type ServerEnv } from './env.schema';

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}
