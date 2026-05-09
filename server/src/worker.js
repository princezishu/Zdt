import crypto from 'crypto';
import { createServer } from 'http';
import { httpServerHandler } from 'cloudflare:node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { runApartmentRentAutoReminderJob } from './controllers/apartmentComplexController.js';
import {
  ensureApartmentComplexTables,
  ensureAuthTables,
  ensureBuildingMaterialsTables,
  ensureBuilderCompanyTables,
  ensureCollaborationTables,
  ensureDalalCoinTables,
  ensureEAuctionTables,
  ensureGroupDealsTables,
  ensureInfrastructureTables,
  ensureInsightsTables,
  ensureLayoutUnitTables,
  ensureOwnerTables,
  ensureSitePromotionsTables,
  ensureSupportProgramTables,
  ensureTenderIntelligenceSourceSeeds,
  ensureTenderIntelligenceTables,
  ensureVerificationTables,
  pool,
  reactivateExpiredTemporaryDeactivations,
  reinitializePool,
} from './db.js';
import { runInfraIngestJob } from './jobs/infraIngest.js';
import { disableApiCaching } from './middleware/apiNoStore.js';
import { handleApiNotFound } from './middleware/apiNotFound.js';
import { handleBodyParserError } from './middleware/bodyParserError.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { registerRoutes } from './routes/index.js';
import { runEAuctionSyncJob } from './services/eauction/sync.js';
import { ensureInsightsSourceSeeds } from './services/insights/jobs.js';
import { enqueueAnalyticsAggregation } from './services/queue/index.js';
import { runTenderIntelligenceSyncJob } from './services/tenderIntelligence/sync.js';
import { getManagedAuthProvider, isManagedAuthEnabled } from './services/managedAuth.js';
import {
  buildErrorResponse,
  describeError,
  getRequestContext,
  normalizeErrorResponse,
} from './utils/errorResponses.js';
import {
  readBooleanEnv,
  readListEnv,
  readStringEnv,
} from './utils/env.js';

const API_V1_PREFIX = '/api/v1';
const FORCE_HTTPS = readBooleanEnv('FORCE_HTTPS', true);
const DEFAULT_WORKER_MAINTENANCE_CRON = '*/15 * * * *';
const DEFAULT_WORKER_INFRA_INGEST_CRON = '0 */6 * * *';
const DEFAULT_WORKER_TENDER_REFRESH_CRON = '45 0 * * *';
const DEFAULT_WORKER_EAUCTION_CRON = '15 1 * * *';
const DEFAULT_WORKER_APARTMENT_ALERT_CRON = '45 3 * * *';

let startupPromise = null;
let startupFailure = null;
let authStatusLogged = false;

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

function escapeRegexLiteral(value) {
  return String(value || '').replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function createAllowedOriginPattern(pattern) {
  const normalizedPattern = String(pattern || '').trim();
  if (!normalizedPattern) {
    return null;
  }

  const regexSource = `^${normalizedPattern.split('*').map(escapeRegexLiteral).join('.*')}$`;
  return new RegExp(regexSource, 'i');
}

const allowedOrigins = Array.from(
  new Set([
    ...readListEnv(['FRONTEND_URL', 'CORS_ALLOWED_ORIGINS', 'CORS_ORIGIN']),
  ])
);
const allowedOriginPatterns = Array.from(
  new Set(readListEnv(['CORS_ALLOWED_ORIGIN_PATTERNS']))
)
  .map(createAllowedOriginPattern)
  .filter(Boolean);
const CORS_ALLOW_ALL = readBooleanEnv('CORS_ALLOW_ALL', false);

function matchesAllowedOriginPattern(origin) {
  const normalizedOrigin = String(origin || '').trim();
  if (!normalizedOrigin) {
    return false;
  }

  return allowedOriginPatterns.some((pattern) => pattern.test(normalizedOrigin));
}

function isRequestOriginAllowed(origin) {
  if (!origin || CORS_ALLOW_ALL) {
    return true;
  }

  const isDevLanOrigin =
    process.env.NODE_ENV !== 'production' && origin && isDevPrivateNetworkOrigin(origin);
  return Boolean(allowedOrigins.includes(origin) || matchesAllowedOriginPattern(origin) || isDevLanOrigin);
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

function shouldCaptureRawJsonBody(url = '') {
  const normalizedUrl = String(url || '').toLowerCase();
  return (
    normalizedUrl.startsWith('/api/owner/checkout/webhook/razorpay')
    || normalizedUrl.startsWith('/api/v1/owner/checkout/webhook/razorpay')
  );
}

function normalizeApiErrorResponses(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function normalizedJson(body) {
    const statusCode = Number(this.statusCode || 200);
    if (statusCode < 400) {
      return originalJson(body);
    }

    return originalJson(
      normalizeErrorResponse({
        req,
        payload: body,
        status: statusCode,
      })
    );
  };

  return next();
}

function handleWorkerError(err, req, res, next) {
  if (res.headersSent) {
    console.error(`[WORKER] Headers already sent for ${getRequestContext(req)}.`, describeError(err));
    return next(err);
  }

  if (err?.message?.startsWith?.('CORS blocked')) {
    return res.status(403).json(buildErrorResponse({
      req,
      message: 'Origin not allowed.',
      code: 'cors_blocked',
    }));
  }

  if (err?.name === 'ZodError' && Array.isArray(err?.issues)) {
    return res.status(400).json(buildErrorResponse({
      req,
      message: 'Invalid request',
      code: 'invalid_request',
      details: err.issues.map((issue) => ({
        path: Array.isArray(issue?.path) ? issue.path.join('.') : '',
        message: issue?.message || 'Invalid value',
      })),
    }));
  }

  const customStatus = Number(err?.status || 0);
  if (Number.isFinite(customStatus) && customStatus >= 400 && customStatus < 600) {
    const message =
      customStatus >= 500 && process.env.NODE_ENV === 'production' && err?.expose !== true
        ? 'Server error'
        : typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : customStatus >= 500
            ? 'Server error'
            : 'Request could not be completed.';

    return res.status(customStatus).json(buildErrorResponse({
      req,
      message,
      code: typeof err?.code === 'string' && err.code ? err.code : undefined,
      metadata:
        err?.metadata && typeof err.metadata === 'object' && !Array.isArray(err.metadata)
          ? err.metadata
          : undefined,
    }));
  }

  const pgCode = typeof err?.code === 'string' ? err.code : '';
  const pgConstraint = typeof err?.constraint === 'string' ? err.constraint : '';

  if (pgCode === '23505') {
    if (pgConstraint === 'rooms_building_floor_room_label_unique') {
      return res.status(409).json(buildErrorResponse({
        req,
        message: 'Room name/number already exists on this floor. Use a different label.',
        code: 'duplicate_conflict',
      }));
    }

    if (pgConstraint === 'rent_payments_room_month_unique') {
      return res.status(409).json(buildErrorResponse({
        req,
        message: 'Rent record already exists for this room and month.',
        code: 'duplicate_conflict',
      }));
    }

    return res.status(409).json(buildErrorResponse({
      req,
      message: 'Duplicate data conflict. Please change the input and try again.',
      code: 'duplicate_conflict',
    }));
  }

  if (pgCode === '23503') {
    return res.status(400).json(buildErrorResponse({
      req,
      message: 'Related record not found or cannot be referenced.',
      code: 'related_record_missing',
    }));
  }

  if (pgCode === '23514') {
    return res.status(400).json(buildErrorResponse({
      req,
      message: 'Invalid value for one or more fields.',
      code: 'constraint_violation',
    }));
  }

  if (pgCode === '22P02') {
    return res.status(400).json(buildErrorResponse({
      req,
      message: 'Invalid input format.',
      code: 'invalid_input_format',
    }));
  }

  if (pgCode === '42P08') {
    return res.status(400).json(buildErrorResponse({
      req,
      message: 'Invalid parameter type in request handling.',
      code: 'invalid_parameter_type',
    }));
  }

  if (pgCode === 'P0001') {
    return res.status(409).json(buildErrorResponse({
      req,
      message:
        process.env.NODE_ENV !== 'production' && typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Operation violates configured system limits.',
      code: 'operation_blocked',
    }));
  }

  console.error(`[WORKER] Unhandled server error for ${getRequestContext(req)}.`, describeError(err));
  return res.status(500).json(buildErrorResponse({
    req,
    message: 'Server error',
    code: 'server_error',
  }));
}

function createWorkerApp() {
  const app = express();
  app.disable('x-powered-by');

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

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // Apply strict CSP to API routes only (JSON responses)
    const isApiRoute = req.path.startsWith('/api');
    if (isApiRoute) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
      );
    }

    if (req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
  });

  app.use(normalizeApiErrorResponses);

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
  app.use(handleBodyParserError);

  const authLoginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Please try again after 15 minutes.',
    scope: 'auth_login',
  });

  const globalApiRateLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: 'Too many requests. Please slow down.',
    scope: 'global_api',
  });

  app.use(disableApiCaching);

  registerRoutes(app, {
    apiV1Prefix: API_V1_PREFIX,
    authLoginRateLimiter,
    globalApiRateLimiter,
  });

  app.use('/api', handleApiNotFound);
  app.use(API_V1_PREFIX, handleApiNotFound);
  app.use(handleWorkerError);

  return app;
}

async function completeWorkerStartupTasks() {
  // In the Worker environment, the schema already exists in Supabase
  // (created by the standalone Node.js server or migrations).
  // 
  // The `pg` Pool creates connections lazily, so we skip any DB calls
  // here and let each route handler establish connections as needed.
  // This avoids "Connection terminated unexpectedly" errors from the
  // Supabase pooler during cold starts.
  console.log('[WORKER] Startup tasks completed (migrations skipped — run server locally to migrate).');
}

async function ensureWorkerStartup() {
  if (startupFailure) {
    throw startupFailure;
  }

  if (!startupPromise) {
    startupPromise = completeWorkerStartupTasks().catch((error) => {
      startupFailure = error;
      startupPromise = null;
      throw error;
    });
  }

  await startupPromise;
}

function logManagedAuthStatusOnce() {
  if (authStatusLogged) {
    return;
  }

  authStatusLogged = true;
  if (isManagedAuthEnabled()) {
    const provider = getManagedAuthProvider();
    const autoLink = String(process.env.MANAGED_AUTH_AUTO_LINK_BY_EMAIL || '').trim().toLowerCase() === 'true'
      ? ' (auto-link by email ON)'
      : ' (auto-link by email OFF)';
    console.log(`[AUTH] Supabase Auth active as primary provider: ${provider}${autoLink}`);
  } else {
    console.warn('[AUTH] Supabase Auth is NOT enabled. Set MANAGED_AUTH_PROVIDER=supabase and SUPABASE_PROJECT_URL. Add SUPABASE_ANON_KEY as well when your project uses HS256 tokens.');
  }
}

async function runWorkerMaintenanceJobs() {
  const analyticsEnabled =
    String(process.env.ENABLE_ANALYTICS_SCHEDULER || 'false').trim().toLowerCase() === 'true';

  const tasks = [
    reactivateExpiredTemporaryDeactivations().then((result) => {
      if ((result?.reactivated || 0) > 0) {
        console.log(`[AUTH] Reactivated ${result.reactivated} account(s) after temporary deactivation.`);
      }
    }),
  ];

  if (analyticsEnabled) {
    tasks.push(
      enqueueAnalyticsAggregation().then(() => {
        console.log('[ANALYTICS] Scheduled aggregation completed.');
      })
    );
  }

  await Promise.all(tasks);
}

async function runWorkerInfraIngestJob() {
  const ingestEnabled = String(process.env.ENABLE_INGEST_JOBS || '').trim().toLowerCase() === 'true';
  if (!ingestEnabled) {
    console.log('[INFRA INGEST] Skipped because ENABLE_INGEST_JOBS is not true.');
    return;
  }

  await runInfraIngestJob(pool);
  console.log('[INFRA INGEST] Scheduled run completed.');
}

async function runWorkerTenderRefreshJob() {
  const ingestEnabled = String(process.env.ENABLE_INGEST_JOBS || '').trim().toLowerCase() === 'true';
  if (ingestEnabled) {
    await runInfraIngestJob(pool);
  }

  const result = await runTenderIntelligenceSyncJob(pool);
  console.log(
    `[TENDER INTELLIGENCE] Daily refresh: processed=${result.processed}, inserted=${result.inserted}, updated=${result.updated}, deleted=${result.deleted}.`
  );
}

async function runWorkerEAuctionSyncJob() {
  const eauctionSyncEnabled =
    String(process.env.EAUCTION_SYNC_ENABLED || 'true').trim().toLowerCase() !== 'false';
  if (!eauctionSyncEnabled) {
    console.log('[EAUCTION] Sync skipped because EAUCTION_SYNC_ENABLED=false.');
    return;
  }

  const result = await runEAuctionSyncJob(pool);
  console.log(
    `[EAUCTION] Scheduled refresh: processed=${result.processed}, inserted=${result.inserted}, updated=${result.updated}, deactivated=${result.deactivated}, sourcesChecked=${result.sourcesChecked}, sourcesHealthy=${result.sourcesHealthy}, errors=${(result.errors || []).length}.`
  );
}

async function runWorkerApartmentAlertJob() {
  const apartmentAutoAlertEnabled =
    String(process.env.APARTMENT_RENT_AUTO_ALERT_ENABLED || 'true').trim().toLowerCase() !== 'false';
  if (!apartmentAutoAlertEnabled) {
    console.log('[APARTMENT] Auto rent reminder scheduler disabled.');
    return;
  }

  const result = await runApartmentRentAutoReminderJob({ trigger: 'scheduled' });
  if ((result?.deliveredCount || 0) > 0 || (result?.candidateCount || 0) > 0) {
    console.log(
      `[APARTMENT] Auto rent reminders: candidates=${result.candidateCount}, delivered=${result.deliveredCount}, failed=${result.failedCount}, skipped=${result.skippedCount}.`
    );
  }
}

async function runScheduledCron(cron) {
  await ensureWorkerStartup();
  logManagedAuthStatusOnce();

  switch (cron) {
    case DEFAULT_WORKER_MAINTENANCE_CRON:
      await runWorkerMaintenanceJobs();
      return;
    case DEFAULT_WORKER_INFRA_INGEST_CRON:
      await runWorkerInfraIngestJob();
      return;
    case DEFAULT_WORKER_TENDER_REFRESH_CRON:
      await runWorkerTenderRefreshJob();
      return;
    case DEFAULT_WORKER_EAUCTION_CRON:
      await runWorkerEAuctionSyncJob();
      return;
    case DEFAULT_WORKER_APARTMENT_ALERT_CRON:
      await runWorkerApartmentAlertJob();
      return;
    default:
      console.log(`[SCHEDULE] No task mapped for cron "${cron}".`);
  }
}

const app = createWorkerApp();
const server = createServer(app);
const nodeHandler = httpServerHandler(server);

export default {
  async fetch(request, env, ctx) {
    // Use Hyperdrive's proxied connection so pg works from Workers
    if (env?.HYPERDRIVE?.connectionString) {
      reinitializePool(env.HYPERDRIVE.connectionString);
    }

    try {
      await ensureWorkerStartup();
      logManagedAuthStatusOnce();
      return nodeHandler.fetch(request, env, ctx);
    } catch (error) {
      console.error('[WORKER] Startup failed before request handling.', describeError(error));
      return new Response(
        JSON.stringify(buildErrorResponse({
          message: 'Server startup failed. Check Worker logs and retry the deployment.',
          code: 'service_startup_failed',
        })),
        {
          status: 503,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        }
      );
    }
  },

  async scheduled(controller, env, ctx) {
    if (env?.HYPERDRIVE?.connectionString) {
      reinitializePool(env.HYPERDRIVE.connectionString);
    }
    ctx.waitUntil(
      runScheduledCron(controller.cron).catch((error) => {
        console.error(`[SCHEDULE] Cron "${controller.cron}" failed.`, describeError(error));
      })
    );
  },
};
