import {
  buildErrorResponse,
  getRequestContext,
} from '../utils/errorResponses.js';

export function handleBodyParserError(err, req, res, next) {
  if (err?.type === 'entity.parse.failed') {
    console.warn(`[WARN] ${getRequestContext(req)} -> 400: Invalid JSON in request body.`);
    return res.status(400).json(buildErrorResponse({
      req,
      message: 'Invalid JSON in request body.',
      code: 'invalid_json',
    }));
  }
  if (err?.type === 'entity.too.large') {
    console.warn(`[WARN] ${getRequestContext(req)} -> 413: Request body exceeded the size limit.`);
    return res.status(413).json(buildErrorResponse({
      req,
      message: 'Request body is too large. Maximum is 5 MB.',
      code: 'payload_too_large',
    }));
  }
  return next(err);
}
