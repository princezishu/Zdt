import {
  describeError,
  getRequestContext,
  normalizeErrorResponse,
} from '../utils/errorResponses.js';
import {
  captureServerError,
  hasCapturedServerError,
  markServerErrorCaptured,
} from '../utils/sentry.js';

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

    if (statusCode === 500 && !hasCapturedServerError(res)) {
      const eventId = captureServerError(
        new Error('Server error response sent directly from a route handler.'),
        {
          req,
          handled: true,
          tags: {
            source: 'route_response',
            status_code: '500',
          },
          extra: {
            response: normalizedBody,
          },
          mechanismType: 'express.route_response',
        }
      );

      if (eventId) {
        markServerErrorCaptured(res);
      }
    }

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
