import {
  buildErrorResponse,
  describeError,
  getRequestContext,
} from '../utils/errorResponses.js';
import {
  captureServerError,
  markServerErrorCaptured,
} from '../utils/sentry.js';

function sendErrorResponse(
  req,
  res,
  status,
  {
    message,
    code,
    details,
    metadata,
    path,
  } = {}
) {
  return res.status(status).json(buildErrorResponse({
    req,
    message,
    code,
    details,
    metadata,
    path,
  }));
}

export function handleApplicationError(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const requestContext = getRequestContext(req);
  const captureAndMark = (error, options = {}) => {
    const eventId = captureServerError(error, { req, ...options });
    if (eventId) {
      markServerErrorCaptured(res);
    }
    return eventId;
  };

  // Guard against double-send.
  if (res.headersSent) {
    console.error(`[ERROR] Headers already sent for ${requestContext}.`, describeError(err));
    captureAndMark(err, {
      handled: false,
      tags: {
        source: 'express',
        status_code: String(Number(err?.status || 500) || 500),
        response_state: 'headers_sent',
      },
      mechanismType: 'express.error_handler',
    });
    return next(err);
  }

  // CORS errors from the cors() middleware.
  if (err?.message?.startsWith?.('CORS blocked')) {
    console.warn(`[WARN] ${requestContext} -> 403: Origin not allowed.`);
    return sendErrorResponse(req, res, 403, {
      req,
      message: 'Origin not allowed.',
      code: 'cors_blocked',
    });
  }

  if (err?.name === 'ZodError') {
    const details = err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    console.warn(
      `[WARN] ${requestContext} -> 400: Validation failed with ${details.length} issue(s).`
    );

    return sendErrorResponse(req, res, 400, {
      message: 'Invalid request',
      code: 'invalid_request',
      details: !isProduction ? details : undefined,
    });
  }

  const customStatus = Number(err?.status || 0);
  if (Number.isFinite(customStatus) && customStatus >= 400 && customStatus < 600) {
    const message =
      customStatus >= 500 && isProduction && err?.expose !== true
        ? 'Server error'
        : typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : customStatus >= 500
            ? 'Server error'
            : 'Request could not be completed.';

    if (customStatus >= 500) {
      console.error(
        `[ERROR] ${requestContext} -> ${customStatus}: ${message}`,
        describeError(err)
      );
      captureAndMark(err, {
        handled: false,
        tags: {
          source: 'express',
          status_code: String(customStatus),
        },
        mechanismType: 'express.error_handler',
      });
    } else {
      console.warn(`[WARN] ${requestContext} -> ${customStatus}: ${message}`);
    }

    return sendErrorResponse(req, res, customStatus, {
      message,
      code: typeof err?.code === 'string' && err.code ? err.code : undefined,
      metadata:
        err?.metadata && typeof err.metadata === 'object' && !Array.isArray(err.metadata)
          ? err.metadata
          : undefined,
    });
  }

  const pgCode = typeof err?.code === 'string' ? err.code : '';
  const pgConstraint = typeof err?.constraint === 'string' ? err.constraint : '';

  if (pgCode === '23505') {
    console.warn(
      `[WARN] ${requestContext} -> 409: Database duplicate conflict (${pgConstraint || 'unknown_constraint'}).`
    );
    if (pgConstraint === 'rooms_building_floor_room_label_unique') {
      return sendErrorResponse(req, res, 409, {
        message: 'Room name/number already exists on this floor. Use a different label.',
        code: 'duplicate_conflict',
      });
    }

    if (pgConstraint === 'rent_payments_room_month_unique') {
      return sendErrorResponse(req, res, 409, {
        message: 'Rent record already exists for this room and month.',
        code: 'duplicate_conflict',
      });
    }

    return sendErrorResponse(req, res, 409, {
      message: 'Duplicate data conflict. Please change the input and try again.',
      code: 'duplicate_conflict',
    });
  }

  if (pgCode === '23503') {
    console.warn(`[WARN] ${requestContext} -> 400: Related record missing (23503).`);
    return sendErrorResponse(req, res, 400, {
      message: 'Related record not found or cannot be referenced.',
      code: 'related_record_missing',
    });
  }

  if (pgCode === '23514') {
    console.warn(`[WARN] ${requestContext} -> 400: Constraint violation (23514).`);
    return sendErrorResponse(req, res, 400, {
      message: 'Invalid value for one or more fields.',
      code: 'constraint_violation',
    });
  }

  if (pgCode === '22P02') {
    console.warn(`[WARN] ${requestContext} -> 400: Invalid input format (22P02).`);
    return sendErrorResponse(req, res, 400, {
      message: 'Invalid input format.',
      code: 'invalid_input_format',
    });
  }

  if (pgCode === '42P08') {
    console.warn(`[WARN] ${requestContext} -> 400: Invalid parameter type (42P08).`);
    return sendErrorResponse(req, res, 400, {
      message: 'Invalid parameter type in request handling.',
      code: 'invalid_parameter_type',
    });
  }

  if (pgCode === 'P0001') {
    console.warn(`[WARN] ${requestContext} -> 409: Operation blocked by database rule (P0001).`);
    return sendErrorResponse(req, res, 409, {
      message:
        !isProduction && typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Operation violates configured system limits.',
      code: 'operation_blocked',
    });
  }

  console.error(
    `[ERROR] Unhandled server error for ${requestContext}.`,
    describeError(err)
  );
  captureAndMark(err, {
    handled: false,
    tags: {
      source: 'express',
      status_code: '500',
    },
    mechanismType: 'express.error_handler',
  });
  return sendErrorResponse(req, res, 500, {
    message: 'Server error',
    code: 'server_error',
  });
}
