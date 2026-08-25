import 'server-only';
import { getDashboard as getDashboardGenerated } from '@repo/services/dashboard';
import type { DashboardResponseDto, GetDashboardData, Options } from '@repo/services/dashboard';
import { gatewayWrapper } from './gateway-wrapper';
import type { ServiceResult } from '@repo/services/core';

type ThrowOnError = false;

const SERVICE_NAME = 'dashboard gateway';

// Uncached deliberately: the dashboard shows who just signed up, and the read
// is a cheap bounded summary. Introduce the cached-gateway pattern (see
// getCurrentUserCached in users.ts) when a slower or hotter read lands.
export const getDashboard = (
  options?: Options<GetDashboardData, ThrowOnError>,
): Promise<ServiceResult<DashboardResponseDto, unknown>> =>
  gatewayWrapper(
    (headers) =>
      getDashboardGenerated(
        headers ? { ...options, headers: { ...(options?.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] get dashboard`,
  );
