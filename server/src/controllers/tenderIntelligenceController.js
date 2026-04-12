import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';

const router = Router();

const TRACK_VALUES = ['government', 'private'];
const SOURCE_TYPE_VALUES = [
  'government_tender',
  'government_notice',
  'award',
  'private_opportunity',
  'village_signal',
];
const VERIFICATION_VALUES = [
  'OFFICIAL_PORTAL',
  'OFFICIAL_DEPARTMENT_SITE',
  'PUBLIC_NOTICE_PRESS_RELEASE',
  'MARKET_SOURCE',
  'UNKNOWN',
];
const SORT_VALUES = ['smart', 'newest', 'impact', 'verified', 'budget'];
const LOCATION_SCOPE_VALUES = ['all', 'state'];

const TRACK_SET = new Set(TRACK_VALUES);
const SOURCE_TYPE_SET = new Set(SOURCE_TYPE_VALUES);
const VERIFICATION_SET = new Set(VERIFICATION_VALUES);

const querySchema = z.object({
  scope: z.enum(LOCATION_SCOPE_VALUES).optional(),
  track: z.enum(TRACK_VALUES).optional(),
  state: z.string().trim().min(1).max(120).optional(),
  district: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  categories: z.string().trim().min(1).max(400).optional(),
  source_type: z.enum(SOURCE_TYPE_VALUES).optional(),
  source_types: z.string().trim().min(1).max(400).optional(),
  verification_level: z.enum(VERIFICATION_VALUES).optional(),
  verification_levels: z.string().trim().min(1).max(400).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(SORT_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

function parseEnumCsv(value, allowedValues) {
  const text = String(value || '').trim();
  if (!text) return [];
  const values = text
    .split(',')
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const unique = Array.from(new Set(values));
  return unique.filter((entry) => allowedValues.has(entry));
}

function buildBaseWhereClauses() {
  return [`moderation_status IN ('AUTO_APPROVED', 'MANUALLY_APPROVED')`];
}

function buildOrderBy(sort) {
  const effectiveDate = `COALESCE(published_at, updated_at, discovered_at)`;
  const verificationRank = `
    CASE verification_level
      WHEN 'OFFICIAL_PORTAL' THEN 5
      WHEN 'PUBLIC_NOTICE_PRESS_RELEASE' THEN 4
      WHEN 'OFFICIAL_DEPARTMENT_SITE' THEN 3
      WHEN 'MARKET_SOURCE' THEN 2
      WHEN 'UNKNOWN' THEN 1
      ELSE 0
    END
  `;

  if (sort === 'newest') {
    return `${effectiveDate} DESC, id DESC`;
  }
  if (sort === 'impact') {
    return `impact_score DESC, ${effectiveDate} DESC, id DESC`;
  }
  if (sort === 'verified') {
    return `${verificationRank} DESC, ${effectiveDate} DESC, impact_score DESC, id DESC`;
  }
  if (sort === 'budget') {
    return `budget_amount DESC NULLS LAST, impact_score DESC, ${effectiveDate} DESC, id DESC`;
  }

  return `${verificationRank} DESC, impact_score DESC, ${effectiveDate} DESC, id DESC`;
}

function buildSelectSql(limitPlaceholder, offsetPlaceholder = null) {
  const limitClause = limitPlaceholder ? `LIMIT $${limitPlaceholder}` : '';
  const offsetClause = offsetPlaceholder ? `OFFSET $${offsetPlaceholder}` : '';

  return `
    SELECT
      id,
      track,
      source_type AS "sourceType",
      source_name AS "sourceName",
      source_url AS "sourceUrl",
      external_id AS "externalId",
      CASE
        WHEN external_id LIKE 'infra_update:%'
        THEN NULLIF(SPLIT_PART(external_id, ':', 2), '')::bigint
        ELSE NULL
      END AS "legacyUpdateId",
      title AS "projectName",
      summary AS "statusText",
      COALESCE(authority_name, department_name, source_name) AS authority,
      COALESCE(work_type, sector, source_type) AS "projectType",
      COALESCE(tender_status, 'UNKNOWN') AS category,
      CASE
        WHEN impact_score >= 80 THEN 'HIGH'
        WHEN impact_score >= 50 THEN 'MEDIUM'
        ELSE 'LOW'
      END AS "impactLevel",
      source_name AS "sourceRef",
      verification_level AS "verificationLevel",
      COALESCE(published_at, updated_at, discovered_at) AS "lastUpdated",
      COALESCE(state_name, '') AS state,
      COALESCE(district_name, '') AS district,
      COALESCE(block_name, '') AS "blockName",
      COALESCE(village_name, '') AS "villageName",
      COALESCE(lgd_state_code, '') AS "lgdStateCode",
      COALESCE(lgd_district_code, '') AS "lgdDistrictCode",
      COALESCE(lgd_block_code, '') AS "lgdBlockCode",
      COALESCE(lgd_village_code, '') AS "lgdVillageCode",
      COALESCE(
        (
          SELECT ARRAY_AGG(city_name)
          FROM jsonb_array_elements_text(COALESCE(raw_payload #> '{record,cities}', '[]'::jsonb)) AS city_name
        ),
        ARRAY[]::text[]
      ) AS cities,
      budget_amount AS "budgetAmount",
      emd_amount AS "emdAmount",
      tender_status AS "tenderStatus",
      published_at AS "publishedAt",
      bid_end_at AS "bidEndAt",
      opening_at AS "openingAt",
      document_urls AS "documentUrls",
      impact_score AS "impactScore"
    FROM tender_intelligence_records
    %WHERE_SQL%
    ORDER BY %ORDER_BY%
    ${limitClause}
    ${offsetClause}
  `;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRecordRow(row) {
  return {
    ...row,
    id: toNumber(row.id),
    legacyUpdateId: toNullableNumber(row.legacyUpdateId),
    budgetAmount: toNullableNumber(row.budgetAmount),
    emdAmount: toNullableNumber(row.emdAmount),
    impactScore: toNumber(row.impactScore),
    cities: Array.isArray(row.cities) ? row.cities : [],
    documentUrls: Array.isArray(row.documentUrls) ? row.documentUrls : [],
  };
}

router.get('/tender-intelligence', async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query || {});
    const where = buildBaseWhereClauses();
    const values = [];

    const sourceTypes = parseEnumCsv(query.source_types, SOURCE_TYPE_SET);
    if (query.source_type && !sourceTypes.includes(query.source_type)) {
      sourceTypes.push(query.source_type);
    }

    const verificationLevels = parseEnumCsv(query.verification_levels, VERIFICATION_SET);
    if (query.verification_level && !verificationLevels.includes(query.verification_level)) {
      verificationLevels.push(query.verification_level);
    }

    const categories = parseEnumCsv(query.categories, new Set(['PROPOSED', 'APPROVED', 'UNDER_CONSTRUCTION', 'COMPLETED']));
    if (query.category && !categories.includes(query.category)) {
      categories.push(query.category);
    }

    if (query.track) {
      values.push(query.track);
      where.push(`track = $${values.length}`);
    }

    const normalizedScope = String(query.scope || '').trim().toLowerCase();
    if (normalizedScope === 'state' && query.state) {
      values.push(query.state);
      where.push(`LOWER(state_name) = LOWER($${values.length})`);
    } else {
      if (query.state) {
        values.push(query.state);
        where.push(`LOWER(state_name) = LOWER($${values.length})`);
      }
      if (query.district) {
        values.push(query.district);
        where.push(`LOWER(district_name) = LOWER($${values.length})`);
      }
    }

    if (sourceTypes.length === 1) {
      values.push(sourceTypes[0]);
      where.push(`source_type = $${values.length}`);
    } else if (sourceTypes.length > 1) {
      values.push(sourceTypes);
      where.push(`source_type = ANY($${values.length}::text[])`);
    }

    if (categories.length === 1) {
      values.push(categories[0]);
      where.push(`COALESCE(tender_status, '') = $${values.length}`);
    } else if (categories.length > 1) {
      values.push(categories);
      where.push(`COALESCE(tender_status, '') = ANY($${values.length}::text[])`);
    }

    if (verificationLevels.length === 1) {
      values.push(verificationLevels[0]);
      where.push(`verification_level = $${values.length}`);
    } else if (verificationLevels.length > 1) {
      values.push(verificationLevels);
      where.push(`verification_level = ANY($${values.length}::text[])`);
    }

    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(
        title ILIKE $${values.length}
        OR summary ILIKE $${values.length}
        OR COALESCE(authority_name, '') ILIKE $${values.length}
        OR COALESCE(department_name, '') ILIKE $${values.length}
        OR COALESCE(sector, '') ILIKE $${values.length}
        OR COALESCE(work_type, '') ILIKE $${values.length}
        OR COALESCE(state_name, '') ILIKE $${values.length}
        OR COALESCE(district_name, '') ILIKE $${values.length}
        OR COALESCE(block_name, '') ILIKE $${values.length}
        OR COALESCE(village_name, '') ILIKE $${values.length}
        OR COALESCE(source_name, '') ILIKE $${values.length}
        OR COALESCE(normalized_text, '') ILIKE $${values.length}
      )`);
    }

    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const orderBy = buildOrderBy(query.sort || 'smart');

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM tender_intelligence_records
        ${whereSql}
      `,
      values
    );

    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const itemValues = [...values, pageSize, offset];
    const limitIdx = itemValues.length - 1;
    const offsetIdx = itemValues.length;
    const sql = buildSelectSql(limitIdx, offsetIdx)
      .replace('%WHERE_SQL%', whereSql)
      .replace('%ORDER_BY%', orderBy);

    const result = await pool.query(sql, itemValues);

    return res.json({
      items: result.rows.map(normalizeRecordRow),
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/tender-intelligence/recent', async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query || {});
    const where = buildBaseWhereClauses();
    const values = [];
    const limit = Math.min(20, Math.max(1, Number(query.limit || 5)));

    where.push(`track = 'government'`);
    where.push(`verification_level IN ('OFFICIAL_PORTAL', 'PUBLIC_NOTICE_PRESS_RELEASE')`);

    if (query.state) {
      values.push(query.state);
      where.push(`LOWER(state_name) = LOWER($${values.length})`);
    }
    if (query.district) {
      values.push(query.district);
      where.push(`LOWER(district_name) = LOWER($${values.length})`);
    }

    const city = String(req.query.city || '').trim();
    if (city) {
      values.push(city);
      where.push(`
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(raw_payload #> '{record,cities}', '[]'::jsonb)) AS city_name
          WHERE LOWER(city_name) = LOWER($${values.length})
        )
      `);
    }

    values.push(limit);
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const sql = buildSelectSql(values.length).replace('%WHERE_SQL%', whereSql).replace(
      '%ORDER_BY%',
      `COALESCE(published_at, updated_at, discovered_at) DESC, id DESC`
    );

    const result = await pool.query(sql, values);
    return res.json({ items: result.rows.map(normalizeRecordRow) });
  } catch (error) {
    return next(error);
  }
});

export default router;
