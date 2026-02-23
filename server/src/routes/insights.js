import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  createBuilderSource,
  createNewsSource,
  getProjectAnnouncementById,
  listBuilderSources,
  listJobRuns,
  listMarketCompare,
  listMarketTopCities,
  listMarketTrend,
  listNewsFeed,
  listNewsSources,
  listProjectAnnouncements,
  normalizeBuilderSourcePayload,
  normalizeSourcePayload,
  recordNewsClick,
  updateBuilderSource,
  updateNewsSource,
} from '../services/insights/queries.js';
import {
  runMarketDataJob,
  runNewsIngestJob,
  runUpcomingProjectsJob,
} from '../services/insights/jobs.js';

const router = Router();
const adminRouter = Router();

const uuidSchema = z.string().uuid();

const newsQuerySchema = z.object({
  source: z.string().trim().optional(),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(80).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

const marketTopQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const marketTrendQuerySchema = z.object({
  city: z.string().trim().min(1),
  limit: z.coerce.number().int().min(3).max(120).optional(),
});

const marketCompareQuerySchema = z.object({
  cities: z.string().trim().min(3),
  months: z.coerce.number().int().min(6).max(120).optional(),
});

const projectQuerySchema = z.object({
  builder: z.string().trim().optional(),
  city: z.string().trim().optional(),
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  budgetMin: z.coerce.number().nonnegative().optional(),
  budgetMax: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

const sourceCreateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  rssUrl: z.string().trim().url(),
  isActive: z.boolean().optional(),
});

const sourceUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    rssUrl: z.string().trim().url().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Provide at least one field to update.',
  });

const builderSourceCreateSchema = z.object({
  builderName: z.string().trim().min(2).max(160),
  sourceType: z.enum(['rss']).optional(),
  sourceUrl: z.string().trim().url(),
  isActive: z.boolean().optional(),
});

const builderSourceUpdateSchema = z
  .object({
    builderName: z.string().trim().min(2).max(160).optional(),
    sourceType: z.enum(['rss']).optional(),
    sourceUrl: z.string().trim().url().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Provide at least one field to update.',
  });

const jobRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

router.get('/insights/news', async (req, res, next) => {
  try {
    const query = newsQuerySchema.parse(req.query || {});
    const data = await listNewsFeed(query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/insights/news/:id/click', async (req, res, next) => {
  try {
    const articleId = uuidSchema.parse(req.params.id);
    const inserted = await recordNewsClick({
      articleId,
      userId: null,
    });

    if (!inserted) {
      return res.status(404).json({ error: 'Article not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/insights/market/top-cities', async (req, res, next) => {
  try {
    const query = marketTopQuerySchema.parse(req.query || {});
    const data = await listMarketTopCities(query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/insights/market/trend', async (req, res, next) => {
  try {
    const query = marketTrendQuerySchema.parse(req.query || {});
    const data = await listMarketTrend(query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/insights/market/compare', async (req, res, next) => {
  try {
    const query = marketCompareQuerySchema.parse(req.query || {});
    const cities = query.cities
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (cities.length < 2) {
      return res.status(400).json({ error: 'Select at least 2 cities for comparison.' });
    }

    const data = await listMarketCompare({
      cities,
      months: query.months,
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/insights/projects/announcements', async (req, res, next) => {
  try {
    const query = projectQuerySchema.parse(req.query || {});
    const data = await listProjectAnnouncements(query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/insights/projects/announcements/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const data = await getProjectAnnouncementById(id);

    if (!data) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(requireAuth, requirePermission('access_analytics'));

adminRouter.get('/insights/news-sources', async (req, res, next) => {
  try {
    const sources = await listNewsSources();
    return res.json({ sources });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/insights/news-sources', async (req, res, next) => {
  try {
    const parsed = sourceCreateSchema.parse(req.body || {});
    const payload = normalizeSourcePayload(parsed);
    const source = await createNewsSource(payload);
    return res.status(201).json({ source });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/insights/news-sources/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const parsed = sourceUpdateSchema.parse(req.body || {});
    const payload = normalizeSourcePayload(parsed);

    const source = await updateNewsSource(id, {
      ...(parsed.name !== undefined ? { name: payload.name } : {}),
      ...(parsed.rssUrl !== undefined ? { rssUrl: payload.rssUrl } : {}),
      ...(parsed.isActive !== undefined ? { isActive: payload.isActive } : {}),
    });

    if (!source) {
      return res.status(404).json({ error: 'News source not found or no changes provided.' });
    }

    return res.json({ source });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/insights/run/news', async (req, res, next) => {
  try {
    const result = await runNewsIngestJob({ jobName: 'news_ingest_job_manual' });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/insights/run/market', async (req, res, next) => {
  try {
    const result = await runMarketDataJob({ jobName: 'market_data_job_manual' });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/insights/builder-sources', async (req, res, next) => {
  try {
    const sources = await listBuilderSources();
    return res.json({ sources });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/insights/builder-sources', async (req, res, next) => {
  try {
    const parsed = builderSourceCreateSchema.parse(req.body || {});
    const payload = normalizeBuilderSourcePayload(parsed);
    const source = await createBuilderSource(payload);
    return res.status(201).json({ source });
  } catch (error) {
    return next(error);
  }
});

adminRouter.put('/insights/builder-sources/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const parsed = builderSourceUpdateSchema.parse(req.body || {});
    const payload = normalizeBuilderSourcePayload(parsed);

    const source = await updateBuilderSource(id, {
      ...(parsed.builderName !== undefined ? { builderName: payload.builderName } : {}),
      ...(parsed.sourceType !== undefined ? { sourceType: payload.sourceType } : {}),
      ...(parsed.sourceUrl !== undefined ? { sourceUrl: payload.sourceUrl } : {}),
      ...(parsed.isActive !== undefined ? { isActive: payload.isActive } : {}),
    });

    if (!source) {
      return res.status(404).json({ error: 'Builder source not found or no changes provided.' });
    }

    return res.json({ source });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/insights/run/projects', async (req, res, next) => {
  try {
    const result = await runUpcomingProjectsJob({ jobName: 'upcoming_projects_job_manual' });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/insights/job-runs', async (req, res, next) => {
  try {
    const query = jobRunsQuerySchema.parse(req.query || {});
    const runs = await listJobRuns(query);
    return res.json({ runs });
  } catch (error) {
    return next(error);
  }
});

router.use('/admin', adminRouter);

export default router;
