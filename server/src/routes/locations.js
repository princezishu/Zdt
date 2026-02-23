import { Router } from 'express';
import { z } from 'zod';
import {
  getIndiaVillageDirectoryStatus,
  listIndiaDistricts,
  listIndiaPlaces,
  listIndiaStates,
  listIndiaSubdistricts,
  suggestIndiaVillages,
} from '../services/indiaVillageDirectory.js';

const router = Router();

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

const geoBaseQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
  offset: z.coerce.number().int().min(0).max(50000).optional().default(0),
});

const districtsQuerySchema = geoBaseQuerySchema.extend({
  stateCode: z.string().trim().min(1).max(20),
});

const subdistrictsQuerySchema = geoBaseQuerySchema.extend({
  districtCode: z.string().trim().min(1).max(20),
});

const placesQuerySchema = geoBaseQuerySchema.extend({
  subdistrictCode: z.string().trim().min(1).max(20),
});

function handleMissingDataset(error, res) {
  if (error?.code !== 'INDIA_VILLAGE_DATA_MISSING') {
    return false;
  }
  const status = getIndiaVillageDirectoryStatus();
  res.status(503).json({
    error: 'India village dataset not ready. Run: npm run prepare:india-villages (inside server folder).',
    status,
  });
  return true;
}

router.get('/geo/states', async (req, res, next) => {
  try {
    const query = geoBaseQuerySchema.parse(req.query || {});
    const result = await listIndiaStates({
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });
    return res.json(result);
  } catch (error) {
    if (handleMissingDataset(error, res)) return;
    return next(error);
  }
});

router.get('/geo/districts', async (req, res, next) => {
  try {
    const query = districtsQuerySchema.parse(req.query || {});
    const result = await listIndiaDistricts({
      stateCode: query.stateCode,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });
    return res.json(result);
  } catch (error) {
    if (handleMissingDataset(error, res)) return;
    return next(error);
  }
});

router.get('/geo/subdistricts', async (req, res, next) => {
  try {
    const query = subdistrictsQuerySchema.parse(req.query || {});
    const result = await listIndiaSubdistricts({
      districtCode: query.districtCode,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });
    return res.json(result);
  } catch (error) {
    if (handleMissingDataset(error, res)) return;
    return next(error);
  }
});

router.get('/geo/places', async (req, res, next) => {
  try {
    const query = placesQuerySchema.parse(req.query || {});
    const result = await listIndiaPlaces({
      subdistrictCode: query.subdistrictCode,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });
    return res.json(result);
  } catch (error) {
    if (handleMissingDataset(error, res)) return;
    return next(error);
  }
});

router.get('/locations/india-suggest', async (req, res, next) => {
  try {
    const query = suggestQuerySchema.parse(req.query || {});
    const result = await suggestIndiaVillages({
      query: query.q,
      limit: query.limit,
    });
    return res.json(result);
  } catch (error) {
    if (handleMissingDataset(error, res)) return;
    return next(error);
  }
});

router.get('/locations/india-suggest/status', async (req, res) => {
  const status = getIndiaVillageDirectoryStatus();
  return res.json(status);
});

export default router;
