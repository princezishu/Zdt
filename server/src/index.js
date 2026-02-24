import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import net from 'net';
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
import supportRoutes from './routes/support.js';
import locationsRoutes from './routes/locations.js';
import infraUpdatesRoutes from './routes/infraUpdates.js';
import infraSubscriptionsRoutes from './routes/infraSubscriptions.js';
import infraIngestRoutes from './routes/infraIngest.js';
import groupDealsRoutes from './routes/groupDeals.js';
import { initializeChatRealtime } from './services/chatRealtime.js';
import { startPropertyAnalyticsScheduler } from './services/analytics/jobs.js';
import { ensureInsightsSourceSeeds, startInsightsScheduler } from './services/insights/jobs.js';
import { enqueueAnalyticsAggregation, initializeQueueSystem } from './services/queue/index.js';
import cron from 'node-cron';
import { runInfraIngestJob } from './jobs/infraIngest.js';
import {
  ensureApartmentComplexTables,
  ensureAuthTables,
  ensureBuildingMaterialsTables,
  ensureBuilderCompanyTables,
  ensureEAuctionTables,
  ensureInsightsTables,
  ensureLayoutUnitTables,
  ensureInfrastructureTables,
  ensureGroupDealsTables,
  ensureOwnerTables,
  ensureSitePromotionsTables,
  ensureSupportProgramTables,
  pool,
  pingDb,
  reactivateExpiredTemporaryDeactivations,
} from './db.js';

dotenv.config();

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);

const {
  PORT = 5000,
  HOST = '0.0.0.0',
  CORS_ORIGIN = 'http://localhost:5173',
} = process.env;

function isAddressInUseError(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'EADDRINUSE');
}

function isPortBusy(host, port) {
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

    tester.listen({
      host,
      port: Number(port),
      exclusive: true,
    });
  });
}

const defaultLocalOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
];

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
    ...defaultLocalOrigins,
    ...CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
  ])
);

app.use(
  cors({
    origin: (origin, callback) => {
      const isDevLanOrigin =
        process.env.NODE_ENV !== 'production' && origin && isDevPrivateNetworkOrigin(origin);

      if (!origin || allowedOrigins.includes(origin) || isDevLanOrigin) {
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
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Keep headroom for legacy data-url upload routes; new uploads use multipart/form-data.
app.use(express.json({ limit: '40mb' }));

// Local static uploads (profile photos, company logos, etc.).
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/health', async (req, res) => {
  try {
    await pingDb();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ ok: false });
  }
});

app.use('/auth', authRoutes);
app.use('/workflow', workflowRoutes);
app.use('/chat', chatRoutes);
app.use('/api/eauction', eauctionRoutes);
app.use('/api', layoutUnitsRoutes);
app.use('/api/apartment-complex', apartmentComplexRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/ai', aiAssistantRoutes);
app.use('/api/support', supportRoutes);
app.use('/api', insightsRoutes);
app.use('/api', realtyRoutes);
app.use('/api/rentals', rentalsRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api', locationsRoutes);
app.use('/api', infraUpdatesRoutes);
app.use('/api', infraSubscriptionsRoutes);
app.use('/api', infraIngestRoutes);
app.use('/api', groupDealsRoutes);
app.use('/builder', builderRoutes);
app.use('/realty', realtyRoutes);

app.use((err, req, res, next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
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
        typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Operation violates configured system limits.',
    });
  }

  console.error(err);
  return res.status(500).json({ error: 'Server error' });
});

async function startServer() {
  try {
    const portBusy = await isPortBusy(HOST, Number(PORT));
    if (portBusy) {
      console.warn(
        `[SERVER] Port ${PORT} is already in use on ${HOST}. Another backend instance is already running.`
      );
      return;
    }

    await ensureAuthTables();
    await ensureBuilderCompanyTables();
    await ensureLayoutUnitTables();
    await ensureEAuctionTables();
    await ensureApartmentComplexTables();
    await ensureBuildingMaterialsTables();
    await ensureSitePromotionsTables();
    await ensureSupportProgramTables();
    await ensureOwnerTables();
    await ensureInsightsTables();
    await ensureInfrastructureTables();
    await ensureGroupDealsTables();
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

    const queueStatus = await initializeQueueSystem();
    if (!queueStatus.enabled) {
      console.warn(`[QUEUE] Disabled: ${queueStatus.reason}`);
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
      isOriginAllowed: (origin) => {
        const isDevLanOrigin =
          process.env.NODE_ENV !== 'production' && origin && isDevPrivateNetworkOrigin(origin);
        return Boolean(!origin || allowedOrigins.includes(origin) || isDevLanOrigin);
      },
    });

    httpServer.listen(Number(PORT), HOST, () => {
      console.log(`API + realtime listening on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize auth tables:', error);
    process.exit(1);
  }
}

startServer();
