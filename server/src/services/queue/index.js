import { runAnalyticsAggregationJob } from '../analytics/jobs.js';

const queueRuntime = {
  enabled: false,
  reason: 'Queue system not initialized',
  connection: null,
  queues: {},
  workers: {},
};

const MINIMUM_BULLMQ_REDIS_VERSION = '5.0.0';

function setQueueUnavailable(reason) {
  queueRuntime.enabled = false;
  queueRuntime.reason = String(reason || 'Queue system not initialized').trim();
  queueRuntime.connection = null;
  queueRuntime.queues = {};
  queueRuntime.workers = {};
  return { ...queueRuntime };
}

function formatQueueError(error) {
  const message = String(error?.message || error || 'Unknown queue error').trim();
  const code = String(error?.code || '').trim();
  if (code && !message.toUpperCase().includes(code.toUpperCase())) {
    return `${code} ${message}`;
  }
  return message;
}

function normalizeVersionParts(value) {
  const version = String(value || '').trim();
  if (!version) return null;
  const rawParts = version.split('.');
  const numericParts = rawParts.map((part) => Number.parseInt(part, 10));
  if (numericParts.some((part) => Number.isNaN(part) || part < 0)) {
    return null;
  }
  while (numericParts.length < 3) {
    numericParts.push(0);
  }
  return numericParts.slice(0, 3);
}

function isVersionGte(currentVersion, minimumVersion) {
  const current = normalizeVersionParts(currentVersion);
  const minimum = normalizeVersionParts(minimumVersion);
  if (!current || !minimum) return false;

  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

function parseRedisVersionFromInfo(infoText) {
  const text = String(infoText || '');
  const match = text.match(/^redis_version:([^\r\n]+)/m);
  return match ? String(match[1] || '').trim() : '';
}

async function fetchRedisVersion(connection) {
  const info = await connection.info('server');
  return parseRedisVersionFromInfo(info);
}

async function teardownQueueRuntime() {
  const workers = Object.values(queueRuntime.workers || {});
  const closeWorkerTasks = workers.map((worker) => worker?.close?.().catch?.(() => undefined));
  await Promise.all(closeWorkerTasks);

  if (queueRuntime.connection?.disconnect) {
    queueRuntime.connection.disconnect();
  }

  queueRuntime.connection = null;
  queueRuntime.queues = {};
  queueRuntime.workers = {};
}

async function pingRedisWithTimeout(connection, timeoutMs) {
  const ttlMs = Math.max(1000, Math.min(30000, Number(timeoutMs) || 5000));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis ping timed out after ${ttlMs}ms`));
    }, ttlMs);

    connection
      .ping()
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function initializeQueueSystem() {
  const redisUrl = (process.env.REDIS_URL || '').trim();
  if (!redisUrl) {
    return setQueueUnavailable('REDIS_URL not configured');
  }

  let Queue;
  let Worker;
  let IORedis;
  try {
    ({ Queue, Worker } = await import('bullmq'));
    ({ default: IORedis } = await import('ioredis'));
  } catch (error) {
    return setQueueUnavailable('bullmq/ioredis modules not installed');
  }

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const pingTimeoutMs = Number(process.env.REDIS_PING_TIMEOUT_MS || 5000);
  let lastRedisErrorLogAt = 0;

  connection.on('error', (error) => {
    if (process.env.NODE_ENV !== 'production') {
      const now = Date.now();
      if (now - lastRedisErrorLogAt < 10000) {
        return;
      }
      lastRedisErrorLogAt = now;
      console.error('[QUEUE] Redis connection error:', formatQueueError(error));
    }
  });

  try {
    await pingRedisWithTimeout(connection, pingTimeoutMs);
  } catch (error) {
    connection.disconnect();
    return setQueueUnavailable(`Redis connection failed (${formatQueueError(error)})`);
  }

  let redisVersion = '';
  try {
    redisVersion = await fetchRedisVersion(connection);
  } catch (error) {
    connection.disconnect();
    return setQueueUnavailable(`Redis INFO failed (${formatQueueError(error)})`);
  }

  if (!isVersionGte(redisVersion, MINIMUM_BULLMQ_REDIS_VERSION)) {
    connection.disconnect();
    return setQueueUnavailable(
      `Redis ${redisVersion || 'unknown'} is incompatible with BullMQ (requires >= ${MINIMUM_BULLMQ_REDIS_VERSION})`
    );
  }

  const queueNames = {
    email: 'email_dispatch',
    notifications: 'notification_dispatch',
    analytics: 'analytics_aggregation',
    imageProcessing: 'image_processing',
    aiTasks: 'ai_async_tasks',
  };

  try {
    const queues = {};
    for (const [key, name] of Object.entries(queueNames)) {
      queues[key] = new Queue(name, { connection });
    }

    const analyticsWorker = new Worker(
      queueNames.analytics,
      async (job) => runAnalyticsAggregationJob(job?.data?.dayDate || null),
      { connection }
    );

    analyticsWorker.on('failed', (job, error) => {
      console.error(`[QUEUE] Analytics job failed (id=${job?.id || 'n/a'}):`, error);
    });

    analyticsWorker.on('completed', (job) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[QUEUE] Analytics job completed (id=${job?.id || 'n/a'})`);
      }
    });

    queueRuntime.enabled = true;
    queueRuntime.reason = '';
    queueRuntime.connection = connection;
    queueRuntime.queues = queues;
    queueRuntime.workers = {
      analytics: analyticsWorker,
    };
  } catch (error) {
    connection.disconnect();
    return setQueueUnavailable(`BullMQ setup failed (${formatQueueError(error)})`);
  }
  return { ...queueRuntime };
}

export function markQueueSystemDisabled(reason) {
  return setQueueUnavailable(reason);
}

export async function enqueueAnalyticsAggregation(dayDate = null) {
  if (!queueRuntime.enabled || !queueRuntime.queues.analytics) {
    return runAnalyticsAggregationJob(dayDate);
  }

  let job;
  try {
    job = await queueRuntime.queues.analytics.add(
      'aggregate_daily_listing_analytics',
      { dayDate },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );
  } catch (error) {
    queueRuntime.enabled = false;
    queueRuntime.reason = `Queue enqueue failed (${formatQueueError(error)})`;
    await teardownQueueRuntime();
    console.warn('[QUEUE] Falling back to direct analytics execution:', queueRuntime.reason);
    return runAnalyticsAggregationJob(dayDate);
  }

  return { queued: true, jobId: job.id };
}

export async function enqueueEmailDispatch(payload) {
  if (!queueRuntime.enabled || !queueRuntime.queues.email) {
    return { queued: false, reason: queueRuntime.reason };
  }
  const job = await queueRuntime.queues.email.add('send_email', payload || {}, { removeOnComplete: 100 });
  return { queued: true, jobId: job.id };
}

export async function enqueueNotificationDispatch(payload) {
  if (!queueRuntime.enabled || !queueRuntime.queues.notifications) {
    return { queued: false, reason: queueRuntime.reason };
  }
  const job = await queueRuntime.queues.notifications.add('push_notification', payload || {}, {
    removeOnComplete: 100,
  });
  return { queued: true, jobId: job.id };
}

export async function enqueueAiTask(payload) {
  if (!queueRuntime.enabled || !queueRuntime.queues.aiTasks) {
    return { queued: false, reason: queueRuntime.reason };
  }
  const job = await queueRuntime.queues.aiTasks.add('ai_background_task', payload || {}, {
    attempts: 2,
    removeOnComplete: 100,
  });
  return { queued: true, jobId: job.id };
}

export function getQueueStatus() {
  return {
    enabled: queueRuntime.enabled,
    reason: queueRuntime.reason,
    queues: Object.keys(queueRuntime.queues || {}),
  };
}
