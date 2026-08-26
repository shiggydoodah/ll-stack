import type { CreateClientConfig } from './generated/client.gen';
import { getBackendApiSecret, getBackendInternalUrl } from '../core/client-env';

export const createClientConfig: CreateClientConfig = (config) => ({
  baseUrl: getBackendInternalUrl(),
  auth: getBackendApiSecret(),
  ...config,
});
