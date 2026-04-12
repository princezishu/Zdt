function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }
  return meta;
}

export function apiOk(data, meta) {
  return {
    data,
    ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
    error: null,
  };
}

export function apiCreated(data, meta) {
  return apiOk(data, meta);
}

export function apiError(message, meta) {
  return {
    data: null,
    ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
    error: message || 'Request could not be completed.',
  };
}
