import { buildErrorResponse } from '../utils/errorResponses.js';

export function handleApiNotFound(req, res) {
  return res.status(404).json(buildErrorResponse({
    req,
    message: 'Endpoint not found',
    code: 'endpoint_not_found',
    path: req.originalUrl || req.url || '/',
  }));
}
