function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function getClientIp(req) {
  // Express computes req.ip based on "trust proxy". Prefer that over raw headers.
  return normalizeIpAddress(req.ip || req.socket?.remoteAddress);
}

/**
 * Minimal in-memory rate limiter (suitable for single-instance deployments).
 * For multi-instance deployments, switch to a shared store (Redis).
 */
export function createRateLimiter({
  windowMs = 10 * 60 * 1000,
  max = 30,
  message = 'Too many requests. Please try again later.',
  keyGenerator,
} = {}) {
  const store = new Map();

  const sweep = (now) => {
    if (store.size < 5000) return;
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.resetAt <= now) {
        store.delete(key);
      }
    }
  };

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    sweep(now);

    const key =
      typeof keyGenerator === 'function'
        ? String(keyGenerator(req) || '').slice(0, 240)
        : getClientIp(req);

    if (!key) {
      return next();
    }

    const existing = store.get(key);
    const entry =
      existing && typeof existing === 'object' && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + windowMs };

    entry.count += 1;
    store.set(key, entry);

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}
