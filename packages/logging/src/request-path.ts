interface RequestRoute {
  path?: string | string[] | undefined;
}

export interface RequestPathSource {
  url?: string | undefined;
  originalUrl?: string | undefined;
  baseUrl?: string | undefined;
  route?: RequestRoute | undefined;
}

const UUID_PATH_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_PATH_SEGMENT_PATTERN = /^\d+$/;
const LONG_HEX_PATH_SEGMENT_PATTERN = /^[0-9a-f]{16,}$/i;
const LONG_TOKEN_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{24,}$/;
const LONG_FILE_NAME_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9]{1,8}$/;
const SANITIZED_PATH_SEGMENT_PLACEHOLDER = '{id}';

function stripQueryString(path: string): string {
  const [pathWithoutQuery = '/'] = path.split('?');

  return pathWithoutQuery.length > 0 ? pathWithoutQuery : '/';
}

function ensureLeadingSlash(path: string): string {
  if (path.length === 0) {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function isDynamicPathSegment(segment: string): boolean {
  if (segment.length === 0 || segment.startsWith(':')) {
    return false;
  }

  if (/^\{[^/]+\}$/.test(segment)) {
    return false;
  }

  return (
    NUMERIC_PATH_SEGMENT_PATTERN.test(segment) ||
    UUID_PATH_SEGMENT_PATTERN.test(segment) ||
    LONG_HEX_PATH_SEGMENT_PATTERN.test(segment) ||
    LONG_TOKEN_PATH_SEGMENT_PATTERN.test(segment) ||
    LONG_FILE_NAME_PATH_SEGMENT_PATTERN.test(segment)
  );
}

function sanitizeRawRequestPath(path: string): string {
  const pathWithLeadingSlash = ensureLeadingSlash(path);
  const sanitizedPath = pathWithLeadingSlash
    .split('/')
    .map((segment, index) => {
      if (index === 0) {
        return segment;
      }

      return isDynamicPathSegment(segment) ? SANITIZED_PATH_SEGMENT_PLACEHOLDER : segment;
    })
    .join('/');

  return sanitizedPath.length > 0 ? sanitizedPath : '/';
}

function resolveRouteTemplatePath(request: RequestPathSource): string | null {
  const routePath = Array.isArray(request.route?.path)
    ? request.route.path.find((value): value is string => typeof value === 'string')
    : request.route?.path;
  const normalizedRoutePath = typeof routePath === 'string' ? routePath : null;

  if (!normalizedRoutePath || normalizedRoutePath.length === 0) {
    return null;
  }

  // Wildcard fallback routes (for example `/{*path}`) are too broad to be canonical.
  if (normalizedRoutePath.includes('*')) {
    return null;
  }

  const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
  const routeTemplatePath = ensureLeadingSlash(
    stripQueryString(`${baseUrl}${normalizedRoutePath}`),
  );

  return routeTemplatePath.length > 0 ? routeTemplatePath : '/';
}

export function resolveRequestPath(request: RequestPathSource): string {
  const routeTemplatePath = resolveRouteTemplatePath(request);

  if (routeTemplatePath) {
    return routeTemplatePath;
  }

  const rawPath = request.originalUrl ?? request.url ?? '/';

  return sanitizeRawRequestPath(stripQueryString(rawPath));
}
