import {
  describeError,
  getRequestContext,
  normalizeErrorResponse,
} from '../utils/errorResponses.js';

export function normalizeApiErrorResponses(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function normalizedJson(body) {
    const statusCode = Number(this.statusCode || 200);
    if (statusCode < 400) {
      return originalJson(body);
    }

    const normalizedBody = normalizeErrorResponse({
      req,
      payload: body,
      status: statusCode,
    });

    if (statusCode >= 500 && normalizedBody !== body) {
      console.error(
        `[ERROR] ${getRequestContext(req)} -> ${statusCode}: Error response sent from route handler.`,
        describeError(normalizedBody)
      );
    }

    return originalJson(normalizedBody);
  };

  return next();
}
