import { API_BASE_URL } from './api';
import { readOrCreateDeviceId, readToken } from './session';

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
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  headers.set('X-Device-Id', readOrCreateDeviceId());

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  let data: unknown = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
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
    throw new Error(errorMessage);
  }

  return data as T;
}
