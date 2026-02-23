import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const CATEGORY_VALUES = new Set(['PROPOSED', 'APPROVED', 'UNDER_CONSTRUCTION', 'COMPLETED']);
const IMPACT_VALUES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const VERIFICATION_VALUES = new Set([
  'PUBLIC_NOTICE',
  'TENDER',
  'SOURCE_ONLY',
  'OFFICE_CONFIRMED',
  'LOCAL_REPORT',
  'UNKNOWN',
]);
const STATUS_VALUES = new Set(['NEW', 'IGNORED', 'PUBLISHED']);
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function ensureAdminToken(req, res) {
  const configuredToken = String(process.env.ADMIN_TOKEN || '').trim();
  const incomingToken = req.header('x-admin-token');

  if (!configuredToken || incomingToken !== configuredToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCities(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((city) => String(city).trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function classifyCategoryFromText(title, summary) {
  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  if (
    /\b(completed|inaugurat|opened|dedicated|operation\s*&?\s*maintenance|o\s*&\s*m)\b/.test(
      text
    )
  ) {
    return 'COMPLETED';
  }
  if (/\b(pre[-\s]?construction)\b/.test(text)) {
    return 'PROPOSED';
  }
  if (/\b(construction|groundbreaking|work started|under construction)\b/.test(text)) {
    return 'UNDER_CONSTRUCTION';
  }
  if (/\b(approved|sanctioned|cleared)\b/.test(text)) {
    return 'APPROVED';
  }
  if (/\b(proposed|proposal|plan|planning)\b/.test(text)) {
    return 'PROPOSED';
  }
  return 'APPROVED';
}

function classifyProjectTypeFromText(title, summary) {
  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  if (/\b(highway|expressway|nh-|road|bridge|flyover|overbridge|bypass|ring road)\b/.test(text)) {
    return 'Road and Highway';
  }
  if (/\b(railway|station|train|metro|dfc)\b/.test(text)) {
    return 'Rail and Metro';
  }
  if (/\b(airport|runway|aviation)\b/.test(text)) {
    return 'Airport';
  }
  if (/\b(port|harbour|shipping|waterway)\b/.test(text)) {
    return 'Ports';
  }
  if (/\b(power|substation|electric|solar|wind|grid)\b/.test(text)) {
    return 'Power';
  }
  if (/\b(water supply|drinking water|pipeline|sewer|drainage|amrut|jal)\b/.test(text)) {
    return 'Water and Urban';
  }
  if (/\b(hospital|medical|health)\b/.test(text)) {
    return 'Healthcare';
  }
  if (/\b(school|college|university|education)\b/.test(text)) {
    return 'Education';
  }
  return 'Other';
}

function classifyAuthorityFromText(title, summary) {
  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  if (/\bnhai\b/.test(text)) return 'NHAI';
  if (/\b(morth|ministry of road transport)\b/.test(text)) return 'MoRTH';
  if (/\b(ministry of railways|railway)\b/.test(text)) return 'Ministry of Railways';
  if (/\b(ministry of civil aviation)\b/.test(text)) return 'Ministry of Civil Aviation';
  if (/\b(state pwd|public works department|pwd)\b/.test(text)) return 'State PWD';
  return 'Government Dept / Agency';
}

function deriveSourceRef(sourceKey, explicitSourceRef) {
  const provided = String(explicitSourceRef || '').trim();
  if (provided) return provided;

  const normalized = String(sourceKey || '').toUpperCase();
  if (normalized.startsWith('PIB')) return 'PIB';
  if (normalized.startsWith('ETENDERS')) return 'eTenders';
  if (normalized.startsWith('EPROCURE')) return 'eProcure';
  if (normalized.startsWith('PPPINDIA') || normalized.startsWith('PPP')) return 'PPP India';
  return sourceKey;
}

function deriveVerificationLevel({
  sourceKey,
  explicitVerification,
  title,
  summary,
  sourceUrl,
  sourceRef,
}) {
  const explicit = String(explicitVerification || '').trim().toUpperCase();
  if (explicit && VERIFICATION_VALUES.has(explicit)) {
    return explicit;
  }

  const normalizedSource = String(sourceKey || '').toUpperCase();
  if (normalizedSource.startsWith('PIB')) {
    return 'PUBLIC_NOTICE';
  }
  if (normalizedSource.startsWith('ETENDERS') || normalizedSource.startsWith('EPROCURE')) {
    return 'TENDER';
  }
  if (normalizedSource.startsWith('PPPINDIA') || normalizedSource.startsWith('PPP')) {
    return 'OFFICE_CONFIRMED';
  }

  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  if (/\b(tender|bid|contract|eprocurement|e-procurement)\b/.test(text)) {
    return 'TENDER';
  }
  if (/\b(official confirmed|office confirmed|authority confirmed)\b/.test(text)) {
    return 'OFFICE_CONFIRMED';
  }
  if (/\b(local report|field report|site visit)\b/.test(text)) {
    return 'LOCAL_REPORT';
  }
  if (/\b(approved|sanctioned|cleared|notified)\b/.test(text)) {
    return 'PUBLIC_NOTICE';
  }
  if (isNonEmptyString(sourceUrl) && isNonEmptyString(sourceRef)) {
    return 'SOURCE_ONLY';
  }
  return 'UNKNOWN';
}

function buildKeywordTokens(title) {
  const raw = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return [];

  const words = raw.split(' ').filter((word) => word.length >= 5);
  const stopWords = new Set([
    'project',
    'scheme',
    'development',
    'infrastructure',
    'minister',
    'government',
  ]);
  const filtered = words.filter((word) => !stopWords.has(word));

  const unique = [];
  for (const word of filtered) {
    if (!unique.includes(word)) unique.push(word);
    if (unique.length >= 6) break;
  }
  return unique;
}

async function buildPossibleDuplicates(client, payload) {
  const {
    state,
    district,
    cities,
    projectName,
  } = payload;

  const tokens = buildKeywordTokens(projectName);
  if (tokens.length === 0) return [];

  const where = [];
  const values = [];

  values.push(state);
  where.push(`LOWER(state) = LOWER($${values.length})`);

  values.push(district);
  where.push(`LOWER(district) = LOWER($${values.length})`);

  values.push(cities);
  where.push(`cities && $${values.length}::text[]`);

  where.push(`last_updated >= (CURRENT_DATE - INTERVAL '30 days')`);

  const tokenClauses = [];
  for (const token of tokens.slice(0, 4)) {
    values.push(`%${token}%`);
    tokenClauses.push(`project_name ILIKE $${values.length}`);
  }

  if (tokenClauses.length >= 2) {
    where.push(`(${tokenClauses.slice(0, 2).join(' AND ')})`);
  } else if (tokenClauses.length === 1) {
    where.push(`(${tokenClauses[0]})`);
  }

  const result = await client.query(
    `
      SELECT
        id,
        project_name AS "projectName",
        state,
        district,
        cities,
        last_updated AS "lastUpdated",
        source_url AS "sourceUrl"
      FROM infra_updates
      WHERE ${where.join(' AND ')}
      ORDER BY last_updated DESC, id DESC
      LIMIT 5
    `,
    values
  );

  return result.rows;
}

router.get('/infra-ingest', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const status = String(req.query.status || 'NEW').trim().toUpperCase();
    const q = String(req.query.q || '').trim();

    const where = [];
    const values = [];

    if (STATUS_VALUES.has(status)) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }

    if (q) {
      values.push(`%${q}%`);
      where.push(`(
        title ILIKE $${values.length}
        OR COALESCE(summary, '') ILIKE $${values.length}
        OR link ILIKE $${values.length}
      )`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `
        SELECT
          id,
          source_key AS "sourceKey",
          item_guid AS "itemGuid",
          title,
          link,
          published_at AS "publishedAt",
          summary,
          status,
          published_update_id AS "publishedUpdateId",
          ignored_reason AS "ignoredReason",
          created_at AS "createdAt"
        FROM infra_ingest_items
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT 200
      `,
      values
    );

    return res.json({ items: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/infra-ingest/:id/ignore', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  try {
    const id = toPositiveInteger(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const reasonRaw = String(req.body?.reason || '').trim();
    const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;

    const result = await pool.query(
      `
        UPDATE infra_ingest_items
        SET
          status = 'IGNORED',
          ignored_reason = $1
        WHERE id = $2
        RETURNING id
      `,
      [reason, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post('/infra-ingest/:id/publish', async (req, res, next) => {
  if (!ensureAdminToken(req, res)) return;

  const id = toPositiveInteger(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const raw = req.body && typeof req.body === 'object' ? req.body : {};

  const cleanState = String(raw.state || '').trim();
  const cleanDistrict = String(raw.district || '').trim();
  const normalizedCities = normalizeCities(raw.cities);
  const category = String(raw.category || '').trim().toUpperCase();
  const impactLevel = String(raw.impact_level ?? raw.impactLevel ?? '').trim().toUpperCase();
  const authority = String(raw.authority || '').trim();
  const projectType = String(raw.project_type ?? raw.projectType ?? '').trim();
  const statusText = String(raw.status_text ?? raw.statusText ?? '').trim();
  const sourceRefRaw = String(raw.source_ref ?? raw.sourceRef ?? '').trim();
  const verificationRaw = String(raw.verification_level ?? raw.verificationLevel ?? '')
    .trim()
    .toUpperCase();
  const forcePublish = raw.force === true;
  const lastUpdatedRaw = raw.last_updated ?? raw.lastUpdated ?? null;
  const lastUpdatedText = lastUpdatedRaw == null ? null : String(lastUpdatedRaw).trim();

  if (!cleanState || !cleanDistrict) {
    return res.status(400).json({ error: 'State and district are required' });
  }
  if (normalizedCities.length === 0) {
    return res.status(400).json({ error: 'At least one city is required' });
  }
  if (category && !CATEGORY_VALUES.has(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  if (!IMPACT_VALUES.has(impactLevel)) {
    return res.status(400).json({ error: 'Invalid impact_level' });
  }
  if (verificationRaw && !VERIFICATION_VALUES.has(verificationRaw)) {
    return res.status(400).json({ error: 'Invalid verification_level' });
  }
  if (lastUpdatedText && !DATE_ONLY_REGEX.test(lastUpdatedText)) {
    return res.status(400).json({ error: 'Invalid last_updated format (use YYYY-MM-DD)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inboxResult = await client.query(
      `
        SELECT
          id,
          source_key,
          title,
          link,
          published_at,
          summary,
          status
        FROM infra_ingest_items
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (inboxResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inbox item not found' });
    }

    const inbox = inboxResult.rows[0];
    if (String(inbox.status || '').toUpperCase() === 'PUBLISHED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already published' });
    }

    const projectName = String(inbox.title || '').trim();
    const summary = String(inbox.summary || '').trim();
    const resolvedCategory = category || classifyCategoryFromText(projectName, summary);
    if (!CATEGORY_VALUES.has(resolvedCategory)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid category' });
    }

    const resolvedAuthority = authority || classifyAuthorityFromText(projectName, summary);
    const resolvedProjectType = projectType || classifyProjectTypeFromText(projectName, summary);
    const resolvedStatusText =
      statusText || summary || 'Official update captured. Verify scope and area before public publish.';
    if (!resolvedAuthority || !resolvedProjectType || !resolvedStatusText) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'authority, project_type, and status_text are required' });
    }

    const sourceRef = deriveSourceRef(inbox.source_key, sourceRefRaw);
    const sourceUrl = String(inbox.link || '').trim() || null;
    if (!sourceRef) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'source_ref is required for publish' });
    }
    if (!sourceUrl) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'source_url is required for publish' });
    }

    const verificationLevel = deriveVerificationLevel({
      sourceKey: inbox.source_key,
      explicitVerification: verificationRaw,
      title: projectName,
      summary,
      sourceUrl,
      sourceRef,
    });
    if (!verificationLevel || verificationLevel === 'UNKNOWN') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error:
          'verification_level must resolve to PUBLIC_NOTICE, TENDER, SOURCE_ONLY, OFFICE_CONFIRMED, or LOCAL_REPORT',
      });
    }

    const dedupePayload = {
      state: cleanState,
      district: cleanDistrict,
      cities: normalizedCities,
      projectName,
    };
    const possibleDupes = await buildPossibleDuplicates(client, dedupePayload);

    if (possibleDupes.length > 0 && !forcePublish) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Possible duplicate detected',
        dupes: possibleDupes,
      });
    }
    const fallbackLastUpdated = toDateOnly(inbox.published_at);
    const resolvedLastUpdated = lastUpdatedText || fallbackLastUpdated || null;

    const insertResult = await client.query(
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
        RETURNING id
      `,
      [
        cleanState,
        cleanDistrict,
        normalizedCities,
        resolvedCategory,
        projectName,
        resolvedAuthority,
        resolvedProjectType,
        resolvedStatusText,
        impactLevel,
        sourceRef,
        sourceUrl,
        verificationLevel,
        resolvedLastUpdated,
      ]
    );

    const updateId = Number(insertResult.rows[0]?.id || 0);

    await client.query(
      `
        UPDATE infra_ingest_items
        SET
          status = 'PUBLISHED',
          published_update_id = $1
        WHERE id = $2
      `,
      [updateId, id]
    );

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, published_update_id: updateId });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

export default router;
