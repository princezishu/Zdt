import { runAnalyticsAggregationJob } from '../analytics/jobs.js';

const queueRuntime = {
  enabled: false,
  reason: 'Queue system not initialized',
  connection: null,
  queues: {},
  workers: {},
};

function formatQueueError(error) {
  const message = String(error?.message || error || 'Unknown queue error').trim();
  const code = String(error?.code || '').trim();
  if (code && !message.toUpperCase().includes(code.toUpperCase())) {
    return `${code} ${message}`;
  }
  return message;
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
    queueRuntime.enabled = false;
    queueRuntime.reason = 'REDIS_URL not configured';
    return { ...queueRuntime };
  }

  let Queue;
  let Worker;
  let IORedis;
  try {
    ({ Queue, Worker } = await import('bullmq'));
    ({ default: IORedis } = await import('ioredis'));
  } catch (error) {
    queueRuntime.enabled = false;
    queueRuntime.reason = 'bullmq/ioredis modules not installed';
    console.warn('[QUEUE] Redis queue disabled:', queueRuntime.reason);
    return { ...queueRuntime };
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
    queueRuntime.enabled = false;
    queueRuntime.reason = `Redis connection failed (${formatQueueError(error)})`;
    queueRuntime.connection = null;
    queueRuntime.queues = {};
    queueRuntime.workers = {};
    connection.disconnect();
    console.warn('[QUEUE] Redis queue disabled:', queueRuntime.reason);
    return { ...queueRuntime };
  }

  const queueNames = {
    email: 'email_dispatch',
    notifications: 'notification_dispatch',
    analytics: 'analytics_aggregation',
    imageProcessing: 'image_processing',
    aiTasks: 'ai_async_tasks',
  };

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

  console.log('[QUEUE] Redis + BullMQ initialized');
  return { ...queueRuntime };
}

export async function enqueueAnalyticsAggregation(dayDate = null) {
  if (!queueRuntime.enabled || !queueRuntime.queues.analytics) {
    return runAnalyticsAggregationJob(dayDate);
  }

  const job = await queueRuntime.queues.analytics.add(
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
