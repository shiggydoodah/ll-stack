export type ServiceResult<T, E = unknown> =
  | { ok: true; status: number; message: string; data: T; response: Response }
  | { ok: false; status: number; message: string; error: E; response: Response | undefined };

const HTTP_STATUS_TEXT: Partial<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function statusMessage(status: number): string {
  return HTTP_STATUS_TEXT[status] ?? `HTTP ${status}`;
}

function errorMessage(error: unknown, status: number): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return (m as string[]).join(', ');
  }
  return statusMessage(status);
}

export function normalizeServiceResponse<T, E = unknown>(raw: {
  data: T | undefined;
  error: E | undefined;
  response?: Response;
}): ServiceResult<T, E> {
  if (!raw.response) {
    return {
      ok: false,
      status: 503,
      message: 'Network error — no response received',
      error: raw.error as E,
      response: undefined,
    };
  }

  const { status } = raw.response;
  const httpOk = status >= 200 && status < 300;

  if (httpOk && !raw.error) {
    return {
      ok: true,
      status,
      message: statusMessage(status),
      data: raw.data as T,
      response: raw.response,
    };
  }

  return {
    ok: false,
    status,
    message: errorMessage(raw.error, status),
    error: raw.error as E,
    response: raw.response,
  };
}
