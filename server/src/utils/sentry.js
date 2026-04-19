import * as Sentry from '@sentry/node';
import {
  describeError,
  getRequestId,
} from './errorResponses.js';

const SENTRY_DSN = String(process.env.SENTRY_DSN || '').trim();
const SENTRY_ENVIRONMENT = String(
  process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
).trim();
const SENTRY_RELEASE = String(process.env.SENTRY_RELEASE || '').trim();
const RESPONSE_CAPTURED_FLAG = '__sentryCaptured';

let sentryInitialized = false;
let sentryStatusLogged = false;

function logSentryStatus(message) {
  if (sentryStatusLogged) {
    return;
  }

  sentryStatusLogged = true;
  console.log(message);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeThrowable(error) {
  if (error instanceof Error) {
    return error;
  }

  const description = describeError(error);
  const message =
    typeof description?.message === 'string' && description.message.trim()
      ? description.message.trim()
      : 'Unknown backend error';
  const normalizedError = new Error(message);
  normalizedError.name = 'NonErrorException';
  normalizedError.originalError = description;
  return normalizedError;
}

function getRequestUrl(req) {
  if (!req) {
    return '';
  }

  const originalUrl =
    typeof req.originalUrl === 'string' && req.originalUrl
      ? req.originalUrl
      : typeof req.url === 'string' && req.url
        ? req.url
        : '';
  const protocol =
    typeof req.protocol === 'string' && req.protocol
      ? req.protocol
      : typeof req.headers?.['x-forwarded-proto'] === 'string' && req.headers['x-forwarded-proto']
        ? req.headers['x-forwarded-proto'].split(',')[0].trim()
        : '';
  const host =
    typeof req.get === 'function'
      ? req.get('host')
      : typeof req.headers?.host === 'string'
        ? req.headers.host
        : '';

  if (protocol && host && originalUrl) {
    return `${protocol}://${host}${originalUrl}`;
  }

  return originalUrl;
}

function addRequestContext(scope, req) {
  if (!req) {
    return;
  }

  const requestId = getRequestId(req);
  const requestContext = {
    id: requestId || undefined,
    method: typeof req.method === 'string' ? req.method.toUpperCase() : undefined,
    url: getRequestUrl(req) || undefined,
    ip: typeof req.ip === 'string' && req.ip ? req.ip : undefined,
    userAgent:
      typeof req.headers?.['user-agent'] === 'string' && req.headers['user-agent']
        ? req.headers['user-agent']
        : undefined,
  };

  if (requestId) {
    scope.setTag('request_id', requestId);
  }

  scope.setContext('request', requestContext);

  if (!isPlainObject(req.user)) {
    return;
  }

  const user = {};
  if (req.user.id !== undefined && req.user.id !== null) {
    user.id = String(req.user.id);
  }
  if (typeof req.user.email === 'string' && req.user.email.trim()) {
    user.email = req.user.email.trim();
  }
  if (typeof req.user.role === 'string' && req.user.role.trim()) {
    user.role = req.user.role.trim();
  }
  if (typeof req.authStrategy === 'string' && req.authStrategy.trim()) {
    user.authStrategy = req.authStrategy.trim();
  }

  if (Object.keys(user).length > 0) {
    scope.setUser(user);
  }
}

export function isSentryEnabled() {
  return Boolean(SENTRY_DSN);
}

export function initializeSentry() {
  if (sentryInitialized) {
    return isSentryEnabled();
  }

  sentryInitialized = true;

  if (!isSentryEnabled()) {
    logSentryStatus('[SENTRY] Disabled. Set SENTRY_DSN to enable backend error tracking.');
    return false;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE || undefined,
    integrations: (integrations) =>
      integrations.filter(
        (integration) =>
          integration?.name !== 'OnUncaughtException' &&
          integration?.name !== 'OnUnhandledRejection'
      ),
  });

  logSentryStatus(`[SENTRY] Enabled for backend environment "${SENTRY_ENVIRONMENT}".`);
  return true;
}

export function captureServerError(
  error,
  {
    req,
    handled = false,
    level = 'error',
    tags,
    extra,
    mechanismType = 'generic',
  } = {}
) {
  if (!sentryInitialized) {
    initializeSentry();
  }

  if (!isSentryEnabled()) {
    return null;
  }

  const normalizedError = normalizeThrowable(error);

  try {
    return Sentry.withScope((scope) => {
      scope.setLevel(level);
      scope.setTag('runtime', 'backend');

      if (isPlainObject(tags)) {
        scope.setTags(tags);
      }

      if (isPlainObject(extra)) {
        scope.setExtras(extra);
      }

      addRequestContext(scope, req);

      if (normalizedError !== error) {
        scope.setExtra('originalError', describeError(error));
      }

      return Sentry.captureException(normalizedError, {
        mechanism: {
          handled,
          type: mechanismType,
        },
      });
    });
  } catch (captureError) {
    console.error('[SENTRY] Failed to capture backend error.', captureError);
    return null;
  }
}

export function hasCapturedServerError(res) {
  return Boolean(res?.locals?.[RESPONSE_CAPTURED_FLAG]);
}

export function markServerErrorCaptured(res) {
  if (!res) {
    return;
  }

  if (!res.locals || typeof res.locals !== 'object') {
    res.locals = {};
  }

  res.locals[RESPONSE_CAPTURED_FLAG] = true;
}

export async function flushSentry(timeoutMs = 2000) {
  if (!sentryInitialized) {
    initializeSentry();
  }

  if (!isSentryEnabled()) {
    return true;
  }

  try {
    return await Sentry.flush(timeoutMs);
  } catch (error) {
    console.error('[SENTRY] Failed to flush backend events.', error);
    return false;
  }
}
