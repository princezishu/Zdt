import { API_BASE_URL } from './api';
import { readOrCreateDeviceId, readToken } from './session';

const API_VERSION_PREFIX = (() => {
  const raw = String(import.meta.env.VITE_API_VERSION_PREFIX || '/api/v1').trim();
  if (!raw) {
    return '';
  }
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, '');
})();

function resolveApiPath(path: string): string {
  const normalized = String(path || '').trim();
  if (!normalized) {
    return '/';
  }

  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (!API_VERSION_PREFIX || withLeadingSlash === API_VERSION_PREFIX || withLeadingSlash.startsWith(`${API_VERSION_PREFIX}/`)) {
    return withLeadingSlash;
  }

  const routeMap: Array<[string, string]> = [
    ['/api', API_VERSION_PREFIX],
    ['/auth', `${API_VERSION_PREFIX}/auth`],
    ['/builder', `${API_VERSION_PREFIX}/builder`],
    ['/workflow', `${API_VERSION_PREFIX}/workflow`],
    ['/chat', `${API_VERSION_PREFIX}/chat`],
    ['/realty', `${API_VERSION_PREFIX}/realty`],
  ];

  for (const [legacyPrefix, versionedPrefix] of routeMap) {
    if (withLeadingSlash === legacyPrefix || withLeadingSlash.startsWith(`${legacyPrefix}/`)) {
      return `${versionedPrefix}${withLeadingSlash.slice(legacyPrefix.length)}`;
    }
  }

  return withLeadingSlash;
}

function shouldAttachBearerToken(value: string): boolean {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }
  if (normalized === 'cookie-session' || normalized === 'session') {
    return false;
  }
  return normalized.split('.').length >= 3;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '0.0.0.0'
  );
}

function capitalizeFirstLetter(value: string): string {
  if (!value) {
    return value;
  }
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      String((error as { name?: unknown }).name) === 'AbortError'
  );
}

function buildNetworkErrorMessage(requestUrl: string): string {
  const baseMessage = `Unable to reach the API at ${requestUrl}.`;

  if (typeof window === 'undefined') {
    return `${baseMessage} Check that the backend server is running and reachable.`;
  }

  const hints: string[] = [];

  try {
    const apiUrl = new URL(requestUrl, window.location.origin);
    const pageOrigin = window.location.origin;
    const pageHost = window.location.hostname;

    if (window.location.protocol === 'https:' && apiUrl.protocol === 'http:') {
      hints.push('the site is loaded over HTTPS, but the API URL uses HTTP');
    }

    if (pageHost && !isLoopbackHost(pageHost) && isLoopbackHost(apiUrl.hostname)) {
      hints.push('the app is open on another device, but the API URL still points to localhost');
    }

    if (apiUrl.origin !== pageOrigin) {
      hints.push(`this request is cross-origin; if the backend is reachable, it must allow CORS for ${pageOrigin}`);
    }
  } catch {
    hints.push('the configured API URL is invalid');
  }

  if (!hints.some((hint) => hint.includes('backend') || hint.includes('VITE_API_URL'))) {
    hints.push('the backend may be stopped, still starting, or listening on a different host and port');
  }

  const uniqueHints = Array.from(new Set(hints));
  const message = uniqueHints.map((hint) => capitalizeFirstLetter(hint)).join('; ');
  return `${baseMessage} Possible causes: ${message}.`;
}

export class ApiError extends Error {
  status: number;
  code: string;
  provider: string | null;
  payload: unknown;

  constructor(
    message: string,
    {
      status,
      code,
      provider,
      payload,
    }: {
      status: number;
      code?: string;
      provider?: string | null;
      payload?: unknown;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = Number(status) || 0;
    this.code = typeof code === 'string' ? code : '';
    this.provider = typeof provider === 'string' ? provider : null;
    this.payload = payload;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const authToken = token || readToken();
  if (shouldAttachBearerToken(authToken)) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  headers.set('X-Device-Id', readOrCreateDeviceId());

  const requestUrl = `${API_BASE_URL}${resolveApiPath(path)}`;
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError(buildNetworkErrorMessage(requestUrl), {
      status: 0,
      code: 'network_error',
      payload: {
        cause: error instanceof Error ? error.message : String(error),
        url: requestUrl,
      },
    });
  }

  let data: unknown = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const responseCode =
      data && typeof data === 'object' && 'code' in data && typeof data.code === 'string'
        ? data.code
        : '';
    const responseProvider =
      data && typeof data === 'object' && 'provider' in data && typeof data.provider === 'string'
        ? data.provider
        : null;
    const detailMessage =
      data &&
      typeof data === 'object' &&
      Array.isArray((data as { details?: unknown }).details) &&
      (data as { details: Array<{ path?: string; message?: string }> }).details.length > 0
        ? (() => {
            const first = (data as { details: Array<{ path?: string; message?: string }> }).details[0];
            const message = typeof first?.message === 'string' ? first.message : '';
            const path = typeof first?.path === 'string' ? first.path : '';
            if (path && message) {
              return `${path}: ${message}`;
            }
            return message || '';
          })()
        : '';

    const errorMessage =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? detailMessage
          ? `${data.error} - ${detailMessage}`
          : data.error
        : `Request failed (${response.status})`;
    throw new ApiError(errorMessage, {
      status: response.status,
      code: responseCode,
      provider: responseProvider,
      payload: data,
    });
  }

  return data as T;
}
