const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readBrowserHostname(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return '';
  }
  return window.location.hostname.trim();
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(String(hostname || '').trim().toLowerCase());
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function shouldUseSameOriginDevProxy(rawValue: string, parsedUrl: URL): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (!isAbsoluteHttpUrl(rawValue)) {
    return false;
  }
  return isLoopbackHost(parsedUrl.hostname);
}

function buildDefaultApiBaseUrl(): string {
  if (!import.meta.env.DEV) {
    // In production we prefer an explicit VITE_API_URL. When it is missing,
    // keep requests on the current origin instead of silently calling an
    // outdated hard-coded API deployment.
    return '';
  }

  const browserHostname = readBrowserHostname();
  const runtimeHost = !browserHostname || browserHostname === 'localhost' ? '127.0.0.1' : browserHostname;
  return `http://${runtimeHost}:5000`;
}

function normalizeApiBaseUrl(rawValue: string): string {
  const normalizedValue = trimTrailingSlash(String(rawValue || '').trim());
  if (!normalizedValue) {
    return '';
  }

  if (typeof window === 'undefined') {
    return normalizedValue;
  }

  try {
    const parsedUrl = new URL(normalizedValue, window.location.origin);
    if (shouldUseSameOriginDevProxy(normalizedValue, parsedUrl)) {
      return trimTrailingSlash(window.location.origin);
    }
    const browserHostname = readBrowserHostname();
    const normalizedApiHost = String(parsedUrl.hostname || '').trim().toLowerCase();
    const isDevAbsoluteUrl = import.meta.env.DEV && isAbsoluteHttpUrl(normalizedValue);

    if (isDevAbsoluteUrl && browserHostname) {
      if (!isLoopbackHost(browserHostname) && isLoopbackHost(normalizedApiHost)) {
        parsedUrl.hostname = browserHostname;
      } else if (
        isLoopbackHost(browserHostname) &&
        (normalizedApiHost === 'localhost' ||
          normalizedApiHost === '::1' ||
          normalizedApiHost === '0.0.0.0')
      ) {
        // Browsers may resolve localhost to IPv6 first, while our local backend often binds IPv4 only.
        parsedUrl.hostname = '127.0.0.1';
      }
    }

    return trimTrailingSlash(parsedUrl.toString());
  } catch {
    return normalizedValue;
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_URL || buildDefaultApiBaseUrl()
);
