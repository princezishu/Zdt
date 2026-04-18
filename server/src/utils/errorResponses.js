function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeMessage(message) {
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  return 'Request could not be completed.';
}

export function getRequestId(req) {
  const requestId =
    typeof req?.requestId === 'string'
      ? req.requestId.trim()
      : '';

  return requestId ? requestId.slice(0, 120) : '';
}

export function getRequestContext(req) {
  const method = typeof req?.method === 'string' && req.method ? req.method.toUpperCase() : 'UNKNOWN';
  const requestUrl =
    typeof req?.originalUrl === 'string' && req.originalUrl
      ? req.originalUrl
      : typeof req?.url === 'string' && req.url
        ? req.url
        : '/';
  const requestId = getRequestId(req);
  const normalizedUrl = requestUrl.slice(0, 240);

  return requestId ? `${method} ${normalizedUrl} [${requestId}]` : `${method} ${normalizedUrl}`;
}

export function buildErrorResponse({
  req,
  message,
  code,
  details,
  metadata,
  path,
} = {}) {
  const payload = {
    error: normalizeMessage(message),
  };

  if (typeof code === 'string' && code.trim()) {
    payload.code = code.trim();
  }

  if (Array.isArray(details) && details.length > 0) {
    payload.details = details;
  }

  if (isPlainObject(metadata)) {
    payload.metadata = metadata;
  }

  if (typeof path === 'string' && path.trim()) {
    payload.path = path.trim();
  }

  const requestId = getRequestId(req);
  if (requestId) {
    payload.requestId = requestId;
  }

  return payload;
}

export function normalizeErrorResponse({
  req,
  payload,
  status = 500,
} = {}) {
  if (!isPlainObject(payload)) {
    return buildErrorResponse({
      req,
      message: status >= 500 ? 'Server error' : 'Request could not be completed.',
    });
  }

  const requestId = getRequestId(req);
  const hasNormalizedMessage =
    typeof payload.error === 'string' &&
    payload.error.trim() &&
    !(
      typeof payload.message === 'string' &&
      payload.message.trim() &&
      payload.message.trim() !== payload.error.trim()
    );
  const hasNormalizedRequestId = !requestId || payload.requestId === requestId;

  if (hasNormalizedMessage && hasNormalizedRequestId) {
    return payload;
  }

  const normalizedPayload = {
    ...payload,
    error: normalizeMessage(payload.error || payload.message),
  };

  delete normalizedPayload.message;

  if (requestId && !normalizedPayload.requestId) {
    normalizedPayload.requestId = requestId;
  }

  return normalizedPayload;
}

export function describeError(error) {
  if (error instanceof Error) {
    const payload = {
      name: error.name || 'Error',
      message: normalizeMessage(error.message || 'Unknown error'),
    };

    if (typeof error.stack === 'string' && error.stack.trim()) {
      payload.stack = error.stack;
    }

    if (typeof error.code === 'string' && error.code.trim()) {
      payload.code = error.code.trim();
    }

    const status = Number(error.status || 0);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      payload.status = status;
    }

    if (typeof error.routeHandlerLabel === 'string' && error.routeHandlerLabel.trim()) {
      payload.route = error.routeHandlerLabel.trim();
    }

    if (isPlainObject(error.metadata)) {
      payload.metadata = error.metadata;
    }

    return payload;
  }

  if (isPlainObject(error)) {
    return error;
  }

  return {
    message: normalizeMessage(error),
  };
}
