import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { listIndiaStates } from '../services/indiaVillageDirectory.js';

const router = Router();

const CATEGORY_VALUES = ['PROPOSED', 'APPROVED', 'UNDER_CONSTRUCTION', 'COMPLETED'];
const IMPACT_VALUES = ['LOW', 'MEDIUM', 'HIGH'];
const VERIFICATION_VALUES = [
  'PUBLIC_NOTICE',
  'TENDER',
  'SOURCE_ONLY',
  'OFFICE_CONFIRMED',
  'LOCAL_REPORT',
  'UNKNOWN',
];
const LOCATION_SCOPE_VALUES = ['all', 'state'];
const CATEGORY_SET = new Set(CATEGORY_VALUES);
const VERIFICATION_SET = new Set(VERIFICATION_VALUES);
const SORT_VALUES = ['smart', 'newest', 'impact', 'verified'];
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PUBLIC_VERIFICATION_LEVELS = new Set(['PUBLIC_NOTICE', 'TENDER', 'SOURCE_ONLY']);
const stateCodeToNameCache = new Map();

const querySchema = z.object({
  scope: z.enum(LOCATION_SCOPE_VALUES).optional(),
  state_code: z.string().trim().min(1).max(20).optional(),
  state: z.string().trim().min(1).max(80).optional(),
  district: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  categories: z.string().trim().min(1).max(300).optional(),
  verification_level: z.enum(VERIFICATION_VALUES).optional(),
  verification_levels: z.string().trim().min(1).max(300).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(SORT_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const createBodySchema = z.object({
  state: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(120),
  cities: z.array(z.string().trim().min(1).max(120)).min(1),
  category: z.enum(CATEGORY_VALUES),
  projectName: z.string().trim().min(1).max(200),
  authority: z.string().trim().min(1).max(120),
  projectType: z.string().trim().min(1).max(120),
  statusText: z.string().trim().min(1),
  impactLevel: z.enum(IMPACT_VALUES),
  sourceRef: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).max(2000),
  verificationLevel: z.enum(VERIFICATION_VALUES),
  lastUpdated: z.string().trim().regex(DATE_ONLY_REGEX).nullable().optional(),
});

const updateBodySchema = z.object({
  state: z.string().trim().min(1).max(80).optional(),
  district: z.string().trim().min(1).max(120).optional(),
  cities: z.array(z.string().trim().min(1).max(120)).min(1).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  projectName: z.string().trim().min(1).max(200).optional(),
  authority: z.string().trim().min(1).max(120).optional(),
  projectType: z.string().trim().min(1).max(120).optional(),
  statusText: z.string().trim().min(1).optional(),
  impactLevel: z.enum(IMPACT_VALUES).optional(),
  sourceRef: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).max(2000).optional(),
  verificationLevel: z.enum(VERIFICATION_VALUES).optional(),
  lastUpdated: z.string().trim().regex(DATE_ONLY_REGEX).nullable().optional(),
});

function ensureAdminToken(req, res) {
  const configuredToken = String(process.env.ADMIN_TOKEN || '').trim();
  const incomingToken = req.header('x-admin-token');

  if (!configuredToken || incomingToken !== configuredToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function normalizeNullableString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function cleanCities(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((city) => String(city).trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

function parseEnumCsv(value, allowedValues) {
  const text = String(value || '').trim();
  if (!text) return [];
  const values = text
    .split(',')
    .map((entry) => String(entry || '').trim().toUpperCase())
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  return unique.filter((entry) => allowedValues.has(entry));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPublicVisible(update) {
  const sourceRef = update?.source_ref ?? update?.sourceRef;
  const sourceUrl = update?.source_url ?? update?.sourceUrl;
  const verificationLevel = update?.verification_level ?? update?.verificationLevel;
  if (!isNonEmptyString(sourceRef)) return false;
  if (!isNonEmptyString(sourceUrl)) return false;
  return PUBLIC_VERIFICATION_LEVELS.has(String(verificationLevel || '').trim().toUpperCase());
}

async function resolveStateNameByCode(stateCode) {
  const normalizedCode = String(stateCode || '').trim().toUpperCase();
  if (!normalizedCode) return '';

  if (stateCodeToNameCache.has(normalizedCode)) {
    return stateCodeToNameCache.get(normalizedCode);
  }

  try {
    const response = await listIndiaStates({ q: normalizedCode, limit: 200, offset: 0 });
    const items = Array.isArray(response?.items) ? response.items : [];
    const matched = items.find(
      (item) => String(item?.code || '').trim().toUpperCase() === normalizedCode
    );
    const resolved = String(matched?.name || '').trim();
    if (resolved) {
      stateCodeToNameCache.set(normalizedCode, resolved);
      return resolved;
    }
  } catch {
    // Keep state_code support best-effort in case the LGD dataset is unavailable.
  }

  return '';
}

function normalizeWriteBody(rawBody) {
  const raw = rawBody && typeof rawBody === 'object' ? rawBody : {};

  return {
    state: raw.state,
    district: raw.district,
    cities: raw.cities,
    category: raw.category,
    projectName: raw.projectName ?? raw.project_name,
    authority: raw.authority,
    projectType: raw.projectType ?? raw.project_type,
    statusText: raw.statusText ?? raw.status_text,
    impactLevel: raw.impactLevel ?? raw.impact_level,
    sourceRef: raw.sourceRef ?? raw.source_ref,
    sourceUrl: normalizeNullableString(raw.sourceUrl ?? raw.source_url),
    verificationLevel: raw.verificationLevel ?? raw.verification_level,
    lastUpdated: normalizeNullableString(raw.lastUpdated ?? raw.last_updated),
  };
}

function appendPublicTrustGuards(where) {
  where.push(`COALESCE(TRIM(source_ref), '') <> ''`);
  where.push(`COALESCE(TRIM(source_url), '') <> ''`);
  where.push(`COALESCE(TRIM(verification_level), '') <> ''`);
  where.push(`verification_level IN ('PUBLIC_NOTICE', 'TENDER', 'SOURCE_ONLY')`);
}

router.get('/infra-updates/meta', async (req, res, next) => {
  try {
    const state = String(req.query.state || '').trim();
    const district = String(req.query.district || '').trim();
    const q = String(req.query.q || '').trim();
    const like = q ? `%${q}%` : null;

    const stateWhere = [];
    const stateValues = [];
    appendPublicTrustGuards(stateWhere);
    if (like) {
      stateValues.push(like);
      stateWhere.push(`state ILIKE $${stateValues.length}`);
    }
    const statesResult = await pool.query(
      `
        SELECT state, COUNT(*)::int AS count
        FROM infra_updates
        ${stateWhere.length ? `WHERE ${stateWhere.join(' AND ')}` : ''}
        GROUP BY state
        ORDER BY count DESC, state ASC
        LIMIT 25
      `,
      stateValues
    );

    const districtWhere = [];
    const districtValues = [];
    appendPublicTrustGuards(districtWhere);
    if (state) {
      districtValues.push(state);
      districtWhere.push(`LOWER(state) = LOWER($${districtValues.length})`);
    }
    if (like) {
      districtValues.push(like);
      districtWhere.push(`district ILIKE $${districtValues.length}`);
    }
    const districtsResult = await pool.query(
      `
        SELECT district, COUNT(*)::int AS count
        FROM infra_updates
        ${districtWhere.length ? `WHERE ${districtWhere.join(' AND ')}` : ''}
        GROUP BY district
        ORDER BY count DESC, district ASC
        LIMIT 25
      `,
      districtValues
    );

    const cityFilters = [];
    const cityValues = [];
    appendPublicTrustGuards(cityFilters);
    if (state) {
      cityValues.push(state);
      cityFilters.push(`LOWER(state) = LOWER($${cityValues.length})`);
    }
    if (district) {
      cityValues.push(district);
      cityFilters.push(`LOWER(district) = LOWER($${cityValues.length})`);
    }
    const cityLikeClause = like ? `WHERE city ILIKE $${cityValues.length + 1}` : '';
    const cityParams = like ? [...cityValues, like] : cityValues;
    const citiesResult = await pool.query(
      `
        SELECT city, COUNT(*)::int AS count
        FROM (
          SELECT unnest(cities) AS city
          FROM infra_updates
          ${cityFilters.length ? `WHERE ${cityFilters.join(' AND ')}` : ''}
        ) AS city_rows
        ${cityLikeClause}
        GROUP BY city
        ORDER BY count DESC, city ASC
        LIMIT 25
      `,
      cityParams
    );

    return res.json({
      states: statesResult.rows.map((row) => row.state),
      districts: districtsResult.rows.map((row) => row.district),
      cities: citiesResult.rows.map((row) => row.city),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/infra-updates/meta-all', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const [statesResult, districtsResult, citiesResult] = await Promise.all([
      pool.query(`
        SELECT state
        FROM infra_updates
        GROUP BY state
        ORDER BY state ASC
        LIMIT 200
      `),
      pool.query(`
        SELECT district
        FROM infra_updates
        GROUP BY district
        ORDER BY district ASC
        LIMIT 400
      `),
      pool.query(`
        SELECT city
        FROM (
          SELECT unnest(cities) AS city
          FROM infra_updates
        ) AS city_rows
        GROUP BY city
        ORDER BY city ASC
        LIMIT 800
      `),
    ]);

    return res.json({
      states: statesResult.rows.map((row) => row.state),
      districts: districtsResult.rows.map((row) => row.district),
      cities: citiesResult.rows.map((row) => row.city),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/infra-updates/recent', async (req, res, next) => {
  try {
    const state = String(req.query.state || '').trim();
    const district = String(req.query.district || '').trim();
    const city = String(req.query.city || '').trim();
    const limitRaw = Number(req.query.limit || 5);
    const limit = Math.min(20, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 5));

    const where = [`verification_level IN ('PUBLIC_NOTICE','TENDER')`];
    appendPublicTrustGuards(where);
    const values = [];

    if (state) {
      values.push(state);
      where.push(`LOWER(state) = LOWER($${values.length})`);
    }
    if (district) {
      values.push(district);
      where.push(`LOWER(district) = LOWER($${values.length})`);
    }
    if (city) {
      values.push(city);
      where.push(
        `EXISTS (SELECT 1 FROM unnest(cities) AS city_name WHERE LOWER(city_name) = LOWER($${values.length}))`
      );
    }

    values.push(limit);
    const limitIdx = values.length;
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const result = await pool.query(
      `
        SELECT
          id,
          state,
          district,
          cities,
          category,
          project_name AS "projectName",
          authority,
          project_type AS "projectType",
          status_text AS "statusText",
          impact_level AS "impactLevel",
          source_ref AS "sourceRef",
          source_url AS "sourceUrl",
          verification_level AS "verificationLevel",
          last_updated AS "lastUpdated",
          created_at AS "createdAt"
        FROM infra_updates
        ${whereSql}
        ORDER BY last_updated DESC, id DESC
        LIMIT $${limitIdx}
      `,
      values
    );

    return res.json({ items: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/infra-updates/by-id/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          state,
          district,
          cities,
          category,
          project_name AS "projectName",
          authority,
          project_type AS "projectType",
          status_text AS "statusText",
          impact_level AS "impactLevel",
          source_ref AS "sourceRef",
          source_url AS "sourceUrl",
          verification_level AS "verificationLevel",
          last_updated AS "lastUpdated",
          created_at AS "createdAt"
        FROM infra_updates
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!isPublicVisible(result.rows[0])) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ item: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.get('/infra-updates', async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query || {});
    const where = [];
    const values = [];
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const categories = parseEnumCsv(query.categories, CATEGORY_SET);
    if (query.category && !categories.includes(query.category)) {
      categories.push(query.category);
    }
    const verificationLevels = parseEnumCsv(
      query.verification_levels,
      VERIFICATION_SET
    );
    if (query.verification_level && !verificationLevels.includes(query.verification_level)) {
      verificationLevels.push(query.verification_level);
    }

    appendPublicTrustGuards(where);

    const normalizedScope = String(query.scope || '').trim().toLowerCase();
    const stateCode = String(query.state_code || '').trim();
    let scopedState = String(query.state || '').trim();

    if (normalizedScope === 'state') {
      if (!scopedState && stateCode) {
        scopedState = await resolveStateNameByCode(stateCode);
      }
      if (!scopedState && stateCode) {
        scopedState = stateCode;
      }
      if (!scopedState) {
        return res.status(400).json({ error: 'state or state_code is required when scope=state' });
      }

      values.push(scopedState);
      where.push(`LOWER(state) = LOWER($${values.length})`);
    } else if (!normalizedScope) {
      if (query.state) {
        values.push(query.state);
        where.push(`LOWER(state) = LOWER($${values.length})`);
      }

      if (query.district) {
        values.push(query.district);
        where.push(`LOWER(district) = LOWER($${values.length})`);
      }
    }

    if (categories.length === 1) {
      values.push(categories[0]);
      where.push(`category = $${values.length}`);
    } else if (categories.length > 1) {
      values.push(categories);
      where.push(`category = ANY($${values.length}::text[])`);
    }

    if (verificationLevels.length === 1) {
      values.push(verificationLevels[0]);
      where.push(`verification_level = $${values.length}`);
    } else if (verificationLevels.length > 1) {
      values.push(verificationLevels);
      where.push(`verification_level = ANY($${values.length}::text[])`);
    }

    if (!normalizedScope && query.city) {
      values.push(query.city);
      where.push(
        `EXISTS (SELECT 1 FROM unnest(cities) AS city_name WHERE LOWER(city_name) = LOWER($${values.length}))`
      );
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(
        project_name ILIKE $${values.length}
        OR status_text ILIKE $${values.length}
        OR project_type ILIKE $${values.length}
        OR authority ILIKE $${values.length}
        OR source_ref ILIKE $${values.length}
        OR COALESCE(source_url, '') ILIKE $${values.length}
        OR EXISTS (SELECT 1 FROM unnest(cities) AS city_name WHERE city_name ILIKE $${values.length})
      )`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const orderByMap = {
      newest: `last_updated DESC, id DESC`,
      impact: `
        CASE impact_level
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW' THEN 1
          ELSE 0
        END DESC,
        last_updated DESC,
        id DESC
      `,
      verified: `
        CASE verification_level
          WHEN 'PUBLIC_NOTICE' THEN 6
          WHEN 'TENDER' THEN 5
          WHEN 'SOURCE_ONLY' THEN 4
          WHEN 'OFFICE_CONFIRMED' THEN 3
          WHEN 'LOCAL_REPORT' THEN 2
          WHEN 'UNKNOWN' THEN 1
          ELSE 0
        END DESC,
        last_updated DESC,
        CASE impact_level
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW' THEN 1
          ELSE 0
        END DESC,
        id DESC
      `,
      smart: `
        CASE verification_level
          WHEN 'PUBLIC_NOTICE' THEN 2
          WHEN 'TENDER' THEN 2
          WHEN 'SOURCE_ONLY' THEN 1
          ELSE 0
        END DESC,
        last_updated DESC,
        CASE impact_level
          WHEN 'HIGH' THEN 3
          WHEN 'MEDIUM' THEN 2
          WHEN 'LOW' THEN 1
          ELSE 0
        END DESC,
        id DESC
      `,
    };
    const orderBy = orderByMap[query.sort || 'smart'] || orderByMap.smart;
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM infra_updates
        ${whereSql}
      `,
      values
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const itemValues = [...values, pageSize, offset];
    const limitIdx = itemValues.length - 1;
    const offsetIdx = itemValues.length;

    const result = await pool.query(
      `
        SELECT
          id,
          state,
          district,
          cities,
          category,
          project_name AS "projectName",
          authority,
          project_type AS "projectType",
          status_text AS "statusText",
          impact_level AS "impactLevel",
          source_ref AS "sourceRef",
          source_url AS "sourceUrl",
          verification_level AS "verificationLevel",
          last_updated AS "lastUpdated",
          created_at AS "createdAt"
        FROM infra_updates
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      itemValues
    );

    return res.json({
      items: result.rows,
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/infra-updates', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const normalized = normalizeWriteBody(req.body);
    normalized.cities = cleanCities(normalized.cities);
    const payload = createBodySchema.parse(normalized);
    if (payload.verificationLevel === 'UNKNOWN') {
      return res.status(400).json({
        error: 'verificationLevel cannot be UNKNOWN for public publish.',
      });
    }

    const result = await pool.query(
      `
        INSERT INTO infra_updates (
          state,
          district,
          cities,
          category,
          project_name,
          authority,
          project_type,
          status_text,
          impact_level,
          source_ref,
          source_url,
          verification_level,
          last_updated
        )
        VALUES (
          $1,
          $2,
          $3::text[],
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          COALESCE($13::date, CURRENT_DATE)
        )
        RETURNING
          id,
          state,
          district,
          cities,
          category,
          project_name AS "projectName",
          authority,
          project_type AS "projectType",
          status_text AS "statusText",
          impact_level AS "impactLevel",
          source_ref AS "sourceRef",
          source_url AS "sourceUrl",
          verification_level AS "verificationLevel",
          last_updated AS "lastUpdated",
          created_at AS "createdAt"
      `,
      [
        payload.state,
        payload.district,
        payload.cities,
        payload.category,
        payload.projectName,
        payload.authority,
        payload.projectType,
        payload.statusText,
        payload.impactLevel,
        payload.sourceRef,
        payload.sourceUrl,
        payload.verificationLevel,
        payload.lastUpdated || null,
      ]
    );

    return res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.put('/infra-updates/:id', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const normalized = normalizeWriteBody(req.body);
    if (normalized.cities !== undefined) {
      normalized.cities = cleanCities(normalized.cities);
    }
    const payload = updateBodySchema.parse(normalized);
    if (payload.verificationLevel === 'UNKNOWN') {
      return res.status(400).json({
        error: 'verificationLevel cannot be UNKNOWN for public publish.',
      });
    }

    const result = await pool.query(
      `
        UPDATE infra_updates
        SET
          state = COALESCE($1, state),
          district = COALESCE($2, district),
          cities = COALESCE($3::text[], cities),
          category = COALESCE($4, category),
          project_name = COALESCE($5, project_name),
          authority = COALESCE($6, authority),
          project_type = COALESCE($7, project_type),
          status_text = COALESCE($8, status_text),
          impact_level = COALESCE($9, impact_level),
          source_ref = COALESCE($10, source_ref),
          source_url = COALESCE($11, source_url),
          verification_level = COALESCE($12, verification_level),
          last_updated = COALESCE($13::date, last_updated)
        WHERE id = $14
        RETURNING
          id,
          state,
          district,
          cities,
          category,
          project_name AS "projectName",
          authority,
          project_type AS "projectType",
          status_text AS "statusText",
          impact_level AS "impactLevel",
          source_ref AS "sourceRef",
          source_url AS "sourceUrl",
          verification_level AS "verificationLevel",
          last_updated AS "lastUpdated",
          created_at AS "createdAt"
      `,
      [
        payload.state ?? null,
        payload.district ?? null,
        payload.cities,
        payload.category ?? null,
        payload.projectName ?? null,
        payload.authority ?? null,
        payload.projectType ?? null,
        payload.statusText ?? null,
        payload.impactLevel ?? null,
        payload.sourceRef ?? null,
        payload.sourceUrl ?? null,
        payload.verificationLevel ?? null,
        payload.lastUpdated ?? null,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ item: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.delete('/infra-updates/:id', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const result = await pool.query(
      `
        DELETE FROM infra_updates
        WHERE id = $1
        RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
