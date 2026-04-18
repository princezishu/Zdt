import 'dotenv/config';

// ── Process-level crash guards (must be first) ──
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception — the process will exit:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import crypto from 'crypto';
import { createServer } from 'http';
import net from 'net';
import { createRateLimiter } from './middleware/rateLimit.js';
import { disableApiCaching } from './middleware/apiNoStore.js';
import { handleApiNotFound } from './middleware/apiNotFound.js';
import { handleBodyParserError } from './middleware/bodyParserError.js';
import { normalizeApiErrorResponses } from './middleware/errorResponseEnvelope.js';
import { handleApplicationError } from './middleware/errorHandler.js';
import { registerRoutes } from './routes/index.js';
import { initializeChatRealtime } from './services/chatRealtime.js';
import { startPropertyAnalyticsScheduler } from './services/analytics/jobs.js';
import { ensureInsightsSourceSeeds, startInsightsScheduler } from './services/insights/jobs.js';
import { runEAuctionSyncJob } from './services/eauction/sync.js';
import { runTenderIntelligenceSyncJob } from './services/tenderIntelligence/sync.js';
import {
  enqueueAnalyticsAggregation,
  initializeQueueSystem,
  markQueueSystemDisabled,
} from './services/queue/index.js';
import cron from 'node-cron';
import { runInfraIngestJob } from './jobs/infraIngest.js';
import { runApartmentRentAutoReminderJob } from './controllers/apartmentComplexController.js';
import {
  ensureApartmentComplexTables,
  ensureAuthTables,
  ensureBuildingMaterialsTables,
  ensureBuilderCompanyTables,
  ensureEAuctionTables,
  ensureInsightsTables,
  ensureTenderIntelligenceSourceSeeds,
  ensureTenderIntelligenceTables,
  ensureLayoutUnitTables,
  ensureInfrastructureTables,
  ensureGroupDealsTables,
  ensureOwnerTables,
  ensureSitePromotionsTables,
  ensureSupportProgramTables,
  ensureCollaborationTables,
  ensureDalalCoinTables,
  ensureVerificationTables,
  pool,
  reactivateExpiredTemporaryDeactivations,
} from './db.js';
import {
  readBooleanEnv,
  readIntegerEnv,
  readListEnv,
  readStringEnv,
} from './utils/env.js';
import { buildErrorResponse } from './utils/errorResponses.js';
import { isManagedAuthEnabled, getManagedAuthProvider } from './services/managedAuth.js';

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);
const trustProxyRaw = readStringEnv('TRUST_PROXY', '1');
if (trustProxyRaw) {
  const lowerValue = trustProxyRaw.toLowerCase();
  if (/^\d+$/.test(trustProxyRaw)) {
    app.set('trust proxy', Number(trustProxyRaw));
  } else if (lowerValue === 'true' || lowerValue === 'false') {
    app.set('trust proxy', lowerValue === 'true');
  } else {
    app.set('trust proxy', trustProxyRaw);
  }
}

const DEFAULT_PORT = 5000;
const PORT = readIntegerEnv('PORT', DEFAULT_PORT, { min: 1, max: 65535 });
const HOST = readStringEnv('HOST', '0.0.0.0');
const CORS_ALLOW_ALL = readBooleanEnv('CORS_ALLOW_ALL', true);
const API_V1_PREFIX = '/api/v1';
const FORCE_HTTPS = readBooleanEnv('FORCE_HTTPS', false);
const PORT_SOURCE = String(process.env.PORT || '').trim() ? 'process.env.PORT' : `default:${DEFAULT_PORT}`;

function isAddressInUseError(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'EADDRINUSE');
}

function resolveServerListenConfig(host) {
  const normalizedHost = String(host || '').trim().toLowerCase();
  const shouldUseDualStack =
    normalizedHost === '' ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost === '::' ||
    normalizedHost === 'localhost';

  if (shouldUseDualStack) {
    return {
      host: '::',
      displayHost: '::',
      ipv6Only: false,
    };
  }

  return {
    host: String(host || '').trim() || '::',
    displayHost: String(host || '').trim() || '::',
    ipv6Only: undefined,
  };
}

function resolveQueueStartupPolicy() {
  const rawValue = String(process.env.ENABLE_REDIS_QUEUE || '').trim().toLowerCase();
  if (rawValue === 'true') {
    return { shouldInitialize: true, reason: '' };
  }
  if (rawValue === 'false') {
    return {
      shouldInitialize: false,
      reason: 'Disabled via ENABLE_REDIS_QUEUE=false; analytics will run inline.',
    };
  }
  if (process.env.NODE_ENV === 'production') {
    return { shouldInitialize: true, reason: '' };
  }
  return {
    shouldInitialize: false,
    reason: 'Inline mode active in local development. Set ENABLE_REDIS_QUEUE=true with Redis >= 5.0.0 to enable BullMQ.',
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPortBusy(host, port) {
  const listenConfig = resolveServerListenConfig(host);
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.unref();

    tester.once('error', (error) => {
      if (isAddressInUseError(error)) {
        resolve(true);
        return;
      }
      reject(error);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(false));
    });

    const listenOptions = {
      host: listenConfig.host,
      port: Number(port),
      exclusive: true,
    };
    if (listenConfig.ipv6Only !== undefined) {
      listenOptions.ipv6Only = listenConfig.ipv6Only;
    }

    tester.listen(listenOptions);
  });
}

async function waitForPortAvailability(host, port) {
  const listenConfig = resolveServerListenConfig(host);
  const isProduction = process.env.NODE_ENV === 'production';
  const retryDelayMs = 1500;
  let attempts = 0;

  while (true) {
    attempts += 1;
    const portBusy = await isPortBusy(listenConfig.host, Number(port));
    if (!portBusy) {
      if (attempts > 1) {
        console.log(
          `[SERVER] Port ${port} became available on ${listenConfig.displayHost}. Continuing startup.`
        );
      }
      return listenConfig;
    }

    if (isProduction) {
      throw new Error(
        `Port ${port} is already in use on ${listenConfig.displayHost}. Another backend instance is already running.`
      );
    }

    if (attempts === 1 || attempts % 5 === 0) {
      console.warn(
        `[SERVER] Port ${port} is busy on ${listenConfig.displayHost}. Waiting ${retryDelayMs}ms before retrying...`
      );
    }
    await sleep(retryDelayMs);
  }
}

function isPrivateNetworkHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  if (/^10\./.test(hostname)) {
    return true;
  }
  if (/^192\.168\./.test(hostname)) {
    return true;
  }
  const match = /^172\.(\d{1,3})\./.exec(hostname);
  if (!match) {
    return false;
  }
  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isDevPrivateNetworkOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return isPrivateNetworkHost(parsed.hostname);
  } catch {
    return false;
  }
}

const allowedOrigins = Array.from(
  new Set([
    ...readListEnv(['FRONTEND_URL', 'CORS_ALLOWED_ORIGINS', 'CORS_ORIGIN']),
  ])
);

function isRequestOriginAllowed(origin) {
  if (!origin || CORS_ALLOW_ALL) {
    return true;
  }

  const isDevLanOrigin =
    process.env.NODE_ENV !== 'production' && origin && isDevPrivateNetworkOrigin(origin);
  return Boolean(allowedOrigins.includes(origin) || isDevLanOrigin);
}

function resolveRequestId(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 120);
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim().slice(0, 120);
  }
  return crypto.randomUUID();
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use((req, res, next) => {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.use((req, res, next) => {
  if (!FORCE_HTTPS) {
    return next();
  }

  const forwardedProto =
    typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto'].split(',')[0].trim().toLowerCase()
      : '';
  const isSecureRequest = req.secure || forwardedProto === 'https';
  if (isSecureRequest) {
    return next();
  }

  const host = req.get('host');
  const target = host ? `https://${host}${req.originalUrl || req.url || '/'}` : '';
  if ((req.method === 'GET' || req.method === 'HEAD') && target) {
    return res.redirect(301, target);
  }

  return res.status(400).json(buildErrorResponse({
    req,
    message: 'HTTPS required',
    code: 'https_required',
  }));
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (isRequestOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

const requestLogFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(requestLogFormat, {
    skip: (req) => req.path === '/health',
  })
);
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use(normalizeApiErrorResponses);

function shouldCaptureRawJsonBody(url = '') {
  const normalizedUrl = String(url || '').toLowerCase();
  return (
    normalizedUrl.startsWith('/api/owner/checkout/webhook/razorpay')
    || normalizedUrl.startsWith('/api/v1/owner/checkout/webhook/razorpay')
  );
}

// 5 MB default limit; large uploads already use multipart/form-data.
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buf) => {
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return;
    }

    if (shouldCaptureRawJsonBody(req.originalUrl || req.url || '')) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));

// Catch JSON parse errors from express.json() and return user-friendly response.
app.use(handleBodyParserError);

const authLoginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again after 15 minutes.',
  scope: 'auth_login',
});

// Catch-all rate limiter for API routes that lack their own rate limiters.
const globalApiRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Please slow down.',
  scope: 'global_api',
});

// Prevent proxy/browser caching of JSON API responses
app.use(disableApiCaching);

registerRoutes(app, {
  apiV1Prefix: API_V1_PREFIX,
  authLoginRateLimiter,
  globalApiRateLimiter,
});

// Catch-all 404 for unmatched API routes.
app.use('/api', handleApiNotFound);
app.use(API_V1_PREFIX, handleApiNotFound);

app.use(handleApplicationError);

async function startServer() {
  try {
    const listenConfig = await waitForPortAvailability(HOST, Number(PORT));

    await ensureAuthTables();
    await ensureBuilderCompanyTables();
    await ensureVerificationTables();
    await ensureLayoutUnitTables();
    await ensureEAuctionTables();
    await ensureApartmentComplexTables();
    await ensureBuildingMaterialsTables();
    await ensureSitePromotionsTables();
    await ensureSupportProgramTables();
    await ensureOwnerTables();
    await ensureDalalCoinTables();
    await ensureInsightsTables();
    await ensureInfrastructureTables();
    await ensureTenderIntelligenceTables();
    await ensureTenderIntelligenceSourceSeeds();
    await ensureGroupDealsTables();
    await ensureCollaborationTables();
    await ensureInsightsSourceSeeds();
    const insightsSchedulerEnabled =
      String(process.env.ENABLE_INSIGHTS_SCHEDULER || 'false').trim().toLowerCase() === 'true';
    if (insightsSchedulerEnabled) {
      startInsightsScheduler();
    } else {
      console.log('[Insights] Scheduler disabled. Set ENABLE_INSIGHTS_SCHEDULER=true to activate.');
    }
    const apartmentAutoAlertEnabled =
      String(process.env.APARTMENT_RENT_AUTO_ALERT_ENABLED || 'true').trim().toLowerCase() !==
      'false';
    if (apartmentAutoAlertEnabled) {
      const apartmentAutoAlertCron =
        String(process.env.APARTMENT_RENT_AUTO_ALERT_CRON || '15 9 * * *').trim() ||
        '15 9 * * *';
      const apartmentAutoAlertTimezone =
        String(process.env.APARTMENT_RENT_AUTO_ALERT_TIMEZONE || 'Asia/Kolkata').trim() ||
        'Asia/Kolkata';

      try {
        cron.schedule(
          apartmentAutoAlertCron,
          () => {
            void runApartmentRentAutoReminderJob({ trigger: 'cron' })
              .then((result) => {
                if ((result?.deliveredCount || 0) > 0 || (result?.candidateCount || 0) > 0) {
                  console.log(
                    `[APARTMENT] Auto rent reminders: candidates=${result.candidateCount}, delivered=${result.deliveredCount}, failed=${result.failedCount}, skipped=${result.skippedCount}.`
                  );
                }
              })
              .catch((error) => {
                console.error('[APARTMENT] Auto rent reminder job failed:', error);
              });
          },
          { timezone: apartmentAutoAlertTimezone }
        );
        setTimeout(() => {
          void runApartmentRentAutoReminderJob({ trigger: 'startup' }).catch((error) => {
            console.error('[APARTMENT] Startup auto rent reminder run failed:', error);
          });
        }, 12000);
        console.log(
          `[APARTMENT] Auto rent reminder scheduler enabled (${apartmentAutoAlertCron}, ${apartmentAutoAlertTimezone}).`
        );
      } catch (scheduleError) {
        console.error(
          `[APARTMENT] Invalid APARTMENT_RENT_AUTO_ALERT_CRON value: ${apartmentAutoAlertCron}.`,
          scheduleError
        );
      }
    } else {
      console.log('[APARTMENT] Auto rent reminder scheduler disabled.');
    }

    if (String(process.env.ENABLE_INGEST_JOBS || '').trim().toLowerCase() === 'true') {
      void runInfraIngestJob(pool).catch((error) => {
        console.error('[INFRA INGEST] Boot run failed:', error);
      });
      cron.schedule('0 */6 * * *', () => {
        void runInfraIngestJob(pool).catch((error) => {
          console.error('[INFRA INGEST] Scheduled run failed:', error);
        });
      });
      console.log('Ingest jobs enabled (PIB -> inbox, tender sources optional)');
    } else {
      console.log('Ingest jobs disabled. Set ENABLE_INGEST_JOBS=true to enable.');
    }

    const tenderIntelligenceDailyRefreshCron = String(
      process.env.TENDER_INTELLIGENCE_DAILY_REFRESH_CRON || '15 6 * * *'
    ).trim();
    const tenderIntelligenceDailyRefreshTimezone = String(
      process.env.TENDER_INTELLIGENCE_DAILY_REFRESH_TIMEZONE || 'Asia/Kolkata'
    ).trim() || 'Asia/Kolkata';
    const ingestJobsEnabled = String(process.env.ENABLE_INGEST_JOBS || '').trim().toLowerCase() === 'true';
    const runTenderSync = async (trigger) => {
      try {
        const result = await runTenderIntelligenceSyncJob(pool);
        if (result.inserted > 0 || result.updated > 0 || result.deleted > 0) {
          console.log(
            `[TENDER INTELLIGENCE] ${trigger}: processed=${result.processed}, inserted=${result.inserted}, updated=${result.updated}, deleted=${result.deleted}.`
          );
        }
      } catch (error) {
        console.error(`[TENDER INTELLIGENCE] ${trigger} sync failed:`, error);
      }
    };
    try {
      cron.schedule(
        tenderIntelligenceDailyRefreshCron,
        () => {
          void (async () => {
            try {
              if (ingestJobsEnabled) {
                await runInfraIngestJob(pool);
              }
              await runTenderSync('daily');
            } catch (error) {
              console.error('[TENDER INTELLIGENCE] Daily refresh failed:', error);
            }
          })();
        },
        { timezone: tenderIntelligenceDailyRefreshTimezone }
      );
      console.log(
        `[TENDER INTELLIGENCE] Daily-only refresh scheduled (${tenderIntelligenceDailyRefreshCron}, ${tenderIntelligenceDailyRefreshTimezone}).`
      );
    } catch (scheduleError) {
      console.error(
        `[TENDER INTELLIGENCE] Invalid daily refresh cron: ${tenderIntelligenceDailyRefreshCron}.`,
        scheduleError
      );
    }

    const eauctionSyncEnabled =
      String(process.env.EAUCTION_SYNC_ENABLED || 'true').trim().toLowerCase() !== 'false';
    const eauctionStartupSyncEnabled =
      String(process.env.EAUCTION_SYNC_STARTUP_ENABLED || 'true').trim().toLowerCase() !== 'false';
    const eauctionSyncCron = String(process.env.EAUCTION_SYNC_CRON || '45 6 * * *').trim() || '45 6 * * *';
    const eauctionSyncTimezone = String(process.env.EAUCTION_SYNC_TIMEZONE || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
    const runEAuctionSync = async (trigger) => {
      try {
        const result = await runEAuctionSyncJob(pool);
        const hasMeaningfulChange =
          result.inserted > 0 ||
          result.updated > 0 ||
          result.deactivated > 0 ||
          (result.errors || []).length > 0;
        if (hasMeaningfulChange) {
          console.log(
            `[EAUCTION] ${trigger}: processed=${result.processed}, inserted=${result.inserted}, updated=${result.updated}, deactivated=${result.deactivated}, sourcesChecked=${result.sourcesChecked}, sourcesHealthy=${result.sourcesHealthy}, errors=${result.errors.length}.`
          );
        }
        if ((result.errors || []).length > 0) {
          for (const message of result.errors) {
            console.warn(`[EAUCTION] ${trigger}: ${message}`);
          }
        }
      } catch (error) {
        console.error(`[EAUCTION] ${trigger} sync failed:`, error);
      }
    };

    if (eauctionSyncEnabled) {
      try {
        cron.schedule(
          eauctionSyncCron,
          () => {
            void runEAuctionSync('daily');
          },
          { timezone: eauctionSyncTimezone }
        );
        console.log(`[EAUCTION] Daily refresh scheduled (${eauctionSyncCron}, ${eauctionSyncTimezone}).`);
      } catch (scheduleError) {
        console.error(`[EAUCTION] Invalid daily refresh cron: ${eauctionSyncCron}.`, scheduleError);
      }

      if (eauctionStartupSyncEnabled) {
        setTimeout(() => {
          void runEAuctionSync('startup');
        }, 15000);
        console.log('[EAUCTION] Startup refresh scheduled.');
      } else {
        console.log('[EAUCTION] Startup refresh disabled.');
      }
    } else {
      console.log('[EAUCTION] Sync disabled.');
    }

    const queuePolicy = resolveQueueStartupPolicy();
    if (queuePolicy.shouldInitialize) {
      const queueStatus = await initializeQueueSystem();
      if (queueStatus.enabled) {
        console.log('[QUEUE] Redis + BullMQ initialized');
      } else {
        console.warn(`[QUEUE] Disabled: ${queueStatus.reason}. Analytics will run inline.`);
      }
    } else if (queuePolicy.reason) {
      markQueueSystemDisabled(queuePolicy.reason);
      console.log(`[QUEUE] ${queuePolicy.reason}`);
    }
    const analyticsSchedulerEnabled =
      String(process.env.ENABLE_ANALYTICS_SCHEDULER || 'false').trim().toLowerCase() === 'true';
    if (analyticsSchedulerEnabled) {
      startPropertyAnalyticsScheduler({
        intervalMs: 15 * 60 * 1000,
        onTick: async () => {
          await enqueueAnalyticsAggregation();
        },
      });
    } else {
      console.log('[ANALYTICS] Scheduler disabled. Set ENABLE_ANALYTICS_SCHEDULER=true to activate.');
    }

    const intervalMs = 5 * 60 * 1000;
    const runReactivationSweep = async () => {
      try {
        const result = await reactivateExpiredTemporaryDeactivations();
        if (result.reactivated > 0) {
          console.log(`[AUTH] Reactivated ${result.reactivated} account(s) after temporary deactivation.`);
        }
      } catch (error) {
        console.error('Temporary deactivation sweep failed:', error);
      }
    };

    void runReactivationSweep();
    setInterval(runReactivationSweep, intervalMs);

    initializeChatRealtime(httpServer, {
      isOriginAllowed: isRequestOriginAllowed,
    });

    const serverListenOptions = {
      port: Number(PORT),
      host: listenConfig.host,
    };
    if (listenConfig.ipv6Only !== undefined) {
      serverListenOptions.ipv6Only = listenConfig.ipv6Only;
    }

    httpServer.listen(serverListenOptions, () => {
      console.log(`API + realtime listening on ${listenConfig.displayHost}:${PORT}`);
      console.log(
        `[SERVER] Startup config: host=${listenConfig.displayHost}, port=${PORT} (${PORT_SOURCE}), cors=${CORS_ALLOW_ALL ? 'allow-all' : `allow-list:${allowedOrigins.length}`}.`
      );

      // Log Supabase Auth status so the operator can confirm integration is live.
      if (isManagedAuthEnabled()) {
        const provider = getManagedAuthProvider();
        const autoLink = String(process.env.MANAGED_AUTH_AUTO_LINK_BY_EMAIL || '').trim().toLowerCase() === 'true'
          ? ' (auto-link by email ON)'
          : ' (auto-link by email OFF)';
        console.log(`[AUTH] Supabase Auth active as primary provider: ${provider}${autoLink}`);
      } else {
        console.warn('[AUTH] Supabase Auth is NOT enabled. Set MANAGED_AUTH_PROVIDER=supabase and SUPABASE_ANON_KEY to activate managed auth.');
      }
    });

    // Graceful shutdown on termination signals.
    const gracefulShutdown = (signal) => {
      console.log(`[SERVER] Received ${signal}. Shutting down gracefully...`);
      httpServer.close(() => {
        pool.end().then(() => {
          console.log('[SERVER] Database pool closed. Goodbye.');
          process.exit(0);
        }).catch(() => {
          process.exit(0);
        });
      });
      // Force exit after 15 seconds.
      setTimeout(() => {
        console.error('[SERVER] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 15000).unref();
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  }
}

startServer();
