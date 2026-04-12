import crypto from 'crypto';

const REDIS_RETRY_COOLDOWN_MS = 60_000;
const REDIS_LOG_COOLDOWN_MS = 15_000;

const redisRuntime = {
  connection: null,
  connectPromise: null,
  nextRetryAt: 0,
  lastErrorLogAt: 0,
};

function normalizeIpAddress(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).split(',')[0].trim().slice(0, 64);
}

function getClientIp(req) {
  // Express computes req.ip based on "trust proxy". Prefer that over raw headers.
  return normalizeIpAddress(req.ip || req.socket?.remoteAddress);
}

function hashRateLimitKey(scope, rawKey) {
  return crypto
    .createHash('sha256')
    .update(`${scope}:${rawKey}`)
    .digest('hex');
}

function logRedisFallback(message, error) {
  const now = Date.now();
  if (now - redisRuntime.lastErrorLogAt < REDIS_LOG_COOLDOWN_MS) {
    return;
  }
  redisRuntime.lastErrorLogAt = now;
  console.warn(
    `[RATE_LIMIT] ${message}${error ? `: ${String(error?.message || error).trim()}` : ''}`
  );
}

function withTimeout(task, timeoutMs) {
  const normalizedTimeoutMs = Math.max(1000, Math.min(15000, Number(timeoutMs) || 3000));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out after ${normalizedTimeoutMs}ms`));
    }, normalizedTimeoutMs);

    Promise.resolve(task)
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

async function initializeRedisConnection() {
  const redisUrl = String(process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || '').trim();
  if (!redisUrl) {
    return null;
  }

  const { default: IORedis } = await import('ioredis');
  const connection = new IORedis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  connection.on('error', (error) => {
    logRedisFallback('Redis rate-limit store error, falling back to in-memory limiter', error);
  });

  connection.on('end', () => {
    redisRuntime.connection = null;
    redisRuntime.nextRetryAt = Date.now() + REDIS_RETRY_COOLDOWN_MS;
  });

  await withTimeout(connection.connect(), Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS || 3000));
  await withTimeout(connection.ping(), Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS || 3000));
  return connection;
}

async function getRedisConnection() {
  if (redisRuntime.connection) {
    return redisRuntime.connection;
  }

  if (redisRuntime.connectPromise) {
    return redisRuntime.connectPromise;
  }

  if (redisRuntime.nextRetryAt > Date.now()) {
    return null;
  }

  redisRuntime.connectPromise = initializeRedisConnection()
    .then((connection) => {
      redisRuntime.connection = connection;
      if (!connection) {
        redisRuntime.nextRetryAt = Number.MAX_SAFE_INTEGER;
      }
      return connection;
    })
    .catch((error) => {
      redisRuntime.connection = null;
      redisRuntime.nextRetryAt = Date.now() + REDIS_RETRY_COOLDOWN_MS;
      logRedisFallback('Redis rate-limit store unavailable, using in-memory limiter', error);
      return null;
    })
    .finally(() => {
      redisRuntime.connectPromise = null;
    });

  return redisRuntime.connectPromise;
}

function incrementMemoryWindow(store, storageKey, now, windowMs) {
  const existing = store.get(storageKey);
  const entry =
    existing && typeof existing === 'object' && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

  entry.count += 1;
  store.set(storageKey, entry);
  return {
    count: entry.count,
    resetAt: entry.resetAt,
  };
}

async function incrementRedisWindow(connection, storageKey, windowMs) {
  const count = Number(await connection.incr(storageKey));
  let ttlMs = Number(await connection.pttl(storageKey));

  if (count === 1 || ttlMs <= 0) {
    await connection.pexpire(storageKey, windowMs);
    ttlMs = windowMs;
  }

  return {
    count,
    resetAt: Date.now() + ttlMs,
  };
}

function setRateLimitHeaders(res, max, remaining, resetAt) {
  const resetSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
  res.setHeader('RateLimit-Limit', String(max));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
}

/**
 * In-memory fallback limiter with optional Redis backing for multi-instance deployments.
 */
export function createRateLimiter({
  windowMs = 10 * 60 * 1000,
  max = 30,
  message = 'Too many requests. Please try again later.',
  keyGenerator,
  scope = 'default',
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

  return async function rateLimiter(req, res, next) {
    const now = Date.now();
    sweep(now);

    const rawKey =
      typeof keyGenerator === 'function'
        ? String(keyGenerator(req) || '').slice(0, 512)
        : getClientIp(req);

    if (!rawKey) {
      return next();
    }

    const storageKey = `rate-limit:${hashRateLimitKey(scope, rawKey)}`;
    let result = null;
    const redisConnection = await getRedisConnection();

    if (redisConnection) {
      try {
        result = await incrementRedisWindow(redisConnection, storageKey, windowMs);
      } catch (error) {
        logRedisFallback('Redis rate-limit increment failed, using in-memory limiter', error);
      }
    }

    if (!result) {
      result = incrementMemoryWindow(store, storageKey, now, windowMs);
    }

    const remaining = Math.max(0, max - result.count);
    setRateLimitHeaders(res, max, remaining, result.resetAt);

    if (result.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}
