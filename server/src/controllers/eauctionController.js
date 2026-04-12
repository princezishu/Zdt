import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth, requireMainAdmin } from '../middleware/auth.js';

const router = Router();

const categorySchema = z.enum(['plots', 'apartments', 'complex', 'all']);
const sourceTypeSchema = z.enum(['bank', 'government', 'common_portal']);
const propertyTypeSchema = z.enum([
  'plot_land',
  'apartment_flat',
  'commercial',
  'industrial',
  'agricultural',
  'mixed',
  'other',
]);
const domainStatusSchema = z.enum(['verified', 'review_required', 'blocked']);
const listingSortSchema = z.enum(['auction_soonest', 'newest', 'reserve_high', 'source']);
const resolveTargetSchema = z.enum(['page', 'pdf']);
const IBAPI_SOURCE_KEY = 'IBAPI';
const IBAPI_SEARCH_PAGE_URL = 'https://ibapi.in/Sale_Info_Home.aspx';
const IBAPI_CAROUSEL_URL = 'https://ibapi.in/Sale_Info_Home.aspx/getCarouselData';

const OFFICIAL_DOMAIN_ALLOWLIST = [
  'ibapi.in',
  'baanknet.com',
  'eauction.gov.in',
  'pnb.bank.in',
  'pnbindia.in',
  'pnbnet.in',
  'mstcecommerce.com',
  'gepnicreports.gov.in',
];

const OFFICIAL_DOMAIN_SUFFIX_ALLOWLIST = ['gov.in', 'nic.in', 'bank.in', 'ibapi.in', 'baanknet.com', 'pnbindia.in'];

const createSourceSchema = z.object({
  sourceKey: z.string().trim().max(80).optional().default(''),
  name: z.string().trim().min(2).max(180),
  authorityName: z.string().trim().max(180).optional().default(''),
  sourceType: sourceTypeSchema.optional().default('common_portal'),
  portalUrl: z.string().trim().url().max(2048),
  officialListingUrl: z.string().trim().max(2048).optional().default(''),
  officialDetailUrl: z.string().trim().max(2048).optional().default(''),
  noticePdfUrl: z.string().trim().max(2048).optional().default(''),
  category: categorySchema.optional().default('all'),
  description: z.string().trim().max(1200).optional().default(''),
  badges: z.array(z.string().trim().min(1).max(60)).max(12).optional().default([]),
  allowedDomains: z.array(z.string().trim().min(1).max(120)).max(12).optional().default([]),
  loginRequired: z.boolean().optional().default(false),
  bidderRegistrationRequired: z.boolean().optional().default(false),
  emdMentioned: z.boolean().optional().default(false),
  domainStatus: domainStatusSchema.optional().default('verified'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(100),
});

function firstQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBooleanQuery(value, fallback = true) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function normalizeCategoryAlias(value) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase().replace(/[\s/_-]+/g, '');
  if (['plot', 'plots', 'land', 'lands'].includes(normalized)) return 'plots';
  if (['apartment', 'apartments', 'flat', 'flats'].includes(normalized)) return 'apartments';
  if (['complex', 'complexes', 'commercial'].includes(normalized)) return 'complex';
  if (normalized === 'all') return 'all';
  return value;
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function hostnameMatchesAllowed(hostname, allowedDomain) {
  const host = normalizeHostname(hostname);
  const allowed = normalizeHostname(allowedDomain);
  return Boolean(host && allowed && (host === allowed || host.endsWith(`.${allowed}`)));
}

function isAllowedOfficialDomain(value) {
  const domain = normalizeHostname(value);
  if (!domain) return false;
  return (
    OFFICIAL_DOMAIN_ALLOWLIST.some((allowed) => hostnameMatchesAllowed(domain, allowed)) ||
    OFFICIAL_DOMAIN_SUFFIX_ALLOWLIST.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))
  );
}

function sanitizeAllowedDomains(value) {
  return Array.from(
    new Set((Array.isArray(value) ? value : []).map((item) => normalizeHostname(item)).filter(isAllowedOfficialDomain))
  ).slice(0, 12);
}

function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isWhitelistedOfficialUrl(value, extraDomains = []) {
  if (!isSafeHttpUrl(value)) return false;
  try {
    const parsed = new URL(value);
    const hostname = normalizeHostname(parsed.hostname);
    const domains = Array.from(new Set([...OFFICIAL_DOMAIN_ALLOWLIST, ...sanitizeAllowedDomains(extraDomains)]));
    return domains.some((domain) => hostnameMatchesAllowed(hostname, domain));
  } catch {
    return false;
  }
}

function inferDomainFromUrls(...urls) {
  for (const value of urls) {
    if (!isSafeHttpUrl(value)) continue;
    try {
      return normalizeHostname(new URL(value).hostname);
    } catch {
      // ignore invalid values
    }
  }
  return '';
}

function toSourceBadge(sourceType) {
  return sourceType === 'government' ? 'Official Government Source' : 'Official Bank Source';
}

function formatMoneyDisplay(amount, display) {
  if (display) return String(display);
  if (amount == null || !Number.isFinite(Number(amount))) return '';
  return `Rs ${Number(amount).toLocaleString('en-IN')}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'manual',
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveIbapiNoticePdfUrl(propertyId) {
  const normalizedPropertyId = String(propertyId || '').trim().toUpperCase();
  if (!normalizedPropertyId) return null;

  const response = await fetchWithTimeout(
    IBAPI_CAROUSEL_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
        referer: IBAPI_SEARCH_PAGE_URL,
      },
      body: JSON.stringify({ prop_id: normalizedPropertyId }),
    },
    30000
  );

  if (!response.ok) {
    throw new Error(`IBAPI document lookup failed (${response.status}).`);
  }

  const payload = await response.json();
  const parts = String(payload?.d || '')
    .split('^')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const pdfPath = parts.find((item) => /\.pdf$/i.test(item));
  if (!pdfPath) return null;

  const publicPath = pdfPath.replace(/^.*?upload_saleinfo\\/i, 'upload_saleinfo/').replace(/\\/g, '/');
  const resolvedUrl = new URL(publicPath.replace(/^\/+/, ''), 'https://ibapi.in/').toString();
  return isWhitelistedOfficialUrl(resolvedUrl, ['ibapi.in']) ? resolvedUrl : null;
}

function mapSourceRow(row) {
  const allowedDomains = Array.isArray(row.allowed_domains) ? row.allowed_domains.map((item) => String(item)) : [];
  return {
    id: Number(row.id),
    sourceKey: String(row.source_key || ''),
    name: String(row.name || ''),
    authorityName: String(row.authority_name || ''),
    sourceType: String(row.source_type || 'common_portal'),
    sourceBadge: toSourceBadge(String(row.source_type || 'common_portal')),
    portalUrl: String(row.portal_url || ''),
    officialListingUrl: String(row.official_listing_url || row.portal_url || ''),
    officialDetailUrl: String(row.official_detail_url || ''),
    noticePdfUrl: String(row.notice_pdf_url || ''),
    sourceDomain: String(row.source_domain || ''),
    allowedDomains,
    category: String(row.category || 'all'),
    description: String(row.description || ''),
    badges: Array.isArray(row.badges) ? row.badges.map((item) => String(item)) : [],
    loginRequired: Boolean(row.login_required),
    bidderRegistrationRequired: Boolean(row.bidder_registration_required),
    emdMentioned: Boolean(row.emd_mentioned),
    domainStatus: String(row.domain_status || 'verified'),
    lastCheckedAt: row.last_checked_at,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 100),
  };
}

function mapListingRow(row) {
  const sourceType = String(row.source_type || 'bank');
  return {
    id: Number(row.id),
    listingKey: String(row.listing_key || ''),
    externalId: String(row.external_id || ''),
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    propertyType: String(row.property_type || 'other'),
    sourceBadge: toSourceBadge(sourceType),
    bankAuthorityName: String(row.bank_authority_name || ''),
    sourceType,
    officialListingUrl: String(row.official_listing_url || ''),
    officialDetailUrl: String(row.official_detail_url || ''),
    noticePdfUrl: String(row.notice_pdf_url || ''),
    sourceDomain: String(row.source_domain || ''),
    loginRequired: Boolean(row.login_required),
    bidderRegistrationRequired: Boolean(row.bidder_registration_required),
    emdMentioned: Boolean(row.emd_mentioned),
    reservePriceAmount: row.reserve_price_amount == null ? null : Number(row.reserve_price_amount),
    reservePriceDisplay: formatMoneyDisplay(row.reserve_price_amount, row.reserve_price_display),
    emdAmount: row.emd_amount == null ? null : Number(row.emd_amount),
    emdDisplay: formatMoneyDisplay(row.emd_amount, row.emd_display),
    auctionDate: row.auction_date,
    inspectionDate: row.inspection_date,
    stateName: String(row.state_name || ''),
    districtName: String(row.district_name || ''),
    cityName: String(row.city_name || ''),
    propertyLocation: String(row.property_location || ''),
    domainStatus: String(row.domain_status || 'verified'),
    lastCheckedAt: row.last_checked_at,
    isActive: Boolean(row.is_active),
    pdfAvailable: Boolean(row.notice_pdf_url),
  };
}

function resolveTargetUrl(record, target) {
  const allowedDomains = Array.from(
    new Set([...(Array.isArray(record.allowed_domains) ? record.allowed_domains : []), record.source_domain].filter(Boolean))
  );
  const candidateKeys =
    target === 'pdf'
      ? ['notice_pdf_url', 'official_detail_url', 'official_listing_url']
      : ['official_detail_url', 'official_listing_url', 'notice_pdf_url'];

  for (const key of candidateKeys) {
    const value = String(record[key] || '').trim();
    if (isWhitelistedOfficialUrl(value, allowedDomains)) {
      return { url: value, via: key };
    }
  }
  return null;
}

async function fetchSourceById(id) {
  const result = await pool.query('SELECT * FROM eauction_sources WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function fetchListingById(id) {
  const result = await pool.query(
    `
      SELECT l.*, s.allowed_domains, s.source_key
      FROM eauction_listings l
      LEFT JOIN eauction_sources s ON s.id = l.source_id
      WHERE l.id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

router.get('/sources', async (req, res, next) => {
  try {
    const query = z
      .object({
        sourceType: sourceTypeSchema.optional(),
        search: z.string().trim().max(80).optional().default(''),
        activeOnly: z.coerce.boolean().optional().default(true),
      })
      .parse({
        sourceType: firstQueryValue(req.query.source_type),
        search: firstQueryValue(req.query.search),
        activeOnly: parseBooleanQuery(firstQueryValue(req.query.active_only), true),
      });

    const values = [];
    const whereParts = [];
    if (query.activeOnly) whereParts.push('is_active = TRUE');
    if (query.sourceType) {
      values.push(query.sourceType);
      whereParts.push(`source_type = $${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      const placeholder = `$${values.length}`;
      whereParts.push(`(name ILIKE ${placeholder} OR authority_name ILIKE ${placeholder} OR description ILIKE ${placeholder})`);
    }

    const result = await pool.query(
      `
        SELECT *
        FROM eauction_sources
        ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
        ORDER BY sort_order ASC, name ASC
      `,
      values
    );

    return res.json({ sources: result.rows.map(mapSourceRow) });
  } catch (error) {
    return next(error);
  }
});

router.get('/listings', async (req, res, next) => {
  try {
    const query = z
      .object({
        search: z.string().trim().max(120).optional().default(''),
        state: z.string().trim().max(80).optional().default(''),
        district: z.string().trim().max(80).optional().default(''),
        city: z.string().trim().max(80).optional().default(''),
        propertyType: propertyTypeSchema.optional(),
        sourceType: sourceTypeSchema.optional(),
        authority: z.string().trim().max(120).optional().default(''),
        auctionFrom: z.string().trim().max(40).optional().default(''),
        auctionTo: z.string().trim().max(40).optional().default(''),
        minPrice: z.coerce.number().min(0).optional(),
        maxPrice: z.coerce.number().min(0).optional(),
        activeOnly: z.coerce.boolean().optional().default(true),
        sort: listingSortSchema.optional().default('auction_soonest'),
        page: z.coerce.number().int().min(1).max(100000).optional().default(1),
        limit: z.coerce.number().int().min(1).max(100).optional().default(60),
      })
      .parse({
        search: firstQueryValue(req.query.search),
        state: firstQueryValue(req.query.state),
        district: firstQueryValue(req.query.district),
        city: firstQueryValue(req.query.city),
        propertyType: firstQueryValue(req.query.property_type),
        sourceType: firstQueryValue(req.query.source_type),
        authority: firstQueryValue(req.query.authority),
        auctionFrom: firstQueryValue(req.query.auction_from),
        auctionTo: firstQueryValue(req.query.auction_to),
        minPrice: firstQueryValue(req.query.min_price),
        maxPrice: firstQueryValue(req.query.max_price),
        activeOnly: parseBooleanQuery(firstQueryValue(req.query.active_only), true),
        sort: firstQueryValue(req.query.sort),
        page: firstQueryValue(req.query.page),
        limit: firstQueryValue(req.query.limit),
      });

    const values = [];
    const whereParts = [];
    if (query.activeOnly) whereParts.push('is_active = TRUE');
    if (query.search) {
      values.push(`%${query.search}%`);
      const placeholder = `$${values.length}`;
      whereParts.push(`(title ILIKE ${placeholder} OR summary ILIKE ${placeholder} OR bank_authority_name ILIKE ${placeholder} OR property_location ILIKE ${placeholder})`);
    }
    for (const [column, rawValue] of [
      ['state_name', query.state],
      ['district_name', query.district],
      ['city_name', query.city],
      ['bank_authority_name', query.authority],
    ]) {
      if (!rawValue) continue;
      values.push(`%${rawValue}%`);
      whereParts.push(`${column} ILIKE $${values.length}`);
    }
    if (query.propertyType) {
      values.push(query.propertyType);
      whereParts.push(`property_type = $${values.length}`);
    }
    if (query.sourceType) {
      values.push(query.sourceType);
      whereParts.push(`source_type = $${values.length}`);
    }
    if (query.auctionFrom) {
      values.push(query.auctionFrom);
      whereParts.push(`auction_date >= $${values.length}::timestamptz`);
    }
    if (query.auctionTo) {
      values.push(query.auctionTo);
      whereParts.push(`auction_date <= $${values.length}::timestamptz`);
    }
    if (query.minPrice != null) {
      values.push(query.minPrice);
      whereParts.push(`reserve_price_amount >= $${values.length}`);
    }
    if (query.maxPrice != null) {
      values.push(query.maxPrice);
      whereParts.push(`reserve_price_amount <= $${values.length}`);
    }

    const orderBy =
      query.sort === 'newest'
        ? 'created_at DESC, sort_order ASC, title ASC'
        : query.sort === 'reserve_high'
          ? 'reserve_price_amount DESC NULLS LAST, auction_date NULLS LAST, sort_order ASC'
          : query.sort === 'source'
            ? 'bank_authority_name ASC, auction_date NULLS LAST, sort_order ASC'
            : 'auction_date NULLS LAST, sort_order ASC, created_at DESC';

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM eauction_listings
        ${whereClause}
      `,
      values
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const offset = (query.page - 1) * query.limit;
    const selectValues = [...values, query.limit, offset];

    const result = await pool.query(
      `
        SELECT *
        FROM eauction_listings
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${selectValues.length - 1}
        OFFSET $${selectValues.length}
      `,
      selectValues
    );

    return res.json({
      listings: result.rows.map(mapListingRow),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/sources/:id/resolve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = resolveTargetSchema.parse(firstQueryValue(req.query.target) || 'page');
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid source id' });
    const row = await fetchSourceById(id);
    if (!row) return res.status(404).json({ error: 'Source not found' });
    const resolved = resolveTargetUrl(row, target);
    if (!resolved) return res.status(404).json({ error: 'Official source temporarily unavailable' });
    return res.json({ resolvedUrl: resolved.url, via: resolved.via });
  } catch (error) {
    return next(error);
  }
});

router.get('/listings/:id/resolve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = resolveTargetSchema.parse(firstQueryValue(req.query.target) || 'page');
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid listing id' });
    const row = await fetchListingById(id);
    if (!row) return res.status(404).json({ error: 'Listing not found' });
    let resolved = null;

    if (target === 'pdf' && String(row.source_key || '') === IBAPI_SOURCE_KEY) {
      const dynamicPdfUrl = await resolveIbapiNoticePdfUrl(row.external_id);
      if (dynamicPdfUrl) {
        await pool.query(
          `
            UPDATE eauction_listings
            SET
              notice_pdf_url = $2,
              last_checked_at = NOW()
            WHERE id = $1
          `,
          [id, dynamicPdfUrl]
        );
        resolved = { url: dynamicPdfUrl, via: 'dynamic_notice_pdf_url' };
      }
    }

    if (!resolved) {
      resolved = resolveTargetUrl(row, target);
    }
    if (!resolved) return res.status(404).json({ error: 'Official source temporarily unavailable' });
    return res.json({ resolvedUrl: resolved.url, via: resolved.via });
  } catch (error) {
    return next(error);
  }
});

router.post('/sources', requireAuth, requireMainAdmin, async (req, res, next) => {
  try {
    const payload = createSourceSchema.parse(req.body || {});
    const portalUrl = payload.portalUrl.trim();
    const officialListingUrl = payload.officialListingUrl.trim() || portalUrl;
    const officialDetailUrl = payload.officialDetailUrl.trim();
    const noticePdfUrl = payload.noticePdfUrl.trim();
    const sourceDomain = inferDomainFromUrls(officialListingUrl, officialDetailUrl, noticePdfUrl);
    const allowedDomains = sanitizeAllowedDomains([...payload.allowedDomains, sourceDomain]);

    for (const value of [portalUrl, officialListingUrl, officialDetailUrl, noticePdfUrl].filter(Boolean)) {
      if (!isWhitelistedOfficialUrl(value, allowedDomains)) {
        return res.status(400).json({ error: 'Only verified official domains are allowed.' });
      }
    }

    const sourceKey = payload.sourceKey.trim() || null;
    const result = await pool.query(
      `
        INSERT INTO eauction_sources (
          source_key,
          name,
          authority_name,
          source_type,
          portal_url,
          official_listing_url,
          official_detail_url,
          notice_pdf_url,
          source_domain,
          allowed_domains,
          category,
          description,
          badges,
          login_required,
          bidder_registration_required,
          emd_mentioned,
          domain_status,
          last_checked_at,
          is_active,
          sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12, $13::text[], $14, $15, $16, $17, NOW(), $18, $19)
        RETURNING *
      `,
      [
        sourceKey,
        payload.name,
        payload.authorityName || payload.name,
        payload.sourceType,
        portalUrl,
        officialListingUrl,
        officialDetailUrl,
        noticePdfUrl,
        sourceDomain,
        allowedDomains,
        payload.category,
        payload.description || '',
        payload.badges,
        Boolean(payload.loginRequired),
        Boolean(payload.bidderRegistrationRequired),
        Boolean(payload.emdMentioned),
        payload.domainStatus,
        Boolean(payload.isActive),
        payload.sortOrder,
      ]
    );

    return res.status(201).json({ source: mapSourceRow(result.rows[0]) });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'This official source already exists.' });
    }
    return next(error);
  }
});

router.delete('/sources/:id', requireAuth, requireMainAdmin, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid source id' });
  try {
    const result = await pool.query('DELETE FROM eauction_sources WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Source not found' });
    return res.json({ deletedId: Number(result.rows[0].id) });
  } catch (error) {
    return next(error);
  }
});

router.get('/cards', async (req, res, next) => {
  try {
    const query = z
      .object({
        category: categorySchema.optional().default('all'),
        search: z.string().trim().max(80).optional().default(''),
      })
      .parse({
        category: normalizeCategoryAlias(firstQueryValue(req.query.category)),
        search: firstQueryValue(req.query.search),
      });

    const values = [];
    const whereParts = ['is_active = TRUE'];
    if (query.category !== 'all') {
      values.push(query.category);
      whereParts.push(`(category = $${values.length} OR category = 'all')`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      const placeholder = `$${values.length}`;
      whereParts.push(`(name ILIKE ${placeholder} OR description ILIKE ${placeholder} OR authority_name ILIKE ${placeholder})`);
    }

    const result = await pool.query(
      `
        SELECT *
        FROM eauction_sources
        WHERE ${whereParts.join(' AND ')}
        ORDER BY sort_order ASC, name ASC
      `,
      values
    );

    const cards = result.rows.map((row) => {
      const source = mapSourceRow(row);
      return {
        id: source.id,
        name: source.name,
        portalUrl: source.officialListingUrl,
        category: source.category,
        description: source.description,
        badges: source.badges,
        isActive: source.isActive,
        sortOrder: source.sortOrder,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return res.json({ cards });
  } catch (error) {
    return next(error);
  }
});

export default router;
