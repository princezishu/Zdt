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
import { createServer } from 'http';
import net from 'net';
import { createRateLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import workflowRoutes from './routes/workflow.js';
import chatRoutes from './routes/chat.js';
import eauctionRoutes from './routes/eauction.js';
import builderRoutes from './routes/builder.js';
import realtyRoutes from './routes/realty.js';
import layoutUnitsRoutes from './routes/layoutUnits.js';
import apartmentComplexRoutes, {
  runApartmentRentAutoReminderJob,
} from './routes/apartmentComplex.js';
import insightsRoutes from './routes/insights.js';
import materialsRoutes from './routes/materials.js';
import promotionsRoutes from './routes/promotions.js';
import aiAssistantRoutes from './routes/aiAssistant.js';
import rentalsRoutes from './routes/rentals.js';
import ownerRoutes from './routes/owner.js';
import dalalCoinRoutes from './routes/dalalCoin.js';
import supportRoutes from './routes/support.js';
import locationsRoutes from './routes/locations.js';
import infraUpdatesRoutes from './routes/infraUpdates.js';
import infraSubscriptionsRoutes from './routes/infraSubscriptions.js';
import infraIngestRoutes from './routes/infraIngest.js';
import tenderIntelligenceRoutes from './routes/tenderIntelligence.js';
import groupDealsRoutes from './routes/groupDeals.js';
import investSignalsRoutes from './routes/investSignals.js';
import collaborationsRoutes from './routes/collaborations.js';
import verificationRoutes from './modules/verification/routes.js';
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
  pingDb,
  reactivateExpiredTemporaryDeactivations,
} from './db.js';
import {
  readBooleanEnv,
  readIntegerEnv,
  readListEnv,
  readStringEnv,
} from './utils/env.js';

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

const PORT = readIntegerEnv('PORT', 5000, { min: 1, max: 65535 });
const HOST = readStringEnv('HOST', '0.0.0.0');
const CORS_ALLOW_ALL = readBooleanEnv('CORS_ALLOW_ALL', true);
const API_V1_PREFIX = '/api/v1';
const FORCE_HTTPS = readBooleanEnv('FORCE_HTTPS', false);

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

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

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

  return res.status(400).json({ error: 'HTTPS required' });
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
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large. Maximum is 5 MB.' });
  }
  return next(err);
});

app.get('/health', async (req, res) => {
  try {
    await pingDb();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ ok: false });
  }
});

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
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/workflow')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

app.use('/auth', authLoginRateLimiter, authRoutes);
app.use(`${API_V1_PREFIX}/auth`, authLoginRateLimiter, authRoutes);
app.use('/workflow', globalApiRateLimiter, workflowRoutes);
app.use(`${API_V1_PREFIX}/workflow`, globalApiRateLimiter, workflowRoutes);
app.use('/chat', globalApiRateLimiter, chatRoutes);
app.use(`${API_V1_PREFIX}/chat`, globalApiRateLimiter, chatRoutes);
app.use('/api/eauction', globalApiRateLimiter, eauctionRoutes);
app.use(`${API_V1_PREFIX}/eauction`, globalApiRateLimiter, eauctionRoutes);
app.use('/api', globalApiRateLimiter, layoutUnitsRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, layoutUnitsRoutes);
app.use('/api/apartment-complex', globalApiRateLimiter, apartmentComplexRoutes);
app.use(`${API_V1_PREFIX}/apartment-complex`, globalApiRateLimiter, apartmentComplexRoutes);
app.use('/api/materials', globalApiRateLimiter, materialsRoutes);
app.use(`${API_V1_PREFIX}/materials`, globalApiRateLimiter, materialsRoutes);
app.use('/api/promotions', globalApiRateLimiter, promotionsRoutes);
app.use(`${API_V1_PREFIX}/promotions`, globalApiRateLimiter, promotionsRoutes);
app.use('/api/ai', globalApiRateLimiter, aiAssistantRoutes);
app.use(`${API_V1_PREFIX}/ai`, globalApiRateLimiter, aiAssistantRoutes);
app.use('/api/support', globalApiRateLimiter, supportRoutes);
app.use(`${API_V1_PREFIX}/support`, globalApiRateLimiter, supportRoutes);
app.use('/api', globalApiRateLimiter, insightsRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, insightsRoutes);
app.use('/api', globalApiRateLimiter, realtyRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, realtyRoutes);
app.use('/api/rentals', globalApiRateLimiter, rentalsRoutes);
app.use(`${API_V1_PREFIX}/rentals`, globalApiRateLimiter, rentalsRoutes);
app.use('/api/owner', globalApiRateLimiter, ownerRoutes);
app.use(`${API_V1_PREFIX}/owner`, globalApiRateLimiter, ownerRoutes);
app.use('/api/dalal-coin', globalApiRateLimiter, dalalCoinRoutes);
app.use(`${API_V1_PREFIX}/dalal-coin`, globalApiRateLimiter, dalalCoinRoutes);
app.use('/api/dalal-coins', globalApiRateLimiter, dalalCoinRoutes);
app.use(`${API_V1_PREFIX}/dalal-coins`, globalApiRateLimiter, dalalCoinRoutes);
app.use('/api', globalApiRateLimiter, locationsRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, locationsRoutes);
app.use('/api', globalApiRateLimiter, infraUpdatesRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, infraUpdatesRoutes);
app.use('/api', globalApiRateLimiter, infraSubscriptionsRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, infraSubscriptionsRoutes);
app.use('/api', globalApiRateLimiter, infraIngestRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, infraIngestRoutes);
app.use('/api', globalApiRateLimiter, tenderIntelligenceRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, tenderIntelligenceRoutes);
app.use('/api', globalApiRateLimiter, groupDealsRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, groupDealsRoutes);
app.use('/api', globalApiRateLimiter, investSignalsRoutes);
app.use(API_V1_PREFIX, globalApiRateLimiter, investSignalsRoutes);
app.use('/api/verification', globalApiRateLimiter, verificationRoutes);
app.use(`${API_V1_PREFIX}/verification`, globalApiRateLimiter, verificationRoutes);
app.use('/api/collaborations', globalApiRateLimiter, collaborationsRoutes);
app.use(`${API_V1_PREFIX}/collaborations`, globalApiRateLimiter, collaborationsRoutes);
app.use('/builder', globalApiRateLimiter, builderRoutes);
app.use(`${API_V1_PREFIX}/builder`, globalApiRateLimiter, builderRoutes);
app.use('/realty', globalApiRateLimiter, realtyRoutes);
app.use(`${API_V1_PREFIX}/realty`, globalApiRateLimiter, realtyRoutes);

// Catch-all 404 for unmatched API routes.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});
app.use(API_V1_PREFIX, (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const requestContext = `${req.method} ${(req.originalUrl || req.url || '').slice(0, 80)}`;

  // Guard against double-send.
  if (res.headersSent) {
    console.error(`[ERROR] Headers already sent for ${requestContext}:`, err);
    return next(err);
  }

  // CORS errors from the cors() middleware.
  if (err?.message?.startsWith?.('CORS blocked')) {
    console.warn(`[CORS] ${err.message} — ${requestContext}`);
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  if (err?.name === 'ZodError') {
    const payload = {
      error: 'Invalid request',
    };
    if (!isProduction) {
      payload.details = err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    }
    return res.status(400).json(payload);
  }

  const customStatus = Number(err?.status || 0);
  if (Number.isFinite(customStatus) && customStatus >= 400 && customStatus < 600) {
    const payload = {
      error:
        typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Request could not be completed.',
    };

    if (typeof err?.code === 'string' && err.code) {
      payload.code = err.code;
    }

    if (err?.metadata && typeof err.metadata === 'object' && !Array.isArray(err.metadata)) {
      payload.metadata = err.metadata;
    }

    if (customStatus >= 500) {
      console.error(`[ERROR] ${requestContext} → ${customStatus}:`, err.message);
    }

    return res.status(customStatus).json(payload);
  }

  const pgCode = typeof err?.code === 'string' ? err.code : '';
  const pgConstraint = typeof err?.constraint === 'string' ? err.constraint : '';

  if (pgCode === '23505') {
    if (pgConstraint === 'rooms_building_floor_room_label_unique') {
      return res.status(409).json({
        error: 'Room name/number already exists on this floor. Use a different label.',
      });
    }

    if (pgConstraint === 'rent_payments_room_month_unique') {
      return res.status(409).json({
        error: 'Rent record already exists for this room and month.',
      });
    }

    return res.status(409).json({
      error: 'Duplicate data conflict. Please change the input and try again.',
    });
  }

  if (pgCode === '23503') {
    return res.status(400).json({
      error: 'Related record not found or cannot be referenced.',
    });
  }

  if (pgCode === '23514') {
    return res.status(400).json({
      error: 'Invalid value for one or more fields.',
    });
  }

  if (pgCode === '22P02') {
    return res.status(400).json({
      error: 'Invalid input format.',
    });
  }

  if (pgCode === '42P08') {
    return res.status(400).json({
      error: 'Invalid parameter type in request handling.',
    });
  }

  if (pgCode === 'P0001') {
    return res.status(409).json({
      error:
        !isProduction && typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Operation violates configured system limits.',
    });
  }

  console.error(`[ERROR] Unhandled server error for ${requestContext}:`, err);
  return res.status(500).json({ error: 'Server error' });
});

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
    startInsightsScheduler();
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
    startPropertyAnalyticsScheduler({
      intervalMs: 15 * 60 * 1000,
      onTick: async () => {
        await enqueueAnalyticsAggregation();
      },
    });

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
