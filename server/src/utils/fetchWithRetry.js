import { fetch as undiciFetch } from 'undici';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableError(error) {
  const message = String(error?.message || '').toUpperCase();
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '').toUpperCase();

  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    message.includes('ECONNRESET') ||
    message.includes('TIMED OUT') ||
    message.includes('NETWORK') ||
    name === 'ABORTERROR'
  );
}

function createHttpError(status, statusText, url, responseText = '') {
  const detail = responseText ? ` | ${responseText.slice(0, 180)}` : '';
  const error = new Error(`HTTP ${status} ${statusText || ''} for ${url}${detail}`.trim());
  error.status = status;
  error.responseText = responseText;
  return error;
}

export async function fetchWithRetry(
  url,
  {
    method = 'GET',
    headers = {},
    body,
    retries = 4,
    timeoutMs = 25000,
    retryDelayMs = 1000,
    backoffFactor = 2,
    maxRetryDelayMs = 10000,
  } = {}
) {
  const maxAttempts = Math.max(1, Number(retries || 0) + 1);
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 25000));

    try {
      const response = await undiciFetch(url, {
        method,
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
        },
        body,
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const httpError = createHttpError(response.status, response.statusText, url, text);
        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          lastError = httpError;
          const delay = Math.min(
            maxRetryDelayMs,
            Math.round(retryDelayMs * Math.pow(backoffFactor, attempt - 1))
          );
          await sleep(delay);
          continue;
        }
        throw httpError;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        throw error;
      }
      const delay = Math.min(
        maxRetryDelayMs,
        Math.round(retryDelayMs * Math.pow(backoffFactor, attempt - 1))
      );
      await sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`Fetch failed for ${url}`);
}

export async function fetchTextWithRetry(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  return response.text();
}
